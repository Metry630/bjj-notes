/**
 * @OnlyCurrentDoc
 *
 * BJJ notes API: the only door between the phone app / the Claude routine and this spreadsheet.
 *
 * Install: Extensions > Apps Script in "BJJ Lesson Tracker", paste this file, run setup() once,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone) and paste the
 * /exec URL into App · Setup!B3.
 * Update: paste, save, run setup(), then Deploy > Manage deployments > edit (pencil) >
 * Version: New version > Deploy. The URL stays the same.
 *
 * Enforced here rather than by convention:
 * - Sheet1 is append-only: appendSession (agent token) adds a row; no action edits or deletes one.
 * - Only "App · *" tabs are read or written, never "App · Setup" (it shows the tokens).
 * - Phone token: read, add to Inbox/Questions/Feedback/Audio, edit or cancel its own items while
 *   they are still "new", rate a filed note, answer an open decision, set the routine mode, and
 *   start a run (runNow). Agent token: reads, appendSession, any other App tab. It can't start runs.
 *
 * Every response is HTTP 200 JSON; check `ok`. Token goes in the JSON body (`token`) or as ?k=.
 */

const NOTES_SHEET = 'Sheet1';
const APP = 'App · ';
const SETUP_TAB = APP + 'Setup';
const PAGES_URL = 'https://metry630.github.io/bjj-notes/';
const TABS = {
  'App · Inbox': ['id', 'created_at', 'session_date', 'location', 'hours', 'text', 'status', 'sheet_row', 'agent_note', 'processed_at'],
  'App · Questions': ['id', 'asked_at', 'question', 'status', 'answer', 'sources', 'answered_at'],
  'App · Feedback': ['id', 'created_at', 'text', 'status', 'reply', 'replied_at'],
  'App · Log': ['id', 'started_at', 'finished_at', 'mode', 'summary', 'shipped', 'needs_you'],
  'App · Audio': ['id', 'created_at', 'inbox_id', 'seq', 'total', 'mime', 'data', 'status'],
  'App · Decisions': ['id', 'created_at', 'question', 'options', 'recommended', 'status', 'answer', 'answered_at'],
};
TABS['App · Inbox'] = TABS['App · Inbox'].concat(['method', 'rating']);
// What the phone may set on its own rows; everything else is server- or agent-set.
const PHONE_FIELDS = {
  'App · Inbox': ['session_date', 'location', 'hours', 'text', 'method'],
  'App · Questions': ['question'],
  'App · Feedback': ['text'],
  'App · Audio': ['inbox_id', 'seq', 'total', 'mime', 'data'],
};
// Fields the phone may change at any time, not only while an item is still "new".
const PHONE_ANYTIME = { 'App · Inbox': ['rating'] };
const DECISIONS_TAB = APP + 'Decisions';
const METHODS = ['keyboard', 'recording'];
const CREATED_FIELD = { 'App · Inbox': 'created_at', 'App · Questions': 'asked_at', 'App · Feedback': 'created_at', 'App · Audio': 'created_at' };
// Run now: the routine's API trigger. Its token (sk-ant-oat01-...) lives in Script Properties as
// RUN_TOKEN and can only start this one routine.
const FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_01Afu9HT6okM7SGULQsYokWm/fire';
const RUN_GAP_MINUTES = 10;
const RUNS_PER_DAY = 8;
const MODES = ['normal', 'light', 'paused'];
const READ_ACTIONS = ['ping', 'notes', 'get', 'settings'];
const MAX_TEXT = 40000; // a cell holds 50k chars

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ ok: false, error: 'bad_json' });
  }
  const role = roleFor_(req.token || (e && e.parameter && e.parameter.k));
  if (!role) return out_({ ok: false, error: 'unauthorized' });
  try {
    if (req.action === 'batch') return out_({ ok: true, results: batch_(role, req.calls) });
    return out_(Object.assign({ ok: true }, handle_(role, req)));
  } catch (err) {
    return out_({ ok: false, error: msg_(err) });
  }
}

function doGet() {
  return out_({ ok: false, error: 'post_only' });
}

