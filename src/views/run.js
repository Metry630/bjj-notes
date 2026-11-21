// Run: the running coach. Today's (or the next) session on top, the report form only when it is
// needed, and a calm coach log: the latest reply in full, earlier messages one line each.
import { h, fill, row, header, backBar, sec, picker, fold, toast } from '../ui.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { shrink, imageBatches, MAX_IMAGES } from '../images.js';
import { weekOf, sessionDays, profileMap, ladderState, daysBetween, dayLabel, runTypes, sessionPaces, paceSummary, sessionOn, nextSession, addDays, weeklyKm } from '../training.js';
import { todayISO, shortTime } from '../dates.js';
import { newest, plural, uid } from '../util.js';
import { barChart, lineChart } from '../charts.js';

const FEELS = [['easy', 'Easy'], ['ok', 'OK'], ['hard', 'Hard'], ['very hard', 'Very hard']];
const PAINS = [['none', 'None'], ['shin', 'Shin'], ['hamstring', 'Hamstring'], ['other', 'Other']];
const KIND = { run: 'Run', ask: 'Question', checkin: 'Morning check', coach: 'Coach' };
const COACH_TEXTS = {
  quiet: (at) => `Sent. The coach replies at ${at} (quiet hours), or tap Reply now.`,
  started: 'Sent. The coach is on it: the reply shows up here in about 5 minutes.',
  busy: 'Sent. A run is already going. If it misses this, tap Reply now in a few minutes.',
  failed: (e) => `Sent, but the coach could not start: ${e}`,
};
const firstLine = (t) => String(t || '').split(/(?<=[.!?])\s|\n/)[0].slice(0, 90);

function sessionCard(ctx, s, today, types) {
  if (!s) return h('section', { class: 'card' }, h('p', { class: 'meta' }, 'Your next session shows here once the coach has set up the plan.'));
  const t = types[s.types[0]];
  const pace = paceSummary(sessionPaces(s, types));
  const when = s.date === today ? 'Today' : s.date === addDays(today, 1) ? 'Tomorrow' : dayLabel(s.date);
  const how = s.types.map((k) => types[k]).filter((x) => x?.how);
  return h('section', { class: 'card tint session' },
    h('div', { class: 'label' }, when === dayLabel(s.date) ? when : `${when} · ${dayLabel(s.date)}`),
    h('div', { class: 'sessionwhat' }, s.what || 'Run'),
    pace ? h('div', { class: 'pace num' }, pace) : null,
    t?.feel ? h('p', { class: 'meta' }, t.feel) : null,
    how.length ? h('details', null, h('summary', null, 'How to run it'), how.map((x) => h('p', null, h('strong', null, `${x.name}: `), x.how))) : null);
}

