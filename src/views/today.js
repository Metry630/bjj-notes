// Today: what is on today from his week, each with its one main action (record, log sets, log the
// run), what needs him, the week at a glance, and Monday's look back. Replaces Home.
import { h, fill, row, iconButton, sec, toast } from '../ui.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { recordSheet } from '../capture.js';
import { slotsFor, doneFor, weekDates, weekTotals, mondayOf, weekReview } from '../week.js';
import { todayISO, shortTime } from '../dates.js';
import { dayLabel, profileMap, runTypes, sessionPaces, paceSummary, addDays } from '../training.js';
import { suggestNext, info } from '../lifting.js';
import { allLifts } from './lift.js';
import { thisWeek, tipsFor, topicsFor, topicKey } from '../journal.js';
import { newest, uid, plural } from '../util.js';
import { questionsFor } from './shared.js';

const ICON = { bjj: 'belt', run: 'footprints', lift: 'dumbbell', dance: 'music', philosophy: 'lightbulb' };
const NAME = { bjj: 'BJJ', run: 'Run', lift: 'Lift', dance: 'Dance', philosophy: 'Philosophy' };
const TAB = { bjj: 'bjj', run: 'run', lift: 'lift', dance: 'dance', philosophy: 'think' };
const kg = (w) => String(Math.round(w * 100) / 100);
const ORDER = ['run', 'lift', 'bjj', 'dance', 'philosophy']; // the strip's fixed order (colours checked in pairs)

const badge = (activity, { done, optional }) => h('span', { class: `act act-${activity}${done ? ' done' : ''}${optional ? ' opt' : ''}`, 'aria-hidden': 'true' }, icon(ICON[activity], { size: 18 }));

function slotTitle(slot) {
  if (slot.activity === 'run') return slot.what || 'Run';
  if (slot.activity === 'lift') return slot.lifts.length ? slot.lifts.join(', ') : slot.what || 'Lift';
  if (slot.activity === 'dance') return slot.what || (slot.tags.includes('social') ? 'Social' : 'Dance class');
  if (slot.activity === 'philosophy') return slot.what || 'Philosophy meetup';
  return slot.what || NAME[slot.activity];
}

function slotDetail(ctx, slot, types) {
  if (slot.activity === 'run' && slot.run) {
    const pace = paceSummary(sessionPaces(slot.run, types));
    return [pace ? h('span', { class: 'num' }, pace) : null, types[slot.run.types[0]]?.feel ? ` · ${types[slot.run.types[0]].feel}` : ''];
  }
  if (slot.activity === 'lift') {
    const rows = allLifts(ctx).filter((r) => r.date < todayISO());
    const next = slot.lifts.map((name) => {
      const s = suggestNext(rows, name);
      return s ? `${name.split(' ')[0]} ${s.sets} × ${s.reps}${s.weight_kg ? ` @ ${info(name).bodyweight ? '+' : ''}${kg(s.weight_kg)}` : ''}` : '';
    }).filter(Boolean);
    return next.length ? h('span', { class: 'num' }, `Next: ${next.join(' · ')}`) : 'Log each set as you go';
  }
  const bits = [slot.hours !== '' ? `${slot.hours} h` : '', slot.optional ? 'optional' : '', slot.tags.filter((t) => t !== 'class' && t !== 'social').join(' + ')].filter(Boolean);
  return bits.join(' · ');
}

function slotCard(ctx, slot, iso, data, types) {
  const done = doneFor(slot, iso, data);
  const isToday = iso === todayISO();
  const actions = [];
  const btn = (label, onclick, cls = 'primary') => h('button', { type: 'button', class: `${cls} slotbtn`, onclick }, label);
  if (isToday) {
    if (slot.activity === 'run') actions.push(done ? h('span', { class: 'chip ok' }, icon('check', { size: 14 }), ' Sent') : btn('Log run', () => ctx.show('run')));
    if (slot.activity === 'lift') actions.push(btn(done ? 'Carry on' : 'Log sets', () => ctx.show('lift')));
    if (slot.activity === 'bjj') actions.push(btn([icon('mic', { size: 16 }), done ? ' Add more' : ' Record'], () => recordSheet(ctx, 'bjj', slot), done ? 'secondary' : 'primary'), btn('Before class', () => ctx.show('bjj'), 'secondary'));
    if (slot.activity === 'dance') {
      if (slot.tags.includes('social')) actions.push(btn('Before it', () => ctx.show('dance/social'), 'secondary'), btn([icon('mic', { size: 16 }), ' Record'], () => recordSheet(ctx, 'dance', slot), done ? 'secondary' : 'primary'));
      else actions.push(btn([icon('mic', { size: 16 }), done ? ' Add more' : ' Record'], () => recordSheet(ctx, 'dance', slot), done ? 'secondary' : 'primary'), btn('Moves', () => ctx.show('dance'), 'secondary'));
    }
    if (slot.activity === 'philosophy') actions.push(btn([icon('mic', { size: 16 }), done ? ' Add more' : ' Record'], () => recordSheet(ctx, 'philosophy', slot), done ? 'secondary' : 'primary'));
  }
  return h('div', { class: `slot${done ? ' isdone' : ''}${slot.optional ? ' isopt' : ''}`, 'data-act': slot.activity },
    h('div', { class: 'slottime num' }, slot.clock || ''),
    badge(slot.activity, { done, optional: slot.optional && !done }),
    h('div', { class: 'slotbody' },
      h('div', { class: 'slottitle' }, slotTitle(slot), done && slot.activity !== 'run' ? h('span', { class: 'tick', 'aria-label': 'done' }, icon('check', { size: 16, stroke: 2.6 })) : null),
      h('div', { class: 'slotsub' }, slotDetail(ctx, slot, types)),
      actions.length ? h('div', { class: 'slotacts' }, actions) : null));
}

