// Capture for the notes activities (BJJ, dance, philosophy): talk or type, with that activity's own
// fields. Voice goes through voice.js (on the phone until it is safe in the sheet), typed notes
// through the outbox. Either way the routine files it within minutes, outside quiet hours.
import { h, fill, picker, sheet, toast, fold } from './ui.js';
import { icon } from './icons.js';
import { store } from './store.js';
import * as voice from './voice.js';
import { TEST_MARK } from './recorder.js';
import { todayISO, draftDate, isoToSheetDate } from './dates.js';
import { dayLabel } from './training.js';
import { uid, clock, plural, oldest, newest, activityOf, tagList } from './util.js';
import { captureDefaults } from './week.js';

export const CAPTURE = {
  bjj: {
    label: 'BJJ',
    where: true,
    hours: true,
    rate: true,
    cues: 'What you drilled · what happened rolling · what to try next time',
    placeholder: 'Or type it here (the keyboard mic works too).',
    draftKey: 'draft',
    lastKey: 'last',
    typeOpenKey: 'typeOpen',
    groups: [],
  },
  dance: {
    label: 'Dance',
    where: true,
    hours: true,
    cues: 'The moves (name them or describe them) · how to lead or follow · technique · what to practise',
    placeholder: 'Moves, cues, what the teacher said…',
    draftKey: 'draft:dance',
    lastKey: 'last:dance',
    typeOpenKey: 'typeOpen:dance',
    groups: [
      { key: 'style', multi: true, options: [['salsa', 'Salsa'], ['bachata', 'Bachata']] },
      { key: 'kind', options: [['class', 'Class'], ['social', 'Social'], ['practice', 'Practice']], fallback: 'class' },
    ],
  },
  philosophy: {
    label: 'Think',
    where: false,
    hours: false,
    cues: 'The ideas that stuck · quotes · questions to bring',
    placeholder: 'An idea, a quote, a question…',
    draftKey: 'draft:think',
    lastKey: 'last:think',
    typeOpenKey: 'typeOpen:think',
    groups: [{ key: 'kind', options: [['meetup', 'Meetup'], ['reading', 'Reading'], ['thought', 'Own thought']], fallback: 'meetup' }],
  },
};

// Starting values: today's slot from his week first, then what he used last time.
function defaultsFor(ctx, activity, overrides = {}) {
  const cfg = CAPTURE[activity];
  const rows = ctx.state.notes?.rows ?? [];
  const lastRow = rows[rows.length - 1]?.cells ?? [];
  const last = store.get(cfg.lastKey, activity === 'bjj' ? { location: lastRow[1] || 'GB SG', hours: lastRow[2] || '1' } : { location: '', hours: '' });
  const slot = captureDefaults(ctx.week(), todayISO(), activity);
  const tags = overrides.tags || (slot.tags.length ? slot.tags : tagList(last.tags));
  return {
    location: overrides.location ?? last.location ?? '',
    hours: overrides.hours ?? (slot.hours !== '' ? slot.hours : last.hours ?? ''),
    tags,
  };
}

const groupValue = (group, tags) => {
  const opts = group.options.map((o) => o[0]);
  if (group.multi) return tags.filter((t) => opts.includes(t));
  return tags.find((t) => opts.includes(t)) || group.fallback || '';
};

// The date, place and hours line, shown as one sentence with a Change button.
function metaFields(cfg, { date, location, hours }) {
  const dateIn = h('input', { type: 'date', value: date, required: true, 'aria-label': 'Date' });
  const whereIn = h('input', { type: 'text', value: location, list: 'places', autocomplete: 'off', placeholder: 'Where', 'aria-label': 'Where' });
  const hoursIn = h('input', { type: 'number', value: hours, step: '0.25', min: '0', max: '12', inputmode: 'decimal', 'aria-label': 'Hours' });
  const line = h('span', { class: 'metaline' });
  const edit = h('div', { class: 'metaedit', hidden: true }, h('label', null, 'Date', dateIn), cfg.where ? h('label', null, 'Where', whereIn) : null, cfg.hours ? h('label', null, 'Hours', hoursIn) : null);
  const say = () => {
    const d = dateIn.value === todayISO() ? 'Today' : dayLabel(dateIn.value);
    fill(line, h('strong', null, d), cfg.where && whereIn.value ? ` · ${whereIn.value}` : '', cfg.hours && hoursIn.value ? ` · ${hoursIn.value} h` : '');
  };
  for (const el of [dateIn, whereIn, hoursIn]) el.addEventListener('input', say);
  const toggle = h('button', { type: 'button', class: 'chipbtn', onclick: () => { edit.hidden = !edit.hidden; toggle.textContent = edit.hidden ? 'Change' : 'Done'; } }, 'Change');
  say();
  return {
    set: ({ location, hours }) => {
      if (location != null) whereIn.value = location;
      if (hours != null) hoursIn.value = hours;
      say();
    },
    el: h('div', { class: 'meta-block' }, h('div', { class: 'metarow' }, line, toggle), edit),
    read: () => ({ session_date: dateIn.value || todayISO(), location: cfg.where ? whereIn.value.trim() : '', hours: cfg.hours ? hoursIn.value : '' }),
    inputs: [dateIn, whereIn, hoursIn],
    resetDate: () => {
      dateIn.value = todayISO();
      say();
    },
  };
}

