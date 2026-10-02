// Page renderers. Each returns {html, bind?(root)}; app.js mounts them.
window.NCR = window.NCR || {};
(function (NCR) {
  const L = NCR.logic, S = NCR.store, st = S.state;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inf = (n) => L.info(n, st.settings);
  const options = (list, sel, blank) => (blank === undefined ? '' : `<option value="">${esc(blank)}</option>`) +
    list.map((o) => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
  const withCurrent = (list, cur) => (cur && !list.includes(cur) ? list.concat(cur) : list);
  const open = () => st.ncrs.filter((n) => n.Status !== 'Closed');
  const NO_BUYER = '(No buyer)';
  const buyerOf = (n) => n.Buyer || NO_BUYER;

  // ---------- selection (shared by Today / List for bulk actions) ----------
  const SEL = new Set();
  const showAll = {};
  const sectionIds = {};
  const cbHead = '<th class="cb"><input type="checkbox" class="sel-all" title="Select all in this table"></th>';
  const cbCell = (n) => `<td class="cb"><input type="checkbox" class="sel" data-id="${esc(n.NCR_ID)}"${SEL.has(n.NCR_ID) ? ' checked' : ''}></td>`;

  // ---------- small renderers ----------
  function stateBadge(i) { const m = L.STATE_META[i.state]; return `<span class="badge ${m.cls}">${m.icon} ${m.label}</span>`; }
  function dueText(n, i) {
    if (!n.Due_Date) return '<span class="muted">Not set</span>';
    let rel = '';
    if (!i.closed && i.dueDiff !== null) rel = i.dueDiff < 0 ? `<div class="sub bad">${-i.dueDiff}d overdue</div>` : i.dueDiff === 0 ? '<div class="sub warn">Today</div>' : `<div class="sub">in ${i.dueDiff}d</div>`;
    return `${L.fmtDate(n.Due_Date)}${rel}`;
  }
  function agingText(i) { return i.aging === null ? '–' : `${i.aging}d${i.band ? ` <span class="chip ${i.band.cls}">${i.band.label}</span>` : ''}`; }
  const nextText = (n, i) => (n.Next_Action ? esc(n.Next_Action) : i.closed || i.ready ? '–' : '<span class="muted">not set</span>');
  const countText = (n, i) => `${i.count}${i.escalate ? ' <span class="chip age-escalation" title="Escalation Recommended">⚠️ Escalate</span>' : ''}`;
  function remarkText(n, i) {
    if (!n.Buyer_Remark) return i.closed ? '–' : '<span class="chip age-escalation">📭 No buyer update</span>';
    return `<div class="rtext" title="${esc(n.Buyer_Remark)}">${esc(n.Buyer_Remark)}</div>${n.Buyer_Remark_Date ? `<div class="sub">${L.fmtDate(n.Buyer_Remark_Date)}</div>` : ''}${i.stale ? `<div><span class="chip age-attention" title="Remarks unchanged for ${i.staleDays} days">⏳ No change ${i.staleDays}d</span></div>` : ''}`;
  }
  const whyText = (i) => (i.reasons.length ? i.reasons.map((r) => `<div class="why">${esc(r)}</div>`).join('') : '<span class="muted">Waiting</span>')
    + (i.remarkGroup === 'hold' ? '<div class="sub">⏳ Hold / scrap – cannot close yet</div>' : i.remarkGroup === 'none' ? '<div class="sub">📭 no buyer update</div>' : '');
  const newChip = (i) => (i.isNew ? ' <span class="chip new">NEW</span>' : '');

  // Worklist table: what, who, why, when — and one-click actions.
  function workTable(list, emptyMsg, key, limit, withRemark) {
    if (!list.length) return `<div class="empty">${emptyMsg || 'Nothing here'}</div>`;
    limit = limit || 10;
    sectionIds[key] = list.map((n) => n.NCR_ID);
    const shown = showAll[key] ? list : list.slice(0, limit);
    const rows = shown.map((n) => {
      const i = inf(n);
      return `<tr data-href="#/ncr/${esc(n.NCR_ID)}">${cbCell(n)}
        <td class="nowrap"><b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)} · ${i.aging === null ? '' : i.aging + 'd'}</div></td>
        <td class="wide">${esc(buyerOf(n))}<div class="sub clip" title="${esc(n.Buyer_Remark || n.Defect)}">${esc(n.Defect)}${!withRemark && n.Buyer_Remark ? ' · “' + esc(n.Buyer_Remark) + '”' : ''}</div></td>
        ${withRemark ? `<td class="remark">${remarkText(n, i)}</td>` : ''}<td>${whyText(i)}</td>
        <td class="nowrap">${dueText(n, i)}<div class="sub">${i.count ? i.count + ' follow-up' + (i.count > 1 ? 's' : '') : 'not followed up'}</div></td>
        <td class="right nowrap">${i.needsReview ? `<button class="btn sm" data-action="reviewed" data-id="${esc(n.NCR_ID)}" title="I read the buyer update – check again in ${st.settings.defaultCheckDays} days">✓ Reviewed</button> ` : ''}<button class="btn sm" data-action="followup" data-id="${esc(n.NCR_ID)}">Follow-up</button></td></tr>`;
    }).join('');
    const more = list.length > limit ? `<div class="more"><button class="link" data-action="showall" data-key="${key}">${showAll[key] ? 'Show fewer' : `Show all ${list.length}`}</button> · <button class="link" data-action="selsection" data-key="${key}">Select all ${list.length}</button></div>` : '';
    return `<div class="table-wrap"><table class="grid compact"><thead><tr>${cbHead}<th>NCR</th><th>Buyer / Defect</th>${withRemark ? '<th>Buyer remark</th>' : ''}<th>Why</th><th>Next check</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${more}`;
  }

  const byDue = (a, b) => (a.Due_Date || '9999') < (b.Due_Date || '9999') ? -1 : (a.Due_Date || '9999') > (b.Due_Date || '9999') ? 1 : 0;
  const byOldest = (a, b) => String(a.NCR_Date || '9999').localeCompare(String(b.NCR_Date || '9999'));

  const emptyState = () => `<div class="card empty-state"><h2>No NCRs yet</h2><p>All data comes from your Excel export. Upload the file to get started — upload the same export again every week and only new or changed NCRs are applied.</p><a class="btn primary" href="#/import">Import Excel</a></div>`;

  // ---------- charts (inline SVG, no library) ----------
  // Palette from the design colours, validated as one ordered set: dark, blue, grey, light blue.
  const SEG = [
    { k: 'none', label: 'No update', color: 'var(--c-none)', ink: 'var(--i-none)' },
    { k: 'progress', label: 'In progress', color: 'var(--c-progress)', ink: 'var(--i-progress)' },
  ];
  const niceStep = (max) => { const raw = Math.max(1, max) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  // bar with only its right (data) end rounded; the baseline end stays square
  const barPath = (x, y, w, h, r) => (w <= r * 2 ? `M${x},${y}h${w}v${h}h${-w}z` : `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`);
  const tipAttrs = (a, b, v, color) => `data-ta="${esc(a)}" data-tb="${esc(b)}" data-tv="${esc(v)}" data-tc="${color}" tabindex="0"`;

  function buyerChart(rows) {
    const list = rows.filter((r) => r.todo).sort((a, b) => b.todo - a.todo);
    if (!list.length) return '<div class="empty">Nothing left to follow up.</div>';
    const labelW = 150, right = 46, W = 600, rowH = 36, top = 8, axisH = 26;
    const max = Math.max(...list.map((r) => r.todo)), step = niceStep(max), top_ = Math.ceil(max / step) * step;
    const plotW = W - labelW - right, sc = (v) => (v / top_) * plotW, H = top + list.length * rowH + axisH;
    let g = '', bars = '';
    for (let t = 0; t <= top_; t += step) g += `<line x1="${labelW + sc(t)}" x2="${labelW + sc(t)}" y1="${top}" y2="${H - axisH}" class="grid-l"/><text class="ax" x="${labelW + sc(t)}" y="${H - 8}" text-anchor="middle" font-size="12">${t}</text>`;
    list.forEach((r, i) => {
      const y = top + i * rowH + (rowH - 22) / 2;
      const name = r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name;
      bars += `<text x="${labelW - 10}" y="${y + 15}" text-anchor="end" font-size="14" font-weight="700">${esc(name)}</text>`;
      let x = labelW; const parts = SEG.filter((sg) => r[sg.k] > 0);
      parts.forEach((sg, j) => {
        const w = sc(r[sg.k]), last = j === parts.length - 1, dw = Math.max(1, w - (last ? 0 : 2)); // 2px surface gap between segments
        bars += `<path class="seg" d="${barPath(x, y, dw, 22, last ? 4 : 0)}" style="fill:${sg.color}" ${tipAttrs(r.name, sg.label, r[sg.k] + ' of ' + r.todo + ' to follow up', sg.color)}/>`;
        if (w >= 26) bars += `<text x="${x + w / 2 - (last ? 0 : 1)}" y="${y + 16}" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:${sg.ink}" pointer-events="none">${r[sg.k]}</text>`;
        x += w;
      });
      bars += `<text x="${x + 8}" y="${y + 16}" font-size="14" font-weight="800">${r.todo}</text>`;
    });
    const legend = SEG.map((sg) => `<span class="lg"><i style="background:${sg.color}"></i>${sg.label}</span>`).join('');
    return `<div class="legend-row">${legend}</div><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="NCRs to follow up per buyer, split by buyer update status. Values are in the table below.">${g}${bars}</svg>`;
  }

  function agingChart(open_) {
    const B = [['0–7 d', 0, 7], ['8–14 d', 8, 14], ['15–30 d', 15, 30], ['31–90 d', 31, 90], ['90+ d', 91, 1e9]];
    const vals = B.map(([l, lo, hi]) => ({ l, v: open_.filter((n) => { const a = inf(n).aging; return a !== null && a >= lo && a <= hi; }).length }));
    const W = 420, H = 270, left = 34, bottom = 36, top = 22, plotH = H - bottom - top, band = (W - left - 10) / vals.length, bw = 24;
    const max = Math.max(1, ...vals.map((x) => x.v)), step = niceStep(max), top_ = Math.ceil(max / step) * step, sc = (v) => (v / top_) * plotH;
    let g = '', bars = '';
    for (let t = 0; t <= top_; t += step) g += `<line x1="${left}" x2="${W - 10}" y1="${top + plotH - sc(t)}" y2="${top + plotH - sc(t)}" class="grid-l"/><text class="ax" x="${left - 6}" y="${top + plotH - sc(t) + 4}" text-anchor="end" font-size="12">${t}</text>`;
    vals.forEach((d, i) => {
      const cx = left + band * i + band / 2, h = sc(d.v), x = cx - bw / 2, y = top + plotH - h;
      bars += `<g ${tipAttrs(d.l + ' old', 'Open NCRs', d.v, 'var(--acc)')} class="seg"><rect x="${cx - band / 2 + 4}" y="${top}" width="${band - 8}" height="${plotH}" fill="transparent"/>`
        + (d.v ? `<path d="M${x},${top + plotH}v${-(h - 4)}a4,4 0 0 1 4,-4h${bw - 8}a4,4 0 0 1 4,4v${h - 4}z" style="fill:var(--acc)"/>` : '')
        + `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="14" font-weight="800">${d.v}</text></g>`
        + `<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="12.5">${d.l}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Open NCRs by age: ${vals.map((x) => x.l + ' ' + x.v).join(', ')}">${g}${bars}</svg>`;
  }

  // ---------- Home (summary by buyer) ----------
  const HOME_OPEN = new Set();
  function home() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>Home</h1></div>' + emptyState() };
    const by = {};
    const row = (name) => (by[name] = by[name] || { name, total: 0, todo: 0, followed: 0, closed: 0, none: 0, progress: 0, hold: 0, jira: 0, noneIds: [] });
    st.ncrs.forEach((n) => {
      const r = row(buyerOf(n)), i = inf(n);
      r.total++;
      if (i.bucket === 'closed') { r.closed++; return; }
      if (i.bucket === 'jira') { r.jira++; return; }       // "Jira: closed" tab
      if (i.bucket === 'hold') { r.hold++; return; }       // "Hold for scrap" tab
      if (i.bucket === 'followed') { r.followed++; return; } // followed up: waits here until closed
      r.todo++; r[i.remarkGroup]++;                       // still to follow up, split by what the remark says
      if (i.remarkGroup === 'none') r.noneIds.push(n);
    });
    const rows = Object.values(by).sort((a, b) => b.none - a.none || b.todo - a.todo || b.total - a.total);
    const tot = rows.reduce((t, r) => { Object.keys(r).forEach((k) => { if (typeof r[k] === 'number') t[k] = (t[k] || 0) + r[k]; }); return t; }, {});
    const bf = (buyer) => (buyer === NO_BUYER ? '__none' : buyer);
    const link = (buyer, group, n, cls) => (n ? `<a href="#/list" data-filter='${esc(JSON.stringify({ buyer: bf(buyer), buyerUpdate: group, tab: group === 'none' ? 'none' : group ? 'has' : 'all' }))}' class="${cls || ''}">${n}</a>` : '<span class="muted">0</span>');
    const body = rows.map((r) => `<tr><td><button class="link tog" data-action="togglebuyer" data-buyer="${esc(r.name)}">${HOME_OPEN.has(r.name) ? '▾' : '▸'}</button> <b>${esc(r.name)}</b></td>
        <td>${r.total}</td><td>${link(r.name, '', r.todo)}</td>
        <td>${link(r.name, 'none', r.none, 'bad strong')}</td><td>${link(r.name, 'progress', r.progress)}</td>
        <td>${r.followed ? `<a href="#/followed" data-wfilter='${esc(JSON.stringify({ buyer: bf(r.name) }))}'>${r.followed}</a>` : '<span class="muted">0</span>'}</td>
        <td>${r.hold ? `<a href="#/hold" data-hjfilter='${esc(JSON.stringify({ tab: 'hold', buyer: bf(r.name) }))}'>${r.hold}</a>` : '<span class="muted">0</span>'}</td>
        <td>${r.jira ? `<a href="#/hold" data-hjfilter='${esc(JSON.stringify({ tab: 'jira', buyer: bf(r.name) }))}'>${r.jira}</a>` : '<span class="muted">0</span>'}</td>
        <td>${r.closed ? `<a href="#/closed" data-closed="${esc(r.name)}">${r.closed}</a>` : '<span class="muted">0</span>'}</td></tr>
      ${HOME_OPEN.has(r.name) ? `<tr class="sub-row"><td colspan="10"><div class="sub">No remark, still to follow up (${r.none}):</div><div class="nolist">${r.noneIds.length ? r.noneIds.slice().sort(byOldest).slice(0, 60).map((n) => `<a href="#/ncr/${esc(n.NCR_ID)}">${esc(n.NCR_No)}</a>`).join(' ') + (r.noneIds.length > 60 ? ' …' : '') : '<span class="muted">none</span>'}</div></td></tr>` : ''}`).join('');
    const big = (v, l, href, attr) => `<a class="big" href="${href}" ${attr || ''}><b>${v}</b><span>${l}</span></a>`;
    return { html: `<div class="page-head"><h1>Home</h1><span class="muted">${L.fmtDate(L.todayISO())}</span></div>
      <div class="bigs">${big(tot.total, 'Total', '#/home')}${big(tot.todo, 'To follow up', '#/list', `data-filter='${esc(JSON.stringify({ tab: 'none' }))}'`)}${big(tot.followed, 'Followed up', '#/followed', `data-wfilter='{}'`)}${big(tot.hold, 'Hold for scrap', '#/hold', `data-hjfilter='${esc(JSON.stringify({ tab: 'hold' }))}'`)}${big(tot.jira, 'Jira closed', '#/hold', `data-hjfilter='${esc(JSON.stringify({ tab: 'jira' }))}'`)}${big(tot.closed, 'Closed', '#/closed', 'data-closed=""')}</div>
      <div class="charts">
        <section class="block"><h2>To follow up, by buyer</h2><p class="hint">Each bar is one buyer's NCRs still to follow up, split by what their Remarks say. Exact numbers are in the table below.</p>${buyerChart(rows)}</section>
        <section class="block"><h2>How long they have been open</h2><p class="hint">All open NCRs grouped by days since the NCR date.</p>${agingChart(open())}</section>
      </div>
      <section class="block"><h2>By buyer</h2><p class="hint">To follow up = No remark + In progress. <b>Followed up</b> are waiting for their next check date. Click a number to see those NCRs; ▸ lists the NCRs with no remark.</p>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Buyer</th><th>Total</th><th>To follow up</th><th>No remark</th><th>In progress</th><th>Followed up</th><th>Hold for scrap</th><th>Jira closed</th><th>Closed</th></tr></thead>
        <tbody>${body}<tr class="total"><td><b>Total</b></td><td>${tot.total}</td><td>${tot.todo}</td><td>${tot.none}</td><td>${tot.progress}</td><td>${tot.followed}</td><td>${tot.hold}</td><td>${tot.jira}</td><td>${tot.closed}</td></tr></tbody></table></div>
        <p class="hint">Hold for scrap = Remarks contain “${esc(st.settings.holdKeywords.join('”, “'))}”. Jira closed = Remarks contain “${esc(st.settings.jiraKeywords.join('”, “'))}”; those NCRs are closed when the file is imported. Any letter case. Change the keywords in Settings.</p></section>` };
  }

  // ---------- Closed archive ----------
  const CF = { q: '', buyer: '', month: '' };
  function closedList() {
    const q = CF.q.trim().toLowerCase();
    return st.ncrs.filter((n) => inf(n).bucket === 'closed' && (!q || `${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))
      && (!CF.buyer || buyerOf(n) === CF.buyer))
      .sort((a, b) => String(b.NCR_Date).localeCompare(String(a.NCR_Date)));
  }
  function closedBody() {
    const list = closedList();
    if (!list.length) return '<div class="empty">No closed NCRs.</div>';
    const rows = list.map((n) => { const i = inf(n); return `<tr data-href="#/ncr/${esc(n.NCR_ID)}"><td class="nowrap"><b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)}</div></td><td>${esc(buyerOf(n))}</td><td>${esc(n.Defect)}</td>
      <td class="nowrap">${L.fmtDate(n.NCR_Date)}</td><td class="nowrap">${i.count}</td></tr>`; }).join('');
    return `<div class="muted small">${list.length} closed</div><div class="table-wrap"><table class="grid"><thead><tr><th>NCR</th><th>Buyer</th><th>Defect</th><th>Created</th><th>Follow-ups</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function closedPage() {
    const done = st.ncrs.filter((n) => inf(n).bucket === 'closed');
    const buyers = [...new Set(done.map(buyerOf))].sort();
    return { html: `<div class="page-head"><h1>Closed</h1><span class="muted">${done.length} closed · <a href="#/hold" data-hjfilter='{"tab":"jira"}'>${st.ncrs.filter((n) => inf(n).bucket === 'jira').length} Jira closed</a></span></div>
      <div class="filters"><label class="grow">Search<input id="c-q" type="search" placeholder="NCR No., Item No. or Batch No." value="${esc(CF.q)}"></label>
        <label>Buyer<select id="c-buyer">${options(buyers, CF.buyer, 'All')}</select></label></div>
      <div id="closed-body">${closedBody()}</div>`,
    bind(root) {
      const r = () => { root.querySelector('#closed-body').innerHTML = closedBody(); };
      [['c-q', 'q'], ['c-buyer', 'buyer']].forEach(([id, k]) => root.querySelector('#' + id).addEventListener('input', (e) => { CF[k] = e.target.value; r(); }));
    } };
  }

  // ---------- Open NCRs (one worklist: no remark first, then has remark) ----------
  const LF0 = { q: '', buyer: '', tab: 'none', show: 'open', status: '', owner: '', waiting: '', disposition: '', due: '', buyerUpdate: '', fu: '', age: '', sort: 'due', dir: 'asc' };
  const LF = Object.assign({}, LF0);
  // links from Home pass buyerUpdate; map them onto the two priority tabs
  function setFilter(f) { Object.keys(LF).forEach((k) => delete LF[k]); Object.assign(LF, LF0, f); }

  // every open NCR matching the non-tab filters; `tab` decides which part of it to show
  function baseList(ignoreBuyer) {
    const q = LF.q.trim().toLowerCase();
    return st.ncrs.filter((n) => {
      const i = inf(n);
      if (i.bucket !== 'todo' && i.bucket !== 'followed') return false; // closed, Hold for scrap and Jira NCRs live on their own pages
      if (q && !(`${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))) return false;
      if (!ignoreBuyer && LF.buyer && (LF.buyer === '__none' ? n.Buyer : n.Buyer !== LF.buyer)) return false;
      if (LF.show === 'action' && !i.actionRequired) return false;
      if (LF.show === 'ready' && !i.ready) return false;
      if (LF.status && n.Status !== LF.status) return false;
      if (LF.owner && n.Owner !== LF.owner) return false;
      if (LF.waiting && (LF.waiting === '__none' ? n.Waiting_For : n.Waiting_For !== LF.waiting)) return false;
      if (LF.disposition && n.Disposition !== LF.disposition) return false;
      if (LF.due === 'overdue' && !i.overdue) return false;
      if (LF.due === 'today' && !i.dueToday) return false;
      if (LF.due === 'soon' && !i.dueSoon) return false;
      if (LF.due === 'week' && !(i.dueDiff !== null && i.dueDiff >= 0 && i.dueDiff <= 7)) return false;
      if (LF.due === 'none' && n.Due_Date) return false;
      if (LF.buyerUpdate === 'stale' ? !i.stale : (LF.buyerUpdate && i.remarkGroup !== LF.buyerUpdate)) return false;
      if (LF.fu === 'never' && Number(n.Followup_Count) > 0) return false;
      if (LF.fu === 'escalate' && !i.escalate) return false;
      if (LF.age && !(i.aging > Number(LF.age))) return false;
      return true;
    });
  }
  // Once followed up, an open NCR stays in Followed up until it is closed, so its timeline keeps building across weekly imports.
  const isFollowed = (n) => inf(n).bucket === 'followed';
  function visibleList() {
    const base = baseList(), q = LF.q.trim();
    const shown = q ? base : base.filter((n) => !isFollowed(n)); // searching also finds NCRs that were already followed up
    return { base, shown, none: shown.filter((n) => inf(n).remarkGroup === 'none'), has: shown.filter((n) => inf(n).remarkGroup !== 'none') };
  }
  const oldest = (a, b) => (inf(b).aging || 0) - (inf(a).aging || 0);
  const allSorted = (list) => {
    const key = { due: (n) => n.Due_Date || '', aging: (n) => inf(n).aging, date: (n) => n.NCR_Date || '' }[LF.sort], dir = LF.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => { const x = key(a), y = key(b); if (LF.sort === 'due') { if (!x && y) return 1; if (x && !y) return -1; } return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  };
  // ids behind the "Message buyer" button = what the current tab is showing
  function currentIds() { const v = visibleList(); return (LF.tab === 'none' ? v.none : LF.tab === 'has' ? v.has : v.shown).map((n) => n.NCR_ID); }

  // Shared by To follow up and Followed up: buyer pills, the three tabs, and a per-buyer count line.
  const TAB_DEFS = [['none', '1 · No remark'], ['has', '2 · Has remark'], ['all', '3 · All']];
  const tabsHtml = (cnt, cur, attr) => `<div class="tabs">${TAB_DEFS.map(([k, l]) => `<button class="tab${cur === k ? ' on' : ''}" ${attr}="${k}">${l} <b>${cnt[k]}</b></button>`).join('')}</div>`;
  const pillsHtml = (per, total, cur, attr) => {
    const names = Object.keys(per).sort((x, y) => per[y] - per[x] || x.localeCompare(y));
    return `<div class="pills">${[`<button class="pill${cur ? '' : ' on'}" ${attr}="">All buyers <b>${total}</b></button>`].concat(names.map((b) => { const v = b === NO_BUYER ? '__none' : b; return `<button class="pill${cur === v ? ' on' : ''}" ${attr}="${esc(v)}">${esc(b)} <b>${per[b]}</b></button>`; })).join('')}</div>`;
  };
  // how many NCRs of this buyer are not closed, and where they are
  function buyerLine(buyer) {
    if (!buyer) return '';
    const mine = st.ncrs.filter((n) => ['todo', 'followed'].includes(inf(n).bucket) && (buyer === '__none' ? !n.Buyer : n.Buyer === buyer)), f = mine.filter(isFollowed).length;
    return `<div class="buyer-line"><b>${esc(buyer === '__none' ? NO_BUYER : buyer)}</b>: <a href="#/list" data-filter='${esc(JSON.stringify({ buyer }))}'>${mine.length - f} to follow up</a> · <a href="#/followed" data-wfilter='${esc(JSON.stringify({ buyer }))}'>${f} followed up</a> · <b>${mine.length}</b> not closed</div>`;
  }

  function openMain() {
    const v = visibleList(), buyers = S.buyers();
    const hidden = v.base.length - v.shown.length;
    const per = {}; baseList(true).filter((n) => !isFollowed(n)).forEach((n) => { per[buyerOf(n)] = (per[buyerOf(n)] || 0) + 1; });
    const total = Object.values(per).reduce((x, y) => x + y, 0), cur = LF.buyer === '__none' ? NO_BUYER : LF.buyer;
    const pills = pillsHtml(per, total, LF.buyer, 'data-buyer');
    const tabs = tabsHtml({ none: v.none.length, has: v.has.length, all: v.shown.length }, LF.tab, 'data-tab');
    let body;
    if (LF.tab === 'none') {
      body = `<section class="block"><h2>No remark: chase these first <span class="count">${v.none.length}</span></h2><p class="hint">The buyer has written nothing in Remarks. Oldest first.</p>${workTable(v.none.slice().sort(oldest), 'Every open NCR has a remark.', 'none', 25)}</section>`;
    } else if (LF.tab === 'has') {
      const g = (fn) => v.has.filter(fn).sort(oldest);
      const parts = [
        ['rv', 'Buyer updated — read, then ✓ Reviewed', 'Remarks changed since you last reviewed.', g((n) => inf(n).needsReview)],
        ['pr', 'In progress', 'Remarks written, not finished. Follow up for the next step.', g((n) => inf(n).remarkGroup === 'progress' && !inf(n).needsReview)],
        ['hd', 'Hold / scrap', 'Waiting for scrap. Cannot close yet.', g((n) => inf(n).remarkGroup === 'hold' && !inf(n).needsReview)],
      ].filter((x) => x[3].length);
      body = parts.map(([k, t, h, l]) => `<section class="block"><h2>${t} <span class="count">${l.length}</span></h2><p class="hint">${h}</p>${workTable(l, '', k, 25, true)}</section>`).join('')
        || '<div class="empty">No NCRs with a remark.</div>';
    } else {
      body = `<section class="block"><h2>All <span class="count">${v.shown.length}</span></h2>${workTable(allSorted(v.shown), 'No open NCRs match.', 'all', 40, true)}</section>`;
    }
    return `${pills}${buyerLine(LF.buyer)}${tabs}
      <div class="row-between wait-line"><span class="muted">${hidden ? `${hidden} already followed up — <a href="#/followed" data-wfilter='${esc(JSON.stringify({ buyer: LF.buyer }))}'>see Followed up</a>` : ''}</span>
        <span class="inline">${LF.buyer ? `<button class="btn primary" data-action="chase" data-buyer="${esc(cur)}"${currentIds().length ? '' : ' disabled'}>Message ${esc(cur)} (${currentIds().length})</button>` : ''}</span></div>
      ${body}`;
  }

  function list() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>To follow up</h1></div>' + emptyState() };
    const s = st.settings;
    const sel = (id, label, html) => `<label>${label}<select id="${id}">${html}</select></label>`;
    const o = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('');
    const todo = st.ncrs.filter((n) => inf(n).bucket === 'todo').length, noRem = st.ncrs.filter((n) => inf(n).bucket === 'todo' && inf(n).remarkGroup === 'none').length;
    return { html: `<div class="page-head"><div><h1>To follow up</h1><div class="muted"><b>${todo}</b> to follow up · <b>${noRem}</b> with no remark</div></div><button class="btn primary" data-action="add">+ Add NCR</button></div>
      <div class="card filters">
        <label class="grow">Search<input id="f-q" type="search" placeholder="NCR No., Item No. or Batch No." value="${esc(LF.q)}"></label>
        <button class="btn" id="f-clear">Clear</button>
        <details class="full-row"><summary>More filters &amp; sorting</summary><div class="filters inner">
          ${sel('f-status', 'Status', options(L.STATUSES.filter((x) => x !== 'Closed'), LF.status, 'Any'))}
          ${sel('f-owner', 'Owner', options(S.owners(), LF.owner, 'All'))}
          ${sel('f-waiting', 'Waiting For', `<option value="">All</option><option value="__none"${LF.waiting === '__none' ? ' selected' : ''}>Not set</option>${options(s.waitingFor, LF.waiting)}`)}
          ${sel('f-disposition', 'Disposition', options(s.dispositions, LF.disposition, 'All'))}
          ${sel('f-due', 'Next check / Due', o([['', 'Any'], ['overdue', 'Overdue'], ['today', 'Today'], ['soon', 'Due soon'], ['week', 'Next 7 days'], ['none', 'Not set']], LF.due))}
          ${sel('f-bu', 'Remark type', o([['', 'Any'], ['progress', 'In progress'], ['hold', 'Hold / scrap'], ['stale', 'Stale']], LF.buyerUpdate))}
          ${sel('f-sort', 'Sort “All to follow up” by', o([['due', 'Next check'], ['aging', 'Aging'], ['date', 'NCR date']], LF.sort))}
          <button class="btn" id="f-dir" title="Toggle direction">${LF.dir === 'asc' ? '↑ Asc' : '↓ Desc'}</button></div></details>
      </div>
      <div id="open-main">${openMain()}</div>`,
    bind(root) {
      const main = root.querySelector('#open-main');
      const refresh = () => { main.innerHTML = openMain(); };
      const map = { 'f-q': 'q', 'f-status': 'status', 'f-owner': 'owner', 'f-waiting': 'waiting', 'f-disposition': 'disposition', 'f-due': 'due', 'f-bu': 'buyerUpdate', 'f-sort': 'sort' };
      Object.keys(map).forEach((id) => root.querySelector('#' + id).addEventListener('input', (e) => { LF[map[id]] = e.target.value; refresh(); }));
      root.querySelector('#f-dir').addEventListener('click', (e) => { LF.dir = LF.dir === 'asc' ? 'desc' : 'asc'; e.target.textContent = LF.dir === 'asc' ? '↑ Asc' : '↓ Desc'; refresh(); });
      root.querySelector('#f-clear').addEventListener('click', () => { setFilter({}); NCR.app.render(); });
      main.addEventListener('click', (e) => { // pills and tabs live inside the refreshed area
        const b = e.target.closest('[data-buyer].pill'), t = e.target.closest('[data-tab]');
        if (b) { LF.buyer = b.dataset.buyer; refresh(); } else if (t) { LF.tab = t.dataset.tab; refresh(); }
      });
    },
    refresh: () => { const el = document.querySelector('#open-main'); if (el) el.innerHTML = openMain(); } };
  }

  // ---------- Followed up (stays until the NCR is closed; shows the timeline) ----------
  const WF = { q: '', buyer: '', tab: 'none' };
  const WF_OPEN = new Set(); // rows whose timeline is expanded
  function setWaitFilter(f) { Object.assign(WF, { q: '', buyer: '', tab: 'none' }, f); }
  // what, if anything, needs QA's attention on a followed-up NCR
  function attention(n) {
    const i = inf(n);
    if (i.ready) return { rank: 0, label: 'Ready to close', cls: 'b-ready' };
    if (i.needsReview) return { rank: 2, label: 'Buyer updated', cls: 'b-review' };
    if (i.dueDiff !== null && i.dueDiff <= 0) return { rank: 3, label: 'Check due', cls: 'b-soon' };
    return null;
  }
  function followedList() {
    const q = WF.q.trim().toLowerCase();
    return st.ncrs.filter((n) => isFollowed(n) && (!q || `${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))
      && (!WF.buyer || (WF.buyer === '__none' ? !n.Buyer : n.Buyer === WF.buyer)))
      .sort((a, b) => { const x = attention(a), y = attention(b); return (x ? x.rank : 9) - (y ? y.rank : 9) || (a.Due_Date || '9999').localeCompare(b.Due_Date || '9999') || oldest(a, b); });
  }
  function timelineRows(n) {
    const h = S.historyFor(n.NCR_ID).slice(0, 6);
    return h.length ? h.map((x) => `<li><span class="t-date">${L.fmtDate(x.Date)}</span><span>${x.Followup_No ? `<span class="chip fu">Follow-up #${esc(x.Followup_No)}</span> ` : ''}${/^Buyer /.test(x.Action) ? '<span class="chip">Buyer</span> ' : ''}${esc(x.Action)}${x.Remark ? `<span class="sub"> · ${esc(x.Remark)}</span>` : ''}</span></li>`).join('') : '<li class="sub">No history yet.</li>';
  }
  function followedBody() {
    const all = st.ncrs.filter(isFollowed), found = followedList();
    const per = {}; all.forEach((n) => { per[buyerOf(n)] = (per[buyerOf(n)] || 0) + 1; });
    const cnt = { none: found.filter((n) => inf(n).remarkGroup === 'none').length, has: found.filter((n) => inf(n).remarkGroup !== 'none').length, all: found.length };
    const list = WF.tab === 'none' ? found.filter((n) => inf(n).remarkGroup === 'none') : WF.tab === 'has' ? found.filter((n) => inf(n).remarkGroup !== 'none') : found;
    sectionIds.followed = list.map((n) => n.NCR_ID);
    const attn = list.filter(attention).length;
    const rows = list.map((n) => {
      const i = inf(n), at = attention(n), open_ = WF_OPEN.has(n.NCR_ID);
      const changes = S.historyFor(n.NCR_ID).filter((x) => /^Buyer update|^Buyer cleared/.test(x.Action)).length;
      return `<tr data-href="#/ncr/${esc(n.NCR_ID)}">${cbCell(n)}
        <td class="nowrap"><button class="link tog" data-action="toggletl" data-id="${esc(n.NCR_ID)}" title="Show timeline">${open_ ? '▾' : '▸'}</button> <b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)} · ${i.aging === null ? '' : i.aging + 'd'}</div></td>
        <td class="wide">${esc(buyerOf(n))}<div class="sub clip">${esc(n.Defect)}</div></td>
        <td class="remark">${remarkText(n, i)}</td>
        <td class="nowrap">${n.Last_Followup ? L.fmtDate(n.Last_Followup) : '–'}<div class="sub">${i.count} follow-up${i.count === 1 ? '' : 's'}${changes ? ` · ${changes} buyer update${changes === 1 ? '' : 's'}` : ''}</div></td>
        <td class="nowrap">${n.Due_Date ? L.fmtDate(n.Due_Date) : '<span class="muted">Not set</span>'}${i.dueDiff !== null ? `<div class="sub">${i.dueDiff < 0 ? -i.dueDiff + 'd late' : i.dueDiff === 0 ? 'today' : 'in ' + i.dueDiff + 'd'}</div>` : ''}</td>
        <td>${at ? `<span class="badge ${at.cls}">${at.label}</span>` : '<span class="sub">Waiting</span>'}</td>
        <td class="right acts">${i.needsReview ? `<button class="btn sm" data-action="reviewed" data-id="${esc(n.NCR_ID)}" title="I read the buyer update">✓ Reviewed</button> ` : ''}<button class="btn sm" data-action="followup" data-id="${esc(n.NCR_ID)}">Follow up again</button></td></tr>
        ${open_ ? `<tr class="sub-row"><td colspan="8"><ul class="mini-tl">${timelineRows(n)}</ul><a href="#/ncr/${esc(n.NCR_ID)}">Full timeline →</a></td></tr>` : ''}`;
    }).join('');
    return `${pillsHtml(per, all.length, WF.buyer, 'data-wbuyer')}${buyerLine(WF.buyer)}${tabsHtml(cnt, WF.tab, 'data-wtab')}
      <p class="muted wait-line">${list.length ? `<b>${attn}</b> of these need your attention (buyer updated or check date reached). The rest are waiting.` : ''}</p>
      <section class="block">${list.length ? `<div class="table-wrap"><table class="grid compact"><thead><tr>${cbHead}<th>NCR</th><th>Buyer / Defect</th><th>Latest remark</th><th>Last follow-up</th><th>Next check</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty">${all.length ? 'No NCRs in this tab.' : 'Nothing here yet. Press Follow-up on an NCR in To follow up: it moves here and stays until it is closed.'}</div>`}</section>`;
  }
  function followedPage() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>Followed up</h1></div>' + emptyState() };
    const n = open().filter(isFollowed).length;
    return { html: `<div class="page-head"><div><h1>Followed up</h1><div class="muted"><b>${n}</b> followed up and not closed yet. They stay here, and weekly imports add buyer updates to each timeline, until the NCR is closed.</div></div></div>
      <div class="card filters"><label class="grow">Search<input id="w-q" type="search" placeholder="NCR No., Item No. or Batch No." value="${esc(WF.q)}"></label></div>
      <div id="followed-main">${followedBody()}</div>`,
    bind(root) {
      const main = root.querySelector('#followed-main'), refresh = () => { main.innerHTML = followedBody(); };
      root.querySelector('#w-q').addEventListener('input', (e) => { WF.q = e.target.value; refresh(); });
      main.addEventListener('click', (e) => { const b = e.target.closest('[data-wbuyer]'), t = e.target.closest('[data-wtab]'); if (b) { WF.buyer = b.dataset.wbuyer; refresh(); } else if (t) { WF.tab = t.dataset.wtab; refresh(); } });
    } };
  }

  // ---------- Hold for scrap / Jira closed (kept out of the follow-up flow) ----------
  const HJ = { tab: 'hold', buyer: '', q: '' };
  function setHJ(f) { Object.assign(HJ, { tab: 'hold', buyer: '', q: '' }, f); }
  const HJ_TABS = [['hold', 'Hold for scrap'], ['jira', 'Jira closed']];
  function hjItems(tab, ignoreBuyer) {
    const q = HJ.q.trim().toLowerCase();
    return st.ncrs.filter((n) => inf(n).bucket === tab && (!q || `${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))
      && (ignoreBuyer || !HJ.buyer || (HJ.buyer === '__none' ? !n.Buyer : n.Buyer === HJ.buyer))).sort(oldest);
  }
  function holdBody() {
    const per = {}; hjItems(HJ.tab, true).forEach((n) => { per[buyerOf(n)] = (per[buyerOf(n)] || 0) + 1; });
    const total = Object.values(per).reduce((x, y) => x + y, 0), list = hjItems(HJ.tab);
    const tabs = `<div class="tabs">${HJ_TABS.map(([k, l]) => `<button class="tab${HJ.tab === k ? ' on' : ''}" data-hjtab="${k}">${l} <b>${hjItems(k).length}</b></button>`).join('')}</div>`;
    const isHold = HJ.tab === 'hold';
    sectionIds.hold = list.map((n) => n.NCR_ID);
    const rows = list.map((n) => {
      const i = inf(n);
      return `<tr data-href="#/ncr/${esc(n.NCR_ID)}">${isHold ? cbCell(n) : '<td class="cb"></td>'}
        <td class="nowrap"><b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)} · ${i.aging === null ? '' : i.aging + 'd'}</div></td>
        <td class="wide">${esc(buyerOf(n))}<div class="sub clip">${esc(n.Defect)}</div></td>
        <td class="remark"><div class="rtext" title="${esc(n.Buyer_Remark)}">${esc(n.Buyer_Remark)}</div></td>
        ${isHold ? `<td class="nowrap">${i.count} follow-up${i.count === 1 ? '' : 's'}<div class="sub">${n.Last_Followup ? 'last ' + L.fmtDate(n.Last_Followup) : 'never'}</div></td><td class="right"><button class="btn sm" data-action="followup" data-id="${esc(n.NCR_ID)}">Follow-up</button></td>`
          : `<td>${i.closed ? '<span class="badge b-closed">Closed</span>' : '<span class="badge b-soon">Closes at next import</span>'}</td><td></td>`}</tr>`;
    }).join('');
    const head = isHold ? '<th>Follow-ups</th><th></th>' : '<th>Status</th><th></th>';
    return `${pillsHtml(per, total, HJ.buyer, 'data-hjbuyer')}${tabs}
      <p class="muted wait-line">${isHold ? 'Remarks contain “' + esc(st.settings.holdKeywords.join('”, “')) + '” (any letter case). Kept out of To follow up and Followed up.' : 'Remarks contain “' + esc(st.settings.jiraKeywords.join('”, “')) + '” (any letter case): “JIRA: unable to approve - Closed”. They are closed when the file is imported and are listed here instead of the Closed page.'}</p>
      <section class="block">${list.length ? `<div class="table-wrap"><table class="grid compact"><thead><tr><th class="cb">${isHold ? '<input type="checkbox" class="sel-all" title="Select all in this table">' : ''}</th><th>NCR</th><th>Buyer / Defect</th><th>Remark</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty">None.</div>'}</section>`;
  }
  function holdPage() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>Hold &amp; Jira</h1></div>' + emptyState() };
    return { html: `<div class="page-head"><div><h1>Hold &amp; Jira</h1><div class="muted">NCRs whose Remarks say hold / scrap, or Jira. They are not part of the follow-up flow.</div></div></div>
      <div class="card filters"><label class="grow">Search<input id="h-q" type="search" placeholder="NCR No., Item No. or Batch No." value="${esc(HJ.q)}"></label></div>
      <div id="hold-main">${holdBody()}</div>`,
    bind(root) {
      const main = root.querySelector('#hold-main'), refresh = () => { main.innerHTML = holdBody(); };
      root.querySelector('#h-q').addEventListener('input', (e) => { HJ.q = e.target.value; refresh(); });
      main.addEventListener('click', (e) => { const b = e.target.closest('[data-hjbuyer]'), t = e.target.closest('[data-hjtab]'); if (b) { HJ.buyer = b.dataset.hjbuyer; refresh(); } else if (t) { HJ.tab = t.dataset.hjtab; refresh(); } });
    } };
  }

  // ---------- detail ----------
  function detail(id) {
    const n = S.getNcr(id);
    if (!n) return { html: '<div class="empty">NCR not found. <a href="#/list">Back to list</a></div>' };
    const i = inf(n), s = st.settings;
    const hist = S.historyFor(id).map((h) => `<li><div class="t-date">${L.fmtDate(h.Date)}</div><div class="t-body">
      ${h.Followup_No ? `<span class="chip fu">Follow-up #${esc(h.Followup_No)}</span> ` : ''}${/^Buyer /.test(h.Action) ? '<span class="chip age-followup">Buyer</span> ' : ''}<b>${esc(h.Action)}</b>
      ${h.Waiting_For ? `<div class="sub">Waiting for: ${esc(h.Waiting_For)}</div>` : ''}${h.Created_By ? `<div class="sub">By: ${esc(h.Created_By)}</div>` : ''}
      ${h.Remark ? `<div class="sub">${esc(h.Remark)}</div>` : ''}</div></li>`).join('');
    const info = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '–'}</b></div>`;
    return { html: `
      <div class="page-head"><div><h1>${esc(n.NCR_No)} ${stateBadge(i)}</h1></div>
        <div class="btns">
          <button class="btn primary" data-action="followup" data-id="${esc(id)}">📨 Follow-up</button>
          ${i.needsReview ? `<button class="btn" data-action="reviewed" data-id="${esc(id)}">✓ Reviewed</button>` : ''}
          ${i.closed ? '<button class="btn" data-action="reopen" data-id="' + esc(id) + '">Reopen</button>' : `
            ${n.Status !== 'Ready to Close' ? `<button class="btn" data-action="ready" data-id="${esc(id)}">Mark Ready to Close</button>` : ''}
            <button class="btn ok" data-action="close" data-id="${esc(id)}">Verify &amp; Close NCR</button>`}
          <button class="btn" data-action="edit" data-id="${esc(id)}">Edit NCR</button>
        </div></div>
      ${i.reasons.length ? `<div class="alert info"><b>Needs your action:</b> ${i.reasons.map(esc).join(' · ')}</div>` : (!i.closed ? `<div class="alert ok">⏳ Waiting${n.Due_Date ? ` — next check <b>${L.fmtDate(n.Due_Date)}</b>${i.dueDiff > 0 ? ` (in ${i.dueDiff}d)` : ''}` : ''}. It will return to Today automatically.</div>` : '')}
      ${i.noUpdate ? '<div class="alert warn">📭 Buyer has not written any progress in Remarks — QA must follow up with the Buyer.</div>' : ''}
      ${i.stale ? `<div class="alert warn">⏳ Buyer's Remarks have not changed for ${i.staleDays} days (since ${L.fmtDate(n.Buyer_Remark_Date)}).</div>` : ''}
      ${i.missingNext ? '<div class="alert bad">⚠️ Next Action is required for this NCR.</div>' : ''}
      ${i.escalate ? `<div class="alert warn">⚠️ Escalation Recommended — ${i.count} follow-ups so far (threshold ${s.escalationThreshold}).</div>` : ''}
      <div class="grid2">
        <section class="card"><h2>NCR Information</h2><div class="kvs">
          ${info('NCR No.', n.NCR_No)}${info('Item No.', n.Item_No)}${info('Batch No.', n.Batch_No)}${info('NCR Date', L.fmtDate(n.NCR_Date))}
          ${info('Buyer', n.Buyer)}${info('Supplier', n.Supplier)}${info('Quantity', n.Quantity)}
          ${info('Aging', i.aging === null ? '' : i.aging + ' days' + (i.band ? ' – ' + i.band.label : ''))}
          ${i.closed ? info('Closed Date', L.fmtDate(n.Closed_Date)) : ''}</div>
          <div class="kv block"><span>Defect</span><b>${esc(n.Defect) || '–'}</b></div>
          <div class="kv block"><span>Buyer Remark (from Excel)${n.Buyer_Remark_Date ? ' · updated ' + L.fmtDate(n.Buyer_Remark_Date) : ''}</span><b>${n.Buyer_Remark ? esc(n.Buyer_Remark) : '<span class="bad">No buyer update yet</span>'}</b></div></section>
        <section class="card"><h2>Follow-up Control</h2>
          <form id="ctl" class="form">
            <label>Disposition<select name="Disposition">${options(withCurrent(s.dispositions, n.Disposition), n.Disposition, '— select —')}</select></label>
            <label>Current Status<select name="Status">${options(L.STATUSES, n.Status)}</select></label>
            <label>Next Action<select name="Next_Action">${options(withCurrent(s.nextActions, n.Next_Action), n.Next_Action, '— select —')}</select></label>
            <label>Owner<input name="Owner" list="owners" value="${esc(n.Owner)}"></label>
            <label>Waiting For<select name="Waiting_For">${options(withCurrent(s.waitingFor, n.Waiting_For), n.Waiting_For, '— select —')}</select></label>
            <label>Next check / Due Date<input type="date" name="Due_Date" value="${esc(n.Due_Date)}"></label>
            <label class="full">QA Remark<textarea name="Remark" rows="2">${esc(n.Remark)}</textarea></label>
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
  const imp = { wb: null, name: '', sheet: '', table: null, mapping: {}, opts: { closeMissing: false }, done: null };
  function importPage() {
    const I = NCR.importer;
    let body = '';
    if (imp.done) body += `<div class="alert ok">✅ Import complete: ${imp.done} <button class="btn sm" id="undo-now" type="button">Wrong file? Undo this import</button></div>`;
    if (imp.table) {
      const { records, bad } = I.buildRecords(imp.table, imp.mapping, st.settings.jiraKeywords);
      const p = I.plan(records, st.ncrs);
      const missingReq = I.FIELDS.filter((f) => f.required && !imp.mapping[f.key]);
      const mapRows = I.FIELDS.map((f) => `<label>${f.label}${f.required ? ' *' : ''}<select data-map="${f.key}">${options(imp.table.headers, imp.mapping[f.key], '— not in file —')}</select></label>`).join('');
      const sample = (arr, fn) => arr.slice(0, 8).map(fn).join('');
      const newClosed = p.added.filter((r) => r.CloseReason), toClose = newClosed.length + p.closeNow.length + (imp.opts.closeMissing ? p.missing.length : 0);
      const byReason = (arr) => arr.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});
      const reasons = byReason(newClosed.map((r) => r.CloseReason).concat(p.closeNow.map((c) => c.reason)));
      body += `<section class="card"><h2>2. Check column mapping</h2><p class="hint">File: <b>${esc(imp.name)}</b>${imp.wb.SheetNames.length > 1 ? ` · Sheet: <select id="imp-sheet">${options(imp.wb.SheetNames, imp.sheet)}</select>` : ''} · header row ${imp.table.headerRow} · ${imp.table.rows.length} data rows</p>
        <div class="form cols3">${mapRows}</div>
        ${missingReq.length ? `<div class="alert bad">Map the required column(s): ${missingReq.map((f) => f.label).join(', ')}</div>` : ''}</section>
        <section class="card"><h2>3. Preview</h2>
          <div class="cards small"><div class="card stat"><div class="num">${p.added.length}</div><div class="lbl">New NCRs</div></div>
          <div class="card stat"><div class="num">${p.updated.length}</div><div class="lbl">Updated</div></div>
          <div class="card stat"><div class="num">${p.unchanged.length}</div><div class="lbl">Unchanged</div></div>
          <div class="card stat ${toClose ? 'c-ready' : ''}"><div class="num">${toClose}</div><div class="lbl">Will be closed</div></div></div>
          <p class="hint">New NCRs start as <b>Not Started</b> with the Buyer as Owner. Existing follow-up data (Next Action, Owner, Due Date, Status, history…) is never overwritten. Only raw fields (item, batch, supplier, buyer, date, defect, quantity) are refreshed.</p>
          ${bad.length ? `<details class="alert warn"><summary>${bad.length} row(s) with issues</summary>${bad.slice(0, 20).map((b) => `<div>Row ${b.row}: ${esc(b.reason)}</div>`).join('')}</details>` : ''}
          ${p.added.length ? `<h3>New</h3><div class="table-wrap"><table class="grid compact"><thead><tr><th>NCR</th><th>Item</th><th>Batch</th><th>Date</th><th>Buyer</th><th>Defect</th></tr></thead><tbody>${sample(p.added, (r) => `<tr><td>${esc(r.NCR_No)}</td><td>${esc(r.Item_No)}</td><td>${esc(r.Batch_No)}</td><td>${L.fmtDate(r.NCR_Date)}</td><td>${esc(r.Buyer)}</td><td>${esc(r.Defect)}</td></tr>`)}</tbody></table></div>${p.added.length > 8 ? `<div class="muted small">…and ${p.added.length - 8} more</div>` : ''}` : ''}
          ${p.updated.length ? `<h3>Updated</h3>${sample(p.updated, (u) => `<div class="small"><b>${esc(u.rec.NCR_No)}</b>: ${u.changes.map((c) => `${esc(c.field.replace('_', ' '))} "${esc(c.from)}" → "${esc(c.to)}"`).join('; ')}</div>`)}${p.updated.length > 8 ? `<div class="muted small">…and ${p.updated.length - 8} more</div>` : ''}` : ''}
          ${Object.keys(reasons).length ? `<div class="alert ok"><b>Closed by this file</b> (they move to the Closed page, nothing to close by hand): ${Object.entries(reasons).map(([k, v]) => `${v} × ${esc(k)}`).join(' · ')}. The closed date is today, because the file has no close date.</div>` : ''}
          ${p.missing.length ? `${p.missing.length > 0.5 * st.ncrs.filter((n) => n.Status !== 'Closed').length ? '<div class="alert warn">⚠️ More than half of the open NCRs are missing from this file — is it a partial / filtered export? Leave the box below unticked if so.</div>' : ''}<label class="check block"><input type="checkbox" id="imp-missing"${imp.opts.closeMissing ? ' checked' : ''}> ${p.missing.length} open NCR(s) are not in this file. Close them too (only if the export lists every NCR): ${esc(p.missing.slice(0, 6).map((n) => n.NCR_No).join(', '))}${p.missing.length > 6 ? '…' : ''}</label>` : ''}
          <div class="actions"><button class="btn primary" id="imp-go"${missingReq.length || (!p.added.length && !p.updated.length && !p.closeNow.length && !(imp.opts.closeMissing && p.missing.length)) ? ' disabled' : ''}>Import into NCR Master</button>
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
      const miss = root.querySelector('#imp-missing'); if (miss) miss.addEventListener('change', () => { imp.opts.closeMissing = miss.checked; NCR.app.render(); });
      const un = root.querySelector('#undo-now');
      if (un) un.addEventListener('click', () => NCR.app.confirmModal({ title: 'Undo this import?', text: 'This removes the NCRs it added and restores the ones it changed.', ok: 'Undo import', onOk: () => { S.undoImport(); imp.done = null; NCR.app.toast('Import undone'); NCR.app.render(); } }));
      const cancel = root.querySelector('#imp-cancel'); if (cancel) cancel.addEventListener('click', () => { imp.table = null; imp.wb = null; NCR.app.render(); });
      const go = root.querySelector('#imp-go');
      if (go) go.addEventListener('click', () => {
        const { records } = I2.buildRecords(imp.table, imp.mapping, st.settings.jiraKeywords);
        const p = I2.plan(records, st.ncrs), r = I2.apply(p, imp.opts);
        const nClosed = p.added.filter((x) => x.CloseReason).length + p.closeNow.length + (imp.opts.closeMissing ? p.missing.length : 0);
        S.applyImport(r, { file: imp.name, added: p.added.length, updated: p.updated.length, closed: nClosed });
        const back = p.updated.filter((u) => u.changes.some((c) => c.field === 'Buyer_Remark' && c.to) && isFollowed(S.getNcr(u.old.NCR_ID))).length; // followed-up NCRs with a new buyer remark
        S.saveSettings({ importMapping: Object.assign({}, imp.mapping) });
        imp.done = `${back ? `${back} followed-up NCR${back === 1 ? ' has' : 's have'} a new buyer remark: see <a href="#/followed" data-wfilter='{}'>Followed up</a>. ` : ''}${p.added.length} added${p.added.length ? ' (' + Object.entries(p.added.reduce((m, r) => { const b = r.Buyer || '(No buyer)'; m[b] = (m[b] || 0) + 1; return m; }, {})).map(([b, c]) => b + ' ' + c).join(', ') + ')' : ''}, ${p.updated.length} updated, ${p.added.filter((r) => r.CloseReason).length + p.closeNow.length + (imp.opts.closeMissing ? p.missing.length : 0)} closed (see <a href="#/closed" data-closed="">Closed</a>).`;
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
        <p class="hint">Mode: <b>${st.mode === 'sheets' ? 'Google Sheets (live)' : 'Browser only – data stays in this browser'}</b>. See README for the 5-minute Apps Script setup.</p>
        <form id="api" class="form"><label class="full">Apps Script Web App URL<input name="url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
          <label>API key (optional)<input name="key" value="${esc(cfg.key || '')}"></label>
          <div class="full actions"><button class="btn primary" type="submit">Save &amp; connect</button></div></form></section>
      <section class="card"><h2>Your data</h2>
        ${(() => { const li = S.getLastImport(); return li ? `<p><b>Last import:</b> ${esc(li.file || 'file')} on ${L.fmtDate(li.at)} — ${li.added || 0} added, ${li.updated || 0} updated, ${li.closed || 0} closed.</p>
          <p class="hint">Uploaded the wrong file? <b>Undo</b> removes the NCRs that import added and puts back the ones it changed. Follow-ups you recorded on those NCRs since then are lost too. Only the most recent import can be undone.</p>
          <div class="actions"><button class="btn" id="undo-import">Undo last import</button></div>` : '<p class="hint">No import to undo yet. After an import you can undo it here.</p>'; })()}
        <hr class="rule">
        <p><b>Start over:</b> delete every NCR and its history from ${st.mode === 'sheets' ? 'the Google Sheet' : 'this browser'}. Settings (dropdowns, keywords) are kept.</p>
        <div class="actions"><button class="btn danger" id="clear-all">Clear all NCR data…</button></div></section>
      <form id="cfg" class="card"><h2>Dropdowns &amp; thresholds</h2><p class="hint">One option per line.</p>
        <div class="form cols3">${ta('dispositions', 'Disposition')}${ta('nextActions', 'Next Action')}${ta('waitingFor', 'Waiting For')}${ta('owners', 'Owners (suggestions)')}</div>
        <div class="form cols3"><label>Hold / scrap keywords (Remarks)<textarea name="holdKeywords" rows="3">${esc((s.holdKeywords || []).join('\n'))}</textarea></label>
          <label>Close at import when Remarks contain<textarea name="jiraKeywords" rows="3">${esc((s.jiraKeywords || []).join('\n'))}</textarea></label></div>
        <div class="form cols3"><label>Due Soon window (days)<input type="number" min="1" name="dueSoonDays" value="${s.dueSoonDays}"></label>
          <label>Escalate at follow-up count ≥<input type="number" min="1" name="escalationThreshold" value="${s.escalationThreshold}"></label>
          <label>Default next check after follow-up (days)<input type="number" min="1" name="defaultCheckDays" value="${s.defaultCheckDays}"></label>
          <label>Buyer update stale after (days)<input type="number" min="1" name="buyerStaleDays" value="${s.buyerStaleDays}"></label></div>
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
      const ui = root.querySelector('#undo-import');
      if (ui) ui.addEventListener('click', () => NCR.app.confirmModal({ title: 'Undo the last import?', text: 'This removes the NCRs it added and restores the ones it changed.', ok: 'Undo import', onOk: () => { S.undoImport(); NCR.app.toast('Import undone'); NCR.app.render(); } }));
      root.querySelector('#clear-all').addEventListener('click', () => NCR.app.confirmModal({ title: 'Delete all NCR data?', text: `This deletes all ${st.ncrs.length} NCRs and their history from ${st.mode === 'sheets' ? 'the Google Sheet' : 'this browser'}. It cannot be undone.`, typed: 'DELETE', ok: 'Delete everything', onOk: () => { S.clearAll(); NCR.app.toast('All NCR data deleted'); NCR.app.render(); } }));
      root.querySelector('#cfg').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        const lines = (k) => String(f.get(k)).split('\n').map((x) => x.trim()).filter(Boolean);
        const num = (k, d) => Math.max(1, parseInt(f.get(k), 10) || d);
        const b0 = num('b0', 7), b1 = Math.max(b0 + 1, num('b1', 14)), b2 = Math.max(b1 + 1, num('b2', 30));
        const B = L.DEFAULT_SETTINGS.agingBands;
        S.saveSettings({ holdKeywords: lines('holdKeywords'), jiraKeywords: lines('jiraKeywords'), dispositions: lines('dispositions'), nextActions: lines('nextActions'), waitingFor: lines('waitingFor'), owners: lines('owners'),
          dueSoonDays: num('dueSoonDays', 2), escalationThreshold: num('escalationThreshold', 3), buyerStaleDays: num('buyerStaleDays', 7), defaultCheckDays: num('defaultCheckDays', 7),
          agingBands: [Object.assign({}, B[0], { max: b0 }), Object.assign({}, B[1], { max: b1 }), Object.assign({}, B[2], { max: b2 }), B[3]] });
        NCR.app.toast('Settings saved');
      });
    } };
  }

  NCR.views = { esc, options, withCurrent, home, closedPage, list, followedPage, setWaitFilter, holdPage, setHJ, currentIds, CF, detail, importPage, settings, setFilter, inf, SEL, showAll, sectionIds, HOME_OPEN, WF_OPEN, isFollowed, buyerOf, open, NO_BUYER };
})(window.NCR);
