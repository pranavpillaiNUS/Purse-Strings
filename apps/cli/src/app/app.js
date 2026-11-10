'use strict';
// The local app page. It renders only what the server reports and sends three fixed
// actions. Every value from the server is placed with textContent or a known
// attribute; nothing is parsed as HTML.

const ui = {
  form: { shopper: 'scripted', payment: 'fake', request: '' },
  showForm: false,
  error: '',
  busy: false,
  stampedDigest: null,
};

const actions = {
  start: () => {},
  continue: () => {},
  stop: () => {},
  newRun: () => {},
  rerender: () => {},
};

const STEP_BUTTON = { 'next-scene': 'Next scene', 'operator-confirm': 'Confirm this mandate', 'sandbox-buyer': 'Buyer has approved' };
const STEP_STATUS = {
  'next-scene': 'Waiting for you: next scene',
  'operator-confirm': 'Waiting for you to confirm',
  'sandbox-buyer': 'Waiting for the PayPal sandbox buyer',
};
const ACTOR = { you: 'You', claude: 'Claude', 'stand-in': 'Scripted stand-in', checker: 'Checker', system: 'System' };

function el(tag, options, children) {
  const node = document.createElement(tag);
  const o = options || {};
  if (o.className) node.className = o.className;
  if (o.text !== undefined) node.textContent = String(o.text);
  if (o.attrs) for (const name of Object.keys(o.attrs)) node.setAttribute(name, String(o.attrs[name]));
  // CSSOM, not a style attribute: the page's Content-Security-Policy blocks inline styles.
  if (o.style && node.style) for (const name of Object.keys(o.style)) node.style[name] = o.style[name];
  for (const child of children || []) if (child) node.appendChild(child);
  return node;
}

function money(minor) {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return 'unknown';
  const negative = minor < 0;
  const digits = String(Math.abs(Math.trunc(minor))).padStart(3, '0');
  const dollars = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',');
  return `${negative ? '-' : ''}S$${dollars}.${digits.slice(-2)}`;
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  return date.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The buyer signs in to PayPal here, so only the gateway's own sandbox consent hosts are linked. */
function safeLink(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname;
  const sandbox = host === 'www.sandbox.paypal.com' || host.endsWith('.sandbox.paypal.com');
  return parsed.protocol === 'https:' && sandbox ? url : null;
}

function shopperOf(state) {
  const input = state.take && state.take.input;
  if (input) return input.shopper === 'claude' ? 'Claude' : 'scripted stand-in';
  const mode = state.dashboard && state.dashboard.demo && state.dashboard.demo.mode;
  if (mode) return mode === 'live' ? 'Claude' : 'scripted stand-in';
  return ui.form.shopper === 'claude' ? 'Claude' : 'scripted stand-in';
}

function paymentOf(state) {
  const input = state.take && state.take.input;
  const provider = input ? input.payment : state.dashboard && state.dashboard.demo ? state.dashboard.demo.paymentProvider : ui.form.payment;
  return provider === 'paypal-sandbox' ? 'PayPal sandbox' : 'fake';
}

/** 0 finished cleanly, 2 finished but unusable, null otherwise. A take found on disk has no exit code, so its session decides. */
function outcomeOf(state) {
  const take = state.take;
  const demo = state.dashboard && state.dashboard.demo;
  if (take.exitCode === 0 || take.exitCode === 2) return take.exitCode;
  if (take.exitCode === null && demo && demo.finished && !demo.failure) return demo.unusable && demo.unusable.length > 0 ? 2 : 0;
  return null;
}

function runStatus(state) {
  const take = state.take;
  if (!take) return { text: 'No run yet', tone: '' };
  if (take.status === 'interrupted') return { text: 'Interrupted', tone: 'refused' };
  if (take.status === 'ended') {
    const demo = state.dashboard && state.dashboard.demo;
    const outcome = outcomeOf(state);
    if (outcome === 0) return { text: 'Finished', tone: 'accepted' };
    if (outcome === 2) return { text: 'Finished, not usable for the video', tone: 'waiting' };
    if (demo && demo.failure) return { text: 'Stopped by a failure', tone: 'refused' };
    return { text: 'Stopped', tone: 'refused' };
  }
  if (take.awaiting) return { text: atResult(state) ? 'Waiting for you: the result' : STEP_STATUS[take.awaiting], tone: 'waiting' };
  return { text: 'Running', tone: '' };
}

/** The flow's last wait comes after scene 6, before its result, so "next scene" would mislead. */
function atResult(state) {
  const demo = state.dashboard && state.dashboard.demo;
  return state.take.awaiting === 'next-scene' && Boolean(demo) && demo.scene >= demo.scenes.length;
}

