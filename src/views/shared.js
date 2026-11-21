// Pieces several screens share: asking Claude about an activity, and searching its notes.
import { h, fill, backBar, header } from '../ui.js';
import { store } from '../store.js';
import { shortTime } from '../dates.js';
import { dayLabel } from '../training.js';
import { search, highlightTerms, norm } from '../search.js';
import { newest, uid, isBjj } from '../util.js';
import { asCells } from '../journal.js';

export function highlighted(text, q) {
  const terms = highlightTerms(q).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return [text];
  const re = new RegExp(`(${terms.join('|')})`, 'gi');
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? h('mark', null, part) : part));
}

export const questionsFor = (questions, activity) =>
  questions.filter((q) => q.status !== 'cancelled' && q.kind !== 'week' && (activity === 'bjj' ? isBjj(q.activity) : q.activity === activity));

// Ask Claude: answered from his notes at the next run (philosophy may add outside knowledge, labelled).
export function askView(root, ctx, { activity, title, placeholder, parent, prefill = '' }) {
  const text = h('textarea', { rows: '3', value: prefill || ctx.state.askPrefill || '', placeholder });
  ctx.state.askPrefill = '';
  const msg = h('p', { class: 'msg', role: 'status' });
  const list = h('div');
  const send = h('button', { class: 'primary', type: 'submit' }, 'Ask');
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      const q = text.value.trim();
      if (!q) return;
      send.disabled = true;
      const sent = await ctx.submit([{ tab: ctx.TABS.questions, rows: [{ id: uid(), question: q, activity: activity === 'bjj' ? '' : activity }] }], (t) => (msg.textContent = t), 'Asking');
      text.value = '';
      msg.textContent = sent ? `Asked. The answer shows up here after the ${ctx.runAt()} run.` : 'No signal. Your question is safe on this phone and goes out when you are back online.';
      send.disabled = false;
      ctx.refresh();
    },
  }, text, send, msg);
  root.append(parent ? backBar(parent.label, () => ctx.show(parent.view)) : null, header(title), form, list);
  return () => {
    const qs = newest(questionsFor(ctx.state.questions, activity), 'asked_at');
    const seen = new Set(store.get('seenAnswers', []));
    for (const q of qs) if (q.status === 'answered') seen.add(q.id);
    store.set('seenAnswers', [...seen]);
    fill(list, qs.map((r) =>
      h('div', { class: 'card' },
        h('h3', null, r.question),
        r.status === 'answered'
          ? [h('p', { class: 'pre' }, r.answer), r.sources ? h('div', { class: 'meta' }, `From: ${r.sources}`) : '', h('div', { class: 'meta' }, shortTime(r.answered_at))]
          : h('div', { class: 'meta' }, `Answer comes at the ${ctx.runAt()} run. `, h('button', { class: 'link', type: 'button', onclick: () => ctx.cancel(ctx.TABS.questions, r.id, 'Question removed.') }, 'Remove')))));
  };
}

// Search over filed dance or philosophy tips (BJJ has its own search over the sheet).
export function notesSearch(root, ctx, { activity, title, placeholder, parent, tips, onTopic }) {
  const input = h('input', { type: 'search', placeholder, value: ctx.state.query?.[activity] || '', autocomplete: 'off', 'aria-label': title });
  const out = h('div');
  root.append(backBar(parent.label, () => ctx.show(parent.view)), header(title), input, out);
  setTimeout(() => input.focus(), 0);
  const draw = () => {
    ctx.state.query = { ...(ctx.state.query || {}), [activity]: input.value };
    const q = input.value.trim();
    const all = tips();
    if (!q) return fill(out, h('p', { class: 'meta' }, `${all.length} notes. Type a word: a move, a cue, an idea.`));
    const nq = norm(q);
    const topicHits = [...new Set(all.map((t) => String(t.topic || '')).filter((t) => t && (norm(t).includes(nq) || nq.includes(norm(t)))))];
    const hits = search(asCells(all), q);
    fill(out,
      topicHits.length ? h('div', { class: 'picks' }, topicHits.map((t) => h('button', { type: 'button', class: 'pick', onclick: () => onTopic(t) }, t))) : null,
      h('div', { class: 'meta' }, hits.length ? `${hits.length} notes` : 'Nothing matches that yet.'),
      hits.map((c) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${dayLabel(c.date)}${c.location ? ` · ${c.location}` : ''}`), h('p', null, highlighted(c.text, q)))));
  };
  input.addEventListener('input', draw);
  return draw;
}