function handle_(role, req) {
  switch (req.action) {
    case 'ping':
      return { role: role };
    case 'notes':
      return readNotes_();
    case 'get':
      return { rows: readTab_(appTab_(req.tab)) };
    case 'settings':
      return settings_(role, req.set);
    case 'add':
      return withLock_(function () { return add_(role, appTab_(req.tab), req.rows); });
    case 'update':
      return withLock_(function () { return update_(role, appTab_(req.tab), req.id, req.fields); });
    case 'appendSession':
      if (role !== 'agent') throw new Error('forbidden');
      return withLock_(function () { return appendSession_(req); });
    case 'runNow':
      if (role !== 'phone') throw new Error('forbidden'); // the routine never starts itself
      return withLock_(runNow_);
    default:
      throw new Error('unknown_action');
  }
}

// Several reads in one round trip (Apps Script calls cost ~1-2 s each).
function batch_(role, calls) {
  if (!Array.isArray(calls) || calls.length > 20) throw new Error('bad_calls');
  return calls.map(function (c) {
    if (!c || READ_ACTIONS.indexOf(c.action) < 0 || c.set) return { ok: false, error: 'batch_is_read_only' };
    try {
      return Object.assign({ ok: true }, handle_(role, c));
    } catch (err) {
      return { ok: false, error: msg_(err) };
    }
  });
}

// ---- Sheet1 (his notes) ----

function readNotes_() {
  const values = ss_().getSheetByName(NOTES_SHEET).getDataRange().getDisplayValues();
  const layout = layout_(values);
  const rows = [];
  for (let i = layout.first - 1; i < values.length; i++) {
    const cells = trimRight_(values[i]);
    if (cells.length) rows.push({ row: i + 1, cells: cells });
  }
  return { header_row: layout.header, first_row: layout.first, total_hours: layout.total, rows: rows };
}

// Finds the "Date | Location | Hours" header and an optional "Total:" row under it.
function layout_(values) {
  let header = 0;
  for (let i = 0; i < Math.min(values.length, 15); i++) {
    if (String(values[i][0]).trim().toLowerCase() === 'date') {
      header = i + 1;
      break;
    }
  }
  if (!header) return { header: 0, first: 1, total: '', hoursCol: 3 };
  const hoursIdx = values[header - 1].map(function (v) { return String(v).trim().toLowerCase(); }).indexOf('hours');
  const next = values[header] || [];
  const isTotal = /^total/i.test(String(next[0] || '').trim());
  return {
    header: header,
    first: header + (isTotal ? 2 : 1),
    total: isTotal && hoursIdx >= 0 ? String(next[hoursIdx]) : '',
    hoursCol: hoursIdx >= 0 ? hoursIdx + 1 : 3,
    totalRow: isTotal ? header + 1 : 0,
  };
}

