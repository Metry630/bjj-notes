// Lifting: one App · Lifting row per set (date, exercise, weight_kg, reps, effort), so three triples
// and a heavy single on the same day are simply four rows. Rows from the first Lift screen hold several
// identical sets (`sets: 3`); they count as that many sets. Pure helpers, no DOM.
import { live, num } from './util.js';

// Known lifts and their step for "add a little next time". Any other name works too.
export const EXERCISES = [
  { name: 'Squat', step: 2.5 },
  { name: 'Bench press', step: 2.5 },
  { name: 'Deadlift', step: 5 },
  { name: 'Overhead press', step: 2.5 },
  { name: 'Pull ups', step: 2.5, bodyweight: true },
  { name: 'Chin ups', step: 2.5, bodyweight: true },
];
export const EFFORTS = [['easy', 'easy'], ['ok', 'ok'], ['hard', 'hard'], ['max', 'max']];

export function info(name) {
  const known = EXERCISES.find((e) => e.name.toLowerCase() === String(name).trim().toLowerCase());
  return known || { name: String(name).trim(), step: 2.5, bodyweight: /\b(pull|chin|dip|push|muscle)/i.test(String(name)) };
}

// Every set as its own entry, oldest first: { id, date, exercise, w, r, effort, at }.
export function setsOf(rows, exercise) {
  const out = [];
  for (const row of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!live(row) || !row.date || (exercise && row.exercise !== exercise)) continue;
    const n = Math.max(1, Math.round(num(row.sets) || 1));
    for (let i = 0; i < n; i++) out.push({ id: row.id, date: String(row.date), exercise: row.exercise, w: num(row.weight_kg), r: num(row.reps), effort: row.effort || '', at: String(row.created_at || ''), row });
  }
  return out;
}

// One exercise's sessions, newest first: [{ date, sets }].
export function sessions(rows, exercise) {
  const by = new Map();
  for (const s of setsOf(rows, exercise)) {
    if (!by.has(s.date)) by.set(s.date, []);
    by.get(s.date).push(s);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, sets]) => ({ date, sets }));
}

// Identical sets in a row collapse into one group: 100 × 3, 100 × 3, 100 × 3 -> { w: 100, r: 3, n: 3 }.
export function collapse(sets) {
  const out = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.w === s.w && last.r === s.r) {
      last.n++;
      last.ids.push(s.id);
      if (s.effort) last.effort = s.effort;
    } else out.push({ w: s.w, r: s.r, n: 1, effort: s.effort, ids: [s.id] });
  }
  return out;
}

const kg = (w) => String(Math.round(w * 100) / 100);

// "3 × 3 @ 100, 1 × 1 @ 115" (sets × reps @ kg). Bodyweight: "3 × 8, 1 × 5 @ +10".
export function line(sets, bodyweight = false) {
  return collapse(sets)
    .map((g) => `${g.n} × ${g.r}${g.w ? ` @ ${bodyweight ? '+' : ''}${kg(g.w)}` : ''}`)
    .join(', ');
}

// Estimated one-rep max (Epley). A single is itself; above 10 reps the estimate is not worth showing.
export function e1rm(w, r) {
  if (!(w > 0) || !(r > 0) || r > 10) return 0;
  return r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10;
}

export const bestE1rm = (sets) => sets.reduce((m, s) => Math.max(m, e1rm(s.w, s.r)), 0);

// The set that defines a session: the most repeated work set of 2+ reps (heavier wins a tie), so a
// test single does not set next week's working weight. All singles: the heaviest.
export function mainSet(sets) {
  const groups = new Map();
  for (const s of sets) {
    if (s.r < 2) continue;
    const k = `${s.w}x${s.r}`;
    const g = groups.get(k) || { w: s.w, r: s.r, n: 0, efforts: [] };
    g.n++;
    if (s.effort) g.efforts.push(s.effort);
    groups.set(k, g);
  }
  const best = [...groups.values()].sort((a, b) => b.n - a.n || b.w - a.w || b.r - a.r)[0];
  if (best) return best;
  const top = [...sets].sort((a, b) => b.w - a.w)[0];
  return top ? { w: top.w, r: top.r, n: 1, efforts: top.effort ? [top.effort] : [] } : null;
}

