import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs, sampleSheet1 } from './fake-gas.mjs';

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
  assert.deepEqual(res, { ok: true, row: 7 });
  assert.equal(snapshot(sheet1, 6), before);
  assert.deepEqual(sheet1.getRange(7, 1, 1, 6).getValues()[0], ['31/10/26', 'Gym B', 1.5, "'=not a formula", 'second tip', '']);
  assert.equal(sheet1.peek(7, 1).fmt, '@');
  assert.equal(sheet1.peek(7, 4).fmt, '@');
});

test('appendSession writes a day serial in the copied date format when dates are real dates', () => {
  const { post, agent, sheet1 } = ready({ sheet1: sampleSheet1({ dates: 'date' }) });
  sheet1.cell(6, 1).fmt = 'd/m/yy';
  post({ action: 'appendSession', date: '2024-10-27', location: 'Gym B', hours: 1, cells: ['x'], token: agent });
  assert.equal(sheet1.getRange(7, 1).getValue(), 45592); // 27 Oct 2024 as a Sheets serial
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
