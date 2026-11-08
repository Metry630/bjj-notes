// Running plan helpers for the Run tab. The plan, the ladder and the guide are written into the
// sheet by the coach (the routine); this only works out what to show for today.

const DAY = 864e5;

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// The App · Plan row (one per calendar week, `start` = its Monday) that holds this date.
export function weekOf(plan, iso) {
  return plan.find((w) => w.start && w.start <= iso && iso < addDays(w.start, 7)) || null;
}

// The week's three runs with their dates: Fri, Sat, Sun.
export function sessionDays(week) {
  return [
    { day: 'Fri', date: addDays(week.start, 4), what: week.fri },
    { day: 'Sat', date: addDays(week.start, 5), what: week.sat },
    { day: 'Sun', date: addDays(week.start, 6), what: week.sun },
  ];
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
