import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { AppState } from './app-server.ts';
import { loadAppAssets } from './app-server.ts';
import { DEMO_SCENES } from './demo-flow.ts';

/** Browser interactions used by the client, including focus lost when nodes are replaced. */
class ClientNode {
  childNodes: ClientNode[] = [];
  parentNode: ClientNode | null = null;
  attributes: Record<string, string> = {};
  listeners: Record<string, Array<(event: { target: ClientNode; currentTarget: ClientNode }) => void>> = {};
  className = '';
  style: Record<string, string> = {};
  value = '';
  readOnly = false;
  checked = false;
  disabled = false;
  type = '';
  name = '';
  open = false;
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  selectionDirection: string | null = null;
  readonly document: ClientDocument;
  readonly tagName: string | null;
  private text = '';
  constructor(document: ClientDocument, tagName: string | null, text = '') { this.document = document; this.tagName = tagName; this.text = text; }
  get id(): string { return this.getAttribute('id') ?? ''; }
  get textContent(): string { return this.tagName === null ? this.text : this.childNodes.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.replaceChildren(new ClientNode(this.document, null, value)); }
  appendChild<T extends ClientNode>(child: T): T { child.parentNode = this; this.childNodes.push(child); return child; }
  append(...children: Array<ClientNode | string>): void { for (const child of children) this.appendChild(typeof child === 'string' ? new ClientNode(this.document, null, child) : child); }
  replaceChildren(...children: ClientNode[]): void {
    if (this.contains(this.document.activeElement)) this.document.activeElement = this.document.body;
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...children);
  }
  contains(node: ClientNode | null): boolean { return node !== null && (node === this || this.childNodes.some((child) => child.contains(node))); }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  removeAttribute(name: string): void { delete this.attributes[name]; }
  addEventListener(type: string, listener: (event: { target: ClientNode; currentTarget: ClientNode }) => void): void { (this.listeners[type] ??= []).push(listener); }
  dispatch(type: string): void { for (const listener of this.listeners[type] ?? []) listener({ target: this, currentTarget: this }); }
  focus(): void { if (!this.disabled) this.document.activeElement = this; }
  setSelectionRange(start: number, end: number, direction = 'none'): void { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  querySelectorAll(selector: string): ClientNode[] {
    const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    return descendants(this).filter((node) => attribute
      ? node.getAttribute(attribute[1]!) !== null && (attribute[2] === undefined || node.getAttribute(attribute[1]!) === attribute[2])
      : selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector);
  }
  querySelector(selector: string): ClientNode | null { return this.querySelectorAll(selector)[0] ?? null; }
}

function descendants(node: ClientNode): ClientNode[] { return node.childNodes.flatMap((child) => [child, ...descendants(child)]); }

class ClientDocument {
  body = new ClientNode(this, 'body');
  root = this.body.appendChild(new ClientNode(this, 'main'));
  activeElement: ClientNode = this.body;
  createElement(tag: string): ClientNode { return new ClientNode(this, tag); }
  createTextNode(text: string): ClientNode { return new ClientNode(this, null, text); }
  getElementById(id: string): ClientNode | null { return id === 'app' ? this.root : descendants(this.root).find((node) => node.id === id) ?? null; }
  querySelector(): null { return null; }
}

interface Reply { ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }
interface PostReply { body: unknown; status: number }
const reply = (body: unknown, status = 200): Reply => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
const flush = async (): Promise<void> => { await new Promise<void>((resolve) => setImmediate(resolve)); };

function state(takeStatus: 'idle' | 'working' | 'waiting' | 'ended' = 'idle'): AppState {
  if (takeStatus === 'idle') return { take: null, dashboard: null, conversation: [], terminal: [], approvalUrl: null, demoRequest: 'Equip five engineering hires.' };
  return {
    take: { directory: '/test/take', startedAt: '2026-11-11T01:00:00.000Z', input: { request: 'Equip five engineering hires.', shopper: 'scripted', payment: 'fake' },
      status: takeStatus === 'ended' ? 'ended' : 'running', exitCode: takeStatus === 'ended' ? 1 : null, awaiting: takeStatus === 'waiting' ? 'next-scene' : null },
    dashboard: {
      version: 1, generatedAt: '2026-11-11T01:00:00.000Z', source: { kind: 'demo', label: '<test>' },
      demo: { mode: 'scripted', paymentProvider: 'fake', startedAt: '2026-11-11T01:00:00.000Z', updatedAt: '2026-11-11T01:00:00.000Z', scenes: [...DEMO_SCENES], scene: 1,
        results: [], waiting: takeStatus === 'waiting' ? 'next-scene' : null, finished: takeStatus === 'ended', failure: takeStatus === 'ended' ? 'Synthetic failure.' : null, unusable: [] },
      mandate: null, mandateStatus: 'not-stored', ledgerStatus: 'no-mandate', ledger: null, stores: [], requestedOperationIds: [], operations: [], notices: [], problems: [],
    },
    conversation: [], terminal: ['Synthetic terminal output.'], approvalUrl: null, demoRequest: 'Equip five engineering hires.',
  };
}

