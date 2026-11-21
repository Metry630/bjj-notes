// Code.gs v5: activities, marks, journal, his words write-once, history of every change, restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs } from './fake-gas.mjs';

function ready() {
  const env = loadCodeGs();
  env.api.setup();
  env.phone = env.props.get('PHONE_TOKEN');
  env.agent = env.props.get('AGENT_TOKEN');
  env.as = (token) => ({
    add: (tab, rows) => env.post({ action: 'add', tab, rows, token }),
    update: (tab, id, fields) => env.post({ action: 'update', tab, id, fields, token }),
    get: (tab) => env.post({ action: 'get', tab, token }).rows,
  });
  return env;
}

const history = (env) => env.as(env.agent).get('App · History');

test('ping tells the app which script version is live', () => {
  const env = ready();
  assert.deepEqual(env.post({ action: 'ping', token: env.phone }), { ok: true, role: 'phone', version: 5 });
  const reads = Array.from({ length: 40 }, () => ({ action: 'ping' }));
  assert.equal(env.post({ action: 'batch', calls: reads, token: env.phone }).results.length, 40);
  assert.equal(env.post({ action: 'batch', calls: [...reads, { action: 'ping' }], token: env.phone }).error, 'bad_calls');
});

test('setup makes the new tabs hidden, and an old Inbox gains the new columns', () => {
  const env = ready();
  for (const tab of ['App · Marks', 'App · Journal', 'App · History']) assert.equal(env.ss.getSheetByName(tab).hidden, true, tab);
  const header = env.ss.getSheetByName('App · Inbox').getRange(1, 1, 1, 20).getValues()[0];
  for (const col of ['method', 'rating', 'activity', 'tags', 'images']) assert.ok(header.includes(col), col);
});

test('inbox notes carry an activity and tags; no activity is still a BJJ note', () => {
  const { as, phone } = ready();
  const me = as(phone);
  assert.equal(me.add('App · Inbox', [{ id: 'b1', session_date: '2026-11-24', text: 'old style' }]).ok, true);
  assert.equal(me.add('App · Inbox', [{ id: 'd1', session_date: '2026-11-24', text: 'x', activity: 'dance', tags: 'salsa,bachata,class' }]).ok, true);
  assert.equal(me.add('App · Inbox', [{ text: 'x', activity: 'knitting' }]).error, 'bad_activity');
  assert.equal(me.add('App · Inbox', [{ text: 'x', tags: '<b>' }]).error, 'bad_tags');
  assert.equal(me.add('App · Inbox', [{ text: 'x', images: 9 }]).error, 'bad_images');
  const rows = me.get('App · Inbox');
  assert.equal(rows.find((r) => r.id === 'b1').activity, '');
  assert.equal(rows.find((r) => r.id === 'd1').tags, 'salsa,bachata,class');
});

test('questions carry an activity and a kind (a week change is kind week)', () => {
  const { as, phone } = ready();
  const me = as(phone);
  assert.equal(me.add('App · Questions', [{ question: 'my week', kind: 'week' }]).ok, true);
  assert.equal(me.add('App · Questions', [{ question: 'what is presence', activity: 'philosophy' }]).ok, true);
  assert.equal(me.add('App · Questions', [{ question: 'x', kind: 'gossip' }]).error, 'bad_kind');
  assert.equal(me.add('App · Questions', [{ question: 'x', activity: 'chess' }]).error, 'bad_activity');
});

test('a lift set can carry how it felt', () => {
  const { as, phone } = ready();
  const me = as(phone);
  const set = { id: 's1', date: '2026-11-24', exercise: 'Squat', weight_kg: 140, sets: 1, reps: 3 };
  assert.equal(me.add('App · Lifting', [set]).ok, true);
  assert.equal(me.update('App · Lifting', 's1', { effort: 'hard' }).ok, true);
  assert.equal(me.add('App · Lifting', [{ ...set, id: 's2', effort: 'meh' }]).error, 'bad_effort');
  assert.equal(me.get('App · Lifting')[0].effort, 'hard');
});

test('marks: the phone appends, never edits; bad ones are refused', () => {
  const { as, phone } = ready();
  const me = as(phone);
  assert.equal(me.add('App · Marks', [{ id: 'm1', target: 'topic:dance-sombrero', field: 'level', value: 'learning' }]).ok, true);
  assert.equal(me.update('App · Marks', 'm1', { value: 'got it' }).error, 'append_only');
  assert.equal(me.add('App · Marks', [{ target: '', field: 'level', value: 'x' }]).error, 'bad_target');
  assert.equal(me.add('App · Marks', [{ target: 't', field: 'Level!', value: 'x' }]).error, 'bad_field');
  assert.equal(me.add('App · Marks', [{ target: 't', field: 'level', value: 'x'.repeat(501) }]).error, 'bad_value');
});

test('journal is the routine’s: the phone reads it, cannot write it', () => {
  const { as, phone, agent } = ready();
  assert.equal(as(phone).add('App · Journal', [{ text: 'x' }]).error, 'forbidden');
  const tip = { id: 'd1-1', session_date: '2026-11-24', activity: 'dance', topic: 'cross body lead', text: 'his words', source_id: 'd1', seq: 1 };
  assert.equal(as(agent).add('App · Journal', [tip]).ok, true);
  assert.equal(as(agent).add('App · Journal', [tip]).added[0].duplicate, true); // a re-run never files twice
  assert.equal(as(phone).get('App · Journal')[0].topic, 'cross body lead');
});

