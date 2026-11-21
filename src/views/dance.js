// Dance (salsa, bachata): talk through the class; the routine files his words per move or technique,
// so the repertoire builds itself. Before class shows the last class; before a social, the moves to
// have ready, in big text for a dark room.
import { h, fill, row, header, backBar, sec, iconButton, seg, picker, fold } from '../ui.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { captureCard, recentCaptures } from '../capture.js';
import { tipsFor, topicsFor, groupTopics, lastSession, socialPicks, legacyDanceTips, levelTarget, LEVELS, STYLES, topicKey } from '../journal.js';
import { markKey } from '../marks.js';
import { todayISO } from '../dates.js';
import { dayLabel } from '../training.js';
import { slotsFor, weekTotals, mondayOf } from '../week.js';
import { plural } from '../util.js';
import { notesSearch } from './shared.js';

const tips = (ctx) => [...legacyDanceTips(ctx.state.dance), ...tipsFor(ctx.state.journal, 'dance')];
const groups = (ctx) => groupTopics(tips(ctx), topicsFor(ctx.state.topics, 'dance'));
const levelOf = (ctx) => {
  const marks = ctx.marks();
  return (key) => marks.get(markKey(levelTarget(key), 'level')) || 'new';
};
const LEVEL_LABEL = Object.fromEntries(LEVELS);
const levelDot = (lv) => h('span', { class: `lvl lvl-${lv}`, 'aria-hidden': 'true' });

export function dance(root, ctx) {
  const sub = h('p', { class: 'headsub' });
  const context = h('div');
  const moves = h('div');
  const recent = h('div');
  const cap = captureCard(ctx, 'dance');
  root.append(h('header', { class: 'head' }, h('div', null, h('h1', null, 'Dance'), sub), h('div', { class: 'headacts' }, iconButton('search', 'Search your dance notes', () => ctx.show('dance/search')))), context, cap, moves, recent);
  return () => {
    cap.syncDefaults();
    const today = todayISO();
    const t = weekTotals(ctx.state, mondayOf(today));
    sub.textContent = t.danceHours ? `This week ${t.danceHours} h` : 'Salsa and bachata';
    const all = groups(ctx);
    const socialToday = slotsFor(ctx.week(), [], today).some((s) => s.activity === 'dance' && s.tags.includes('social'));
    const last = lastSession(tips(ctx), today);
    fill(context,
      socialToday ? h('button', { type: 'button', class: 'card cta', onclick: () => ctx.show('dance/social') }, icon('music', { size: 22 }), h('span', null, h('strong', null, 'Before the social'), h('span', { class: 'meta' }, 'The moves to have ready tonight'))) : null,
      last ? h('section', { class: 'card tint' },
        h('div', { class: 'labelrow' }, h('span', { class: 'label' }, 'Last class'), h('span', { class: 'meta' }, `${dayLabel(last.date)}${last.styles.length ? ` · ${last.styles.join(' + ')}` : ''}`)),
        last.tips.slice(0, 5).map((x) => h('p', { class: 'tip' }, x.topic ? h('strong', null, `${x.topic}: `) : null, x.text))) : null);
    const style = store.get('danceStyle', 'all');
    const lv = levelOf(ctx);
    const shown = all.filter((g) => g.kind === 'move' && (style === 'all' || g.styles.includes(style)));
    const tech = all.filter((g) => g.kind === 'technique');
    fill(moves,
      all.length ? h('div', { class: 'secrow' }, sec('Moves'), seg([['all', 'All'], ...STYLES], style, (v) => { store.set('danceStyle', v); ctx.update(); })) : null,
      shown.length ? h('div', { class: 'list' }, shown.map((g) => row({ label: g.name, sub: `${g.styles.join(' + ') || 'style not noted'} · ${plural(g.tips.length, 'cue')}${g.last ? ` · ${dayLabel(g.last)}` : ''}`, right: h('span', { class: `lvlname lvlname-${lv(g.key)}` }, levelDot(lv(g.key)), LEVEL_LABEL[lv(g.key)]), onclick: () => ctx.show('dance/move', { param: g.key }) }))) : all.length ? h('p', { class: 'meta' }, 'No moves in this style yet.') : null,
      tech.length ? fold('dance:tech', `Technique (${plural(tech.reduce((n, g) => n + g.tips.length, 0), 'tip')})`, h('div', { class: 'list' }, tech.map((g) => row({ label: g.name, sub: plural(g.tips.length, 'tip'), onclick: () => ctx.show('dance/move', { param: g.key }) })))) : null,
      all.length && !socialToday ? h('div', { class: 'list' }, row({ label: 'Before the social', sub: 'Moves to have ready, big text', onclick: () => ctx.show('dance/social') })) : null);
    fill(recent, recentCaptures(ctx, 'dance'));
  };
}

