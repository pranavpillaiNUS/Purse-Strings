// Read-only dashboard client. It asks the local server for state and draws it.
// Every value is written as text through textContent or a text node, never parsed
// as markup, because store listings and model output are data.
'use strict';

(() => {
  const POLL_MS = 1500;
  const HOUR_MS = 3_600_000;
  const app = document.getElementById('app');
  const badges = document.getElementById('badges');
  const updated = document.getElementById('updated');

  /** Builds an element. Props come from this file only; children become text. */
  function h(tag, props, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') element.className = value;
      else element.setAttribute(key, String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  /** S$7,510.10 from integer cents, as text, so no float touches money. */
  function money(minor, currency = 'SGD') {
    const sign = minor < 0 ? '-' : '';
    const digits = String(Math.abs(minor)).padStart(3, '0');
    const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',');
    return `${sign}${currency === 'SGD' ? 'S$' : `${currency} `}${whole}.${digits.slice(-2)}`;
  }

  function dateTime(iso) {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function date(iso) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function time(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function chip(text, tone, plain) {
    return h('span', { class: `chip${tone ? ` tone-${tone}` : ''}${plain ? ' plain' : ''}` }, text);
  }

  function percent(part, whole) {
    if (!whole || whole <= 0) return 0;
    return Math.max(0, Math.min(100, (part / whole) * 100));
  }

  function segment(className, width) {
    const element = h('span', { class: className });
    element.style.width = `${width}%`;
    return element;
  }

  const PROVIDER = {
    fake: { name: 'Fake provider', payment: 'Fake payment', tone: null },
    'paypal-sandbox': { name: 'PayPal sandbox', payment: 'PayPal sandbox payment', tone: 'accent' },
  };

  function provider(value) {
    return PROVIDER[value] ?? { name: 'Not recorded', payment: 'Payment', tone: 'warn' };
  }

  const OPERATION_STATUS = {
    reserved: ['Reserved', 'info'],
    running: ['Running', 'info'],
    reconciliation_required: ['Needs reconciliation', 'warn'],
    ordered: ['Ordered (simulated supplier)', 'good'],
    failed: ['Failed', 'bad'],
    compensation_pending: ['Refund pending', 'warn'],
    compensated: ['Refunded', null],
  };

  const EFFECT = {
    not_started: ['Not started', null],
    intent: ['Intent recorded', 'info'],
    in_flight: ['In flight', 'info'],
    unknown: ['Unknown: reconcile', 'warn'],
    succeeded: ['Succeeded', 'good'],
    rejected: ['Rejected', 'bad'],
  };

  const RESERVATION = {
    active: ['Held', 'info'],
    consumed: ['Consumed', 'good'],
    released: ['Released', null],
  };

  function lookup(table, key) {
    const found = table[key];
    return found ? chip(found[0], found[1]) : chip(String(key), 'warn');
  }

  function eventText(kind, operation) {
    const payment = provider(operation.paymentProvider).payment;
    const words = {
      operation_reserved: 'Budget and units reserved by the checker',
      payment_provider_selected: 'Payment route fixed for this operation',
      binding_created: 'PayPal sandbox order created; waiting for the buyer',
      binding_upgraded: 'Buyer approved; sandbox authorization held',
      capture_gate_failed: 'Checks failed at execution; nothing was captured',
      capture_succeeded: `${payment} captured`,
      capture_rejected: `${payment} rejected`,
      order_succeeded: 'Supplier order placed (simulated)',
      order_rejected: 'Supplier order rejected (simulated)',
      refund_succeeded: 'Refund completed',
      refund_rejected: 'Refund rejected',
      reconciliation_required: 'Outcome unknown; the operator must reconcile',
      compensation_pending: 'Refund pending',
    };
    return words[kind] ?? null;
  }

  function card(title, source, ...body) {
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, title), source ? h('span', { class: 'source' }, source) : null),
      ...body);
  }

  function renderBadges(state) {
    const items = [chip('Simulation', 'warn'), chip('Read-only', null)];
    if (state.demo) {
      items.push(chip(state.demo.mode === 'live' ? 'Live Claude' : 'Scripted stand-in', 'info'));
      items.push(chip(state.demo.paymentProvider === 'paypal-sandbox' ? 'PayPal sandbox' : 'Fake payment', state.demo.paymentProvider === 'paypal-sandbox' ? 'accent' : null));
    }
    items.push(chip(`Following ${state.source.label}`, null, true));
    badges.replaceChildren(...items);
  }

  function renderStory(demo) {
    const current = demo.finished ? demo.scenes.length + 1 : demo.scene;
    const steps = demo.scenes.map((title, index) => {
      const number = index + 1;
      const kind = number < current ? 'done' : number === current ? 'current' : '';
      return h('li', { class: `step ${kind}`, 'aria-current': kind === 'current' ? 'step' : null },
        h('span', { class: 'num' }, kind === 'done' ? `Scene ${number} ✓` : `Scene ${number}`), title);
    });
    let status;
    if (demo.failure) status = [chip('Stopped', 'bad'), demo.failure];
    else if (demo.finished) status = [chip('Finished', 'good'), 'Every scene ran.'];
    else if (demo.waiting === 'sandbox-buyer') status = [chip('Waiting', 'warn'), "The sandbox buyer approves the hold on PayPal's page, then the operator presses Enter."];
    else if (demo.waiting === 'operator-confirm') status = [chip('Waiting', 'warn'), 'The operator confirms this exact digest in the terminal.'];
    else if (demo.waiting === 'next-scene') status = [chip('Paused', 'info'), 'Press Enter in the terminal for the next scene.'];
    else if (demo.scene === 0) status = [chip('Starting', 'info'), 'Setting up the stores.'];
    else status = [chip('Running', 'info'), `Scene ${demo.scene} of ${demo.scenes.length}: ${demo.scenes[demo.scene - 1] ?? ''}`];
    return h('section', { class: 'card story span-12' },
      h('ol', { class: 'steps' }, steps),
      h('div', { class: 'status-line', 'aria-live': 'polite' }, status));
  }

  function renderBudget(state) {
    const ledger = state.ledger;
    if (!ledger) {
      // Only the server knows why the ledger is absent. Anything other than "not
      // asked yet" or the backend's exact refusal means reservations are unknown.
      const message = state.ledgerStatus === 'no-mandate' || state.ledgerStatus === 'unconfirmed'
        ? 'Shown once a person confirms the mandate. Until then nothing can be reserved.'
        : 'Budget and allocated units are unavailable. The ledger read did not succeed, so current reservations are unknown.';
      return card('Budget', 'from the ledger',
        h('p', { class: 'placeholder' }, message));
    }
    const { totalMinor, committedMinor, reservedMinor, remainingMinor } = ledger.budget;
    const roles = new Map((state.mandate?.requirements ?? []).map((item) => [item.id, item.role]));
    const units = ledger.requirements.map((item) => {
      const allocated = item.committedUnits + item.reservedUnits;
      return h('div', { class: 'unit-row' },
        h('div', { class: 'top' },
          h('span', null, roles.get(item.requirementId) ?? item.requirementId),
          h('span', null, `${allocated} of ${item.required} units${item.reservedUnits > 0 ? ` (${item.reservedUnits} reserved)` : ''}`)),
        h('div', { class: 'bar thin' },
          segment('seg-committed', percent(item.committedUnits, item.required)),
          segment('seg-reserved', percent(item.reservedUnits, item.required))));
    });
    return card('Budget', 'from the ledger',
      h('div', { class: 'big' }, money(remainingMinor)),
      h('div', { class: 'big-sub' }, `remaining of ${money(totalMinor)} all-in`),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${money(committedMinor)} committed, ${money(reservedMinor)} reserved, ${money(remainingMinor)} remaining` },
        segment('seg-committed', percent(committedMinor, totalMinor)),
        segment('seg-reserved', percent(reservedMinor, totalMinor))),
      h('div', { class: 'legend' },
        h('div', null, h('div', { class: 'k' }, h('span', { class: 'swatch committed' }), 'Committed'), h('div', { class: 'v' }, money(committedMinor))),
        h('div', null, h('div', { class: 'k' }, h('span', { class: 'swatch reserved' }), 'Reserved'), h('div', { class: 'v' }, money(reservedMinor))),
        h('div', null, h('div', { class: 'k' }, h('span', { class: 'swatch remaining' }), 'Remaining'), h('div', { class: 'v' }, money(remainingMinor)))),
      h('div', { class: 'units' }, units));
  }

  function renderMandate(state) {
    const mandate = state.mandate;
    if (!mandate) {
      return card('Mandate', null, h('p', { class: 'placeholder' }, 'Appears once a drafted mandate is stored for confirmation.'));
    }
    const confirmed = mandate.confirmationStatus === 'confirmed'
      ? chip(mandate.confirmedAt ? `Confirmed ${dateTime(mandate.confirmedAt)}` : 'Confirmed by the ledger', 'good')
      : mandate.confirmationStatus === 'unconfirmed'
        ? chip('Not confirmed: the shopper is refused', 'warn')
        : chip('Confirmation unknown: the ledger could not verify it', 'warn');
    const rows = mandate.requirements.map((item) => h('tr', null,
      h('td', null, item.role),
      h('td', { class: 'num' }, String(item.quantity)),
      h('td', { class: 'mono' }, item.allowedSkus.join(', ')),
      h('td', { class: 'num' }, money(item.maxUnitPriceMinor, mandate.currency)),
      h('td', { class: 'num' }, `${item.minWarrantyMonths} mo`)));
    return card('Mandate', 'the stored revision',
      h('div', { class: 'card-head' }, h('span', { class: 'mono' }, `${mandate.id} · revision ${mandate.revision}`), confirmed),
      h('dl', { class: 'kv' },
        h('dt', null, 'Budget'), h('dd', null, `${money(mandate.budgetMinor, mandate.currency)} all-in, including shipping and GST`),
        h('dt', null, 'Buy by'), h('dd', null, date(mandate.purchaseBy)),
        h('dt', null, 'Ready by'), h('dd', null, dateTime(mandate.readyBy)),
        h('dt', null, 'Deliver to'), h('dd', null, mandate.deliveryLocationId),
        h('dt', null, 'Suppliers'), h('dd', null, mandate.allowedSuppliers.join(', ')),
        h('dt', null, 'Digest'), h('dd', { class: 'mono', title: mandate.digest }, `${mandate.digest.slice(0, 16)}…`)),
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Role'), h('th', { class: 'num' }, 'Units'), h('th', null, 'Approved SKUs'), h('th', { class: 'num' }, 'Unit cap'), h('th', { class: 'num' }, 'Warranty'))),
          h('tbody', null, rows))));
  }

  function renderOperation(operation) {
    const route = provider(operation.paymentProvider);
    const [statusText, statusTone] = OPERATION_STATUS[operation.status] ?? [operation.status, 'warn'];
    const ids = operation.providerIds ?? {};
    const idItems = [['Order', ids.orderId], ['Authorization', ids.authorizationId], ['Capture', ids.captureId], ['Refund', ids.refundId]]
      .filter(([, value]) => value)
      .map(([label, value]) => h('span', null, `${label} `, h('span', { class: 'mono' }, value)));
    const events = operation.events.map((event) => {
      const words = eventText(event.kind, operation);
      return h('li', null, h('time', { datetime: event.createdAt }, time(event.createdAt)),
        words ?? event.kind, words ? null : h('span', { class: 'raw' }, '(unrecognized event)'));
    });
    return h('article', { class: 'op' },
      h('div', { class: 'op-head' },
        h('span', { class: 'op-title' }, `${operation.supplierId} · ${operation.cartId}`),
        chip(statusText, statusTone),
        h('span', { class: 'op-amount' }, money(operation.totalMinor, operation.currency), ' ', h('small', null, "checker's total"))),
      h('div', { class: 'op-id mono' }, operation.id),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('div', { class: 'label' }, 'Reservation'), lookup(RESERVATION, operation.reservationStatus)),
        h('div', { class: 'fact' }, h('div', { class: 'label' }, 'Payment route'), chip(route.name, route.tone)),
        h('div', { class: 'fact' }, h('div', { class: 'label' }, route.payment), lookup(EFFECT, operation.paymentStatus)),
        h('div', { class: 'fact' }, h('div', { class: 'label' }, 'Supplier order (simulated)'), lookup(EFFECT, operation.orderStatus)),
        h('div', { class: 'fact' }, h('div', { class: 'label' }, 'Refund'), lookup(EFFECT, operation.refundStatus)),
        h('div', { class: 'fact' }, h('div', { class: 'label' }, 'Readiness'), chip('Not assessed', null))),
      idItems.length > 0
        ? h('div', { class: 'ids' }, h('div', { class: 'label' }, 'PayPal sandbox IDs, to match on the sandbox Activity page'), h('div', { class: 'ids-list' }, idItems))
        : null,
      events.length > 0 ? h('ol', { class: 'timeline', 'aria-label': 'Audit trail' }, events) : null);
  }

  function renderOperations(state) {
    const body = state.operations.length > 0
      ? state.operations.map(renderOperation)
      : [h('p', { class: 'placeholder' }, state.requestedOperationIds.length > 0 || (state.source.kind === 'demo' && state.demo === null)
        ? 'Operation details are unavailable. Read failures are listed above.'
        : state.demo
          ? 'None yet. The shopper proposes carts; only the checker reserves, and only the operator runs.'
          : 'No operation IDs were given. Pass the IDs the shopper printed with --operation.')];
    return h('div', { class: 'span-12' }, card('Operations', 'backend status and audit', ...body));
  }

  function renderStores(state) {
    if (state.stores.length === 0) return null;
    const stores = state.stores;
    const limit = state.mandate?.evidenceMaxAgeHours ?? null;
    const skus = [...new Set(stores.flatMap((store) => store.products.map((product) => product.sku)))].sort();
    const row = (label, cells) => h('tr', null, h('td', { class: 'row-label' }, label), cells);
    const now = Date.now();
    const recordCells = stores.map((store) => {
      const ageMs = now - Date.parse(store.oldestRecordAt);
      const future = Date.parse(store.newestRecordAt) > now;
      const stale = limit !== null && ageMs > limit * HOUR_MS;
      const age = Math.floor(Math.max(0, ageMs) / HOUR_MS);
      const description = [
        ageMs >= 0 ? `${age} h old${stale ? `, past the ${limit} h policy limit` : ''}` : null,
        future ? 'Future-dated record: not valid evidence' : null,
      ].filter(Boolean).join('; ');
      return h('td', { class: stale || future ? 'stale' : null }, description, h('br'), store.recordStatuses.join(' / '));
    });
    return h('div', { class: 'span-7' }, card('Stores', 'the control panel (synthetic)',
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, ''), stores.map((store) => h('th', null, store.supplierId)))),
        h('tbody', null,
          row('Shipping', stores.map((store) => h('td', null, money(store.shippingMinor)))),
          row('Delivery by', stores.map((store) => h('td', null, date(store.deliveryBy)))),
          row('Oldest record', recordCells),
          skus.map((sku) => row(h('span', { class: 'mono' }, sku), stores.map((store) => {
            const product = store.products.find((item) => item.sku === sku);
            return h('td', null, product ? `${money(product.unitPriceMinor)} · ${product.availableUnits} in stock` : '–');
          }))))))));
  }

  function renderResults(state) {
    if (!state.demo) return null;
    const items = state.demo.results;
    return h('div', { class: state.stores.length > 0 ? 'span-5' : 'span-12' }, card('What the run showed', 'from demo:flow',
      items.length > 0
        ? h('ul', { class: 'results' }, items.map((item) => h('li', null, item)))
        : h('p', { class: 'placeholder' }, 'Each scene adds its result here as it finishes.')));
  }

  function renderEmpty(state) {
    return h('section', { class: 'empty-state' },
      h('h1', null, 'Waiting for the demo'),
      ...state.notices.map((notice) => h('p', null, notice)),
      h('p', null, 'In another terminal, run ', h('code', null, 'npm run demo:flow -- --pause'), '. This page follows it.'));
  }

  function render(state) {
    renderBadges(state);
    updated.textContent = `Updated ${time(state.generatedAt)}`;
    updated.classList.remove('lost');
    // Only a demo that has not started yet is empty; a followed backend always has a mandate to show.
    if (state.source.kind === 'demo' && state.demo === null && state.problems.length === 0) {
      app.replaceChildren(renderEmpty(state));
      return;
    }
    const parts = [];
    if (state.problems.length > 0) {
      parts.push(h('div', { class: 'banner bad', role: 'alert' }, 'A read command failed, so part of this page may be missing:',
        h('ul', null, state.problems.map((problem) => h('li', null, problem)))));
    }
    if (state.demo) parts.push(h('div', { class: 'grid' }, renderStory(state.demo)));
    for (const notice of state.notices) parts.push(h('div', { class: 'banner info' }, notice));
    parts.push(h('div', { class: 'grid' },
      h('div', { class: 'span-5' }, renderBudget(state)),
      h('div', { class: 'span-7' }, renderMandate(state))));
    parts.push(h('div', { class: 'grid' }, renderOperations(state)));
    const lower = [renderStores(state), renderResults(state)].filter(Boolean);
    if (lower.length > 0) parts.push(h('div', { class: 'grid' }, lower));
    app.replaceChildren(...parts);
  }

  async function poll() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Evidence can cross its age limit while the stored state stays unchanged.
      render(JSON.parse(await response.text()));
    } catch {
      updated.textContent = 'Connection lost, retrying…';
      updated.classList.add('lost');
    } finally {
      setTimeout(poll, POLL_MS);
    }
  }

  poll();
})();
