import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs, sampleSheet1, listRule } from './fake-gas.mjs';

function ready(opts) {
  const env = loadCodeGs(opts);
  env.api.setup();
  env.phone = env.props.get('PHONE_TOKEN');
  env.agent = env.props.get('AGENT_TOKEN');
  return env;
}

const snapshot = (sheet, rows) =>
  JSON.stringify(Array.from({ length: rows }, (_, i) => sheet.getRange(i + 1, 1, 1, 8).getValues()[0]));

test('rejects missing and wrong tokens', () => {
  const { post } = ready();
  assert.deepEqual(post({ action: 'ping' }), { ok: false, error: 'unauthorized' });
  assert.deepEqual(post({ action: 'ping', token: 'bjj_nope' }), { ok: false, error: 'unauthorized' });
});

test('tokens map to roles and are prefixed', () => {
  const { post, phone, agent } = ready();
  assert.match(phone, /^bjj_[0-9a-f]{64}$/);
  assert.notEqual(phone, agent);
  assert.equal(post({ action: 'ping', token: phone }).role, 'phone');
  assert.equal(post({ action: 'ping', token: agent }).role, 'agent');
});

test('notes returns session rows after the Total row', () => {
  const { post, phone } = ready();
  const res = post({ action: 'notes', token: phone });
  assert.equal(res.header_row, 3);
  assert.equal(res.first_row, 5);
  assert.equal(res.total_hours, '3');
  assert.deepEqual(res.rows.map((r) => r.row), [5, 6]);
  assert.deepEqual(res.rows[1].cells, ['1/11/24', 'Gym A', '2', 'tip three about armbar']);
});

