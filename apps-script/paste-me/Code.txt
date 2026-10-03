/**
 * NCR Follow-up Control: Team mode (Google Sheets as the database).
 *
 * This script is bound to a Google Sheet (Extensions -> Apps Script). It does two things:
 *   1. doGet() serves the web app (HTML files Index, Styles, Core, Views, App, generated from the project) to your team.
 *   2. api*() functions, called by the page through google.script.run (or by doPost for a website hosted elsewhere), read and write the Sheet.
 * Sheets NCR_Master, Followup_History, Settings and _Data are created automatically.
 * Setup steps: see SETUP.md.
 */

// Optional shared passcode. Leave empty for no passcode. If you set one, every teammate types it once when opening the app.
var ACCESS_CODE = '';

var NCR_HEADERS = ['NCR_ID', 'NCR_No', 'Item_No', 'Batch_No', 'Supplier', 'Buyer', 'NCR_Date', 'Defect', 'Quantity', 'Disposition',
  'Next_Action', 'Owner', 'Waiting_For', 'Due_Date', 'Last_Followup', 'Followup_Count', 'Status', 'Closed_Date', 'Aging', 'Remark', 'Created_At', 'Updated_At', 'Buyer_Remark', 'Buyer_Remark_Date', 'Last_Review'];
var HIST_HEADERS = ['History_ID', 'NCR_ID', 'NCR_No', 'Date', 'Followup_No', 'Action', 'Waiting_For', 'Remark', 'Created_By', 'Created_At'];
var CHUNK = 40000; // a Sheets cell holds at most 50,000 characters

