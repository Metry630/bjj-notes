// The week template, Today's slots, done checks and totals. Synthetic data only: this repo is public.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeek, clockOf, weekday, mondayOf, weekDates, slotsFor, doneFor, weekTotals, weekReview, captureDefaults } from '../src/week.js';
import { sessionDays, sessionOn, nextSession, weeklyKm } from '../src/training.js';
import { planWeek } from '../tools/coach.mjs';

const week = parseWeek({
  slots: [
    { day: 'mon', time: 'evening', activity: 'dance', what: 'Class', hours: 2, tags: 'salsa,class' },
    { day: 'tue', time: '19:30', activity: 'bjj', hours: 1 },
    { day: 'tue', time: '18:00', activity: 'lift', what: 'Squat', lifts: ['Squat'] },
    { day: 'wed', time: 'morning', activity: 'run', what: 'Easy run' },
    { day: 'fri', time: '17:00-18:15', activity: 'bjj', hours: 1.25, optional: true },
    { day: 'sat', time: '22:30', activity: 'dance', what: 'Social', tags: 'social', optional: true },
    { day: 'someday', activity: 'bjj' },
    { day: 'sun', activity: 'chess' },
  ],
  extra: [{ date: '2026-11-26', time: '20:00', activity: 'dance', what: 'Extra class', tags: 'bachata,class' }, { date: 'soon', activity: 'bjj' }],
});

// Weeks of 23 and 30 Nov 2026; the second has runs on Wed, Sat and Sun.
const plan = [
  { week: '3', start: '2026-11-23', block: 'Base', fri: 'Easy 4 km', fri_type: 'easy', sat: 'Fast km 6 km', sun: 'Long 8 km' },
  { week: '4', start: '2026-11-30', block: 'Base', wed: 'Easy 5 km', wed_type: 'easy,strides', sat: 'Rest', sun: 'Long 9 km' },
];

test('the week template keeps only valid slots; none at all is null', () => {
  assert.equal(week.slots.length, 6);
  assert.equal(week.extra.length, 1);
  assert.equal(parseWeek(null), null);
  assert.equal(parseWeek({ slots: [{ day: 'mon', activity: 'knitting' }] }), null);
});

