import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { AppState } from './app-server.ts';
import { loadAppAssets } from './app-server.ts';
import type { DashboardState } from './dashboard-state.ts';
import { DEMO_SCENES } from './demo-flow.ts';

/** A small DOM: enough for the page's renderer, which builds nodes and never parses HTML. */
class Node {
  tagName: string | null;
  childNodes: Node[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  className = '';
  value = '';
  readOnly = false;
  checked = false;
  disabled = false;
  type = '';
  name = '';
  open = false;
  private text: string;
  constructor(tag: string | null, text = '') { this.tagName = tag; this.text = text; }
  get textContent(): string { return this.tagName === null ? this.text : this.childNodes.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.childNodes = [new Node(null, value)]; }
  appendChild<T extends Node>(child: T): T { this.childNodes.push(child); return child; }
  append(...children: Array<Node | string>): void { for (const child of children) this.appendChild(typeof child === 'string' ? new Node(null, child) : child); }
  replaceChildren(...children: Node[]): void { this.childNodes = []; this.append(...children); }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  removeAttribute(name: string): void { delete this.attributes[name]; }
  addEventListener(type: string, listener: () => void): void { (this.listeners[type] ??= []).push(listener); }
  focus(): void {}
}

function all(node: Node, predicate: (node: Node) => boolean): Node[] {
  return [...(predicate(node) ? [node] : []), ...node.childNodes.flatMap((child) => all(child, predicate))];
}

const assets = loadAppAssets();

function render(state: AppState): Node {
  const root = new Node('main');
  const sandbox: Record<string, unknown> = {
    document: { createElement: (tag: string) => new Node(tag), createTextNode: (text: string) => new Node(null, text) },
    // Browsers have the WHATWG URL parser, and Node's is the same standard.
    URL,
  };
  runInNewContext(assets.script, sandbox, { filename: 'app/app.js', timeout: 1000 });
  const renderApp = (sandbox as { renderApp?: (state: AppState, files: unknown, root: Node) => void }).renderApp;
  assert.equal(typeof renderApp, 'function', 'app.js defines renderApp without a window');
  renderApp!(state, { policy: POLICY }, root);
  return root;
}

const POLICY = {
  id: 'hardware-policy', version: 1, currency: 'SGD', maxBudgetMinor: 1000000, allowedSuppliers: ['store-a', 'store-b'], evidenceMaxAgeHours: 72,
  roles: { laptop: { allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24, maxUnits: 20 } },
};

function dashboard(change: Partial<NonNullable<DashboardState['demo']>> = {}, operations: DashboardState['operations'] = []): DashboardState {
  return {
    version: 1, generatedAt: '2026-11-10T01:00:00.000Z', source: { kind: 'demo', label: '<work dir>' },
    demo: { mode: 'live', paymentProvider: 'paypal-sandbox', startedAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:00.000Z',
      scenes: [...DEMO_SCENES], scene: 3, results: [], waiting: null, finished: false, failure: null, unusable: [], approvalUrl: null, ...change },
    mandate: null, mandateStatus: 'not-stored', ledgerStatus: 'no-mandate', ledger: null, stores: [],
    requestedOperationIds: [], operations, notices: [], problems: [],
  };
}

function state(change: Partial<AppState> = {}): AppState {
  return {
    take: { directory: '/x/take', startedAt: '2026-11-10T01:00:00.000Z', input: { request: 'Equip two analysts.', shopper: 'claude', payment: 'paypal-sandbox' },
      status: 'running', exitCode: null, awaiting: null },
    dashboard: dashboard(), conversation: [], terminal: [], approvalUrl: null, demoRequest: 'Equip five engineering hires.', ...change,
  };
}

const buttons = (root: Node): string[] => all(root, (node) => node.tagName === 'button').map((node) => node.textContent);
const text = (root: Node): string => root.textContent;
const running = (awaiting: 'next-scene' | 'operator-confirm' | 'sandbox-buyer' | null) => ({ ...state().take!, awaiting });

test('the wait after scene 6 is labelled as the result, not a next scene', () => {
  const last = render(state({ take: running('next-scene'), dashboard: dashboard({ scene: DEMO_SCENES.length, waiting: 'next-scene' }) }));
  assert.ok(buttons(last).includes('Show the result'));
  assert.ok(!buttons(last).includes('Next scene'));
  assert.match(text(last), /Waiting for you: the result/);
  const earlier = render(state({ take: running('next-scene'), dashboard: dashboard({ scene: DEMO_SCENES.length - 1, waiting: 'next-scene' }) }));
  assert.ok(buttons(earlier).includes('Next scene'));
  assert.ok(!buttons(earlier).includes('Show the result'));
});

test('the action button names exactly the awaited step', () => {
  assert.ok(buttons(render(state({ take: running('next-scene') }))).includes('Next scene'));
  assert.ok(buttons(render(state({ take: running('operator-confirm') }))).includes('Confirm this mandate'));
  const buyer = render(state({ take: running('sandbox-buyer'), approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=T' }));
  assert.ok(buttons(buyer).includes('Buyer has approved'));
  const link = all(buyer, (node) => node.tagName === 'a' && node.textContent === 'Open PayPal approval page')[0]!;
  assert.equal(link.getAttribute('href'), 'https://www.sandbox.paypal.com/checkoutnow?token=T');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  // Only the gateway's sandbox consent hosts: the buyer signs in to PayPal on this page.
  for (const approvalUrl of ['javascript:alert(1)', 'https://evil.example/checkoutnow', 'https://www.paypal.com/checkoutnow?token=T',
    'https://sandbox.paypal.com.evil.example/x', 'http://www.sandbox.paypal.com/checkoutnow']) {
    const unsafe = render(state({ take: running('sandbox-buyer'), approvalUrl }));
    assert.equal(all(unsafe, (node) => node.tagName === 'a' && node.textContent === 'Open PayPal approval page').length, 0, approvalUrl);
  }
  const idle = buttons(render(state({ take: running(null) })));
  for (const label of ['Next scene', 'Confirm this mandate', 'Buyer has approved', 'Stop run']) assert.ok(!idle.includes(label), label);
});

test('the status line says who shops and how payment runs', () => {
  const live = text(render(state({ take: running('operator-confirm') })));
  assert.match(live, /Shopper: Claude/);
  assert.match(live, /Payment: PayPal sandbox/);
  assert.match(live, /Waiting for you to confirm/);
  const scripted = text(render(state({ take: { ...running(null), input: { request: 'r', shopper: 'scripted', payment: 'fake' } }, dashboard: dashboard({ mode: 'scripted', paymentProvider: 'fake' }) })));
  assert.match(scripted, /Shopper: scripted stand-in/);
  assert.match(scripted, /Payment: fake/);
});

test('hostile text renders as text', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const root = render(state({ conversation: [{ actor: 'claude', scene: 4, title: hostile, detail: [hostile], tone: 'neutral' }], terminal: [hostile] }));
  assert.equal(all(root, (node) => node.tagName === 'img').length, 0);
  assert.ok(text(root).includes(hostile));
  assert.doesNotMatch(assets.script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('a finished exit-2 take says it is not usable and lists why', () => {
  const root = render(state({ take: { ...running(null), status: 'ended', exitCode: 2 },
    dashboard: dashboard({ finished: true, unusable: ['The model avoided store-b, so this run shows no rejection'] }) }));
  assert.match(text(root), /Finished, but this take isn't usable for the video/);
  assert.match(text(root), /The model avoided store-b/);
  assert.ok(buttons(root).includes('Start a new run'));
});

test('a failed take shows the flow message as written and offers Start a new run', () => {
  const message = 'Add ANTHROPIC_API_KEY to .env, then start again.';
  const root = render(state({ take: { ...running(null), status: 'ended', exitCode: 1 }, dashboard: dashboard({ failure: message }) }));
  assert.ok(text(root).includes(message));
  assert.ok(buttons(root).includes('Start a new run'));
});

test('a stopped sandbox take with a PayPal order warns that a hold may exist', () => {
  const operation: DashboardState['operations'][number] = {
    id: 'op-1', supplierId: 'store-a', cartId: 'c1', totalMinor: 751010, currency: 'SGD', status: 'reserved', reservationStatus: 'active',
    paymentProvider: 'paypal-sandbox', paymentStatus: 'not_started', orderStatus: 'not_started', refundStatus: 'not_started', readinessStatus: 'not_assessed',
    createdAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:00.000Z', providerIds: { orderId: 'ORDER1' }, events: [],
  };
  const root = render(state({ take: { ...running(null), status: 'ended', exitCode: null }, dashboard: dashboard({}, [operation]) }));
  assert.match(text(root), /A PayPal hold may exist\. It expires on its own; keep this take folder for status and operation-reconcile\./);
});

test('an unknown payment provider is never labelled as fake', () => {
  const operation: DashboardState['operations'][number] = {
    id: 'op-legacy', supplierId: 'store-a', cartId: 'c1', totalMinor: 751010, currency: 'SGD', status: 'ordered', reservationStatus: 'consumed',
    paymentProvider: null, paymentStatus: 'succeeded', orderStatus: 'succeeded', refundStatus: 'not_started', readinessStatus: 'not_assessed',
    createdAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:00.000Z', providerIds: {}, events: [],
  };
  const root = render(state({ dashboard: dashboard({}, [operation]) }));
  const ledger = all(root, (node) => node.className === 'panel ledger')[0]!;
  assert.match(text(ledger), /provider unknown, succeeded/);
  assert.doesNotMatch(text(ledger), /fake/);
  assert.match(text(ledger), /Supplier ordersimulated, succeeded/);
  assert.match(text(ledger), /Readinessnot assessed/);
});

test('the scripted shopper shows the demo request read-only with its label', () => {
  const idle: AppState = { take: null, dashboard: null, conversation: [], terminal: [], approvalUrl: null, demoRequest: 'Equip five engineering hires.' };
  const root = render(idle);
  const box = all(root, (node) => node.tagName === 'textarea')[0]!;
  assert.equal(box.readOnly, true, 'scripted is the default');
  assert.equal(box.value, 'Equip five engineering hires.');
  assert.match(text(root), /The scripted stand-in always uses this request\. Choose Claude to use your own words\./);
  assert.ok(buttons(root).includes('Start run'));
  assert.match(text(root), /Claude proposes/);
});

test('the assets reference no external URL', () => {
  for (const [name, body] of Object.entries(assets)) assert.doesNotMatch(body, /https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+/i, name);
  assert.doesNotMatch(assets.script, /attrs: \{ style:/, 'inline style attributes are blocked by the page CSP');
  assert.match(assets.html, /<meta name="splittap-token" content="\{\{TOKEN\}\}">/);
});

test('unavailable mandate reads stay unknown rather than looking unstored', () => {
  const unavailable = { ...dashboard(), mandateStatus: 'unavailable' as const, ledgerStatus: 'unavailable' as const };
  const failed = text(render(state({ dashboard: unavailable })));
  assert.match(failed, /The mandate could not be read\. Its details and confirmation are unknown\./);
  assert.doesNotMatch(failed, /Appears once the request is drafted and stored/);
  assert.match(failed, /reservations are unknown/);
  const revisionUnknown = text(render(state({ dashboard: { ...unavailable, mandateStatus: 'revision-unknown', ledgerStatus: 'unconfirmed' } })));
  assert.match(revisionUnknown, /A mandate is stored, but its revision details are unavailable/);
  assert.doesNotMatch(revisionUnknown, /Appears once the request is drafted and stored/);
});

test('the full mandate digest is available for review before confirmation', () => {
  const current = dashboard();
  const digest = '0123456789abcdef'.repeat(4);
  current.mandateStatus = 'read';
  current.mandate = {
    id: 'engineering-hires-demo', revision: 1, digest, confirmationStatus: 'unconfirmed', confirmedAt: null,
    currency: 'SGD', budgetMinor: 800000, purchaseBy: '2026-11-20T09:00:00.000Z', readyBy: '2026-11-23T09:00:00.000Z',
    deliveryLocationId: 'singapore-office', allowedSuppliers: ['store-a'], requirements: [], evidenceMaxAgeHours: 72,
  };
  const root = render(state({ take: running('operator-confirm'), dashboard: current }));
  assert.ok(text(root).includes(`Digest ${digest}`));
  assert.match(text(root), /Not confirmed/);
  assert.equal(all(root, (node) => node.className.includes('stamp')).length, 0);
  assert.ok(buttons(root).includes('Confirm this mandate'));
});

test('a finished take found on disk after a restart reads as finished, not stopped', () => {
  const found = { ...running(null), input: null, status: 'ended' as const, exitCode: null };
  const clean = render(state({ take: found, dashboard: dashboard({ finished: true }) }));
  assert.match(text(clean), /Finished/);
  assert.doesNotMatch(text(clean), /Stopped/);
  const unusable = render(state({ take: found, dashboard: dashboard({ finished: true, unusable: ['Claude did not flag the hostile listing in its summary'] }) }));
  assert.match(text(unusable), /isn't usable for the video/);
  assert.match(text(unusable), /did not flag the hostile listing/);
});
