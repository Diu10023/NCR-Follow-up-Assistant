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
      // remove sample rows seeded by earlier versions
      if (d.ncrs.some((n) => String(n.NCR_ID).startsWith('NCR-DEMO'))) {
        d.ncrs = d.ncrs.filter((n) => !String(n.NCR_ID).startsWith('NCR-DEMO'));
        d.history = d.history.filter((h) => !String(h.NCR_ID).startsWith('NCR-DEMO'));
        localStorage.setItem(DATA_KEY, JSON.stringify(d));
      }
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
    async clear() { this.reset(); },
  };

  function applyPayload(d, p) {
    const del = new Set(p.deleteIds || []);
    const idx = new Map(d.ncrs.map((n, i) => [n.NCR_ID, i]));
    (p.ncrs || []).forEach((n) => { if (idx.has(n.NCR_ID)) d.ncrs[idx.get(n.NCR_ID)] = n; else { idx.set(n.NCR_ID, d.ncrs.length); d.ncrs.push(n); } });
    d.history = d.history.concat(p.history || []);
    if (p.deleteHistoryIds && p.deleteHistoryIds.length) { const dh = new Set(p.deleteHistoryIds); d.history = d.history.filter((h) => !dh.has(h.History_ID)); }
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
      async clear() { await call('POST', { action: 'clear' }); },
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
  // {buyer} in the action / person / remark text is replaced with each NCR's own buyer.
  function recordFollowups(ids, p) {
    const date = p.date || L.todayISO(), ncrs = [], hist = [];
    const fill = (t, n) => String(t || '').split('{buyer}').join(n.Buyer || 'the buyer');
    ids.forEach((id) => {
      const o = getNcr(id); if (!o) return;
      const n = Object.assign({}, o);
      n.Followup_Count = (Number(n.Followup_Count) || 0) + 1; n.Last_Followup = date; n.Last_Review = L.nowStamp();
      if (p.waiting) n.Waiting_For = p.waiting;
      if (p.nextDate) n.Due_Date = p.nextDate;
      if (n.Status === 'Not Started' || n.Status === 'Open') n.Status = 'Pending'; // waiting for the buyer's reply
      stamp(n);
      state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
      ncrs.push(n);
      hist.push(histRow(n, { date, followupNo: n.Followup_Count, action: fill(p.action, n), waiting: p.waiting || n.Waiting_For, remark: fill(p.remark, n), by: fill(p.by, n) }));
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
      if (n.Status === 'Closed' && !n.Closed_Date) n.Closed_Date = L.todayISO();
      if (n.Status !== 'Closed') n.Closed_Date = '';
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

  // ---- undo a wrong import / clear everything ----
  const LAST_KEY = 'ncr.lastImport';
  // Every import keeps how to take it back, so uploads can be removed newest-first (a stack).
  const STACK_KEY = 'ncr.importStack', STACK_MAX = 15;
  function getStack() {
    try {
      const s = JSON.parse(localStorage.getItem(STACK_KEY)) || [], old = JSON.parse(localStorage.getItem(LAST_KEY));
      return old && !s.some((x) => x.at === old.at) ? s.concat([old]) : s; // an import saved before the stack existed
    } catch (e) { return []; }
  }
  function setStack(v) { try { localStorage.removeItem(LAST_KEY); v && v.length ? localStorage.setItem(STACK_KEY, JSON.stringify(v.slice(-STACK_MAX))) : localStorage.removeItem(STACK_KEY); } catch (e) { /* storage unavailable */ } }
  function getLastImport() { const s = getStack(); return s[s.length - 1] || null; }

  // Import log (one entry per upload) for the Import history page. Kept in this browser.
  const LOG_KEY = 'ncr.imports';
  function getImports() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { return []; } }
  function setImports(v) { try { v && v.length ? localStorage.setItem(LOG_KEY, JSON.stringify(v)) : localStorage.removeItem(LOG_KEY); } catch (e) { /* storage unavailable */ } }

  // Save an import result and remember how to take it back.

  function applyImport(result, meta) {
    const prev = {}, addedIds = [];
    result.ncrs.forEach((n) => { const o = getNcr(n.NCR_ID); if (o) prev[n.NCR_ID] = o; else addedIds.push(n.NCR_ID); });
    const at = L.nowStamp() + '.' + String(Date.now() % 1000).padStart(3, '0'); // unique even for uploads in the same second
    setStack(getStack().concat([Object.assign({ at, prev, addedIds, historyIds: result.history.map((h) => h.History_ID) }, meta)]));
    setImports(getImports().concat([Object.assign({ at }, meta)]));
    return saveMany(result.ncrs, result.history);
  }
  // Remove what the last import added and restore what it changed.
  // Remove one upload; with `at` it removes that upload and every newer one (newer ones were built on top of it).
  function undoImport(at) {
    const stack = getStack(); if (!stack.length) return false;
    if (at) { const k = stack.findIndex((x) => x.at === at); if (k < 0) return false; const n = stack.length - k; for (let i = 0; i < n; i++) undoImport(); return n; }
    const rec = stack[stack.length - 1];
    const added = new Set(rec.addedIds), dropH = new Set(rec.historyIds), restored = Object.values(rec.prev);
    state.ncrs = state.ncrs.filter((n) => !added.has(n.NCR_ID)).map((n) => rec.prev[n.NCR_ID] || n);
    state.history = state.history.filter((h) => !added.has(h.NCR_ID) && !dropH.has(h.History_ID));
    commit(restored, [], { deleteIds: rec.addedIds, deleteHistoryIds: rec.historyIds });
    setImports(getImports().filter((x) => x.at !== rec.at));
    setStack(stack.slice(0, -1)); emit();
    return 1;
  }
  function clearAll() {
    state.ncrs = []; state.history = []; setStack([]); setImports([]);
    persist(() => adapter.clear());
    emit();
  }
  function resetDemo() { return clearAll(); }

  // Browser-only mode starts empty: all data comes from the uploaded Excel file.
  function demoData() { return { ncrs: [], history: [], settings: {} }; }

  NCR.store = { state, NCR_FIELDS, HIST_FIELDS, init, reload, subscribe: (f) => listeners.push(f), getNcr, historyFor, owners, buyers,
    saveNcr, addHistory, recordFollowups, bulkSet, markReviewed, removeNcr, saveMany, applyImport, undoImport, getImports, getImportStack: () => getStack().map((x) => x.at), getLastImport, clearAll, saveSettings, getApiConfig, setApiConfig, resetDemo };
})(window.NCR);
