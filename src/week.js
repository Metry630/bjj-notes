// His week: what is on a date, what he has already done, and the week's totals. Pure functions.
//
// The template is the App · Profile row `week`, written by the routine from his own words:
//   { slots: [{ day: 'mon', time: '19:00' | 'evening', activity, what, hours, tags, lifts, optional }],
//     extra: [{ date: 'YYYY-MM-DD', ...same }] }   (extra = one-offs on a date)
// Runs come from the plan (App · Plan) whenever the plan covers that week.
import { addDays, sessionOn, weekOf } from './training.js';
import { sheetDateToISO } from './dates.js';
import { live, isBjj, tagList, num } from './util.js';

export const ACTIVITIES = ['bjj', 'run', 'lift', 'dance', 'philosophy'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WORD_TIMES = { morning: '07:00', am: '07:00', noon: '12:00', afternoon: '14:00', evening: '19:00', pm: '19:00', night: '21:00' };

export const weekday = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
export const weekDates = (iso) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(iso), i));

// "19:00", "7pm", "17:00-18:15", "evening" -> "HH:MM" (sortable); unknown -> "".
export function clockOf(t) {
  const s = String(t ?? '').trim().toLowerCase();
  if (WORD_TIMES[s]) return WORD_TIMES[s];
  let m = /^(\d{1,2})[:.](\d{2})(\s*-.*)?$/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/.exec(s);
  if (m) {
    const hr = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0);
    return `${String(hr).padStart(2, '0')}:${m[2] || '00'}`;
  }
  return '';
}

const okSlot = (x) => !!x && typeof x === 'object' && ACTIVITIES.includes(x.activity);

// The template from App · Profile (profileMap has parsed the JSON), checked. null when none is set.
export function parseWeek(value) {
  if (!value || typeof value !== 'object') return null;
  const slots = (Array.isArray(value.slots) ? value.slots : []).filter((x) => okSlot(x) && WEEKDAYS.includes(x.day));
  const extra = (Array.isArray(value.extra) ? value.extra : []).filter((x) => okSlot(x) && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)));
  return slots.length || extra.length ? { slots, extra, updated: String(value.updated || '') } : null;
}

const asSlot = (x, iso, i) => ({
  key: `${iso}:${x.activity}:${i}`,
  activity: x.activity,
  what: String(x.what || ''),
  time: String(x.time || ''),
  clock: clockOf(x.time),
  hours: x.hours == null || x.hours === '' ? '' : num(x.hours),
  tags: tagList(Array.isArray(x.tags) ? x.tags.join(',') : x.tags),
  lifts: Array.isArray(x.lifts) ? x.lifts.map(String).filter(Boolean) : [],
  optional: !!x.optional,
  run: null,
});

// Everything on one date, in time order (slots without a time go last).
export function slotsFor(week, plan, iso) {
  const day = weekday(iso);
  const tmpl = week ? week.slots.filter((x) => x.day === day) : [];
  const extra = week ? week.extra.filter((x) => x.date === iso) : [];
  const planned = !!weekOf(plan || [], iso);
  let out = [...tmpl, ...extra].map((x, i) => asSlot(x, iso, i));
  if (planned) {
    // The plan decides the runs for any week it covers (it moves with the coach's changes).
    const runAt = out.find((x) => x.activity === 'run');
    out = out.filter((x) => x.activity !== 'run');
    const s = sessionOn(plan, iso);
    if (s && !/^rest/i.test(String(s.what || ''))) {
      out.push({ ...asSlot({ activity: 'run', what: s.what, time: runAt?.time || 'morning' }, iso, 'plan'), run: s });
    }
  }
  return out.sort((a, b) => (a.clock || '99').localeCompare(b.clock || '99'));
}

const counts = (r) => live(r) && r.status !== 'test';
const isSocial = (tags) => tagList(Array.isArray(tags) ? tags.join(',') : tags).includes('social');

function bjjRowsOn(data, iso) {
  return (data.notes?.rows ?? []).filter((r) => sheetDateToISO(r.cells?.[0]) === iso);
}

