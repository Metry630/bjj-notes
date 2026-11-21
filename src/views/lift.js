// Lift: today's planned lifts as cards. Every set is one tap (Log set), prefilled from the last one,
// so three triples and then a heavy single are just four taps with different numbers. Sets go through
// the outbox, so a gym basement with no signal loses nothing.
import { h, fill, row, header, backBar, sec, stepper, picker, toast } from '../ui.js';
import { info, setsOf, sessions, line, bestE1rm, suggestNext, prFor, exerciseNames, groupByDate, EFFORTS, validEntry, bests, series } from '../lifting.js';
import { todayISO } from '../dates.js';
import { dayLabel } from '../training.js';
import { slotsFor } from '../week.js';
import { uid, clock, plural } from '../util.js';
import { lineChart } from '../charts.js';

const kg = (w) => String(Math.round(w * 100) / 100);

// Server rows plus sets still waiting on the phone, as lift rows.
export function allLifts(ctx) {
  const queued = ctx.state.queue.filter((q) => q.tab === ctx.TABS.lifting && q.op !== 'update').map((q) => ({ ...q.rows[0], created_at: q.rows[0].created_at || q.at, queued: true }));
  const ids = new Set(ctx.state.lifting.map((r) => r.id));
  return [...ctx.state.lifting, ...queued.filter((r) => !ids.has(r.id))];
}

function plannedToday(ctx) {
  const today = todayISO();
  const planned = slotsFor(ctx.week(), [], today).filter((s) => s.activity === 'lift').flatMap((s) => s.lifts);
  const logged = setsOf(allLifts(ctx)).filter((s) => s.date === today).map((s) => s.exercise);
  const extra = ctx.state.liftExtra || [];
  return [...new Set([...planned, ...logged, ...extra])];
}