function weekStrip(ctx, today, data) {
  const plan = ctx.state.plan;
  const week = ctx.week();
  return h('div', { class: 'strip', role: 'list', 'aria-label': 'This week' }, weekDates(today).map((iso) => {
    const slots = slotsFor(week, plan, iso).sort((a, b) => ORDER.indexOf(a.activity) - ORDER.indexOf(b.activity));
    return h('div', { class: `stripday${iso === today ? ' now' : ''}`, role: 'listitem', 'aria-label': `${dayLabel(iso)}: ${slots.map((s) => `${NAME[s.activity]}${doneFor(s, iso, data) ? ' done' : ''}`).join(', ') || 'rest'}` },
      h('div', { class: 'stripname' }, dayLabel(iso).slice(0, 1)),
      slots.length ? slots.map((s) => badge(s.activity, { done: doneFor(s, iso, data), optional: s.optional })) : h('span', { class: 'meta' }, '·'));
  }));
}

export function today(root, ctx) {
  const eyebrow = h('p', { class: 'eyebrow' });
  const needs = h('div');
  const fresh = h('div');
  const review = h('div');
  const slotsBox = h('div');
  const tomorrow = h('div');
  const weekBox = h('div');
  const bottom = h('div');
  root.append(h('header', { class: 'head' }, h('div', null, eyebrow, h('h1', null, 'Today')), h('div', { class: 'headacts' }, iconButton('settings', 'Settings', () => ctx.show('today/settings')))), needs, fresh, review, slotsBox, tomorrow, weekBox, bottom);

  // "Tell the app your week" (also "Change my week"): sent as a question of kind week.
  const weekText = h('textarea', { rows: '4', placeholder: 'Mon: dance 19:00. Tue: lift, then BJJ 1 h. Wed: easy run in the morning…' });
  const weekMsg = h('p', { class: 'msg', role: 'status' });
  const weekForm = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      const t = weekText.value.trim();
      if (!t) return;
      const sent = await ctx.submit([{ tab: ctx.TABS.questions, rows: [{ id: uid(), question: t, kind: 'week' }] }], (m) => (weekMsg.textContent = m), 'Sending');
      weekText.value = '';
      weekMsg.textContent = sent ? `Sent. Claude sets up your week at the ${ctx.runAt()} run (or tap Run now).` : 'No signal. It is safe on this phone and goes out later.';
      ctx.refresh();
    },
  }, weekText, h('button', { class: 'primary', type: 'submit' }, 'Send'), weekMsg);

  const fbText = h('textarea', { rows: '3', placeholder: 'What to change, what is annoying, what you want next.' });
  const fbMsg = h('p', { class: 'msg', role: 'status' });
  const fbForm = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      const t = fbText.value.trim();
      if (!t) return;
      const sent = await ctx.submit([{ tab: ctx.TABS.feedback, rows: [{ id: uid(), text: t }] }], (m) => (fbMsg.textContent = m), 'Sending');
      fbText.value = '';
      fbMsg.textContent = sent ? `Sent. Claude reads it at the ${ctx.runAt()} run.` : 'No signal. It is safe on this phone and goes out later.';
      ctx.refresh();
    },
  }, fbText, h('button', { class: 'primary', type: 'submit' }, 'Send'), fbMsg);

  return () => {
    const iso = todayISO();
    const now = new Date();
    eyebrow.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    const data = ctx.state;
    const types = runTypes(profileMap(ctx.state.profile).run_types);
    const week = ctx.week();

    // Needs you: decisions, the script paste, the last run's note.
    const open = ctx.state.decisions.filter((d) => d.status === 'open');
    const lastLog = newest(ctx.state.log, 'started_at')[0];
    const v = ctx.serverVersion();
    fill(needs,
      v > 0 && v < 5 ? h('section', { class: 'card warn' }, h('strong', null, 'One step on the laptop'), h('p', null, 'Paste the new sheet script so dance, philosophy and the safer saving work. Notes you take meanwhile wait safely on this phone.'),
        h('ol', null, h('li', null, 'Sheet: File › Version history › Name current version'), h('li', null, 'Extensions › Apps Script: replace Code.gs with the new one, save, run setup'), h('li', null, 'Deploy › Manage deployments › edit › New version › Deploy'))) : null,
      open.map((d) => h('section', { class: 'card decision' }, h('div', { class: 'label' }, 'Claude needs a decision'), h('p', { class: 'pre' }, d.question), h('div', { class: 'choices' },
        String(d.options).split('|').map((o) => o.trim()).filter(Boolean).map((o) => h('button', {
          type: 'button',
          class: o === String(d.recommended).trim() ? 'primary' : 'secondary',
          onclick: async () => {
            try {
              await ctx.api.call('update', { tab: ctx.TABS.decisions, id: d.id, fields: { answer: o } });
              d.status = 'answered';
              d.answer = o;
              ctx.update();
            } catch (e) {
              toast(ctx.errorText(e));
            }
          },
        }, o === String(d.recommended).trim() ? `${o} (recommended)` : o))))),
      lastLog?.needs_you ? h('section', { class: 'card warn' }, h('strong', null, 'Needs you: '), lastLog.needs_you) : null);

    // One line for anything new since he last looked.
    const seenReplies = new Set(store.get('seenReplies', []));
    const seenAnswers = new Set(store.get('seenAnswers', []));
    const seenConcepts = new Set(store.get('seenConcepts', []));
    const replies = ctx.state.coach.filter((r) => r.reply && !seenReplies.has(r.id)).length;
    const answers = ctx.state.questions.filter((q) => q.status === 'answered' && q.kind !== 'week' && !seenAnswers.has(q.id)).length;
    const concepts = topicsFor(ctx.state.topics, 'philosophy').filter((t) => t.expansion && !seenConcepts.has(topicKey(t.topic))).length;
    const shipped = lastLog?.shipped && store.get('shippedSeen', '') !== lastLog.id ? lastLog.shipped : '';
    const parts = [replies ? `Coach replied${replies > 1 ? ` (${replies})` : ''}` : '', answers ? plural(answers, 'answer') : '', concepts ? `${plural(concepts, 'concept')} researched` : ''].filter(Boolean);
    fill(fresh,
      parts.length ? h('button', { type: 'button', class: 'newline', onclick: () => ctx.show(replies ? 'run' : concepts ? 'think' : questionsFor(ctx.state.questions, 'philosophy').some((q) => q.status === 'answered' && !seenAnswers.has(q.id)) ? 'think/ask' : 'bjj/ask') }, h('span', { class: 'dot' }), h('span', null, parts.join(' · ')), icon('chevron-right', { size: 18 })) : null,
      shipped ? h('div', { class: 'card shipped' }, h('div', { class: 'label' }, 'New in the app'), h('p', null, shipped), h('button', { type: 'button', class: 'link small', onclick: () => { store.set('shippedSeen', lastLog.id); ctx.update(); } }, 'Got it')) : null);

    // Monday's look back at last week, until dismissed.
    const monday = mondayOf(iso);
    if (now.getDay() === 1 && store.get('reviewSeen', '') !== monday) {
      const r = weekReview(data, iso);
      const t = r.totals;
      fill(review, h('section', { class: 'card review' }, h('div', { class: 'labelrow' }, h('span', { class: 'label' }, 'Last week'), h('button', { type: 'button', class: 'link small', onclick: () => { store.set('reviewSeen', monday); ctx.update(); } }, 'Done')),
        h('div', { class: 'stats4' }, stat(`${t.bjjHours} h`, `BJJ, ${plural(t.bjjSessions, 'session')}`), stat(`${t.runKm} km`, `${plural(t.runs, 'run')}`), stat(String(t.liftDays), 'lift days'), stat(`${t.danceHours} h`, 'dance')),
        r.facts.map((f) => h('p', { class: 'fact' }, icon('trophy', { size: 16 }), ` ${f}`))));
    } else fill(review);

    // Today's slots.
    const slots = slotsFor(week, ctx.state.plan, iso);
    const fixed = slots.filter((s) => !s.optional);
    const optional = slots.filter((s) => s.optional);
    fill(slotsBox,
      !week ? h('section', { class: 'card tint' }, h('strong', null, 'Tell the app your week'), h('p', { class: 'meta' }, 'Type or dictate your usual week (and one-offs). Claude turns it into this screen: what is on today, with one tap to record or log it.'), weekForm, weekAnswer(ctx)) : null,
      sec('Today'),
      fixed.length || optional.length
        ? [fixed.length ? h('section', { class: 'card slots' }, fixed.map((s) => slotCard(ctx, s, iso, data, types))) : null,
            optional.length ? h('section', { class: 'card slots' }, h('div', { class: 'label' }, fixed.length ? 'Later, if you go' : 'If you go'), optional.map((s) => slotCard(ctx, s, iso, data, types))) : null]
        : h('section', { class: 'card' }, h('p', { class: 'meta' }, week ? 'Nothing planned today. Rest counts too.' : 'Your runs show up here from the plan. The rest comes with your week.')));

    // After 20:00: tomorrow's first thing.
    const tmr = now.getHours() >= 20 ? slotsFor(week, ctx.state.plan, addDays(iso, 1)) : [];
    fill(tomorrow, tmr.length ? h('section', { class: 'card tomorrow' }, icon('moon', { size: 20 }), h('div', null, h('div', { class: 'label' }, 'Tomorrow'),
      tmr.slice(0, 3).map((s) => h('div', null, h('span', { class: 'num' }, s.clock ? `${s.clock} ` : ''), slotTitle(s), s.activity === 'run' && s.run ? h('span', { class: 'meta num' }, ` · ${paceSummary(sessionPaces(s.run, types))}`) : null)),
      tmr.some((s) => s.activity === 'philosophy') && thisWeek(tipsFor(ctx.state.journal, 'philosophy'), topicsFor(ctx.state.topics, 'philosophy'), iso).question ? h('div', { class: 'meta' }, 'Bring your question to the meetup.') : null)) : null);

    // The week at a glance.
    const t = weekTotals(data, monday);
    fill(weekBox, sec('This week'), h('section', { class: 'card' }, weekStrip(ctx, iso, data),
      h('div', { class: 'stats4' }, stat(`${t.bjjHours} h`, 'BJJ'), stat(`${t.runKm} km`, 'Run'), stat(String(t.liftDays), t.liftDays === 1 ? 'Lift day' : 'Lift days'), stat(`${t.danceHours} h`, 'Dance'))));

    // Everything else from Home, one tap away.
    const ran = lastLog ? `Claude ran ${shortTime(lastLog.started_at)}${lastLog.finished_at ? '' : ' (still going)'}` : `Claude runs at ${ctx.runAt()}`;
    fill(bottom, h('div', { class: 'list' },
      h('details', { class: 'rowfold' }, h('summary', null, icon('plus', { size: 20 }), h('span', null, 'Log something else')),
        h('div', { class: 'picks' }, ['bjj', 'run', 'lift', 'dance', 'philosophy'].map((a) => h('button', { type: 'button', class: `pick act-pick-${a}`, onclick: () => (a === 'run' || a === 'lift' ? ctx.show(TAB[a]) : recordSheet(ctx, a, {})) }, icon(ICON[a], { size: 16 }), ` ${NAME[a]}`)))),
      week ? h('details', { class: 'rowfold' }, h('summary', null, icon('calendar-days', { size: 20 }), h('span', null, 'Change my week')), weekForm, weekAnswer(ctx)) : null,
      h('details', { class: 'rowfold' }, h('summary', null, icon('message-circle', { size: 20 }), h('span', null, 'Feedback for Claude')), fbForm),
      h('div', { class: 'row static claude' }, h('span', { class: `dot ${lastLog && !lastLog.needs_you ? 'ok' : ''}` }), h('span', { class: 'rowtext' }, h('span', { class: 'rowlabel' }, ran), lastLog?.summary ? h('span', { class: 'rowsub' }, lastLog.summary) : null),
        h('button', { type: 'button', class: 'chipbtn', onclick: () => ctx.fileNow({ say: toast }) }, 'Run now'))));
  };
}

const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'statval' }, value), h('div', { class: 'meta' }, label));

// The latest answer to a week message (what Claude saved), so he can check it.
function weekAnswer(ctx) {
  const q = newest(ctx.state.questions.filter((x) => x.kind === 'week' && x.status !== 'cancelled'), 'asked_at')[0];
  if (!q) return null;
  return h('div', { class: 'note' }, q.status === 'answered' ? h('p', { class: 'pre' }, q.answer) : h('p', null, `Sent ${shortTime(q.asked_at)}. Claude sets it up at the ${ctx.runAt()} run.`));
}