test('setup makes hidden app tabs, a visible setup tab, and opens the closed Total range', () => {
  const { ss, sheet1, props } = ready();
  for (const t of ['App · Inbox', 'App · Questions', 'App · Feedback', 'App · Log']) {
    assert.equal(ss.getSheetByName(t).hidden, true, t);
  }
  const setupTab = ss.getSheetByName('App · Setup');
  assert.equal(setupTab.hidden, false);
  assert.equal(setupTab.getRange(5, 2).getValue(), props.get('AGENT_TOKEN'));
  assert.match(setupTab.getRange(4, 2).getFormula(), /#api="&ENCODEURL\(B3\)&"&k=bjj_/);
  assert.equal(sheet1.getRange('C4').getFormula(), '=SUM(C5:C)');
  assert.equal(props.get('ROUTINE_MODE'), 'normal');
});

test('setup is idempotent: tokens survive a second run, rotateTokens replaces them', () => {
  const env = ready();
  env.ss.getSheetByName('App · Setup').getRange(3, 2).setValue('https://script.google.com/macros/s/x/exec');
  env.api.setup();
  assert.equal(env.props.get('PHONE_TOKEN'), env.phone);
  assert.equal(env.ss.getSheetByName('App · Setup').getRange(3, 2).getValue(), 'https://script.google.com/macros/s/x/exec');
  env.api.rotateTokens();
  assert.notEqual(env.props.get('PHONE_TOKEN'), env.phone);
  assert.notEqual(env.props.get('AGENT_TOKEN'), env.agent);
  assert.equal(env.post({ action: 'ping', token: env.phone }).error, 'unauthorized');
});

test('phone adds to Inbox: server sets status and created_at, drops agent-only fields, dedupes by id', () => {
  const { post, phone, ss } = ready();
  const row = { id: 'n1', session_date: '2026-10-31', location: 'Gym B', hours: 1.5, text: 'hello', sheet_row: 99, status: 'done' };
  const res = post({ action: 'add', tab: 'App · Inbox', rows: [row], token: phone });
  assert.equal(res.ok, true);
  assert.equal(res.added[0].row, 2);
  const [got] = post({ action: 'get', tab: 'App · Inbox', token: phone }).rows;
  assert.equal(got.id, 'n1');
  assert.equal(got.status, 'new');
  assert.equal(got.sheet_row, '');
  assert.match(got.created_at, /^\d{4}-\d{2}-\d{2}T/);
  const again = post({ action: 'add', tab: 'App · Inbox', rows: [row], token: phone });
  assert.equal(again.added[0].duplicate, true);
  assert.equal(ss.getSheetByName('App · Inbox').getLastRow(), 2);
});

test('phone is limited: no Log writes, no Setup reads, no Sheet1, no appendSession, no mode via agent', () => {
  const { post, phone, agent } = ready();
  assert.equal(post({ action: 'add', tab: 'App · Log', rows: [{ summary: 'x' }], token: phone }).error, 'forbidden');
  assert.equal(post({ action: 'get', tab: 'App · Setup', token: phone }).error, 'bad_tab');
  assert.equal(post({ action: 'get', tab: 'App · Setup', token: agent }).error, 'bad_tab');
  assert.equal(post({ action: 'add', tab: 'Sheet1', rows: [{ a: 1 }], token: agent }).error, 'bad_tab');
  assert.equal(post({ action: 'update', tab: 'Sheet1', id: 'x', fields: { a: 1 }, token: agent }).error, 'bad_tab');
  assert.equal(post({ action: 'appendSession', date: '2026-10-31', cells: ['x'], token: phone }).error, 'forbidden');
  assert.equal(post({ action: 'settings', set: { routine_mode: 'paused' }, token: agent }).error, 'forbidden');
  assert.equal(post({ action: 'nope', token: phone }).error, 'unknown_action');
});

test('phone can edit or cancel its own item only while it is new', () => {
  const { post, phone, agent } = ready();
  post({ action: 'add', tab: 'App · Questions', rows: [{ id: 'q1', question: 'deep half?' }], token: phone });
  assert.equal(post({ action: 'update', tab: 'App · Questions', id: 'q1', fields: { question: 'deep half again?' }, token: phone }).ok, true);
  assert.equal(post({ action: 'update', tab: 'App · Questions', id: 'q1', fields: { answer: 'x' }, token: phone }).error, 'forbidden_field');
  assert.equal(post({ action: 'update', tab: 'App · Questions', id: 'q1', fields: { status: 'answered' }, token: phone }).error, 'forbidden_status');
  assert.equal(post({ action: 'update', tab: 'App · Questions', id: 'q1', fields: { status: 'answered', answer: 'From 7/11/24: ...' }, token: agent }).ok, true);
  assert.equal(post({ action: 'update', tab: 'App · Questions', id: 'q1', fields: { status: 'cancelled' }, token: phone }).error, 'already_processed');
});

test('agent can create new App tabs and grow columns', () => {
  const { post, agent, ss } = ready();
  const res = post({ action: 'add', tab: 'App · Topics', rows: [{ id: 'spider-guard', topic: 'spider guard', summary: 's' }], token: agent });
  assert.equal(res.ok, true);
  assert.equal(ss.getSheetByName('App · Topics').hidden, true);
  post({ action: 'update', tab: 'App · Topics', id: 'spider-guard', fields: { aliases: 'spider' }, token: agent });
  const [row] = post({ action: 'get', tab: 'App · Topics', token: agent }).rows;
  assert.equal(row.aliases, 'spider');
});

test('appendSession appends one row and leaves every existing row untouched (text dates)', () => {
  const { post, agent, sheet1 } = ready();
  const before = snapshot(sheet1, 6);
  const res = post({ action: 'appendSession', date: '2026-10-31', location: 'Gym B', hours: 1.5, cells: ['=not a formula', ' second tip ', ''], token: agent });
  assert.deepEqual(res, { ok: true, row: 7, merged: false, inserted: false });
  assert.equal(snapshot(sheet1, 6), before);
  assert.deepEqual(sheet1.getRange(7, 1, 1, 6).getValues()[0], ['31/10/26', 'Gym B', 1.5, "'=not a formula", 'second tip', '']);
  assert.equal(sheet1.peek(7, 1).fmt, '@');
  assert.equal(sheet1.peek(7, 4).fmt, '@');
});

test('appendSession writes a day serial in the copied date format when dates are real dates', () => {
  const { post, agent, sheet1 } = ready({ sheet1: sampleSheet1({ dates: 'date' }) });
  sheet1.cell(6, 1).fmt = 'd/m/yy';
  post({ action: 'appendSession', date: '2024-11-05', location: 'Gym B', hours: 1, cells: ['x'], token: agent });
  assert.equal(sheet1.getRange(7, 1).getValue(), 45601); // 5 Nov 2024 as a Sheets serial
  assert.equal(sheet1.peek(7, 1).fmt, 'd/m/yy');
});

test('appendSession validates input', () => {
  const { post, agent } = ready();
  const base = { action: 'appendSession', token: agent, location: 'x', hours: 1, cells: ['x'] };
  assert.equal(post({ ...base, date: '31/10/2026' }).error, 'bad_date');
  assert.equal(post({ ...base, date: '2026-02-30' }).error, 'bad_date');
  assert.equal(post({ ...base, date: '2026-10-31', cells: ['  '] }).error, 'no_cells');
  assert.equal(post({ ...base, date: '2026-10-31', hours: 40 }).error, 'bad_hours');
  assert.equal(post({ ...base, date: '2026-10-31', hours: '' }).ok, true);
});

test('settings: phone sets the mode, bad modes are rejected', () => {
  const { post, phone, agent } = ready();
  assert.equal(post({ action: 'settings', token: agent }).routine_mode, 'normal');
  assert.equal(post({ action: 'settings', set: { routine_mode: 'paused' }, token: phone }).routine_mode, 'paused');
  assert.equal(post({ action: 'settings', set: { routine_mode: 'turbo' }, token: phone }).error, 'bad_mode');
  assert.equal(post({ action: 'settings', token: agent }).routine_mode, 'paused');
});

test('batch runs reads only', () => {
  const { post, phone } = ready();
  const res = post({
    action: 'batch',
    token: phone,
    calls: [
      { action: 'notes' },
      { action: 'get', tab: 'App · Inbox' },
      { action: 'settings' },
      { action: 'settings', set: { routine_mode: 'paused' } },
      { action: 'add', tab: 'App · Inbox', rows: [{ text: 'x' }] },
    ],
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.results.map((r) => r.ok), [true, true, true, false, false]);
  assert.equal(post({ action: 'settings', token: phone }).routine_mode, 'normal');
});

test('bad JSON and GET are refused without touching data', () => {
  const { api } = ready();
  assert.deepEqual(JSON.parse(api.doPost({ postData: { contents: '{nope' } }).getContent()), { ok: false, error: 'bad_json' });
  assert.deepEqual(JSON.parse(api.doGet().getContent()), { ok: false, error: 'post_only' });
});

// ---- v2: recordings, ratings, decisions, run now ----

const b64 = Buffer.from('fake audio bytes').toString('base64');

test('phone uploads recording slices; bad slices are refused', () => {
  const { post, phone, ss } = ready();
  post({ action: 'add', tab: 'App · Inbox', rows: [{ id: 'rec1', session_date: '2026-11-02', text: '', method: 'recording' }], token: phone });
  const res = post({
    action: 'add',
    tab: 'App · Audio',
    rows: [1, 2].map((seq) => ({ id: `rec1-${seq}`, inbox_id: 'rec1', seq, total: 2, mime: 'audio/mp4', data: b64 })),
    token: phone,
  });
  assert.equal(res.ok, true);
  assert.equal(ss.getSheetByName('App · Audio').getLastRow(), 3);
  const bad = (row) => post({ action: 'add', tab: 'App · Audio', rows: [{ inbox_id: 'rec1', seq: 1, total: 1, mime: 'audio/mp4', data: b64, ...row }], token: phone }).error;
  assert.equal(bad({ mime: 'text/html' }), 'bad_audio');
  assert.equal(bad({ data: '<script>' }), 'bad_audio');
  assert.equal(bad({ seq: 3, total: 2 }), 'bad_audio');
  assert.equal(bad({ data: 'A'.repeat(40001) }), 'bad_audio');
  assert.equal(post({ action: 'add', tab: 'App · Inbox', rows: [{ text: 'x', method: 'telepathy' }], token: phone }).error, 'bad_method');
});

test('inbox tabs from v1 gain method and rating columns', () => {
  const { post, phone, ss } = ready();
  const inbox = ss.getSheetByName('App · Inbox');
  inbox.getRange(1, 11, 1, 2).setValues([['', '']]); // simulate a v1 header without the new columns
  post({ action: 'add', tab: 'App · Inbox', rows: [{ id: 'k1', text: 'typed', method: 'keyboard' }], token: phone });
  const [row] = post({ action: 'get', tab: 'App · Inbox', token: phone }).rows;
  assert.equal(row.method, 'keyboard');
});

test('phone rates a filed note at any time, 1 to 5 only', () => {
  const { post, phone, agent } = ready();
  post({ action: 'add', tab: 'App · Inbox', rows: [{ id: 'n1', text: 'x', method: 'keyboard' }], token: phone });
  post({ action: 'update', tab: 'App · Inbox', id: 'n1', fields: { status: 'processed', sheet_row: 7 }, token: agent });
  assert.equal(post({ action: 'update', tab: 'App · Inbox', id: 'n1', fields: { rating: 4 }, token: phone }).ok, true);
  assert.equal(post({ action: 'update', tab: 'App · Inbox', id: 'n1', fields: { rating: 9 }, token: phone }).error, 'bad_rating');
  assert.equal(post({ action: 'update', tab: 'App · Inbox', id: 'n1', fields: { rating: 3, text: 'edit' }, token: phone }).error, 'already_processed');
  assert.equal(post({ action: 'get', tab: 'App · Inbox', token: phone }).rows[0].rating, '4');
});

test('phone answers an open decision with one of its options, once', () => {
  const { post, phone, agent } = ready();
  post({ action: 'add', tab: 'App · Decisions', rows: [{ id: 'd1', question: 'Model?', options: 'Fast | Accurate', recommended: 'Accurate', status: 'open' }], token: agent });
  assert.equal(post({ action: 'add', tab: 'App · Decisions', rows: [{ question: 'x' }], token: phone }).error, 'forbidden');
  assert.equal(post({ action: 'update', tab: 'App · Decisions', id: 'd1', fields: { answer: 'Maybe' }, token: phone }).error, 'bad_answer');
  assert.equal(post({ action: 'update', tab: 'App · Decisions', id: 'd1', fields: { status: 'answered' }, token: phone }).error, 'forbidden_field');
  assert.equal(post({ action: 'update', tab: 'App · Decisions', id: 'd1', fields: { answer: 'Accurate' }, token: phone }).ok, true);
  const [d] = post({ action: 'get', tab: 'App · Decisions', token: phone }).rows;
  assert.equal(d.status, 'answered');
  assert.equal(d.answer, 'Accurate');
  assert.equal(post({ action: 'update', tab: 'App · Decisions', id: 'd1', fields: { answer: 'Fast' }, token: phone }).error, 'already_answered');
});

test('run now: phone only, needs the token, fires once per 10 minutes', () => {
  const env = ready();
  const { post, phone, agent, props, fired } = env;
  assert.equal(post({ action: 'runNow', token: agent }).error, 'forbidden');
  assert.equal(post({ action: 'runNow', token: phone }).error, 'no_run_token');
  props.set('RUN_TOKEN', 'sk-ant-oat01-test');
  const res = post({ action: 'runNow', token: phone });
  assert.deepEqual([res.ok, res.fired, res.runs_today], [true, true, 1]);
  assert.match(fired[0].url, /\/v1\/claude_code\/routines\/trig_\w+\/fire$/);
  assert.equal(fired[0].opts.headers.Authorization, 'Bearer sk-ant-oat01-test');
  assert.equal(post({ action: 'runNow', token: phone }).error, 'too_soon');
  assert.equal(fired.length, 1);
  assert.equal(post({ action: 'batch', calls: [{ action: 'runNow' }], token: phone }).results[0].error, 'batch_is_read_only');
});

test('run now reports Anthropic errors and does not count them', () => {
  const env = ready({ fireStatus: 429 });
  env.props.set('RUN_TOKEN', 'sk-ant-oat01-test');
  assert.equal(env.post({ action: 'runNow', token: env.phone }).error, 'fire_failed_429');
  assert.equal(env.props.get('RUN_COUNT'), undefined);
});


// ---- v3: saving to Sheet1 never leaves junk and never touches a filled cell ----

// His real sheet from 3 Nov: a dropdown on Location (copied onto new rows), his own 3/11/26 row
// with only date and hours, then later rows he typed himself.
function realisticSheet() {
  const sh = sampleSheet1();
  for (const r of [5, 6]) sh.cell(r, 2).rule = listRule(['Gym A', 'Gym B']);
  sh.cell(7, 1).v = '3/11/26';
  sh.cell(7, 3).v = 1;
  sh.cell(7, 2).rule = listRule(['Gym A', 'Gym B']);
  sh.cell(8, 1).v = '4/11/26';
  sh.cell(8, 3).v = 1;
  sh.cell(8, 4).v = 'his own tip';
  return sh;
}
const rowsOf = (sheet, from, to, width = 7) =>
  Array.from({ length: to - from + 1 }, (_, i) => sheet.getRange(from + i, 1, 1, width).getValues()[0]);

test('the old failure reproduced: a value the dropdown rejects used to leave a date-only row', () => {
  const env = ready({ sheet1: realisticSheet() });
  const { sheet1 } = env;
  // What v2 did: copy formats (and the dropdown) to a new row, write cell by cell, flush at the end.
  sheet1.getRange(6, 1, 1, 6).copyTo(sheet1.getRange(9, 1, 1, 6), 'PASTE_FORMAT');
  sheet1.getRange(9, 1).setValue('5/11/26');
  sheet1.getRange(9, 2).setValue('GB SG');
  sheet1.getRange(9, 4).setValue('a tip');
  assert.throws(() => sheet1.flush(), /violates the data validation rules/);
  assert.deepEqual(sheet1.getRange(9, 1, 1, 4).getValues()[0], ['5/11/26', '', '', '']);
});

test('fileSession fills his own row for that date: empty cells only, after his tips', () => {
  const { post, agent, sheet1 } = ready({ sheet1: realisticSheet() });
  const before = rowsOf(sheet1, 5, 8);
  const res = post({ action: 'fileSession', date: '2026-11-03', location: 'GB SG', hours: 1, cells: ['armbar to omoplata', 'curl the hamstring'], token: agent });
  assert.deepEqual(res, { ok: true, row: 7, merged: true });
  assert.deepEqual(sheet1.getRange(7, 1, 1, 6).getValues()[0], ['3/11/26', 'GB SG', 1, 'armbar to omoplata', 'curl the hamstring', '']);
  assert.deepEqual(sheet1.getRange(7, 2).getDataValidation().getCriteriaValues()[0], ['Gym A', 'Gym B', 'GB SG']);
  assert.equal(sheet1.getLastRow(), 8, 'no new row');
  assert.deepEqual(rowsOf(sheet1, 8, 8), before.slice(3));
  // A second clip for the same day lands after the first one's tips.
  post({ action: 'fileSession', date: '2026-11-03', location: 'GB SG', hours: 1, cells: ['third tip'], token: agent });
  assert.equal(sheet1.getRange(7, 6).getValue(), 'third tip');
  assert.equal(sheet1.getRange(7, 3).getValue(), 1, 'hours never doubled');
});

test('fileSession adds a new date in date order, past a dropdown that does not know the gym', () => {
  const { post, agent, sheet1 } = ready({ sheet1: realisticSheet() });
  const res = post({ action: 'fileSession', date: '2026-11-06', location: 'GB SG', hours: 1.5, cells: ['new tip'], token: agent });
  assert.deepEqual(res, { ok: true, row: 9, merged: false, inserted: false });
  assert.deepEqual(sheet1.getRange(9, 1, 1, 4).getValues()[0], ['6/11/26', 'GB SG', 1.5, 'new tip']);
  // An earlier date goes between his rows; the rows after it move down untouched.
  const later = rowsOf(sheet1, 7, 9);
  const mid = post({ action: 'fileSession', date: '2026-11-02', location: 'GB SG', hours: 1, cells: ['mid tip'], token: agent });
  assert.deepEqual(mid, { ok: true, row: 7, merged: false, inserted: true });
  assert.deepEqual(sheet1.getRange(7, 1, 1, 4).getValues()[0], ['2/11/26', 'GB SG', 1, 'mid tip']);
  assert.deepEqual(rowsOf(sheet1, 8, 10), later);
});

test('a failed write is rolled back: no junk row, no inserted row, a JSON error', () => {
  const env = ready({ sheet1: realisticSheet() });
  const { post, agent, sheet1, flushHooks } = env;
  const before = rowsOf(sheet1, 1, 9);
  flushHooks.failNext = true;
  const res = post({ action: 'fileSession', date: '2026-11-06', location: 'GB SG', hours: 1, cells: ['x'], token: agent });
  assert.equal(res.ok, false);
  assert.match(res.error, /^write_failed: Service error/);
  assert.deepEqual(rowsOf(sheet1, 1, 9), before);
  flushHooks.failNext = true;
  assert.match(post({ action: 'fileSession', date: '2026-11-02', cells: ['x'], token: agent }).error, /^write_failed/);
  assert.deepEqual(rowsOf(sheet1, 1, 9), before, 'the inserted row is gone again');
  assert.equal(sheet1.getLastRow(), 8);
});

test('fillCells writes only into empty cells of one row', () => {
  const { post, agent, sheet1 } = ready({ sheet1: realisticSheet() });
  assert.match(post({ action: 'fillCells', row: 8, col: 4, values: ['over his tip'], token: agent }).error, /^not_empty/);
  assert.equal(sheet1.getRange(8, 4).getValue(), 'his own tip');
  assert.deepEqual(post({ action: 'fillCells', row: 8, col: 2, values: ['GB SG'], token: agent }), { ok: true, row: 8, written: 1 });
  assert.equal(post({ action: 'fillCells', row: 3, col: 5, values: ['x'], token: agent }).error, 'bad_row');
  assert.deepEqual(post({ action: 'fillCells', row: 9, col: 1, values: ['2026-11-07', 'GB SG', 1, 'tip'], token: agent }).written, 4);
  assert.deepEqual(sheet1.getRange(9, 1, 1, 4).getValues()[0], ['7/11/26', 'GB SG', 1, 'tip']);
});

test('pruneRow removes only a row that holds nothing but the expected date', () => {
  const { post, agent, phone, sheet1 } = ready({ sheet1: realisticSheet() });
  sheet1.cell(9, 1).v = '3/11/26';
  sheet1.cell(10, 1).v = '3/11/26';
  assert.equal(post({ action: 'pruneRow', row: 7, expect: '3/11/26', token: agent }).error, 'not_date_only');
  assert.equal(post({ action: 'pruneRow', row: 9, expect: '4/11/26', token: agent }).error, 'changed');
  assert.equal(post({ action: 'pruneRow', row: 4, expect: 'Total:', token: agent }).error, 'bad_row');
  assert.equal(post({ action: 'pruneRow', row: 9, expect: '3/11/26', token: phone }).error, 'forbidden');
  assert.deepEqual(post({ action: 'pruneRow', row: 10, expect: '3/11/26', token: agent }), { ok: true, deleted: 10 });
  assert.deepEqual(post({ action: 'pruneRow', row: 9, expect: '3/11/26', token: agent }), { ok: true, deleted: 9 });
  assert.equal(sheet1.getLastRow(), 8);
  assert.equal(sheet1.getRange(7, 3).getValue(), 1, 'his 3/11/26 row with hours stays');
});

test('inspect shows formats and rules; phone cannot use any Sheet1 write', () => {
  const { post, agent, phone } = ready({ sheet1: realisticSheet() });
  const info = post({ action: 'inspect', row: 7, token: agent });
  assert.deepEqual(info.rules, [{ col: 2, type: 'VALUE_IN_LIST', values: [['Gym A', 'Gym B'], true], allow_invalid: false }]);
  for (const action of ['fileSession', 'fillCells', 'inspect']) {
    assert.equal(post({ action, row: 7, col: 4, values: ['x'], date: '2026-11-03', cells: ['x'], token: phone }).error, 'forbidden', action);
  }
});