/** Every response and timer is controlled; this never starts a backend or makes a network call. */
function client(initial: AppState | Promise<AppState> = state()) {
  const document = new ClientDocument();
  const states: Array<AppState | Error | Promise<AppState>> = [initial];
  const posts: Array<PostReply | Promise<PostReply>> = [];
  const requests: Array<{ path: string; method: string }> = [];
  let lastState = state();
  let interval: (() => void) | undefined;
  runInNewContext(loadAppAssets().script, {
    window: {}, document, URL,
    setInterval: (callback: () => void) => { interval = callback; return 1; },
    fetch: async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      requests.push({ path, method });
      if (path === '/api/files') return reply({ policy: null });
      if (path === '/api/state') {
        const next = states.shift() ?? lastState;
        if (next instanceof Error) throw next;
        lastState = await next;
        return reply(lastState);
      }
      const next = await (posts.shift() ?? { body: {}, status: 200 });
      return reply(next.body, next.status);
    },
  }, { filename: 'app/app.js', timeout: 1000 });
  const node = (predicate: (node: ClientNode) => boolean): ClientNode => {
    const result = descendants(document.root).find(predicate);
    assert.ok(result, 'expected control to be rendered');
    return result;
  };
  return {
    document, root: document.root, states, posts, requests,
    node,
    button: (label: string) => node((item) => item.tagName === 'button' && item.textContent === label),
    async click(label: string) {
      const button = node((item) => item.tagName === 'button' && item.textContent === label);
      assert.equal(button.disabled, false, `${label} should be enabled`);
      button.focus(); button.dispatch('click'); await flush();
    },
    choose(id: string) {
      const radio = document.getElementById(id);
      assert.ok(radio, `radio ${id} should be rendered`);
      radio.focus(); radio.checked = true; radio.dispatch('change');
    },
    async tick() { assert.ok(interval); interval(); await flush(); },
    async poll(next: AppState | Error) { states.push(next); assert.ok(interval); interval(); await flush(); },
  };
}

test('initial loading and connection failure remain visible before any state arrives, then recover', async () => {
  let rejectInitial!: (error: Error) => void;
  const initial = new Promise<AppState>((_resolve, reject) => { rejectInitial = reject; });
  const page = client(initial);
  assert.match(page.root.textContent, /loading/i);
  await flush();
  rejectInitial(new Error('offline'));
  await flush();
  assert.match(page.root.textContent, /Connection to the app server lost/);
  await page.poll(state());
  assert.doesNotMatch(page.root.textContent, /Connection to the app server lost/);
  assert.equal(page.button('Start run').disabled, false);
});

test('connection errors remain visible while working and after a take ends', async () => {
  for (const status of ['working', 'ended'] as const) {
    const current = state(status);
    const page = client(current);
    await flush();
    await page.poll(new Error('offline'));
    assert.match(page.root.textContent, /Connection to the app server lost/, status);
    await page.poll(current);
    assert.doesNotMatch(page.root.textContent, /Connection to the app server lost/, `${status} recovers even with identical state`);
  }
});

test('timer ticks share an unfinished state read and polling resumes after it completes', async () => {
  let resolveInitial!: (value: AppState) => void;
  const initial = new Promise<AppState>((resolve) => { resolveInitial = resolve; });
  const page = client(initial);
  await flush();
  const stateReads = () => page.requests.filter((request) => request.path === '/api/state').length;
  assert.equal(stateReads(), 1);
  await page.tick();
  await page.tick();
  assert.equal(stateReads(), 1, 'an outstanding read must not accumulate competing state requests');
  resolveInitial(state('waiting'));
  await flush();
  assert.equal(page.button('Next scene').disabled, false);
  await page.tick();
  assert.equal(stateReads(), 2, 'the lock must release after the previous read finishes');
});

