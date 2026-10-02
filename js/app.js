// App shell: routing, modals, global actions, auto-refresh.
(function () {
  const L = NCR.logic, S = NCR.store, V = NCR.views, st = S.state, esc = V.esc;
  const $ = (s) => document.querySelector(s);
  const main = $('#main'), modal = $('#modal');
  let current = null;

  function route() {
    const [page, arg] = location.hash.replace(/^#\//, '').split('/');
    return { page: page || 'dashboard', arg: arg && decodeURIComponent(arg) };
  }

  function render() {
    if (!st.loaded) { main.innerHTML = `<div class="empty">${st.error ? esc(st.error) : 'Loading…'}</div>`; return; }
    const { page, arg } = route();
    const views = { dashboard: V.dashboard, today: V.today, list: V.list, ncr: () => V.detail(arg), import: V.importPage, settings: V.settings };
    current = (views[page] || V.dashboard)();
    main.innerHTML = current.html;
    if (current.bind) current.bind(main);
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + (page === 'ncr' ? 'list' : page)));
    window.scrollTo(0, window.__keepScroll || 0); window.__keepScroll = 0;
  }

  function status() {
    const open = st.ncrs.filter((n) => n.Status !== 'Closed' && V.inf(n).actionRequired).length;
    $('#today-badge').textContent = open || '';
    const el = $('#sync');
    el.className = 'sync' + (st.error ? ' err' : '');
    el.textContent = st.error ? '⚠️ ' + st.error : st.saving ? 'Saving…' : st.mode === 'sheets' ? '✓ Synced with Google Sheets' : '';
    $('#mode').hidden = st.mode !== 'demo';
  }

  S.subscribe(() => {
    status();
    const a = document.activeElement;
    const editing = a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (st.loaded && !modal.open && !editing) { window.__keepScroll = window.scrollY; render(); }
  });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

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

  function ncrForm(id) {
    const n = id ? S.getNcr(id) : { NCR_Date: L.todayISO(), Status: 'Not Started' }, s = st.settings, edit = !!id;
    const inp = (name, label, o) => `<label>${label}${o && o.req ? ' *' : ''}<input name="${name}" value="${esc(n[name])}"${o && o.req ? ' required' : ''}${o && o.type ? ` type="${o.type}"` : ''}${o && o.list ? ` list="${o.list}"` : ''}></label>`;
    openModal(`<form id="nf" class="form modal-form"><h2>${edit ? 'Edit ' + esc(n.NCR_No) : 'Add NCR'}</h2>
      ${inp('NCR_No', 'NCR No.', { req: 1 })}${inp('Item_No', 'Item No.', { req: 1 })}${inp('Batch_No', 'Batch No.', { req: 1 })}
      ${inp('NCR_Date', 'NCR Date', { req: 1, type: 'date' })}${inp('Buyer', 'Buyer', { req: 1, list: 'buyers' })}${inp('Quantity', 'Quantity', { req: 1 })}
      <label class="full">Defect *<textarea name="Defect" rows="2" required>${esc(n.Defect)}</textarea></label>
      <details class="full" ${edit ? 'open' : ''}><summary>Optional / follow-up details</summary><div class="form inner">
        ${inp('Supplier', 'Supplier')}
        <label>Disposition<select name="Disposition">${V.options(V.withCurrent(s.dispositions, n.Disposition), n.Disposition, '—')}</select></label>
        <label>Next Action<select name="Next_Action">${V.options(V.withCurrent(s.nextActions, n.Next_Action), n.Next_Action, '—')}</select></label>
        ${inp('Owner', 'Owner', { list: 'owners' })}
        <label>Waiting For<select name="Waiting_For">${V.options(V.withCurrent(s.waitingFor, n.Waiting_For), n.Waiting_For, '—')}</select></label>
        ${inp('Due_Date', 'Due Date', { type: 'date' })}
        ${edit ? `<label>Status<select name="Status">${V.options(L.STATUSES, n.Status)}</select></label>` : ''}
        <label class="full">Remark<textarea name="Remark" rows="2">${esc(n.Remark)}</textarea></label></div></details>
      <datalist id="buyers">${S.buyers().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <datalist id="owners">${S.owners().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <div class="full actions">${edit ? '<label class="check"><input type="checkbox" name="rec" checked> Record changes in history</label>' : ''}
        ${edit ? '<button type="button" class="btn danger" id="nf-del">Delete</button>' : ''}<span class="grow"></span>
        <button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${edit ? 'Save' : 'Add NCR'}</button></div></form>`, (m) => {
      m.querySelector('#nf').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target), upd = Object.assign({}, n);
        S.NCR_FIELDS.forEach((k) => { if (f.has(k)) upd[k] = String(f.get(k)).trim(); });
        if (st.ncrs.some((x) => x.NCR_ID !== upd.NCR_ID && String(x.NCR_No).trim().toLowerCase() === upd.NCR_No.toLowerCase())) { toast('NCR No. already exists', true); return; }
        const saved = S.saveNcr(upd, { recordChanges: !!f.get('rec'), by: 'QA' });
        modal.close(); toast(edit ? 'Saved' : 'NCR added');
        if (!edit) location.hash = '#/ncr/' + saved.NCR_ID;
      });
      const del = m.querySelector('#nf-del');
      if (del) del.addEventListener('click', () => {
        if (confirm(`Delete ${n.NCR_No} and its history? This cannot be undone.`)) { S.removeNcr(id); modal.close(); location.hash = '#/list'; }
      });
    });
  }

  // Follow-up (message + record) and plain history entry share one dialog.
  function historyModal(id, isFollowup) {
    const n = S.getNcr(id), s = st.settings;
    const who = n.Waiting_For || 'Purchasing';
    const msg = L.followupMessage(n, s);
    const next = (Number(n.Followup_Count) || 0) + 1;
    openModal(`<form id="hf" class="form modal-form"><h2>${isFollowup ? `Follow-up #${next} – ${esc(n.NCR_No)}` : 'Add history entry – ' + esc(n.NCR_No)}</h2>
      ${isFollowup ? `<label class="full">Message (editable)<textarea id="msg" rows="9">${esc(msg)}</textarea></label>
        <div class="full"><button type="button" class="btn" id="copy">📋 Copy message</button> <span class="muted small">Paste into Teams / email, then record it below.</span></div><hr class="full">` : ''}
      <label>Date<input type="date" name="date" value="${L.todayISO()}" required></label>
      <label>Person / department<input name="by" list="owners" value="${isFollowup ? esc(who) : ''}"></label>
      <label class="full">Action / note *<input name="action" required value="${isFollowup ? esc('Asked ' + who + ' for status update') : ''}" placeholder="e.g. Evidence received"></label>
      <label>Waiting For<select name="waiting">${V.options(V.withCurrent(s.waitingFor, n.Waiting_For), n.Waiting_For, '— unchanged —')}</select></label>
      <label>Remark<input name="remark"></label>
      <datalist id="owners">${S.owners().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <div class="full actions">${isFollowup ? '' : '<label class="check"><input type="checkbox" name="count"> Count as follow-up</label>'}<span class="grow"></span>
        <button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${isFollowup ? 'Record follow-up' : 'Add entry'}</button></div></form>`, (m) => {
      const c = m.querySelector('#copy'); if (c) c.addEventListener('click', () => copyText(m.querySelector('#msg').value));
      m.querySelector('#hf').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        S.addHistory(id, { date: f.get('date'), by: f.get('by'), action: f.get('action'), waiting: f.get('waiting'), remark: f.get('remark'), countAsFollowup: isFollowup || !!f.get('count') });
        modal.close(); toast(isFollowup ? 'Follow-up recorded' : 'Entry added');
      });
    });
  }

  function closeModal(id) {
    const n = S.getNcr(id);
    openModal(`<form id="cf" class="form modal-form"><h2>Verify &amp; close ${esc(n.NCR_No)}</h2>
      <p class="full">Confirm QA has verified the required action and evidence. The NCR will be closed as of today.</p>
      <label class="full">Verification note<input name="note" value="QA verified and closed"></label>
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn ok" type="submit">Close NCR</button></div></form>`, (m) => {
      m.querySelector('#cf').addEventListener('submit', (e) => {
        e.preventDefault();
        S.saveNcr(Object.assign({}, n, { Status: 'Closed', Closed_Date: L.todayISO() }));
        S.addHistory(id, { action: new FormData(e.target).get('note') || 'QA verified and closed', by: 'QA' });
        modal.close(); toast('NCR closed');
      });
    });
  }

  const actions = {
    add: () => ncrForm(),
    edit: (el) => ncrForm(el.dataset.id),
    followup: (el) => historyModal(el.dataset.id, true),
    note: (el) => historyModal(el.dataset.id, false),
    close: (el) => closeModal(el.dataset.id),
    ready: (el) => {
      const n = S.getNcr(el.dataset.id);
      S.saveNcr(Object.assign({}, n, { Status: 'Ready to Close', Next_Action: n.Next_Action || 'Close NCR' }));
      S.addHistory(n.NCR_ID, { action: 'Required action completed – Ready to Close (QA to verify)', by: 'QA' }); toast('Marked Ready to Close');
    },
    reopen: (el) => {
      const n = S.getNcr(el.dataset.id);
      S.saveNcr(Object.assign({}, n, { Status: 'Open' }));
      S.addHistory(n.NCR_ID, { action: 'NCR reopened', by: 'QA' }); toast('Reopened');
    },
  };

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act) { e.preventDefault(); e.stopPropagation(); actions[act.dataset.action](act); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { V.setFilter(JSON.parse(f.dataset.filter)); return; }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,input,select')) location.hash = row.dataset.href;
  });
  $('#add-btn').addEventListener('click', () => ncrForm());

  // Auto-load: refresh when the tab regains focus and every minute (Sheets mode only).
  function autoRefresh() { if (st.mode === 'sheets' && !st.saving && !modal.open) S.reload(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
  setInterval(autoRefresh, 60000);

  NCR.app = { render, toast };
  S.init().then(() => { status(); render(); });
})();
