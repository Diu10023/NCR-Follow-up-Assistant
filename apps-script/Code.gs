/**
 * NCR Follow-up Control – Google Sheets backend (Apps Script web app).
 * Bind this script to the Google Sheet (Extensions → Apps Script), then Deploy → Web app:
 *   Execute as: Me, Who has access: Anyone (or "Anyone with the link"). Put the /exec URL into the app's Settings.
 * Sheets NCR_Master, Followup_History and Settings are created automatically.
 */
var API_KEY = ''; // optional shared key; if set, enter the same value in the app's Settings.

var NCR_HEADERS = ['NCR_ID', 'NCR_No', 'Item_No', 'Batch_No', 'Supplier', 'Buyer', 'NCR_Date', 'Defect', 'Quantity', 'Disposition',
  'Next_Action', 'Owner', 'Waiting_For', 'Due_Date', 'Last_Followup', 'Followup_Count', 'Status', 'Closed_Date', 'Aging', 'Remark', 'Created_At', 'Updated_At', 'Buyer_Remark', 'Buyer_Remark_Date', 'Last_Review'];
var HIST_HEADERS = ['History_ID', 'NCR_ID', 'NCR_No', 'Date', 'Followup_No', 'Action', 'Waiting_For', 'Remark', 'Created_By', 'Created_At'];

function doGet(e) { return respond_(function () { checkKey_(e.parameter.key); return load_(); }); }

function doPost(e) {
  return respond_(function () {
    var body = JSON.parse(e.postData.contents);
    checkKey_(body.key);
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (body.action === 'save') save_(body);
      else if (body.action === 'saveSettings') saveSettings_(body.settings);
      else if (body.action === 'clear') clear_();
      else throw new Error('Unknown action');
    } finally { lock.releaseLock(); }
    return { ok: true };
  });
}

function respond_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function checkKey_(k) { if (API_KEY && k !== API_KEY) throw new Error('Invalid API key'); }

// Sheet cells are kept as plain text so dates stay "yyyy-MM-dd" and nothing gets auto-converted.
function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length).setNumberFormat('@');
  } else if (sh.getRange(1, 1, 1, headers.length).getValues()[0].join('|') !== headers.join('|')) {
    // Older sheet missing newly added columns: refresh the header row.
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), headers.length).setNumberFormat('@');
  }
  return sh;
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function read_(sh, headers) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map(function (r) {
    var o = {}; headers.forEach(function (h, i) { o[h] = cell_(r[i]); }); return o;
  }).filter(function (o) { return o[headers[0]] !== ''; });
}
function write_(sh, headers, rows) {
  var old = sh.getLastRow();
  if (old > 1) sh.getRange(2, 1, old - 1, headers.length).clearContent();
  if (!rows.length) return;
  var need = rows.length + 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  var range = sh.getRange(2, 1, rows.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(rows.map(function (o) { return headers.map(function (h) { return o[h] === undefined || o[h] === null ? '' : String(o[h]); }); }));
}

function load_() {
  var settings = {}, sh = sheet_('Settings', ['Key', 'Value']);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    try { settings[r[0]] = JSON.parse(r[1]); } catch (e) { /* ignore */ }
  });
  return { ncrs: read_(sheet_('NCR_Master', NCR_HEADERS), NCR_HEADERS), history: read_(sheet_('Followup_History', HIST_HEADERS), HIST_HEADERS), settings: settings };
}

function save_(b) {
  var del = {}; (b.deleteIds || []).forEach(function (id) { del[id] = true; });
  if ((b.ncrs && b.ncrs.length) || b.deleteIds && b.deleteIds.length) {
    var sh = sheet_('NCR_Master', NCR_HEADERS), rows = read_(sh, NCR_HEADERS), idx = {};
    rows.forEach(function (r, i) { idx[r.NCR_ID] = i; });
    (b.ncrs || []).forEach(function (n) { if (idx[n.NCR_ID] !== undefined) rows[idx[n.NCR_ID]] = n; else { idx[n.NCR_ID] = rows.length; rows.push(n); } });
    write_(sh, NCR_HEADERS, rows.filter(function (r) { return !del[r.NCR_ID]; }));
  }
  var hs = sheet_('Followup_History', HIST_HEADERS);
  var delH = {}; (b.deleteHistoryIds || []).forEach(function (id) { delH[id] = true; });
  if ((b.deleteIds && b.deleteIds.length) || (b.deleteHistoryIds && b.deleteHistoryIds.length)) {
    write_(hs, HIST_HEADERS, read_(hs, HIST_HEADERS).filter(function (r) { return !del[r.NCR_ID] && !delH[r.History_ID]; }));
  }
  if (b.history && b.history.length) {
    var start = Math.max(hs.getLastRow(), 1) + 1;
    if (start + b.history.length - 1 > hs.getMaxRows()) hs.insertRowsAfter(hs.getMaxRows(), b.history.length);
    var r = hs.getRange(start, 1, b.history.length, HIST_HEADERS.length);
    r.setNumberFormat('@');
    r.setValues(b.history.map(function (o) { return HIST_HEADERS.map(function (h) { return o[h] === undefined || o[h] === null ? '' : String(o[h]); }); }));
  }
}

function saveSettings_(s) {
  var sh = sheet_('Settings', ['Key', 'Value']);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  var keys = Object.keys(s || {});
  if (!keys.length) return;
  sh.getRange(2, 1, keys.length, 2).setNumberFormat('@').setValues(keys.map(function (k) { return [k, JSON.stringify(s[k])]; }));
}

// Wipe all NCRs and follow-up history (settings are kept). Used by "Clear all NCR data" in the app.
function clear_() {
  write_(sheet_('NCR_Master', NCR_HEADERS), NCR_HEADERS, []);
  write_(sheet_('Followup_History', HIST_HEADERS), HIST_HEADERS, []);
}