test('stale state disables network actions until a successful poll, without clearing an action refusal', async () => {
  const current = state('waiting');
  const page = client(current);
  await flush();
  const refusal = 'The run is waiting for a different step. Reload the page.';
  page.posts.push({ body: { error: refusal }, status: 409 });
  await page.click('Next scene');
  assert.ok(page.root.textContent.includes(refusal));
  assert.equal(page.document.activeElement, page.button('Next scene'), 'a refused action restores its retry control after the temporary busy state');
  await page.poll(new Error('offline'));
  assert.equal(page.button('Next scene').disabled, true);
  assert.equal(page.button('Stop run').disabled, true);
  await page.poll(current);
  assert.equal(page.button('Next scene').disabled, false);
  assert.equal(page.button('Stop run').disabled, false);
  assert.doesNotMatch(page.root.textContent, /Connection to the app server lost/);
  assert.ok(page.root.textContent.includes(refusal), 'a successful read cannot erase a refused action');
  assert.equal(page.requests.filter((request) => request.method === 'POST').length, 1, 'polling never retries a refused action');
});

test('an action response preserves a different control focused while the request was pending', async () => {
  const page = client(state('waiting'));
  await flush();
  let finishPost!: (value: PostReply) => void;
  page.posts.push(new Promise<PostReply>((resolve) => { finishPost = resolve; }));
  await page.click('Next scene');
  const summary = page.node((node) => node.tagName === 'summary');
  summary.focus();
  const refusal = 'The run is not waiting for you yet.';
  finishPost({ body: { error: refusal }, status: 409 });
  await flush();
  assert.ok(page.root.textContent.includes(refusal), 'the pending response has completed');
  assert.equal(page.document.activeElement.tagName, 'summary');
  assert.equal(page.document.activeElement.textContent, 'Terminal', 'a completed action must not take focus back from the person');
});

test('new-run choices update the header and preserve radio focus', async () => {
  const page = client(state('ended'));
  await flush();
  await page.click('Start a new run');
  page.choose('shopper-claude');
  assert.equal(page.document.activeElement.id, 'shopper-claude');
  page.choose('payment-paypal-sandbox');
  assert.equal(page.document.activeElement.id, 'payment-paypal-sandbox');
  const header = page.node((node) => node.tagName === 'header').textContent;
  assert.match(header, /Shopper: Claude/);
  assert.match(header, /Payment: PayPal sandbox/);
});

test('refresh preserves editable request focus and selection, including an intentionally empty request', async () => {
  const current = state('ended');
  const page = client(current);
  await flush();
  await page.click('Start a new run');
  page.choose('shopper-claude');
  const box = page.node((node) => node.tagName === 'textarea');
  box.value = 'Equip three designers.';
  box.dispatch('input'); box.focus(); box.setSelectionRange(6, 11, 'backward');
  const refreshed = structuredClone(current);
  refreshed.dashboard!.generatedAt = '2026-11-11T01:00:03.000Z';
  refreshed.dashboard!.problems.push('A synthetic status read changed.');
  await page.poll(refreshed);
  assert.match(page.root.textContent, /A synthetic status read changed/, 'fresh displayed facts must still render while editing');
  const active = page.document.activeElement;
  assert.equal(active.tagName, 'textarea');
  assert.equal(active.value, 'Equip three designers.');
  assert.equal(active.selectionStart, 6);
  assert.equal(active.selectionEnd, 11);
  assert.equal(active.selectionDirection, 'backward');
  active.value = ''; active.dispatch('input');
  page.choose('payment-paypal-sandbox');
  assert.equal(page.node((node) => node.tagName === 'textarea').value, '', 'redraw must not replace an empty request with the demo');
});

test('Terminal stays open when new state and output arrive', async () => {
  const current = state('waiting');
  const page = client(current);
  await flush();
  const terminal = page.node((node) => node.tagName === 'details');
  terminal.open = true; terminal.dispatch('toggle');
  const refreshed = structuredClone(current);
  refreshed.dashboard!.generatedAt = '2026-11-11T01:00:03.000Z';
  refreshed.terminal.push('Another synthetic line.');
  await page.poll(refreshed);
  const updated = page.node((node) => node.tagName === 'details');
  assert.equal(updated.open, true);
  assert.match(updated.textContent, /Another synthetic line/);
});
