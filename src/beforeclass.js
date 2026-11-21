// "Before class": his last sessions, plus one older topic to revisit. Pure functions, no DOM.
import { sheetDateToISO } from './dates.js';
import { topicCells } from './search.js';

// Last `n` sessions (by date) as [{ date, iso, location, tips: [text] }], newest first.
export function lastSessions(cells, n = 3) {
  const byDate = new Map();
  for (const c of cells) {
    const iso = sheetDateToISO(c.date);
    if (!iso) continue;
    if (!byDate.has(iso)) byDate.set(iso, { date: c.date, iso, location: c.location, tips: [] });
    byDate.get(iso).tips.push(c.text);
  }
  return [...byDate.values()].sort((a, b) => (a.iso < b.iso ? 1 : -1)).slice(0, n);
}

// One topic he has notes on but has not touched in the last sessions. The pick rotates by day,
// so it changes daily and stays the same within a day. Returns { topic, summary, last, tips } or null.
export function reviewTopic(cells, topics, sessions, todayIso) {
  const recent = new Set(sessions.map((s) => s.iso));
  const pool = [];
  for (const t of topics) {
    if (!t.topic || t.hidden === 'yes') continue;
    const hits = topicCells(cells, t);
    if (!hits.length) continue;
    if (hits.some((c) => recent.has(sheetDateToISO(c.date)))) continue;
    const dated = hits.filter((c) => sheetDateToISO(c.date)).sort((a, b) => (sheetDateToISO(a.date) < sheetDateToISO(b.date) ? 1 : -1));
    pool.push({ topic: t.topic, summary: t.summary || '', last: dated[0]?.date || '', tips: dated.slice(0, 3) });
  }
  if (!pool.length) return null;
  pool.sort((a, b) => a.topic.localeCompare(b.topic));
  const day = Math.floor(Date.parse(`${todayIso}T00:00:00Z`) / 864e5);
  return pool[day % pool.length];
}

// Tips from the last two weeks he phrased as something to try next time (English or Indonesian),
// newest first. They go on top of Before class, so a plan made after one class meets the next.
const INTENT = /\b(next time|try|coba|harus|jangan lupa|remember to|should|lain kali|perlu)\b/i;
export function toTry(cells, todayIso, days = 14, limit = 4) {
  const from = new Date(Date.parse(`${todayIso}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  return cells
    .filter((c) => {
      const iso = sheetDateToISO(c.date);
      return iso && iso >= from && iso <= todayIso && INTENT.test(String(c.text));
    })
    .sort((a, b) => sheetDateToISO(b.date).localeCompare(sheetDateToISO(a.date)) || a.col - b.col)
    .slice(0, limit);
}