// Big record button, timer, pause and cancel. Shared by the capture card and the Today sheet.
// getMeta() is read at Stop, so a change of date or chips while talking still counts.
function recorderControls(ctx, { activity, getMeta, onDone, say }) {
  let session = null;
  let timer = 0;
  let cancelArmed = false;
  const btn = h('button', { class: 'recbig', type: 'button', 'aria-label': 'Record' }, icon('mic', { size: 30 }), h('span', null, 'Record'));
  const time = h('div', { class: 'rectime num', hidden: true }, '0:00');
  const live = h('div', { class: 'reclive', hidden: true }, h('span', { class: 'recdot' }), 'Recording, kept on this phone as you talk');
  const pauseBtn = h('button', { class: 'secondary', type: 'button' }, 'Pause');
  const cancelBtn = h('button', { class: 'secondary', type: 'button' }, 'Cancel');
  const row = h('div', { class: 'recrow', hidden: true }, pauseBtn, cancelBtn);
  const testBox = h('input', { type: 'checkbox' });
  const testRow = h('label', { class: 'testrow' }, testBox, ' Test (transcribe, but never file it)');
  const cues = h('p', { class: 'cues' }, CAPTURE[activity].cues);

  const idle = () => {
    clearInterval(timer);
    session = null;
    cancelArmed = false;
    btn.classList.remove('on');
    btn.disabled = false;
    btn.setAttribute('aria-label', 'Record');
    fill(btn, icon('mic', { size: 30 }), h('span', null, 'Record'));
    time.hidden = live.hidden = row.hidden = true;
    pauseBtn.textContent = 'Pause';
    cancelBtn.textContent = 'Cancel';
    testRow.hidden = false;
  };
  const start = async () => {
    try {
      session = await voice.record({ activity, ...getMeta(), test: testBox.checked });
    } catch {
      say('No microphone access. Allow the microphone for this app in Settings, or type it instead.');
      return false;
    }
    btn.classList.add('on');
    btn.setAttribute('aria-label', 'Stop and save');
    fill(btn, icon('square', { size: 30 }), h('span', null, 'Stop'));
    time.hidden = live.hidden = row.hidden = false;
    testRow.hidden = true;
    say('');
    const tick = () => (time.textContent = clock(session.elapsed()));
    tick();
    timer = setInterval(tick, 500);
    return true;
  };
  const stop = async () => {
    btn.disabled = true;
    say('Saving…');
    const s = session;
    try {
      const out = await s.stop({ ...getMeta(), test: testBox.checked });
      idle();
      testBox.checked = false;
      say(`Saved ${clock(out.seconds)} on this phone. Sending it now.`);
      onDone?.(out);
    } catch {
      idle();
      say('No audio was captured (the phone stopped the mic). Tap Record to try again.');
    }
  };
  btn.addEventListener('click', () => (session ? stop() : start()));
  pauseBtn.addEventListener('click', () => {
    if (!session) return;
    if (session.paused) {
      if (session.resume()) {
        pauseBtn.textContent = 'Pause';
        time.classList.remove('paused');
      }
    } else if (session.pause()) {
      pauseBtn.textContent = 'Continue';
      time.classList.add('paused');
    }
  });
  cancelBtn.addEventListener('click', async () => {
    if (!cancelArmed) {
      cancelArmed = true;
      cancelBtn.textContent = 'Tap again to discard';
      return;
    }
    const s = session;
    idle();
    await s?.cancel();
    say('Recording discarded.');
  });
  return { el: h('div', { class: 'recorder' }, btn, live, time, row, testRow, cues), start, recording: () => !!session };
}

