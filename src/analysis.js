// Numbers and keywords per gym, computed on the phone from the cached notes. Pure functions.
import { sheetDateToISO } from './dates.js';
import { norm } from './search.js';

// Display rule (his request): from 1 October of the latest year in the notes, sessions count
// as this gym, whatever the row says. Sheet1 itself is never edited.
export const CURRENT_GYM = 'GB SG';

// Positions, guards and techniques worth counting (his request: topics, not filler words).
// Each entry is a group of spellings; the first is the name shown. Matching is on whole words.
export const TOPICS = [
  ['spider guard', 'spider'], ['de la riva', 'dlr', 'delariva'], ['reverse de la riva', 'rdlr'],
  ['half guard', 'halfguard'], ['deep half'], ['knee shield'], ['z guard'], ['lockdown'],
  ['closed guard', 'full guard', 'fullguard'], ['open guard'], ['butterfly guard', 'butterfly'],
  ['x guard'], ['single leg x', 'slx'], ['lasso'], ['collar sleeve', 'collar and sleeve'], ['rubber guard'],
  ['side control', 'sidecontrol'], ['mount'], ['knee on belly', 'kob', 'knee on stomach'],
  ['back take', 'backtake', 'back control'], ['turtle'], ['north south'], ['kesa gatame'],
  ['arm drag', 'armdrag'], ['single leg'], ['double leg'], ['takedown'], ['guard pass', 'passing', 'pass'],
  ['sweep'], ['scissor sweep'], ['hip bump'], ['berimbolo'], ['leg drag'], ['torreando'], ['knee slice', 'knee cut'],
  ['triangle'], ['arm bar', 'armbar'], ['kimura'], ['americana'], ['omoplata'], ['guillotine'],
  ['rear naked choke', 'rnc'], ['cross collar choke', 'cross choke'], ['bow and arrow'], ['ezekiel'],
  ['darce', 'd arce'], ['anaconda'], ['heel hook'], ['kneebar'], ['straight ankle lock', 'ankle lock'],
  ['leg lock', 'leglock'], ['choke'], ['shrimp', 'hip escape'], ['bridge'], ['frames', 'frame'],
  ['underhook'], ['overhook'], ['grip', 'grips'], ['posture'], ['escape'], ['transition'],
  ['body lock'], ['crab ride'], ['truck'], ['twister'], ['wrestle up'],
];

// Which gym a session counts as. cells: [date, location, hours, ...]; sinceYear: latest year.
export function gymOf(cells, sinceYear) {
  const iso = sheetDateToISO(cells[0]);
  if (iso && sinceYear && iso >= `${sinceYear}-10-01`) return CURRENT_GYM;
  return String(cells[1] ?? '').trim() || 'No gym';
}

export function latestYear(rows) {
  let max = 0;
  for (const r of rows) {
    const y = Number(sheetDateToISO(r.cells[0]).slice(0, 4));
    if (y > max) max = y;
  }
  return max;
}

// Count each topic once per tip, merging spellings, so one long tip does not drown the rest.
export function topics(tips, limit = 10) {
  const counts = new Map();
  for (const tip of tips) {
    const hay = ` ${norm(tip)} `;
    for (const [name, ...others] of TOPICS) {
      if ([name, ...others].some((p) => hay.includes(` ${p} `))) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// notes: the API response ({rows:[{row, cells}]}). Returns gyms, most hours first.
export function byGym(notes) {
  const rows = notes?.rows ?? [];
  const year = latestYear(rows);
  const gyms = new Map();
  for (const r of rows) {
    const name = gymOf(r.cells, year);
    const g = gyms.get(name) || { name, hours: 0, sessions: 0, tips: [] };
    g.hours += parseFloat(r.cells[2]) || 0;
    g.sessions += 1;
    for (const t of r.cells.slice(3)) if (String(t).trim()) g.tips.push(String(t));
    gyms.set(name, g);
  }
  return [...gyms.values()]
    .map(({ tips, ...g }) => ({ ...g, tipCount: tips.length, topics: topics(tips) }))
    .sort((a, b) => b.hours - a.hours);
}
