// Lifting: one row per set, several weights a day, suggestions from how it felt, personal bests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, info, setsOf, sessions, collapse, line, e1rm, mainSet, suggestNext, bests, prFor, series, groupByDate, validEntry, exerciseNames } from '../src/lifting.js';
import { loadCodeGs } from './fake-gas.mjs';

const at = (d, m) => `${d}T10:${String(m).padStart(2, '0')}:00Z`;
const set = (id, date, m, exercise, w, r, extra = {}) => ({ id, created_at: at(date, m), date, exercise, weight_kg: String(w), sets: '1', reps: String(r), ...extra });

// Several weights for one lift on one day: triples, then a heavy single.
const rows = [
  set('a1', '2026-11-17', 1, 'Squat', 60, 5),
  set('a2', '2026-11-17', 5, 'Squat', 100, 3),
  set('a3', '2026-11-17', 9, 'Squat', 100, 3),
  set('a4', '2026-11-17', 13, 'Squat', 100, 3, { effort: 'ok' }),
  set('a5', '2026-11-17', 20, 'Squat', 115, 1, { effort: 'max' }),
  { id: 'old', created_at: at('2026-11-10', 1), date: '2026-11-10', exercise: 'Squat', weight_kg: '97.5', sets: '3', reps: '3' }, // first Lift screen: 3 sets in one row
  set('p1', '2026-11-19', 1, 'Pull ups', 0, 8),
  set('p2', '2026-11-19', 3, 'Pull ups', 0, 8, { effort: 'hard' }),
  set('x', '2026-11-18', 1, 'Squat', 200, 1, { status: 'cancelled' }),
];

test('several weights on one day are just several sets', () => {
  const [last, before] = sessions(rows, 'Squat');
  assert.equal(last.date, '2026-11-17');
  assert.deepEqual(last.sets.map((s) => [s.w, s.r]), [[60, 5], [100, 3], [100, 3], [100, 3], [115, 1]]);
  assert.equal(line(last.sets), '1 × 5 @ 60, 3 × 3 @ 100, 1 × 1 @ 115');
  assert.equal(before.sets.length, 3); // a 3-set row counts as three sets
  assert.equal(line(sessions(rows, 'Pull ups')[0].sets, true), '2 × 8');
  assert.equal(line([{ w: 10, r: 5 }], true), '1 × 5 @ +10');
  assert.deepEqual(collapse(last.sets).map((g) => g.n), [1, 3, 1]);
  assert.equal(setsOf(rows, 'Squat').some((s) => s.w === 200), false); // removed
});

test('estimated 1RM: Epley, a single is itself, high reps are not estimated', () => {
  assert.equal(e1rm(100, 3), 110);
  assert.equal(e1rm(115, 1), 115);
  assert.equal(e1rm(60, 12), 0);
  assert.equal(e1rm(0, 5), 0);
});

test('the main set is the repeated work set, not the test single', () => {
  assert.deepEqual(mainSet(sessions(rows, 'Squat')[0].sets), { w: 100, r: 3, n: 3, efforts: ['ok'] });
  assert.equal(mainSet([{ w: 110, r: 1 }, { w: 120, r: 1 }]).w, 120);
});

test('next time: one step up after easy or ok, same again after hard or max, a rep for bodyweight', () => {
  const s = suggestNext(rows, 'Squat');
  assert.deepEqual([s.weight_kg, s.reps, s.sets], [102.5, 3, 3]);
  assert.match(s.why, /felt ok/);
  const hard = suggestNext([...rows, set('a6', '2026-11-24', 1, 'Squat', 102.5, 3, { effort: 'hard' })], 'Squat');
  assert.deepEqual([hard.weight_kg, hard.reps], [102.5, 3]);
  const p = suggestNext(rows, 'Pull ups');
  assert.deepEqual([p.weight_kg, p.reps], [0, 8]); // felt hard: same again
  const fresh = suggestNext([set('q', '2026-11-20', 1, 'Pull ups', 0, 6)], 'Pull ups');
  assert.equal(fresh.reps, 7);
  assert.equal(suggestNext(rows, 'Deadlift'), null);
  assert.equal(info('Deadlift').step, 5);
  assert.equal(info('Weighted dips').bodyweight, true);
});

test('personal bests and PR badges', () => {
  const all = setsOf(rows, 'Squat');
  const b = bests(all);
  assert.deepEqual([b.e1rm.value, b.heaviest[1].w, b.heaviest[3].w, b.heaviest[5].w], [115, 115, 100, 60]);
  const earlier = all.filter((s) => s.date < '2026-11-17');
  assert.deepEqual(prFor({ w: 100, r: 3 }, earlier), ['best estimated 1RM', 'heaviest for 1+', 'heaviest for 3+']);
  assert.deepEqual(prFor({ w: 90, r: 3 }, all), []);
  assert.deepEqual(prFor({ w: 100, r: 3 }, []), []); // a first session is not a PR parade
});

test('progress series: best e1RM per session (weighted), best reps (bodyweight)', () => {
  assert.deepEqual(series(rows, 'Squat').map((p) => [p.date, p.value]), [['2026-11-10', 107.3], ['2026-11-17', 115]]);
  assert.deepEqual(series(rows, 'Pull ups').map((p) => p.value), [8]);
});

test('history by day and the exercise list', () => {
  assert.deepEqual(groupByDate(rows).map((g) => g.date), ['2026-11-19', '2026-11-17', '2026-11-10']);
  assert.deepEqual(exerciseNames(rows).slice(0, 2), ['Pull ups', 'Squat']);
  assert.ok(exerciseNames([]).includes('Bench press'));
  assert.ok(EXERCISES.some((e) => e.name === 'Bench press'));
});

test('entry checks', () => {
  assert.equal(validEntry({ exercise: 'Squat', weight_kg: '100', reps: '3' }), '');
  assert.equal(validEntry({ exercise: 'Curl', weight_kg: '', reps: '10' }), ''); // any name now
  assert.notEqual(validEntry({ exercise: '', reps: '1' }), '');
  assert.notEqual(validEntry({ exercise: 'Squat', weight_kg: '900', reps: '1' }), '');
  assert.notEqual(validEntry({ exercise: 'Squat', reps: '0' }), '');
});

test('Code.gs: phone can add a lift, bad ones are refused', () => {
  const env = loadCodeGs();
  env.api.setup();
  const phone = env.props.get('PHONE_TOKEN');
  const add = (row) => env.post({ action: 'add', tab: 'App · Lifting', rows: [row], token: phone });
  const ok = { date: '2026-01-01', exercise: 'Squat', weight_kg: 60, sets: 1, reps: 5 };
  assert.equal(add(ok).ok, true);
  // v5: any exercise name, so a new lift needs no script paste; empty or very long ones are refused.
  assert.equal(add({ ...ok, exercise: 'Curl' }).ok, true);
  assert.equal(add({ ...ok, exercise: ' ' }).error, 'bad_exercise');
  assert.equal(add({ ...ok, exercise: 'x'.repeat(41) }).error, 'bad_exercise');
  assert.equal(add({ ...ok, date: 'x' }).error, 'bad_date');
  assert.equal(add({ ...ok, reps: 0 }).error, 'bad_reps');
  assert.equal(add({ ...ok, weight_kg: 900 }).error, 'bad_weight');
});