function exerciseCard(ctx, name, rerender) {
  const ex = info(name);
  const today = todayISO();
  const rows = allLifts(ctx);
  const all = setsOf(rows, name);
  const todays = all.filter((s) => s.date === today);
  const past = sessions(rows, name).filter((s) => s.date < today);
  const last = past[0];
  const sugg = suggestNext(rows.filter((r) => r.date < today), name);
  const lastSet = todays[todays.length - 1];
  const start = lastSet || (sugg ? { w: sugg.weight_kg, r: sugg.reps } : last ? { w: last.sets[last.sets.length - 1].w, r: last.sets[last.sets.length - 1].r } : { w: ex.bodyweight ? 0 : 20, r: 5 });
  const weight = stepper({ label: ex.bodyweight ? 'Added kg' : 'Weight, kg', value: start.w, step: ex.step, min: 0, max: 500, decimals: 2 });
  const reps = stepper({ label: 'Reps', value: start.r, step: 1, min: 1, max: 100 });
  const best = bestE1rm(todays.length ? todays : last?.sets || []);

  const logSet = async () => {
    const w = weight.get();
    const r = reps.get();
    const bad = validEntry({ exercise: name, weight_kg: w, reps: r });
    if (bad) return toast(bad);
    const earlier = setsOf(allLifts(ctx), name);
    const id = uid();
    const at = new Date().toISOString();
    ctx.state.lastSetAt = Date.now();
    await ctx.submit([{ tab: ctx.TABS.lifting, rows: [{ id, date: today, exercise: name, weight_kg: w, sets: 1, reps: r, created_at: at }], at }], () => {}, '');
    const pr = prFor({ w, r }, earlier);
    if (pr.length) toast(`★ New best: ${kg(w)} × ${r}, ${pr[0]}`, { ms: 4000 });
    rerender();
  };

  const effort = todays.length
    ? h('div', { class: 'effortrow' }, h('span', { class: 'meta' }, 'That set felt'),
        picker(EFFORTS, { initial: lastSet?.effort || '', onchange: (v) => ctx.patch(ctx.TABS.lifting, lastSet.id, { effort: v || '' }) }).el)
    : null;

  const chips = todays.map((s, i) =>
    h('button', {
      type: 'button',
      class: `setchip num${i === todays.length - 1 ? ' last' : ''}${s.row.queued ? ' queued' : ''}`,
      'aria-label': `${kg(s.w)} kilograms, ${s.r} reps. Tap for options`,
      onclick: () => {
        const box = h('div', { class: 'setmenu' },
          h('button', { type: 'button', class: 'chipbtn', onclick: () => { weight.set(s.w, true); reps.set(s.r, true); box.remove(); logSet(); } }, 'Same again'),
          h('button', { type: 'button', class: 'chipbtn warn', onclick: () => { box.remove(); ctx.cancel(ctx.TABS.lifting, s.id, `Removed ${kg(s.w)} × ${s.r}.`); } }, 'Remove'));
        chipRow.after(box);
      },
    }, s.w ? `${ex.bodyweight ? '+' : ''}${kg(s.w)} × ${s.r}` : `${s.r} reps`));
  const chipRow = h('div', { class: 'setchips' }, chips.length ? chips : h('span', { class: 'meta' }, 'No sets yet today.'));
  const rest = h('span', { class: 'rest num' });
  if (lastSet) {
    const since = () => Math.max(0, Math.round((Date.now() - Date.parse(lastSet.at || lastSet.row.created_at || new Date().toISOString())) / 1000));
    const tick = () => {
      if (!rest.isConnected) return clearInterval(t);
      const sec = since();
      rest.textContent = sec < 3600 ? `Rest ${clock(sec)}` : '';
    };
    const t = setInterval(tick, 1000);
    tick();
  }

  return h('section', { class: 'card liftcard', 'aria-label': name },
    h('div', { class: 'lifthead' }, h('h3', null, name), best ? h('span', { class: 'meta' }, todays.length ? 'today, est. 1RM ' : 'est. 1RM ', h('strong', { class: 'num big' }, kg(best))) : null),
    last ? h('p', { class: 'meta' }, `Last time, ${dayLabel(last.date)}: `, h('span', { class: 'num ink' }, line(last.sets, ex.bodyweight))) : h('p', { class: 'meta' }, 'First time logging this one here.'),
    sugg && !todays.length ? h('div', { class: 'suggest' }, h('div', null, h('strong', { class: 'num' }, `Next: ${sugg.sets} × ${sugg.reps}${sugg.weight_kg ? ` @ ${ex.bodyweight ? '+' : ''}${kg(sugg.weight_kg)}` : ''}`), h('div', { class: 'meta' }, sugg.why)),
      h('button', { type: 'button', class: 'chipbtn solid', onclick: () => { weight.set(sugg.weight_kg, true); reps.set(sugg.reps, true); } }, 'Use')) : null,
    h('div', { class: 'labelrow' }, h('span', { class: 'label' }, 'Today'), rest),
    chipRow,
    h('div', { class: 'steppers' }, weight.el, reps.el),
    h('button', { type: 'button', class: 'primary wide logset', onclick: logSet }, 'Log set'),
    effort);
}

export function lift(root, ctx) {
  const sub = h('p', { class: 'headsub' });
  const cards = h('div');
  const add = h('div');
  const more = h('div');
  root.append(h('header', { class: 'head' }, h('div', null, h('h1', null, 'Lift'), sub)), cards, add, more);
  const draw = () => {
    const today = todayISO();
    const names = plannedToday(ctx);
    const slot = slotsFor(ctx.week(), [], today).find((s) => s.activity === 'lift');
    sub.textContent = slot ? `${dayLabel(today).split(' ')[0]} · ${slot.lifts.join(', ') || slot.what || 'lifting'}` : names.length ? 'Today' : 'Nothing planned today. Add a lift below.';
    fill(cards, names.map((n) => exerciseCard(ctx, n, draw)));
    const others = exerciseNames(allLifts(ctx)).filter((n) => !names.includes(n)).slice(0, 6);
    const other = h('input', { type: 'text', placeholder: 'Other lift', maxlength: '40', 'aria-label': 'Other lift' });
    fill(add, h('div', { class: 'addrow' }, h('span', { class: 'label' }, 'Add'),
      others.map((n) => h('button', { type: 'button', class: 'pick', onclick: () => { ctx.state.liftExtra = [...(ctx.state.liftExtra || []), n]; draw(); } }, n)),
      h('form', { class: 'otherlift', onsubmit: (e) => { e.preventDefault(); const v = other.value.trim(); if (v) { ctx.state.liftExtra = [...(ctx.state.liftExtra || []), v]; draw(); } } }, other, h('button', { type: 'submit', class: 'chipbtn' }, 'Add'))));
    const days = groupByDate(allLifts(ctx)).filter((g) => g.date !== today);
    fill(more,
      days.length ? sec('History') : null,
      days.length ? h('div', { class: 'list' }, days.slice(0, 12).map((g) => {
        const byEx = [...new Set(g.items.map((r) => r.exercise))];
        return h('details', { class: 'logitem' },
          h('summary', null, h('span', { class: 'meta num' }, dayLabel(g.date)), h('span', { class: 'logwhat' }, byEx.join(', '))),
          byEx.map((e) => h('p', null, h('strong', null, `${e}: `), h('span', { class: 'num' }, line(setsOf(g.items, e), info(e).bodyweight)))));
      })) : null,
      h('div', { class: 'list' },
        row({ label: 'Progress', sub: 'Estimated 1RM and best sets per lift', onclick: () => ctx.show('lift/progress') }),
        row({ label: 'Ask the coach', sub: 'Running and lifting, one body', onclick: () => ctx.show('run', { ask: true }) })));
  };
  return draw;
}

