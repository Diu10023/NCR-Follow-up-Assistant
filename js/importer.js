// Excel / CSV raw-data import: header detection, column mapping, date parsing, merge plan.
window.NCR = window.NCR || {};
(function (NCR) {
  const L = NCR.logic;

  const FIELDS = [
    { key: 'NCR_No', label: 'NCR No.', required: true, aliases: ['ncrno', 'ncrnumber', 'ncrnum', 'ncr', 'ncrid', 'reportno', 'เลขที่ncr'] },
    { key: 'Item_No', label: 'Item No.', required: true, aliases: ['itemno', 'item', 'itemnumber', 'itemcode', 'partno', 'partnumber', 'part', 'materialno', 'material'] },
    { key: 'Batch_No', label: 'Batch No.', required: true, aliases: ['batchno', 'batch', 'batchnumber', 'lotno', 'lot', 'lotnumber'] },
    { key: 'NCR_Date', label: 'NCR Date', required: true, aliases: ['ncrdate', 'date', 'issuedate', 'dateissued', 'reportdate', 'createddate', 'openeddate'] },
    { key: 'Buyer', label: 'Buyer', required: true, aliases: ['buyer', 'buyername', 'purchaser', 'purchasing'] },
    { key: 'Defect', label: 'Defect', required: true, aliases: ['defect', 'defectdescription', 'defectdetail', 'description', 'problem', 'issue', 'nonconformance', 'details', 'subnonconformancecategoryid', 'subnonconformancecategory', 'nonconformancecategory'] },
    { key: 'Quantity', label: 'Quantity', aliases: ['quantity', 'qty', 'ncrqty', 'defectqty', 'defectquantity'] },
    { key: 'Supplier', label: 'Supplier', aliases: ['supplier', 'suppliername', 'vendor', 'vendorname'] },
    { key: 'Disposition', label: 'Disposition (fills blanks only)', aliases: ['disposition'] },
    { key: 'Buyer_Remark', label: 'Remarks (Buyer progress)', aliases: ['remarks', 'remark', 'note', 'notes', 'comment', 'comments'] },
    { key: 'Closed', label: 'Closed (Yes/No or date)', aliases: ['closed', 'isclosed', 'closeddate', 'status'] },
  ];
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9฀-๿]/g, '');

  function readWorkbook(buf) { return XLSX.read(buf, { type: 'array' }); }

  // Returns {headers, rows, headerRow} where rows are arrays aligned with headers.
  function sheetTable(wb, sheetName) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false });
    let best = 0, bestScore = -1;
    aoa.slice(0, 15).forEach((row, i) => {
      const score = row.reduce((s, c) => s + (FIELDS.some((f) => f.aliases.includes(norm(c))) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    const headers = (aoa[best] || []).map((h, i) => (String(h).trim() || 'Column ' + (i + 1)));
    return { headers, rows: aoa.slice(best + 1), headerRow: best + 1 };
  }

  // mapping: {field: headerName}. Saved mapping wins when the header still exists.
  function autoMap(headers, saved) {
    const map = {}, used = new Set();
    FIELDS.forEach((f) => { const h = saved && saved[f.key]; if (h && headers.includes(h) && !used.has(h)) { map[f.key] = h; used.add(h); } });
    FIELDS.forEach((f) => {
      if (map[f.key]) return;
      const h = headers.find((x) => !used.has(x) && f.aliases.includes(norm(x)));
      if (h) { map[f.key] = h; used.add(h); }
    });
    FIELDS.forEach((f) => {
      if (map[f.key]) return;
      const h = headers.find((x) => !used.has(x) && f.aliases.some((a) => a.length > 3 && norm(x).includes(a)));
      if (h) { map[f.key] = h; used.add(h); }
    });
    return map;
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function iso(y, m, d) {
    if (y < 100) y += 2000;
    if (y > 2400) y -= 543; // Buddhist year
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function parseDate(v) {
    if (v === '' || v == null) return '';
    if (v instanceof Date) return L.toISO(v);
    if (typeof v === 'number') {
      if (v < 20000 || v > 90000) return '';
      const t = new Date(Math.round((v - 25569) * 86400000));
      return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/))) return iso(+m[3], +m[2], +m[1]); // day first
    if ((m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/))) return MONTHS[m[2].toLowerCase()] ? iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : '';
    if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(parseFloat(s));
    return '';
  }

  function isClosedValue(v) {
    if (v === true) return true;
    if (v === '' || v == null || v === false) return false;
    if (typeof v === 'number') return v === 1 || (v > 20000 && v < 90000);
    const t = String(v).trim().toLowerCase();
    if (['', 'no', 'n', 'false', '0', 'open', 'x?'].includes(t)) return false;
    return true; // yes / true / closed / a date
  }

  // Excel may re-save line breaks (\r\n vs \n); that alone is not a buyer update
  const normText = (v) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();

  // closeKeywords: a remark containing any of them (any letter case) closes the NCR on import, like Closed = Yes
  function buildRecords(table, mapping, closeKeywords) {
    const kw = (closeKeywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    const col = {}; FIELDS.forEach((f) => { col[f.key] = mapping[f.key] ? table.headers.indexOf(mapping[f.key]) : -1; });
    const out = [], bad = [];
    table.rows.forEach((r, i) => {
      const get = (k) => (col[k] >= 0 ? r[col[k]] : '');
      const no = String(get('NCR_No')).trim();
      if (!no) { if (r.some((c) => String(c).trim())) bad.push({ row: table.headerRow + 1 + i, reason: 'No NCR No.' }); return; }
      const rec = { NCR_No: no };
      ['Item_No', 'Batch_No', 'Supplier', 'Buyer', 'Defect', 'Quantity', 'Disposition'].forEach((k) => { rec[k] = String(get(k)).trim(); });
      rec.Buyer_Remark = normText(get('Buyer_Remark'));
      const yes = isClosedValue(get('Closed')), jira = kw.some((k) => rec.Buyer_Remark.toLowerCase().includes(k));
      rec.CloseReason = yes ? 'Closed = Yes in Excel' : jira ? 'Remarks mention Jira' : '';
      rec.RemarkMapped = col.Buyer_Remark >= 0;
      rec.NCR_Date = parseDate(get('NCR_Date'));
      if (get('NCR_Date') !== '' && !rec.NCR_Date) bad.push({ row: table.headerRow + 1 + i, reason: 'Unreadable date "' + get('NCR_Date') + '" (NCR ' + no + ')' });
      out.push(rec);
    });
    return { records: out, bad };
  }

  const UPDATABLE = ['Item_No', 'Batch_No', 'Supplier', 'Buyer', 'NCR_Date', 'Defect', 'Quantity'];

  // Compare against existing NCRs (key = NCR No., case-insensitive). Follow-up fields are never touched.
  function plan(records, existing) {
    const byNo = new Map(existing.map((n) => [String(n.NCR_No).trim().toLowerCase(), n]));
    const seen = new Set(), added = [], updated = [], unchanged = [], closeNow = [];
    records.forEach((r) => {
      const key = r.NCR_No.toLowerCase();
      if (seen.has(key)) return; seen.add(key);
      const old = byNo.get(key);
      if (!old) { added.push(r); return; }
      if (r.CloseReason && old.Status !== 'Closed') closeNow.push({ old, reason: r.CloseReason }); // closed by the file, no manual step
      const changes = [];
      UPDATABLE.forEach((f) => { if (r[f] && String(r[f]) !== String(old[f] || '')) changes.push({ field: f, from: old[f] || '', to: r[f] }); });
      // Remarks mirror the file: a change (including the buyer clearing it) is recorded, never silently lost.
      if (r.RemarkMapped && (r.Buyer_Remark || '') !== normText(old.Buyer_Remark)) changes.push({ field: 'Buyer_Remark', from: old.Buyer_Remark || '', to: r.Buyer_Remark || '' });
      ['Disposition'].forEach((f) => { if (r[f] && !old[f]) changes.push({ field: f, from: '', to: r[f] }); });
      if (changes.length) updated.push({ rec: r, old, changes }); else unchanged.push(old);
    });
    const missing = existing.filter((n) => n.Status !== 'Closed' && !seen.has(String(n.NCR_No).trim().toLowerCase()));
    return { added, updated, unchanged, missing, closeNow };
  }

  // Returns {ncrs, history} ready for store.saveMany.
  function apply(p, opts) {
    const ncrs = [], history = [];
    // The file date (default: today) dates every timeline entry this import creates, so a late upload still lands on the right day.
    const now = L.nowStamp(), today = (opts && opts.date) || L.todayISO();
    const stampFor = (old) => { // when the buyer's remark changed; never earlier than the QA's last review, or the "Buyer updated" flag would be missed
      const t = today + now.slice(10);
      return old && old.Last_Review && t <= old.Last_Review ? now : t;
    };
    const H = (n, action, remark, by) => history.push({ History_ID: L.uid('H'), NCR_ID: n.NCR_ID, NCR_No: n.NCR_No, Date: today, Followup_No: '', Action: action, Waiting_For: '', Remark: remark || '', Created_By: by || 'Import', Created_At: now });
    p.added.forEach((r) => {
      const n = {}; NCR.store.NCR_FIELDS.forEach((f) => { n[f] = ''; });
      Object.assign(n, r, { Owner: r.Buyer, NCR_ID: L.uid('NCR'), Status: 'Not Started', Followup_Count: 0, Created_At: now, Updated_At: now });
      if (r.CloseReason) { n.Status = 'Closed'; n.Closed_Date = today; n.Next_Action = ''; }
      n.Aging = L.daysBetween(n.NCR_Date, n.Closed_Date || L.todayISO());
      delete n.RemarkMapped; delete n.CloseReason; ncrs.push(n); H(n, r.CloseReason ? 'Imported as Closed (' + r.CloseReason + ')' : 'NCR imported from Excel');
      if (n.Buyer_Remark && !r.CloseReason) H(n, 'Buyer Remarks at import: ' + n.Buyer_Remark, '', 'Buyer (Excel)');
    });
    p.updated.forEach(({ rec, old, changes }) => {
      const n = Object.assign({}, old);
      changes.forEach((c) => { n[c.field] = c.to; });
      n.Aging = L.daysBetween(n.NCR_Date, n.Status === 'Closed' ? n.Closed_Date || L.todayISO() : L.todayISO());
      n.Updated_At = now;
      const br = changes.find((c) => c.field === 'Buyer_Remark'), others = changes.filter((c) => c.field !== 'Buyer_Remark');
      if (br) {
        n.Buyer_Remark_Date = stampFor(old);
        H(n, br.to ? 'Buyer update (Remarks): ' + br.to : 'Buyer cleared Remarks', br.from ? 'Previous: ' + br.from : '', 'Buyer (Excel)');
      }
      if (others.length) H(n, 'Updated from Excel: ' + others.map((c) => c.field.replace('_', ' ')).join(', '));
      ncrs.push(n);
    });
    // Closing happens only from the uploaded file: Closed = Yes, or a remark with a close keyword (e.g. Jira).
    const close = (o, why) => {
      const cur = ncrs.find((x) => x.NCR_ID === o.NCR_ID), n = Object.assign({}, cur || o);
      if (n.Status === 'Closed') return;
      n.Status = 'Closed'; n.Closed_Date = today; n.Updated_At = now;
      n.Aging = L.daysBetween(n.NCR_Date, L.todayISO());
      if (cur) ncrs[ncrs.indexOf(cur)] = n; else ncrs.push(n);
      H(n, 'Closed from Excel: ' + why);
    };
    p.closeNow.forEach(({ old, reason }) => close(old, reason));
    if (opts && opts.closeMissing) p.missing.forEach((o) => close(o, 'not in the latest Excel file'));
    return { ncrs, history };
  }

  NCR.importer = { FIELDS, readWorkbook, sheetTable, autoMap, parseDate, buildRecords, plan, apply };
})(window.NCR);