// What happens after a save: start a run so it is filed now (outside quiet hours).
const filed = (ctx, say) => ctx.fileNow({ auto: true, say });

// The capture card on BJJ, Dance and Think.
export function captureCard(ctx, activity) {
  const cfg = CAPTURE[activity];
  const d = defaultsFor(ctx, activity);
  const draft = store.get(cfg.draftKey, null) || { id: uid(), date: todayISO(), location: d.location, hours: d.hours, text: '' };
  draft.date = draftDate(draft);
  const meta = metaFields(cfg, { date: draft.date, location: draft.location ?? d.location, hours: draft.hours ?? d.hours });
  let touched = !!draft.text; // his own choice beats a default arriving with the next sync
  const groups = cfg.groups.map((g) => ({ g, p: picker(g.options, { multi: g.multi, initial: groupValue(g, d.tags), onchange: () => (touched = true) }) }));
  for (const el of meta.inputs) el.addEventListener('input', () => (touched = true));
  const msg = h('p', { class: 'msg', role: 'status' });
  const say = (t) => (msg.textContent = t);
  const getMeta = () => ({ ...meta.read(), tags: groups.flatMap(({ p }) => [].concat(p.value() || [])).filter(Boolean) });
  const remember = () => {
    const m = getMeta();
    store.set(cfg.lastKey, { location: m.location, hours: m.hours, tags: m.tags.join(',') });
  };

  const rec = recorderControls(ctx, {
    activity,
    getMeta,
    say,
    onDone: () => {
      remember();
      ctx.update();
    },
  });

  const text = h('textarea', { rows: '5', value: draft.text, placeholder: cfg.placeholder });
  const keep = () => store.set(cfg.draftKey, { id: draft.id, date: meta.read().session_date, location: meta.read().location, hours: meta.read().hours, text: text.value });
  for (const el of [text, ...meta.inputs]) el.addEventListener('input', keep);
  const save = h('button', { class: 'primary', type: 'submit' }, 'Save');
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      if (!text.value.trim()) return say('Nothing to save yet.');
      save.disabled = true;
      const m = getMeta();
      const row = { id: draft.id, session_date: m.session_date, location: m.location, hours: m.hours, text: text.value, method: 'keyboard', activity: activity === 'bjj' ? '' : activity, tags: m.tags.join(',') };
      const sent = await ctx.submit([{ tab: ctx.TABS.inbox, rows: [row] }], say, 'Saving');
      remember();
      draft.id = uid();
      text.value = '';
      keep();
      if (sent) {
        await ctx.refresh();
        await filed(ctx, say);
      } else say('No signal. It is safe on this phone and goes out when you are back online.');
      save.disabled = false;
      ctx.update();
    },
  }, text, save);
  const typeBox = h('details', { class: 'type', open: draft.text || store.get(cfg.typeOpenKey, false) ? true : null, ontoggle: (e) => store.set(cfg.typeOpenKey, e.target.open) }, h('summary', null, 'Type instead'), form);

  const card = h(
    'section',
    { class: 'card capture', 'aria-label': `Log ${cfg.label}` },
    meta.el,
    groups.length ? h('div', { class: 'groups' }, groups.map(({ p }) => p.el)) : null,
    rec.el,
    msg,
    typeBox
  );
  // The week and his last session can arrive after the screen opened (first sync): until he
  // touches anything, the defaults follow them.
  card.syncDefaults = () => {
    if (touched || rec.recording()) return;
    const fresh = defaultsFor(ctx, activity);
    meta.set({ location: fresh.location, hours: fresh.hours });
    for (const { g, p } of groups) p.set(groupValue(g, fresh.tags));
  };
  return card;
}