// ---------- web app ----------
// The page is split into five HTML files (Index, Styles, Core, Views, App) so each is small enough to paste.
var PAGE_FILES = ['Index', 'Styles', 'Core', 'Views', 'App'];
// A complete file ends with its closing tag; a file that was cut off while pasting does not.
var PAGE_ENDS = { Index: /<\/html>\s*$/, Styles: /<\/style>\s*(<!--[\s\S]*?-->\s*)?$/, Core: /<\/script>\s*(<!--[\s\S]*?-->\s*)?$/, Views: /<\/script>\s*(<!--[\s\S]*?-->\s*)?$/, App: /<\/script>\s*(<!--[\s\S]*?-->\s*)?$/ };
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function doGet() {
  var present = 0;
  PAGE_FILES.forEach(function (n) { try { include(n); present++; } catch (e) { /* not there */ } });
  if (present === 0) { // API-only use (the app is hosted elsewhere, e.g. Vercel): no page files needed
    return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;padding:28px"><h2>NCR API is running</h2><p>Use this link as the API URL of the app. ' + (ACCESS_CODE ? '' : '<b>ACCESS_CODE is empty: set one in Code.gs before using it from a website.</b>') + '</p></div>');
  }
  var bad = [];
  PAGE_FILES.forEach(function (n) {
    var t = null;
    try { t = include(n); } catch (e) { bad.push('<li><b>' + n + '</b>: file not found. Create an HTML file with exactly this name.</li>'); return; }
    if (!PAGE_ENDS[n].test(t)) bad.push('<li><b>' + n + '</b>: looks cut off (' + Math.round(t.length / 1024) + ' KB). Paste the whole file again.</li>');
  });
  if (bad.length) {
    return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;padding:28px;max-width:680px"><h2>Some files are missing or incomplete</h2><ul>' + bad.join('') +
      '</ul><p>Open each file in this Apps Script project, delete everything, paste the whole content again (open the .txt file with Notepad, Ctrl+A, Ctrl+C), and save. Then Deploy a new version.</p></div>');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('NCR Follow-up Control')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- API for a website hosted elsewhere (fetch POST, text/plain) ----------
function doPost(e) {
  var out;
  try {
    if (!ACCESS_CODE) throw new Error('Set ACCESS_CODE in Code.gs before using the API from a website');
    var b = JSON.parse(e.postData.contents), fn = API[b.fn];
    if (!fn) throw new Error('Unknown function');
    var json = b.arg === null || b.arg === undefined ? undefined : JSON.stringify(b.arg);
    out = { result: JSON.parse(fn(b.code, json)) };
  } catch (err) { out = { error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- API called from the page (google.script.run) ----------
function apiLoad(code) { return api_(code, false, function () { return load_(); }); }
function apiSave(code, json) { return api_(code, true, function () { save_(JSON.parse(json)); return { ok: true }; }); }
function apiSaveSettings(code, json) { return api_(code, true, function () { saveSettings_(JSON.parse(json)); return { ok: true }; }); }
function apiSaveMeta(code, json) { return api_(code, true, function () { var m = JSON.parse(json); kvSet_('imports', JSON.stringify(m.imports || [])); kvSet_('stack', JSON.stringify(m.stack || [])); return { ok: true }; }); }
function apiClear(code) { return api_(code, true, function () { clear_(); return { ok: true }; }); }
function apiRestore(code, json) { return api_(code, true, function () { restore_(JSON.parse(json)); return { ok: true }; }); }

var API = { apiLoad: apiLoad, apiSave: apiSave, apiSaveSettings: apiSaveSettings, apiSaveMeta: apiSaveMeta, apiClear: apiClear, apiRestore: apiRestore };

function api_(code, write, fn) {
  if (ACCESS_CODE && code !== ACCESS_CODE) throw new Error('Wrong or missing access code');
  var lock = null;
  if (write) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
  try { return JSON.stringify(fn()); } finally { if (lock) lock.releaseLock(); }
}

// ---------- Sheet helpers ----------
// Cells are kept as plain text so dates stay "yyyy-MM-dd" and nothing gets auto-converted.
function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length).setNumberFormat('@');
  } else if (sh.getRange(1, 1, 1, headers.length).getValues()[0].join('|') !== headers.join('|')) {
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

// Small key/value store for the upload log and the undo data (long JSON is split into chunks).
var KV_HEADERS = ['Key', 'Part', 'Chunk'];
function kvSheet_() { return sheet_('_Data', KV_HEADERS); }
function kvGet_(key) {
  var sh = kvSheet_(), last = sh.getLastRow();
  if (last < 2) return '';
  var rows = sh.getRange(2, 1, last - 1, 3).getValues().filter(function (r) { return r[0] === key; });
  rows.sort(function (a, b) { return Number(a[1]) - Number(b[1]); });
  return rows.map(function (r) { return String(r[2]); }).join('');
}
function kvSet_(key, text) {
  var sh = kvSheet_(), last = sh.getLastRow(), keep = [];
  if (last > 1) keep = sh.getRange(2, 1, last - 1, 3).getValues().filter(function (r) { return r[0] !== key; });
  var rows = keep.slice();
  for (var i = 0, p = 0; i < text.length; i += CHUNK, p++) rows.push([key, p, text.substr(i, CHUNK)]);
  if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
  if (!rows.length) return;
  var need = rows.length + 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  var range = sh.getRange(2, 1, rows.length, 3);
  range.setNumberFormat('@');
  range.setValues(rows.map(function (r) { return [String(r[0]), String(r[1]), String(r[2])]; }));
}
function kvJson_(key) { var t = kvGet_(key); if (!t) return []; try { return JSON.parse(t); } catch (e) { return []; } }

// ---------- data ----------
function load_() {
  var settings = {}, sh = sheet_('Settings', ['Key', 'Value']);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    try { settings[r[0]] = JSON.parse(r[1]); } catch (e) { /* ignore */ }
  });
  var user = '';
  try { user = Session.getActiveUser().getEmail() || ''; } catch (e) { /* not available */ }
  return {
    ncrs: read_(sheet_('NCR_Master', NCR_HEADERS), NCR_HEADERS),
    history: read_(sheet_('Followup_History', HIST_HEADERS), HIST_HEADERS),
    settings: settings,
    imports: kvJson_('imports'),
    stack: kvJson_('stack'),
    meta: { sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(), user: user }
  };
}

function save_(b) {
  var del = {}; (b.deleteIds || []).forEach(function (id) { del[id] = true; });
  if ((b.ncrs && b.ncrs.length) || (b.deleteIds && b.deleteIds.length)) {
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

// Replace everything with a backup (Settings -> Backup -> Restore).
function restore_(d) {
  write_(sheet_('NCR_Master', NCR_HEADERS), NCR_HEADERS, d.ncrs || []);
  write_(sheet_('Followup_History', HIST_HEADERS), HIST_HEADERS, d.history || []);
  saveSettings_(d.settings || {});
}
