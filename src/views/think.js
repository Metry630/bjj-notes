// Think (practical philosophy): say the ideas that stuck after a meetup; the routine keeps his
// words per concept and researches each one (labelled as Claude's, sources never invented).
import { h, fill, row, header, backBar, sec, iconButton, fold } from '../ui.js';
import { store } from '../store.js';
import { captureCard, recentCaptures } from '../capture.js';
import { tipsFor, topicsFor, groupTopics, sessionsOf, thisWeek, revisit, topicKey } from '../journal.js';
import { todayISO } from '../dates.js';
import { dayLabel } from '../training.js';
import { askView, notesSearch, questionsFor } from './shared.js';

const tips = (ctx) => tipsFor(ctx.state.journal, 'philosophy');
const concepts = (ctx) => topicsFor(ctx.state.topics, 'philosophy');
const groups = (ctx) => groupTopics(tips(ctx), concepts(ctx)).filter((g) => g.key && g.key !== 'practice');

// "Title | https://…" per line (or a bare link); anything that is not a web link stays plain text.
export function parseSources(text) {
  return String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\s+\|\s+/);
      const url = parts.find((p) => /^https?:\/\/\S+$/.test(p)) || '';
      const title = parts.filter((p) => p !== url).join(' | ') || url;
      return { title, url };
    });
}

export function think(root, ctx) {
  const top = h('div');
  const list = h('div');
  const recall = h('div');
  const recent = h('div');
  const rows = h('div', { class: 'list' });
  const cap = captureCard(ctx, 'philosophy');
  root.append(header('Think', 'Practical philosophy', iconButton('search', 'Search your ideas', () => ctx.show('think/search'))), top, cap, list, recall, recent, rows);
  return () => {
    cap.syncDefaults();
    const today = todayISO();
    const w = thisWeek(tips(ctx), concepts(ctx), today);
    fill(top, w.practice || w.question
      ? h('section', { class: 'card tint' },
          w.practice ? [h('div', { class: 'label' }, 'This week’s practice'), h('p', { class: 'lead' }, w.practice.text)] : null,
          w.question ? h('div', { class: w.practice ? 'split' : '' }, h('div', { class: 'label' }, 'Bring next time'), h('p', { class: 'lead strong' }, w.question.text)) : null,
          h('div', { class: 'meta' }, `From the meetup on ${dayLabel((w.practice || w.question).date)}`))
      : null);
    const all = groups(ctx);
    const byDay = sessionsOf(tips(ctx)).slice(0, 6);
    fill(list, all.length ? sec('Concepts') : null, byDay.map((s, i) => {
      const names = [...new Set(s.tips.map((t) => topicKey(t.topic)).filter((k) => k && k !== 'practice'))];
      const items = names.map((k) => all.find((g) => g.key === k)).filter(Boolean);
      if (!items.length) return null;
      return fold(`think:${s.date}`, `${dayLabel(s.date)} · ${items.length} ${items.length === 1 ? 'concept' : 'concepts'}`,
        h('div', { class: 'list' }, items.map((g) => row({ label: g.name, sub: g.row?.expansion ? `Your words · Claude’s take${g.row.sources ? ` · ${parseSources(g.row.sources).length} sources` : ''}` : 'Your words · researched at the next run', onclick: () => ctx.show('think/concept', { param: g.key }) }))), i === 0);
    }));
    const back = revisit(all, today);
    fill(recall, back ? h('section', { class: 'card' }, h('div', { class: 'label' }, `Revisit · from ${dayLabel(back.last)}`), h('strong', null, back.name),
      h('p', { class: 'meta' }, 'What do you remember? Say it, then check.'), h('button', { type: 'button', class: 'chipbtn', onclick: () => ctx.show('think/concept', { param: back.key }) }, 'Check')) : null);
    fill(recent, recentCaptures(ctx, 'philosophy'));
    const seen = new Set(store.get('seenAnswers', []));
    const fresh = questionsFor(ctx.state.questions, 'philosophy').filter((q) => q.status === 'answered' && !seen.has(q.id)).length;
    fill(rows, row({ label: 'Ask Claude about an idea', badge: fresh ? `${fresh} new` : '', onclick: () => ctx.show('think/ask') }));
  };
}

export function thinkConcept(root, ctx) {
  const out = h('div');
  root.append(backBar('Think', () => ctx.show('think')), out);
  return () => {
    const g = groups(ctx).find((x) => x.key === ctx.state.param);
    if (!g) return fill(out, header('Not found'), h('p', { class: 'meta' }, 'This concept is not in your notes (any more).'));
    const r = g.row || {};
    const seen = new Set(store.get('seenConcepts', []));
    if (r.expansion) seen.add(g.key);
    store.set('seenConcepts', [...seen]);
    fill(out,
      header(g.name, g.tips.length ? `First noted ${dayLabel(g.tips[0].session_date)}` : ''),
      h('section', { class: 'card' }, h('div', { class: 'label' }, 'Your words'), g.tips.map((t) => h('p', { class: 'quote' }, `“${t.text}”`, h('span', { class: 'meta' }, ` ${dayLabel(t.session_date)}`)))),
      r.expansion || r.summary
        ? h('section', { class: 'card tint' },
            h('div', { class: 'labelrow' }, h('span', { class: 'label' }, 'Claude’s take'), h('span', { class: 'meta' }, 'Researched, not from your notes')),
            r.summary ? h('p', { class: 'lead strong' }, r.summary) : null,
            String(r.expansion || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => h('p', null, p.trim())),
            r.practice || r.question ? h('div', { class: 'two' },
              r.practice ? h('div', null, h('div', { class: 'label' }, 'Try this week'), h('p', null, r.practice)) : null,
              r.question ? h('div', null, h('div', { class: 'label' }, 'Bring next time'), h('p', null, r.question)) : null) : null)
        : h('p', { class: 'meta' }, `Claude researches this at the ${ctx.runAt()} run.`),
      r.sources ? h('section', { class: 'list' }, h('div', { class: 'listhead' }, 'Sources'), parseSources(r.sources).map((s) => (s.url ? h('a', { class: 'row', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'rowtext' }, s.title)) : h('div', { class: 'row static' }, s.title)))) : null,
      h('button', { type: 'button', class: 'primary wide', onclick: () => { ctx.state.askPrefill = `About “${g.name}”: `; ctx.show('think/ask'); } }, 'Ask Claude about this'));
  };
}

export const thinkAsk = (root, ctx) => askView(root, ctx, { activity: 'philosophy', title: 'Ask about an idea', placeholder: 'How does this connect to…? What would the Stoics say about…?', parent: { label: 'Think', view: 'think' } });

export const thinkSearch = (root, ctx) => notesSearch(root, ctx, { activity: 'philosophy', title: 'Search your ideas', placeholder: 'attention, the observer, a quote…', parent: { label: 'Think', view: 'think' }, tips: () => tips(ctx), onTopic: (t) => ctx.show('think/concept', { param: topicKey(t) }) });