// One tap on Today: a sheet that is already recording, with that slot's details filled in.
export function recordSheet(ctx, activity, slot = {}) {
  const cfg = CAPTURE[activity];
  const d = defaultsFor(ctx, activity, { hours: slot.hours === '' || slot.hours == null ? undefined : slot.hours, tags: slot.tags?.length ? slot.tags : undefined });
  const meta = metaFields(cfg, { date: todayISO(), location: d.location, hours: d.hours });
  const groups = cfg.groups.map((g) => ({ g, p: picker(g.options, { multi: g.multi, initial: groupValue(g, d.tags) }) }));
  const msg = h('p', { class: 'msg', role: 'status' });
  const say = (t) => (msg.textContent = t);
  const getMeta = () => ({ ...meta.read(), tags: groups.flatMap(({ p }) => [].concat(p.value() || [])).filter(Boolean) });
  let box = null;
  const rec = recorderControls(ctx, {
    activity,
    getMeta,
    say,
    onDone: () => {
      const m = getMeta();
      store.set(cfg.lastKey, { location: m.location, hours: m.hours, tags: m.tags.join(',') });
      box?.dismissible(true);
      setTimeout(() => box?.close(), 900);
      ctx.update();
    },
  });
  box = sheet(
    [
      h('div', { class: 'sheethead' }, h('strong', null, slot.what || cfg.label), meta.el),
      groups.length ? h('div', { class: 'groups' }, groups.map(({ p }) => p.el)) : null,
      rec.el,
      msg,
      h('button', { type: 'button', class: 'link', onclick: () => { if (!rec.recording()) { box.close(); ctx.show(activity === 'philosophy' ? 'think' : activity, { typeOpen: true }); } } }, 'Type instead'),
    ],
    { label: `Record ${cfg.label}`, dismissible: false, act: activity }
  );
  rec.start().then((ok) => {
    if (!ok) box.dismissible(true);
  });
  return box;
}

// ---- recent captures for one activity: on this phone, waiting for signal, filed ----

function localCard(ctx, r) {
  const st = voice.stage(r);
  const total = voice.sliceCount(r.bytes);
  const what = {
    recording: 'Recording…',
    uploading: `Sending ${Math.min(r.sent, total)} of ${total}`,
    waiting: r.error ? 'Waiting for signal. Kept safe on this phone.' : 'Waiting to send. Kept safe on this phone.',
    held: 'Waiting for the sheet script update (Today has the steps). Kept safe on this phone.',
    blocked: `Could not send: ${ctx.errorText(new Error(r.blocked))} Kept safe on this phone.`,
    saved: 'Sent. Transcribed at the next run.',
  }[st];
  const player = h('div');
  return h(
    'div',
    { class: 'card localrec' },
    h('div', { class: 'dayhead' }, h('strong', null, dayLabel(r.meta?.session_date) || 'Today'), h('span', { class: 'meta' }, ` · voice · ${clock(Math.round(r.seconds || 0))}`), r.recovered ? h('span', { class: 'chip' }, 'Recovered') : null),
    h('p', { class: 'meta' }, what),
    st === 'uploading' || st === 'waiting' ? h('div', { class: 'bar' }, h('span', { class: `bar-fill w${Math.round((10 * r.sent) / Math.max(1, total))}` })) : null,
    h(
      'div',
      { class: 'actions' },
      st === 'blocked' || st === 'waiting' ? h('button', { type: 'button', class: 'chipbtn', onclick: () => voice.retry(r.id) }, 'Try now') : null,
      h('button', { type: 'button', class: 'chipbtn', onclick: async () => {
        const url = URL.createObjectURL(await voice.blobOf(r));
        fill(player, h('audio', { controls: true, src: url, preload: 'auto' }));
        player.querySelector('audio')?.play?.().catch(() => {});
      } }, 'Play'),
      h('button', { type: 'button', class: 'chipbtn', onclick: () => voice.shareAudio(r).catch(() => toast('Could not open the share sheet.')) }, 'Save audio')
    ),
    player
  );
}

const clipText = (ctx, r) => {
  const test = r.method === 'recording' && r.text === TEST_MARK;
  const pending = ctx.filingNow() ? 'Voice note: transcribing now…' : `Voice note: transcribed at ${ctx.runAt()}, or tap File now.`;
  const p = h('p', { class: 'clip' }, test ? 'Test voice note: never filed.' : r.text || (r.method === 'recording' ? pending : ''));
  p.addEventListener('click', () => p.classList.toggle('full'));
  return p;
};

