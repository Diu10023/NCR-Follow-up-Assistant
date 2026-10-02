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
    { key: 'Defect', label: 'Defect', required: true, aliases: ['defect', 'defectdescription', 'defectdetail', 'description', 'problem', 'issue', 'nonconformance', 'details'] },
    { key: 'Quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'ncrqty', 'defectqty', 'defectquantity'] },
    { key: 'Supplier', label: 'Supplier', aliases: ['supplier', 'suppliername', 'vendor', 'vendorname'] },
    { key: 'Disposition', label: 'Disposition (fills blanks only)', aliases: ['disposition'] },
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

  function buildRecords(table, mapping) {
    const col = {}; FIELDS.forEach((f) => { col[f.key] = mapping[f.key] ? table.headers.indexOf(mapping[f.key]) : -1; });
    const out = [], bad = [];
    table.rows.forEach((r, i) => {
      const get = (k) => (col[k] >= 0 ? r[col[k]] : '');
      const no = String(get('NCR_No')).trim();
      if (!no) { if (r.some((c) => String(c).trim())) bad.push({ row: table.headerRow + 1 + i, reason: 'No NCR No.' }); return; }
      const rec = { NCR_No: no };
      ['Item_No', 'Batch_No', 'Supplier', 'Buyer', 'Defect', 'Quantity', 'Disposition'].forEach((k) => { rec[k] = String(get(k)).trim(); });
      rec.NCR_Date = parseDate(get('NCR_Date'));
      if (get('NCR_Date') !== '' && !rec.NCR_Date) bad.push({ row: table.headerRow + 1 + i, reason: 'Unreadable date "' + get('NCR_Date') + '" (NCR ' + no + ')' });
      out.push(rec);
    });
    return { records: out, bad };
  }

  const UPDATABLE = ['Item_No', 'Batch_No', 'Supplier', 'Buyer', 'NCR_Date', 'Defect', 'Quantity'];

  // Compare against existing NCRs (key = NCR No., case-insensitive). Follow-up fields are never touched.
  function plan(records, existing, opts) {
    const byNo = new Map(existing.map((n) => [String(n.NCR_No).trim().toLowerCase(), n]));
    const seen = new Set(), added = [], updated = [], unchanged = [];
    records.forEach((r) => {
      const key = r.NCR_No.toLowerCase();
      if (seen.has(key)) return; seen.add(key);
      const old = byNo.get(key);
      if (!old) { added.push(r); return; }
      const changes = [];
      UPDATABLE.forEach((f) => { if (r[f] && String(r[f]) !== String(old[f] || '')) changes.push({ field: f, from: old[f] || '', to: r[f] }); });
      if (r.Disposition && !old.Disposition) changes.push({ field: 'Disposition', from: '', to: r.Disposition });
      if (changes.length) updated.push({ rec: r, old, changes }); else unchanged.push(old);
    });
    const missing = existing.filter((n) => n.Status !== 'Closed' && !seen.has(String(n.NCR_No).trim().toLowerCase()));
    return { added, updated, unchanged, missing };
  }

  // Returns {ncrs, history} ready for store.saveMany.
  function apply(p, opts) {
    const ncrs = [], history = [];
    const now = L.nowStamp(), today = L.todayISO();
    const H = (n, action) => history.push({ History_ID: L.uid('H'), NCR_ID: n.NCR_ID, NCR_No: n.NCR_No, Date: today, Followup_No: '', Action: action, Waiting_For: '', Remark: '', Created_By: 'Import', Created_At: now });
    p.added.forEach((r) => {
      const n = {}; NCR.store.NCR_FIELDS.forEach((f) => { n[f] = ''; });
      Object.assign(n, r, { NCR_ID: L.uid('NCR'), Status: 'Not Started', Followup_Count: 0, Created_At: now, Updated_At: now });
      n.Aging = L.daysBetween(n.NCR_Date, today);
      ncrs.push(n); H(n, 'NCR imported from Excel');
    });
    p.updated.forEach(({ rec, old, changes }) => {
      const n = Object.assign({}, old);
      changes.forEach((c) => { n[c.field] = c.to; });
      n.Aging = L.daysBetween(n.NCR_Date, n.Status === 'Closed' ? n.Closed_Date || today : today);
      n.Updated_At = now;
      ncrs.push(n); H(n, 'Updated from Excel: ' + changes.map((c) => c.field.replace('_', ' ')).join(', '));
    });
    if (opts && opts.markMissingReady) {
      p.missing.forEach((o) => {
        if (o.Status === 'Ready to Close') return;
        const n = Object.assign({}, o, { Status: 'Ready to Close', Updated_At: now });
        ncrs.push(n); H(n, 'No longer in latest Excel file → Ready to Close (QA to verify)');
      });
    }
    return { ncrs, history };
  }

  NCR.importer = { FIELDS, readWorkbook, sheetTable, autoMap, parseDate, buildRecords, plan, apply };
})(window.NCR);