function statusLine(state) {
  const status = runStatus(state);
  return el('header', { className: 'status' }, [
    el('span', { className: 'brand', text: 'Purse Strings' }),
    el('span', { className: 'fact' }, [document.createTextNode('Shopper: '), el('strong', { text: shopperOf(state) })]),
    el('span', { className: 'fact' }, [document.createTextNode('Payment: '), el('strong', { text: paymentOf(state) })]),
    el('span', { className: `pill ${status.tone}`, text: status.text }),
  ]);
}

function rows(pairs) {
  const list = el('dl');
  for (const [term, value] of pairs) {
    list.appendChild(el('dt', { text: term }));
    list.appendChild(el('dd', { text: value }));
  }
  return list;
}

function policySheet(policy) {
  if (!policy || typeof policy !== 'object') return el('section', { className: 'sheet' }, [el('p', { className: 'note', text: 'The policy file could not be read.' })]);
  const sheet = el('section', { className: 'sheet' }, [el('h3', { text: `Company policy, version ${policy.version}` })]);
  sheet.appendChild(rows([
    ['Budget cap', money(policy.maxBudgetMinor)],
    ['Suppliers', Array.isArray(policy.allowedSuppliers) ? policy.allowedSuppliers.join(', ') : 'unknown'],
    ['Record age limit', `${policy.evidenceMaxAgeHours} hours`],
  ]));
  const roles = policy.roles && typeof policy.roles === 'object' ? policy.roles : {};
  for (const role of Object.keys(roles)) {
    const rule = roles[role];
    sheet.appendChild(el('h3', { text: role === 'laptop' ? 'Laptops' : role === 'monitor' ? 'Monitors' : role, className: 'role' }));
    sheet.appendChild(rows([
      ['Approved models', Array.isArray(rule.allowedSkus) ? rule.allowedSkus.join(', ') : 'unknown'],
      ['Price cap each', money(rule.maxUnitPriceMinor)],
      ['Warranty at least', `${rule.minWarrantyMonths} months`],
      ['At most', `${rule.maxUnits} units`],
    ]));
  }
  return sheet;
}

function mandateSheet(state) {
  const dashboard = state.dashboard;
  const mandate = dashboard && dashboard.mandate;
  if (!mandate) {
    return el('section', { className: 'sheet mandate' }, [
      el('h3', { text: 'Mandate' }),
      el('p', { className: 'note', text: 'Appears once the request is drafted and stored. A draft cannot buy anything.' }),
    ]);
  }
  const sheet = el('section', { className: 'sheet mandate' }, [el('h3', { text: `Mandate ${mandate.id}, revision ${mandate.revision}` })]);
  const pairs = [
    ['Budget', money(mandate.budgetMinor)],
    ['Buy by', when(mandate.purchaseBy)],
    ['Ready by', when(mandate.readyBy)],
  ];
  for (const requirement of mandate.requirements || []) pairs.push([`${requirement.quantity} × ${requirement.role}`, (requirement.allowedSkus || []).join(', ')]);
  sheet.appendChild(rows(pairs));
  if (mandate.confirmationStatus === 'confirmed') {
    const fresh = ui.stampedDigest !== mandate.digest;
    ui.stampedDigest = mandate.digest;
    sheet.appendChild(el('div', { className: fresh ? 'stamp new' : 'stamp', attrs: { role: 'img', 'aria-label': 'Confirmed by a person on this computer' } }, [
      el('strong', { text: 'Confirmed' }),
      el('span', { text: 'on this computer' }),
      el('span', { text: mandate.confirmedAt ? when(mandate.confirmedAt) : '' }),
      el('span', { className: 'mono', text: `digest ${String(mandate.digest).slice(0, 12)}` }),
    ]));
  } else {
    sheet.appendChild(el('p', { className: 'unconfirmed', text: mandate.confirmationStatus === 'unknown' ? 'Confirmation unknown' : 'Not confirmed' }));
  }
  return sheet;
}

function storesSheet(state) {
  const stores = (state.dashboard && state.dashboard.stores) || [];
  const sheet = el('section', { className: 'sheet' }, [el('h3', { text: 'Test suppliers' })]);
  for (const store of stores) {
    sheet.appendChild(rows([
      [store.supplierId, `shipping ${money(store.shippingMinor)}`],
      ['Oldest record', when(store.oldestRecordAt)],
    ]));
  }
  sheet.appendChild(el('p', { className: 'note', text: 'Two test suppliers we control, so the demo can show a rejection and a recovery on cue.' }));
  return sheet;
}

