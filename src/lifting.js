// Lifting log: one row per exercise per session (weight, sets, reps). Pure helpers, no DOM.
export const EXERCISES = [
  { name: 'Squat', step: 5, bodyweight: false },
  { name: 'Deadlift', step: 5, bodyweight: false },
  { name: 'Bench press', step: 2.5, bodyweight: false },
  { name: 'Chin ups', step: 0, bodyweight: true },
  { name: 'Pull ups', step: 0, bodyweight: true },
];
const find = (name) => EXERCISES.find((e) => e.name === name);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Newest session first; inside a session the order he logged them.
export function groupByDate(rows) {
  const by = new Map();
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (r.status === 'cancelled' || !r.date) continue;
    if (!by.has(r.date)) by.set(r.date, []);
    by.get(r.date).push(r);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => ({ date, items }));
}

export const summary = (r) => {
  const w = num(r.weight_kg);
  return `${r.exercise}: ${num(r.sets)} x ${num(r.reps)}${w ? ` @ ${w} kg` : ''}`;
};

// Next session for one exercise, from the last time he did it.
// Weighted: same sets and reps, plus one step when he logged it as done; bodyweight: one more rep.
// Never adds both weight and reps. Returns null with no history.
export function suggestNext(rows, exercise) {
  const ex = find(exercise);
  const last = groupByDate(rows)
    .flatMap((g) => g.items)
    .filter((r) => r.exercise === exercise)[0];
  if (!ex || !last) return null;
  const weight = num(last.weight_kg);
  const sets = num(last.sets);
  const reps = num(last.reps);
  if (ex.bodyweight) {
    return { weight_kg: weight, sets, reps: reps + 1, why: `Last time ${sets} x ${reps}. Try one more rep.` };
  }
  return { weight_kg: weight + ex.step, sets, reps, why: `Last time ${weight} kg for ${sets} x ${reps}. Add ${ex.step} kg if it felt clean, else repeat it.` };
}

export function validEntry({ exercise, weight_kg, sets, reps }) {
  if (!find(exercise)) return 'Pick an exercise.';
  const w = weight_kg === '' || weight_kg == null ? 0 : Number(weight_kg);
  if (!(w >= 0 && w <= 500)) return 'Weight is 0 to 500 kg.';
  if (!(Number(sets) >= 1 && Number(sets) <= 20)) return 'Sets is 1 to 20.';
  if (!(Number(reps) >= 1 && Number(reps) <= 100)) return 'Reps is 1 to 100.';
  return '';
}
