// Page renderers. Each returns {html, bind?(root)}; app.js mounts them.
window.NCR = window.NCR || {};
(function (NCR) {
  const L = NCR.logic, S = NCR.store, st = S.state;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inf = (n) => L.info(n, st.settings);
  const options = (list, sel, blank) => (blank === undefined ? '' : `<option value="">${esc(blank)}</option>`) +
    list.map((o) => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
  // Keep a stored value selectable even if it was removed from settings.
  const withCurrent = (list, cur) => (cur && !list.includes(cur) ? list.concat(cur) : list);

  function stateBadge(i) { const m = L.STATE_META[i.state]; return `<span class="badge ${m.cls}">${m.icon} ${m.label}</span>`; }
  function dueText(n, i) {
    if (!n.Due_Date) return '<span class="muted">Not set</span>';
    let rel = '';
    if (!i.closed && i.dueDiff !== null) rel = i.dueDiff < 0 ? `<div class="sub bad">${-i.dueDiff}d overdue</div>` : i.dueDiff === 0 ? '<div class="sub warn">Today</div>' : `<div class="sub">in ${i.dueDiff}d</div>`;
    return `${L.fmtDate(n.Due_Date)}${rel}`;
  }
  function agingText(i) {
    if (i.aging === null) return '–';
    return `${i.aging}d${i.band ? ` <span class="chip ${i.band.cls}">${i.band.label}</span>` : ''}`;
  }
  const nextText = (n, i) => (n.Next_Action ? esc(n.Next_Action) : i.closed || i.ready ? '–' : '<span class="bad">⚠️ Required</span>');
  function remarkText(n, i) {
    if (i.closed) return n.Buyer_Remark ? `<span title="${esc(n.Buyer_Remark)}">${esc(n.Buyer_Remark)}</span>` : '–';
    if (i.noUpdate) return '<span class="chip age-escalation">📭 No buyer update</span>';
    return `<span title="${esc(n.Buyer_Remark)}">${esc(n.Buyer_Remark)}</span>${n.Buyer_Remark_Date ? `<div class="sub">${L.fmtDate(n.Buyer_Remark_Date)}</div>` : ''}`;
  }
  const countText = (n, i) => `${i.count}${i.escalate ? ' <span class="chip age-escalation" title="Escalation Recommended">⚠️ Escalate</span>' : ''}`;

  // ---------- shared tables ----------
  function fullTable(list) {
    if (!list.length) return '<div class="empty">No NCRs match.</div>';
    const rows = list.map((n) => {
      const i = inf(n);
      return `<tr class="row-${i.state}" data-href="#/ncr/${esc(n.NCR_ID)}">
        <td class="nowrap"><b>${esc(n.NCR_No)}</b></td><td>${esc(n.Item_No)}</td><td>${esc(n.Batch_No)}</td><td>${esc(n.Buyer)}</td>
        <td class="nowrap">${L.fmtDate(n.NCR_Date)}</td><td class="defect" title="${esc(n.Defect)}">${esc(n.Defect)}</td><td>${esc(n.Quantity)}</td>
        <td>${esc(n.Disposition) || '–'}</td><td>${nextText(n, i)}</td><td class="remark">${remarkText(n, i)}</td><td>${esc(n.Owner) || '–'}</td><td>${esc(n.Waiting_For) || '–'}</td>
        <td class="nowrap">${dueText(n, i)}</td><td class="nowrap">${agingText(i)}</td>
        <td class="nowrap">${stateBadge(i)}<div class="sub">${esc(n.Status)}</div></td>
        <td class="nowrap">${n.Last_Followup ? L.fmtDate(n.Last_Followup) : '–'}</td><td>${countText(n, i)}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="grid"><thead><tr><th>NCR No.</th><th>Item No.</th><th>Batch No.</th><th>Buyer</th><th>NCR Date</th><th>Defect</th><th>Qty</th>
      <th>Disposition</th><th>Next Action</th><th>Buyer Remark</th><th>Owner</th><th>Waiting For</th><th>Due Date</th><th>Aging</th><th>Status</th><th>Last Follow-up</th><th>F/U #</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function compactTable(list, emptyMsg) {
    if (!list.length) return `<div class="empty">${emptyMsg || 'Nothing here 🎉'}</div>`;
    const rows = list.map((n) => {
      const i = inf(n);
      return `<tr data-href="#/ncr/${esc(n.NCR_ID)}"><td class="nowrap"><b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)}</div></td>
        <td>${nextText(n, i)}<div class="sub">${esc(n.Defect)}</div></td><td class="remark">${remarkText(n, i)}</td><td>${esc(n.Owner) || '–'}</td><td>${esc(n.Waiting_For) || '–'}</td>
        <td class="nowrap">${dueText(n, i)}</td><td class="nowrap">${countText(n, i)}<div class="sub">${n.Last_Followup ? 'last ' + L.fmtDate(n.Last_Followup) : 'no follow-up'}</div></td>
        <td class="right"><button class="btn sm" data-action="followup" data-id="${esc(n.NCR_ID)}">Follow-up</button></td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="grid compact"><thead><tr><th>NCR</th><th>Next Action</th><th>Buyer Remark</th><th>Owner</th><th>Waiting For</th><th>Due</th><th>Follow-ups</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const byDue = (a, b) => (a.Due_Date || '9999') < (b.Due_Date || '9999') ? -1 : (a.Due_Date || '9999') > (b.Due_Date || '9999') ? 1 : 0;
  const open = () => st.ncrs.filter((n) => n.Status !== 'Closed');

  function buckets() {
    const o = open().map((n) => ({ n, i: inf(n) }));
    const pick = (fn) => o.filter(fn).map((x) => x.n);
    return {
      overdue: pick((x) => x.i.overdue).sort(byDue),
      today: pick((x) => x.i.dueToday),
      soon: pick((x) => x.i.dueSoon).sort(byDue),
      ready: pick((x) => x.i.ready),
      missing: pick((x) => x.i.missingNext),
      noUpdate: pick((x) => x.i.noUpdate).sort(byDue),
      action: pick((x) => x.i.actionRequired).sort((a, b) => {
        const rank = (n) => { const i = inf(n); return i.overdue ? 0 : i.dueToday ? 1 : i.ready ? 2 : 3; };
        return rank(a) - rank(b) || byDue(a, b);
      }),
    };
  }

  // ---------- dashboard ----------
  function dashboard() {
    const b = buckets(), month = L.todayISO().slice(0, 7);
    const closedMonth = st.ncrs.filter((n) => n.Status === 'Closed' && String(n.Closed_Date).slice(0, 7) === month).length;
    const card = (label, val, cls, filter) => `<a class="card stat ${cls}" href="#/list" data-filter='${esc(JSON.stringify(filter))}'><div class="num">${val}</div><div class="lbl">${label}</div></a>`;
    const waiting = {}; open().forEach((n) => { const k = n.Waiting_For || 'Not set'; waiting[k] = (waiting[k] || 0) + 1; });
    const keys = [...new Set([...st.settings.waitingFor, ...Object.keys(waiting)])].filter((k) => waiting[k] || st.settings.waitingFor.includes(k));
    const max = Math.max(1, ...Object.values(waiting));
    const wf = keys.map((k) => `<a class="wrow" href="#/list" data-filter='${esc(JSON.stringify({ waiting: k === 'Not set' ? '__none' : k, status: 'active' }))}'>
      <span class="wl">${esc(k)}</span><span class="bar"><i style="width:${((waiting[k] || 0) / max) * 100}%"></i></span><b>${waiting[k] || 0}</b></a>`).join('');
    return { html: `
      <div class="page-head"><h1>Dashboard</h1><span class="muted">${L.fmtDate(L.todayISO())}</span></div>
      <div class="cards">
        ${card('Total Open NCR', open().length, '', { status: 'active' })}
        ${card('Overdue', b.overdue.length, 'c-overdue', { status: 'active', due: 'overdue' })}
        ${card('Due Today', b.today.length, 'c-soon', { status: 'active', due: 'today' })}
        ${card('Due Soon', b.soon.length, 'c-soon', { status: 'active', due: 'soon' })}
        ${card('Ready to Close', b.ready.length, 'c-ready', { status: 'Ready to Close' })}
        ${card('Closed This Month', closedMonth, 'c-closed', { status: 'Closed' })}
      </div>
      ${b.missing.length ? `<div class="alert warn">⚠️ ${b.missing.length} open NCR${b.missing.length > 1 ? 's have' : ' has'} no Next Action: ${b.missing.slice(0, 6).map((n) => `<a href="#/ncr/${esc(n.NCR_ID)}">${esc(n.NCR_No)}</a>`).join(', ')}${b.missing.length > 6 ? '…' : ''}</div>` : ''}
      ${b.noUpdate.length ? `<div class="alert warn">📭 ${b.noUpdate.length} open NCR${b.noUpdate.length > 1 ? 's have' : ' has'} no buyer update in Remarks — QA must follow up. <a href="#/list" data-filter='${esc(JSON.stringify({ status: 'active', buyerUpdate: 'none' }))}'>View list</a></div>` : ''}
      <div class="grid2">
        <section class="card"><h2>Action Required <span class="count">${b.action.length}</span></h2><p class="hint">Overdue, due today, ready to close, missing a Next Action, or no buyer update.</p>${compactTable(b.action.slice(0, 10), 'Nothing needs action today.')}${b.action.length > 10 ? '<a href="#/today">See all on Today →</a>' : ''}</section>
        <section class="card"><h2>Waiting For</h2><p class="hint">Where open NCRs are blocked.</p><div class="waiting">${wf || '<div class="empty">No open NCRs.</div>'}</div></section>
      </div>
      <section class="card"><h2>🔴 Overdue NCRs <span class="count">${b.overdue.length}</span></h2>${compactTable(b.overdue, 'No overdue NCRs.')}</section>
      <section class="card"><h2>🟡 Due Soon <span class="count">${b.soon.length}</span></h2>${compactTable(b.soon, 'Nothing due in the next ' + st.settings.dueSoonDays + ' days.')}</section>` };
  }

  // ---------- today ----------
  function today() {
    const b = buckets();
    const sec = (title, list, empty) => `<section class="card"><h2>${title} <span class="count">${list.length}</span></h2>${compactTable(list, empty)}</section>`;
    return { html: `<div class="page-head"><h1>Today</h1><span class="muted">${L.fmtDate(L.todayISO())}</span></div>
      ${sec('🔴 Overdue', b.overdue, 'No overdue NCRs.')}${sec('🟡 Due Today', b.today, 'Nothing due today.')}
      ${sec('🟠 Due Soon', b.soon, 'Nothing due in the next ' + st.settings.dueSoonDays + ' days.')}
      ${sec('🔵 Ready to Close', b.ready, 'Nothing waiting for QA verification.')}
      ${sec('📭 No Buyer Update (Remarks empty) – QA follows up', b.noUpdate, 'Every open NCR has a buyer update.')}
      ${b.missing.length ? sec('⚠️ Missing Next Action', b.missing) : ''}` };
  }

  // ---------- list ----------
  const LF = { q: '', buyer: '', status: 'active', owner: '', waiting: '', disposition: '', due: '', overdueOnly: false, buyerUpdate: '', sort: 'due', dir: 'asc' };
  function setFilter(f) { Object.assign(LF, { q: '', buyer: '', status: 'active', owner: '', waiting: '', disposition: '', due: '', overdueOnly: false, buyerUpdate: '', sort: 'due', dir: 'asc' }, f); }

  function filtered() {
    const q = LF.q.trim().toLowerCase();
    let list = st.ncrs.filter((n) => {
      const i = inf(n);
      if (q && !(`${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))) return false;
      if (LF.buyer && n.Buyer !== LF.buyer) return false;
      if (LF.status === 'active' ? i.closed : LF.status !== 'all' && n.Status !== LF.status) return false;
      if (LF.owner && n.Owner !== LF.owner) return false;
      if (LF.waiting && (LF.waiting === '__none' ? n.Waiting_For : n.Waiting_For !== LF.waiting)) return false;
      if (LF.disposition && n.Disposition !== LF.disposition) return false;
      if (LF.overdueOnly && !i.overdue) return false;
      if (LF.buyerUpdate === 'none' && !(String(n.Buyer_Remark || '').trim() === '')) return false;
      if (LF.buyerUpdate === 'has' && String(n.Buyer_Remark || '').trim() === '') return false;
      if (LF.due === 'overdue' && !i.overdue) return false;
      if (LF.due === 'today' && !i.dueToday) return false;
      if (LF.due === 'soon' && !i.dueSoon) return false;
      if (LF.due === 'week' && !(!i.closed && i.dueDiff !== null && i.dueDiff >= 0 && i.dueDiff <= 7)) return false;
      if (LF.due === 'none' && n.Due_Date) return false;
      return true;
    });
    const key = { due: (n) => n.Due_Date || '', aging: (n) => inf(n).aging, date: (n) => n.NCR_Date || '' }[LF.sort];
    const dir = LF.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const x = key(a), y = key(b);
      if (LF.sort === 'due') { if (!x && y) return 1; if (x && !y) return -1; }
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    return list;
  }
  function listBody() {
    const list = filtered();
    return `<div class="muted small">${list.length} of ${st.ncrs.length} NCRs</div>${fullTable(list)}`;
  }
  function list() {
    const s = st.settings;
    const sel = (id, label, html) => `<label>${label}<select id="${id}">${html}</select></label>`;
    return { html: `<div class="page-head"><h1>NCR List</h1><button class="btn primary" data-action="add">+ Add NCR</button></div>
      <div class="card filters">
        <label class="grow">Search<input id="f-q" type="search" placeholder="NCR No., Item No. or Batch No." value="${esc(LF.q)}"></label>
        ${sel('f-status', 'Status', `<option value="active">All open</option><option value="all">All incl. closed</option>${options(L.STATUSES, LF.status)}`)}
        ${sel('f-buyer', 'Buyer', options(S.buyers(), LF.buyer, 'All'))}
        ${sel('f-owner', 'Owner', options(S.owners(), LF.owner, 'All'))}
        ${sel('f-waiting', 'Waiting For', `<option value="">All</option><option value="__none"${LF.waiting === '__none' ? ' selected' : ''}>Not set</option>${options(s.waitingFor, LF.waiting)}`)}
        ${sel('f-disposition', 'Disposition', options(s.dispositions, LF.disposition, 'All'))}
        ${sel('f-due', 'Due Date', [['', 'Any'], ['overdue', 'Overdue'], ['today', 'Today'], ['soon', 'Due soon'], ['week', 'Next 7 days'], ['none', 'No due date']].map(([v, l]) => `<option value="${v}"${LF.due === v ? ' selected' : ''}>${l}</option>`).join(''))}
        ${sel('f-bu', 'Buyer Update', [['', 'Any'], ['none', 'No update'], ['has', 'Has update']].map(([v, l]) => `<option value="${v}"${LF.buyerUpdate === v ? ' selected' : ''}>${l}</option>`).join(''))}
        ${sel('f-sort', 'Sort by', [['due', 'Due Date'], ['aging', 'Aging'], ['date', 'NCR Date']].map(([v, l]) => `<option value="${v}"${LF.sort === v ? ' selected' : ''}>${l}</option>`).join(''))}
        <button class="btn" id="f-dir" title="Toggle direction">${LF.dir === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
        <label class="check"><input type="checkbox" id="f-over"${LF.overdueOnly ? ' checked' : ''}> Overdue only</label>
        <button class="btn" id="f-clear">Clear</button>
      </div>
      <div class="legend">🔴 Overdue &nbsp; 🟡 Due Soon &nbsp; 🟢 On Track &nbsp; 🔵 Ready to Close &nbsp; ⚫ Closed</div>
      <div id="list-body">${listBody()}</div>`,
    bind(root) {
      const refresh = () => { root.querySelector('#list-body').innerHTML = listBody(); };
      const map = { 'f-q': 'q', 'f-status': 'status', 'f-buyer': 'buyer', 'f-owner': 'owner', 'f-waiting': 'waiting', 'f-disposition': 'disposition', 'f-due': 'due', 'f-bu': 'buyerUpdate', 'f-sort': 'sort' };
      const statusSel = root.querySelector('#f-status'); statusSel.value = LF.status;
      Object.keys(map).forEach((id) => root.querySelector('#' + id).addEventListener('input', (e) => { LF[map[id]] = e.target.value; refresh(); }));
      root.querySelector('#f-over').addEventListener('change', (e) => { LF.overdueOnly = e.target.checked; refresh(); });
      root.querySelector('#f-dir').addEventListener('click', (e) => { LF.dir = LF.dir === 'asc' ? 'desc' : 'asc'; e.target.textContent = LF.dir === 'asc' ? '↑ Asc' : '↓ Desc'; refresh(); });
      root.querySelector('#f-clear').addEventListener('click', () => { setFilter({}); NCR.app.render(); });
    },
    refresh: () => { const el = document.querySelector('#list-body'); if (el) el.innerHTML = listBody(); } };
  }

  // ---------- detail ----------
  function detail(id) {
    const n = S.getNcr(id);
    if (!n) return { html: '<div class="empty">NCR not found. <a href="#/list">Back to list</a></div>' };
    const i = inf(n), s = st.settings;
    const hist = S.historyFor(id).map((h) => `<li><div class="t-date">${L.fmtDate(h.Date)}</div><div class="t-body">
      ${h.Followup_No ? `<span class="chip fu">Follow-up #${esc(h.Followup_No)}</span> ` : ''}<b>${esc(h.Action)}</b>
      ${h.Waiting_For ? `<div class="sub">Waiting for: ${esc(h.Waiting_For)}</div>` : ''}${h.Created_By ? `<div class="sub">By: ${esc(h.Created_By)}</div>` : ''}
      ${h.Remark ? `<div class="sub">${esc(h.Remark)}</div>` : ''}</div></li>`).join('');
    const info = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '–'}</b></div>`;
    return { html: `
      <div class="page-head"><div><a href="#/list" class="muted">← NCR List</a><h1>${esc(n.NCR_No)} ${stateBadge(i)}</h1></div>
        <div class="btns">
          <button class="btn primary" data-action="followup" data-id="${esc(id)}">📨 Follow-up</button>
          ${i.closed ? '<button class="btn" data-action="reopen" data-id="' + esc(id) + '">Reopen</button>' : `
            ${n.Status !== 'Ready to Close' ? `<button class="btn" data-action="ready" data-id="${esc(id)}">Mark Ready to Close</button>` : ''}
            <button class="btn ok" data-action="close" data-id="${esc(id)}">Verify &amp; Close NCR</button>`}
          <button class="btn" data-action="edit" data-id="${esc(id)}">Edit NCR</button>
        </div></div>
      ${i.missingNext ? '<div class="alert bad">⚠️ Next Action is required for this NCR.</div>' : ''}
      ${i.noUpdate ? '<div class="alert warn">📭 Buyer has not written any progress in Remarks — QA must follow up with the Buyer.</div>' : ''}
      ${i.escalate ? `<div class="alert warn">⚠️ Escalation Recommended — ${i.count} follow-ups so far (threshold ${s.escalationThreshold}).</div>` : ''}
      ${i.ready ? '<div class="alert info">🔵 Required action is complete. QA to verify evidence and close.</div>' : ''}
      <div class="grid2">
        <section class="card"><h2>NCR Information</h2><div class="kvs">
          ${info('NCR No.', n.NCR_No)}${info('Item No.', n.Item_No)}${info('Batch No.', n.Batch_No)}${info('NCR Date', L.fmtDate(n.NCR_Date))}
          ${info('Buyer', n.Buyer)}${info('Supplier', n.Supplier)}${info('Quantity', n.Quantity)}
          ${info('Aging', i.aging === null ? '' : i.aging + ' days' + (i.band ? ' – ' + i.band.label : ''))}
          ${i.closed ? info('Closed Date', L.fmtDate(n.Closed_Date)) : ''}</div>
          <div class="kv block"><span>Defect Description</span><b>${esc(n.Defect) || '–'}</b></div>
          <div class="kv block"><span>Buyer Remark (from Excel)${n.Buyer_Remark_Date ? ' · updated ' + L.fmtDate(n.Buyer_Remark_Date) : ''}</span><b>${n.Buyer_Remark ? esc(n.Buyer_Remark) : '<span class="bad">No buyer update yet</span>'}</b></div></section>
        <section class="card"><h2>Follow-up Control</h2>
          <form id="ctl" class="form">
            <label>Disposition<select name="Disposition">${options(withCurrent(s.dispositions, n.Disposition), n.Disposition, '— select —')}</select></label>
            <label>Current Status<select name="Status">${options(L.STATUSES, n.Status)}</select></label>
            <label>Next Action<select name="Next_Action">${options(withCurrent(s.nextActions, n.Next_Action), n.Next_Action, '— required —')}</select></label>
            <label>Owner<input name="Owner" list="owners" value="${esc(n.Owner)}"></label>
            <label>Waiting For<select name="Waiting_For">${options(withCurrent(s.waitingFor, n.Waiting_For), n.Waiting_For, '— select —')}</select></label>
            <label>Due Date<input type="date" name="Due_Date" value="${esc(n.Due_Date)}"></label>
            <label class="full">Remark<textarea name="Remark" rows="2">${esc(n.Remark)}</textarea></label>
            <div class="kv"><span>Last Follow-up</span><b>${n.Last_Followup ? L.fmtDate(n.Last_Followup) : '–'}</b></div>
            <div class="kv"><span>Follow-up Count</span><b>${i.count} · ${L.followupLabel(i.count)}</b></div>
            <div class="full actions"><label class="check"><input type="checkbox" name="rec" checked> Record changes in history</label>
              <button class="btn primary" type="submit">Save changes</button></div>
          </form></section>
      </div>
      <section class="card"><div class="row-between"><h2>Follow-up History <span class="count">${S.historyFor(id).length}</span></h2>
        <button class="btn sm" data-action="note" data-id="${esc(id)}">+ Add entry</button></div>
        ${hist ? `<ul class="timeline">${hist}</ul>` : '<div class="empty">No history yet.</div>'}</section>
      <datalist id="owners">${S.owners().map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`,
    bind(root) {
      root.querySelector('#ctl').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target), upd = Object.assign({}, n);
        ['Disposition', 'Status', 'Next_Action', 'Owner', 'Waiting_For', 'Due_Date', 'Remark'].forEach((k) => { upd[k] = f.get(k) || ''; });
        S.saveNcr(upd, { recordChanges: !!f.get('rec'), by: 'QA' });
        NCR.app.toast('Saved');
      });
    } };
  }

  // ---------- import ----------
  const imp = { wb: null, name: '', sheet: '', table: null, mapping: {}, opts: { markMissingReady: false, markClosedReady: true }, done: null };
  function importPage() {
    const I = NCR.importer;
    let body = '';
    if (imp.done) body += `<div class="alert ok">✅ Import complete: ${imp.done}</div>`;
    if (imp.table) {
      const { records, bad } = I.buildRecords(imp.table, imp.mapping);
      const p = I.plan(records, st.ncrs);
      const missingReq = I.FIELDS.filter((f) => f.required && !imp.mapping[f.key]);
      const mapRows = I.FIELDS.map((f) => `<label>${f.label}${f.required ? ' *' : ''}<select data-map="${f.key}">${options(imp.table.headers, imp.mapping[f.key], '— not in file —')}</select></label>`).join('');
      const sample = (arr, fn) => arr.slice(0, 8).map(fn).join('');
      body += `<section class="card"><h2>2. Check column mapping</h2><p class="hint">File: <b>${esc(imp.name)}</b>${imp.wb.SheetNames.length > 1 ? ` · Sheet: <select id="imp-sheet">${options(imp.wb.SheetNames, imp.sheet)}</select>` : ''} · header row ${imp.table.headerRow} · ${imp.table.rows.length} data rows</p>
        <div class="form cols3">${mapRows}</div>
        ${missingReq.length ? `<div class="alert bad">Map the required column(s): ${missingReq.map((f) => f.label).join(', ')}</div>` : ''}</section>
        <section class="card"><h2>3. Preview</h2>
          <div class="cards small"><div class="card stat"><div class="num">${p.added.length}</div><div class="lbl">New NCRs</div></div>
          <div class="card stat"><div class="num">${p.updated.length}</div><div class="lbl">Updated</div></div>
          <div class="card stat"><div class="num">${p.unchanged.length}</div><div class="lbl">Unchanged</div></div>
          <div class="card stat ${p.closedInFile.length ? 'c-ready' : ''}"><div class="num">${p.closedInFile.length}</div><div class="lbl">Closed in file (still open here)</div></div></div>
          <p class="hint">Existing follow-up data (Next Action, Owner, Due Date, Status, history…) is never overwritten. Only raw fields (item, batch, supplier, buyer, date, defect, quantity) are refreshed.</p>
          ${bad.length ? `<details class="alert warn"><summary>${bad.length} row(s) with issues</summary>${bad.slice(0, 20).map((b) => `<div>Row ${b.row}: ${esc(b.reason)}</div>`).join('')}</details>` : ''}
          ${p.added.length ? `<h3>New</h3><div class="table-wrap"><table class="grid compact"><thead><tr><th>NCR</th><th>Item</th><th>Batch</th><th>Date</th><th>Buyer</th><th>Defect</th></tr></thead><tbody>${sample(p.added, (r) => `<tr><td>${esc(r.NCR_No)}</td><td>${esc(r.Item_No)}</td><td>${esc(r.Batch_No)}</td><td>${L.fmtDate(r.NCR_Date)}</td><td>${esc(r.Buyer)}</td><td>${esc(r.Defect)}</td></tr>`)}</tbody></table></div>${p.added.length > 8 ? `<div class="muted small">…and ${p.added.length - 8} more</div>` : ''}` : ''}
          ${p.updated.length ? `<h3>Updated</h3>${sample(p.updated, (u) => `<div class="small"><b>${esc(u.rec.NCR_No)}</b>: ${u.changes.map((c) => `${esc(c.field.replace('_', ' '))} "${esc(c.from)}" → "${esc(c.to)}"`).join('; ')}</div>`)}${p.updated.length > 8 ? `<div class="muted small">…and ${p.updated.length - 8} more</div>` : ''}` : ''}
          ${p.skippedClosed.length ? `<p class="hint">${p.skippedClosed.length} new NCR(s) already Closed in the file are skipped.</p>` : ''}
          ${p.closedInFile.length ? `<label class="check block"><input type="checkbox" id="imp-closed"${imp.opts.markClosedReady ? ' checked' : ''}> Mark the ${p.closedInFile.length} NCR(s) closed in the file as <b>Ready to Close</b> (QA still verifies and closes): ${esc(p.closedInFile.slice(0, 6).map((n) => n.NCR_No).join(', '))}${p.closedInFile.length > 6 ? '…' : ''}</label>` : ''}
          ${p.missing.length ? `<label class="check block"><input type="checkbox" id="imp-missing"${imp.opts.markMissingReady ? ' checked' : ''}> Mark the ${p.missing.length} open NCR(s) not in this file as <b>Ready to Close</b> (QA still verifies and closes): ${esc(p.missing.slice(0, 6).map((n) => n.NCR_No).join(', '))}${p.missing.length > 6 ? '…' : ''}</label>` : ''}
          <div class="actions"><button class="btn primary" id="imp-go"${missingReq.length || (!p.added.length && !p.updated.length && !(imp.opts.markMissingReady && p.missing.length) && !(imp.opts.markClosedReady && p.closedInFile.length)) ? ' disabled' : ''}>Import into NCR Master</button>
          <button class="btn" id="imp-cancel">Cancel</button></div></section>`;
    }
    return { html: `<div class="page-head"><h1>Import from Excel</h1></div>
      <section class="card"><h2>1. Upload raw data</h2><p class="hint">Upload the periodic NCR export (.xlsx, .xls or .csv). New NCRs are added; existing ones (matched by NCR No.) keep all QA follow-up data.</p>
        <label class="drop" id="drop"><input type="file" id="imp-file" accept=".xlsx,.xls,.xlsm,.csv" hidden><span>📁 Click or drop an Excel file here</span></label></section>${body}`,
    bind(root) {
      const I2 = NCR.importer;
      const load = async (file) => {
        try {
          if (typeof XLSX === 'undefined') throw new Error('Excel library not loaded (check internet connection)');
          imp.wb = I2.readWorkbook(await file.arrayBuffer()); imp.name = file.name; imp.done = null;
          const best = imp.wb.SheetNames.map((nm) => [nm, (imp.wb.Sheets[nm]['!ref'] || '').length]).sort((a, b) => b[1] - a[1])[0][0];
          pickSheet(best);
        } catch (e) { NCR.app.toast('Could not read file: ' + e.message, true); }
      };
      const pickSheet = (nm) => { imp.sheet = nm; imp.table = I2.sheetTable(imp.wb, nm); imp.mapping = I2.autoMap(imp.table.headers, st.settings.importMapping); NCR.app.render(); };
      const fi = root.querySelector('#imp-file');
      fi.addEventListener('change', () => fi.files[0] && load(fi.files[0]));
      const drop = root.querySelector('#drop');
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && load(e.dataTransfer.files[0]));
      const sh = root.querySelector('#imp-sheet'); if (sh) sh.addEventListener('change', () => pickSheet(sh.value));
      root.querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => { imp.mapping[s.dataset.map] = s.value; NCR.app.render(); }));
      const miss = root.querySelector('#imp-missing'); if (miss) miss.addEventListener('change', () => { imp.opts.markMissingReady = miss.checked; NCR.app.render(); });
      const cl = root.querySelector('#imp-closed'); if (cl) cl.addEventListener('change', () => { imp.opts.markClosedReady = cl.checked; NCR.app.render(); });
      const cancel = root.querySelector('#imp-cancel'); if (cancel) cancel.addEventListener('click', () => { imp.table = null; imp.wb = null; NCR.app.render(); });
      const go = root.querySelector('#imp-go');
      if (go) go.addEventListener('click', () => {
        const { records } = I2.buildRecords(imp.table, imp.mapping);
        const p = I2.plan(records, st.ncrs), r = I2.apply(p, imp.opts);
        S.saveMany(r.ncrs, r.history);
        S.saveSettings({ importMapping: Object.assign({}, imp.mapping) });
        imp.done = `${p.added.length} added, ${p.updated.length} updated${imp.opts.markClosedReady && p.closedInFile.length ? ', ' + p.closedInFile.length + ' closed-in-file marked Ready to Close' : ''}${imp.opts.markMissingReady && p.missing.length ? ', ' + p.missing.length + ' missing marked Ready to Close' : ''}.`;
        imp.table = null; imp.wb = null; NCR.app.render();
      });
    } };
  }

  // ---------- settings ----------
  function settings() {
    const s = st.settings, cfg = S.getApiConfig(), bands = s.agingBands;
    const ta = (k, l) => `<label>${l}<textarea name="${k}" rows="8">${esc((s[k] || []).join('\n'))}</textarea></label>`;
    return { html: `<div class="page-head"><h1>Settings</h1></div>
      <section class="card"><h2>Data source</h2>
        <p class="hint">Mode: <b>${st.mode === 'sheets' ? 'Google Sheets (live)' : 'Demo – data stored only in this browser'}</b>. See README for the 5-minute Apps Script setup.</p>
        <form id="api" class="form"><label class="full">Apps Script Web App URL<input name="url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
          <label>API key (optional)<input name="key" value="${esc(cfg.key || '')}"></label>
          <div class="full actions"><button class="btn primary" type="submit">Save &amp; connect</button>
          ${st.mode === 'demo' ? '<button class="btn" type="button" id="reset-demo">Reset demo data</button>' : ''}</div></form></section>
      <form id="cfg" class="card"><h2>Dropdowns &amp; thresholds</h2><p class="hint">One option per line.</p>
        <div class="form cols3">${ta('dispositions', 'Disposition')}${ta('nextActions', 'Next Action')}${ta('waitingFor', 'Waiting For')}${ta('owners', 'Owners (suggestions)')}</div>
        <div class="form cols3"><label>Due Soon window (days)<input type="number" min="1" name="dueSoonDays" value="${s.dueSoonDays}"></label>
          <label>Escalate at follow-up count ≥<input type="number" min="1" name="escalationThreshold" value="${s.escalationThreshold}"></label></div>
        <h3>Aging bands (days)</h3><div class="form cols3">
          <label>Normal up to<input type="number" min="1" name="b0" value="${bands[0].max}"></label>
          <label>Follow-up up to<input type="number" min="1" name="b1" value="${bands[1].max}"></label>
          <label>Attention up to (above = Escalation)<input type="number" min="1" name="b2" value="${bands[2].max}"></label></div>
        <div class="actions"><button class="btn primary" type="submit">Save settings</button></div></form>`,
    bind(root) {
      root.querySelector('#api').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        S.setApiConfig({ url: String(f.get('url')).trim(), key: String(f.get('key')).trim() });
        await S.init(); NCR.app.toast(st.error || 'Connected'); NCR.app.render();
      });
      const rd = root.querySelector('#reset-demo'); if (rd) rd.addEventListener('click', async () => { if (confirm('Reset demo data?')) { await S.resetDemo(); NCR.app.toast('Demo data reset'); } });
      root.querySelector('#cfg').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        const lines = (k) => String(f.get(k)).split('\n').map((x) => x.trim()).filter(Boolean);
        const num = (k, d) => Math.max(1, parseInt(f.get(k), 10) || d);
        const b0 = num('b0', 7), b1 = Math.max(b0 + 1, num('b1', 14)), b2 = Math.max(b1 + 1, num('b2', 30));
        const B = L.DEFAULT_SETTINGS.agingBands;
        S.saveSettings({ dispositions: lines('dispositions'), nextActions: lines('nextActions'), waitingFor: lines('waitingFor'), owners: lines('owners'),
          dueSoonDays: num('dueSoonDays', 2), escalationThreshold: num('escalationThreshold', 3),
          agingBands: [Object.assign({}, B[0], { max: b0 }), Object.assign({}, B[1], { max: b1 }), Object.assign({}, B[2], { max: b2 }), B[3]] });
        NCR.app.toast('Settings saved');
      });
    } };
  }

  NCR.views = { esc, options, withCurrent, dashboard, today, list, detail, importPage, settings, setFilter, inf };
})(window.NCR);
