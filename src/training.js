// Running plan helpers for the Run tab. The plan, the ladder and the guide are written into the
// sheet by the coach (the routine); this only works out what to show for today.

const DAY = 864e5;

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// The App · Plan row (one per calendar week, `start` = its Monday) that holds this date.
export function weekOf(plan, iso) {
  return plan.find((w) => w.start && w.start <= iso && iso < addDays(w.start, 7)) || null;
}

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The week's runs with their dates and run types (wed_type etc., keys of the profile's run_types;
// several joined by commas, e.g. "easy,strides"). Any weekday can be a run day: a day counts when
// the plan row has a session or a type for it. Weeks written before Nov 2026 use fri, sat and sun.
export function sessionDays(week) {
  return DAY_KEYS.map((d, i) => ({
    day: DAY_NAMES[i],
    key: d,
    date: addDays(week.start, i),
    what: week[d],
    types: String(week[`${d}_type`] || '').split(',').map((t) => t.trim()).filter(Boolean),
  })).filter((s) => String(s.what ?? '').trim() || s.types.length);
}

// The plan's session on one date, or null (no plan for that week, or no run that day).
export function sessionOn(plan, iso) {
  const week = weekOf(plan, iso);
  return week ? sessionDays(week).find((s) => s.date === iso) || null : null;
}

// The first planned run on or after `iso` (today's if there is one), with its week.
export function nextSession(plan, iso) {
  const all = [...plan]
    .filter((w) => w.start)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .flatMap((w) => sessionDays(w).map((s) => ({ ...s, week: w })));
  return all.find((s) => s.date >= iso && !/^rest/i.test(String(s.what || ''))) || null;
}

const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

// Distance per calendar week (Monday start), oldest first, the last `weeks` weeks up to `todayIso`.
export function weeklyKm(runs, todayIso, weeks = 12) {
  const end = mondayOf(todayIso);
  const out = Array.from({ length: weeks }, (_, i) => ({ start: addDays(end, -7 * (weeks - 1 - i)), km: 0, long: 0 }));
  for (const r of runs) {
    if (!r || r.hidden || !r.date) continue;
    const slot = out.find((w) => w.start === mondayOf(String(r.date)));
    if (!slot) continue;
    const km = Number(r.distance_km) || 0;
    slot.km = Math.round((slot.km + km) * 10) / 10;
    slot.long = Math.max(slot.long, km);
  }
  return out;
}

// profile.run_types, [{ key, name, pace, feel, how }], keyed by `key`. The paces live only here,
// so recalibrating them after a time trial updates every session in the app at once.
export function runTypes(list) {
  return Object.fromEntries((Array.isArray(list) ? list : []).filter((t) => t && t.key).map((t) => [t.key, t]));
}

// App · Profile rows -> { id: value }, JSON values parsed (race, ladder), hidden rows dropped.
export function profileMap(rows) {
  const out = {};
  for (const r of rows) {
    if (r.hidden) continue;
    try {
      out[r.id] = JSON.parse(r.value);
    } catch {
      out[r.id] = r.value;
    }
  }
  return out;
}

// The paces to show for one session: its own type's, plus the easy pace when the session has easy
// km in it ("1 easy + 3 tempo + 1 easy"). One pace alone is shown bare; several get names.
export function sessionPaces(s, types) {
  const out = [];
  for (const k of s.types) if (types[k]?.pace) out.push({ name: types[k].name, pace: types[k].pace });
  const easy = types.easy;
  if (easy?.pace && /\beasy\b/i.test(s.what || '') && !s.types.some((k) => k === 'easy' || k === 'long')) {
    out.push({ name: 'Easy km', pace: easy.pace });
  }
  return out;
}

export function paceSummary(list) {
  if (list.length === 1) return list[0].pace;
  return list.map((p) => `${p.name} ${p.pace}`).join(' · ');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "Long run step 3 of 13 done, next 7.3 km. 2 spare weeks left."
export function ladderState(l) {
  if (!l || !Array.isArray(l.steps) || !l.steps.length) return '';
  const done = Number(l.done) || 0;
  const next = l.steps[done];
  const spare = Math.max(0, (Number(l.spare_total) || 0) - (Number(l.spare_used) || 0));
  return `Long run step ${done} of ${l.steps.length} done${next ? `, next ${next} km` : ''}. ${plural(spare, 'spare week')} left.`;
}

export function paceText(secPerKm) {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-14" -> "Sat 14 Nov", "2026-10" (day not recorded) -> "Oct 2026". Built by hand:
// browsers disagree on commas.
export function dayLabel(iso) {
  const month = /^(\d{4})-(\d{2})$/.exec(String(iso));
  if (month) return `${MONTHS[Number(month[2]) - 1]} ${month[1]}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return String(iso || '');
  const d = new Date(t);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
