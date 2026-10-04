// App shell: routing, modals, global actions, auto-refresh.
(function () {
  const L = NCR.logic, S = NCR.store, V = NCR.views, st = S.state, esc = V.esc;
  const $ = (s) => document.querySelector(s);
  const main = $('#main'), modal = $('#modal');
  let current = null;

  function route() {
    const [page, arg] = location.hash.replace(/^#\//, '').split('/');
    return { page: page || 'home', arg: arg && decodeURIComponent(arg) };
  }

  function render() {
    if (!st.loaded && st.needCode) {
      main.innerHTML = `<div class="card" style="max-width:460px;margin:60px auto"><h2>Team access code</h2><p class="hint">Ask the person who set up this tool for the code.</p><form id="code-form" class="form"><label class="full">Access code<input name="code" type="password" autocomplete="off" required autofocus></label><div class="full actions"><button class="btn primary" type="submit">Open</button></div></form>${st.error ? `<p class="bad">${esc(st.error)}</p>` : ''}</div>`;
      $('#code-form').addEventListener('submit', async (e) => { e.preventDefault(); S.setAccessCode(new FormData(e.target).get('code')); await S.init(); render(); });
      return;
    }
    if (!st.loaded) {
      main.innerHTML = `<div class="empty">${st.error ? esc(st.error) : 'Loading…'}${st.error ? '<p><button class="btn primary" id="retry-load" type="button">Try again</button></p>' : ''}</div>`;
      const rb = $('#retry-load');
      if (rb) rb.addEventListener('click', async () => { rb.disabled = true; rb.textContent = 'Loading…'; await S.init(); render(); });
      return;
    }
    const { page, arg } = route();
    const views = { home: V.home, overview: V.home, dashboard: V.home, closed: V.closedPage, followed: V.followedPage, hold: V.holdPage, today: V.list, list: V.list, ncr: () => V.detail(arg), import: V.importPage, imports: V.importsPage, trends: V.trendsPage, help: V.helpPage, changes: () => V.changesPage(arg),  response: V.responsePage, settings: V.settings };
    current = (views[page] || V.home)();
    current.closed = page === 'ncr' && (S.getNcr(arg) || {}).Status === 'Closed';
    const back = ['home', 'overview', 'dashboard'].includes(page) ? '' : '<div class="backbar"><button class="btn sm" data-action="back">← Back</button></div>';
    main.innerHTML = back + (['home', 'overview', 'dashboard', 'list', 'today', 'followed', 'hold', 'closed', 'import', 'imports', 'changes', 'response', 'trends', 'help', 'settings'].includes(page) ? V.groupTabs(page) : '') + (['home', 'overview', 'dashboard', 'list', 'today', 'followed'].includes(page) ? V.changeBanner() : '') + current.html;
    if (current.bind) current.bind(main);
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + (page === 'today' ? 'list' : page === 'ncr' ? (current.closed ? 'closed' : 'list') : page === 'overview' || page === 'dashboard' ? 'home' : ['imports', 'changes', 'response', 'trends'].includes(page) ? 'import' : page)));
    updateBulkBar();
    window.scrollTo({ top: window.__keepScroll || 0, behavior: 'instant' }); window.__keepScroll = 0;
  }

  function status() {
    const by = { todo: 0, followed: 0, hold: 0, jira: 0 };
    st.ncrs.forEach((n) => { const k = V.inf(n).bucket; if (k in by) by[k]++; });
    $('#today-badge').textContent = by.todo;      // still to follow up
    $('#fu-badge').textContent = by.followed;     // followed up, not closed yet
    $('#hold-badge').textContent = by.hold + by.jira;
    const lg = S.getImports().filter((x) => x.changes).pop();   // unseen upload: show how many NCRs it touched
    $('#chg-badge').textContent = lg && S.getSeen() !== lg.at ? new Set(lg.changes.filter((c) => ['new', 'update', 'cleared', 'reopened'].includes(c.t)).map((c) => c.no)).size || '' : '';
    const el = $('#sync');
    const si = st.mode === 'sheets' ? { pct: 0, kb: 0 } : S.storageInfo();
    el.className = 'sync' + (st.error || si.pct >= 80 ? ' err' : '');
    el.textContent = st.error ? '⚠️ ' + st.error : si.pct >= 80 ? `⚠️ Browser storage is ${si.pct}% full. Save a backup (Settings → Your data) and consider clearing old data.` : st.saving ? 'Saving…' : st.mode === 'sheets' ? (st.checkError ? '⚠️ Cannot check for updates (' + st.checkError + '). Retrying…' : '✓ Synced with Google Sheets' + (st.lastCheck ? ' · checked ' + new Date(st.lastCheck).toLocaleTimeString() : '')) : '';
    $('#mode').hidden = st.mode !== 'demo';
  }

  S.onCheck(status);
  S.subscribe(() => {
    status();
    const a = document.activeElement;
    const editing = a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (st.loaded && !modal.open && !editing) { pendingRender = false; window.__keepScroll = window.scrollY; render(); } else if (st.loaded) pendingRender = true;
  });
  // A change that arrived while someone was typing or a dialog was open is drawn as soon as that is over.
  let pendingRender = false;
  function drawPending() {
    const a = document.activeElement;
    if (pendingRender && st.loaded && !modal.open && !(a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) { pendingRender = false; window.__keepScroll = window.scrollY; render(); }
  }
  document.addEventListener('focusout', () => setTimeout(drawPending, 150));
  modal.addEventListener('close', () => setTimeout(drawPending, 150));
  // remember where each page was scrolled, so Back returns to the same spot in a long list
  const scrollMem = {}; let scrollKey = location.hash;
  window.addEventListener('scroll', () => { scrollMem[scrollKey] = window.scrollY; }, { passive: true });
  window.addEventListener('hashchange', () => {
    const key = location.hash; scrollKey = '';
    V.SEL.clear(); render(); window.scrollTo({ top: scrollMem[key] || 0, behavior: 'instant' }); scrollKey = key;
  });

  // ---------- toast ----------
  let tt;
  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, 2600);
  }

  // ---------- modals ----------
  function openModal(html, onBind) {
    modal.innerHTML = html; if (!modal.open) modal.showModal();
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => modal.close()));
    if (onBind) onBind(modal);
  }
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  function copyText(text) {
    const done = () => toast('Message copied');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed – select the text manually', true); } ta.remove(); }
  }

  // In-page confirmation (the browser's confirm() is not available inside the viewer). `typed` makes the user type a word first.
  function confirmModal({ title, text, ok, typed, onOk }) {
    openModal(`<form id="cm" class="form modal-form"><h2>${esc(title)}</h2><p class="full">${text}</p>
      ${typed ? `<label class="full"><span>Type <b>${esc(typed)}</b> (capital letters) to confirm</span><input id="cm-t" autocomplete="off" placeholder="${esc(typed)}"></label>` : ''}
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn ok" id="cm-ok" type="submit"${typed ? ' disabled' : ''}>${esc(ok || 'Confirm')}</button></div></form>`, (m) => {
      const t = m.querySelector('#cm-t'), b = m.querySelector('#cm-ok');
      if (t) t.addEventListener('input', () => { b.disabled = t.value.trim() !== typed; });
      m.querySelector('#cm').addEventListener('submit', (e) => { e.preventDefault(); if (typed && t.value.trim() !== typed) return; modal.close(); onOk(); });
    });
  }


  const plusDays = (n) => L.addDays(L.todayISO(), n);
  const buyerNames = (list) => [...new Set(list.map((n) => V.buyerOf(n)))];

  // Follow-up for one or many NCRs: copy the message and record that it was sent.
  function followupModal(ids) {
    const list = ids.map(S.getNcr).filter(Boolean), s = st.settings;
    if (!list.length) return;
    const one = list.length === 1, n0 = list[0];
    // one block per buyer: its own message, person, note and remark
    const by = {}; list.forEach((n) => { (by[V.buyerOf(n)] = by[V.buyerOf(n)] || []).push(n); });
    const groups = Object.keys(by).sort().map((name) => {
      const ncrs = by[name].slice().sort((x, y) => String(x.NCR_Date).localeCompare(String(y.NCR_Date))), named = name !== V.NO_BUYER;
      const who = one ? (n0.Waiting_For || n0.Buyer || 'Purchasing') : named ? name : '';
      return { name, named, ncrs, ids: ncrs.map((n) => n.NCR_ID), who,
        msg: one ? L.followupMessage(n0, s) : L.buyerMessage(named ? name : '', ncrs),
        action: who ? 'Asked ' + who + ' for status update' : 'Asked for status update' };
    });
    const many = groups.length > 1;
    openModal(`<form id="hf" class="form modal-form"><h2>${one ? `Follow-up #${(Number(n0.Followup_Count) || 0) + 1} – ${esc(n0.NCR_No)}` : `Follow-up – ${list.length} NCRs${many ? ' · ' + groups.length + ' buyers' : ''}`}</h2>
      <ol class="steps full"><li><b>Copy</b> each buyer's message and send it (Teams or email).</li><li><b>Press Record</b>. The NCRs move to Followed up and stay there until they are closed. The next file shows how the buyer answered.</li></ol>
      ${groups.map((g, k) => `<section class="grp full">
        ${many || !one ? `<h3>${esc(g.name)} <span class="count">${g.ncrs.length} NCR${g.ncrs.length === 1 ? '' : 's'}</span></h3>` : ''}
        <label>${one ? 'Message (editable)' : 'Message for ' + esc(g.name)}<textarea class="msg" rows="${one ? 9 : Math.min(12, 6 + g.ncrs.length)}">${esc(g.msg)}</textarea></label>
        <button type="button" class="btn sm copy" data-k="${k}">📋 Copy message</button>
        <div class="form inner">
          <label>Person / department<input name="by_${k}" value="${esc(g.who)}"></label>
          <label>Action / note *<input name="action_${k}" required value="${esc(g.action)}"></label>
          <label class="full">Remark<input name="remark_${k}"></label>
        </div></section>`).join('')}
      <hr class="full">
      <label>Date<input type="date" name="date" value="${L.todayISO()}" required></label>
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">I sent it, record${one ? '' : ' (' + list.length + ')'}</button></div></form>`, (m) => {
      m.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => copyText(m.querySelectorAll('.msg')[b.dataset.k].value)));
      m.querySelector('#hf').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        groups.forEach((g, k) => S.recordFollowups(g.ids, { date: f.get('date'), by: f.get('by_' + k), action: f.get('action_' + k), remark: f.get('remark_' + k) }));
        V.SEL.clear(); modal.close(); toast(`Recorded. ${one ? 'It is' : list.length + ' NCRs are'} now in Followed up`);
      });
    });
  }

  // ---------- bulk selection bar ----------
  function updateBulkBar() {
    const bar = $('#bulkbar'), n = V.SEL.size;
    bar.hidden = !n;
    if (n) bar.innerHTML = `<b>${n} selected</b><button class="btn primary" data-action="bulk-followup">📨 Follow-up</button><button class="btn" data-action="bulk-clear">Clear</button>`;
  }
  document.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.classList && cb.classList.contains('sel')) { cb.checked ? V.SEL.add(cb.dataset.id) : V.SEL.delete(cb.dataset.id); updateBulkBar(); }
    else if (cb.classList && cb.classList.contains('sel-all')) {
      cb.closest('table').querySelectorAll('.sel').forEach((x) => { x.checked = cb.checked; cb.checked ? V.SEL.add(x.dataset.id) : V.SEL.delete(x.dataset.id); });
      // the whole list, also the rows beyond the "Show all" limit
      (V.sectionIds[cb.dataset.key] || []).forEach((id) => { cb.checked ? V.SEL.add(id) : V.SEL.delete(id); });
      updateBulkBar();
    }
  });

  // Excel export: one sheet per buyer. In the viewer the file goes through the downloads capability; elsewhere the browser saves it.
  async function exportXlsx(ids, label) {
    if (!ids.length) { toast('Nothing to export', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded (check internet connection)', true); return; }
    const rows = V.exportRows(ids), by = {};
    rows.forEach((r) => { (by[r.Buyer || V.NO_BUYER] = by[r.Buyer || V.NO_BUYER] || []).push(r); });
    const wb = XLSX.utils.book_new(), used = new Set();
    Object.keys(by).sort().forEach((name) => {
      let sn = name.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet', k = 2, base = sn;
      while (used.has(sn.toLowerCase())) sn = base.slice(0, 26) + ' ' + k++;
      used.add(sn.toLowerCase());
      const ws = XLSX.utils.json_to_sheet(by[name]);
      ws['!cols'] = [12, 12, 14, 18, 28, 13, 10, 60, 10, 14, 13].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, sn);
    });
    const who = Object.keys(by).length === 1 ? '_' + Object.keys(by)[0].replace(/[^\w\-]+/g, '_') : '';
    const filename = `NCR_${label}${who}_${L.todayISO()}.xlsx`;
    await saveBook(wb, filename);
  }
  // ---------- backup as an Excel workbook (opens in Excel or Google Sheets) ----------
  const DATE_ONLY = new Set(['NCR_Date', 'Due_Date', 'Last_Followup', 'Closed_Date', 'Date']), STAMPS = new Set(['Buyer_Remark_Date', 'Last_Review', 'Created_At', 'Updated_At']);
  const NUM_FIELDS = new Set(['Followup_Count', 'Aging']);
  const pad2 = (n) => String(n).padStart(2, '0');
  // Google Sheets / Excel may turn text dates into date numbers: bring them back to ISO text
  function fromSerial(v, field) {
    if (typeof v !== 'number') return String(v == null ? '' : v);
    if (!(v > 20000 && v < 80000) || !(DATE_ONLY.has(field) || STAMPS.has(field))) return String(v);
    const ms = Math.round((v - 25569) * 86400000), d = new Date(ms), iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    return Number.isInteger(v) && DATE_ONLY.has(field) ? iso : `${iso}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  function bundleToWorkbook(b) {
    const wb = XLSX.utils.book_new(), add = (name, rows, header, wch) => { const ws = XLSX.utils.json_to_sheet(rows, header ? { header } : undefined); ws['!cols'] = (header || Object.keys(rows[0] || {})).map((h, i) => ({ wch: (wch && wch[i]) || 16 })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const readme = [
      ['NCR Follow-up Control: backup'], [`Saved on ${L.fmtDate(b.exportedAt)} · ${b.ncrs.length} NCRs · ${b.history.length} history entries`], [''],
      ['What is this file?'], ['A complete copy of your data. You can open it in Excel or Google Sheets, read it, filter it and share it.'], [''],
      ['Open it in Google Sheets'], ['1. Upload this file to Google Drive.'], ['2. Right-click it → Open with → Google Sheets.'], [''],
      ['Put it back into the app'], ['1. In Google Sheets: File → Download → Microsoft Excel (.xlsx).'], ['2. In the app: Settings → Backup → Restore from backup, and choose that file.'], [''],
      ['Please do not rename the sheets or the column headings, or the app cannot read the file back.'],
      ['NCR_Master = every NCR · Followup_History = the timeline · Uploads and Upload_Changes = your weekly uploads · Settings = keywords.'],
    ];
    const rs = XLSX.utils.aoa_to_sheet(readme); rs['!cols'] = [{ wch: 110 }]; XLSX.utils.book_append_sheet(wb, rs, 'READ ME');
    add('NCR_Master', b.ncrs.map((n) => { const r = {}; S.NCR_FIELDS.forEach((f) => { r[f] = n[f] == null ? '' : n[f]; }); return r; }), S.NCR_FIELDS);
    add('Followup_History', b.history.map((h) => { const r = {}; S.HIST_FIELDS.forEach((f) => { r[f] = h[f] == null ? '' : h[f]; }); return r; }), S.HIST_FIELDS);
    const UP = ['at', 'file', 'fileDate', 'added', 'updated', 'remarkChanged', 'closed', 'reopened', 'missing', 'total', 'byBuyer', 'snap'];
    add('Uploads', (b.imports || []).map((x) => { const r = {}; UP.forEach((k) => { const v = x[k]; r[k] = v && typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : v; }); return r; }), UP);
    const CH = ['uploadAt', 'type', 'no', 'buyer', 'from', 'to', 'why'], chRows = [];
    (b.imports || []).forEach((x) => (x.changes || []).forEach((c) => chRows.push({ uploadAt: x.at, type: c.t, no: c.no, buyer: c.buyer || '', from: c.from || '', to: c.to || '', why: c.why || '' })));
    add('Upload_Changes', chRows, CH);
    add('Settings', Object.entries(b.settings || {}).map(([k, v]) => ({ Key: k, Value: JSON.stringify(v) })), ['Key', 'Value']);
    add('About', [{ Key: 'format', Value: 'ncr-follow-up-backup' }, { Key: 'version', Value: '2' }, { Key: 'exportedAt', Value: b.exportedAt }], ['Key', 'Value']);
    return wb;
  }
  function workbookToBundle(wb) {
    const sheet = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : null);
    const nm = sheet('NCR_Master'), hs = sheet('Followup_History');
    if (!nm || !hs) throw new Error('This workbook has no NCR_Master / Followup_History sheet. Is it a backup from this app?');
    const row = (r, fields) => { const o = {}; fields.forEach((f) => { const v = r[f]; o[f] = NUM_FIELDS.has(f) ? Number(v) || 0 : f === 'Quantity' ? (v === '' ? '' : v) : fromSerial(v, f); }); return o; };
    const ncrs = nm.filter((r) => r.NCR_ID && r.NCR_No).map((r) => row(r, S.NCR_FIELDS)), history = hs.filter((r) => r.NCR_ID).map((r) => row(r, S.HIST_FIELDS));
    const settings = {}; (sheet('Settings') || []).forEach((r) => { try { settings[r.Key] = JSON.parse(r.Value); } catch (e) { settings[r.Key] = r.Value; } });
    const about = {}; (sheet('About') || []).forEach((r) => { about[r.Key] = r.Value; });
    const changes = {}; (sheet('Upload_Changes') || []).forEach((r) => { (changes[String(r.uploadAt)] = changes[String(r.uploadAt)] || []).push({ t: r.type, no: String(r.no), buyer: String(r.buyer), from: String(r.from), to: String(r.to), why: String(r.why) }); });
    const num = (v) => (v === '' ? undefined : Number(v)), js = (v) => { try { return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } };
    const imports = (sheet('Uploads') || []).filter((r) => r.at !== '').map((r) => {
      const x = { at: String(r.at), file: String(r.file), fileDate: fromSerial(r.fileDate, 'Date') };
      ['added', 'updated', 'remarkChanged', 'closed', 'reopened', 'missing', 'total'].forEach((k) => { const v = num(r[k]); if (v !== undefined) x[k] = v; });
      const bb = js(r.byBuyer), sn = js(r.snap); if (bb) x.byBuyer = bb; if (sn) x.snap = sn; if (changes[x.at]) x.changes = changes[x.at];
      return x;
    });
    return { format: 'ncr-follow-up-backup', version: 2, exportedAt: String(about.exportedAt || L.nowStamp()), ncrs, history, settings, imports, importStack: [] };
  }

  async function backupNow() {
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded (check internet connection)', true); return; }
    const wb = bundleToWorkbook(S.exportBundle()), filename = `NCR_backup_${L.todayISO()}.xlsx`;
    await saveBook(wb, filename, 'Backup saved. Keep the file somewhere safe (e.g. Google Drive)'); render();
  }
  function restoreFrom(file) {
    const isJson = /\.json$/i.test(file.name), rd = new FileReader();
    rd.onload = () => {
      let b;
      try { b = isJson ? JSON.parse(rd.result) : workbookToBundle(XLSX.read(rd.result, { type: 'array' })); }
      catch (e) { toast(isJson ? 'That file is not a valid backup (not JSON)' : (e && e.message) || 'Could not read that file', true); return; }
      const err = S.bundleError(b); if (err) { toast(err, true); return; }
      confirmModal({ title: 'Restore this backup?', text: `This replaces ALL current data (${st.ncrs.length} NCRs) with the backup: ${b.ncrs.length} NCRs, ${b.history.length} history entries, ${(b.imports || []).length} uploads, saved ${L.fmtDate(b.exportedAt)}. Make a backup of the current data first if you may need it.`, ok: 'Restore', onOk: async () => { await S.restoreBundle(b); toast('Backup restored'); render(); } });
    };
    if (isJson) rd.readAsText(file); else rd.readAsArrayBuffer(file);
  }
  async function saveBook(wb, filename, doneMsg) {
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (dl) { await dl.save({ filename, data: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) }); toast(doneMsg || 'Excel file ready'); }
      else { XLSX.writeFile(wb, filename); toast(doneMsg || 'Excel file downloaded'); }
    } catch (e) { if (!e || e.code !== 'declined') toast('Could not save the file' + (e && e.message ? ': ' + e.message : ''), true); }
  }
  // Everything, split by status: one sheet per status plus summary, timeline and upload log
  async function exportAll() {
    if (!st.ncrs.length) { toast('Nothing to export', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded (check internet connection)', true); return; }
    const wb = XLSX.utils.book_new();
    V.exportBook().forEach(([name, rows]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Nothing here' }]);
      const keys = Object.keys(rows[0] || { Info: 1 });
      ws['!cols'] = keys.map((k) => ({ wch: /remark|Action|Detail|Defect/i.test(k) ? 50 : /Buyer|NCR No|Batch|Flag|Group/.test(k) ? 18 : 13 }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    await saveBook(wb, `NCR_all_${L.todayISO()}.xlsx`);
  }

  async function exportMonth() {
    const sel = $('#tr-month'); if (!sel) return;
    const book = V.monthBook(sel.value); if (!book) { toast('No data for that month', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded (check internet connection)', true); return; }
    const wb = XLSX.utils.book_new();
    book.forEach(([name, rows]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Nothing here' }]);
      ws['!cols'] = Object.keys(rows[0] || { Info: 1 }).map((k) => ({ wch: /remark|Measure|Defect/i.test(k) ? 44 : 16 }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    await saveBook(wb, `NCR_monthly_${sel.value}.xlsx`);
  }
  async function exportTrendPng() {
    const t = V.trendsSvg(); if (!t) { toast('Charts need at least two imports', true); return; }
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.svg); });
      const c = document.createElement('canvas'); c.width = t.w * 2; c.height = t.h * 2;
      const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const filename = `NCR_trend_${L.todayISO()}.png`, dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (dl) { await dl.save({ filename, data: await blob.arrayBuffer() }); toast('Image ready'); }
      else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); toast('Image downloaded'); }
    } catch (e) { if (!e || e.code !== 'declined') toast('Could not create the image here. Use the Excel summary instead', true); }
  }

  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'restore-file' && e.target.files[0]) { restoreFrom(e.target.files[0]); e.target.value = ''; } });

  const actions = {
    'export-all': () => exportAll(),
    backup: () => backupNow(),
    restore: () => $('#restore-file') && $('#restore-file').click(),
    'export-month': () => exportMonth(),
    'export-trend-png': () => exportTrendPng(),
    'dismiss-changes': () => { const l = S.getImports().filter((x) => x.changes).pop(); if (l) S.setSeen(l.at); render(); },
    back: () => {
      if (history.length > 1) { history.back(); return; }
      const { page } = route();
      location.hash = page === 'ncr' ? (current.closed ? '#/closed' : '#/list') : '#/home';
    },
    followup: (el) => followupModal([el.dataset.id]),
    'bulk-followup': () => followupModal([...V.SEL]),
    'bulk-clear': () => { V.SEL.clear(); render(); },
    showall: (el) => { V.showAll[el.dataset.key] = !V.showAll[el.dataset.key]; window.__keepScroll = window.scrollY; render(); },
    selsection: (el) => { (V.sectionIds[el.dataset.key] || []).forEach((id) => V.SEL.add(id)); window.__keepScroll = window.scrollY; render(); },
    toggletl: (el) => { const id = el.dataset.id; V.WF_OPEN.has(id) ? V.WF_OPEN.delete(id) : V.WF_OPEN.add(id); window.__keepScroll = window.scrollY; render(); },
    unreview: (el) => { S.undoReview(el.dataset.id); toast('Review undone: the NCR is flagged “Buyer updated” again'); },
    reviewed: (el) => { S.markReviewed([el.dataset.id]); toast('Marked as read'); },
    chase: (el) => {
      const ids = V.currentIds();
      if (ids.length) followupModal(ids);
    },
    export: (el) => exportXlsx(el.dataset.src === 'todo' ? V.currentIds() : V.sectionIds.followed || [], el.dataset.src === 'todo' ? 'to-follow-up' : 'followed-up'),
    togglebuyer: (el) => { const b = el.dataset.buyer; V.HOME_OPEN.has(b) ? V.HOME_OPEN.delete(b) : V.HOME_OPEN.add(b); window.__keepScroll = window.scrollY; render(); },
  };

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act) { e.preventDefault(); e.stopPropagation(); if (!act.disabled) actions[act.dataset.action](act); return; }
    if (e.target.closest('.cb')) return;
    const cl = e.target.closest('[data-closed]');
    if (cl) { V.CF.q = ''; V.CF.buyer = cl.dataset.closed; }
    const f = e.target.closest('[data-filter]');
    if (f) V.setFilter(JSON.parse(f.dataset.filter));
    const w = e.target.closest('[data-wfilter]');
    if (w) V.setWaitFilter(JSON.parse(w.dataset.wfilter));
    const hj = e.target.closest('[data-hjfilter]');
    if (hj) V.setHJ(JSON.parse(hj.dataset.hjfilter));
    const link = (f || w || hj) && e.target.closest('a');
    if (link && link.getAttribute('href') === location.hash) render(); // already on that page: no hashchange will fire
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,input,select')) location.hash = row.dataset.href;
  });

  // Auto-load: check for changes when the tab regains focus and every 8 seconds (Sheets mode only).
  function autoRefresh() { drawPending(); if (st.mode === 'sheets' && !st.saving && !modal.open) S.refresh(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
  window.addEventListener('focus', autoRefresh);
  window.addEventListener('online', autoRefresh);
  setInterval(autoRefresh, 8000);

  // one shared tooltip for chart marks (text only, via textContent)
  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true;
  tip.innerHTML = '<div class="tv"></div><div class="ta"></div><div class="tb"></div>'; document.body.appendChild(tip);
  const showTip = (el, x, y) => {
    tip.querySelector('.tv').textContent = el.dataset.tv; tip.querySelector('.ta').textContent = el.dataset.ta;
    const b = tip.querySelector('.tb'); b.textContent = el.dataset.tb; b.style.setProperty('--c', el.dataset.tc);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, x + 14) + 'px'; tip.style.top = Math.max(8, y - r.height - 10) + 'px';
  };
  document.addEventListener('pointermove', (e) => { const el = e.target.closest && e.target.closest('[data-tv]'); if (el) showTip(el, e.clientX, e.clientY); else tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tv]'); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', () => { tip.hidden = true; });

  // light / dark: follows the system until the user picks one; the choice is remembered
  const root = document.documentElement;
  try { const t = localStorage.getItem('ncr.theme'); if (t === 'light' || t === 'dark') root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  $('#theme-btn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ncr.theme', root.dataset.theme); } catch (e) { /* ignore */ }
  });


  NCR.app = { render, toast, confirmModal, status };
  S.init().then(() => { status(); render(); });
})();
