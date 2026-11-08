import test from 'node:test';
import assert from 'node:assert/strict';
import { ladder, spike, vdot, predict, trainingPaces, parseDistance, parseTime, clock, planWeek } from '../tools/coach.mjs';
import { assembleImages, coachContext, isoFromSheet } from '../tools/sheet.mjs';
import { imageBatches, fitWithin } from '../src/images.js';
import { weekOf, daysBetween, addDays, sessionDays, ladderState, paceText, profileMap, dayLabel } from '../src/training.js';

// Synthetic data only: this repo is public.

test('ladder: 10% steps from the start, rounded down', () => {
  assert.deepEqual(ladder(10, 5), [11, 12.1, 13.3, 14.6, 16.1]);
  const steps = ladder(5, 13);
  assert.equal(steps.length, 13);
  assert.equal(steps[10], 14.2);
  steps.forEach((km, i) => {
    assert.ok(km <= 5 * 1.1 ** (i + 1) + 1e-9, `step ${i + 1} within 10% compounded`);
    const prev = i ? steps[i - 1] : 5;
    assert.ok(km / prev <= 1.107, `step ${i + 1} is ${(km / prev).toFixed(3)} of the one before`);
  });
});

test('spike: compares with the longest run of the previous 30 days', () => {
  const runs = [
    { date: '2026-10-31', distance_km: '5.00' },
    { date: '2026-11-07', distance_km: '4.0' },
  ];
  const ok = spike(5.5, runs, '2026-11-15');
  assert.equal(ok.longest, 5);
  assert.equal(ok.longest_date, '2026-10-31');
  assert.equal(ok.ok, true);
  assert.equal(spike(6, runs, '2026-11-15').ok, false);
  assert.equal(spike(5.6, runs, '2026-11-15').ok, true, '0.1 km over is GPS noise');
  // A run on the day itself doesn't count as history, and old runs drop out after 30 days.
  assert.equal(spike(6, [{ date: '2026-11-15', distance_km: '9' }], '2026-11-15').ok, null);
  assert.equal(spike(4, runs, '2026-12-08').longest, 0);
});

test('VDOT matches Daniels table values', () => {
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  near(vdot(5000, parseTime('30:40')), 30, 0.1);
  near(vdot(5000, parseTime('19:57')), 50, 0.1);
  near(predict(30, 21097.5), parseTime('2:21:04'), 30);
  near(predict(50, 42195), parseTime('3:10:49'), 30);
  near(predict(50, 10000), parseTime('41:21'), 10);
  const p50 = trainingPaces(50).per_km;
  near(p50.threshold, parseTime('4:15'), 3);
  near(p50.interval, parseTime('3:55'), 3);
  const p40 = trainingPaces(40).per_km;
  near(p40.threshold, parseTime('5:06'), 3);
});

test('distance, time and clock parsing', () => {
  assert.equal(parseDistance('5k'), 5000);
  assert.equal(parseDistance('half'), 21097.5);
  assert.equal(parseDistance('4.3'), 4300);
  assert.equal(parseDistance('4.3km'), 4300);
  assert.equal(parseDistance('800m'), 800);
  assert.throws(() => parseDistance('far'), /bad distance/);
  assert.equal(parseTime('33:00'), 1980);
  assert.equal(parseTime('1:05:30'), 3930);
  assert.throws(() => parseTime('33'), /bad time/);
  assert.equal(clock(1980), '33:00');
  assert.equal(clock(9113), '2:31:53');
  assert.equal(clock(498.6), '8:19');
});

const plan = [
  { week: '1', start: '2026-11-09', block: 'Base', fri: 'Easy 4 km', sat: '4×800 m', sun: 'Long 5.5 km' },
  { week: '2', start: '2026-11-16', block: 'Base', fri: 'Easy 4 km', sat: '3 km tempo', sun: 'Long 6.0 km' },
];

test('planWeek and weekOf find the week and day of a date', () => {
  assert.deepEqual(planWeek(plan, '2026-11-14'), { week: '1', block: 'Base', day: 'Sat', session: '4×800 m' });
  assert.equal(planWeek(plan, '2026-11-10').session, 'rest or BJJ');
  assert.equal(planWeek(plan, '2026-11-16').week, '2');
  assert.equal(planWeek(plan, '2027-01-01'), null);
  assert.equal(weekOf(plan, '2026-11-15').week, '1');
  assert.equal(weekOf(plan, '2026-11-23'), null);
});