function rateRow(ctx, r) {
  const box = h('div', { class: 'rate', hidden: true }, h('span', { class: 'meta' }, 'How accurate? '), [1, 2, 3, 4, 5].map((n) =>
    h('button', { type: 'button', class: String(r.rating) === String(n) ? 'star on' : 'star', onclick: async () => {
      r.rating = n;
      box.hidden = true;
      try {
        await ctx.api.call('update', { tab: ctx.TABS.inbox, id: r.id, fields: { rating: n } });
      } catch (e) {
        toast(ctx.errorText(e));
      }
      ctx.update();
    } }, String(n))));
  const link = h('button', { type: 'button', class: 'link small', onclick: () => (box.hidden = !box.hidden) }, r.rating ? `Rated ${r.rating}` : 'Rate');
  return [link, box];
}

// Recent captures for one activity, newest first: on this phone, waiting for signal, then by day.
export function recentCaptures(ctx, activity) {
  const mineLocal = voice.list().filter((r) => activityOf(r.meta) === activity && !r.committed);
  const queued = ctx.state.queue.filter((q) => q.tab === ctx.TABS.inbox && activityOf(q.rows[0]) === activity).map((q) => q.rows[0]);
  const items = ctx.state.inbox.filter((r) => r.status !== 'cancelled' && activityOf(r) === activity);
  const days = [...new Set(newest(items, 'created_at').map((r) => r.session_date))];
  const journal = ctx.state.journal || [];
  const localIds = new Set(voice.list().map((r) => r.id));
  const dayCard = (day) => {
    const clips = oldest(items.filter((r) => r.session_date === day), 'created_at');
    const head = clips[0];
    const waiting = clips.filter((r) => r.status === 'new');
    const rows = [...new Set(clips.map((r) => r.sheet_row).filter(Boolean))];
    const tips = journal.filter((j) => clips.some((c) => String(c.id) === String(j.source_id)) && !j.hidden).length;
    let status;
    if (clips.every((r) => r.status === 'test')) status = h('span', { class: 'chip' }, 'Test only');
    else if (waiting.length) {
      status = ctx.filingNow()
        ? h('span', { class: 'chip wait' }, 'Filing now…')
        : h('span', null, h('span', { class: 'chip wait' }, `Waiting for ${ctx.runAt()}`), ' ', h('button', { class: 'link', type: 'button', onclick: () => ctx.fileNow({ say: toast }) }, 'File now'));
    } else if (activity === 'bjj') status = h('span', { class: 'chip ok' }, rows.length ? `In your sheet, row ${rows.join(', ')}` : 'Done');
    else status = h('span', { class: 'chip ok' }, tips ? `Filed ${plural(tips, 'tip')}` : 'Filed');
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'dayhead' }, h('strong', null, isoToSheetDate(day) ? dayLabel(day) : day), h('span', { class: 'meta' }, [head.location, head.hours ? `${head.hours} h` : '', tagList(head.tags).join(', ')].filter(Boolean).map((x) => ` · ${x}`).join(''))),
      status,
      clips.map((r) =>
        h(
          'div',
          { class: 'cliprow' },
          h('span', { class: 'meta' }, r.method === 'recording' ? 'Voice' : 'Typed'),
          clipText(ctx, r),
          r.agent_note && r.status !== 'processed' ? h('p', { class: 'note' }, r.agent_note) : '',
          h('div', { class: 'actions' },
            r.status === 'new' ? h('button', { class: 'link small', type: 'button', onclick: () => ctx.cancel(ctx.TABS.inbox, r.id, 'Clip removed.') }, 'Remove') : null,
            CAPTURE[activity].rate && r.status === 'processed' ? rateRow(ctx, r) : null,
            localIds.has(String(r.id)) ? h('button', { type: 'button', class: 'link small', onclick: () => voice.shareAudio(voice.list().find((x) => x.id === String(r.id))).catch(() => {}) }, 'Save audio') : null)
        )
      )
    );
  };
  const shown = days.slice(0, 3);
  const older = days.slice(3, 12);
  return [
    mineLocal.length ? h('h2', { class: 'sec' }, 'On this phone') : null,
    mineLocal.map((r) => localCard(ctx, r)),
    queued.length ? h('h2', { class: 'sec' }, 'Waiting for signal') : null,
    queued.map((r) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${dayLabel(r.session_date)} · on this phone`), h('p', { class: 'clip' }, r.text))),
    shown.length ? h('h2', { class: 'sec' }, 'Recent') : null,
    shown.map(dayCard),
    older.length ? fold(`recent:${activity}`, `Earlier (${older.length} days)`, older.map(dayCard)) : null,
  ];
}
