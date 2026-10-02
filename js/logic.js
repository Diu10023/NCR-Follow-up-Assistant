// Pure business logic: statuses, due/overdue, aging, escalation, messages.
window.NCR = window.NCR || {};
(function (NCR) {
  const STATUSES = ['Not Started', 'Open', 'Pending', 'Ready to Close', 'Closed'];
  // Statuses QA can pick by hand. Ready to Close is gone: closing comes only from the uploaded file.
  const PICKABLE = STATUSES.filter((x) => x !== 'Ready to Close');

  const DEFAULT_SETTINGS = {
    dispositions: ['Scrap', 'Rework', 'Return to Supplier', 'Sorting', 'Cleaning', 'Use As Is', 'Replacement', 'Other'],
    nextActions: ['Confirm Disposition', 'Supplier Response', 'Supplier Corrective Action', 'Supplier Replacement',
      'Return Supplier', 'Scrap', 'Rework', 'Sorting', 'Cleaning', 'Waiting Approval', 'Waiting Customer Decision',
      'Waiting QA Verification', 'Collect Evidence', 'Close NCR', 'Other'],
    waitingFor: ['Purchasing', 'Supplier', 'QA', 'Customer', 'Production', 'Management Approval', 'Other'],
    owners: [],
    dueSoonDays: 2,
    escalationThreshold: 3,
    buyerStaleDays: 7,
    defaultCheckDays: 7,
    holdKeywords: ['hold', 'scrap'], // Remarks containing these (any letter case) = waiting for scrap: own tab, kept out of To follow up / Followed up
    jiraKeywords: ['jira'], // Remarks containing these (any letter case) = "Jira: unable to approve - Closed": closed at import, own tab
    agingBands: [
      { max: 7, label: 'Normal', cls: 'age-normal' },
      { max: 14, label: 'Follow-up', cls: 'age-followup' },
      { max: 30, label: 'Attention', cls: 'age-attention' },
      { max: null, label: 'Escalation', cls: 'age-escalation' },
    ],
    importMapping: {},
  };

  const pad = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function nowStamp() { const d = new Date(); return toISO(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function dayNum(iso) {
    if (!iso) return null;
    const p = String(iso).slice(0, 10).split('-').map(Number);
    if (p.length < 3 || p.some(isNaN)) return null;
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }
  function daysBetween(fromISO, toISO_) {
    const a = dayNum(fromISO), b = dayNum(toISO_);
    return a === null || b === null ? null : b - a;
  }
  function addDays(iso, n) {
    const t = new Date((dayNum(iso) + n) * 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function fmtDate(iso) {
    if (!iso) return '–';
    const p = String(iso).slice(0, 10).split('-').map(Number);
    if (p.length < 3 || p.some(isNaN)) return String(iso);
    return pad(p[2]) + '-' + MON[p[1] - 1] + '-' + p[0];
  }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  // Derive everything the UI needs from one NCR row.
  function info(n, settings, today) {
    today = today || todayISO();
    const s = settings || DEFAULT_SETTINGS;
    const closed = n.Status === 'Closed';
    const aging = daysBetween(n.NCR_Date, closed ? (n.Closed_Date || today) : today);
    const dueDiff = n.Due_Date ? daysBetween(today, n.Due_Date) : null;
    const ready = n.Status === 'Ready to Close';
    const overdue = !closed && dueDiff !== null && dueDiff < 0;
    const dueToday = !closed && dueDiff === 0;
    const dueSoon = !closed && dueDiff !== null && dueDiff >= 1 && dueDiff <= s.dueSoonDays;
    const missingNext = !closed && !ready && !n.Next_Action;
    const noUpdate = !closed && !String(n.Buyer_Remark || '').trim(); // buyer has not written progress in Remarks
    const staleDays = !closed && !noUpdate && n.Buyer_Remark_Date ? daysBetween(n.Buyer_Remark_Date, today) : null;
    const stale = staleDays !== null && staleDays >= s.buyerStaleDays;
    const count = Number(n.Followup_Count) || 0;
    const escalate = !closed && count >= s.escalationThreshold;
    const notStarted = !closed && n.Status === 'Not Started';
    // Buyer wrote/changed Remarks after QA last reviewed this NCR.
    const needsReview = !closed && !ready && !notStarted && !!n.Buyer_Remark && !!n.Buyer_Remark_Date && String(n.Buyer_Remark_Date) > String(n.Last_Review || '');
    const rem = String(n.Buyer_Remark || '').toLowerCase();
    const hasKw = (list) => (list || []).some((k) => k && rem.includes(String(k).toLowerCase()));
    const jiraRem = hasKw(s.jiraKeywords), holdRem = hasKw(s.holdKeywords);
    const remarkGroup = closed ? '' : !rem.trim() ? 'none' : jiraRem ? 'jira' : holdRem ? 'hold' : 'progress';
    // Which list the NCR lives in. Jira and Hold/scrap remarks are kept out of the normal follow-up flow.
    const bucket = jiraRem ? 'jira' : closed ? 'closed' : holdRem ? 'hold' : (Number(n.Followup_Count) || 0) > 0 ? 'followed' : 'todo';
    // followed up / reviewed since the buyer's last remark, and the next check date is still ahead: nothing to do yet
    const scheduled = !closed && dueDiff !== null && dueDiff > 0 && (!n.Buyer_Remark_Date || String(n.Last_Review || '') >= String(n.Buyer_Remark_Date));
    const triage = notStarted && !(scheduled && (Number(n.Followup_Count) || 0) > 0); // a followed-up NCR is no longer "new"
    const isNew = !closed && aging !== null && aging <= 7;
    const reasons = [];
    if (!closed) {
      if (overdue) reasons.push(`Overdue ${-dueDiff}d`); else if (dueToday) reasons.push('Due today');
      if (ready) reasons.push('Ready to close – verify');
      if (triage) reasons.push('New – triage');
      if (needsReview) reasons.push('Buyer updated – review');
    }
    const actionRequired = reasons.length > 0;
    let state = 'ontrack';
    if (closed) state = 'closed';
    else if (overdue) state = 'overdue';
    else if (ready) state = 'ready';
    else if (triage) state = 'new';
    else if (needsReview) state = 'review';
    else if (dueToday || dueSoon) state = 'soon';
    // primary section on the Today page (each NCR appears once)
    const section = closed ? null : overdue ? 'overdue' : dueToday ? 'today' : ready ? 'ready' : triage ? 'new' : needsReview ? 'review' : dueSoon ? 'soon' : null;
    const band = agingBand(aging, s);
    return { bucket, remarkGroup, notStarted, needsReview, isNew, reasons, section, closed, aging, dueDiff, ready, overdue, dueToday, dueSoon, missingNext, noUpdate, stale, staleDays, count, escalate, state, band, actionRequired };
  }

  const STATE_META = {
    overdue: { icon: '🔴', label: 'Overdue', cls: 'b-overdue' },
    new: { icon: '🆕', label: 'New – triage', cls: 'b-new' },
    review: { icon: '💬', label: 'Buyer updated', cls: 'b-review' },
    soon: { icon: '🟡', label: 'Due Soon', cls: 'b-soon' },
    ontrack: { icon: '🟢', label: 'Waiting / On Track', cls: 'b-ok' },
    ready: { icon: '🔵', label: 'Ready to Close', cls: 'b-ready' },
    closed: { icon: '⚫', label: 'Closed', cls: 'b-closed' },
  };

  function agingBand(days, s) {
    if (days === null) return null;
    for (const b of (s || DEFAULT_SETTINGS).agingBands) if (b.max === null || days <= b.max) return b;
    return null;
  }

  function followupLabel(count) {
    if (count <= 0) return 'No follow-up yet';
    if (count === 1) return 'First Follow-up';
    if (count === 2) return 'Second Follow-up';
    return 'Escalation Required';
  }

  function followupMessage(n, settings) {
    const count = (Number(n.Followup_Count) || 0) + 1;
    const lines = [];
    lines.push(`${n.NCR_No} / Item ${n.Item_No || '-'}` + (n.Batch_No ? ` / Batch ${n.Batch_No}` : ''));
    if (n.Defect) lines.push(`Defect: ${n.Defect}`);
    lines.push('');
    lines.push(`Current Action: ${n.Next_Action || n.Disposition || 'To be confirmed'}`);
    lines.push(`Due Date: ${n.Due_Date ? fmtDate(n.Due_Date) : 'Not set'}`);
    if (n.Waiting_For) lines.push(`Waiting For: ${n.Waiting_For}`);
    lines.push(`Follow-up #${count}`);
    if (n.Buyer_Remark) lines.push(`Latest Remarks: ${n.Buyer_Remark}` + (n.Buyer_Remark_Date ? ` (updated ${fmtDate(n.Buyer_Remark_Date)})` : ''));
    else lines.push('Remarks: no progress update recorded yet');
    lines.push('');
    lines.push('"Could you please confirm the current status and next action for this NCR?"');
    return lines.join('\n');
  }

  // One message per buyer listing every NCR QA wants an update on.
  function buyerMessage(buyer, list, today) {
    today = today || todayISO();
    const lines = [`Hi ${buyer || 'all'},`, '', 'Could you please update the status / Remarks for the NCRs below?', ''];
    list.forEach((n, i) => {
      const age = daysBetween(n.NCR_Date, today);
      lines.push(`${i + 1}. ${n.NCR_No} / Item ${n.Item_No || '-'}${n.Defect ? ' / ' + n.Defect : ''} – open ${age === null ? '?' : age}d` +
        (n.Buyer_Remark ? ` – last Remarks: ${String(n.Buyer_Remark).replace(/\s+/g, ' ').slice(0, 80)}` : ' – no Remarks yet'));
    });
    lines.push('', 'Thank you.');
    return lines.join('\n');
  }

  NCR.logic = { buyerMessage, STATUSES, PICKABLE, DEFAULT_SETTINGS, STATE_META, toISO, todayISO, nowStamp, dayNum, daysBetween, addDays, fmtDate, uid,
    info, agingBand, followupLabel, followupMessage };
})(window.NCR);
