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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400e3);

// Fun facts over all sessions. Returns [{label, value}], skipping facts there is no data for.
export function funFacts(notes) {
  const rows = (notes?.rows ?? [])
    .map((r) => ({ iso: sheetDateToISO(r.cells[0]), hours: parseFloat(r.cells[2]) || 0, tips: r.cells.slice(3).map(String).filter((t) => t.trim()) }))
    .filter((r) => r.iso);
  if (!rows.length) return [];
  const facts = [];
  const days = [...new Set(rows.map((r) => dayNum(r.iso)))].sort((a, b) => a - b);
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  facts.push({ label: 'Longest streak', value: `${best} ${best === 1 ? 'day' : 'days'} in a row` });
  const months = new Map();
  for (const r of rows) months.set(r.iso.slice(0, 7), (months.get(r.iso.slice(0, 7)) || 0) + r.hours);
  const [mKey, mHours] = [...months].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  if (mHours > 0) facts.push({ label: 'Busiest month', value: `${MONTHS[Number(mKey.slice(5)) - 1]} ${mKey.slice(0, 4)}, ${mHours} hours` });
  const long = rows.reduce((a, r) => (r.hours > a.hours ? r : a), rows[0]);
  if (long.hours > 0) facts.push({ label: 'Longest session', value: `${long.hours} hours on ${long.iso.slice(8)}/${long.iso.slice(5, 7)}/${long.iso.slice(2, 4)}` });
  const top = topics(rows.flatMap((r) => r.tips), 1)[0];
  if (top) facts.push({ label: 'Most drilled topic', value: `${top.word} (${top.count} tips)` });
  const total = rows.reduce((s, r) => s + r.hours, 0);
  facts.push({ label: 'Total', value: `${total} hours over ${rows.length} sessions` });
  return facts;
}

// Hours and sessions per calendar month, for the month of `todayIso` and the one before.
// Returns [{ key: 'YYYY-MM', label, hours, sessions }], this month first.
export function monthStats(notes, todayIso) {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const keys = [todayIso.slice(0, 7), prev];
  const out = keys.map((key) => ({ key, label: MONTHS[Number(key.slice(5)) - 1], hours: 0, sessions: 0 }));
  const seen = new Set();
  for (const r of notes?.rows ?? []) {
    const iso = sheetDateToISO(r.cells[0]);
    const slot = out.find((o) => o.key === iso.slice(0, 7));
    if (!slot) continue;
    slot.hours += parseFloat(r.cells[2]) || 0;
    if (!seen.has(iso)) slot.sessions += 1;
    seen.add(iso);
  }
  return out;
}
