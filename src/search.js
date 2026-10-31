// Instant keyword search over his notes. No LLM, no network: runs on the cached notes.
// Pure functions so node tests can import them.

// Same thing, different words. Conservative on purpose; the routine grows it (BACKLOG.md).
export const ALIASES = [
  ['de la riva', 'dlr', 'delariva'],
  ['knee on belly', 'kob', 'knee on stomach'],
  ['closed guard', 'full guard', 'fullguard'],
  ['half guard', 'halfguard'],
  ['side control', 'sidecontrol'],
  ['back take', 'backtake', 'back control'],
  ['rear naked choke', 'rnc'],
  ['arm bar', 'armbar'],
  ['kalau', 'kalo'],
  ['gak', 'ga', 'nggak', 'enggak'],
];

// Question words, so "what did my notes say about deep half" searches for "deep half".
const STOP = new Set(
  ('what did do does my notes note say said about how the a an to of in on for is are was it i me ' +
    'again tell show any anything with from when why where which ' +
    'apa gimana bagaimana catatan gw gue aku tentang soal yang dan di ke itu ini')
    .split(' ')
);

export function norm(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function queryTerms(q) {
  return norm(q).split(' ').filter((w) => w && !STOP.has(w));
}

// Phrases to look for: the query itself plus alias variants of any alias phrase it contains.
export function expand(q) {
  const base = queryTerms(q).join(' ');
  if (!base) return [];
  const out = new Set([base]);
  for (const group of ALIASES) {
    for (const phrase of group) {
      if (` ${base} `.includes(` ${phrase} `)) {
        for (const other of group) out.add(` ${base} `.replace(` ${phrase} `, ` ${other} `).trim());
      }
    }
  }
  return [...out];
}

const has = (hay, phrase) => ` ${hay} `.includes(` ${phrase} `);

// cells: [{ row, date, location, text }]. Returns best matches first.
export function search(cells, q, limit = 60) {
  const phrases = expand(q);
  if (!phrases.length) return [];
  const termSets = phrases.map((p) => p.split(' '));
  const scored = [];
  for (const cell of cells) {
    const hay = norm(cell.text);
    if (!hay) continue;
    let score = 0;
    for (const p of phrases) if (has(hay, p)) score += 10;
    // Every word of some variant present, in any order.
    const best = Math.max(...termSets.map((ts) => ts.filter((t) => has(hay, t) || hay.includes(t)).length / ts.length));
    if (best === 1) score += 5;
    else if (score === 0) continue;
    scored.push({ ...cell, score });
  }
  if (!scored.length) return orFallback(cells, termSets.flat(), limit);
  return scored.sort((a, b) => b.score - a.score || b.row - a.row).slice(0, limit);
}

// Nothing has every word: rank by how many words match.
function orFallback(cells, terms, limit) {
  const unique = [...new Set(terms)].filter((t) => t.length > 2);
  const scored = [];
  for (const cell of cells) {
    const hay = norm(cell.text);
    const hits = unique.filter((t) => hay.includes(t)).length;
    if (hits) scored.push({ ...cell, score: hits, partial: true });
  }
  return scored.sort((a, b) => b.score - a.score || b.row - a.row).slice(0, limit);
}

// Flattens the notes API response into one searchable cell per tip.
export function toCells(notes) {
  const out = [];
  for (const r of notes?.rows ?? []) {
    const [date = '', location = '', , ...tips] = r.cells;
    tips.forEach((text, i) => {
      if (String(text).trim()) out.push({ row: r.row, col: i + 4, date, location, text });
    });
  }
  return out;
}

// Words to highlight in the original text (case-insensitive).
export function highlightTerms(q) {
  const out = new Set();
  for (const p of expand(q)) for (const t of p.split(' ')) if (t.length > 1) out.add(t);
  return [...out].sort((a, b) => b.length - a.length);
}