test('his words are write-once for the routine: it can fill, never change', () => {
  const { as, phone, agent } = ready();
  as(phone).add('App · Inbox', [{ id: 'r1', session_date: '2026-11-24', text: '', method: 'recording' }]);
  as(phone).add('App · Inbox', [{ id: 't1', session_date: '2026-11-24', text: 'typed note' }]);
  const bot = as(agent);
  assert.equal(bot.update('App · Inbox', 'r1', { text: 'the transcript' }).ok, true); // empty: fill is fine
  assert.equal(bot.update('App · Inbox', 'r1', { text: 'a rewrite' }).error, 'protected_field: text');
  assert.equal(bot.update('App · Inbox', 't1', { hours: 2 }).ok, true); // was empty
  assert.equal(bot.update('App · Inbox', 't1', { session_date: '2026-11-25' }).error, 'protected_field: session_date');
  assert.equal(bot.update('App · Inbox', 't1', { text: 'typed note', status: 'processed', agent_note: 'filed' }).ok, true); // same value again is fine
  bot.add('App · Journal', [{ id: 'j1', activity: 'philosophy', topic: 'presence', text: 'his words' }]);
  assert.equal(bot.update('App · Journal', 'j1', { text: 'better words' }).error, 'protected_field: text');
  assert.equal(bot.update('App · Journal', 'j1', { hidden: 'yes' }).ok, true); // correcting = hide and add a new row
  as(phone).add('App · Lifting', [{ id: 's1', date: '2026-11-24', exercise: 'Squat', weight_kg: 140, sets: 1, reps: 3 }]);
  assert.equal(bot.update('App · Lifting', 's1', { weight_kg: 150 }).error, 'protected_field: weight_kg');
  as(phone).add('App · Marks', [{ id: 'm1', target: 't', field: 'level', value: 'learning' }]);
  assert.equal(bot.update('App · Marks', 'm1', { value: 'got it' }).error, 'protected_field: value');
  as(phone).add('App · Feedback', [{ id: 'f1', text: 'make it nicer' }]);
  assert.equal(bot.update('App · Feedback', 'f1', { reply: 'Next run builds it.', status: 'read' }).ok, true);
  assert.equal(bot.update('App · Feedback', 'f1', { text: 'x' }).error, 'protected_field: text');
});

test('every change to a filled cell is copied to App · History first; fills and upload slices are not', () => {
  const env = ready();
  const { as, phone, agent } = env;
  as(phone).add('App · Inbox', [{ id: 'n1', session_date: '2026-11-24', text: '' , method: 'recording' }]);
  as(agent).update('App · Inbox', 'n1', { text: 'transcript', agent_note: 'first try' });
  assert.equal(history(env).length, 0); // both were empty: a fill loses nothing
  as(agent).update('App · Inbox', 'n1', { agent_note: 'second try', status: 'processed' });
  const rows = history(env);
  assert.equal(rows.length, 2);
  const note = rows.find((r) => r.field === 'agent_note');
  assert.deepEqual([note.tab, note.row_id, note.old, note.new, note.role], ['App · Inbox', 'n1', 'first try', 'second try', 'agent']);
  assert.ok(rows.some((r) => r.field === 'status' && r.old === 'new' && r.new === 'processed'));
  const h0 = rows[0];
  as(phone).add('App · Audio', [{ id: 'n1-1', inbox_id: 'n1', seq: 1, total: 1, mime: 'audio/mp4', data: 'QUJD' }]);
  const before = history(env).length;
  as(agent).update('App · Audio', 'n1-1', { data: '', status: 'done' });
  assert.equal(history(env).length, before);
  assert.equal(as(agent).add('App · History', [{ old: 'x' }]).error, 'forbidden');
  assert.equal(as(agent).update('App · History', h0.id, { old: 'y' }).error, 'forbidden');
  assert.equal(as(phone).add('App · History', [{ old: 'x' }]).error, 'forbidden');
});

test('restore: the phone can bring back an item it removed, nothing else', () => {
  const { as, phone, agent } = ready();
  const me = as(phone);
  me.add('App · Lifting', [{ id: 's1', date: '2026-11-24', exercise: 'Squat', weight_kg: 140, sets: 1, reps: 3 }]);
  assert.equal(me.update('App · Lifting', 's1', { status: 'cancelled' }).ok, true);
  assert.equal(me.update('App · Lifting', 's1', { status: 'new' }).ok, true);
  assert.equal(me.get('App · Lifting')[0].status, 'new');
  me.add('App · Questions', [{ id: 'q1', question: 'x' }]);
  as(agent).update('App · Questions', 'q1', { status: 'answered', answer: 'y' });
  assert.equal(me.update('App · Questions', 'q1', { status: 'new' }).error, 'already_processed');
  assert.equal(me.update('App · Lifting', 's1', { status: 'processed' }).error, 'forbidden_status');
});

test('images belong to a coach message or a note, exactly one', () => {
  const { as, phone } = ready();
  const me = as(phone);
  const img = { part: 1, seq: 1, total: 1, mime: 'image/jpeg', data: 'QUJD' };
  assert.equal(me.add('App · Images', [{ ...img, coach_id: 'c1' }]).ok, true);
  assert.equal(me.add('App · Images', [{ ...img, inbox_id: 'n1' }]).ok, true);
  assert.equal(me.add('App · Images', [{ ...img, coach_id: 'c1', inbox_id: 'n1' }]).error, 'bad_image');
  assert.equal(me.add('App · Images', [img]).error, 'bad_image');
});

test('0.12 dance cues still save', () => {
  const { as, phone } = ready();
  assert.equal(as(phone).add('App · Dance', [{ move: 'Turn', cue: 'prep on 8' }]).ok, true);
});
