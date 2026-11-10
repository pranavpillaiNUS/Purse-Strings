import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createTakeManager, flowArguments, InputError, parseContinueInput, parseRunInput, stepForPrompt,
  type FlowChild, type SpawnFlow,
} from './app-takes.ts';

interface FakeChild extends FlowChild { writes: string[]; killed: boolean; emit(text: string): void; exit(code: number | null): void }

function fakeSpawner(): { spawn: SpawnFlow; children: FakeChild[]; calls: Array<{ args: readonly string[]; cwd: string }> } {
  const children: FakeChild[] = [];
  const calls: Array<{ args: readonly string[]; cwd: string }> = [];
  const spawn: SpawnFlow = (args, cwd) => {
    calls.push({ args, cwd });
    const output: Array<(text: string) => void> = [];
    const exits: Array<(code: number | null) => void> = [];
    const child: FakeChild = {
      writes: [], killed: false,
      stdin: { write: (text) => { child.writes.push(text); return true; }, end: () => {} },
      onOutput: (listener) => { output.push(listener); },
      onExit: (listener) => { exits.push(listener); },
      kill: () => { child.killed = true; },
      emit: (text) => { for (const listener of output) listener(text); },
      exit: (code) => { for (const listener of exits) listener(code); },
    };
    children.push(child);
    return child;
  };
  return { spawn, children, calls };
}

function setup(t: { after: (fn: () => void) => void }) {
  const runtime = mkdtempSync(join(tmpdir(), 'splittap-app-takes-'));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  const fake = fakeSpawner();
  const takes = createTakeManager({ root: '/repo', runtimeDirectory: runtime, spawn: fake.spawn, now: () => new Date('2026-11-10T01:02:03Z') });
  return { runtime, takes, ...fake };
}

const claude = { request: 'Equip two analysts.', shopper: 'claude', payment: 'fake' } as const;

test('run input is trimmed, limited and strict', () => {
  assert.deepEqual(parseRunInput({ request: ' Equip two analysts. ', shopper: 'claude', payment: 'fake' }),
    { request: 'Equip two analysts.', shopper: 'claude', payment: 'fake' });
  assert.throws(() => parseRunInput({ request: '   ', shopper: 'claude', payment: 'fake' }), InputError);
  assert.throws(() => parseRunInput({ request: 'x'.repeat(1001), shopper: 'claude', payment: 'fake' }), /1,000 characters/);
  assert.throws(() => parseRunInput({ request: 'ok', shopper: 'claude', payment: 'fake', extra: 1 }), InputError);
  assert.throws(() => parseRunInput({ request: 'ok', shopper: 'gpt', payment: 'fake' }), InputError);
  assert.deepEqual(parseContinueInput({ step: 'operator-confirm' }), { step: 'operator-confirm' });
  assert.throws(() => parseContinueInput({ step: 'run' }), InputError);
});

test('spawn arguments are an array with the take folder as one element', () => {
  assert.deepEqual(flowArguments({ request: 'r', shopper: 'claude', payment: 'paypal-sandbox' }, '/x/take one'),
    ['apps/cli/src/demo-flow.ts', '--pause', '--live', '--sandbox-paypal', '--dir', '/x/take one', '--request-file', '/x/take one.request.txt']);
  assert.deepEqual(flowArguments({ request: 'r', shopper: 'scripted', payment: 'fake' }, '/x/t'),
    ['apps/cli/src/demo-flow.ts', '--pause', '--dir', '/x/t']);
});

test('each of the flow prompts maps to the step it waits for', () => {
  assert.equal(stepForPrompt('Press Enter for the next scene'), 'next-scene');
  assert.equal(stepForPrompt('Press Enter for the result'), 'next-scene');
  assert.equal(stepForPrompt('You are the operator. Press Enter to confirm this exact digest'), 'operator-confirm');
  assert.equal(stepForPrompt('The sandbox buyer has approved the hold; press Enter to complete it'), 'sandbox-buyer');
  assert.equal(stepForPrompt('Something else'), null);
});

test('a Claude take writes the request beside its new folder and starts the flow from the repo root', (t) => {
  const { runtime, takes, calls } = setup(t);
  assert.deepEqual(takes.start(claude), { ok: true });
  const take = takes.current()!;
  assert.equal(take.directory, join(runtime, 'take-20261110T010203Z'));
  assert.equal(take.status, 'running');
  assert.equal(readFileSync(`${take.directory}.request.txt`, 'utf8'), 'Equip two analysts.');
  assert.equal(calls[0]!.cwd, '/repo');
  assert.deepEqual(calls[0]!.args, flowArguments(claude, take.directory));
});