function filesPanel(state, files) {
  return el('aside', { className: 'panel files', attrs: { 'aria-label': 'Company files' } }, [
    el('h2', { text: 'Company files' }),
    policySheet(files && files.policy),
    mandateSheet(state),
    storesSheet(state),
  ]);
}

function ledgerPanel(state) {
  const panel = el('aside', { className: 'panel ledger', attrs: { 'aria-label': 'Budget and operations' } }, [el('h2', { text: 'Budget' })]);
  const dashboard = state.dashboard;
  const ledger = dashboard && dashboard.ledger;
  const budget = el('section', { className: 'sheet' });
  if (ledger) {
    const { totalMinor, committedMinor, reservedMinor, remainingMinor } = ledger.budget;
    const share = (part) => (totalMinor > 0 ? `${Math.max(0, Math.min(100, (part / totalMinor) * 100)).toFixed(2)}%` : '0%');
    budget.appendChild(el('p', { className: 'big-number', text: money(remainingMinor) }));
    budget.appendChild(el('p', { className: 'note', text: `left of ${money(totalMinor)}` }));
    budget.appendChild(el('div', { className: 'bar', attrs: { role: 'img', 'aria-label': `${money(committedMinor)} committed, ${money(reservedMinor)} reserved` } }, [
      el('span', { className: 'committed', style: { width: share(committedMinor) } }),
      el('span', { className: 'reserved', style: { width: share(reservedMinor) } }),
    ]));
    budget.appendChild(rows([['Committed', money(committedMinor)], ['Reserved, not paid', money(reservedMinor)]]));
  } else {
    budget.appendChild(el('p', { className: 'note', text: dashboard && dashboard.ledgerStatus === 'unavailable'
      ? 'The ledger could not be read, so reservations are unknown.'
      : 'Budget appears once a person confirms the mandate.' }));
  }
  panel.appendChild(budget);

  const operations = (dashboard && dashboard.operations) || [];
  if (operations.length > 0) {
    const sheet = el('section', { className: 'sheet' }, [el('h3', { text: 'Operations' })]);
    for (const operation of operations) {
      const ids = operation.providerIds || {};
      const pairs = [
        ['Supplier', operation.supplierId],
        ['Amount', money(operation.totalMinor)],
        ['Status', operation.status],
        ['Payment', operation.paymentProvider === 'paypal-sandbox' ? `PayPal sandbox, ${operation.paymentStatus}` : `fake, ${operation.paymentStatus}`],
        ['Supplier order', `simulated, ${operation.orderStatus}`],
        ['Readiness', 'not assessed'],
      ];
      const block = el('div', { className: 'op' }, [el('p', { className: 'mono', text: operation.id }), rows(pairs)]);
      for (const [label, value] of [['PayPal order', ids.orderId], ['Authorization', ids.authorizationId], ['Capture', ids.captureId]]) {
        if (value) block.appendChild(el('p', { className: 'note' }, [document.createTextNode(`${label} `), el('span', { className: 'mono', text: value })]));
      }
      sheet.appendChild(block);
    }
    panel.appendChild(sheet);
  }
  const problems = (dashboard && dashboard.problems) || [];
  if (problems.length > 0) panel.appendChild(el('section', { className: 'sheet problems' }, problems.map((problem) => el('p', { text: problem }))));
  return panel;
}

function entryNode(entry) {
  // Scene breaks and the closing result are headings; their detail reads as narration.
  const scene = entry.actor === 'system' && (/^Scene \d+:/.test(entry.title) || entry.scene === null);
  const result = scene && entry.scene === null;
  const node = el('li', { className: `entry ${entry.actor} ${entry.tone}${scene ? ' scene' : ''}${result ? ' result' : ''}` }, [
    el('span', { className: 'who', text: scene ? '' : ACTOR[entry.actor] || entry.actor }),
    el('div', { className: 'what' }, [
      el('p', { className: 'title', text: entry.title }),
      entry.detail && entry.detail.length > 0 ? el('ul', {}, entry.detail.map((line) => el('li', { text: line }))) : null,
      // Untrusted text, such as a supplier listing: placed as text, styled as a quotation.
      entry.quote ? el('blockquote', { className: 'untrusted' }, [
        el('p', { className: 'quote-label', text: entry.quote.label }),
        el('p', { text: entry.quote.text }),
      ]) : null,
    ]),
  ]);
  return node;
}

