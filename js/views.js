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
  const cbHead = (key) => `<th class="cb"><input type="checkbox" class="sel-all"${key ? ` data-key="${key}"` : ''} title="Select all ${key ? 'in this list, including rows not shown' : 'in this table'}"></th>`;
  const cbCell = (n) => `<td class="cb"><input type="checkbox" class="sel" data-id="${esc(n.NCR_ID)}"${SEL.has(n.NCR_ID) ? ' checked' : ''}></td>`;

  // ---------- small renderers ----------
  function stateBadge(i) { const m = L.STATE_META[i.state]; return `<span class="badge ${m.cls}">${m.icon} ${m.label}</span>`; }
  function dueText(n, i) {
    if (!n.Due_Date) return '<span class="muted">Not set</span>';
    let rel = '';
    if (!i.closed && i.dueDiff !== null) rel = i.dueDiff < 0 ? `<div class="sub bad">${-i.dueDiff}d overdue</div>` : i.dueDiff === 0 ? '<div class="sub warn">Today</div>' : `<div class="sub">in ${i.dueDiff}d</div>`;
    return `${L.fmtDate(n.Due_Date)}${rel}`;
  }
  const nextText = (n, i) => (n.Next_Action ? esc(n.Next_Action) : i.closed || i.ready ? '–' : '<span class="muted">not set</span>');
  function remarkText(n, i) {
    if (!n.Buyer_Remark) return i.closed ? '–' : '<span class="chip age-escalation">📭 No buyer update</span>';
    return `<div class="rtext" title="${esc(n.Buyer_Remark)}">${esc(n.Buyer_Remark)}</div>${n.Buyer_Remark_Date ? `<div class="sub">${L.fmtDate(n.Buyer_Remark_Date)}</div>` : ''}${i.stale ? `<div><span class="chip age-attention" title="Remarks unchanged for ${i.staleDays} days">⏳ No change ${i.staleDays}d</span></div>` : ''}`;
  }
  const whyText = (i) => (i.reasons.length ? i.reasons.map((r) => `<div class="why">${esc(r)}</div>`).join('') : '<span class="muted">Waiting</span>')
    + (i.remarkGroup === 'hold' ? '<div class="sub">⏳ Hold / scrap – cannot close yet</div>' : i.remarkGroup === 'none' ? '<div class="sub">📭 no buyer update</div>' : '');
  const newChip = (i) => (i.isNew ? ' <span class="chip new">NEW</span>' : '');

  // "Rounds" = follow-ups plus buyer remark changes. Many rounds on an NCR that has a remark means it keeps moving but never finishes.
  const roundsOf = (n) => (Number(n.Followup_Count) || 0) + S.historyFor(n.NCR_ID).filter((x) => /^Buyer update|^Buyer cleared/.test(x.Action)).length;
  const LONG_ROUNDS = 3;
  const longRunning = (n) => inf(n).remarkGroup !== 'none' && roundsOf(n) >= LONG_ROUNDS;
  // Work order: 1) no remark, oldest first  2) has remark, most rounds first (never finishing), then oldest
  const priSort = (a, b) => {
    const ga = inf(a).remarkGroup === 'none' ? 0 : 1, gb = inf(b).remarkGroup === 'none' ? 0 : 1;
    return ga - gb || (ga ? roundsOf(b) - roundsOf(a) : 0) || oldest(a, b);
  };

  // Worklist table: what, who, why, when — and one-click actions.
  function workTable(list, emptyMsg, key, limit, withRemark) {
    if (!list.length) return `<div class="empty">${emptyMsg || 'Nothing here'}</div>`;
    limit = limit || 10;
    sectionIds[key] = list.map((n) => n.NCR_ID);
    const shown = showAll[key] ? list : list.slice(0, limit);
    const rows = shown.map((n) => {
      const i = inf(n), rd = roundsOf(n), idx = list.indexOf(n) + 1;
      return `<tr class="${i.remarkGroup === 'none' ? 'rp-none' : longRunning(n) ? 'rp-long' : 'rp-has'}" data-href="#/ncr/${esc(n.NCR_ID)}">${cbCell(n)}<td class="rank">${idx}</td>
        <td class="nowrap"><b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)} · ${i.aging === null ? '' : i.aging + 'd'}</div>${recentChips(n) || longRunning(n) ? `<div>${recentChips(n)}${longRunning(n) ? ` <span class="chip age-attention" title="Follow-ups plus buyer remark changes">🔁 ${rd} rounds</span>` : ''}</div>` : ''}</td>
        <td class="wide">${esc(buyerOf(n))}<div class="sub clip" title="${esc(n.Buyer_Remark || n.Defect)}">${esc(n.Defect)}${!withRemark && n.Buyer_Remark ? ' · “' + esc(n.Buyer_Remark) + '”' : ''}</div></td>
        ${withRemark ? `<td class="remark">${remarkText(n, i)}</td>` : ''}
        <td class="right nowrap">${i.needsReview ? `<button class="btn sm" data-action="reviewed" data-id="${esc(n.NCR_ID)}" title="I read the buyer update – check again in ${st.settings.defaultCheckDays} days">✓ Reviewed</button>` : ''}</td></tr>`;
    }).join('');
    const more = list.length > limit ? `<div class="more"><button class="link" data-action="showall" data-key="${key}">${showAll[key] ? 'Show fewer' : `Show all ${list.length}`}</button> · <button class="link" data-action="selsection" data-key="${key}">Select all ${list.length}</button></div>` : '';
    return `<div class="table-wrap"><table class="grid compact"><thead><tr>${cbHead(key)}<th title="Work order">#</th><th>NCR</th><th>Buyer / Defect</th>${withRemark ? '<th>Buyer remark</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${more}`;
  }

  const byDue = (a, b) => (a.Due_Date || '9999') < (b.Due_Date || '9999') ? -1 : (a.Due_Date || '9999') > (b.Due_Date || '9999') ? 1 : 0;
  const byOldest = (a, b) => String(a.NCR_Date || '9999').localeCompare(String(b.NCR_Date || '9999'));

  const emptyState = () => `<div class="card empty-state"><h2>No NCRs yet</h2><p>All data comes from your Excel export. Upload the file to get started — upload the same export again every week and only new or changed NCRs are applied.</p><a class="btn primary" href="#/import">Import Excel</a> <a class="btn" href="#/help">❓ How to use</a></div>`;

  // ---------- charts (inline SVG, no library) ----------
  // Palette from the design colours, validated as one ordered set: dark, blue, grey, light blue.
  const SEG = [
    { k: 'none', label: 'No update', color: 'var(--c-none)', ink: 'var(--i-none)' },
    { k: 'progress', label: 'In progress', color: 'var(--c-progress)', ink: 'var(--i-progress)' },
    { k: 'followed', label: 'Followed up', color: 'var(--c-fu)', ink: 'var(--i-fu)' },
    { k: 'hold', label: 'Hold for scrap', color: 'var(--c-hold)', ink: 'var(--i-hold)' },
    { k: 'jira', label: 'Jira closed', color: 'var(--c-jira)', ink: 'var(--i-jira)' },
    { k: 'closed', label: 'Closed', color: 'var(--c-closed)', ink: 'var(--i-closed)' },
  ];
  const niceStep = (max) => { const raw = Math.max(1, max) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  // bar with only its right (data) end rounded; the baseline end stays square
  const barPath = (x, y, w, h, r) => (w <= r * 2 ? `M${x},${y}h${w}v${h}h${-w}z` : `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`);
  const tipAttrs = (a, b, v, color) => `data-ta="${esc(a)}" data-tb="${esc(b)}" data-tv="${esc(v)}" data-tc="${color}" tabindex="0"`;

  function buyerChart(rows) {
    const list = rows.filter((r) => r.total).sort((a, b) => b.total - a.total);
    if (!list.length) return '<div class="empty">No NCRs yet.</div>';
    const labelW = 150, right = 46, W = 600, rowH = 36, top = 8, axisH = 26;
    const max = Math.max(...list.map((r) => r.total)), step = niceStep(max), top_ = Math.ceil(max / step) * step;
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
        bars += `<path class="seg" d="${barPath(x, y, dw, 22, last ? 4 : 0)}" style="fill:${sg.color}" ${tipAttrs(r.name, sg.label, r[sg.k] + ' of ' + r.total + ' NCRs', sg.color)}/>`;
        if (w >= 26) bars += `<text x="${x + w / 2 - (last ? 0 : 1)}" y="${y + 16}" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:${sg.ink}" pointer-events="none">${r[sg.k]}</text>`;
        x += w;
      });
      bars += `<text x="${x + 8}" y="${y + 16}" font-size="14" font-weight="800">${r.total}</text>`;
    });
    const legend = SEG.map((sg) => `<span class="lg"><i style="background:${sg.color}"></i>${sg.label}</span>`).join('');
    return `<div class="legend-row">${legend}</div><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="All NCRs per buyer, split by status. Values are in the table below.">${g}${bars}</svg>`;
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
    return { html: `<div class="page-head"><h1>Home</h1><span class="inline"><a class="btn" href="#/help">❓ How to use</a><a class="btn" href="#/response">📊 Buyer response</a><span class="muted">${L.fmtDate(L.todayISO())}</span></span></div>
      <div class="bigs">${big(tot.total, 'Total', '#/home')}${big(tot.todo, 'To follow up', '#/list', `data-filter='${esc(JSON.stringify({ tab: 'none' }))}'`)}${big(tot.followed, 'Followed up', '#/followed', `data-wfilter='{}'`)}${big(tot.hold, 'Hold for scrap', '#/hold', `data-hjfilter='${esc(JSON.stringify({ tab: 'hold' }))}'`)}${big(tot.jira, 'Jira closed', '#/hold', `data-hjfilter='${esc(JSON.stringify({ tab: 'jira' }))}'`)}${big(tot.closed, 'Closed', '#/closed', 'data-closed=""')}</div>
      <div class="charts">
        <section class="block"><h2>Overview by buyer</h2><p class="hint">Each bar is all of one buyer's NCRs, split by status: still to follow up (no remark / in progress), followed up, hold for scrap, Jira closed and closed. Hover a segment for the exact count.</p>${buyerChart(rows)}</section>
        <section class="block"><h2>How long they have been open</h2><p class="hint">All open NCRs grouped by days since the NCR date.</p>${agingChart(open())}</section>
      </div>
      <section class="block"><details><summary>Show the table (click a number to open those NCRs)</summary><p class="hint">To follow up = No remark + In progress. <b>Followed up</b> are waiting for their next check date. Click a number to see those NCRs; ▸ lists the NCRs with no remark.</p>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Buyer</th><th>Total</th><th>To follow up</th><th>No remark</th><th>In progress</th><th>Followed up</th><th>Hold for scrap</th><th>Jira closed</th><th>Closed</th></tr></thead>
        <tbody>${body}<tr class="total"><td><b>Total</b></td><td>${tot.total}</td><td>${tot.todo}</td><td>${tot.none}</td><td>${tot.progress}</td><td>${tot.followed}</td><td>${tot.hold}</td><td>${tot.jira}</td><td>${tot.closed}</td></tr></tbody></table></div>
        <p class="hint">Hold for scrap = Remarks contain “${esc(st.settings.holdKeywords.join('”, “'))}”. Jira closed = Remarks contain “${esc(st.settings.jiraKeywords.join('”, “'))}”; those NCRs are closed when the file is imported. Any letter case. Change the keywords in Settings.</p></details></section>` };
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
      <div class="filters"><label class="grow">Search<input id="c-q" type="search" placeholder="🔍 Search NCR No., Item No. or Batch No." value="${esc(CF.q)}"></label>
        <label>Buyer<select id="c-buyer">${options(buyers, CF.buyer, 'All')}</select></label></div>
      <div id="closed-body">${closedBody()}</div>`,
    bind(root) {
      const r = () => { root.querySelector('#closed-body').innerHTML = closedBody(); };
      [['c-q', 'q'], ['c-buyer', 'buyer']].forEach(([id, k]) => root.querySelector('#' + id).addEventListener('input', (e) => { CF[k] = e.target.value; r(); }));
    } };
  }

  // ---------- Open NCRs (one worklist: no remark first, then has remark) ----------
  const LF0 = { q: '', buyer: '', tab: 'none', show: 'open', status: '', owner: '', waiting: '', disposition: '', due: '', buyerUpdate: '', fu: '', age: '', sort: 'due', dir: 'asc', from: '', to: '', defect: '', year: '', month: '', changed: false };
  const LF = Object.assign({}, LF0);
  // links from Home pass buyerUpdate; map them onto the two priority tabs
  function setFilter(f) { Object.keys(LF).forEach((k) => delete LF[k]); Object.assign(LF, LF0, f); }

  // Created-date range and defect type, shared by To follow up and Followed up
  const inDates = (n, F) => !((F.from && (n.NCR_Date || '') < F.from) || (F.to && (n.NCR_Date || '') > F.to) || (F.defect && n.Defect !== F.defect) || (F.year && String(n.NCR_Date || '').slice(0, 4) !== F.year) || (F.month && String(n.NCR_Date || '').slice(5, 7) !== F.month) || (F.changed && !(recentOf(n) || []).some((c) => ['new', 'update', 'cleared'].includes(c.t))));
  // what the latest upload changed, by NCR No. (drives the NEW / updated markers and the "only changed" filter)
  let recentKey = null, recentMap = {};
  function recentOf(n) {
    const l = S.getImports().filter((x) => x.changes).pop();
    if (!l) return null;
    if (recentKey !== l.at) { recentKey = l.at; recentMap = {}; l.changes.forEach((c) => { (recentMap[c.no] = recentMap[c.no] || []).push(c); }); }
    return recentMap[n.NCR_No] || null;
  }
  const recentChips = (n) => { const r = recentOf(n); if (!r) return ''; return r.map((c) => c.t === 'new' ? '<span class="chip new" title="New in the latest upload">🆕 New</span>' : c.t === 'update' ? '<span class="chip new" title="Remarks changed in the latest upload">🔔 Updated</span>' : c.t === 'cleared' ? '<span class="chip age-escalation" title="Buyer cleared the Remarks in the latest upload">📭 Cleared</span>' : '').join(' '); };
  // How many NCRs of the latest upload sit on this page (`bucket`) and how many went elsewhere (Hold & Jira, Closed)
  function recentCount(bucket) {
    const l = S.getImports().filter((x) => x.changes).pop(); if (!l) return { here: 0, other: 0 };
    const nos = new Set(l.changes.filter((c) => ['new', 'update', 'cleared'].includes(c.t)).map((c) => c.no)), byNo = new Map(st.ncrs.map((n) => [n.NCR_No, n]));
    let here = 0, other = 0; nos.forEach((no) => { const n = byNo.get(no); if (!n) return; inf(n).bucket === bucket ? here++ : other++; });
    return { here, other };
  }
  const filterBar = (idp, F) => {
    const defects = [...new Set(st.ncrs.map((n) => n.Defect).filter(Boolean))].sort();
    const years = [...new Set(st.ncrs.map((n) => String(n.NCR_Date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const active = ['year', 'month', 'from', 'to', 'defect'].filter((k) => F[k]).length;
    return `<details class="datefilter"${active ? ' open' : ''}><summary>🗓 Filter by date or defect${active ? ` <span class="chip new">${active} active</span>` : ''}</summary><div class="datebar"><label>Year<select id="${idp}-year">${options(years, F.year, 'All')}</select></label>
      <label>Month<select id="${idp}-month"><option value="">All</option>${MN.map((m, k) => { const v = String(k + 1).padStart(2, '0'); return `<option value="${v}"${F.month === v ? ' selected' : ''}>${m}</option>`; }).join('')}</select></label>
      <label>Created from<input type="date" id="${idp}-from" value="${esc(F.from)}"></label><label>to<input type="date" id="${idp}-to" value="${esc(F.to)}"></label>
      <label>Defect<select id="${idp}-defect">${options(defects, F.defect, 'All')}</select></label></div></details>`;
  };
  // the bell toggle lives outside the filter box, next to the tabs
  const changedBtn = (attr, F, bucket) => { const c = recentCount(bucket); return c.here || F.changed ? `<button class="btn${F.changed ? ' primary' : ''}" type="button" ${attr}="1" title="Only the NCRs on this page that are new, or whose Remarks changed, in the latest uploaded file${c.other ? `. ${c.other} more are on Hold &amp; Jira or Closed` : ''}">🔔 New or changed since last upload (${c.here})</button>` : ''; };
  function bindFilterBar(root, idp, F, refresh) {
    ['year', 'month', 'from', 'to', 'defect'].forEach((k) => root.querySelector(`#${idp}-${k}`).addEventListener('change', (e) => { F[k] = e.target.value; NCR.app.render(); }));
  }

  // every open NCR matching the non-tab filters; `tab` decides which part of it to show
  function baseList(ignoreBuyer) {
    const q = LF.q.trim().toLowerCase();
    return st.ncrs.filter((n) => {
      const i = inf(n);
      if (i.bucket !== 'todo' && i.bucket !== 'followed') return false; // closed, Hold for scrap and Jira NCRs live on their own pages
      if (q && !(`${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))) return false;
      if (!ignoreBuyer && LF.buyer && (LF.buyer === '__none' ? n.Buyer : n.Buyer !== LF.buyer)) return false;
      if (!inDates(n, LF)) return false;
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
  const TAB_DEFS = [['none', '1', 'No remark', 'Chase these first. The buyer has written nothing.'], ['has', '2', 'Has remark', 'Check progress. Push the ones that never finish.'], ['all', '3', 'All', 'Everything, in work order.']];
  const tabsHtml = (cnt, cur, attr) => `<div class="prio">${TAB_DEFS.map(([k, n, l, h]) => `<button class="ptab p-${k}${cur === k ? ' on' : ''}" ${attr}="${k}"><span class="pn">${n}</span><span class="pt"><b>${l}</b><small>${h}</small></span><span class="pc">${cnt[k]}</span></button>`).join('')}</div>`;
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
      body = `<section class="block"><h2>No remark: chase these first <span class="count">${v.none.length}</span></h2><p class="hint">The buyer has written nothing in Remarks. Numbered in work order: oldest first.</p>${workTable(v.none.slice().sort(oldest), 'Every open NCR has a remark.', 'none', 25)}</section>`;
    } else if (LF.tab === 'has') {
      const g = (fn) => v.has.filter(fn).sort(priSort);
      const parts = [
        ['rv', 'Buyer updated — read, then ✓ Reviewed', 'Remarks changed since you last reviewed.', g((n) => inf(n).needsReview)],
        ['pr', 'In progress', 'Remarks written, not finished. NCRs with the most rounds come first: they keep moving but never end.', g((n) => inf(n).remarkGroup === 'progress' && !inf(n).needsReview)],
        ['hd', 'Hold / scrap', 'Waiting for scrap. Cannot close yet.', g((n) => inf(n).remarkGroup === 'hold' && !inf(n).needsReview)],
      ].filter((x) => x[3].length);
      body = parts.map(([k, t, h, l]) => `<section class="block"><h2>${t} <span class="count">${l.length}</span></h2><p class="hint">${h}</p>${workTable(l, '', k, 25, true)}</section>`).join('')
        || '<div class="empty">No NCRs with a remark.</div>';
    } else {
      body = `<section class="block"><h2>All <span class="count">${v.shown.length}</span></h2>${workTable(v.shown.slice().sort(priSort), 'No open NCRs match.', 'all', 40, true)}</section>`;
    }
    return `${pills}${buyerLine(LF.buyer)}${tabs}
      <div class="row-between wait-line"><span class="muted">${hidden ? `${hidden} already followed up — <a href="#/followed" data-wfilter='${esc(JSON.stringify({ buyer: LF.buyer }))}'>see Followed up</a>` : ''}</span>
        <span class="inline">${changedBtn('data-chg', LF, 'todo')}<button class="btn" data-action="export" data-src="todo">Export to Excel</button>${LF.buyer ? `<button class="btn primary" data-action="chase" data-buyer="${esc(cur)}"${currentIds().length ? '' : ' disabled'}>Message ${esc(cur)} (${currentIds().length})</button>` : ''}</span></div>
      ${body}`;
  }

  function list() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>To follow up</h1></div>' + emptyState() };
    const s = st.settings;
    const sel = (id, label, html) => `<label>${label}<select id="${id}">${html}</select></label>`;
    const o = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('');
    const todo = st.ncrs.filter((n) => inf(n).bucket === 'todo').length, noRem = st.ncrs.filter((n) => inf(n).bucket === 'todo' && inf(n).remarkGroup === 'none').length;
    return { html: `<div class="page-head"><div><h1>To follow up</h1><div class="muted"><b>${todo}</b> to follow up · <b>${noRem}</b> with no remark</div></div></div>
      <div class="filters flat">
        <label class="grow"><input id="f-q" aria-label="Search" type="search" placeholder="🔍 Search NCR No., Item No. or Batch No." value="${esc(LF.q)}"></label>
        <button class="btn" id="f-clear">Clear</button>
        <div class="full-row">${filterBar('f', LF)}</div>
      </div>
      <div id="open-main">${openMain()}</div>`,
    bind(root) {
      const main = root.querySelector('#open-main');
      const refresh = () => { main.innerHTML = openMain(); };
      root.querySelector('#f-q').addEventListener('input', (e) => { LF.q = e.target.value; refresh(); });
      bindFilterBar(root, 'f', LF, refresh);
      root.querySelector('#f-clear').addEventListener('click', () => { setFilter({}); NCR.app.render(); });
      main.addEventListener('click', (e) => { // pills and tabs live inside the refreshed area
        const b = e.target.closest('[data-buyer].pill'), t = e.target.closest('[data-tab]');
        if (e.target.closest('[data-chg]')) { LF.changed = !LF.changed; refresh(); } else if (b) { LF.buyer = b.dataset.buyer; refresh(); } else if (t) { LF.tab = t.dataset.tab; refresh(); }
      });
    },
    refresh: () => { const el = document.querySelector('#open-main'); if (el) el.innerHTML = openMain(); } };
  }

  // ---------- Followed up (stays until the NCR is closed; shows the timeline) ----------
  const WF = { q: '', buyer: '', tab: 'none', from: '', to: '', defect: '', year: '', month: '', changed: false };
  const WF_OPEN = new Set(); // rows whose timeline is expanded
  function setWaitFilter(f) { Object.assign(WF, { q: '', buyer: '', tab: 'none', from: '', to: '', defect: '', year: '', month: '', changed: false }, f); }
  // what, if anything, needs QA's attention on a followed-up NCR
  // Followed up several times and the buyer's remark has not changed since the first follow-up
  function noReplyAfter(n) {
    const count = Number(n.Followup_Count) || 0;
    if (count < (st.settings.escalationThreshold || 3)) return 0;
    const first = S.historyFor(n.NCR_ID).filter((h) => h.Followup_No).map((h) => String(h.Date)).sort()[0];
    if (!first) return 0;
    return !n.Buyer_Remark_Date || String(n.Buyer_Remark_Date).slice(0, 10) < first ? count : 0;
  }
  function attention(n) {
    const i = inf(n), nr = noReplyAfter(n);
    if (nr) return { rank: 0, label: `No reply after ${nr} follow-ups`, cls: 'b-overdue', noReply: true };
    if (i.remarkGroup === 'none') return { rank: 1, label: 'Still no remark', cls: 'b-overdue' };
    if (longRunning(n)) return { rank: 1, label: `Open after ${roundsOf(n)} rounds`, cls: 'b-soon' };
    if (i.needsReview) return { rank: 2, label: 'Buyer updated', cls: 'b-review' };
    if (i.dueDiff !== null && i.dueDiff <= 0) return { rank: 3, label: 'Check due', cls: 'b-soon' };
    return null;
  }
  function followedList() {
    const q = WF.q.trim().toLowerCase();
    return st.ncrs.filter((n) => isFollowed(n) && inDates(n, WF) && (!q || `${n.NCR_No} ${n.Item_No} ${n.Batch_No}`.toLowerCase().includes(q))
      && (!WF.buyer || (WF.buyer === '__none' ? !n.Buyer : n.Buyer === WF.buyer)))
      .sort((a, b) => { const x = attention(a), y = attention(b); return priSort(a, b) || (x ? x.rank : 9) - (y ? y.rank : 9) || (a.Due_Date || '9999').localeCompare(b.Due_Date || '9999') || oldest(a, b); });
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
    const attn = list.filter(attention).length, unanswered = list.filter((n) => noReplyAfter(n)).length;
    const rows = list.map((n) => {
      const i = inf(n), at = attention(n), open_ = WF_OPEN.has(n.NCR_ID);
      const changes = S.historyFor(n.NCR_ID).filter((x) => /^Buyer update|^Buyer cleared/.test(x.Action)).length;
      return `<tr class="${i.remarkGroup === 'none' ? 'rp-none' : longRunning(n) ? 'rp-long' : 'rp-has'}" data-href="#/ncr/${esc(n.NCR_ID)}">${cbCell(n)}<td class="rank">${list.indexOf(n) + 1}</td>
        <td class="nowrap"><button class="link tog" data-action="toggletl" data-id="${esc(n.NCR_ID)}" title="Show timeline">${open_ ? '▾' : '▸'}</button> <b>${esc(n.NCR_No)}</b><div class="sub">Item ${esc(n.Item_No)} · ${i.aging === null ? '' : i.aging + 'd'}</div>${recentChips(n) ? `<div>${recentChips(n)}</div>` : ''}</td>
        <td class="wide">${esc(buyerOf(n))}<div class="sub clip">${esc(n.Defect)}</div></td>
        <td class="remark">${remarkText(n, i)}${(recentOf(n) || []).filter((c) => c.t === 'update' && c.from).map((c) => `<div class="sub" title="${esc(c.from)}">Before: ${esc(c.from.length > 90 ? c.from.slice(0, 90) + '…' : c.from)}</div>`).join('')}</td>
        <td class="nowrap">${n.Last_Followup ? L.fmtDate(n.Last_Followup) : '–'}<div class="sub">${i.count} follow-up${i.count === 1 ? '' : 's'}${changes ? ` · ${changes} buyer update${changes === 1 ? '' : 's'}` : ''}</div></td>
        <td>${at ? `<span class="badge ${at.cls}">${at.label}</span>` : '<span class="sub">Waiting</span>'}</td>
        <td class="right acts">${i.needsReview ? `<button class="btn sm" data-action="reviewed" data-id="${esc(n.NCR_ID)}" title="I read the buyer update">✓ Reviewed</button>` : ''}</td></tr>
        ${open_ ? `<tr class="sub-row"><td colspan="8"><ul class="mini-tl">${timelineRows(n)}</ul><a href="#/ncr/${esc(n.NCR_ID)}">Full timeline →</a></td></tr>` : ''}`;
    }).join('');
    return `${pillsHtml(per, all.length, WF.buyer, 'data-wbuyer')}${buyerLine(WF.buyer)}${tabsHtml(cnt, WF.tab, 'data-wtab')}
      <div class="row-between wait-line"><span class="muted">${list.length && attn ? `<b>${attn}</b> need attention${unanswered ? ` · <b>${unanswered}</b> with no reply after ${st.settings.escalationThreshold || 3}+ follow-ups` : ''}` : ''}</span>
        <span class="inline">${changedBtn('data-wchg', WF, 'followed')}<button class="btn" data-action="export" data-src="followed"${list.length ? '' : ' disabled'}>Export to Excel</button></span></div>
      <section class="block">${list.length ? `<div class="table-wrap"><table class="grid compact"><thead><tr>${cbHead('followed')}<th title="Work order">#</th><th>NCR</th><th>Buyer / Defect</th><th>Latest remark</th><th>Follow-ups</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty">${all.length ? 'No NCRs in this tab.' : 'Nothing here yet. Press Follow-up on an NCR in To follow up: it moves here and stays until it is closed.'}</div>`}</section>`;
  }
  function followedPage() {
    if (!st.ncrs.length) return { html: '<div class="page-head"><h1>Followed up</h1></div>' + emptyState() };
    const n = open().filter(isFollowed).length;
    return { html: `<div class="page-head"><div><h1>Followed up</h1><div class="muted"><b>${n}</b> followed up and not closed yet. Buyer replies from each new upload are added to their timeline.</div></div></div>
      <div class="filters flat"><label class="grow"><input id="w-q" aria-label="Search" type="search" placeholder="🔍 Search NCR No., Item No. or Batch No." value="${esc(WF.q)}"></label><button class="btn" id="w-clear">Clear</button><div class="full-row">${filterBar('w', WF)}</div></div>
      <div id="followed-main">${followedBody()}</div>`,
    bind(root) {
      const main = root.querySelector('#followed-main'), refresh = () => { main.innerHTML = followedBody(); };
      bindFilterBar(root, 'w', WF, refresh);
      root.querySelector('#w-clear').addEventListener('click', () => { setWaitFilter({}); NCR.app.render(); });
      root.querySelector('#w-q').addEventListener('input', (e) => { WF.q = e.target.value; refresh(); });
      main.addEventListener('click', (e) => { const b = e.target.closest('[data-wbuyer]'), t = e.target.closest('[data-wtab]'); if (e.target.closest('[data-wchg]')) { WF.changed = !WF.changed; refresh(); } else if (b) { WF.buyer = b.dataset.wbuyer; refresh(); } else if (t) { WF.tab = t.dataset.wtab; refresh(); } });
    } };
  }

  // Plain rows for the Excel export (one object per NCR)
  function exportRows(ids) {
    return ids.map(S.getNcr).filter(Boolean).sort(oldest).map((n) => {
      const i = inf(n);
      return { 'NCR No.': n.NCR_No, 'Item No.': n.Item_No, 'Batch No.': n.Batch_No, Buyer: n.Buyer || '', Defect: n.Defect, Created: n.NCR_Date ? L.fmtDate(n.NCR_Date) : '',
        'Days open': i.aging === null ? '' : i.aging, 'Buyer remark': n.Buyer_Remark || '', 'Follow-ups': i.count, 'Last follow-up': n.Last_Followup ? L.fmtDate(n.Last_Followup) : '', 'Next check': n.Due_Date ? L.fmtDate(n.Due_Date) : '' };
    });
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
      <div class="card filters"><label class="grow">Search<input id="h-q" type="search" placeholder="🔍 Search NCR No., Item No. or Batch No." value="${esc(HJ.q)}"></label></div>
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
    let undoShown = false; // the newest review entry gets an Undo button
    const hist = S.historyFor(id).map((h) => `<li><div class="t-date">${L.fmtDate(h.Date)}</div><div class="t-body">
      ${h.Followup_No ? `<span class="chip fu">Follow-up #${esc(h.Followup_No)}</span> ` : ''}${/^Buyer /.test(h.Action) ? '<span class="chip age-followup">Buyer</span> ' : ''}<b>${esc(h.Action)}</b>${/^Reviewed buyer update/.test(h.Action) && !undoShown && (undoShown = true) ? ` <button class="btn sm" data-action="unreview" data-id="${esc(id)}" title="Pressed Reviewed by mistake? Undo it">↩ Undo</button>` : ''}
      ${h.Waiting_For ? `<div class="sub">Waiting for: ${esc(h.Waiting_For)}</div>` : ''}${h.Created_By ? `<div class="sub">By: ${esc(h.Created_By)}</div>` : ''}
      ${h.Remark ? `<div class="sub">${esc(h.Remark)}</div>` : ''}</div></li>`).join('');
    const info = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '–'}</b></div>`;
    return { html: `
      <div class="page-head"><div><h1>${esc(n.NCR_No)} ${stateBadge(i)}</h1></div>
        <div class="btns">
          <button class="btn primary" data-action="followup" data-id="${esc(id)}">📨 Follow-up</button>
          ${i.needsReview ? `<button class="btn" data-action="reviewed" data-id="${esc(id)}">✓ Reviewed</button>` : ''}
        </div></div>
      ${i.reasons.length ? `<div class="alert info"><b>Needs your action:</b> ${i.reasons.map(esc).join(' · ')}</div>` : (!i.closed ? `<div class="alert ok">⏳ Waiting${n.Due_Date ? ` — next check <b>${L.fmtDate(n.Due_Date)}</b>${i.dueDiff > 0 ? ` (in ${i.dueDiff}d)` : ''}` : ''}. It will return to Today automatically.</div>` : '')}
      ${i.noUpdate ? '<div class="alert warn">📭 Buyer has not written any progress in Remarks — QA must follow up with the Buyer.</div>' : ''}
      ${i.stale ? `<div class="alert warn">⏳ Buyer's Remarks have not changed for ${i.staleDays} days (since ${L.fmtDate(n.Buyer_Remark_Date)}).</div>` : ''}
      ${i.escalate ? `<div class="alert warn">⚠️ Escalation Recommended — ${i.count} follow-ups so far (threshold ${s.escalationThreshold}).</div>` : ''}
      <div class="grid2">
        <section class="card"><h2>NCR Information</h2><div class="kvs">
          ${info('NCR No.', n.NCR_No)}${info('Item No.', n.Item_No)}${info('Batch No.', n.Batch_No)}${info('NCR Date', L.fmtDate(n.NCR_Date))}
          ${info('Buyer', n.Buyer)}${info('Supplier', n.Supplier)}${info('Quantity', n.Quantity)}
          ${info('Aging', i.aging === null ? '' : i.aging + ' days' + (i.band ? ' – ' + i.band.label : ''))}
          ${i.closed ? info('Closed Date', L.fmtDate(n.Closed_Date)) : ''}</div>
          <div class="kv block"><span>Defect</span><b>${esc(n.Defect) || '–'}</b></div>
          <div class="kv block"><span>Buyer Remark (from Excel)${n.Buyer_Remark_Date ? ' · updated ' + L.fmtDate(n.Buyer_Remark_Date) : ''}</span><b>${n.Buyer_Remark ? esc(n.Buyer_Remark) : '<span class="bad">No buyer update yet</span>'}</b></div></section>
        <section class="card"><h2>Follow-up status</h2><div class="kvs">
          ${info('Status', n.Status)}${info('Follow-ups', i.count + ' · ' + L.followupLabel(i.count))}
          ${info('Last follow-up', n.Last_Followup ? L.fmtDate(n.Last_Followup) : '')}${info('Next check', n.Due_Date ? L.fmtDate(n.Due_Date) : '')}
          ${info('Waiting for', n.Waiting_For)}</div>
          ${n.Remark ? `<div class="kv block"><span>QA note</span><b>${esc(n.Remark)}</b></div>` : ''}
          <p class="hint">Everything else comes from the Excel file. Record a chase with Follow-up above; the next upload shows how the buyer answered.</p></section>
      </div>
      <section class="card"><div class="row-between"><h2>Follow-up History <span class="count">${S.historyFor(id).length}</span></h2>
        <button class="btn sm" data-action="note" data-id="${esc(id)}">+ Add entry</button></div>
        ${hist ? `<ul class="timeline">${hist}</ul>` : '<div class="empty">No history yet.</div>'}</section>
`,
    bind(root) {
    } };
  }

  // ---------- import ----------
  const imp = { wb: null, name: '', sheet: '', table: null, mapping: {}, opts: { closeMissing: false, date: '' }, done: null };
  function importPage() {
    const I = NCR.importer, IB = importsBlock(false);
    let body = '';
    if (imp.done) body += `<div class="alert ok">✅ Import complete: ${imp.done} <button class="btn sm" id="undo-now" type="button">Wrong file? Undo this import</button></div>`;
    if (imp.table) {
      const { records, bad } = I.buildRecords(imp.table, imp.mapping, st.settings.jiraKeywords);
      const p = I.plan(records, st.ncrs);
      const missingReq = I.FIELDS.filter((f) => f.required && !imp.mapping[f.key]);
      const mapRows = I.FIELDS.map((f) => `<label>${f.label}${f.required ? ' *' : ''}<select data-map="${f.key}">${options(imp.table.headers, imp.mapping[f.key], '— not in file —')}</select></label>`).join('');
      const fd = imp.opts.date || L.todayISO(), logs = S.getImports(), lastFD = logs.map((x) => x.fileDate || String(x.at).slice(0, 10)).sort().pop();
      const fdWarn = logs.some((x) => (x.fileDate || String(x.at).slice(0, 10)) === fd) ? 'A file with this date was already uploaded. Is this the same export again?' : lastFD && fd < lastFD ? `This date is earlier than your latest upload (${L.fmtDate(lastFD)}). Make sure this is the right file.` : '';
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
          <div class="alert ${fdWarn ? 'warn' : 'ok'}"><label class="inline">📅 <b>File date</b> <input type="date" id="imp-date" value="${esc(fd)}" ></label>
            <span class="hint"> The date this export was taken (any date, also a future one when you simulate weekly uploads). Every timeline entry from this import (buyer updates, closed date) gets this date. Default is today; change it if you are uploading late.</span>${fdWarn ? `<div>⚠️ ${fdWarn}</div>` : ''}</div>
          ${p.added.length ? `<h3>New</h3><div class="table-wrap"><table class="grid compact"><thead><tr><th>NCR</th><th>Item</th><th>Batch</th><th>Date</th><th>Buyer</th><th>Defect</th></tr></thead><tbody>${sample(p.added, (r) => `<tr><td>${esc(r.NCR_No)}</td><td>${esc(r.Item_No)}</td><td>${esc(r.Batch_No)}</td><td>${L.fmtDate(r.NCR_Date)}</td><td>${esc(r.Buyer)}</td><td>${esc(r.Defect)}</td></tr>`)}</tbody></table></div>${p.added.length > 8 ? `<div class="muted small">…and ${p.added.length - 8} more</div>` : ''}` : ''}
          ${p.updated.length ? `<h3>Updated</h3>${sample(p.updated, (u) => `<div class="small"><b>${esc(u.rec.NCR_No)}</b>: ${u.changes.map((c) => `${esc(c.field.replace('_', ' '))} "${esc(c.from)}" → "${esc(c.to)}"`).join('; ')}</div>`)}${p.updated.length > 8 ? `<div class="muted small">…and ${p.updated.length - 8} more</div>` : ''}` : ''}
          ${Object.keys(reasons).length ? `<div class="alert ok"><b>Closed by this file</b> (they move to the Closed page, nothing to close by hand): ${Object.entries(reasons).map(([k, v]) => `${v} × ${esc(k)}`).join(' · ')}. The closed date is today, because the file has no close date.</div>` : ''}
          ${p.missing.length ? `${p.missing.length > 0.5 * st.ncrs.filter((n) => n.Status !== 'Closed').length ? '<div class="alert warn">⚠️ More than half of the open NCRs are missing from this file — is it a partial / filtered export? Leave the box below unticked if so.</div>' : ''}<label class="check block"><input type="checkbox" id="imp-missing"${imp.opts.closeMissing ? ' checked' : ''}> ${p.missing.length} open NCR(s) are not in this file. Close them too (only if the export lists every NCR): ${esc(p.missing.slice(0, 6).map((n) => n.NCR_No).join(', '))}${p.missing.length > 6 ? '…' : ''}</label>` : ''}
          <div class="actions"><button class="btn primary" id="imp-go"${missingReq.length || (!p.added.length && !p.updated.length && !p.closeNow.length && !(imp.opts.closeMissing && p.missing.length)) ? ' disabled' : ''}>Import into NCR Master</button>
          <button class="btn" id="imp-cancel">Cancel</button></div></section>`;
    }
    return { html: `<div class="page-head"><h1>Import from Excel</h1><a class="btn" href="#/imports">📅 Import history (${S.getImports().length})</a></div>
      <section class="card"><h2>1. Upload raw data</h2><p class="hint">Upload the periodic NCR export (.xlsx, .xls or .csv). New NCRs are added; existing ones (matched by NCR No.) keep all QA follow-up data.</p>
        <label class="drop" id="drop"><input type="file" id="imp-file" accept=".xlsx,.xls,.xlsm,.csv" hidden><span>📁 Click or drop an Excel file here</span></label></section>${body}
      <div class="hist-sep">${IB.html}</div>`,
    bind(root) {
      const I2 = NCR.importer; IB.bind(root);
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
      const dt = root.querySelector('#imp-date'); if (dt) dt.addEventListener('change', () => { imp.opts.date = dt.value; NCR.app.render(); });
      const miss = root.querySelector('#imp-missing'); if (miss) miss.addEventListener('change', () => { imp.opts.closeMissing = miss.checked; NCR.app.render(); });
      const un = root.querySelector('#undo-now');
      if (un) un.addEventListener('click', () => NCR.app.confirmModal({ title: 'Undo this import?', text: 'This removes the NCRs it added and restores the ones it changed.', ok: 'Undo import', onOk: () => { S.undoImport(); imp.done = null; NCR.app.toast('Import undone'); NCR.app.render(); } }));
      const cancel = root.querySelector('#imp-cancel'); if (cancel) cancel.addEventListener('click', () => { imp.table = null; imp.wb = null; NCR.app.render(); });
      const go = root.querySelector('#imp-go');
      if (go) go.addEventListener('click', () => {
        const { records } = I2.buildRecords(imp.table, imp.mapping, st.settings.jiraKeywords);
        const p = I2.plan(records, st.ncrs), r = I2.apply(p, Object.assign({}, imp.opts, { date: imp.opts.date || L.todayISO() }));
        const nClosed = p.added.filter((x) => x.CloseReason).length + p.closeNow.length + (imp.opts.closeMissing ? p.missing.length : 0);
        S.applyImport(r, { file: imp.name, fileDate: imp.opts.date || L.todayISO(), added: p.added.length, updated: p.updated.length, remarkChanged: p.updated.filter((u) => u.changes.some((c) => c.field === 'Buyer_Remark')).length, closed: nClosed, total: records.length, changes: (() => {
          const out = [], cut = (t) => String(t || '').slice(0, 220), B = (x) => x || NO_BUYER;
          p.added.forEach((r) => out.push({ t: r.CloseReason ? 'closed' : 'new', no: r.NCR_No, buyer: B(r.Buyer), to: cut(r.Buyer_Remark), why: r.CloseReason }));
          p.updated.forEach((u) => u.changes.forEach((c) => {
            if (c.field === 'Buyer_Remark') out.push({ t: c.to ? 'update' : 'cleared', no: u.old.NCR_No, buyer: B(u.old.Buyer), from: cut(c.from), to: cut(c.to) });
            else if (c.field === 'Buyer') out.push({ t: 'buyer', no: u.old.NCR_No, buyer: B(c.to), from: B(c.from), to: B(c.to) });
          }));
          p.closeNow.forEach((c) => out.push({ t: 'closed', no: c.old.NCR_No, buyer: B(c.old.Buyer), why: c.reason }));
          return out.slice(0, 600);
        })(), byBuyer: (() => {
          const m = {}, b = (n) => (m[n || NO_BUYER] = m[n || NO_BUYER] || { added: 0, updated: 0, closed: 0 });
          p.added.forEach((r) => { b(r.Buyer).added++; if (r.CloseReason) b(r.Buyer).closed++; });
          p.updated.forEach((u) => { if (u.changes.some((c) => c.field === 'Buyer_Remark')) b(u.old.Buyer).updated++; });
          p.closeNow.forEach((c) => { b(c.old.Buyer).closed++; });
          return m;
        })() });
        imp.opts.date = '';
        const back = p.updated.filter((u) => u.changes.some((c) => c.field === 'Buyer_Remark' && c.to) && isFollowed(S.getNcr(u.old.NCR_ID))).length; // followed-up NCRs with a new buyer remark
        S.saveSettings({ importMapping: Object.assign({}, imp.mapping) });
        imp.done = `${back ? `${back} followed-up NCR${back === 1 ? ' has' : 's have'} a new buyer remark: see <a href="#/followed" data-wfilter='{}'>Followed up</a>. ` : ''}${p.added.length} added${p.added.length ? ' (' + Object.entries(p.added.reduce((m, r) => { const b = r.Buyer || '(No buyer)'; m[b] = (m[b] || 0) + 1; return m; }, {})).map(([b, c]) => b + ' ' + c).join(', ') + ')' : ''}, ${p.updated.length} updated, ${p.added.filter((r) => r.CloseReason).length + p.closeNow.length + (imp.opts.closeMissing ? p.missing.length : 0)} closed (see <a href="#/closed" data-closed="">Closed</a>). <a class="btn sm primary" href="#/changes">🔔 See what changed</a>`;
        imp.table = null; imp.wb = null; NCR.app.render();
      });
    } };
  }

  // ---------- Buyer response: how often each buyer answers a follow-up ----------
  const WEEKS_SHOWN = 12;
  const mondayOf = (iso) => L.addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));
  function responsePage() {
    const today = L.todayISO(), thisWk = mondayOf(today), IS_UPD = /^Buyer update|^Buyer cleared/;
    const buyerByNcr = {}; st.ncrs.forEach((n) => { buyerByNcr[n.NCR_ID] = buyerOf(n); });
    const logs = S.getImports().map((x) => x.fileDate || String(x.at).slice(0, 10));
    const uploadWeeks = new Set(logs.map(mondayOf));
    const upd = {}, fu = {};   // per NCR: dates of buyer updates / QA follow-ups
    st.history.forEach((h) => {
      const d = String(h.Date).slice(0, 10);
      if (IS_UPD.test(h.Action)) (upd[h.NCR_ID] = upd[h.NCR_ID] || []).push(d);
      else if (h.Followup_No) (fu[h.NCR_ID] = fu[h.NCR_ID] || []).push(d);
    });
    const all = [...Object.values(upd).flat(), ...Object.values(fu).flat(), ...logs].sort();
    if (!all.length) return { html: `<div class="page-head"><h1>Buyer response</h1></div><div class="empty">Nothing to show yet. After a few weekly uploads you will see how each buyer answers. <a href="#/import">Import a file</a>.</div>` };
    const firstWk = mondayOf(all[0]), startWk = firstWk > L.addDays(thisWk, -7 * (WEEKS_SHOWN - 1)) ? firstWk : L.addDays(thisWk, -7 * (WEEKS_SHOWN - 1));
    const weeks = []; for (let w = startWk; w <= thisWk; w = L.addDays(w, 7)) weeks.push(w);
    const per = {}, row = (b) => (per[b] = per[b] || { name: b, wk: {}, updates: 0, fus: 0, answered: 0, daysSum: 0, noReply: 0, open: 0, closedMonth: 0 });
    st.ncrs.forEach((n) => {
      const r = row(buyerOf(n)), i = inf(n);
      if (['todo', 'followed'].includes(i.bucket)) r.open++;
      if (i.bucket === 'closed' && String(n.Closed_Date || '').slice(0, 7) === today.slice(0, 7)) r.closedMonth++;
      if (i.bucket === 'followed' && noReplyAfter(n)) r.noReply++;
    });
    Object.entries(upd).forEach(([id, ds]) => { const b = buyerByNcr[id]; if (!b) return; const r = row(b); ds.forEach((d) => { r.updates++; const w = mondayOf(d); r.wk[w] = (r.wk[w] || 0) + 1; }); });
    Object.entries(fu).forEach(([id, ds]) => {
      const b = buyerByNcr[id]; if (!b) return; const r = row(b), us = (upd[id] || []).slice().sort();
      ds.forEach((d) => { r.fus++; const hit = us.find((u) => u >= d && L.daysBetween(d, u) <= 7); if (hit) { r.answered++; r.daysSum += L.daysBetween(d, hit); } });
    });
    const rows = Object.values(per).filter((r) => r.updates || r.fus || r.open).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
    const maxCell = Math.max(1, ...rows.flatMap((r) => weeks.map((w) => r.wk[w] || 0)));
    const wkLabel = (w) => { const p = L.fmtDate(w).split('-'); return p[0] + ' ' + p[1]; };
    const heat = `<div class="table-wrap"><table class="grid heat"><thead><tr><th>Buyer</th>${weeks.map((w) => `<th class="hw${uploadWeeks.has(w) ? '' : ' nofile'}" title="Week of ${L.fmtDate(w)}${uploadWeeks.has(w) ? '' : ' (no file uploaded)'}">${wkLabel(w)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td class="nowrap"><b>${esc(r.name)}</b></td>${weeks.map((w) => { const v = r.wk[w] || 0, up = uploadWeeks.has(w); return `<td class="hc${up ? '' : ' nofile'}${v ? ' hit' : ''}" style="${v ? `--heat:${(0.18 + 0.82 * v / maxCell).toFixed(2)}` : ''}" title="${esc(r.name)} · week of ${L.fmtDate(w)}: ${v} remark update${v === 1 ? '' : 's'}${up ? '' : ' (no file uploaded that week)'}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    const firstUp = logs.slice().sort()[0] ? mondayOf(logs.slice().sort()[0]) : '', upWeeks = weeks.filter((w) => uploadWeeks.has(w) && w > firstUp); // the first upload is the baseline: nothing can change yet
    const tbody = rows.map((r) => { const act = upWeeks.filter((w) => r.wk[w]).length; return `<tr><td><b>${esc(r.name)}</b></td><td>${r.open}</td><td>${r.fus}</td><td>${r.updates}</td>
      <td>${upWeeks.length ? `<span class="rate ${act / upWeeks.length >= 0.6 ? 'good' : act / upWeeks.length >= 0.3 ? 'mid' : 'low'}">${act} / ${upWeeks.length}</span>` : '<span class="muted">–</span>'}</td><td>${r.closedMonth}</td></tr>`; }).join('');
    // Latest upload vs the one before: what to do this Monday
    const logSorted = S.getImports().filter((x) => x.byBuyer).sort((a, b) => String(a.at).localeCompare(String(b.at))), lastL = logSorted[logSorted.length - 1], prevL = logSorted[logSorted.length - 2];
    let weekly = '';
    if (lastL) {
      const names = [...new Set(Object.keys(lastL.byBuyer).concat(rows.map((r) => r.name)))].filter((nm) => rows.find((r) => r.name === nm) || lastL.byBuyer[nm]);
      const line = names.map((nm) => {
        const d = lastL.byBuyer[nm] || { added: 0, updated: 0, closed: 0 }, pd = prevL && prevL.byBuyer && prevL.byBuyer[nm], r = per[nm] || { open: 0 };
        const carried = Math.max(0, r.open - d.added + 0 - d.updated);
        const delta = pd ? d.updated - pd.updated : null;
        return { nm, d, carried, delta, open: r.open };
      }).sort((a, b) => b.d.added - a.d.added || b.carried - a.carried);
      weekly = `<section class="block"><h2>Latest upload: what changed</h2><p class="hint">File <b>${esc(lastL.file || '')}</b> (${L.fmtDate(lastL.fileDate || lastL.at)})${prevL ? ` compared with the one before (${L.fmtDate(prevL.fileDate || prevL.at)})` : ''}. Your weekly check: new NCRs to chase, buyers who updated, and the older ones still waiting.</p>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Buyer</th><th title="New NCRs in this file">New to chase</th><th title="Existing NCRs whose Remarks changed">Buyer updated</th><th title="Updated count vs the previous upload">vs previous</th><th title="Still open and no change in this file">Carried over</th><th>Closed by file</th></tr></thead><tbody>${line.map((x) => `<tr><td><b>${esc(x.nm)}</b></td><td>${x.d.added ? `<b class="bad">${x.d.added}</b>` : '<span class="muted">0</span>'}</td><td>${x.d.updated}</td><td>${x.delta === null ? '<span class="muted">–</span>' : x.delta > 0 ? `<span class="rate good">+${x.delta}</span>` : x.delta < 0 ? `<span class="rate low">${x.delta}</span>` : '<span class="muted">0</span>'}</td><td>${x.carried}</td><td>${x.d.closed}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    const thin = uploadWeeks.size < 3;
    return { html: `<div class="page-head"><div><h1>Buyer response</h1><div class="muted">How often each buyer updates Remarks · <a href="#/imports">${logs.length} upload${logs.length === 1 ? '' : 's'}</a></div></div></div>
      ${weekly}
      ${thin ? '<div class="alert warn">Only a few weeks of data so far, so treat these numbers as a first look. They get reliable after several weekly uploads.</div>' : ''}
      <section class="block"><h2>Remark updates per week</h2><p class="hint">Each cell = how many NCRs of that buyer had their Remarks changed in the file dated that week. Darker = more updates. Empty = none. Hatched = no file was uploaded that week, so it is unknown rather than zero.</p>${heat}</section>
      <section class="block"><h2>Response by buyer</h2><p class="hint"><b>Weeks with an update</b> = in how many of the weekly uploads shown above the buyer changed at least one Remark. This fits a weekly routine better than "days to answer". Use it to decide whom to chase, not as a score.</p>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Buyer</th><th>Open</th><th title="Follow-ups recorded by QA">QA follow-ups</th><th title="Times the buyer changed the Remarks">Remark updates</th><th title="Weeks (with an upload) in which the buyer updated at least one Remark">Weeks with an update</th><th>Closed this month</th></tr></thead><tbody>${tbody}</tbody></table></div></section>` };
  }

  // ---------- How to use ----------
  function helpPage() {
    const row = (t, d) => `<tr><td class="nowrap"><b>${t}</b></td><td>${d}</td></tr>`;
    const step = (n, t, d) => `<li><span class="stepn">${n}</span><div><b>${t}</b><div class="muted">${d}</div></div></li>`;
    return { html: `<div class="page-head"><div><h1>How to use</h1><div class="muted">A 5-minute guide. Everything in this app comes from your weekly Excel file, so there is nothing to type in by hand.</div></div></div>
      <section class="block"><h2>Your weekly routine (any day you upload)</h2>
        <ol class="steps2">
          ${step(1, 'Upload this week’s Excel', '<a href="#/import">Import Excel</a> → choose the file → check the preview → Import. The app compares it with last week’s file.')}
          ${step(2, 'Read what changed', 'A 🔔 banner appears. <a href="#/changes">What changed</a> lists buyer updates, new NCRs and closed ones. <a href="#/response">Buyer response</a> (on Home) shows who updates every week.')}
          ${step(3, 'Chase the new ones', '<a href="#/list">To follow up</a>: start with <b>1 · No remark</b> (red). Tick the rows → <b>Follow-up</b> → copy the message to each buyer.')}
          ${step(4, 'Keep chasing the old ones', '<a href="#/followed">Followed up</a>: red and orange rows have no reply or keep going without finishing. Use <b>Export to Excel</b> to attach a list per buyer to your email.')}
          ${step(5, 'Nothing to close by hand', 'NCRs close themselves when the next file says Closed = Yes or the remark mentions Jira. You never close or edit an NCR here.')}
        </ol></section>
      <section class="block"><h2>What the words mean</h2><div class="table-wrap"><table class="grid">
        ${row('To follow up', 'NCRs you have not chased yet.')}
        ${row('Followed up', 'NCRs you chased (pressed Follow-up). They stay here until a later file closes them, and every buyer reply is added to their timeline.')}
        ${row('No remark', 'The buyer wrote nothing in the Remarks column of the file. QA has to chase.')}
        ${row('Has remark', 'The buyer wrote something. Read it, then chase if it is not finished.')}
        ${row('Hold for scrap', 'The remark says hold or scrap, so the NCR is waiting for scrap. It is kept out of the follow-up lists.')}
        ${row('Jira closed', 'The remark mentions Jira, so the NCR is closed at import. It is listed on the Hold &amp; Jira page, not on Closed.')}
        ${row('Rounds', 'Follow-ups you made plus remark changes by the buyer. Many rounds and still open means it keeps moving but never finishes.')}
        ${row('# (work order)', 'The number on each row is the order to work in: No remark first (oldest first), then the ones with the most rounds.')}
        ${row('Carried over', 'Open NCRs that did not change in the latest file. They are the old ones you keep chasing.')}
        ${row('File date', 'The day the Excel export was taken. Leave it as today unless you upload late.')}
      </table></div></section>
      <section class="block"><h2>What the colours mean</h2><div class="table-wrap"><table class="grid">
        <tr><td><span class="chip age-escalation">Red</span></td><td>Chase first: no remark, or followed up several times with no reply.</td></tr>
        <tr><td><span class="chip age-attention">Orange</span></td><td>Has a remark but keeps going for many rounds without finishing.</td></tr>
        <tr><td><span class="chip" style="background:var(--h3t)">Amber</span></td><td>Has a remark. Check progress.</td></tr>
        <tr><td><span class="chip new">Blue</span></td><td>New or updated in the latest upload (🆕 / 🔔).</td></tr>
      </table></div></section>` };
  }

  // ---------- What changed in an upload (notification) ----------
  const latestLog = () => S.getImports().filter((x) => x.changes).pop();
  function changeBanner() {
    const l = latestLog(); if (!l || S.getSeen() === l.at) return '';
    const n = (t) => l.changes.filter((c) => c.t === t).length;
    return `<div class="alert ok banner">🔔 <b>New upload: ${esc(l.file || 'file')}</b> — ${n('update')} buyer update${n('update') === 1 ? '' : 's'} · ${n('new')} new NCR${n('new') === 1 ? '' : 's'} · ${n('closed')} closed${n('cleared') ? ` · ${n('cleared')} remark cleared` : ''}. <a href="#/changes/${encodeURIComponent(l.at)}">See what changed</a> <button class="btn sm" data-action="dismiss-changes" type="button">Dismiss</button></div>`;
  }
  function changesPage(at) {
    const logs = S.getImports().filter((x) => x.changes), l = logs.find((x) => x.at === at) || logs[logs.length - 1];
    if (!l) return { html: '<div class="page-head"><h1>What changed</h1></div><div class="empty">No change details yet. They are recorded for each upload from now on. <a href="#/import">Import a file</a>.</div>' };
    if (l === logs[logs.length - 1]) { S.setSeen(l.at); NCR.app.status && NCR.app.status(); } // looking at an older upload does not count as seeing the newest
    const prev = logs[logs.indexOf(l) - 1], k = logs.indexOf(l);
    const nav = `<div class="chg-nav"><a class="btn sm${k > 0 ? '' : ' disabled'}" ${k > 0 ? `href="#/changes/${encodeURIComponent(logs[k - 1].at)}"` : ''}>‹ Older</a>
      <select id="chg-pick" aria-label="Choose an upload">${logs.slice().reverse().map((x) => `<option value="${esc(x.at)}"${x.at === l.at ? ' selected' : ''}>${L.fmtDate(x.fileDate || x.at)} · ${esc(x.file || 'file')}</option>`).join('')}</select>
      <a class="btn sm${k < logs.length - 1 ? '' : ' disabled'}" ${k < logs.length - 1 ? `href="#/changes/${encodeURIComponent(logs[k + 1].at)}"` : ''}>Newer ›</a></div>`;
    const link = (no) => { const n = st.ncrs.find((x) => x.NCR_No === no); return n ? `<a href="#/ncr/${esc(n.NCR_ID)}"><b>${esc(no)}</b></a>` : `<b>${esc(no)}</b>`; };
    const sec = (t, title, hint, cols, row) => {
      const items = l.changes.filter((c) => c.t === t); if (!items.length) return '';
      return `<section class="block"><h2>${title} <span class="count">${items.length}</span></h2><p class="hint">${hint}</p><div class="table-wrap"><table class="grid compact"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${items.sort((a, b) => a.buyer.localeCompare(b.buyer)).map((c) => `<tr>${row(c)}</tr>`).join('')}</tbody></table></div></section>`;
    };
    const rem = (x) => (x ? `<div class="rtext" title="${esc(x)}">${esc(x)}</div>` : '<span class="muted">(empty)</span>');
    const html = `<div class="page-head"><div><h1>What changed</h1>${nav}<div class="muted">${esc(l.file || 'file')} · file date ${L.fmtDate(l.fileDate || l.at)}${prev ? ` · compared with ${esc(prev.file || 'the previous file')} (${L.fmtDate(prev.fileDate || prev.at)})` : ''}</div></div></div>
      ${sec('update', '🔔 Buyer updated Remarks', 'Existing NCRs whose Remarks changed since the previous upload. Read them, then follow up if needed.', ['NCR', 'Buyer', 'Before', 'Now'], (c) => `<td class="nowrap">${link(c.no)}</td><td>${esc(c.buyer)}</td><td class="remark">${rem(c.from)}</td><td class="remark">${rem(c.to)}</td>`)}
      ${sec('new', '🆕 New NCRs to chase', 'These NCRs were not in the previous upload.', ['NCR', 'Buyer', 'Remark in file'], (c) => `<td class="nowrap">${link(c.no)}</td><td>${esc(c.buyer)}</td><td class="remark">${rem(c.to)}</td>`)}
      ${sec('cleared', '📭 Buyer cleared the Remarks', 'The Remarks were removed in this file. Worth asking why.', ['NCR', 'Buyer', 'Previous remark'], (c) => `<td class="nowrap">${link(c.no)}</td><td>${esc(c.buyer)}</td><td class="remark">${rem(c.from)}</td>`)}
      ${sec('buyer', '🔀 Buyer changed', 'The Buyer column differs from the previous upload.', ['NCR', 'From', 'To'], (c) => `<td class="nowrap">${link(c.no)}</td><td>${esc(c.from)}</td><td>${esc(c.to)}</td>`)}
      ${sec('closed', '✅ Closed by this file', 'Moved to Closed (Closed = Yes, or a Jira remark).', ['NCR', 'Buyer', 'Reason'], (c) => `<td class="nowrap">${link(c.no)}</td><td>${esc(c.buyer)}</td><td>${esc(c.why || '')}</td>`)}
      ${l.changes.length ? '' : '<div class="empty">Nothing changed in this upload.</div>'}${l.changes.length >= 600 ? '<p class="hint">Showing the first 600 changes.</p>' : ''}`;
    return { html, bind(root) { const pick = root.querySelector('#chg-pick'); if (pick) pick.addEventListener('change', () => { location.hash = '#/changes/' + encodeURIComponent(pick.value); }); } };
  }

  // ---------- import history: list + month calendar ----------
  const IM = { month: '' };
  const monthName = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shiftMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + d, 1)); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0'); };
  function importsBlock(standalone) {
    const logs = S.getImports().map((x) => Object.assign({}, x, { fd: x.fileDate || String(x.at).slice(0, 10) })).sort((a, b) => b.fd.localeCompare(a.fd) || String(b.at).localeCompare(String(a.at)));
    const today = L.todayISO(), byDay = {};
    logs.forEach((x) => { (byDay[x.fd] = byDay[x.fd] || []).push(x); });
    const ym = IM.month || (logs[0] ? logs[0].fd.slice(0, 7) : today.slice(0, 7));
    // calendar grid, Monday first
    const first = ym + '-01', lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7, days = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    let cells = '<div class="cal-h">Mon</div><div class="cal-h">Tue</div><div class="cal-h">Wed</div><div class="cal-h">Thu</div><div class="cal-h">Fri</div><div class="cal-h">Sat</div><div class="cal-h">Sun</div>' + '<div></div>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const iso = ym + '-' + String(d).padStart(2, '0'), hit = byDay[iso];
      cells += `<div class="cal-d${hit ? ' up' : ''}${iso === today ? ' today' : ''}"${hit ? ` title="${esc(hit.map((x) => x.file).join(', '))}"` : ''}>${d}${hit ? `<i>${hit.length > 1 ? hit.length + '×' : '●'}</i>` : ''}</div>`;
    }
    // weeks (Mon–Sun) with no upload, from the first upload until this week
    const monday = (iso) => L.addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));
    const weeksWith = new Set(logs.map((x) => monday(x.fd))), skipped = [];
    if (logs.length) for (let w = monday(logs[logs.length - 1].fd); w < monday(today); w = L.addDays(w, 7)) if (!weeksWith.has(w)) skipped.push(w);
    const wk = (w) => `${L.fmtDate(w)} – ${L.fmtDate(L.addDays(w, 6))}`;
    // weekly timeline: one block per week, filled = uploaded, hatched = no file that week
    const perWeek = {}; logs.forEach((x) => { const m = monday(x.fd); perWeek[m] = (perWeek[m] || 0) + 1; });
    let tl = '';
    if (logs.length) {
      const lastUp = monday(logs[0].fd), thisWk = lastUp > monday(today) ? lastUp : monday(today), firstWk = monday(logs[logs.length - 1].fd), capWk = L.addDays(thisWk, -7 * 15), startWk = firstWk > capWk ? firstWk : capWk;
      for (let w = startWk; w <= thisWk; w = L.addDays(w, 7)) {
        const c = perWeek[w] || 0, parts = L.fmtDate(w).split('-');
        tl += `<div class="wk ${c ? 'up' : 'gap'}${w === monday(today) ? ' now' : ''}" title="Week ${wk(w)}: ${c ? c + ' upload' + (c === 1 ? '' : 's') : 'no file'}"><span class="wd">${parts[0]} ${parts[1]}</span><i>${c ? '✓' : ''}</i><span class="wn">${c ? c + '×' : 'no file'}</span></div>`;
      }
    }
    const stackAts = new Set(S.getImportStack());
    const rows = logs.map((x) => `<tr><td class="nowrap"><b>${L.fmtDate(x.fd)}</b>${x.fd !== String(x.at).slice(0, 10) ? `<div class="sub">uploaded ${L.fmtDate(x.at)}</div>` : ''}</td><td>${esc(x.file || 'file')}</td><td>${x.added || 0}</td><td>${x.remarkChanged === undefined ? '–' : x.remarkChanged}</td><td>${x.closed || 0}</td><td>${x.total === undefined ? '–' : x.total}</td><td class="right">${x.changes ? `<a class="btn sm" href="#/changes/${encodeURIComponent(x.at)}">Changes</a> ` : ''}${stackAts.has(x.at) ? `<button class="btn sm danger" data-del="${esc(x.at)}" data-newer="${logs.filter((y) => String(y.at) > String(x.at) && stackAts.has(y.at)).length}">Delete</button>` : '<span class="sub" title="This upload was made before undo was saved for every upload. Use Settings → Clear all NCR data to start over.">no undo data</span>'}</td></tr>`).join('');
    return { html: `${standalone ? `<div class="page-head"><div><h1>Import history</h1><div class="muted">${logs.length} upload${logs.length === 1 ? '' : 's'} · <a href="#/import">Import a new file</a></div></div></div>` : `<div class="page-head"><div><h2 class="sect">Upload history</h2><div class="muted">${logs.length} upload${logs.length === 1 ? '' : 's'} so far. Each week should have one file.</div></div></div>`}
      ${logs.length ? `<section class="block"><h2>Weekly timeline</h2><div class="wkline">${tl}</div><p class="hint">One block per week (Mon–Sun), oldest on the left. ✓ = a file dated in that week was uploaded; hatched = no file that week; outlined = this week.</p>${skipped.length ? `<div class="skips">⚠️ No file for: ${skipped.slice(-12).reverse().map((w) => `<span class="chip age-attention">${wk(w)}</span>`).join(' ')}${skipped.length > 12 ? ` …and ${skipped.length - 12} older weeks` : ''}</div>` : ''}</section>
        <section class="block"><details><summary>📅 Month calendar</summary><div><div class="cal-nav"><button class="btn sm" data-im="${shiftMonth(ym, -1)}">‹</button><h2>${monthName(ym)}</h2><button class="btn sm" data-im="${shiftMonth(ym, 1)}">›</button></div>
          <div class="cal">${cells}</div><p class="hint">● = a file dated that day was imported. Hover for the file name.</p></div></details></section>
        <section class="block"><h2>All uploads</h2><div class="table-wrap"><table class="grid compact"><thead><tr><th>File date</th><th>File</th><th>New NCRs</th><th>Remark changed</th><th>Closed</th><th>Rows in file</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="hint">Stored in this browser. “Remark changed” counts existing NCRs whose buyer remark differs from the previous upload.</p></section>`
      : '<div class="empty">No uploads recorded yet. <a href="#/import">Import your first file</a>.</div>'}`,
    bind(root) {
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const newer = +b.dataset.newer;
        NCR.app.confirmModal({ title: newer ? `Delete this upload and ${newer} newer one${newer === 1 ? '' : 's'}?` : 'Delete this upload?', text: (newer ? 'Newer uploads were built on top of it, so they are removed too, newest first. ' : '') + 'NCRs they added are removed and changed NCRs are put back as they were. Follow-ups you recorded on those NCRs since then are lost.', ok: 'Delete', onOk: () => { S.undoImport(b.dataset.del); NCR.app.toast('Upload deleted'); NCR.app.render(); } });
      }));
      root.querySelectorAll('[data-im]').forEach((b) => b.addEventListener('click', () => { IM.month = b.dataset.im; NCR.app.render(); })); } };
  }
  const importsPage = () => importsBlock(true);

  // ---------- settings ----------
  function settings() {
    const s = st.settings, cfg = S.getApiConfig();
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
      <form id="cfg" class="card"><h2>Keywords &amp; follow-up timing</h2>
        <p class="hint">Keywords are matched in the buyer's Remarks, any letter case. One per line.</p>
        <div class="form cols3"><label>Hold for scrap: Remarks contain<textarea name="holdKeywords" rows="3">${esc((s.holdKeywords || []).join('\n'))}</textarea></label>
          <label>Close at import when Remarks contain<textarea name="jiraKeywords" rows="3">${esc((s.jiraKeywords || []).join('\n'))}</textarea></label></div>
        <div class="form cols3"><label>Default next check after a follow-up (days)<input type="number" min="1" name="defaultCheckDays" value="${s.defaultCheckDays}"></label>
          <label>Flag a buyer remark that has not changed for (days)<input type="number" min="1" name="buyerStaleDays" value="${s.buyerStaleDays}"></label></div>
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
        S.saveSettings({ holdKeywords: lines('holdKeywords'), jiraKeywords: lines('jiraKeywords'),
          buyerStaleDays: num('buyerStaleDays', 7), defaultCheckDays: num('defaultCheckDays', 7) });
        NCR.app.toast('Settings saved');
      });
    } };
  }

  NCR.views = { esc, options, withCurrent, home, closedPage, list, followedPage, exportRows, setWaitFilter, holdPage, setHJ, currentIds, CF, detail, importPage, importsPage, helpPage, changesPage, changeBanner, responsePage, settings, setFilter, inf, SEL, showAll, sectionIds, HOME_OPEN, WF_OPEN, isFollowed, buyerOf, open, NO_BUYER };
})(window.NCR);