export function danceMove(root, ctx) {
  const out = h('div');
  root.append(backBar('Dance', () => ctx.show('dance')), out);
  return () => {
    const g = groups(ctx).find((x) => x.key === ctx.state.param);
    if (!g) return fill(out, header('Not found'), h('p', { class: 'meta' }, 'This move is not in your notes (any more).'));
    const current = levelOf(ctx)(g.key);
    const levels = picker(LEVELS, { initial: current, onchange: (v) => ctx.mark(levelTarget(g.key), 'level', v || 'new') });
    fill(out,
      header(g.name, [g.styles.join(' + '), g.last ? `last ${dayLabel(g.last)}` : ''].filter(Boolean).join(' · ')),
      g.kind === 'move' ? h('section', { class: 'card' }, h('div', { class: 'label' }, 'Where you are with it'), levels.el) : null,
      g.row?.summary ? h('section', { class: 'card tint' }, h('div', { class: 'labelrow' }, h('span', { class: 'label' }, 'Summary'), h('span', { class: 'meta' }, 'From your cues')), h('p', { class: 'lead' }, g.row.summary)) : null,
      sec(g.kind === 'move' ? 'Your cues' : 'Your tips'),
      h('div', { class: 'card' }, [...g.tips].reverse().map((t) => h('p', { class: 'tip' }, t.text, h('span', { class: 'meta' }, ` ${dayLabel(t.session_date)}`)))));
  };
}

export function danceSocial(root, ctx) {
  const out = h('div', { class: 'social' });
  let seed = Math.random();
  const shuffle = h('button', { type: 'button', class: 'primary wide', onclick: () => { seed = Math.random(); ctx.update(); } }, icon('shuffle', { size: 20 }), ' Shuffle');
  root.append(backBar('Dance', () => ctx.show('dance')), header('Before the social', 'Moves you can lead tonight'), out, shuffle);
  return () => {
    let s = seed;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const picks = socialPicks(groups(ctx), levelOf(ctx), rng);
    if (!picks.length) return fill(out, h('p', { class: 'meta' }, 'No moves yet. Record after your next class and they show up here.'));
    fill(out, picks.map((p) => h('section', { class: 'socialsec' },
      h('div', { class: 'label' }, p.label),
      p.got.map((m) => h('div', { class: 'move' }, h('div', { class: 'movename' }, m.name), m.cue ? h('div', { class: 'movecue' }, m.cue) : null)),
      p.learning.length ? h('div', { class: 'try' }, h('div', { class: 'label' }, 'Try tonight'), p.learning.map((m) => h('div', { class: 'move' }, h('div', { class: 'movename' }, m.name), m.cue ? h('div', { class: 'movecue' }, m.cue) : null))) : null)));
  };
}

export const danceSearch = (root, ctx) => notesSearch(root, ctx, { activity: 'dance', title: 'Search dance notes', placeholder: 'cross body lead, frame, turn…', parent: { label: 'Dance', view: 'dance' }, tips: () => tips(ctx), onTopic: (t) => ctx.show('dance/move', { param: topicKey(t) }) });