export function run(root, ctx) {
  const top = h('div');
  const check = h('div');
  const logBox = h('div');
  const coach = h('div');
  const rest = h('div');
  const msg = h('p', { class: 'msg', role: 'status' });
  const say = (t) => (msg.textContent = t);
  const sub = h('p', { class: 'headsub' });
  root.append(h('header', { class: 'head' }, h('div', null, h('h1', null, 'Run'), sub)), top, check, logBox, msg, coach, rest);

  // -- the run report: screenshots, two taps, an optional note --
  let shots = [];
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'vh' });
  const addShots = h('label', { class: 'secondary filepick' }, icon('image', { size: 20 }), h('span', null, 'Add Strava screenshots'), file);
  const thumbs = h('div', { class: 'thumbs' });
  const drawThumbs = () => {
    fill(thumbs, shots.map((x, i) => h('div', { class: 'thumb' }, h('img', { src: x.dataUrl, alt: `Screenshot ${i + 1}` }), h('button', { type: 'button', class: 'link small', onclick: () => { shots.splice(i, 1); drawThumbs(); } }, 'Remove'))));
    addShots.querySelector('span').textContent = shots.length ? 'Add more screenshots' : 'Add Strava screenshots';
    file.disabled = shots.length >= MAX_IMAGES;
    addShots.classList.toggle('off', file.disabled);
  };
  file.addEventListener('change', async () => {
    const files = [...file.files].slice(0, MAX_IMAGES - shots.length);
    file.value = '';
    if (!files.length) return;
    say('Preparing screenshots…');
    let failed = 0;
    for (const f of files) {
      try {
        shots.push(await shrink(f));
      } catch {
        failed++;
      }
    }
    say(failed ? `${plural(failed, 'file')} could not be read as an image.` : '');
    drawThumbs();
  });
  const date = h('input', { type: 'date', value: todayISO(), required: true, oninput: (e) => (e.target.dataset.touched = '1') });
  const feel = picker(FEELS);
  const pain = picker(PAINS);
  const note = h('textarea', { rows: '3', placeholder: 'Anything else? How it went, where it hurt (optional).' });
  const send = h('button', { class: 'primary', type: 'submit' }, 'Send to coach');
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      if (!shots.length && !note.value.trim()) return say('Add a screenshot or a few words first.');
      send.disabled = true;
      const id = uid();
      const n = shots.length;
      const entries = [
        { tab: ctx.TABS.coach, rows: [{ id, kind: 'run', run_date: date.value, text: note.value.trim(), feel: feel.value(), pain: pain.value(), images: n }] },
        ...shots.flatMap((x, i) => imageBatches(id, i + 1, x.b64, x.mime).map((rows) => ({ tab: ctx.TABS.images, rows }))),
      ];
      const sent = await ctx.submit(entries, say, n ? `Sending ${plural(n, 'screenshot')}` : 'Sending');
      shots = [];
      drawThumbs();
      note.value = '';
      feel.reset();
      pain.reset();
      if (!sent) say('No signal. It is safe on this phone and goes out when you are back online.');
      else {
        await ctx.refresh();
        await ctx.fileNow({ auto: true, texts: COACH_TEXTS, say });
      }
      send.disabled = false;
      ctx.update();
    },
  }, addShots, thumbs, h('label', null, 'Date of the run', date), h('div', { class: 'label' }, 'How did it feel?'), feel.el, h('div', { class: 'label' }, 'Any pain?'), pain.el, note, send);

  const askText = h('textarea', { rows: '3', placeholder: 'Not lifting this week, can I do more? Squats the day before a long run?' });
  const askBtn = h('button', { class: 'primary', type: 'submit' }, 'Ask the coach');
  const askForm = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      const t = askText.value.trim();
      if (!t) return;
      askBtn.disabled = true;
      const sent = await ctx.submit([{ tab: ctx.TABS.coach, rows: [{ id: uid(), kind: 'ask', text: t }] }], say, 'Sending');
      askText.value = '';
      if (sent) {
        await ctx.refresh();
        await ctx.fileNow({ auto: true, texts: COACH_TEXTS, say });
      } else say('No signal. Your question is safe on this phone.');
      askBtn.disabled = false;
    },
  }, askText, askBtn);
  const askBox = h('details', { class: 'type', open: ctx.state.opts?.ask ? true : null }, h('summary', null, 'Ask the coach (running or lifting)'), askForm);

  async function checkin(r, p, where) {
    const sent = await ctx.submit([{ tab: ctx.TABS.coach, rows: [{ id: uid(), kind: 'checkin', run_date: r.run_date, pain: p, text: where }] }], say, 'Sending');
    if (!sent) return say('No signal. Saved on this phone.');
    await ctx.refresh();
    if (p === 'none') say('Noted. The coach counts it at the next run.');
    else await ctx.fileNow({ auto: true, texts: COACH_TEXTS, say });
  }

  return () => {
    const today = todayISO();
    const profile = profileMap(ctx.state.profile);
    const race = profile.race && typeof profile.race === 'object' ? profile.race : null;
    const types = runTypes(profile.run_types);
    sub.textContent = race ? [race.name || 'Race', race.date ? `${daysBetween(today, race.date)} days` : '', race.goal ? `goal ${race.goal}` : ''].filter(Boolean).join(' · ') : '';
    const s = sessionOn(ctx.state.plan, today) || nextSession(ctx.state.plan, today);
    fill(top, sessionCard(ctx, s, today, types));

    const items = newest(ctx.state.coach.filter((r) => r.status !== 'cancelled' && r.status !== 'test'), 'created_at');
    const lastRun = items.find((r) => r.kind === 'run' && r.run_date);
    const checked = lastRun && ctx.state.coach.some((r) => r.kind === 'checkin' && r.run_date === lastRun.run_date && r.status !== 'cancelled');
    const since = lastRun ? daysBetween(lastRun.run_date, today) : 0;
    if (lastRun && !checked && since >= 1 && since <= 2) {
      const where = h('input', { type: 'text', placeholder: 'Where, and how bad?', maxlength: '200' });
      const box = h('div', { class: 'check', hidden: true }, where, h('button', { type: 'button', class: 'primary', onclick: () => checkin(lastRun, 'some', where.value.trim()) }, 'Send'));
      fill(check, h('section', { class: 'card' }, h('div', { class: 'label' }, `Morning after ${dayLabel(lastRun.run_date)}`), h('div', { class: 'picks' },
        h('button', { type: 'button', class: 'pick', onclick: () => checkin(lastRun, 'none', '') }, 'No pain'),
        h('button', { type: 'button', class: 'pick', onclick: () => { box.hidden = false; where.focus(); } }, 'Some pain')), box));
    } else fill(check);

    const runDay = (iso) => sessionOn(ctx.state.plan, iso) && !/^rest/i.test(sessionOn(ctx.state.plan, iso).what || '');
    const reported = (iso) => ctx.state.coach.some((r) => r.kind === 'run' && r.run_date === iso && r.status !== 'cancelled');
    const due = [today, addDays(today, -1)].find((d) => runDay(d) && !reported(d));
    if (due && !date.dataset.touched) date.value = due;
    fill(logBox, h('details', { class: 'card logrun', open: due || shots.length ? true : null }, h('summary', null, icon('footprints', { size: 18 }), due ? ` Log ${due === today ? 'today’s' : 'yesterday’s'} run` : ' Log a run'), form));

    const waiting = items.filter((r) => r.status === 'new' && r.kind !== 'coach');
    const replied = items.filter((r) => r.reply || r.kind === 'coach');
    const [latest, ...earlier] = replied;
    const runOf = (r) => ctx.state.runs.find((x) => String(x.id) === String(r.id));
    const facts = (r) => [r.feel ? `felt ${r.feel}` : '', r.pain ? `pain: ${r.pain}` : '', Number(r.images) ? plural(Number(r.images), 'screenshot') : ''].filter(Boolean).join(' · ');
    const what = (r) => {
      const ru = runOf(r);
      if (r.kind === 'run') return `Run${ru?.distance_km ? ` ${ru.distance_km} km` : ''}${ru?.verdict ? ` · ${ru.verdict}` : ''}`;
      if (r.kind === 'coach') return `Week note · ${firstLine(r.text)}`;
      return `${KIND[r.kind] || 'Message'} · ${firstLine(r.text)}`;
    };
    const shown = store.get('coachShown', 5);
    fill(coach,
      sec('Coach'),
      waiting.map((r) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${KIND[r.kind] || 'Message'}${r.run_date ? ` · ${dayLabel(r.run_date)}` : ''} · sent ${shortTime(r.created_at)}`), r.text ? h('p', { class: 'pre' }, r.text) : null, facts(r) ? h('div', { class: 'meta' }, facts(r)) : null,
        h('div', { class: 'actions' }, ctx.filingNow() ? h('span', { class: 'chip wait' }, 'Coach is replying…') : [h('span', { class: 'chip wait' }, `Reply at ${ctx.runAt()}`), h('button', { class: 'link', type: 'button', onclick: () => ctx.fileNow({ texts: COACH_TEXTS, say }) }, 'Reply now')], h('button', { class: 'link small', type: 'button', onclick: () => ctx.cancel(ctx.TABS.coach, r.id, 'Message removed.') }, 'Remove')))),
      latest ? h('article', { class: 'card reply' }, h('div', { class: 'meta' }, `Latest · ${latest.kind === 'run' ? what(latest) : KIND[latest.kind] || 'Message'} · ${shortTime(latest.replied_at || latest.created_at)}`), latest.text && latest.kind !== 'coach' ? h('p', { class: 'asked' }, latest.text) : null, h('p', { class: 'pre lead' }, latest.reply || latest.text)) : waiting.length ? null : h('p', { class: 'meta' }, 'Send your first run and the coach replies here.'),
      earlier.length ? h('div', { class: 'list coachlist' },
        earlier.slice(0, shown).map((r) => h('details', { class: 'logitem', open: store.get(`coach:${r.id}`, false) ? true : null, ontoggle: (e) => store.set(`coach:${r.id}`, e.target.open) },
          h('summary', null, h('span', { class: 'meta num' }, dayLabel(String(r.run_date || r.created_at).slice(0, 10))), h('span', { class: 'logwhat' }, what(r))),
          r.text && r.kind !== 'coach' ? h('p', { class: 'asked' }, r.text) : null,
          h('p', { class: 'pre' }, r.reply || r.text),
          facts(r) ? h('div', { class: 'meta' }, facts(r)) : null)),
        earlier.length > shown ? h('button', { type: 'button', class: 'link more', onclick: () => { store.set('coachShown', shown + 10); ctx.update(); } }, `Show ${Math.min(10, earlier.length - shown)} more`) : null) : null,
      askBox);
    const seen = new Set(store.get('seenReplies', []));
    for (const r of ctx.state.coach) if (r.reply) seen.add(r.id);
    store.set('seenReplies', [...seen]);

    const week = weekOf(ctx.state.plan, today);
    const ladder = ladderState(profile.ladder);
    const plan = [...ctx.state.plan].sort((a, b) => Number(a.week) - Number(b.week));
    fill(rest,
      week ? [sec(`This week · W${week.week} ${week.block || ''}`), h('div', { class: 'list' }, sessionDays(week).map((x) => {
        const done = ctx.state.runs.filter((r) => r.date === x.date);
        const chip = done.length ? h('span', { class: 'chip ok num' }, done.map((r) => `${r.distance_km} km`).join(', ')) : x.date === today ? h('span', { class: 'chip wait' }, 'Today') : x.date < today && !/^rest/i.test(x.what || '') ? h('span', { class: 'chip' }, 'Not logged') : null;
        return h('div', { class: 'row static' }, h('span', { class: 'meta daycol' }, x.day), h('span', { class: 'rowtext' }, h('span', { class: 'rowlabel' }, x.what || 'Rest'), paceSummary(sessionPaces(x, types)) ? h('span', { class: 'rowsub num' }, paceSummary(sessionPaces(x, types))) : null), chip);
      })), week.note ? h('p', { class: 'note pre' }, week.note) : null] : null,
      ladder ? h('p', { class: 'meta ladder' }, ladder) : null,
      h('div', { class: 'list' }, row({ label: 'Progress', sub: 'Distance per week, long runs', onclick: () => ctx.show('run/progress') })),
      Object.keys(types).length ? fold('run:types', 'Run types and paces', Object.values(types).map((t) => h('div', { class: 'planrow' }, h('strong', null, t.name), t.pace ? h('span', { class: 'num' }, ` · ${t.pace}`) : '', t.feel ? h('div', { class: 'meta' }, t.feel) : '', t.how ? h('p', null, t.how) : ''))) : null,
      plan.length ? fold('run:plan', 'Full plan', plan.map((w) => h('div', { class: week && w.week === week.week ? 'planrow now' : 'planrow' },
        h('div', null, h('strong', null, `W${w.week}`), ` ${dayLabel(w.start)} · ${w.block || ''}`, w.status && w.status !== 'planned' ? [' ', h('span', { class: 'chip' }, w.status)] : ''),
        sessionDays(w).map((x) => h('div', { class: 'meta' }, `${x.day} ${x.what || 'Rest'}${paceSummary(sessionPaces(x, types)) ? ` · ${paceSummary(sessionPaces(x, types))}` : ''}`))))) : null,
      ctx.state.runs.length ? fold('run:runs', `Runs (${ctx.state.runs.length})`, [...ctx.state.runs].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20).map((r) =>
        h('div', { class: 'runrow' }, h('div', null, h('strong', null, dayLabel(r.date)), h('span', { class: 'num' }, ` · ${r.distance_km} km${r.moving ? ` · ${r.moving}` : ''}${r.pace ? ` · ${r.pace}` : ''}`)), [r.session, r.verdict].some(Boolean) ? h('div', { class: 'meta' }, [r.session, r.verdict].filter(Boolean).join(' · ')) : null))) : null,
      profile.guide ? fold('run:guide', 'Fuel, water and race day', h('p', { class: 'pre' }, profile.guide)) : null);
  };
}

export function runProgress(root, ctx) {
  const out = h('div');
  root.append(backBar('Run', () => ctx.show('run')), header('Progress'), out);
  return () => {
    const today = todayISO();
    const weeks = weeklyKm(ctx.state.runs, today, 12);
    const any = weeks.some((w) => w.km > 0);
    if (!any) return fill(out, h('p', { class: 'meta' }, 'Your runs show up here once the coach has logged a few.'));
    const longs = weeks.filter((w) => w.long > 0).map((w) => ({ x: w.start, y: w.long }));
    const ladder = profileMap(ctx.state.profile).ladder;
    const next = ladder && Array.isArray(ladder.steps) ? ladder.steps[Number(ladder.done) || 0] : null;
    const total = Math.round(weeks.reduce((a, w) => a + w.km, 0) * 10) / 10;
    fill(out,
      h('section', { class: 'card' }, h('div', { class: 'label' }, 'Distance per week'), barChart(weeks.map((w) => ({ label: dayLabel(w.start).replace(/^\w+ /, ''), sub: `Week of ${dayLabel(w.start)}`, value: w.km })), { unit: 'km', label: 'Distance per week', key: 'run-weekly' }),
        h('p', { class: 'meta' }, `${total} km in the last 12 weeks.`)),
      longs.length >= 2 ? h('section', { class: 'card' }, h('div', { class: 'label' }, 'Longest run each week'), lineChart(longs, { unit: 'km', label: 'Longest run each week', key: 'run-long' }), next ? h('p', { class: 'meta' }, `Next step on the ladder: ${next} km.`) : null) : null);
  };
}
