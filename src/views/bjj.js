// BJJ: the same flow as before on one tab. Record or type after class, Before class on class days,
// search with topic chips, ask your notes, stats. Notes still go to Sheet1, untouched.
import { h, fill, row, header, backBar, sec } from '../ui.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { captureCard, recentCaptures } from '../capture.js';
import { search, toCells, norm, topicCells, topicCounts } from '../search.js';
import { byGym, funFacts, monthStats } from '../analysis.js';
import { lastSessions, reviewTopic, toTry } from '../beforeclass.js';
import { topicsFor } from '../journal.js';
import { todayISO } from '../dates.js';
import { slotsFor } from '../week.js';
import { askView, highlighted, questionsFor } from './shared.js';

const bjjTopics = (ctx) => topicsFor(ctx.state.topics, 'bjj');

function monthLine(ctx) {
  if (!ctx.state.notes?.rows?.length) return '';
  const [now, prev] = monthStats(ctx.state.notes, todayISO());
  return `${now.label} ${now.hours} h · ${now.sessions} sessions · ${prev.label} ${prev.hours} h`;
}

// Recall, not re-reading: the topic first, his notes after he has tried to remember.
function recallCard(review) {
  const body = h('div', { class: 'reveal', hidden: true },
    review.summary ? h('p', null, review.summary) : null,
    review.tips.map((c) => h('p', { class: 'tip' }, h('span', { class: 'meta' }, `${c.date} `), c.text)));
  const btn = h('button', { type: 'button', class: 'chipbtn', onclick: () => { body.hidden = !body.hidden; btn.textContent = body.hidden ? 'Reveal' : 'Hide'; } }, 'Reveal');
  return h('div', { class: 'recall' },
    h('div', { class: 'recallhead' }, h('div', null, h('strong', null, `Recall: ${review.topic}`), h('div', { class: 'meta' }, `Last in your notes ${review.last}. What do you remember? Say it, then check.`)), btn),
    body);
}

function beforeCard(ctx, { open }) {
  const cells = toCells(ctx.state.notes);
  const today = todayISO();
  const sessions = lastSessions(cells, 3);
  if (!sessions.length) return null;
  const tries = toTry(cells, today, 14, 3);
  const review = reviewTopic(cells, bjjTopics(ctx), sessions, today);
  const last = sessions[0];
  return h('details', { class: 'card before', open: open ? true : null, ontoggle: (e) => store.set('beforeOpen', { day: today, open: e.target.open }) },
    h('summary', null, h('span', null, 'Before class'), h('span', { class: 'meta' }, ` · last time ${last.date}`)),
    tries.length ? [h('div', { class: 'label' }, 'To try'), tries.map((c) => h('p', { class: 'tip' }, c.text))] : null,
    h('div', { class: 'label' }, `Last time · ${last.date}`),
    last.tips.slice(0, 4).map((t) => h('p', { class: 'tip' }, t)),
    review ? recallCard(review) : null,
    h('button', { type: 'button', class: 'link', onclick: () => ctx.show('bjj/before') }, 'Last 3 sessions'));
}

export function bjj(root, ctx) {
  const sub = h('p', { class: 'headsub' });
  const top = h('header', { class: 'head' }, h('div', null, h('h1', null, 'BJJ'), sub));
  const searchBtn = h('button', { type: 'button', class: 'searchbar', onclick: () => ctx.show('bjj/search') }, icon('search', { size: 18 }), 'Search your BJJ notes');
  const before = h('div');
  const recent = h('div');
  const rows = h('div', { class: 'list' });
  const cap = captureCard(ctx, 'bjj');
  root.append(top, searchBtn, before, cap, recent, rows);
  return () => {
    cap.syncDefaults();
    sub.textContent = monthLine(ctx);
    const today = todayISO();
    const classDay = slotsFor(ctx.week(), [], today).some((s) => s.activity === 'bjj');
    const saved = store.get('beforeOpen', null);
    const open = saved && saved.day === today ? saved.open : classDay && new Date().getHours() < 20;
    fill(before, beforeCard(ctx, { open }));
    fill(recent, recentCaptures(ctx, 'bjj'));
    const seen = new Set(store.get('seenAnswers', []));
    const fresh = questionsFor(ctx.state.questions, 'bjj').filter((q) => q.status === 'answered' && !seen.has(q.id)).length;
    fill(rows, row({ label: 'Ask your notes', badge: fresh ? `${fresh} new` : '', onclick: () => ctx.show('bjj/ask') }), row({ label: 'Stats and fun facts', onclick: () => ctx.show('bjj/stats') }));
  };
}