test('date helpers', () => {
  assert.equal(addDays('2026-11-09', 4), '2026-11-13');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-11-09', '2027-03-21'), 132);
  assert.equal(dayLabel('2026-11-14'), 'Sat 14 Nov');
  assert.equal(dayLabel('2027-03-21'), 'Sun 21 Mar');
  assert.equal(dayLabel(''), '');
  assert.equal(dayLabel('2026-10'), 'Oct 2026');
  assert.deepEqual(sessionDays(plan[0]).map((d) => [d.day, d.date, d.what]), [
    ['Fri', '2026-11-13', 'Easy 4 km'],
    ['Sat', '2026-11-14', '4×800 m'],
    ['Sun', '2026-11-15', 'Long 5.5 km'],
  ]);
});

test('ladder state line and profile cells', () => {
  const profile = profileMap([
    { id: 'race', value: '{"name":"Half","date":"2027-03-21"}' },
    { id: 'ladder', value: '{"steps":[5.5,6,6.6],"done":1,"spare_total":2,"spare_used":0}' },
    { id: 'guide', value: 'plain text' },
    { id: 'gone', value: 'x', hidden: 'yes' },
  ]);
  assert.equal(profile.race.date, '2027-03-21');
  assert.equal(profile.guide, 'plain text');
  assert.equal(profile.gone, undefined);
  assert.equal(ladderState(profile.ladder), 'Long run step 1 of 3 done, next 6 km. 2 spare weeks left.');
  assert.equal(ladderState({ steps: [5.5], done: 1, spare_total: 2, spare_used: 1 }), 'Long run step 1 of 1 done. 1 spare week left.');
  assert.equal(ladderState(null), '');
  assert.equal(paceText(498.6), '8:19/km');
});

test('screenshots: shrunk to fit, sliced per part, assembled back', () => {
  assert.deepEqual(fitWithin(1179, 2556), { w: 738, h: 1600 });
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 });
  const bytes = Buffer.from('x'.repeat(70000));
  const b64 = bytes.toString('base64');
  const batches = imageBatches('m1', 2, b64);
  const rows = batches.flat();
  assert.equal(rows.length, Math.ceil(b64.length / 30000));
  assert.deepEqual(Object.keys(rows[0]), ['id', 'coach_id', 'part', 'seq', 'total', 'mime', 'data']);
  assert.equal(rows[0].id, 'm1.2-1');
  const other = imageBatches('m1', 1, Buffer.from('first').toString('base64')).flat();
  const parts = assembleImages([...rows].reverse().concat(other), 'm1', 2);
  assert.deepEqual(parts.map((p) => p.part), [1, 2]);
  assert.deepEqual(parts[1].bytes, bytes);
  assert.equal(parts[0].bytes.toString(), 'first');
  assert.throws(() => assembleImages(other, 'm1', 2), /incomplete: 1\/2 screenshots/);
  assert.throws(() => assembleImages(rows.slice(1), 'm1', 1), /incomplete: \d+\/\d+ slices/);
});

test('coach context: parsed profile, recent runs, BJJ load from the sheet', () => {
  const ctx = coachContext(
    {
      profile: [{ id: 'race', value: '{"date":"2027-03-21"}', _row: 2 }, { id: 'style', value: 'short' }],
      plan,
      runs: Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, date: `2026-10-${String(10 + i).padStart(2, '0')}`, distance_km: '4' })),
      coach: [
        { created_at: '2026-11-01T00:00:00Z', kind: 'ask', text: 'q', status: 'answered', reply: 'a' },
        { created_at: '2026-11-02T00:00:00Z', kind: 'ask', text: 'new one', status: 'new', reply: '' },
      ],
      notes: { rows: [{ cells: ['20/10/26', 'Gym A', '1', 'tip'] }, { cells: ['5/11/26', 'Gym A', '1.5', 'tip'] }, { cells: ['bad', '', '', ''] }] },
    },
    '2026-11-09'
  );
  assert.deepEqual(ctx.profile, { race: { date: '2027-03-21' }, style: 'short' });
  assert.equal(ctx.recent_runs.length, 12);
  assert.equal(ctx.recent_runs.at(-1).id, 'r14');
  assert.deepEqual(ctx.recent_exchanges.map((e) => e.text), ['q']);
  assert.deepEqual(ctx.bjj_last_14_days, [{ date: '2026-11-05', hours: '1.5' }]);
  assert.equal(isoFromSheet('3/11/26'), '2026-11-03');
  assert.equal(isoFromSheet('Total:'), '');
});
