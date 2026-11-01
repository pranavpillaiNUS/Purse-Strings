// Build step 1: PayPal sandbox spike with hardcoded carts.
//
// Answers the questions the whole design rests on, against the real sandbox:
//   1. Can one AUTHORIZE order hold the whole budget?          create order -> buyer approves -> authorize
//   2. Do several partial captures work, and does money move?  3 captures, confirmed by re-reading them
//   3. Is a retried capture idempotent?                        replay with the same PayPal-Request-Id
//   4. Can captures on one authorization run concurrently?     2 at once; tells us whether to serialize
//   5. Is the hold a hard ceiling?                             try to capture 12.00 more than remains
//   6. Can we release the rest?                                --finish=void (default) or --finish=final
//   7. Optional: partial refund of a capture                   --refund
//
// Usage: npm run spike:paypal -- [--finish=void|final] [--skip-overcapture] [--refund] [--open]
// Setup and how to read the results: docs/paypal-spike.md

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { assertSupportedCurrency, fromMinor, paypalMoney, toMinor } from '../src/money.ts';
import {
  createPayPalClient,
  PayPalApiError,
  type Capture,
  type CaptureParams,
  type PayPalExchange,
} from '../src/paypal/client.ts';

const { values: flags } = parseArgs({
  options: {
    finish: { type: 'string', default: 'void' },
    'skip-overcapture': { type: 'boolean', default: false },
    refund: { type: 'boolean', default: false },
    open: { type: 'boolean', default: false },
  },
});
if (flags.finish !== 'void' && flags.finish !== 'final') {
  console.error('--finish must be "void" or "final"');
  process.exit(2);
}

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET. Copy .env.example to .env and fill in your');
  console.error('sandbox REST app credentials. Setup steps: docs/paypal-spike.md');
  process.exit(2);
}
const currency = process.env.SPIKE_CURRENCY ?? 'SGD';
assertSupportedCurrency(currency);
const port = Number(process.env.SPIKE_PORT ?? 8787);