test('times sort as clock times, words included', () => {
  assert.equal(clockOf('evening'), '19:00');
  assert.equal(clockOf('7pm'), '19:00');
  assert.equal(clockOf('7:30 am'), '07:30');
  assert.equal(clockOf('17:00-18:15'), '17:00');
  assert.equal(clockOf(''), '');
  assert.equal(weekday('2026-11-23'), 'mon');
  assert.equal(mondayOf('2026-11-26'), '2026-11-23');
  assert.deepEqual(weekDates('2026-11-29'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
});

test('slots for a day: template, one-offs, in time order', () => {
  assert.deepEqual(slotsFor(week, [], '2026-11-24').map((s) => [s.activity, s.clock]), [['lift', '18:00'], ['bjj', '19:30']]);
  assert.deepEqual(slotsFor(week, [], '2026-11-24')[0].lifts, ['Squat']);
  assert.deepEqual(slotsFor(week, [], '2026-11-26').map((s) => s.what), ['Extra class']);
  assert.deepEqual(slotsFor(week, [], '2026-12-03').map((s) => s.what), []);
  assert.equal(slotsFor(week, [], '2026-11-27')[0].optional, true);
  assert.deepEqual(slotsFor(null, [], '2026-11-24'), []);
});

test('the plan decides runs for the weeks it covers', () => {
  // Week 3: the old Friday run comes from the plan, the template's Wednesday run does not show.
  assert.deepEqual(slotsFor(week, plan, '2026-11-25').map((s) => s.activity), []);
  assert.equal(slotsFor(week, plan, '2026-11-27').find((s) => s.activity === 'run').what, 'Easy 4 km');
  // Week 4: Wednesday from the plan at the template's morning time; a rest day has no run.
  const wed = slotsFor(week, plan, '2026-12-02').find((s) => s.activity === 'run');
  assert.deepEqual([wed.what, wed.clock, wed.run.types], ['Easy 5 km', '07:00', ['easy', 'strides']]);
  assert.equal(slotsFor(week, plan, '2026-12-05').some((s) => s.activity === 'run'), false);
  // No plan for the week: the template's run shows.
  assert.equal(slotsFor(week, plan, '2026-12-09').find((s) => s.activity === 'run').what, 'Easy run');
});

test('run days can be any weekday, old Fri/Sat/Sun weeks still read', () => {
  assert.deepEqual(sessionDays(plan[1]).map((s) => [s.day, s.date]), [['Wed', '2026-12-02'], ['Sat', '2026-12-05'], ['Sun', '2026-12-06']]);
  assert.deepEqual(sessionDays(plan[0]).map((s) => s.day), ['Fri', 'Sat', 'Sun']);
  assert.equal(sessionOn(plan, '2026-12-02').what, 'Easy 5 km');
  assert.equal(sessionOn(plan, '2026-12-01'), null);
  assert.equal(nextSession(plan, '2026-11-30').date, '2026-12-02');
  assert.equal(nextSession(plan, '2026-12-03').date, '2026-12-06'); // Saturday is rest
  assert.equal(planWeek(plan, '2026-12-02').session, 'Easy 5 km');
  assert.equal(planWeek(plan, '2026-12-01').session, 'rest or BJJ');
});

const data = {
  notes: { rows: [
    { row: 5, cells: ['24/11/26', 'Gym A', '1', 'tip'] },
    { row: 6, cells: ['17/11/26', 'Gym A', '1.5', 'tip'] },
  ] },
  inbox: [
    { id: 'a', session_date: '2026-11-25', hours: '1', text: 'not filed yet', status: 'new' },
    { id: 'b', session_date: '2026-11-24', hours: '1', text: 'same day as the sheet row', status: 'processed' },
    { id: 'c', session_date: '2026-11-23', activity: 'dance', tags: 'salsa,class', hours: '2', status: 'processed' },
    { id: 'd', session_date: '2026-11-28', activity: 'dance', tags: 'social', hours: '2', status: 'new' },
    { id: 'e', session_date: '2026-11-29', activity: 'philosophy', tags: 'meetup', status: 'new' },
    { id: 'f', session_date: '2026-11-26', activity: 'dance', text: '[test voice note]', status: 'test' },
    { id: 'g', session_date: '2026-11-27', hours: '1', status: 'cancelled' },
  ],
  lifting: [{ id: 'l1', date: '2026-11-24', exercise: 'Squat', status: 'new' }, { id: 'l2', date: '2026-11-24', exercise: 'Squat', status: 'new' }],
  runs: [{ id: 'r1', date: '2026-11-28', distance_km: '6.1' }, { id: 'r2', date: '2026-11-29', distance_km: '8.4' }, { id: 'r0', date: '2026-11-16', distance_km: '8.2' }],
  coach: [{ id: 'c1', kind: 'run', run_date: '2026-11-27', status: 'new' }],
};

test('done checks per activity; tests and removed items never count', () => {
  const on = (activity, iso, extra = {}) => doneFor({ activity, tags: [], ...extra }, iso, data);
  assert.equal(on('bjj', '2026-11-24'), true); // sheet row
  assert.equal(on('bjj', '2026-11-25'), true); // saved, not filed yet
  assert.equal(on('bjj', '2026-11-27'), false); // removed
  assert.equal(on('lift', '2026-11-24'), true);
  assert.equal(on('run', '2026-11-28'), true); // logged run
  assert.equal(on('run', '2026-11-27'), true); // report sent, not logged yet
  assert.equal(on('dance', '2026-11-23'), true);
  assert.equal(on('dance', '2026-11-28'), false); // a social is not the class
  assert.equal(on('dance', '2026-11-28', { tags: ['social'] }), true);
  assert.equal(on('dance', '2026-11-26'), false); // test only
  assert.equal(on('philosophy', '2026-11-29'), true);
});

test('week totals and the Monday look back', () => {
  const t = weekTotals(data, '2026-11-23');
  assert.deepEqual(
    [t.bjjHours, t.bjjSessions, t.runKm, t.runs, t.longest, t.liftDays, t.danceHours, t.meetups],
    [2, 2, 14.5, 2, 8.4, 1, 4, 1]
  );
  const review = weekReview(data, '2026-11-30');
  assert.equal(review.monday, '2026-11-23');
  assert.ok(review.facts.includes('Longest run yet: 8.4 km'));
  const many = { ...data, notes: { rows: [...data.notes.rows, { row: 4, cells: ['1/1/25', 'Gym A', '48', 'old'] }] } };
  assert.ok(weekReview(many, '2026-11-30').facts.includes('Passed 50 BJJ hours'));
});

test('capture defaults come from today’s slot', () => {
  assert.equal(captureDefaults(week, '2026-11-27', 'bjj').hours, 1.25);
  assert.deepEqual(captureDefaults(week, '2026-11-23', 'dance').tags, ['salsa', 'class']);
  assert.deepEqual(captureDefaults(week, '2026-11-25', 'dance'), { hours: '', tags: [] });
});

test('weekly km for the progress chart', () => {
  const weeks = weeklyKm(data.runs, '2026-11-29', 3);
  assert.deepEqual(weeks.map((w) => [w.start, w.km, w.long]), [['2026-11-09', 0, 0], ['2026-11-16', 8.2, 8.2], ['2026-11-23', 14.5, 8.4]]);
});

import { coachContext } from '../tools/sheet.mjs';
test('coach context carries lifting and dance load for the last 14 days', () => {
  const c = coachContext({
    profile: [], plan: [], runs: [], coach: [], notes: { rows: [] },
    lifting: [{ date: '2026-11-24', exercise: 'Squat', weight_kg: '100', sets: '1', reps: '3', created_at: '2026-11-24T10:00:00Z' }, { date: '2026-10-01', exercise: 'Squat', created_at: 'x' }, { date: '2026-11-25', exercise: 'Bench press', status: 'cancelled' }],
    inbox: [{ session_date: '2026-11-23', activity: 'dance', hours: '3', tags: 'salsa,class', status: 'processed' }, { session_date: '2026-11-23', activity: 'dance', status: 'test' }, { session_date: '2026-11-24', hours: '1' }],
  }, '2026-11-26');
  assert.deepEqual(c.lifting_last_14_days.map((r) => [r.date, r.exercise, r.reps]), [['2026-11-24', 'Squat', '3']]);
  assert.deepEqual(c.dance_last_14_days, [{ date: '2026-11-23', hours: '3', tags: 'salsa,class' }]);
});
