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

  const DATA_KEY = 'ncr.demo.data';


  // ---------- adapters ----------
  const LocalAdapter = {
    name: 'demo',
    async load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(DATA_KEY)); } catch (e) { /* ignore */ }
      const rd = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
      if (!d) { d = demoData(); localStorage.setItem(DATA_KEY, JSON.stringify(d)); }
      // remove sample rows seeded by earlier versions
      if (d.ncrs.some((n) => String(n.NCR_ID).startsWith('NCR-DEMO'))) {
        d.ncrs = d.ncrs.filter((n) => !String(n.NCR_ID).startsWith('NCR-DEMO'));
        d.history = d.history.filter((h) => !String(h.NCR_ID).startsWith('NCR-DEMO'));
        localStorage.setItem(DATA_KEY, JSON.stringify(d));
      }
      const old = rd('ncr.lastImport'), st = rd('ncr.importStack') || [];
      d.imports = rd('ncr.imports') || []; d.stack = old && !st.some((x) => x.at === old.at) ? st.concat([old]) : st;   // an import saved before the stack existed
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
    async restore(d) { localStorage.setItem(DATA_KEY, JSON.stringify({ ncrs: d.ncrs, history: d.history, settings: d.settings })); },
    async saveMeta(m) {
      try {
        m.imports && m.imports.length ? localStorage.setItem('ncr.imports', JSON.stringify(m.imports)) : localStorage.removeItem('ncr.imports');
        localStorage.removeItem('ncr.lastImport');
        m.stack && m.stack.length ? localStorage.setItem('ncr.importStack', JSON.stringify(m.stack)) : localStorage.removeItem('ncr.importStack');
      } catch (e) { throw new Error('Browser storage is full'); }
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

  // Team mode: the app is served by an Apps Script web app and talks to the Google Sheet through google.script.run.
  const hasGas = () => typeof google !== 'undefined' && google.script && google.script.run;
  let accessCode = '';
  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } };
  // Website mode: the app is hosted anywhere (e.g. Vercel) and calls the Apps Script web app with fetch. Needs an access code.
  const apiUrl = () => ((typeof window !== 'undefined' && window.NCR_CONFIG && window.NCR_CONFIG.apiUrl) || lsGet('ncr.apiUrl') || '').trim();
  function FetchAdapter(url) {
    const call = async (fn, arg) => {
      let res;
      const body = JSON.stringify({ fn, code: accessCode, arg: arg === undefined ? null : arg });
      // Loading is safe to repeat, so retry it when the network call fails. Writes are never repeated (they could be saved twice).
      for (let i = 0; ; i++) {
        try { res = await fetch(url, { method: 'POST', body }); break; } // text/plain: no CORS preflight
        catch (e) { if (fn !== 'apiLoad' || i >= 2) { res = e; break; } await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
      }
      if (res instanceof Error || (res && !('ok' in res))) { const e = res; throw new Error('Cannot reach the Google Sheet. Check the API URL, and that the Apps Script access is set to "Anyone". (' + (e && e.message || e) + ')'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let j; try { j = await res.json(); } catch (e) { throw new Error('The API URL did not answer with data. Is it the /exec link of a Web app deployed for "Anyone"?'); }
      if (j.error) throw new Error(j.error);
      return j.result;
    };
    return {
      name: 'sheets',
      load: () => call('apiLoad'),
      save: (p) => call('apiSave', p),
      clear: () => call('apiClear'),
      saveSettings: (s) => call('apiSaveSettings', s),
      saveMeta: (m) => call('apiSaveMeta', m),
      restore: (d) => call('apiRestore', d),
    };
  }
  function GasAdapter() {
    const run = (fn, arg) => new Promise((res, rej) => {
      const r = google.script.run.withSuccessHandler(res).withFailureHandler((e) => rej(new Error((e && e.message) || String(e))));
      (arg === undefined ? r[fn](accessCode) : r[fn](accessCode, JSON.stringify(arg)));
    });
    const parse = (t) => (typeof t === 'string' ? JSON.parse(t) : t);
    return {
      name: 'sheets',
      async load() { return parse(await run('apiLoad')); },
      async save(p) { await run('apiSave', p); },
      async clear() { await run('apiClear'); },
      async saveSettings(s) { await run('apiSaveSettings', s); },
      async saveMeta(m) { await run('apiSaveMeta', m); },
      async restore(d) { await run('apiRestore', d); },
    };
  }

  // ---------- store ----------
  const state = { ncrs: [], history: [], imports: [], stack: [], meta: {}, settings: L.DEFAULT_SETTINGS, loaded: false, saving: 0, error: null, mode: 'demo', lastLoad: null };
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
    state.imports = Array.isArray(d.imports) ? d.imports : state.imports; state.stack = Array.isArray(d.stack) ? d.stack : state.stack; state.meta = d.meta || state.meta;
    state.loaded = true; state.lastLoad = Date.now();
  }

  async function init() {
    if (!accessCode) accessCode = lsGet('ncr.code');
    adapter = hasGas() ? GasAdapter() : apiUrl() ? FetchAdapter(apiUrl()) : LocalAdapter;
    state.mode = adapter.name;
    await reload();
  }
  async function reload() {
    try { normalize(await adapter.load()); state.error = null; state.needCode = false; if (adapter.name === 'sheets') lsSet('ncr.code', accessCode); } catch (e) { state.needCode = /access code/i.test(e.message); state.error = state.needCode ? null : 'Cannot load data: ' + e.message; }
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
      n.Followup_Count = (Number(n.Followup_Count) || 0) + 1; n.Last_Followup = date; n.Last_Review = reviewStamp(o);
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
  // "Reviewed at" must not be earlier than the buyer's remark date (a file dated in the future would otherwise stay flagged forever)
  const reviewStamp = (o) => { const now = L.nowStamp(); return o.Buyer_Remark_Date && String(o.Buyer_Remark_Date) >= now ? String(o.Buyer_Remark_Date) : now; };
  function markReviewed(ids, nextDate) {
    const ncrs = [], hist = [], today = L.todayISO();
    ids.forEach((id) => {
      const o = getNcr(id); if (!o || !L.info(o, state.settings).needsReview) return; // already reviewed: no duplicate entry
      const n = Object.assign({}, o, { Last_Review: reviewStamp(o) });
      if (nextDate) n.Due_Date = nextDate;
      stamp(n);
      state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
      ncrs.push(n);
      hist.push(histRow(n, { action: 'Reviewed buyer update' + (nextDate ? ' – next check ' + L.fmtDate(nextDate) : ''), by: 'QA' }));
    });
    state.history.push(...hist);
    commit(ncrs, hist); emit();
  }

  // Pressed Reviewed by mistake: drop the latest review entry and go back to the previous review time (or "not reviewed")
  function undoReview(id) {
    const o = getNcr(id); if (!o) return false;
    const rows = state.history.filter((h) => h.NCR_ID === id && /^Reviewed buyer update/.test(h.Action)).sort((a, b) => String(b.Created_At).localeCompare(String(a.Created_At)));
    if (!rows.length) return false;
    const n = Object.assign({}, o, { Last_Review: rows[1] ? rows[1].Created_At : '' });
    stamp(n);
    state.ncrs[state.ncrs.findIndex((x) => x.NCR_ID === id)] = n;
    state.history = state.history.filter((h) => h.History_ID !== rows[0].History_ID);
    commit([n], [], { deleteHistoryIds: [rows[0].History_ID] }); emit();
    return true;
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

  // ---- backup / restore: one JSON file with everything ----
  const BK_KEY = 'ncr.lastBackup', SEEN_KEY = 'ncr.seenChanges';
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
  function exportBundle() {
    ls.set(BK_KEY, L.nowStamp());
    return { format: 'ncr-follow-up-backup', version: 1, exportedAt: L.nowStamp(), ncrs: state.ncrs, history: state.history, settings: state.settings, imports: getImports(), importStack: getStack(), seen: ls.get(SEEN_KEY) };
  }
  function bundleError(b) {
    if (!b || b.format !== 'ncr-follow-up-backup') return 'This is not a backup file made by this app.';
    if (!Array.isArray(b.ncrs) || !Array.isArray(b.history)) return 'The backup file is incomplete (no NCR list).';
    if (b.ncrs.some((n) => !n || !n.NCR_ID || !n.NCR_No)) return 'The backup file has NCRs without an ID or number.';
    return '';
  }
  async function restoreBundle(b) {
    const err = bundleError(b); if (err) throw new Error(err);
    const d = { ncrs: b.ncrs, history: b.history, settings: b.settings };
    normalize(d); setImports(Array.isArray(b.imports) ? b.imports : []); setStack(Array.isArray(b.importStack) ? b.importStack : []);
    if (b.seen) ls.set(SEEN_KEY, b.seen);
    ls.set(BK_KEY, L.nowStamp()); emit();
    return persist(async () => {
      await adapter.restore(d);
      await adapter.saveMeta({ imports: state.imports, stack: state.stack });
    });
  }
  // rough browser storage use (localStorage is about 5 MB per site)
  function storageInfo() {
    let chars = 0; try { Object.keys(localStorage).forEach((k) => { if (k.startsWith('ncr.')) chars += k.length + (localStorage.getItem(k) || '').length; }); } catch (e) { /* ignore */ }
    const kb = Math.round(chars / 1024); return { kb, pct: Math.min(100, Math.round((chars / (5 * 1024 * 1024)) * 100)) };
  }

  // ---- undo a wrong import / clear everything ----
  // Every import keeps how to take it back, so uploads can be removed newest-first (a stack).
  const STACK_MAX = 15;
  const getStack = () => (state.stack || []).slice();
  const getLastImport = () => getStack()[getStack().length - 1] || null;
  const getImports = () => (state.imports || []).slice();
  const saveMeta = () => persist(() => adapter.saveMeta({ imports: state.imports, stack: state.stack }));
  const setStack = (v) => { state.stack = (v || []).slice(-STACK_MAX); };
  const setImports = (v) => { state.imports = v || []; };

  // Import log (one entry per upload) for the Imports and What changed pages.
  function patchImportLog(at, patch) { setImports(getImports().map((x) => (x.at === at ? Object.assign({}, x, patch) : x))); return saveMeta(); }

  // Save an import result and remember how to take it back.

  function applyImport(result, meta) {
    const prev = {}, addedIds = [];
    result.ncrs.forEach((n) => { const o = getNcr(n.NCR_ID); if (o) prev[n.NCR_ID] = o; else addedIds.push(n.NCR_ID); });
    const at = L.nowStamp() + '.' + String(Date.now() % 1000).padStart(3, '0'); // unique even for uploads in the same second
    const { changes, ...undoMeta } = meta || {}; // the change list only goes to the log, not the (larger) undo stack
    setStack(getStack().concat([Object.assign({ at, prev, addedIds, historyIds: result.history.map((h) => h.History_ID) }, undoMeta)]));
    setImports(getImports().concat([Object.assign({ at }, undoMeta, changes ? { changes } : {})]));
    saveMeta();
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
    setStack(stack.slice(0, -1)); saveMeta(); emit();
    return 1;
  }
  function clearAll() {
    state.ncrs = []; state.history = []; setStack([]); setImports([]);
    persist(() => adapter.clear()); saveMeta();
    emit();
  }
  function resetDemo() { return clearAll(); }

  // Browser-only mode starts empty: all data comes from the uploaded Excel file.
  function demoData() { return { ncrs: [], history: [], settings: {} }; }

  NCR.store = { state, NCR_FIELDS, HIST_FIELDS, init, reload, subscribe: (f) => listeners.push(f), getNcr, historyFor, owners, buyers,
    saveNcr, addHistory, recordFollowups, bulkSet, markReviewed, undoReview, removeNcr, saveMany, applyImport, undoImport, exportBundle, bundleError, restoreBundle, storageInfo, lastBackup: () => ls.get(BK_KEY), getImports, patchImportLog, getSeen: () => { try { return localStorage.getItem('ncr.seenChanges') || ''; } catch (e) { return ''; } }, setSeen: (v) => { try { localStorage.setItem('ncr.seenChanges', v); } catch (e) { /* storage unavailable */ } }, getImportStack: () => getStack().map((x) => x.at), getLastImport, clearAll, saveSettings, resetDemo, setAccessCode: (c) => { accessCode = String(c || ''); lsSet('ncr.code', accessCode); }, isTeamMode: () => hasGas() || !!apiUrl(), getApiUrl: apiUrl, setApiUrl: (u) => lsSet('ncr.apiUrl', String(u || '').trim()), forgetCode: () => { accessCode = ''; lsSet('ncr.code', ''); } };
})(window.NCR);
