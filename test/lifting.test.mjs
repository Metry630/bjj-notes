import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByDate, suggestNext, validEntry, summary } from '../src/lifting.js';
import { loadCodeGs } from './fake-gas.mjs';

const rows = [
  { id: 'a', created_at: '2026-01-01T01:00:00Z', date: '2026-01-01', exercise: 'Squat', weight_kg: '60', sets: '5', reps: '5' },
  { id: 'b', created_at: '2026-01-01T01:05:00Z', date: '2026-01-01', exercise: 'Pull ups', weight_kg: '0', sets: '3', reps: '6' },
  { id: 'c', created_at: '2026-01-08T01:00:00Z', date: '2026-01-08', exercise: 'Squat', weight_kg: '65', sets: '5', reps: '5' },
  { id: 'd', created_at: '2026-01-09T01:00:00Z', date: '2026-01-09', exercise: 'Squat', weight_kg: '99', sets: '1', reps: '1', status: 'cancelled' },
];

test('history groups by day, newest first, skips cancelled', () => {
  const g = groupByDate(rows);
  assert.deepEqual(g.map((x) => x.date), ['2026-01-08', '2026-01-01']);
  assert.deepEqual(g[1].items.map((r) => r.id), ['a', 'b']);
});

test('next session: weighted adds one step, bodyweight adds a rep, no history is null', () => {
  assert.equal(suggestNext(rows, 'Squat').weight_kg, 70);
  assert.equal(suggestNext(rows, 'Squat').reps, 5);
  const p = suggestNext(rows, 'Pull ups');
  assert.deepEqual([p.weight_kg, p.sets, p.reps], [0, 3, 7]);
  assert.equal(suggestNext(rows, 'Deadlift'), null);
});

test('entry checks and summary line', () => {
  assert.equal(validEntry({ exercise: 'Squat', weight_kg: '60', sets: '5', reps: '5' }), '');
  assert.equal(validEntry({ exercise: 'Squat', weight_kg: '', sets: '5', reps: '5' }), '');
  assert.notEqual(validEntry({ exercise: 'Curl', sets: '1', reps: '1' }), '');
  assert.notEqual(validEntry({ exercise: 'Squat', sets: '0', reps: '1' }), '');
  assert.equal(summary(rows[0]), 'Squat: 5 x 5 @ 60 kg');
  assert.equal(summary(rows[1]), 'Pull ups: 3 x 6');
});

test('Code.gs: phone can add a lift, bad ones are refused', () => {
  const env = loadCodeGs();
  env.api.setup();
  const phone = env.props.get('PHONE_TOKEN');
  const add = (row) => env.post({ action: 'add', tab: 'App · Lifting', rows: [row], token: phone });
  const ok = { date: '2026-01-01', exercise: 'Squat', weight_kg: 60, sets: 5, reps: 5 };
  assert.equal(add(ok).ok, true);
  assert.equal(add({ ...ok, exercise: 'Curl' }).error, 'bad_exercise');
  assert.equal(add({ ...ok, date: 'x' }).error, 'bad_date');
  assert.equal(add({ ...ok, reps: 0 }).error, 'bad_reps');
  assert.equal(add({ ...ok, weight_kg: 900 }).error, 'bad_weight');
});