function holdMayExist(state) {
  const operations = (state.dashboard && state.dashboard.operations) || [];
  return operations.some((operation) => operation.paymentProvider === 'paypal-sandbox' && operation.status !== 'ordered'
    && operation.providerIds && (operation.providerIds.orderId || operation.providerIds.authorizationId));
}

function button(label, onClick, secondary) {
  const node = el('button', { className: secondary ? 'secondary' : '', text: label, attrs: { type: 'button' } });
  node.disabled = ui.busy;
  node.addEventListener('click', onClick);
  return node;
}

function actionArea(state) {
  const take = state.take;
  const demo = state.dashboard && state.dashboard.demo;
  if (take.status === 'running') {
    if (!take.awaiting) return el('div', { className: 'action' }, [el('p', { text: 'Working. The next step appears here when the run needs you.' })]);
    const parts = [];
    if (take.awaiting === 'sandbox-buyer') {
      parts.push(el('p', { text: 'The sandbox buyer approves the hold on PayPal\'s own page. Press the button only after they approve; if you press early, the run tells you and asks again.' }));
    } else if (take.awaiting === 'operator-confirm') {
      parts.push(el('p', { text: 'You are the operator. Confirming binds this exact mandate revision; the shopper is refused until you do.' }));
    }
    const row = el('div', { className: 'buttons' });
    const link = take.awaiting === 'sandbox-buyer' ? safeLink(state.approvalUrl) : null;
    if (link) row.appendChild(el('a', { className: 'button-link', text: 'Open PayPal approval page', attrs: { href: link, target: '_blank', rel: 'noopener noreferrer' } }));
    row.appendChild(button(atResult(state) ? 'Show the result' : STEP_BUTTON[take.awaiting], () => actions.continue(take.awaiting)));
    row.appendChild(button('Stop run', () => actions.stop(), true));
    parts.push(row);
    if (ui.error) parts.push(el('p', { className: 'error', text: ui.error }));
    return el('div', { className: 'action' }, parts);
  }
  const parts = [];
  let tone = 'failed';
  if (take.status === 'interrupted') {
    parts.push(el('p', { text: 'This take was interrupted when the app stopped. Its folder is kept.' }));
  } else if (outcomeOf(state) === 0) {
    tone = 'done';
    parts.push(el('p', { text: 'Finished. Every scene showed what it should.' }));
  } else if (outcomeOf(state) === 2) {
    parts.push(el('p', { text: 'Finished, but this take isn\'t usable for the video:' }));
    parts.push(el('ul', {}, ((demo && demo.unusable) || []).map((reason) => el('li', { text: reason }))));
  } else if (demo && demo.failure) {
    parts.push(el('p', { text: demo.failure }));
  } else {
    parts.push(el('p', { text: 'The run stopped before it finished. Its folder is kept.' }));
  }
  if (holdMayExist(state)) {
    parts.push(el('p', { text: 'A PayPal hold may exist. It expires on its own; keep this take folder for status and operation-reconcile.' }));
  }
  parts.push(el('div', { className: 'buttons' }, [button('Start a new run', () => actions.newRun())]));
  return el('div', { className: `action ${tone}` }, parts);
}

function introduction() {
  return el('div', {}, [
    el('div', { className: 'intro' }, [
      el('p', { text: 'New hires need laptops and monitors before they start, within a budget. Claude does the comparison shopping, but it cannot spend.' }),
    ]),
    el('ul', { className: 'chain' }, [
      ['Claude proposes', 'carts from approved suppliers, with no price field and no payment tool.'],
      ['The checker decides', 'prices every cart itself and checks policy, evidence, deadlines and budget.'],
      ['A person confirms', 'the exact mandate before anything can be bought.'],
      ['The PayPal buyer approves', 'the hold on PayPal\'s own page, when PayPal sandbox is chosen.'],
    ].map(([who, what]) => el('li', {}, [el('b', { text: who }), el('span', { text: what })]))),
  ]);
}

function radio(name, value, label) {
  const input = el('input', { attrs: { type: 'radio', name, value, id: `${name}-${value}` } });
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = ui.form[name] === value;
  input.addEventListener('change', () => { ui.form[name] = value; ui.error = ''; actions.rerender(); });
  return el('label', { attrs: { for: `${name}-${value}` } }, [input, document.createTextNode(label)]);
}

