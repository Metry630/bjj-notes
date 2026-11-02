// Numbers and keywords per gym, computed on the phone from the cached notes. Pure functions.
import { sheetDateToISO } from './dates.js';
import { ALIASES, norm } from './search.js';

// Display rule (his request): from 1 October of the latest year in the notes, sessions count
// as this gym, whatever the row says. Sheet1 itself is never edited.
export const CURRENT_GYM = 'GB SG';

export const STOPWORDS = new Set(
  ('the a an and or but to of in on at for with from by is are was be it its this that these those you your ' +
    'if then than so as not no do does dont can cant just more less very too also into out up down over ' +
    'when where what how why who which while after before again keep make get got go going put take ' +
    'yang dan di ke itu ini aja ya sih dong nih deh lu gw gue aku dia dari buat untuk kalo kalau kalo ' +
    'pake pakai sama sm jg juga udah udh baru terus trus lagi bisa bs ga gak gk gabisa gbs bisa ' +
    'sampe sampai habis abis dulu dlu sblm biar supaya kan banget bgt kyk kayak gitu gini ada ' +
    'tapi tp atau ato satu dua tangan kaki pas waktu lawan orang cuma cuman jangan jgn harus ' +
    'ke dalem dalam atas bawah depan belakang lalu terus tadi nanti kalau mau krn karena ' +
    'one two same side other first back')
    .split(' ')
);

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

// Merge spellings from ALIASES into the first phrase, so "dlr" and "delariva" count together.
function canonical(text) {
  let s = ` ${norm(text)} `;
  for (const [main, ...others] of ALIASES) {
    for (const o of others) s = s.split(` ${o} `).join(` ${main} `);
  }
  for (const [main] of ALIASES) s = s.split(` ${main} `).join(` ${main.replace(/ /g, '_')} `);
  return s.trim();
}

// Count each word once per tip, so one long tip does not drown the rest.
export function keywords(tips, limit = 10) {
  const counts = new Map();
  for (const tip of tips) {
    const seen = new Set(
      canonical(tip)
        .split(' ')
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    );
    for (const w of seen) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word: word.replace(/_/g, ' '), count }));
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
    .map(({ tips, ...g }) => ({ ...g, tipCount: tips.length, keywords: keywords(tips) }))
    .sort((a, b) => b.hours - a.hours);
}