test('a second start while a take runs is refused', (t) => {
  const { takes, calls } = setup(t);
  takes.start(claude);
  const second = takes.start(claude);
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.status, 409);
  assert.equal(calls.length, 1);
});

test('continue writes one Enter only for the step the flow waits for', (t) => {
  const { takes, children } = setup(t);
  takes.start(claude);
  assert.equal(takes.continue('operator-confirm').ok, false, 'nothing is awaited before a prompt');
  children[0]!.emit('Scene 3\n[You are the operator. Press Enter to confirm this exact digest]');
  assert.equal(takes.current()!.awaiting, 'operator-confirm');
  assert.equal(takes.continue('next-scene').ok, false);
  assert.deepEqual(children[0]!.writes, []);
  assert.deepEqual(takes.continue('operator-confirm'), { ok: true });
  assert.deepEqual(children[0]!.writes, ['\n']);
});

test('a second continue for the same wait sends nothing', (t) => {
  const { takes, children } = setup(t);
  takes.start(claude);
  children[0]!.emit('\n[Press Enter for the next ');
  children[0]!.emit('scene]');
  assert.deepEqual(takes.continue('next-scene'), { ok: true });
  const again = takes.continue('next-scene');
  assert.equal(again.ok, false);
  assert.match(again.ok === false ? again.message : '', /Already sent/);
  assert.deepEqual(children[0]!.writes, ['\n']);
  assert.equal(takes.current()!.awaiting, null);
  children[0]!.emit('\n=== Scene 3 ===\n\n[Press Enter for the next scene]');
  assert.deepEqual(takes.continue('next-scene'), { ok: true });
  assert.deepEqual(children[0]!.writes, ['\n', '\n']);
});

test('stop is refused unless the flow waits', (t) => {
  const { takes, children } = setup(t);
  takes.start(claude);
  assert.equal(takes.stop().ok, false);
  assert.equal(children[0]!.killed, false);
  children[0]!.emit('\n[Press Enter for the next scene]');
  assert.deepEqual(takes.stop(), { ok: true });
  assert.equal(children[0]!.killed, true);
  children[0]!.exit(null);
  assert.equal(takes.current()!.status, 'ended');
});

test('an exited child refuses continue and stop', (t) => {
  const { takes, children } = setup(t);
  takes.start(claude);
  children[0]!.emit('\n[Press Enter for the next scene]');
  children[0]!.exit(2);
  const take = takes.current()!;
  assert.equal(take.status, 'ended');
  assert.equal(take.exitCode, 2);
  assert.equal(take.awaiting, null);
  assert.equal(takes.continue('next-scene').ok, false);
  assert.equal(takes.stop().ok, false);
  assert.deepEqual(takes.start(claude), { ok: true }, 'an ended take does not block the next one');
});

test('terminal keeps the last 400 lines with ANSI escapes removed', (t) => {
  const { takes, children } = setup(t);
  takes.start(claude);
  children[0]!.emit('\u001b[31mred\u001b[0m\n');
  assert.equal(takes.terminal().at(-1), 'red');
  children[0]!.emit(Array.from({ length: 450 }, (_, i) => `line ${i}`).join('\n') + '\n');
  assert.equal(takes.terminal().length, 400);
  assert.equal(takes.terminal().at(-1), 'line 449');
});

test('on launch the newest unfinished take reads as interrupted', (t) => {
  const runtime = mkdtempSync(join(tmpdir(), 'splittap-app-takes-'));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  for (const [name, finished] of [['take-20261109T010000Z', true], ['take-20261110T010000Z', false]] as const) {
    mkdirSync(join(runtime, name));
    writeFileSync(join(runtime, name, 'session.json'), JSON.stringify({
      kind: 'splittap-demo-session', version: 1, mode: 'scripted', paymentProvider: 'fake',
      startedAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:05.000Z', scenes: ['The control panel'], scene: 1,
      mandate: null, operationIds: [], results: [], waiting: null, finished, failure: null, unusable: [],
    }));
  }
  const takes = createTakeManager({ root: '/repo', runtimeDirectory: runtime, spawn: fakeSpawner().spawn });
  const take = takes.current()!;
  assert.equal(take.directory, join(runtime, 'take-20261110T010000Z'));
  assert.equal(take.status, 'interrupted');
  assert.equal(takes.readSession()?.scene, 1);
});