function appendSession_(req) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.date || ''));
  if (!m) throw new Error('bad_date');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new Error('bad_date');
  const cells = (Array.isArray(req.cells) ? req.cells : [])
    .map(function (c) { return String(c == null ? '' : c).trim(); })
    .filter(function (c) { return c; });
  if (!cells.length) throw new Error('no_cells');
  if (cells.length > 30) throw new Error('too_many_cells');
  const hours = req.hours === '' || req.hours == null ? '' : Number(req.hours);
  if (hours !== '' && !(hours >= 0 && hours <= 12)) throw new Error('bad_hours');

  const sh = ss_().getSheetByName(NOTES_SHEET);
  const last = sh.getLastRow();
  const r = last + 1;
  const width = Math.max(3 + cells.length, sh.getLastColumn());
  ensureCols_(sh, width);
  // Same look as the previous session row (wrap, fonts, date format).
  sh.getRange(last, 1, 1, width).copyTo(sh.getRange(r, 1, 1, width), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  // A dropdown rule on a column (e.g. a gym list) must not reject a new value half way through a row.
  sh.getRange(r, 1, 1, width).clearDataValidations();
  const dateCell = sh.getRange(r, 1);
  if (isDate_(sh.getRange(last, 1).getValue())) {
    // A day serial in the copied date format: no script-vs-sheet time zone shift.
    dateCell.setValue((Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  } else {
    // Previous dates are text like 1/11/24: write the same, as text, so the locale can't flip d/m.
    dateCell.setNumberFormat('@');
    dateCell.setValue(d + '/' + mo + '/' + String(y).slice(-2));
  }
  const loc = sh.getRange(r, 2);
  loc.setNumberFormat('@');
  loc.setValue(clean_(req.location || ''));
  sh.getRange(r, 3).setValue(hours);
  const tips = sh.getRange(r, 4, 1, cells.length);
  tips.setNumberFormat('@');
  tips.setValues([cells.map(clean_)]);
  return { row: r };
}

// ---- App tabs ----

function readTab_(tab) {
  const sh = ss_().getSheetByName(tab);
  if (!sh || sh.getLastRow() < 1) return [];
  const values = sh.getDataRange().getValues();
  const header = values[0].map(String);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (!values[i].some(function (v) { return v !== '' && v != null; })) continue;
    const o = { _row: i + 1 };
    header.forEach(function (h, j) { if (h) o[h] = values[i][j]; });
    rows.push(o);
  }
  return rows;
}

function add_(role, tab, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw new Error('bad_rows');
  if (role === 'phone' && !PHONE_FIELDS[tab]) throw new Error('forbidden');
  const sh = ensureTab_(tab, role === 'agent' ? Object.keys(rows[0] || {}) : null);
  let header = header_(sh);
  if (TABS[tab]) header = growHeader_(sh, header, TABS[tab]); // tabs from an older version gain columns
  const ids = idIndex_(sh, header);
  return {
    added: rows.map(function (input) {
      const row = role === 'phone' ? phoneRow_(tab, input) : Object.assign({}, input);
      delete row._row;
      row.id = String(row.id || Utilities.getUuid());
      if (ids[row.id]) return { id: row.id, row: ids[row.id], duplicate: true };
      const created = CREATED_FIELD[tab];
      if (created && !row[created]) row[created] = new Date().toISOString();
      if (header.indexOf('status') >= 0 && !row.status) row.status = 'new';
      if (role === 'agent') header = growHeader_(sh, header, Object.keys(row));
      const r = sh.getLastRow() + 1;
      writeRow_(sh, r, header, row);
      ids[row.id] = r;
      return { id: row.id, row: r };
    }),
  };
}

function update_(role, tab, id, fields) {
  if (!id || !fields || typeof fields !== 'object') throw new Error('bad_update');
  const sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('no_such_tab');
  let header = header_(sh);
  if (TABS[tab]) header = growHeader_(sh, header, TABS[tab]);
  const r = idIndex_(sh, header)[String(id)];
  if (!r) throw new Error('no_such_id');
  let keys = Object.keys(fields).filter(function (k) { return k !== 'id' && k !== '_row'; });
  if (role === 'phone') {
    const current = rowObject_(sh, r, header);
    const anytime = PHONE_ANYTIME[tab] || [];
    if (tab === DECISIONS_TAB) {
      if (keys.length !== 1 || keys[0] !== 'answer') throw new Error('forbidden_field');
      if (current.status !== 'open') throw new Error('already_answered');
      const options = String(current.options).split('|').map(function (o) { return o.trim(); });
      if (options.indexOf(String(fields.answer)) < 0) throw new Error('bad_answer');
      fields = { answer: String(fields.answer), status: 'answered', answered_at: new Date().toISOString() };
      keys = Object.keys(fields);
    } else if (keys.length && keys.every(function (k) { return anytime.indexOf(k) >= 0; })) {
      if (keys.indexOf('rating') >= 0 && !/^[1-5]$/.test(String(fields.rating))) throw new Error('bad_rating');
    } else {
      if (!PHONE_FIELDS[tab]) throw new Error('forbidden');
      if (current.status !== 'new') throw new Error('already_processed');
      const allowed = PHONE_FIELDS[tab].concat(['status']);
      keys.forEach(function (k) {
        if (allowed.indexOf(k) < 0) throw new Error('forbidden_field');
        if (k === 'status' && fields[k] !== 'cancelled') throw new Error('forbidden_status');
      });
    }
  } else {
    header = growHeader_(sh, header, keys);
  }
  keys.forEach(function (k) {
    const c = header.indexOf(k) + 1;
    if (c < 1) return;
    const cell = sh.getRange(r, c);
    cell.setNumberFormat('@');
    cell.setValue(clean_(fields[k]));
  });
  return { id: String(id), row: r };
}

function settings_(role, set) {
  const props = PropertiesService.getScriptProperties();
  if (set) {
    if (role !== 'phone') throw new Error('forbidden'); // the mode is his escape hatch, not the agent's
    if (MODES.indexOf(set.routine_mode) < 0) throw new Error('bad_mode');
    props.setProperty('ROUTINE_MODE', set.routine_mode);
  }
  return { routine_mode: props.getProperty('ROUTINE_MODE') || 'normal' };
}

function phoneRow_(tab, input) {
  const row = { id: input && input.id };
  PHONE_FIELDS[tab].forEach(function (k) {
    if (input && input[k] != null) row[k] = input[k];
  });
  if (row.method != null && METHODS.indexOf(row.method) < 0) throw new Error('bad_method');
  if (tab === 'App · Audio') checkAudio_(row);
  row.status = 'new';
  return row;
}

// One base64 slice of a recording: the routine joins slices 1..total of an inbox item.
function checkAudio_(row) {
  const seq = Number(row.seq);
  const total = Number(row.total);
  const data = String(row.data || '');
  const ok =
    row.inbox_id && /^audio\/[\w.+-]+(;[\w=.,-]+)?$/.test(String(row.mime || '')) &&
    /^[A-Za-z0-9+\/=]+$/.test(data) && data.length <= MAX_TEXT &&
    Math.floor(seq) === seq && Math.floor(total) === total && seq >= 1 && seq <= total && total <= 500;
  if (!ok) throw new Error('bad_audio');
}

// Starts the routine now. Rate-limited here as well as by Anthropic, since every run uses his plan.
function runNow_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('RUN_TOKEN');
  if (!token) throw new Error('no_run_token');
  const now = Date.now();
  if (now - Number(props.getProperty('RUN_LAST') || 0) < RUN_GAP_MINUTES * 60000) throw new Error('too_soon');
  const day = Utilities.formatDate(new Date(now), 'Asia/Singapore', 'yyyy-MM-dd');
  const count = props.getProperty('RUN_DAY') === day ? Number(props.getProperty('RUN_COUNT') || 0) : 0;
  if (count >= RUNS_PER_DAY) throw new Error('daily_limit');
  const res = UrlFetchApp.fetch(FIRE_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, 'anthropic-version': '2026-10-21' },
    payload: JSON.stringify({ text: 'Manual run from the app.' }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('fire_failed_' + code);
  props.setProperty('RUN_LAST', String(now));
  props.setProperty('RUN_DAY', day);
  props.setProperty('RUN_COUNT', String(count + 1));
  return { fired: true, runs_today: count + 1 };
}

function appTab_(name) {
  if (typeof name !== 'string' || name.indexOf(APP) !== 0 || name === SETUP_TAB || name.length > 60) {
    throw new Error('bad_tab');
  }
  return name;
}

function ensureTab_(tab, keys) {
  const ss = ss_();
  let sh = ss.getSheetByName(tab);
  if (sh) return sh;
  const header = TABS[tab] || ['id'].concat((keys || []).filter(function (k) { return k !== 'id' && k !== '_row'; }));
  sh = ss.insertSheet(tab);
  ensureCols_(sh, header.length);
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.setFrozenRows(1);
  sh.hideSheet();
  return sh;
}

function header_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
}

