// Dance and philosophy notes. The routine files his words into App · Journal (one tip per row,
// `topic` = the move or concept) and keeps one App · Topics row per move or concept (`activity`
// dance or philosophy; for a concept also `expansion`, `sources`, `practice`, `question`).
// Pure functions, so node tests can import them.
import { norm } from './search.js';
import { live, isBjj, tagList } from './util.js';
import { addDays, daysBetween } from './training.js';

export const topicKey = (name) => norm(name);
export const STYLES = [['salsa', 'Salsa'], ['bachata', 'Bachata']];
export const LEVELS = [['new', 'New'], ['learning', 'Learning'], ['got', 'Got it']];

// Topic rows for one activity. Rows from before activities existed are BJJ topics.
export function topicsFor(topics, activity) {
  return (topics || []).filter((t) => t && t.topic && t.hidden !== 'yes' && (activity === 'bjj' ? isBjj(t.activity) : t.activity === activity));
}

// Filed tips for one activity, oldest first (the order he said them).
export function tipsFor(journal, activity) {
  return (journal || [])
    .filter((r) => live(r) && r.activity === activity && String(r.text ?? '').trim())
    .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)) || Number(a.seq || 0) - Number(b.seq || 0));
}

// The 0.12 Dance screen saved typed cues straight into App · Dance (move, cue): they show as tips.
export function legacyDanceTips(rows) {
  return (rows || [])
    .filter((r) => live(r) && String(r.move ?? '').trim() && String(r.cue ?? '').trim())
    .map((r) => ({ id: r.id, activity: 'dance', topic: String(r.move).trim(), text: String(r.cue).trim(), session_date: String(r.created_at || '').slice(0, 10), tags: '', seq: 0 }));
}

const TECHNIQUE = new Set(['frame', 'timing', 'musicality', 'connection', 'footwork', 'styling', 'posture', 'lead', 'leading', 'follow', 'following', 'spins', 'spinning', 'turns', 'balance', 'body movement', 'technique', 'general']);
const styleTags = (tags) => tagList(tags).filter((t) => t === 'salsa' || t === 'bachata');

// Tips grouped by move or concept, most recently touched first. Topic rows with no tips yet show too.
export function groupTopics(tips, topics) {
  const rows = new Map((topics || []).map((t) => [topicKey(t.topic), t]));
  const by = new Map();
  const group = (key, name, row) => {
    if (!by.has(key)) by.set(key, { key, name, row: row || null, tips: [], last: '', styles: [] });
    return by.get(key);
  };
  for (const tip of tips) {
    const key = topicKey(tip.topic);
    const g = group(key, String(tip.topic || '').trim(), rows.get(key));
    g.tips.push(tip);
    if (String(tip.session_date) > g.last) g.last = String(tip.session_date);
    for (const st of styleTags(tip.tags)) if (!g.styles.includes(st)) g.styles.push(st);
  }
  for (const [key, row] of rows) {
    const g = group(key, row.topic, row);
    if (!g.last) g.last = String(row.first_seen || '');
  }
  return [...by.values()]
    .map((g) => {
      for (const st of styleTags(g.row?.style)) if (!g.styles.includes(st)) g.styles.push(st);
      const kind = g.row?.kind || (!g.key || TECHNIQUE.has(g.key) ? 'technique' : 'move');
      return { ...g, name: g.name || 'General', kind };
    })
    .sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
}

// Classes or meetups as days, newest first: [{ date, tips, styles }].
export function sessionsOf(tips) {
  const by = new Map();
  for (const t of tips) {
    const d = String(t.session_date || '');
    if (!d) continue;
    if (!by.has(d)) by.set(d, { date: d, tips: [], styles: [] });
    const s = by.get(d);
    s.tips.push(t);
    for (const st of styleTags(t.tags)) if (!s.styles.includes(st)) s.styles.push(st);
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// The most recent class on or before today.
export const lastSession = (tips, todayIso) => sessionsOf(tips).find((s) => s.date <= todayIso) || null;

export const levelTarget = (key) => `topic:dance:${key}`.slice(0, 100);

// Moves to have ready at a social, per style: up to 3 he has got and 2 he is learning, one cue each.
// Without levels set yet, the moves he has the most cues for count as got. `rng` picks the order.
export function socialPicks(groups, levelOf, rng = Math.random) {
  const moves = groups.filter((g) => g.kind === 'move' && g.key);
  const shuffle = (xs) => xs.map((x) => [rng(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const cue = (g) => {
    const t = g.tips[g.tips.length - 1];
    return t ? String(t.text) : String(g.row?.summary || '');
  };
  const out = [];
  for (const [style, label] of [...STYLES, ['', 'Any style']]) {
    const mine = moves.filter((g) => (style ? g.styles.includes(style) : !g.styles.length));
    if (!mine.length) continue;
    const anyLevel = mine.some((g) => levelOf(g.key) !== 'new');
    const got = anyLevel ? mine.filter((g) => levelOf(g.key) === 'got') : [...mine].sort((a, b) => b.tips.length - a.tips.length);
    const learning = anyLevel ? mine.filter((g) => levelOf(g.key) === 'learning') : [];
    out.push({
      style,
      label,
      got: shuffle(got).slice(0, 3).map((g) => ({ key: g.key, name: g.name, cue: cue(g) })),
      learning: shuffle(learning).slice(0, 2).map((g) => ({ key: g.key, name: g.name, cue: cue(g) })),
    });
  }
  return out;
}

// This week's practice (a tip filed under "practice") and the question to bring, from the latest
// meetup within the last 8 days.
export function thisWeek(tips, concepts, todayIso) {
  const recent = (d) => d && d <= todayIso && daysBetween(d, todayIso) <= 8;
  const practiceTip = [...tips].reverse().find((t) => topicKey(t.topic) === 'practice' && recent(String(t.session_date)));
  const withQ = groupTopics(tips, concepts).filter((g) => g.row?.question && recent(g.last));
  const practiceRow = withQ.find((g) => g.row?.practice);
  return {
    practice: practiceTip ? { text: String(practiceTip.text), date: String(practiceTip.session_date), mine: true } : practiceRow ? { text: String(practiceRow.row.practice), date: practiceRow.last, mine: false } : null,
    question: withQ[0] ? { text: String(withQ[0].row.question), topic: withQ[0].name, date: withQ[0].last } : null,
  };
}

// One older concept to recall, the same all day, a different one tomorrow.
export function revisit(groups, todayIso, minAgeDays = 6) {
  const pool = groups.filter((g) => g.key && g.key !== 'practice' && g.last && daysBetween(g.last, todayIso) >= minAgeDays).sort((a, b) => a.name.localeCompare(b.name));
  if (!pool.length) return null;
  const day = Math.floor(Date.parse(`${todayIso}T00:00:00Z`) / 864e5);
  return pool[day % pool.length];
}

// Search over filed tips, shaped like BJJ cells so search.js works on them.
export const asCells = (tips) => tips.map((t, i) => ({ row: i, col: 0, date: String(t.session_date || ''), location: String(t.topic || ''), text: String(t.text || ''), id: t.id }));

export const daysAgo = (iso, todayIso) => (iso ? daysBetween(iso, todayIso) : Infinity);
export const weekAgo = (todayIso) => addDays(todayIso, -7);
