// Dance cues: one row per cue, grouped by move. Pure helpers, no DOM.
export const MAX_MOVE = 60;
export const MAX_CUE = 300;

const clean = (r) => r.status !== 'cancelled' && r.move && r.cue;

// Moves A to Z (case-insensitive); cues inside a move in the order he added them.
export function groupByMove(rows) {
  const by = new Map();
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!clean(r)) continue;
    const key = String(r.move).trim().toLowerCase();
    if (!by.has(key)) by.set(key, { move: String(r.move).trim(), items: [] });
    by.get(key).items.push(r);
  }
  return [...by.values()].sort((a, b) => a.move.toLowerCase().localeCompare(b.move.toLowerCase()));
}

// One move to look over before a class. `pick` is a number in [0, 1), so tests can fix it.
// Skips the move shown last time when there is more than one.
export function reminder(rows, pick = Math.random(), lastMove = '') {
  const moves = groupByMove(rows);
  if (!moves.length) return null;
  const pool = moves.length > 1 ? moves.filter((m) => m.move.toLowerCase() !== String(lastMove).toLowerCase()) : moves;
  return pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
}

export function validCue({ move, cue }) {
  const m = String(move || '').trim();
  const c = String(cue || '').trim();
  if (!m) return 'Write the move name.';
  if (m.length > MAX_MOVE) return `Move name is ${MAX_MOVE} characters at most.`;
  if (!c) return 'Write the cue.';
  if (c.length > MAX_CUE) return `A cue is ${MAX_CUE} characters at most.`;
  return '';
}
