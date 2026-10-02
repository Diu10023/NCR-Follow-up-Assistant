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
    if (!st.loaded) { main.innerHTML = `<div class="empty">${st.error ? esc(st.error) : 'Loading…'}</div>`; return; }
    const { page, arg } = route();
    const views = { home: V.home, overview: V.home, dashboard: V.home, closed: V.closedPage, followed: V.followedPage, hold: V.holdPage, today: V.list, list: V.list, ncr: () => V.detail(arg), import: V.importPage, settings: V.settings };
    current = (views[page] || V.home)();
    current.closed = page === 'ncr' && (S.getNcr(arg) || {}).Status === 'Closed';
    main.innerHTML = (page === 'home' || page === 'overview' || page === 'dashboard' ? '' : '<div class="backbar"><button class="btn sm" data-action="back">← Back</button></div>') + current.html;
    if (current.bind) current.bind(main);
    document.querySelectorAll('nav a, .rail a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + (page === 'today' ? 'list' : page === 'ncr' ? (current.closed ? 'closed' : 'list') : page === 'overview' || page === 'dashboard' ? 'home' : page)));
    updateBulkBar();
    window.scrollTo({ top: window.__keepScroll || 0, behavior: 'instant' }); window.__keepScroll = 0;
  }

  function status() {
    const by = { todo: 0, followed: 0, hold: 0, jira: 0 };
    st.ncrs.forEach((n) => { const k = V.inf(n).bucket; if (k in by) by[k]++; });
    $('#today-badge').textContent = by.todo;      // still to follow up
    $('#fu-badge').textContent = by.followed;     // followed up, not closed yet
    $('#hold-badge').textContent = by.hold + by.jira;
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

  const plusDays = (n) => L.addDays(L.todayISO(), n);
  const buyerNames = (list) => [...new Set(list.map((n) => V.buyerOf(n)))];

  // Follow-up for one or many NCRs: copy the message, record it, and set the next check date.
  function followupModal(ids) {
    const list = ids.map(S.getNcr).filter(Boolean), s = st.settings;
    if (!list.length) return;
    const one = list.length === 1, n0 = list[0];
    const groups = {}; list.forEach((n) => { (groups[V.buyerOf(n)] = groups[V.buyerOf(n)] || []).push(n); });
    const msgs = one ? [['', L.followupMessage(n0, s)]] : Object.keys(groups).sort().map((b) => [b, L.buyerMessage(b === V.NO_BUYER ? '' : b, groups[b].slice().sort((x, y) => String(x.NCR_Date).localeCompare(String(y.NCR_Date))))]);
    const who = one ? (n0.Waiting_For || n0.Buyer || 'Purchasing') : '{buyer}'; // several NCRs: each history entry names its own buyer
    const nextDefault = plusDays(s.defaultCheckDays);
    const allWaiting = [...new Set(list.map((n) => n.Waiting_For))];
    openModal(`<form id="hf" class="form modal-form"><h2>${one ? `Follow-up #${(Number(n0.Followup_Count) || 0) + 1} – ${esc(n0.NCR_No)}` : `Follow-up – ${list.length} NCRs`}</h2>
      <ol class="steps full"><li><b>Copy</b> the message below and send it to the buyer (Teams or email).</li><li><b>Choose</b> when you will check again.</li><li><b>Press Record</b>. The NCR moves to Followed up and stays there until it is closed. On the check date it is flagged so you chase again.</li></ol>
      ${msgs.map(([b, m], k) => `<div class="full"><label>${one ? 'Message (editable)' : 'Message for ' + esc(b) + ' (' + groups[b].length + ' NCRs)'}<textarea class="msg" rows="${one ? 9 : Math.min(14, 6 + groups[b].length)}">${esc(m)}</textarea></label>
        <button type="button" class="btn sm copy" data-k="${k}">📋 Copy message</button></div>`).join('')}
      <div class="full muted small">Paste into Teams / email, then record the follow-up below.</div><hr class="full">
      <label>Date<input type="date" name="date" value="${L.todayISO()}" required></label>
      <label>Person / department<input name="by" value="${esc(who)}"></label>
      <label class="full">Action / note *<input name="action" required value="${esc('Asked ' + who + ' for status update')}"></label>
      <label class="full">Next check date * <span class="muted">– flagged in Followed up when this date arrives</span>
        <div class="inline"><input type="date" name="nextDate" id="nd" value="${nextDefault}" min="${plusDays(1)}" required>
        ${[3, 7, 14].map((d) => `<button type="button" class="btn sm" data-plus="${d}">+${d}d</button>`).join('')}</div></label>
      <label>Waiting For<select name="waiting">${V.options(V.withCurrent(s.waitingFor, allWaiting.length === 1 ? allWaiting[0] : ''), allWaiting.length === 1 ? allWaiting[0] : '', one ? '— unchanged —' : '— unchanged —')}</select></label>
      <label>Remark<input name="remark"></label>
      ${one ? '' : '<p class="full muted small">{buyer} is replaced by each NCR\'s own buyer, so every NCR\'s history names only that buyer.</p>'}
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">I sent it, record${one ? '' : ' (' + list.length + ')'}</button></div></form>`, (m) => {
      m.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => copyText(m.querySelectorAll('.msg')[b.dataset.k].value)));
      m.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => { m.querySelector('#nd').value = plusDays(Number(b.dataset.plus)); }));
      m.querySelector('#hf').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        S.recordFollowups(ids, { date: f.get('date'), by: f.get('by'), action: f.get('action'), waiting: f.get('waiting'), remark: f.get('remark'), nextDate: f.get('nextDate') });
        V.SEL.clear(); modal.close(); toast(`Recorded. ${one ? 'It is' : list.length + ' NCRs are'} now in Followed up, flagged again on ${L.fmtDate(f.get('nextDate'))}`);
      });
    });
  }

  // Plain history entry (e.g. "Evidence received"); optionally counts as a follow-up.
  function noteModal(id) {
    const n = S.getNcr(id), s = st.settings;
    openModal(`<form id="hf" class="form modal-form"><h2>Add history entry – ${esc(n.NCR_No)}</h2>
      <label>Date<input type="date" name="date" value="${L.todayISO()}" required></label>
      <label>Person / department<input name="by" list="owners"></label>
      <label class="full">Action / note *<input name="action" required placeholder="e.g. Evidence received"></label>
      <label>Waiting For<select name="waiting">${V.options(V.withCurrent(s.waitingFor, n.Waiting_For), n.Waiting_For, '— unchanged —')}</select></label>
      <label>Remark<input name="remark"></label>
      <datalist id="owners">${S.owners().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <div class="full actions"><label class="check"><input type="checkbox" name="count"> Count as follow-up</label><span class="grow"></span>
        <button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Add entry</button></div></form>`, (m) => {
      m.querySelector('#hf').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        S.addHistory(id, { date: f.get('date'), by: f.get('by'), action: f.get('action'), waiting: f.get('waiting'), remark: f.get('remark'), countAsFollowup: !!f.get('count') });
        modal.close(); toast('Entry added');
      });
    });
  }

  // Set next check / owner / waiting for / status on all selected NCRs.
  function bulkModal(ids) {
    const s = st.settings;
    openModal(`<form id="bf" class="form modal-form"><h2>Update ${ids.length} NCR${ids.length > 1 ? 's' : ''}</h2>
      <p class="full muted small">Leave a field empty to keep it unchanged.</p>
      <label class="full">Next check date<div class="inline"><input type="date" name="Due_Date" id="nd" min="${plusDays(1)}">${[3, 7, 14].map((d) => `<button type="button" class="btn sm" data-plus="${d}">+${d}d</button>`).join('')}</div></label>
      <label>Owner<input name="Owner" list="owners"></label>
      <label>Waiting For<select name="Waiting_For">${V.options(s.waitingFor, '', '— unchanged —')}</select></label>
      <label>Status<select name="Status">${V.options(['Open', 'Pending', 'Ready to Close'], '', '— unchanged —')}</select></label>
      <datalist id="owners">${S.owners().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Apply</button></div></form>`, (m) => {
      m.querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => { m.querySelector('#nd').value = plusDays(Number(b.dataset.plus)); }));
      m.querySelector('#bf').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target), fields = {};
        ['Due_Date', 'Owner', 'Waiting_For', 'Status'].forEach((k) => { if (f.get(k)) fields[k] = f.get(k); });
        if (!Object.keys(fields).length) { toast('Nothing to change', true); return; }
        S.bulkSet(ids, fields); V.SEL.clear(); modal.close(); toast('Updated ' + ids.length + ' NCRs');
      });
    });
  }

  // ---------- bulk selection bar ----------
  function updateBulkBar() {
    const bar = $('#bulkbar'), n = V.SEL.size;
    bar.hidden = !n;
    if (n) bar.innerHTML = `<b>${n} selected</b><button class="btn primary" data-action="bulk-followup">📨 Follow-up</button><button class="btn" data-action="bulk-close">Verify &amp; close</button><button class="btn" data-action="bulk-set">Set next check / owner / status</button><button class="btn" data-action="bulk-clear">Clear</button>`;
  }
  document.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.classList && cb.classList.contains('sel')) { cb.checked ? V.SEL.add(cb.dataset.id) : V.SEL.delete(cb.dataset.id); updateBulkBar(); }
    else if (cb.classList && cb.classList.contains('sel-all')) {
      cb.closest('table').querySelectorAll('.sel').forEach((x) => { x.checked = cb.checked; cb.checked ? V.SEL.add(x.dataset.id) : V.SEL.delete(x.dataset.id); });
      updateBulkBar();
    }
  });

  function closeModal(ids) {
    const list = ids.map(S.getNcr).filter(Boolean);
    openModal(`<form id="cf" class="form modal-form"><h2>Verify &amp; close ${list.length === 1 ? esc(list[0].NCR_No) : list.length + ' NCRs'}</h2>
      <p class="full">Confirm QA has verified the required action and evidence. ${list.length === 1 ? 'The NCR' : 'These NCRs'} will move to the Closed page.</p>
      <label class="full">Verification note<input name="note" value="QA verified and closed"></label>
      <div class="full actions"><span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn ok" type="submit">Close ${list.length === 1 ? 'NCR' : list.length + ' NCRs'}</button></div></form>`, (m) => {
      m.querySelector('#cf').addEventListener('submit', (e) => {
        e.preventDefault();
        S.bulkSet(ids, { Status: 'Closed' }, new FormData(e.target).get('note') || 'QA verified and closed');
        V.SEL.clear(); modal.close(); toast(list.length === 1 ? 'NCR closed' : list.length + ' NCRs closed');
        if (list.length === 1 && route().page === 'ncr') location.hash = '#/closed';
      });
    });
  }

  const actions = {
    back: () => {
      if (history.length > 1) { history.back(); return; }
      const { page } = route();
      location.hash = page === 'ncr' ? (current.closed ? '#/closed' : '#/list') : '#/home';
    },
    add: () => ncrForm(),
    edit: (el) => ncrForm(el.dataset.id),
    followup: (el) => followupModal([el.dataset.id]),
    note: (el) => noteModal(el.dataset.id),
    'bulk-followup': () => followupModal([...V.SEL]),
    'bulk-set': () => bulkModal([...V.SEL]),
    'bulk-clear': () => { V.SEL.clear(); render(); },
    showall: (el) => { V.showAll[el.dataset.key] = !V.showAll[el.dataset.key]; window.__keepScroll = window.scrollY; render(); },
    selsection: (el) => { (V.sectionIds[el.dataset.key] || []).forEach((id) => V.SEL.add(id)); window.__keepScroll = window.scrollY; render(); },
    toggletl: (el) => { const id = el.dataset.id; V.WF_OPEN.has(id) ? V.WF_OPEN.delete(id) : V.WF_OPEN.add(id); window.__keepScroll = window.scrollY; render(); },
    reviewed: (el) => { S.markReviewed([el.dataset.id], plusDays(st.settings.defaultCheckDays)); toast(`Reviewed – next check in ${st.settings.defaultCheckDays} days`); },
    chase: (el) => {
      const ids = V.currentIds();
      if (ids.length) followupModal(ids);
    },
    close: (el) => closeModal([el.dataset.id]),
    'bulk-close': () => closeModal([...V.SEL]),
    togglebuyer: (el) => { const b = el.dataset.buyer; V.HOME_OPEN.has(b) ? V.HOME_OPEN.delete(b) : V.HOME_OPEN.add(b); window.__keepScroll = window.scrollY; render(); },
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
  $('#add-btn').addEventListener('click', () => ncrForm());

  // Auto-load: refresh when the tab regains focus and every minute (Sheets mode only).
  function autoRefresh() { if (st.mode === 'sheets' && !st.saving && !modal.open) S.reload(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
  setInterval(autoRefresh, 60000);

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

  // keep the right-hand tab rail directly under the sticky header, whatever its height
  const fitRail = () => document.documentElement.style.setProperty('--hdr', $('.topbar').offsetHeight + 'px');
  window.addEventListener('resize', fitRail); fitRail();
  if (window.ResizeObserver) new ResizeObserver(fitRail).observe($('.topbar'));

  NCR.app = { render, toast };
  S.init().then(() => { status(); render(); });
})();
