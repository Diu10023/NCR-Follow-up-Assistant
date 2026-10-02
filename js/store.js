// Data layer. Two adapters: Google Sheets (via Apps Script web app) and a local demo store (browser only).
window.NCR = window.NCR || {};
(function (NCR) {
  const L = NCR.logic;
  const NCR_FIELDS = ['NCR_ID', 'NCR_No', 'Item_No', 'Batch_No', 'Supplier', 'Buyer', 'NCR_Date', 'Defect', 'Quantity',
    'Disposition', 'Next_Action', 'Owner', 'Waiting_For', 'Due_Date', 'Last_Followup', 'Followup_Count', 'Status',
    'Closed_Date', 'Aging', 'Remark', 'Created_At', 'Updated_At', 'Buyer_Remark', 'Buyer_Remark_Date', 'Last_Review'];
  const HIST_FIELDS = ['History_ID', 'NCR_ID', 'NCR_No', 'Date', 'Followup_No', 'Action', 'Waiting_For', 'Remark', 'Created_By', 'Created_At'];
  const TRACKED = [['Status', 'Status'], ['Disposition', 'Disposition'], ['Next_Action', 'Next Action'],
    ['Owner', 'Owner'], ['Waiting_For', 'Waiting For'], ['Due_Date', 'Due Date']];

  const CFG_KEY = 'ncr.api';
  const DATA_KEY = 'ncr.demo.data';

  function getApiConfig() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
  function setApiConfig(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

  // ---------- adapters ----------
  const LocalAdapter = {
    name: 'demo',
    async load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(DATA_KEY)); } catch (e) { /* ignore */ }
      if (!d) { d = demoData(); localStorage.setItem(DATA_KEY, JSON.stringify(d)); }
      return d;
    },
    async save(p) {
      const d = await this.load();
      applyPayload(d, p);
      localStorage.setItem(DATA_KEY, JSON.stringify(d));
    },
    async saveSettings(s) {
      const d = await this.load();
      d.settings = s;
      localStorage.setItem(DATA_KEY, JSON.stringify(d));
    },
    reset() { localStorage.removeItem(DATA_KEY); },
  };

  function applyPayload(d, p) {
    const del = new Set(p.deleteIds || []);
    const idx = new Map(d.ncrs.map((n, i) => [n.NCR_ID, i]));
    (p.ncrs || []).forEach((n) => { if (idx.has(n.NCR_ID)) d.ncrs[idx.get(n.NCR_ID)] = n; else { idx.set(n.NCR_ID, d.ncrs.length); d.ncrs.push(n); } });
    d.history = d.history.concat(p.history || []);
    if (del.size) { d.ncrs = d.ncrs.filter((n) => !del.has(n.NCR_ID)); d.history = d.history.filter((h) => !del.has(h.NCR_ID)); }
  }

  function SheetsAdapter(cfg) {
    async function call(method, body) {
      const url = cfg.url + (method === 'GET' ? (cfg.url.includes('?') ? '&' : '?') + 'action=load&key=' + encodeURIComponent(cfg.key || '') : '');
      // text/plain avoids a CORS preflight, which Apps Script cannot answer.
      const res = await fetch(url, method === 'GET' ? {} : { method: 'POST', body: JSON.stringify(Object.assign({ key: cfg.key || '' }, body)) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    }
    return {
      name: 'sheets',
      async load() { return call('GET'); },
      async save(p) { await call('POST', Object.assign({ action: 'save' }, p)); },
      async saveSettings(s) { await call('POST', { action: 'saveSettings', settings: s }); },
    };
  }

  // ---------- store ----------
  const state = { ncrs: [], history: [], settings: L.DEFAULT_SETTINGS, loaded: false, saving: 0, error: null, mode: 'demo', lastLoad: null };
  const listeners = [];
  let adapter = LocalAdapter;
  let chain = Promise.resolve();
  const emit = () => listeners.forEach((f) => f());

  function normalize(d) {
    state.ncrs = (d.ncrs || []).map((n) => {
      const r = {}; NCR_FIELDS.forEach((f) => { r[f] = n[f] == null ? '' : n[f]; });
      r.Followup_Count = Number(r.Followup_Count) || 0;
      r.Quantity = r.Quantity === '' ? '' : r.Quantity;
      return r;
    });
    state.history = (d.history || []).map((h) => { const r = {}; HIST_FIELDS.forEach((f) => { r[f] = h[f] == null ? '' : h[f]; }); return r; });
    state.settings = Object.assign({}, L.DEFAULT_SETTINGS, d.settings || {});
    state.loaded = true; state.lastLoad = Date.now();
  }

  async function init() {
    const cfg = getApiConfig();
    adapter = cfg.url ? SheetsAdapter(cfg) : LocalAdapter;
    state.mode = adapter.name;
    await reload();
  }
  async function reload() {
    try { normalize(await adapter.load()); state.error = null; } catch (e) { state.error = 'Cannot load data: ' + e.message; }
    emit();
  }
  function persist(fn) {
    state.saving++; emit();
    chain = chain.then(fn).then(() => { state.error = null; }).catch((e) => { state.error = 'Save failed: ' + e.message + ' — changes are only on this screen until saved.'; })
      .then(() => { state.saving--; emit(); });
    return chain;
  }

  const getNcr = (id) => state.ncrs.find((n) => n.NCR_ID === id);
  const historyFor = (id) => state.history.filter((h) => h.NCR_ID === id)
    .sort((a, b) => (a.Date + a.Created_At < b.Date + b.Created_At ? 1 : -1));
  function owners() {
    return [...new Set([...state.settings.owners, ...state.ncrs.map((n) => n.Owner)].filter(Boolean))].sort();
  }
  function buyers() { return [...new Set(state.ncrs.map((n) => n.Buyer).filter(Boolean))].sort(); }

  function stamp(n) {
    n.Aging = L.daysBetween(n.NCR_Date, n.Status === 'Closed' ? n.Closed_Date || L.todayISO() : L.todayISO());
    n.Updated_At = L.nowStamp();
  }
  function histRow(n, p) {
    return {
      History_ID: L.uid('H'), NCR_ID: n.NCR_ID, NCR_No: n.NCR_No, Date: p.date || L.todayISO(),
      Followup_No: p.followupNo || '', Action: p.action || '', Waiting_For: p.waiting || '', Remark: p.remark || '',
      Created_By: p.by || '', Created_At: L.nowStamp(),
    };
  }
  function commit(ncrs, history, extra) {
    const payload = Object.assign({ ncrs, history }, extra || {});
    return persist(() => adapter.save(payload));
  }

  // Create or update an NCR. opts.recordChanges writes a history line per tracked field change.
  function saveNcr(n, opts) {
    opts = opts || {};
    const old = getNcr(n.NCR_ID);
    const isNew = !old;
    n = Object.assign({}, n);
    if (isNew) { n.NCR_ID = n.NCR_ID || L.uid('NCR'); n.Created_At = L.nowStamp(); n.Followup_Count = Number(n.Followup_Count) || 0; n.Status = n.Status || 'Not Started'; }
    if (n.Status === 'Closed' && !n.Closed_Date) n.Closed_Date = L.todayISO();
    if (n.Status !== 'Closed') n.Closed_Date = '';
    stamp(n);
    const hist = [];
    if (isNew) hist.push(histRow(n, { action: 'NCR created' }));
    else if (opts.recordChanges) {
      TRACKED.forEach(([f, label]) => {
        if ((old[f] || '') !== (n[f] || '')) hist.push(histRow(n, { action: `${label} changed: ${old[f] || '–'} → ${n[f] || '–'}`, waiting: n.Waiting_For, by: opts.by }));
      });
    }
    if (isNew) state.ncrs.push(n); else state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === n.NCR_ID)] = n;
    state.history.push(...hist);
    commit([n], hist);
    emit();
    return n;
  }

  // Record a history entry. countAsFollowup bumps the follow-up counter and Last_Followup.
  function addHistory(id, p) {
    const n = Object.assign({}, getNcr(id));
    const date = p.date || L.todayISO();
    let no = '';
    if (p.countAsFollowup) { n.Followup_Count = (Number(n.Followup_Count) || 0) + 1; no = n.Followup_Count; n.Last_Followup = date; }
    n.Last_Review = L.nowStamp();
    if (p.waiting) n.Waiting_For = p.waiting;
    stamp(n);
    const h = histRow(n, Object.assign({}, p, { date, followupNo: no }));
    state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
    state.history.push(h);
    commit([n], [h]);
    emit();
  }

  // Record one follow-up on each NCR (single or bulk). p.nextDate becomes the next check (Due_Date).
  function recordFollowups(ids, p) {
    const date = p.date || L.todayISO(), ncrs = [], hist = [];
    ids.forEach((id) => {
      const o = getNcr(id); if (!o) return;
      const n = Object.assign({}, o);
      n.Followup_Count = (Number(n.Followup_Count) || 0) + 1; n.Last_Followup = date; n.Last_Review = L.nowStamp();
      if (p.waiting) n.Waiting_For = p.waiting;
      if (p.nextDate) n.Due_Date = p.nextDate;
      if (p.setPending && (n.Status === 'Not Started' || n.Status === 'Open')) n.Status = 'Pending';
      stamp(n);
      state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
      ncrs.push(n);
      hist.push(histRow(n, { date, followupNo: n.Followup_Count, action: p.action, waiting: p.waiting || n.Waiting_For, remark: p.remark, by: p.by }));
    });
    state.history.push(...hist);
    commit(ncrs, hist); emit();
  }

  // Set the same fields on many NCRs at once (next check date, owner, waiting for, status).
  function bulkSet(ids, fields, note) {
    const ncrs = [], hist = [];
    ids.forEach((id) => {
      const o = getNcr(id); if (!o) return;
      const n = Object.assign({}, o, fields);
      if (n.Status === 'Ready to Close' && !n.Next_Action) n.Next_Action = 'Close NCR';
      stamp(n);
      state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
      ncrs.push(n);
      const ch = TRACKED.filter(([f]) => (o[f] || '') !== (n[f] || '')).map(([f, label]) => `${label}: ${o[f] || '–'} → ${n[f] || '–'}`);
      if (ch.length || note) hist.push(histRow(n, { action: note || ('Updated: ' + ch.join('; ')), remark: note && ch.length ? ch.join('; ') : '', by: 'QA' }));
    });
    state.history.push(...hist);
    commit(ncrs, hist); emit();
  }

  // QA read the buyer's latest Remarks: clear the "review" flag and schedule the next check.
  function markReviewed(ids, nextDate) {
    const ncrs = [], hist = [], today = L.todayISO();
    ids.forEach((id) => {
      const o = getNcr(id); if (!o) return;
      const n = Object.assign({}, o, { Last_Review: L.nowStamp() });
      if (nextDate) n.Due_Date = nextDate;
      stamp(n);
      state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
      ncrs.push(n);
      hist.push(histRow(n, { action: 'Reviewed buyer update' + (nextDate ? ' – next check ' + L.fmtDate(nextDate) : ''), by: 'QA' }));
    });
    state.history.push(...hist);
    commit(ncrs, hist); emit();
  }

  function removeNcr(id) {
    state.ncrs = state.ncrs.filter((n) => n.NCR_ID !== id);
    state.history = state.history.filter((h) => h.NCR_ID !== id);
    commit([], [], { deleteIds: [id] });
    emit();
  }

  // Bulk write (used by Excel import).
  function saveMany(ncrs, history) {
    const idx = new Map(state.ncrs.map((n, i) => [n.NCR_ID, i]));
    ncrs.forEach((n) => { if (idx.has(n.NCR_ID)) state.ncrs[idx.get(n.NCR_ID)] = n; else state.ncrs.push(n); });
    state.history.push(...history);
    const p = commit(ncrs, history);
    emit();
    return p;
  }

  function saveSettings(s) {
    state.settings = Object.assign({}, state.settings, s);
    persist(() => adapter.saveSettings(state.settings));
    emit();
  }

  function resetDemo() { LocalAdapter.reset(); return reload(); }

  function demoData() {
    const t = L.todayISO(), d = (n) => L.addDays(t, n);
    const mk = (i, o) => Object.assign({ NCR_ID: 'NCR-DEMO' + i, NCR_No: 'NCR-2503' + i, Followup_Count: 0, Status: 'Open', Created_At: L.nowStamp(), Updated_At: L.nowStamp() }, o);
    const rows = [
      mk(1, { Buyer_Remark: 'Waiting scrap approval from PD', Buyer_Remark_Date: d(-9), Item_No: '8535', Batch_No: 'B2409-11', Supplier: 'Alpha Plastics', Buyer: 'Somchai', NCR_Date: d(-20), Defect: 'Burr on mounting face', Quantity: '1,200 pcs', Disposition: 'Scrap', Next_Action: 'Scrap', Owner: 'Buyer – Somchai', Waiting_For: 'Purchasing', Due_Date: d(-2), Followup_Count: 3, Last_Followup: d(-4), Status: 'Pending' }),
      mk(2, { Buyer_Remark: 'Supplier will send replacement next week', Buyer_Remark_Date: d(-3), Item_No: '7120', Batch_No: 'L-0932', Supplier: 'Beta Metals', Buyer: 'Malee', NCR_Date: d(-9), Defect: 'Out of tolerance (Ø 12.4)', Quantity: '300 pcs', Disposition: 'Return to Supplier', Next_Action: 'Supplier Replacement', Owner: 'Buyer – Malee', Waiting_For: 'Supplier', Due_Date: d(0), Followup_Count: 1, Last_Followup: d(-3), Status: 'Pending' }),
      mk(3, { Buyer_Remark: 'Rework in progress at supplier', Buyer_Remark_Date: d(-1), Item_No: '4410', Batch_No: 'X77', Supplier: 'Gamma Coatings', Buyer: 'Somchai', NCR_Date: d(-5), Defect: 'Paint peeling', Quantity: '80 pcs', Disposition: 'Rework', Next_Action: 'Rework', Owner: 'QA', Waiting_For: 'Production', Due_Date: d(2), Last_Followup: d(-1), Followup_Count: 1, Status: 'Open' }),
      mk(4, { Item_No: '9001', Batch_No: 'K-12', Supplier: 'Delta Rubber', Buyer: 'Malee', NCR_Date: d(-14), Defect: 'Wrong colour', Quantity: '2,000 pcs', Disposition: 'Use As Is', Next_Action: 'Waiting Customer Decision', Owner: 'QA', Waiting_For: 'Customer', Due_Date: d(6), Followup_Count: 2, Last_Followup: d(-2), Status: 'Pending' }),
      mk(5, { Item_No: '3302', Batch_No: 'Z-5', Supplier: 'Alpha Plastics', Buyer: 'Somchai', NCR_Date: d(-12), Defect: 'Short shot', Quantity: '450 pcs', Disposition: 'Sorting', Next_Action: 'Close NCR', Owner: 'QA', Waiting_For: 'QA', Due_Date: d(-1), Followup_Count: 2, Last_Followup: d(-1), Status: 'Ready to Close' }),
      mk(6, { Item_No: '5150', Batch_No: 'M-808', Supplier: 'Beta Metals', Buyer: 'Malee', NCR_Date: d(-1), Defect: 'Rust spots', Quantity: '60 pcs', Status: 'Not Started' }),
      mk(7, { Item_No: '6644', Batch_No: 'C-19', Supplier: 'Gamma Coatings', Buyer: 'Somchai', NCR_Date: d(-30), Defect: 'Dent', Quantity: '25 pcs', Disposition: 'Scrap', Next_Action: 'Scrap', Owner: 'Buyer – Somchai', Waiting_For: 'Purchasing', Due_Date: d(-10), Closed_Date: d(-8), Followup_Count: 2, Status: 'Closed' }),
    ];
    rows.forEach((n) => { n.Aging = L.daysBetween(n.NCR_Date, n.Status === 'Closed' ? n.Closed_Date : t); });
    const hist = [];
    const H = (i, date, no, action, waiting, remark) => hist.push({ History_ID: 'H-DEMO' + hist.length, NCR_ID: 'NCR-DEMO' + i, NCR_No: 'NCR-2503' + i, Date: date, Followup_No: no, Action: action, Waiting_For: waiting, Remark: remark || '', Created_By: 'QA', Created_At: date + 'T09:00:00' });
    H(1, d(-14), 1, 'Waiting for Purchasing confirmation of disposition', 'Purchasing');
    H(1, d(-9), 2, 'Buyer confirmed scrap disposition. Waiting for scrap completion.', 'Purchasing');
    H(1, d(-4), 3, 'No update from buyer – asked again', 'Purchasing', 'Escalation recommended');
    H(2, d(-3), 1, 'Asked supplier for replacement ETA', 'Supplier');
    H(7, d(-12), 1, 'Waiting for scrap approval', 'Purchasing');
    H(7, d(-9), 2, 'Scrap done, evidence received', 'Purchasing');
    H(7, d(-8), '', 'QA verified and closed', 'QA');
    return { ncrs: rows, history: hist, settings: L.DEFAULT_SETTINGS };
  }

  NCR.store = { state, NCR_FIELDS, HIST_FIELDS, init, reload, subscribe: (f) => listeners.push(f), getNcr, historyFor, owners, buyers,
    saveNcr, addHistory, recordFollowups, bulkSet, markReviewed, removeNcr, saveMany, saveSettings, getApiConfig, setApiConfig, resetDemo };
})(window.NCR);