function growHeader_(sh, header, keys) {
  const missing = keys.filter(function (k) { return k !== '_row' && header.indexOf(k) < 0; });
  if (!missing.length) return header;
  ensureCols_(sh, header.length + missing.length);
  sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  return header.concat(missing);
}

function idIndex_(sh, header) {
  const col = header.indexOf('id') + 1;
  const last = sh.getLastRow();
  const index = {};
  if (col < 1 || last < 2) return index;
  sh.getRange(2, col, last - 1, 1).getValues().forEach(function (v, i) {
    if (v[0] !== '') index[String(v[0])] = i + 2;
  });
  return index;
}

function rowObject_(sh, r, header) {
  const values = sh.getRange(r, 1, 1, header.length).getValues()[0];
  const o = {};
  header.forEach(function (h, i) { o[h] = values[i]; });
  return o;
}

function writeRow_(sh, r, header, row) {
  const range = sh.getRange(r, 1, 1, header.length);
  range.setNumberFormat('@');
  range.setValues([header.map(function (h) { return row[h] == null ? '' : clean_(row[h]); })]);
}

// ---- setup (run from the editor) ----

function setup() {
  Object.keys(TABS).forEach(function (t) {
    const sh = ensureTab_(t, null);
    growHeader_(sh, header_(sh), TABS[t]);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PHONE_TOKEN') || !props.getProperty('AGENT_TOKEN')) newTokens_(props);
  if (!props.getProperty('ROUTINE_MODE')) props.setProperty('ROUTINE_MODE', 'normal');
  writeSetup_(fixTotal_());
}

// If a token leaks: run this, then open the new phone link and update BJJ_AGENT_TOKEN on claude.ai.
function rotateTokens() {
  newTokens_(PropertiesService.getScriptProperties());
  writeSetup_(null);
}

function newTokens_(props) {
  props.setProperty('PHONE_TOKEN', token_());
  props.setProperty('AGENT_TOKEN', token_());
}

// Prefixed so no sheet ever reads it as a number, and so it's easy to grep for in a diff.
function token_() {
  return 'bjj_' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

// The one edit to an existing Sheet1 cell: a closed SUM range (=SUM(C5:C208)) would stop
// counting appended rows, so it becomes open-ended (=SUM(C5:C)).
function fixTotal_() {
  const sh = ss_().getSheetByName(NOTES_SHEET);
  const layout = layout_(sh.getDataRange().getDisplayValues());
  if (!layout.totalRow) return 'No Total row found; nothing changed.';
  const cell = sh.getRange(layout.totalRow, layout.hoursCol);
  const f = cell.getFormula();
  const m = /^=SUM\(([A-Z]+)(\d+):([A-Z]+)(\d*)\)$/i.exec(f);
  if (!m || m[1].toUpperCase() !== m[3].toUpperCase()) return 'Total is ' + (f || 'not a formula') + '; left alone.';
  if (!m[4]) return 'Total ' + f + ' already counts new rows.';
  const open = '=SUM(' + m[1] + m[2] + ':' + m[3] + ')';
  cell.setFormula(open);
  return 'Total changed from ' + f + ' to ' + open + ' so new rows count.';
}

function writeSetup_(totalNote) {
  const ss = ss_();
  const sh = ss.getSheetByName(SETUP_TAB) || ss.insertSheet(SETUP_TAB);
  const props = PropertiesService.getScriptProperties();
  const url = String(sh.getRange(3, 2).getValue() || '');
  const note = totalNote == null ? String(sh.getRange(8, 2).getValue() || '') : totalNote;
  sh.getRange(5, 2).setNumberFormat('@');
  sh.getRange(1, 1, 11, 2).setValues([
    ['BJJ notes app', 'Keep this tab private. It is as sensitive as the notes themselves.'],
    ['', ''],
    ['1. Web app URL', url],
    ['2. Phone link: open on your phone', ''],
    ['3. BJJ_AGENT_TOKEN for the claude.ai environment', props.getProperty('AGENT_TOKEN')],
    ['', ''],
    ['Routine mode', 'Change it from the app Home screen (normal / light / paused).'],
    ['Total hours formula', note],
    ['', ''],
    ['If a token leaks', 'Extensions > Apps Script > run rotateTokens, then redo steps 2 and 3.'],
    ['Run now button', props.getProperty('RUN_TOKEN') ? 'Ready.' : 'Not set up: add Script property RUN_TOKEN (Apps Script > Project Settings).'],
  ]);
  sh.getRange(4, 2).setFormula(
    '=IF(B3="","Paste the web app URL into B3 first","' + PAGES_URL + '#api="&ENCODEURL(B3)&"&k=' +
      props.getProperty('PHONE_TOKEN') + '")'
  );
}

// ---- small helpers ----

function roleFor_(token) {
  if (!token || typeof token !== 'string') return null;
  const props = PropertiesService.getScriptProperties();
  if (same_(token, props.getProperty('AGENT_TOKEN'))) return 'agent';
  if (same_(token, props.getProperty('PHONE_TOKEN'))) return 'phone';
  return null;
}

function same_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ensureCols_(sh, n) {
  const max = sh.getMaxColumns();
  if (max < n) sh.insertColumnsAfter(max, n - max);
}

// Text in, text out: no formulas from note text, capped at a cell's size.
function clean_(v) {
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.length > MAX_TEXT) s = s.slice(0, MAX_TEXT);
  return s.charAt(0) === '=' ? "'" + s : s;
}

function trimRight_(row) {
  let n = row.length;
  while (n > 0 && String(row[n - 1]).trim() === '') n--;
  return row.slice(0, n).map(String);
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function msg_(err) {
  return String((err && err.message) || err);
}