export function liftProgress(root, ctx) {
  const out = h('div');
  root.append(backBar('Lift', () => ctx.show('lift')), header('Progress'), out);
  return () => {
    const rows = allLifts(ctx);
    const names = exerciseNames(rows).filter((n) => setsOf(rows, n).length);
    if (!names.length) return fill(out, h('p', { class: 'meta' }, 'Log a few sessions and your progress shows up here.'));
    const pick = ctx.state.liftPick && names.includes(ctx.state.liftPick) ? ctx.state.liftPick : names[0];
    const ex = info(pick);
    const pts = series(rows, pick);
    const b = bests(setsOf(rows, pick));
    fill(out,
      h('div', { class: 'picks' }, names.map((n) => h('button', { type: 'button', class: n === pick ? 'pick on' : 'pick', onclick: () => { ctx.state.liftPick = n; ctx.update(); } }, n))),
      h('section', { class: 'card' },
        h('div', { class: 'label' }, ex.bodyweight ? 'Best reps in a set, per session' : 'Estimated 1RM, per session (best set)'),
        pts.length >= 2 ? lineChart(pts.map((p) => ({ x: p.date, y: p.value })), { unit: ex.bodyweight ? 'reps' : 'kg', label: `${pick} progress` }) : h('p', { class: 'meta' }, 'Two sessions and the line appears.'),
        pts.length ? h('p', { class: 'meta' }, summaryLine(pts, ex.bodyweight)) : null),
      !ex.bodyweight ? h('section', { class: 'card' }, h('div', { class: 'label' }, 'Personal bests'),
        h('div', { class: 'pbgrid' },
          b.e1rm ? pb('Est. 1RM', `${kg(b.e1rm.value)} kg`, `${kg(b.e1rm.w)} × ${b.e1rm.r}, ${dayLabel(b.e1rm.date)}`) : null,
          [1, 3, 5].map((n) => (b.heaviest[n] ? pb(`Heaviest ${n}+`, `${kg(b.heaviest[n].w)} kg`, dayLabel(b.heaviest[n].date)) : null)))) : null);
  };
}

const pb = (label, value, sub) => h('div', { class: 'pb' }, h('div', { class: 'meta' }, label), h('div', { class: 'num big' }, value), h('div', { class: 'meta' }, sub));

function summaryLine(pts, bodyweight) {
  const first = pts[0];
  const lastP = pts[pts.length - 1];
  const diff = Math.round((lastP.value - first.value) * 10) / 10;
  const unit = bodyweight ? ' reps' : ' kg';
  if (pts.length < 2) return `${lastP.value}${unit} on ${dayLabel(lastP.date)}.`;
  return `${diff >= 0 ? 'Up' : 'Down'} ${Math.abs(diff)}${unit} since ${dayLabel(first.date)} (${plural(pts.length, 'session')}).`;
}