const HARDEST = ['easy', 'ok', 'hard', 'max'];
const hardest = (efforts) => efforts.reduce((m, e) => (HARDEST.indexOf(e) > HARDEST.indexOf(m) ? e : m), '');

// Next time, from the last session's main set and how it felt: easy or ok adds one step, hard or max
// repeats, unknown adds a step "if it felt clean". Bodyweight lifts add a rep instead. Never both.
export function suggestNext(rows, exercise) {
  const last = sessions(rows, exercise)[0];
  if (!last) return null;
  const ex = info(exercise);
  const m = mainSet(last.sets);
  if (!m) return null;
  const felt = hardest(m.efforts);
  const hold = felt === 'hard' || felt === 'max';
  const base = { sets: m.n, date: last.date, felt };
  if (ex.bodyweight) {
    return { ...base, weight_kg: m.w, reps: hold ? m.r : m.r + 1, why: hold ? `It felt ${felt} last time: same again.` : felt ? `It felt ${felt}: one more rep.` : 'One more rep if it felt clean.' };
  }
  return { ...base, weight_kg: hold ? m.w : m.w + ex.step, reps: m.r, why: hold ? `It felt ${felt} last time: same weight again.` : felt ? `It felt ${felt}, so one step up.` : `One step up if it felt clean, else repeat ${kg(m.w)}.` };
}

// Personal bests so far: best estimated 1RM, and the heaviest weight lifted for at least 1, 3 and 5 reps.
export function bests(sets) {
  const out = { e1rm: null, heaviest: { 1: null, 3: null, 5: null } };
  for (const s of sets) {
    const e = e1rm(s.w, s.r);
    if (e && (!out.e1rm || e > out.e1rm.value)) out.e1rm = { value: e, date: s.date, w: s.w, r: s.r };
    for (const n of [1, 3, 5]) if (s.w > 0 && s.r >= n && (!out.heaviest[n] || s.w > out.heaviest[n].w)) out.heaviest[n] = { w: s.w, r: s.r, date: s.date };
  }
  return out;
}

// Is this set a personal best compared with everything before it? Returns the reasons, or [].
export function prFor(set, earlier) {
  if (!(set.w > 0)) return [];
  const b = bests(earlier);
  const why = [];
  const e = e1rm(set.w, set.r);
  if (e && b.e1rm && e > b.e1rm.value) why.push('best estimated 1RM');
  for (const n of [1, 3, 5]) if (set.r >= n && b.heaviest[n] && set.w > b.heaviest[n].w) why.push(`heaviest for ${n}+`);
  return earlier.length ? why : [];
}

// For the progress chart: per session, the best estimated 1RM (weighted) or best reps (bodyweight).
export function series(rows, exercise) {
  const bw = info(exercise).bodyweight;
  return sessions(rows, exercise)
    .reverse()
    .map((s) => ({ date: s.date, value: bw ? Math.max(...s.sets.map((x) => x.r)) : bestE1rm(s.sets), top: [...s.sets].sort((a, b) => b.w - a.w || b.r - a.r)[0] }))
    .filter((p) => p.value > 0);
}

// Exercises he has logged, most recent first, then the known ones.
export function exerciseNames(rows) {
  const seen = [];
  for (const s of setsOf(rows).reverse()) if (!seen.includes(s.exercise)) seen.push(s.exercise);
  for (const e of EXERCISES) if (!seen.includes(e.name)) seen.push(e.name);
  return seen;
}

// History by day, newest first; inside a day the order he logged them.
export function groupByDate(rows) {
  const by = new Map();
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!live(r) || !r.date) continue;
    if (!by.has(r.date)) by.set(r.date, []);
    by.get(r.date).push(r);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => ({ date, items }));
}

export function validEntry({ exercise, weight_kg, reps }) {
  const name = String(exercise || '').trim();
  if (!name) return 'Pick an exercise.';
  if (name.length > 40) return 'Exercise name is 40 characters at most.';
  const w = weight_kg === '' || weight_kg == null ? 0 : Number(weight_kg);
  if (!(w >= 0 && w <= 500)) return 'Weight is 0 to 500 kg.';
  if (!(Number(reps) >= 1 && Number(reps) <= 100)) return 'Reps is 1 to 100.';
  return '';
}