function requestForm(state) {
  const scripted = ui.form.shopper === 'scripted';
  const box = el('textarea', { attrs: { id: 'request', maxlength: '1000', 'aria-describedby': 'request-note' } });
  box.readOnly = scripted;
  box.value = scripted ? state.demoRequest : ui.form.request || state.demoRequest;
  if (!scripted && !ui.form.request) ui.form.request = state.demoRequest;
  box.addEventListener('input', () => { ui.form.request = box.value; });
  const note = scripted
    ? 'The scripted stand-in always uses this request. Choose Claude to use your own words.'
    : 'Claude drafts from your words and spends API credit (about 30 cents). The later scenes are tuned to the demo request, so another request may be refused by policy or end not usable for the video.';
  const form = el('form', { className: 'request', attrs: { 'aria-label': 'Start a run' } }, [
    el('label', { className: 'big', text: 'The manager\'s request', attrs: { for: 'request' } }),
    box,
    el('p', { className: 'note', text: note, attrs: { id: 'request-note' } }),
    el('fieldset', {}, [el('legend', { text: 'Shopper' }), el('div', { className: 'choice' }, [radio('shopper', 'scripted', 'Scripted stand-in (free, no key)'), radio('shopper', 'claude', 'Claude')])]),
    el('fieldset', {}, [el('legend', { text: 'Payment' }), el('div', { className: 'choice' }, [radio('payment', 'fake', 'Fake provider'), radio('payment', 'paypal-sandbox', 'PayPal sandbox')])]),
    el('div', { className: 'buttons' }, [button('Start run', () => actions.start({
      request: scripted ? state.demoRequest : ui.form.request,
      shopper: ui.form.shopper,
      payment: ui.form.payment,
    }))]),
  ]);
  if (ui.error) form.appendChild(el('p', { className: 'error', text: ui.error }));
  return form;
}

function conversationPanel(state) {
  const panel = el('section', { className: 'conversation', attrs: { 'aria-label': 'Conversation' } });
  const take = state.take;
  if (!take || (ui.showForm && take.status !== 'running')) {
    panel.appendChild(introduction());
    panel.appendChild(requestForm(state));
    return panel;
  }
  panel.appendChild(el('ol', { className: 'log' }, (state.conversation || []).map(entryNode)));
  panel.appendChild(actionArea(state));
  const terminal = el('details', { className: 'terminal' }, [el('summary', { text: 'Terminal' }), el('pre', { text: (state.terminal || []).join('\n') })]);
  panel.appendChild(terminal);
  return panel;
}

function tabs() {
  return el('div', { className: 'tabs', attrs: { role: 'group', 'aria-label': 'Side panels' } }, [
    button('Company files', () => { if (typeof document.body !== 'undefined') document.body.classList.remove('tab-ledger'); }, true),
    button('Budget', () => { if (typeof document.body !== 'undefined') document.body.classList.add('tab-ledger'); }, true),
  ]);
}

function renderApp(state, files, root) {
  root.replaceChildren(
    statusLine(state),
    el('div', { className: 'layout' }, [filesPanel(state, files), conversationPanel(state), tabs(), ledgerPanel(state)]),
  );
}

globalThis.renderApp = renderApp;

if (typeof window !== 'undefined' && typeof fetch === 'function') {
  const root = document.getElementById('app');
  const tokenMeta = document.querySelector('meta[name="splittap-token"]');
  const token = tokenMeta ? tokenMeta.getAttribute('content') : '';
  let files = null;
  let state = null;
  let lastJson = '';

  const draw = () => { if (state) renderApp(state, files, root); };

  const post = async (path, body) => {
    ui.busy = true;
    ui.error = '';
    draw();
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Splittap-Token': token },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const reply = await response.json().catch(() => ({}));
        ui.error = typeof reply.error === 'string' ? reply.error : `The action failed (${response.status}).`;
        return false;
      }
      return true;
    } catch {
      ui.error = 'The app server did not answer. Check the terminal that runs npm run app.';
      return false;
    } finally {
      ui.busy = false;
      lastJson = '';
      await poll();
    }
  };

  actions.start = async (input) => { if (await post('/api/run', input)) ui.showForm = false; };
  actions.continue = (step) => post('/api/continue', { step });
  actions.stop = () => post('/api/stop', {});
  actions.newRun = () => { ui.showForm = true; ui.error = ''; draw(); };
  actions.rerender = draw;

  async function poll() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      // Redraw only when something changed, so typing in the request box is never interrupted.
      if (text !== lastJson) {
        lastJson = text;
        state = JSON.parse(text);
        draw();
      }
    } catch {
      ui.error = 'Connection to the app server lost. Is npm run app still running?';
      draw();
    }
  }

  fetch('/api/files', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((value) => { files = value; lastJson = ''; return poll(); });
  setInterval(() => { if (!ui.busy) poll(); }, 1000);
}