// Has he logged this slot? data: { notes, inbox, lifting, runs, coach }.
export function doneFor(slot, iso, data) {
  const inbox = (data.inbox || []).filter((r) => counts(r) && r.session_date === iso);
  switch (slot.activity) {
    case 'bjj':
      return bjjRowsOn(data, iso).length > 0 || inbox.some((r) => isBjj(r.activity));
    case 'run':
      return (data.runs || []).some((r) => !r.hidden && r.date === iso) || (data.coach || []).some((r) => counts(r) && r.kind === 'run' && r.run_date === iso);
    case 'lift':
      return (data.lifting || []).some((r) => counts(r) && r.date === iso);
    case 'dance':
      return inbox.some((r) => r.activity === 'dance' && isSocial(r.tags) === isSocial(slot.tags));
    case 'philosophy':
      return inbox.some((r) => r.activity === 'philosophy');
    default:
      return false;
  }
}

const round1 = (x) => Math.round(x * 10) / 10;

// Totals for the week that starts on `mondayIso`.
export function weekTotals(data, mondayIso) {
  const dates = new Set(weekDates(mondayIso));
  const bjj = new Map();
  for (const r of data.notes?.rows ?? []) {
    const iso = sheetDateToISO(r.cells?.[0]);
    if (dates.has(iso)) bjj.set(iso, (bjj.get(iso) || 0) + (parseFloat(r.cells[2]) || 0));
  }
  const dance = new Map();
  const meetups = new Set();
  for (const r of data.inbox || []) {
    if (!counts(r) || !dates.has(r.session_date)) continue;
    if (isBjj(r.activity) && !bjj.has(r.session_date)) bjj.set(r.session_date, num(r.hours));
    if (r.activity === 'dance') {
      const k = `${r.session_date}:${isSocial(r.tags)}`;
      dance.set(k, Math.max(dance.get(k) || 0, num(r.hours)));
    }
    if (r.activity === 'philosophy' && (!r.tags || tagList(r.tags).includes('meetup'))) meetups.add(r.session_date);
  }
  const runs = (data.runs || []).filter((r) => !r.hidden && dates.has(String(r.date)));
  const liftDays = new Set((data.lifting || []).filter((r) => counts(r) && dates.has(r.date)).map((r) => r.date));
  return {
    bjjHours: round1([...bjj.values()].reduce((a, b) => a + b, 0)),
    bjjSessions: bjj.size,
    runKm: round1(runs.reduce((a, r) => a + num(r.distance_km), 0)),
    runs: runs.length,
    longest: runs.reduce((a, r) => Math.max(a, num(r.distance_km)), 0),
    liftDays: liftDays.size,
    danceHours: round1([...dance.values()].reduce((a, b) => a + b, 0)),
    meetups: meetups.size,
  };
}

// Monday's look back at last week: totals plus a few facts worth a smile.
export function weekReview(data, todayIso) {
  const monday = addDays(mondayOf(todayIso), -7);
  const t = weekTotals(data, monday);
  const facts = [];
  const before = (data.runs || []).filter((r) => !r.hidden && String(r.date) < monday).reduce((a, r) => Math.max(a, num(r.distance_km)), 0);
  if (t.longest > 0 && t.longest > before) facts.push(`Longest run yet: ${t.longest} km`);
  const totalBjj = (data.notes?.rows ?? []).reduce((a, r) => a + (parseFloat(r.cells?.[2]) || 0), 0);
  const fromSheet = [...(data.notes?.rows ?? [])].filter((r) => {
    const iso = sheetDateToISO(r.cells?.[0]);
    return iso >= monday && iso <= addDays(monday, 6);
  }).reduce((a, r) => a + (parseFloat(r.cells?.[2]) || 0), 0);
  const was = totalBjj - fromSheet;
  if (Math.floor(was / 50) < Math.floor(totalBjj / 50)) facts.push(`Passed ${Math.floor(totalBjj / 50) * 50} BJJ hours`);
  return { monday, totals: t, facts };
}

// Defaults for a capture today: hours and tags from the first slot of that activity.
export function captureDefaults(week, iso, activity) {
  const s = slotsFor(week, [], iso).find((x) => x.activity === activity);
  return s ? { hours: s.hours, tags: s.tags } : { hours: '', tags: [] };
}