export function bjjSearch(root, ctx) {
  const input = h('input', { type: 'search', placeholder: 'deep half, spider, mount escape…', value: ctx.state.query?.bjj || '', autocomplete: 'off', 'aria-label': 'Search your BJJ notes' });
  const chips = h('div', { class: 'chips' });
  const out = h('div');
  root.append(backBar('BJJ', () => ctx.show('bjj')), header('Search'), input, chips, out);
  if (!input.value) setTimeout(() => input.focus(), 0);
  const draw = () => {
    ctx.state.query = { ...(ctx.state.query || {}), bjj: input.value };
    const q = input.value.trim();
    const cells = toCells(ctx.state.notes);
    const topics = bjjTopics(ctx);
    const counts = topicCounts(topics, cells).filter((c) => c.count > 0);
    fill(chips, counts.length ? [h('div', { class: 'meta' }, ctx.state.topic ? 'Topic filter (tap again to clear)' : 'Topics, most tips first'),
      counts.map((c) => h('button', { type: 'button', class: ctx.state.topic === c.topic ? 'pick on' : 'pick', onclick: () => { ctx.state.topic = ctx.state.topic === c.topic ? '' : c.topic; draw(); } }, `${c.topic} (${c.count})`))] : null);
    const picked = ctx.state.topic ? topics.find((t) => t.topic === ctx.state.topic) : null;
    if (picked) {
      let tips = topicCells(cells, picked);
      if (q) {
        const keep = new Set(search(tips, q).map((c) => `${c.row}:${c.col}`));
        tips = tips.filter((c) => keep.has(`${c.row}:${c.col}`));
      }
      tips = tips.slice().sort((a, b) => b.row - a.row || a.col - b.col);
      return fill(out,
        h('div', { class: 'card topic' }, h('div', { class: 'meta' }, 'Topic summary'), h('h3', null, picked.topic), h('p', { class: 'pre' }, picked.summary)),
        h('div', { class: 'meta' }, `${tips.length} tips, newest first`),
        tips.map((c) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${c.date} · ${c.location}`), h('p', null, q ? highlighted(c.text, q) : c.text))));
    }
    if (!q) {
      const recentRows = (ctx.state.notes?.rows ?? []).slice(-5).reverse();
      return fill(out, sec('Recent sessions'), recentRows.map((r) =>
        h('div', { class: 'card' }, h('div', { class: 'meta' }, `${r.cells[0]} · ${r.cells[1] || ''} · ${r.cells[2] || '?'} h`), h('ul', null, r.cells.slice(3).filter((c) => c.trim()).map((c) => h('li', null, c))))));
    }
    const nq = norm(q);
    const named = topics.filter((t) => [t.topic, ...String(t.aliases || '').split(',')].map(norm).filter(Boolean).some((n) => n.includes(nq) || nq.includes(n)));
    const hits = search(cells, q);
    fill(out,
      named.map((t) => h('div', { class: 'card topic' }, h('div', { class: 'meta' }, 'Topic summary'), h('h3', null, t.topic), h('p', { class: 'pre' }, t.summary), t.sources ? h('div', { class: 'meta' }, `From: ${t.sources}`) : '')),
      h('div', { class: 'meta' }, hits.length ? `${hits.length}${hits.length === 60 ? '+' : ''} tips${hits[0]?.partial ? ' (partial matches)' : ''}` : 'Nothing in your notes matches that.'),
      hits.map((c) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${c.date} · ${c.location}`), h('p', null, highlighted(c.text, q)))),
      h('button', { class: 'secondary', type: 'button', onclick: () => { ctx.state.askPrefill = `What did my notes say about ${q}?`; ctx.show('bjj/ask'); } }, `Ask Claude about “${q}”`));
  };
  input.addEventListener('input', draw);
  return draw;
}

export const bjjAsk = (root, ctx) => askView(root, ctx, { activity: 'bjj', title: 'Ask your notes', placeholder: 'What did my notes say about deep half?', parent: { label: 'BJJ', view: 'bjj' } });

export function bjjBefore(root, ctx) {
  const out = h('div');
  root.append(backBar('BJJ', () => ctx.show('bjj')), header('Before class'), out);
  return () => {
    const cells = toCells(ctx.state.notes);
    const sessions = lastSessions(cells, 3);
    if (!sessions.length) return fill(out, h('p', { class: 'meta' }, 'No notes loaded yet.'));
    const review = reviewTopic(cells, bjjTopics(ctx), sessions, todayISO());
    const tries = toTry(cells, todayISO());
    fill(out,
      tries.length ? [sec('To try'), h('div', { class: 'card' }, tries.map((c) => h('p', { class: 'tip' }, h('span', { class: 'meta' }, `${c.date} `), c.text)))] : null,
      sec('Last sessions'),
      sessions.map((s) => h('div', { class: 'card' }, h('strong', null, `${s.date}${s.location ? ` · ${s.location}` : ''}`), s.tips.map((t) => h('p', { class: 'tip' }, t)))),
      sec('Worth a look'),
      review ? h('div', { class: 'card' }, recallCard(review)) : h('p', { class: 'meta' }, 'No older topic to suggest yet.'));
  };
}

export function bjjStats(root, ctx) {
  const out = h('div');
  root.append(backBar('BJJ', () => ctx.show('bjj')), header('Stats'), out);
  return () => {
    const gyms = byGym(ctx.state.notes);
    if (!gyms.length) return fill(out, h('p', { class: 'meta' }, 'No notes loaded yet.'));
    const [now, prev] = monthStats(ctx.state.notes, todayISO());
    fill(out,
      h('div', { class: 'card' }, h('strong', null, 'This month'), h('p', null, `${now.label}: ${now.hours} h over ${now.sessions} sessions. ${prev.label}: ${prev.hours} h over ${prev.sessions}.`)),
      h('div', { class: 'card' }, h('strong', null, 'Fun facts'), funFacts(ctx.state.notes).map((f) => h('p', null, `${f.label}: ${f.value}`))),
      h('p', { class: 'meta' }, 'Hours and most covered topics per gym. Sessions since 1 October count as GB SG here; your sheet is unchanged.'),
      gyms.map((g) => h('div', { class: 'card' }, h('strong', null, g.name), h('div', { class: 'meta' }, `${g.hours} hours · ${g.sessions} sessions · ${g.tipCount} tips`),
        g.topics.length ? h('p', null, g.topics.map((k) => `${k.word} (${k.count})`).join(', ')) : h('p', { class: 'meta' }, 'No topics found in these notes yet.'))));
  };
}