// Unique per run: PayPal rejects a reused invoice_id forever (DUPLICATE_INVOICE_ID).
const runId = `spike-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const exchanges: PayPalExchange[] = [];
const paypal = createPayPalClient({
  environment: 'sandbox',
  clientId,
  clientSecret,
  onExchange: (exchange) => exchanges.push(exchange),
});
const money = (minor: number) => paypalMoney(currency, minor);

// --- Hardcoded stand-ins for carts the checker has already approved (GST 9%) ---

const BUDGET = toMinor('8000.00');

function cart(id: string, store: string, label: string, subtotal: string, shipping: string, tax: string) {
  return { id, store, label, total: toMinor(subtotal) + toMinor(shipping) + toMinor(tax) };
}
type Cart = ReturnType<typeof cart>;

const CART_A = cart('cart-a', 'store-a', '3 x LAP-14-AIR @ 1099.00', '3297.00', '0.00', '296.73');
const CART_B = cart('cart-b', 'store-b', '2 x LAP-14-AIR @ 1089.00', '2178.00', '15.00', '197.37');
const CART_C = cart('cart-c', 'store-c', '5 x 27in USB-C monitor @ 279.00', '1395.00', '0.00', '125.55');

// --- Findings ---

type Outcome = 'PASS' | 'FAIL' | 'WARN' | 'INFO';
const findings: Array<{ check: string; outcome: Outcome; detail: string }> = [];
const seenCodes = new Set<string>();

const HINTS: Record<string, string> = {
  invalid_client: 'Check that PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are the SANDBOX credentials of your app.',
  RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION:
    'The business account does not hold this currency. Use a sandbox business account created in Singapore, ' +
    'accept the payment / set receiving preferences in that account, or rerun with SPIKE_CURRENCY=USD.',
  PENDING_REVIEW: 'Sandbox risk review. Retry with a different sandbox buyer account.',
  MAX_CAPTURE_COUNT_EXCEEDED:
    'PayPal capped the number of captures per authorization. Design: one capture per store per mandate.',
  PREVIOUS_REQUEST_IN_PROGRESS: 'Concurrent captures on one authorization collide. The checker must serialize them.',
  PREVIOUSLY_CAPTURED:
    'A partially captured authorization cannot be voided. Close mandates with final_capture=true on the last capture.',
  DUPLICATE_INVOICE_ID: 'invoice_id caught a duplicate. Keep invoice_id = cart ID as a second guard.',
};

function record(check: string, outcome: Outcome, detail: string) {
  findings.push({ check, outcome, detail });
  console.log(`  [${outcome}] ${check}: ${detail}`);
}

function step(title: string) {
  console.log(`\n${title}`);
}

function reason(resource: { status_details?: { reason: string } }): string {
  const code = resource.status_details?.reason;
  if (!code) return '';
  seenCodes.add(code);
  return ` (${code})`;
}

function describe(error: unknown): string {
  if (error instanceof PayPalApiError) {
    if (error.issue) seenCodes.add(error.issue);
    return `${error.message}${error.debugId ? ` [debug_id ${error.debugId}]` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function checkCapture(check: string, capture: Capture, expectedMinor: number) {
  const ok = capture.status === 'COMPLETED' && toMinor(capture.amount.value) === expectedMinor;
  record(check, ok ? 'PASS' : 'FAIL', `${capture.id} ${capture.amount.value} status=${capture.status}${reason(capture)}`);
}

// --- PayPal helpers ---

function capture(authorizationId: string, key: string, params: Omit<CaptureParams, 'invoiceId'>) {
  // The request ID and invoice ID derive from the cart, so a retry is the same request to PayPal.
  return paypal.captureAuthorization(authorizationId, { ...params, invoiceId: `${runId}-${key}` }, `${runId}-${key}`);
}

function captureCart(authorizationId: string, c: Cart) {
  return capture(authorizationId, c.id, {
    amount: money(c.total),
    finalCapture: false,
    noteToPayer: `${c.store}: ${c.label}`,
  });
}

function startApprovalListener() {
  let settle: (outcome: 'approved' | 'cancelled') => void = () => {};
  const redirected = new Promise<'approved' | 'cancelled'>((r) => (settle = r));
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== '/return' && path !== '/cancel') {
      res.writeHead(404).end();
      return;
    }
    const outcome = path === '/return' ? 'approved' : 'cancelled';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<p>Buyer ${outcome}. Back to the terminal.</p>`);
    settle(outcome);
  });
  const listening = new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  return { listening, redirected, close: () => server.close() };
}

async function waitForApproval(orderId: string, redirected: Promise<'approved' | 'cancelled'>) {
  const state: { outcome?: 'approved' | 'cancelled' } = {};
  void redirected.then((outcome) => (state.outcome = outcome));
  const deadline = Date.now() + 15 * 60_000;
  while (!state.outcome) {
    if (Date.now() > deadline) throw new Error('Timed out after 15 minutes waiting for buyer approval');
    await Promise.race([sleep(5000), redirected]);
    if (state.outcome) break;
    // Fallback for when the browser can't reach the local redirect page.
    const order = await paypal.getOrder(orderId).catch(() => undefined);
    if (order?.status === 'APPROVED') state.outcome = 'approved';
  }
  return state.outcome;
}

function openInBrowser(url: string) {
  const [command, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

// --- The spike ---

let openAuthorizationId: string | undefined;

async function run() {
  console.log(`PayPal sandbox spike ${runId}: hold ${fromMinor(BUDGET)} ${currency}, then capture 3 carts`);

  step('1. Hold the budget: create an AUTHORIZE order and get buyer approval');
  const listener = startApprovalListener();
  await listener.listening;
  try {
    return await holdAndCapture(listener.redirected);
  } finally {
    listener.close();
  }
}

async function holdAndCapture(redirected: Promise<'approved' | 'cancelled'>) {
  const order = await paypal.createOrder(
    {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: runId,
          description: 'Purse Strings spike: budget hold for agent purchases',
          amount: money(BUDGET),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Purse Strings (sandbox)',
            shipping_preference: 'NO_SHIPPING',
            // CONTINUE is for "final amount not known yet", which is exactly what a budget hold is.
            user_action: 'CONTINUE',
            // Rules out eCheck-style funding that would leave captures PENDING.
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            return_url: `http://localhost:${port}/return`,
            cancel_url: `http://localhost:${port}/cancel`,
          },
        },
      },
    },
    `${runId}-order`,
  );
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error(`Order ${order.id} has no approval link (status ${order.status})`);
  record('Order created', order.status === 'PAYER_ACTION_REQUIRED' || order.status === 'CREATED' ? 'PASS' : 'FAIL', `${order.id} status=${order.status}`);

  console.log('\n  Open this link in a PRIVATE window and log in as your sandbox PERSONAL (buyer) account:');
  console.log(`  ${approveUrl}\n`);
  if (flags.open) openInBrowser(approveUrl);
  console.log('  Waiting for approval (Ctrl+C to abort)...');
  const approval = await waitForApproval(order.id, redirected);
  if (approval === 'cancelled') {
    record('Buyer approval', 'FAIL', 'buyer cancelled in the PayPal window');
    return;
  }
  record('Buyer approval', 'PASS', 'buyer approved the hold');

  const authorized = await paypal.authorizeOrder(order.id, `${runId}-authorize`);
  const auth = authorized.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`Authorize call returned no authorization for order ${order.id}`);
  openAuthorizationId = auth.id;
  record('Authorization created', auth.status === 'CREATED' ? 'PASS' : 'FAIL', `${auth.id} status=${auth.status}${reason(auth)}`);
  record(
    'Hold equals budget',
    toMinor(auth.amount.value) === BUDGET && auth.amount.currency_code === currency ? 'PASS' : 'FAIL',
    `${auth.amount.value} ${auth.amount.currency_code}`,
  );
  if (auth.create_time) {
    const honorEnds = new Date(Date.parse(auth.create_time) + 3 * 86_400_000).toISOString();
    record('Hold timing', 'INFO', `created ${auth.create_time}, honor period ends ~${honorEnds}, expires ${auth.expiration_time ?? 'n/a'}`);
  }

  step(`2. Capture cart A (${CART_A.store}, ${fromMinor(CART_A.total)}), final_capture=false`);
  const captureA = await captureCart(auth.id, CART_A);
  checkCapture('Partial capture #1', captureA, CART_A.total);

  step('3. Retry the capture of cart A with the same PayPal-Request-Id');
  try {
    const replay = await captureCart(auth.id, CART_A);
    record(
      'Retried capture is idempotent',
      replay.id === captureA.id ? 'PASS' : 'FAIL',
      replay.id === captureA.id ? `returned the original capture ${replay.id}` : `created a SECOND capture ${replay.id}`,
    );
  } catch (error) {
    record('Retried capture is idempotent', 'WARN', `replay was rejected instead of replayed: ${describe(error)}`);
  }

  step(`4. Capture carts B (${fromMinor(CART_B.total)}) and C (${fromMinor(CART_C.total)}) at the same moment`);
  const captures: Capture[] = [captureA];
  const settled = await Promise.allSettled([captureCart(auth.id, CART_B), captureCart(auth.id, CART_C)]);
  for (const [i, c] of [CART_B, CART_C].entries()) {
    const result = settled[i];
    if (result?.status === 'fulfilled') {
      checkCapture(`Concurrent capture ${c.store}`, result.value, c.total);
      captures.push(result.value);
      continue;
    }
    record(`Concurrent capture ${c.store}`, 'WARN', `rejected: ${describe(result?.reason)}. Retrying serially.`);
    await sleep(2000);
    const retried = await captureCart(auth.id, c);
    checkCapture(`Serial retry ${c.store}`, retried, c.total);
    captures.push(retried);
  }

  step('5. Re-read every capture and the authorization from PayPal (a 201 alone is not proof)');
  let capturedMinor = 0;
  for (const c of captures) {
    const fresh = await paypal.getCapture(c.id);
    const breakdown = fresh.seller_receivable_breakdown;
    record(
      `Capture ${fresh.id} settled`,
      fresh.status === 'COMPLETED' ? 'PASS' : 'FAIL',
      `status=${fresh.status}${reason(fresh)} gross=${fresh.amount.value} fee=${breakdown?.paypal_fee?.value ?? 'n/a'} net=${breakdown?.net_amount?.value ?? 'n/a'}`,
    );
    capturedMinor += toMinor(fresh.amount.value);
  }
  const afterCaptures = await paypal.getAuthorization(auth.id);
  record('Authorization after partial captures', afterCaptures.status === 'PARTIALLY_CAPTURED' ? 'PASS' : 'FAIL', `status=${afterCaptures.status}`);
  const orderNow = await paypal.getOrder(order.id);
  const listed = orderNow.purchase_units?.[0]?.payments?.captures ?? [];
  record('Order lists exactly our captures', listed.length === captures.length ? 'PASS' : 'FAIL', `${listed.length} on the order, expected ${captures.length}`);
  const remaining = BUDGET - capturedMinor;
  record('Remaining hold', 'INFO', `${fromMinor(capturedMinor)} captured, ${fromMinor(remaining)} of ${fromMinor(BUDGET)} left`);

  let holdExhausted = false;
  if (!flags['skip-overcapture']) {
    const over = remaining + toMinor('12.00');
    step(`6. Try to capture ${fromMinor(over)}, which is 12.00 more than the hold has left`);
    try {
      const accepted = await capture(auth.id, 'overcapture', { amount: money(over), finalCapture: false });
      holdExhausted = true;
      record(
        'Hold is a hard ceiling',
        'WARN',
        `PayPal ACCEPTED ${accepted.amount.value} (status ${accepted.status}). Over-capture is allowed on this account, so the checker alone enforces the cap.`,
      );
    } catch (error) {
      if (!(error instanceof PayPalApiError) || error.status !== 422) throw error;
      record('Hold is a hard ceiling', 'PASS', `rejected: ${describe(error)}`);
    }
  }

  if (holdExhausted) {
    step('7. Release the rest of the hold: skipped, the over-capture consumed it');
    openAuthorizationId = undefined;
  } else if (flags.finish === 'void') {
    step('7. Void the rest of the hold');
    try {
      const voided = await paypal.voidAuthorization(auth.id, `${runId}-void`);
      // PayPal may answer 204 with no body; re-read rather than assume.
      const after = voided ?? (await paypal.getAuthorization(auth.id));
      record('Void after partial captures', after.status === 'VOIDED' ? 'PASS' : 'FAIL', `status=${after.status}`);
    } catch (error) {
      if (!(error instanceof PayPalApiError)) throw error;
      record('Void after partial captures', 'FAIL', `${describe(error)}. Try: npm run spike:paypal -- --finish=final`);
    }
    openAuthorizationId = undefined;
  } else {
    step('7. Release the rest with a last 1.00 capture marked final_capture=true');
    const last = await capture(auth.id, 'final', { amount: money(100), finalCapture: true });
    openAuthorizationId = undefined;
    checkCapture('Final capture', last, 100);
    const after = await paypal.getAuthorization(auth.id);
    record('Authorization after final capture', after.status === 'CAPTURED' ? 'PASS' : 'FAIL', `status=${after.status}`);
    try {
      await capture(auth.id, 'after-final', { amount: money(100), finalCapture: false });
      record('No captures after final', 'FAIL', 'PayPal accepted another capture after final_capture=true');
    } catch (error) {
      if (!(error instanceof PayPalApiError)) throw error;
      record('No captures after final', 'PASS', `rejected: ${describe(error)}`);
    }
  }

  if (flags.refund) {
    step(`8. Refund 100.00 of capture #1 (a returned item)`);
    const refund = await paypal.refundCapture(captureA.id, money(toMinor('100.00')), `${runId}-refund`, 'Spike: returned item');
    record('Partial refund', refund.status === 'COMPLETED' ? 'PASS' : 'FAIL', `${refund.id} ${refund.amount.value} status=${refund.status}${reason(refund)}`);
    const refunded = await paypal.getCapture(captureA.id);
    record('Capture after refund', refunded.status === 'PARTIALLY_REFUNDED' ? 'PASS' : 'FAIL', `status=${refunded.status}`);
  }
}

function report() {
  console.log('\nSummary');
  for (const f of findings) console.log(`  ${f.outcome.padEnd(4)}  ${f.check}`);
  const hints = [...seenCodes].filter((code) => HINTS[code]);
  if (hints.length) {
    console.log('\nWhat the codes mean for the design');
    for (const code of hints) console.log(`  ${code}: ${HINTS[code]}`);
  }
  const dir = resolve(import.meta.dirname, '../../../spike-logs');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${runId}.json`);
  writeFileSync(file, JSON.stringify({ runId, currency, flags, findings, exchanges }, null, 2));
  console.log(`\nFull request/response log (with PayPal debug IDs): ${file}`);
}

try {
  await run();
} catch (error) {
  console.error(`\nSpike stopped: ${describe(error)}`);
  process.exitCode = 1;
  if (openAuthorizationId) {
    console.error(`Releasing hold ${openAuthorizationId} so it doesn't linger...`);
    await paypal
      .voidAuthorization(openAuthorizationId, `${runId}-cleanup-void`)
      .then(() => console.error('  voided'))
      .catch((voidError: unknown) => console.error(`  void failed: ${describe(voidError)}`));
  }
} finally {
  report();
}
