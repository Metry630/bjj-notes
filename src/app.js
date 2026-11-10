import { store } from './store.js';
import { makeApi, parseLink } from './api.js';
import { search, toCells, highlightTerms, norm, topicCells, topicCounts } from './search.js';
import { byGym, funFacts } from './analysis.js';
import { enqueue, flush } from './queue.js';
import { startRecording, blobToBase64, audioBatches, TEST_MARK } from './recorder.js';
import { shrink, imageBatches, MAX_IMAGES } from './images.js';
import { weekOf, sessionDays, profileMap, ladderState, daysBetween, dayLabel, runTypes, sessionPaces, paceSummary } from './training.js';
import { todayISO, draftDate, isoToSheetDate, nextRunLabel, hoursSince, shortTime } from './dates.js';
import { attachPull } from './pull.js';
import { navItems, MORE } from './nav.js';

export const VERSION = '0.9.0';

const TABS = {
  inbox: 'App · Inbox',
  questions: 'App · Questions',
  feedback: 'App · Feedback',
  log: 'App · Log',
  topics: 'App · Topics',
  audio: 'App · Audio',
  decisions: 'App · Decisions',
  coach: 'App · Coach',
  images: 'App · Images',
  runs: 'App · Runs',
  plan: 'App · Plan',
  profile: 'App · Profile',
};
const ERRORS = {
  offline: 'No connection.',
  unauthorized: 'This phone link stopped working. Open the link in App · Setup again.',
  not_linked: 'This phone is not linked yet.',
  no_run_token: 'Run now is not set up yet: it needs the RUN_TOKEN script property.',
  too_soon: 'A run started less than 10 minutes ago. Give it a moment.',
  daily_limit: 'That is 8 manual runs today. The next scheduled run will pick things up.',
  fire_failed_429: "Claude's limit for runs this hour is reached. Try again later.",
  fire_failed_401: 'The Run now token was replaced or is wrong.',
  fire_failed_400: 'The routine is paused on claude.ai.',
  forbidden: 'The sheet script is older than this app. Paste and deploy the latest Code.gs, then try again.',
};
const errorText = (e) => ERRORS[e.message] || `Something went wrong (${e.message}).`;

// ---- link this phone (the link from App · Setup carries the API URL and the phone token) ----
const linked = parseLink(location.hash);
if (linked) {
  store.set('config', linked);
  history.replaceState(null, '', location.pathname + location.search);
}
const api = makeApi(() => store.get('config', null));

const state = {
  view: store.get('view', 'log'),
  notes: store.get('notes', null),
  inbox: store.get('inbox', []),
  questions: store.get('questions', []),
  feedback: store.get('feedback', []),
  log: store.get('log', []),
  topics: store.get('topics', []),
  decisions: store.get('decisions', []),
  coach: store.get('coach', []),
  runs: store.get('runs', []),
  plan: store.get('plan', []),
  profile: store.get('profile', []),
  queue: store.get('queue', []),
  settings: store.get('settings', { routine_mode: 'normal' }),
  syncedAt: store.get('syncedAt', ''),
  status: '',
  askPrefill: '',
  topic: '',
};

// ---- DOM helper: text nodes only, never innerHTML with data ----
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

// replaceChildren() does not flatten arrays; this does, and skips empty parts.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
}

const newest = (rows, key) => [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const runAt = () => `${nextRunLabel()} SGT`;

function highlighted(text, q) {
  const terms = highlightTerms(q).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return [text];
  const re = new RegExp(`(${terms.join('|')})`, 'gi');
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? h('mark', null, part) : part));
}

// ---- views: mount() builds the static part once, update() redraws the data part ----
// (so a background sync never resets a textarea he is dictating into)

const views = {};

// ---- Log: record first, type second. Saving files the note on its own within minutes. ----

const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
// 09:00-18:00 Singapore is his quiet time: nothing starts a run by itself then.
const quietNow = (now = new Date()) => {
  const hr = new Date(now.getTime() + 8 * 3600e3).getUTCHours();
  return hr >= 9 && hr < 18;
};

let poll = 0;
const pending = () => state.inbox.some((r) => r.status === 'new') || state.coach.some((r) => r.status === 'new');
// While a run is filing his note or the coach is replying, check back every 30 s (only while the
// app is open).
function startPolling(minutes = 15) {
  clearInterval(poll);
  const until = Date.now() + minutes * 60000;
  poll = setInterval(() => {
    if (Date.now() > until || !pending()) {
      clearInterval(poll);
      poll = 0;
      return;
    }
    if (document.visibilityState === 'visible') refresh();
  }, 30000);
}

const NOTE_TEXTS = {
  quiet: () => `Saved. It gets filed at ${runAt()} (quiet hours), or tap File now.`,
  started: 'Saved. Filing it now: it shows up below, in your sheet, in about 3 minutes.',
  busy: 'Saved. A run is already going. If it misses this one, tap File now in a few minutes.',
  failed: (e) => `Saved, but filing could not start: ${errorText(e)}`,
};
const COACH_TEXTS = {
  quiet: () => `Sent. The coach replies at ${runAt()} (quiet hours), or tap Reply now.`,
  started: 'Sent. The coach is on it: the reply shows up below in about 5 minutes.',
  busy: 'Sent. A run is already going. If it misses this, tap Reply now in a few minutes.',
  failed: (e) => `Sent, but the coach could not start: ${errorText(e)}`,
};

// Starts a run so new notes are filed (or coach messages answered) now. `auto` = right after a
// save, which waits in quiet time.
async function fileNow(msg, { auto = false, texts = NOTE_TEXTS } = {}) {
  if (auto && quietNow()) {
    msg.textContent = texts.quiet();
    return;
  }
  try {
    await api.call('runNow');
    store.set('runStartedAt', new Date().toISOString());
    msg.textContent = texts.started;
    startPolling();
  } catch (e) {
    if (e.message === 'too_soon') {
      msg.textContent = texts.busy;
      startPolling();
    } else {
      msg.textContent = texts.failed(e);
    }
  }
}

// Sends entries in order; whatever can't go out (no signal) waits in the phone's queue.
async function sendAll(entries, msg, label) {
  for (let i = 0; i < entries.length; i++) {
    if (label) msg.textContent = `${label} (${i + 1}/${entries.length})…`;
    try {
      await api.call('add', entries[i]);
    } catch (e) {
      // A refusal that a retry can't fix would block the queue for good, so it surfaces now.
      if (e.message === 'unauthorized' || e.message === 'forbidden' || /^bad_/.test(e.message)) throw e;
      for (const rest of entries.slice(i)) state.queue = enqueue(state.queue, rest);
      store.set('queue', state.queue);
      return false;
    }
  }
  return true;
}

const filingNow = () => hoursSince(store.get('runStartedAt', '')) < 0.25;

views.log = (root) => {
  const sessions = state.notes?.rows ?? [];
  const lastRow = sessions[sessions.length - 1]?.cells ?? [];
  const last = store.get('last', { location: lastRow[1] || 'GB SG', hours: lastRow[2] || '1' });
  const draft = store.get('draft', null) || { id: uid(), date: todayISO(), location: last.location, hours: last.hours, text: '' };
  draft.date = draftDate(draft);
  const locations = [...new Set(sessions.map((r) => r.cells[1]).filter(Boolean).reverse())];

  const date = h('input', { type: 'date', value: draft.date, required: true });
  const location = h('input', { type: 'text', value: draft.location, list: 'locations', autocomplete: 'off', placeholder: 'Gym' });
  const hours = h('input', { type: 'number', value: draft.hours, step: '0.25', min: '0', max: '12', inputmode: 'decimal' });
  const msg = h('p', { class: 'msg', role: 'status' });
  const list = h('div');
  const readForm = () => ({ id: draft.id, date: date.value, location: location.value.trim(), hours: hours.value, text: text.value });
  const keep = () => store.set('draft', readForm());

  const send = (entries, label) => sendAll(entries, msg, label);

  // -- recorder --
  let recording = null;
  let timer = 0;
  let cancelArmed = false;
  const recBtn = h('button', { class: 'recbig', type: 'button', 'aria-label': 'Record' }, 'Record');
  const recTime = h('div', { class: 'rectime', hidden: true }, '0:00');
  const recPause = h('button', { class: 'secondary', type: 'button' }, 'Pause');
  const recCancel = h('button', { class: 'secondary', type: 'button' }, 'Cancel');
  const recRow = h('div', { class: 'recrow', hidden: true }, recPause, recCancel);
  const testBox = h('input', { type: 'checkbox' });
  const testRow = h('label', { class: 'testrow' }, testBox, ' Test (transcribe it, but do not file it in your sheet)');
  const recHint = h('p', { class: 'meta center' }, 'Tap and talk through the session. Pause any time. Stop saves it and files it into your sheet.');

  const idle = () => {
    clearInterval(timer);
    recording = null;
    cancelArmed = false;
    recBtn.textContent = 'Record';
    recBtn.classList.remove('on');
    recBtn.disabled = false;
    recTime.hidden = true;
    recRow.hidden = true;
    recPause.textContent = 'Pause';
    recCancel.textContent = 'Cancel';
    recHint.hidden = false;
    testRow.hidden = false;
  };
  recPause.addEventListener('click', () => {
    if (!recording) return;
    if (recording.paused) {
      if (recording.resume()) {
        recPause.textContent = 'Pause';
        recTime.classList.remove('paused');
      }
    } else if (recording.pause()) {
      recPause.textContent = 'Continue';
      recTime.classList.add('paused');
    }
  });
  recCancel.addEventListener('click', () => {
    if (!cancelArmed) {
      cancelArmed = true;
      recCancel.textContent = 'Tap again to discard';
      return;
    }
    recording?.cancel();
    idle();
    msg.textContent = 'Recording discarded.';
  });
  recBtn.addEventListener('click', async () => {
    if (!recording) {
      try {
        recording = await startRecording();
      } catch {
        msg.textContent = 'No microphone access. Allow the microphone for this app in Settings, or type it below.';
        return;
      }
      recBtn.textContent = 'Stop';
      recBtn.classList.add('on');
      recTime.hidden = false;
      recRow.hidden = false;
      recHint.hidden = true;
      testRow.hidden = true;
      msg.textContent = '';
      const tick = () => (recTime.textContent = clock(recording.elapsed()));
      tick();
      timer = setInterval(tick, 500);
      return;
    }
    recBtn.disabled = true;
    msg.textContent = 'Saving…';
    let rec;
    try {
      rec = await recording.stop();
    } catch {
      idle();
      msg.textContent = 'No audio was captured (the phone stopped the mic). Tap Record to try again.';
      return;
    }
    const isTest = testBox.checked;
    idle();
    testBox.checked = false;
    recBtn.disabled = true;
    try {
      const d = readForm();
      const id = uid();
      const sent = await send(
        [
          { tab: TABS.inbox, rows: [{ id, session_date: d.date, location: d.location, hours: d.hours, text: isTest ? TEST_MARK : '', method: 'recording' }] },
          ...audioBatches(id, rec.mime, await blobToBase64(rec.blob)).map((rows) => ({ tab: TABS.audio, rows })),
        ],
        `Saving ${clock(rec.seconds)} of audio`
      );
      store.set('last', { location: d.location, hours: d.hours });
      if (!sent) {
        msg.textContent = 'No connection. The recording is safe on this phone and uploads when you are back online.';
        update();
      } else {
        await refresh();
        await fileNow(msg, { auto: true });
        update();
      }
    } catch (e) {
      msg.textContent = `${errorText(e)} The recording could not be saved.`;
    } finally {
      recBtn.disabled = false;
    }
  });

  // -- typing (the old way, still there) --
  const text = h('textarea', {
    rows: '6',
    value: draft.text,
    placeholder: 'Or type it here (the keyboard mic works too).',
  });
  const save = h('button', { class: 'primary', type: 'submit' }, 'Save');
  for (const el of [date, location, hours, text]) el.addEventListener('input', keep);
  const typeForm = h(
    'form',
    {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const d = readForm();
        if (!d.text.trim()) return void (msg.textContent = 'Nothing to save yet.');
        save.disabled = true;
        try {
          const sent = await send([
            { tab: TABS.inbox, rows: [{ id: d.id, session_date: d.date, location: d.location, hours: d.hours, text: d.text, method: 'keyboard' }] },
          ], 'Saving');
          store.set('last', { location: d.location, hours: d.hours });
          draft.id = uid();
          text.value = '';
          keep();
          if (!sent) {
            msg.textContent = 'No connection. Your note is queued on this phone and goes out when you are back online.';
            update();
          } else {
            await refresh();
            await fileNow(msg, { auto: true });
            update();
          }
        } catch (e) {
          msg.textContent = `${errorText(e)} Your note is still here, tap Save again.`;
        } finally {
          save.disabled = false;
        }
      },
    },
    text,
    save
  );
  const typeBox = h('details', { class: 'type', open: draft.text ? true : null }, h('summary', null, 'Type instead'), typeForm);

  root.append(
    h('h1', null, 'Log a session'),
    h('div', { class: 'row3' }, h('label', null, 'Date', date), h('label', null, 'Where', location), h('label', null, 'Hours', hours)),
    h('datalist', { id: 'locations' }, locations.map((l) => h('option', { value: l }))),
    h('div', { class: 'recorder' }, recBtn, recTime, recRow, testRow, recHint),
    msg,
    typeBox,
    list
  );

  // "How accurate was this?" so typed and recorded notes can be compared on Home.
  const rateRow = (r) =>
    h(
      'div',
      { class: 'rate' },
      h('span', { class: 'meta' }, 'Accuracy: '),
      [1, 2, 3, 4, 5].map((n) =>
        h(
          'button',
          {
            type: 'button',
            class: String(r.rating) === String(n) ? 'star on' : 'star',
            onclick: async () => {
              r.rating = n;
              update();
              try {
                await api.call('update', { tab: TABS.inbox, id: r.id, fields: { rating: n } });
                store.set('inbox', state.inbox);
              } catch (e) {
                msg.textContent = errorText(e);
              }
            },
          },
          String(n)
        )
      )
    );

  const clipText = (r) => {
    const pending = filingNow() ? 'Voice note: transcribing now…' : 'Voice note: transcribed at the next run, or tap File now.';
    const test = r.method === 'recording' && r.text === TEST_MARK;
    const p = h('p', { class: 'clip' }, test ? 'Test voice note: never filed in your sheet.' : r.text || (r.method === 'recording' ? pending : ''));
    p.addEventListener('click', () => p.classList.toggle('full'));
    return p;
  };

  // One card per training day, with its clips; that's one row in his sheet.
  const update = () => {
    const queued = state.queue.filter((q) => q.tab === TABS.inbox).map((q) => q.rows[0]);
    const items = state.inbox.filter((r) => r.status !== 'cancelled');
    const days = [...new Set(newest(items, 'created_at').map((r) => r.session_date))].slice(0, 6);
    fill(list,
      queued.length ? h('h2', null, 'Waiting for signal') : '',
      queued.map((r) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${isoToSheetDate(r.session_date) || r.session_date} · on this phone`), clipText(r))),
      days.length ? h('h2', null, 'Recent sessions') : '',
      days.map((day) => {
        const clips = items.filter((r) => r.session_date === day).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const head = clips[0];
        const waiting = clips.filter((r) => r.status === 'new');
        const rows = [...new Set(clips.map((r) => r.sheet_row).filter(Boolean))];
        let status;
        if (clips.every((r) => r.status === 'test')) status = h('span', { class: 'chip' }, 'Test only');
        else if (waiting.length) {
          status = filingNow()
            ? h('span', { class: 'chip wait' }, 'Filing now…')
            : h('span', null, h('span', { class: 'chip wait' }, `Waiting for ${runAt()}`), ' ', h('button', { class: 'link', type: 'button', onclick: () => fileNow(msg) }, 'File now'));
        } else status = h('span', { class: 'chip ok' }, rows.length ? `In your sheet, row ${rows.join(', ')}` : 'Done');
        return h(
          'div',
          { class: 'card' },
          h('div', { class: 'dayhead' }, h('strong', null, isoToSheetDate(day) || day), h('span', { class: 'meta' }, ` · ${head.location || 'no gym'} · ${head.hours || '?'} h`)),
          status,
          clips.map((r) =>
            h(
              'div',
              { class: 'cliprow' },
              h('span', { class: 'meta' }, r.method === 'recording' ? 'Voice' : 'Typed'),
              clipText(r),
              r.agent_note && r.status !== 'processed' ? h('p', { class: 'note' }, r.agent_note) : '',
              r.status === 'new' ? h('button', { class: 'link', type: 'button', onclick: () => cancel(TABS.inbox, r.id) }, 'Remove this clip') : '',
              r.status === 'processed' ? rateRow(r) : ''
            )
          )
        );
      })
    );
  };
  if (filingNow()) startPolling();
  return update;
};

views.search = (root) => {
  const input = h('input', { type: 'search', placeholder: 'deep half, spider, mount escape…', value: state.query || '', autocomplete: 'off' });
  const out = h('div');
  input.addEventListener('input', () => {
    state.query = input.value;
    draw();
  });
  const chips = h('div', { class: 'chips' });
  root.append(h('h1', null, 'Search your notes'), input, chips, out);

  function drawChips(cells) {
    const counts = topicCounts(state.topics, cells).filter((c) => c.count > 0);
    if (!counts.length) return fill(chips);
    fill(chips,
      h('div', { class: 'meta' }, state.topic ? 'Topic filter (tap again to clear)' : 'Topics, most tips first'),
      counts.map((c) =>
        h('button', {
          class: state.topic === c.topic ? 'link chip on' : 'link chip',
          type: 'button',
          onclick: () => {
            state.topic = state.topic === c.topic ? '' : c.topic;
            draw();
          },
        }, `${c.topic} (${c.count})`)
      )
    );
  }

  function draw() {
    const q = input.value.trim();
    const cells = toCells(state.notes);
    drawChips(cells);
    const picked = state.topic ? state.topics.find((t) => t.topic === state.topic) : null;
    if (picked) {
      let tips = topicCells(cells, picked);
      if (q) {
        const keep = new Set(search(tips, q).map((c) => `${c.row}:${c.col}`));
        tips = tips.filter((c) => keep.has(`${c.row}:${c.col}`));
      }
      tips = tips.slice().sort((a, b) => b.row - a.row || a.col - b.col);
      fill(out,
        h('div', { class: 'card topic' }, h('div', { class: 'meta' }, 'Topic summary'), h('h3', null, picked.topic), h('p', { class: 'pre' }, picked.summary)),
        h('div', { class: 'meta' }, `${tips.length} tips, newest first`),
        tips.map((c) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${c.date} · ${c.location}`), h('p', null, q ? highlighted(c.text, q) : c.text)))
      );
      return;
    }
    if (!q) {
      const recent = (state.notes?.rows ?? []).slice(-5).reverse();
      fill(out, h('h2', null, 'Recent sessions'),
        recent.map((r) =>
          h(
            'div',
            { class: 'card' },
            h('div', { class: 'meta' }, `${r.cells[0]} · ${r.cells[1] || ''} · ${r.cells[2] || '?'} h`),
            h('ul', null, r.cells.slice(3).filter((c) => c.trim()).map((c) => h('li', null, c)))
          )
        )
      );
      return;
    }
    const nq = norm(q);
    const topics = state.topics.filter((t) => {
      const names = [t.topic, ...String(t.aliases || '').split(',')].map(norm).filter(Boolean);
      return names.some((n) => n.includes(nq) || nq.includes(n));
    });
    const hits = search(cells, q);
    fill(out, topics.map((t) =>
        h(
          'div',
          { class: 'card topic' },
          h('div', { class: 'meta' }, 'Topic summary'),
          h('h3', null, t.topic),
          h('p', { class: 'pre' }, t.summary),
          t.sources ? h('div', { class: 'meta' }, `From: ${t.sources}`) : ''
        )
      ),
      h('div', { class: 'meta' }, hits.length ? `${hits.length}${hits.length === 60 ? '+' : ''} tips${hits[0]?.partial ? ' (partial matches)' : ''}` : 'Nothing in your notes matches that.'),
      hits.map((c) => h('div', { class: 'card' }, h('div', { class: 'meta' }, `${c.date} · ${c.location}`), h('p', null, highlighted(c.text, q)))),
      h(
        'button',
        {
          class: 'secondary',
          onclick: () => {
            state.askPrefill = `What did my notes say about ${q}?`;
            show('ask');
          },
        },
        `Ask Claude about “${q}”`
      )
    );
  }
  return draw;
};

views.ask = (root) => {
  const text = h('textarea', { rows: '3', value: state.askPrefill || '', placeholder: 'What did my notes say about deep half?' });
  state.askPrefill = '';
  const msg = h('p', { class: 'msg', role: 'status' });
  const list = h('div');
  const send = h('button', { class: 'primary', type: 'submit' }, 'Ask');
  const form = h(
    'form',
    {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const q = text.value.trim();
        if (!q) return;
        send.disabled = true;
        try {
          await api.call('add', { tab: TABS.questions, rows: [{ id: uid(), question: q }] });
          text.value = '';
          msg.textContent = `Asked. The answer shows up here after the ${runAt()} run.`;
          refresh();
        } catch (e) {
          msg.textContent = errorText(e);
        } finally {
          send.disabled = false;
        }
      },
    },
    text,
    send,
    msg
  );
  root.append(h('h1', null, 'Ask your notes'), form, list);

  return () => {
    const qs = newest(state.questions, 'asked_at').filter((r) => r.status !== 'cancelled');
    store.set('seenAnswers', qs.filter((r) => r.status === 'answered').map((r) => r.id));
    fill(list, qs.map((r) =>
        h(
          'div',
          { class: 'card' },
          h('h3', null, r.question),
          r.status === 'answered'
            ? [h('p', { class: 'pre' }, r.answer), r.sources ? h('div', { class: 'meta' }, `From: ${r.sources}`) : '', h('div', { class: 'meta' }, shortTime(r.answered_at))]
            : h('div', { class: 'meta' }, `Answer comes at the ${runAt()} run. `, h('button', { class: 'link', onclick: () => cancel(TABS.questions, r.id) }, 'Cancel'))
        )
      )
    );
  };
};

// ---- Run: the running coach. A run report (Strava screenshots, how it felt) or a question goes to
// App · Coach; the next run reads it, logs the run, updates the plan and replies here. ----

const FEELS = [['easy', 'Easy'], ['ok', 'OK'], ['hard', 'Hard'], ['very hard', 'Very hard']];
const PAINS = [['none', 'None'], ['shin', 'Shin'], ['hamstring', 'Hamstring'], ['other', 'Other']];
const KIND_LABEL = { run: 'Run', ask: 'Question', checkin: 'Morning check' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Pick one; tapping the chosen one again clears it.
function picker(options) {
  let value = '';
  const set = (v) => {
    value = v;
    buttons.forEach((b, i) => b.classList.toggle('on', options[i][0] === v));
  };
  const buttons = options.map(([v, label]) => h('button', { type: 'button', class: 'pick', onclick: () => set(value === v ? '' : v) }, label));
  return { el: h('div', { class: 'picks' }, buttons), value: () => value, reset: () => set('') };
}

views.run = (root) => {
  const top = h('div');
  const msg = h('p', { class: 'msg', role: 'status' });
  const thread = h('div');
  const more = h('div');
  const sayStarted = () => fileNow(msg, { texts: COACH_TEXTS });

  // -- log a run: screenshots, two taps, an optional note --
  let shots = [];
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'vh' });
  // A label opens the photo picker natively; iOS won't always open a hidden input from code.
  const addShots = h('label', { class: 'secondary filepick' }, h('span', null, 'Add Strava screenshots'), file);
  const thumbs = h('div', { class: 'thumbs' });
  const drawThumbs = () => {
    fill(thumbs, shots.map((s, i) =>
      h('div', { class: 'thumb' },
        h('img', { src: s.dataUrl, alt: `Screenshot ${i + 1}` }),
        h('button', { type: 'button', class: 'link', onclick: () => { shots.splice(i, 1); drawThumbs(); } }, 'Remove')
      )
    ));
    addShots.firstChild.textContent = shots.length ? 'Add more screenshots' : 'Add Strava screenshots';
    file.disabled = shots.length >= MAX_IMAGES;
    addShots.classList.toggle('off', file.disabled);
  };
  file.addEventListener('change', async () => {
    const files = [...file.files].slice(0, MAX_IMAGES - shots.length);
    file.value = '';
    if (!files.length) return;
    msg.textContent = 'Preparing screenshots…';
    let failed = 0;
    for (const f of files) {
      try {
        shots.push(await shrink(f));
      } catch {
        failed++;
      }
    }
    msg.textContent = failed ? `${plural(failed, 'file')} could not be read as an image.` : '';
    drawThumbs();
  });
  const date = h('input', { type: 'date', value: todayISO(), required: true });
  const feel = picker(FEELS);
  const pain = picker(PAINS);
  const note = h('textarea', { rows: '3', placeholder: 'Anything else? How it went, where it hurt (optional).' });
  const sendRun = h('button', { class: 'primary', type: 'submit' }, 'Send to coach');
  const runForm = h(
    'form',
    {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!shots.length && !note.value.trim()) return void (msg.textContent = 'Add a screenshot or a few words first.');
        sendRun.disabled = true;
        const id = uid();
        const n = shots.length;
        try {
          const sent = await sendAll(
            [
              { tab: TABS.coach, rows: [{ id, kind: 'run', run_date: date.value, text: note.value.trim(), feel: feel.value(), pain: pain.value(), images: n }] },
              ...shots.flatMap((s, i) => imageBatches(id, i + 1, s.b64, s.mime).map((rows) => ({ tab: TABS.images, rows }))),
            ],
            msg,
            n ? `Sending ${plural(n, 'screenshot')}` : 'Sending'
          );
          shots = [];
          drawThumbs();
          note.value = '';
          feel.reset();
          pain.reset();
          if (!sent) msg.textContent = 'No connection. It is saved on this phone and goes out when you are back online.';
          else {
            await refresh();
            await fileNow(msg, { auto: true, texts: COACH_TEXTS });
          }
          update();
        } catch (e) {
          msg.textContent = `${errorText(e)} Tap Send to try again.`;
        } finally {
          sendRun.disabled = false;
        }
      },
    },
    addShots,
    thumbs,
    h('label', null, 'Date of the run', date),
    h('div', { class: 'meta' }, 'How did it feel?'),
    feel.el,
    h('div', { class: 'meta' }, 'Any pain?'),
    pain.el,
    note,
    sendRun
  );

  // -- ask: "not lifting this week, can I do more?", "missed a week, now what?" --
  const ask = h('textarea', { rows: '3', placeholder: 'Not lifting this week, can I do more? Missed a week, what now?' });
  const askBtn = h('button', { class: 'primary', type: 'submit' }, 'Ask the coach');
  const askForm = h(
    'form',
    {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const t = ask.value.trim();
        if (!t) return;
        askBtn.disabled = true;
        try {
          await api.call('add', { tab: TABS.coach, rows: [{ id: uid(), kind: 'ask', text: t }] });
          ask.value = '';
          await refresh();
          await fileNow(msg, { auto: true, texts: COACH_TEXTS });
        } catch (e) {
          msg.textContent = errorText(e);
        } finally {
          askBtn.disabled = false;
        }
      },
    },
    ask,
    askBtn
  );

  // The next-morning pain check (the plan only moves on after a pain-free morning), one tap on the
  // latest run report.
  // "No pain" needs no answer, so it waits for the next scheduled run instead of starting one.
  async function checkin(r, pain, where) {
    try {
      await api.call('add', { tab: TABS.coach, rows: [{ id: uid(), kind: 'checkin', run_date: r.run_date, pain, text: where }] });
      await refresh();
      if (pain === 'none') msg.textContent = 'Noted. The coach counts it at the next run.';
      else await fileNow(msg, { auto: true, texts: COACH_TEXTS });
    } catch (e) {
      msg.textContent = errorText(e);
    }
  }
  const morning = (r) => {
    const where = h('input', { type: 'text', placeholder: 'Where, and how bad?', maxlength: '200' });
    const box = h('div', { class: 'check', hidden: true }, where, h('button', { type: 'button', class: 'primary', onclick: () => checkin(r, 'some', where.value.trim()) }, 'Send'));
    return h(
      'div',
      { class: 'checkrow' },
      h('span', { class: 'meta' }, 'This morning:'),
      h('button', { type: 'button', class: 'pick', onclick: () => checkin(r, 'none', '') }, 'No pain'),
      h('button', { type: 'button', class: 'pick', onclick: () => { box.hidden = false; where.focus(); } }, 'Some pain'),
      box
    );
  };

  root.append(
    h('h1', null, 'Run'),
    top,
    h('h2', null, 'Log a run'),
    runForm,
    msg,
    h('details', { class: 'type' }, h('summary', null, 'Ask the coach'), askForm),
    thread,
    more
  );

  return () => {
    const today = todayISO();
    const profile = profileMap(state.profile);
    const race = profile.race && typeof profile.race === 'object' ? profile.race : null;
    const week = weekOf(state.plan, today);
    const ladder = ladderState(profile.ladder);
    const types = runTypes(profile.run_types);
    const days = week ? sessionDays(week) : [];
    // One entry per run type used this week, for "How to run these".
    const used = [...new Set(days.flatMap((s) => s.types))].filter((k) => types[k]?.how);
    // The paces he runs at, always on screen: every type with a pace in numbers.
    const paceTypes = Object.values(types).filter((t) => /\d:\d\d/.test(t.pace || '') && t.key !== 'raceday');
    fill(top,
      race
        ? h(
            'div',
            { class: 'card' },
            h('strong', null, race.name || 'Race'),
            h('div', { class: 'meta' }, [
              race.date ? `${dayLabel(race.date)} ${race.date.slice(0, 4)}` : 'Date to come',
              race.date ? `${daysBetween(today, race.date)} days to go` : '',
              race.pen ? `Pen ${race.pen}` : '',
              race.goal ? `goal ${race.goal}` : '',
            ].filter(Boolean).join(' · ')),
            race.confirmed === false ? h('div', { class: 'meta' }, 'Date not announced yet. Tell the coach when it is.') : '',
            ladder ? h('p', null, ladder) : ''
          )
        : h('div', { class: 'card' }, h('p', { class: 'meta' }, 'Your plan shows up here once the coach has set it up.')),
      paceTypes.length
        ? h(
            'div',
            { class: 'card' },
            h('div', { class: 'dayhead' }, h('strong', null, 'Your paces')),
            paceTypes.map((t) => h('div', { class: 'pacerow' }, h('span', null, t.name), h('span', { class: 'pace' }, t.pace), h('span', { class: 'meta' }, t.feel || '')))
          )
        : '',
      week
        ? h(
            'div',
            { class: 'card' },
            h('div', { class: 'dayhead' }, h('strong', null, `This week · W${week.week} ${week.block}`)),
            days.map((s) => {
              const done = state.runs.filter((r) => r.date === s.date);
              let chip = '';
              if (done.length) chip = h('span', { class: 'chip ok' }, done.map((r) => `${r.distance_km} km`).join(', '));
              else if (s.date === today) chip = h('span', { class: 'chip wait' }, 'Today');
              else if (s.date < today && s.what && !/^rest/i.test(s.what)) chip = h('span', { class: 'chip' }, 'Not logged');
              const t = types[s.types[0]];
              const pace = paceSummary(sessionPaces(s, types));
              return h(
                'div',
                { class: 'sess' },
                h('span', { class: 'meta' }, s.day),
                h('div', null, s.what || 'Rest', pace ? h('div', { class: 'pace' }, pace) : '', t?.feel ? h('div', { class: 'meta' }, t.feel) : ''),
                chip
              );
            }),
            week.note ? h('p', { class: 'note pre' }, week.note) : '',
            used.length
              ? h('details', null, h('summary', null, 'How to run these'), used.map((k) => h('p', null, h('strong', null, `${types[k].name}: `), types[k].how)))
              : ''
          )
        : ''
    );

    const items = newest(state.coach.filter((r) => r.status !== 'cancelled' && r.status !== 'test'), 'created_at').slice(0, 15);
    const lastRun = items.find((r) => r.kind === 'run' && r.run_date);
    const checked = lastRun && state.coach.some((r) => r.kind === 'checkin' && r.run_date === lastRun.run_date && r.status !== 'cancelled');
    const sinceRun = lastRun ? daysBetween(lastRun.run_date, today) : 0;
    const unseen = state.coach.some((r) => r.reply && !new Set(store.get('seenReplies', [])).has(r.id));
    const logOpen = store.get('coachLogOpen', false) || unseen;
    fill(thread,
      items.length
        ? h('details', { class: 'coachlog', open: logOpen ? true : null, ontoggle: (e) => store.set('coachLogOpen', e.target.open) },
            h('summary', null, `Coach log (${items.length})`),
            items.map((r) => {
        if (r.kind === 'coach') {
          return h('div', { class: 'card coachnote' }, h('div', { class: 'meta' }, `Coach · ${shortTime(r.created_at)}`), h('p', { class: 'pre' }, r.text));
        }
        const facts = [r.feel ? `felt ${r.feel}` : '', r.pain ? `pain: ${r.pain}` : '', Number(r.images) ? plural(Number(r.images), 'screenshot') : ''].filter(Boolean).join(' · ');
        let tail = '';
        if (r.reply) tail = [h('p', { class: 'note pre' }, r.reply), h('div', { class: 'meta' }, `Coach · ${shortTime(r.replied_at)}`)];
        else if (r.status === 'new') {
          tail = h(
            'div',
            { class: 'meta' },
            filingNow()
              ? h('span', { class: 'chip wait' }, 'Coach is replying…')
              : [h('span', { class: 'chip wait' }, `Reply at ${runAt()}`), ' ', h('button', { class: 'link', type: 'button', onclick: sayStarted }, 'Reply now')],
            ' ',
            h('button', { class: 'link', type: 'button', onclick: () => cancel(TABS.coach, r.id) }, 'Remove')
          );
        }
        return h(
          'div',
          { class: 'card' },
          h('div', { class: 'meta' }, `${KIND_LABEL[r.kind] || 'Message'}${r.run_date ? ` · ${dayLabel(r.run_date)}` : ''} · sent ${shortTime(r.created_at)}`),
          r.text ? h('p', { class: 'pre' }, r.text) : '',
          facts ? h('div', { class: 'meta' }, facts) : '',
          tail,
          r === lastRun && !checked && sinceRun >= 1 && sinceRun <= 2 ? morning(r) : ''
        );
      }))
        : ''
    );

    const runs = [...state.runs]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))
      .slice(0, 12);
    const plan = [...state.plan].sort((a, b) => Number(a.week) - Number(b.week));
    fill(more,
      runs.length ? h('h2', null, 'Runs') : '',
      runs.map((r) =>
        h(
          'div',
          { class: 'runrow' },
          h('div', null, h('strong', null, dayLabel(r.date)), ` · ${r.distance_km} km`, r.moving ? ` · ${r.moving}` : '', r.pace ? ` · ${r.pace}` : ''),
          [r.session, r.verdict].some(Boolean) ? h('div', { class: 'meta' }, [r.session, r.verdict].filter(Boolean).join(' · ')) : ''
        )
      ),
      Object.keys(types).length
        ? h(
            'details',
            null,
            h('summary', null, 'Run types and paces'),
            Object.values(types).map((t) =>
              h('div', { class: 'planrow' }, h('strong', null, t.name), t.pace ? ` · ${t.pace}` : '', t.feel ? h('div', { class: 'meta' }, t.feel) : '', t.how ? h('p', null, t.how) : '')
            )
          )
        : '',
      plan.length
        ? h(
            'details',
            null,
            h('summary', null, 'Full plan'),
            plan.map((w) =>
              h(
                'div',
                { class: week && w.week === week.week ? 'planrow now' : 'planrow' },
                h('div', null, h('strong', null, `W${w.week}`), ` ${dayLabel(w.start)} · ${w.block}`, w.status && w.status !== 'planned' ? [' ', h('span', { class: 'chip' }, w.status)] : ''),
                sessionDays(w).map((s) => {
                  const pace = paceSummary(sessionPaces(s, types));
                  return h('div', { class: 'meta' }, `${s.day} ${s.what || 'Rest'}${pace ? ` · ${pace}` : ''}`);
                })
              )
            )
          )
        : '',
      profile.guide ? h('details', null, h('summary', null, 'Fuel, water and race day'), h('p', { class: 'pre' }, profile.guide)) : ''
    );
    store.set('seenReplies', state.coach.filter((r) => r.reply).map((r) => r.id));
  };
};

views.home = (root) => {
  const modes = h('div', { class: 'modes' });
  const fbText = h('textarea', { rows: '3', placeholder: 'Feedback for Claude: what to change, what is annoying, what you want next.' });
  const fbMsg = h('p', { class: 'msg', role: 'status' });
  const fbSend = h('button', { class: 'primary', type: 'submit' }, 'Send');
  const runs = h('div');
  const stats = h('div');
  const decisions = h('div');
  const runMsg = h('p', { class: 'msg', role: 'status' });
  const runBtn = h('button', { class: 'primary wide', type: 'button' }, 'Run now');
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runMsg.textContent = 'Starting…';
    try {
      await api.call('runNow');
      runMsg.textContent = 'Started. New notes, recordings, questions and coach messages are handled in about 5 minutes. Tap Refresh at the top after that.';
    } catch (e) {
      runMsg.textContent = errorText(e);
    } finally {
      runBtn.disabled = false;
    }
  });
  const fbList = h('div');
  root.append(
    h('h1', null, 'Home'),
    decisions,
    runs,
    runBtn,
    runMsg,
    stats,
    h('h2', null, 'Routine'),
    modes,
    h('h2', null, 'Feedback'),
    h(
      'form',
      {
        onsubmit: async (ev) => {
          ev.preventDefault();
          const t = fbText.value.trim();
          if (!t) return;
          fbSend.disabled = true;
          try {
            await api.call('add', { tab: TABS.feedback, rows: [{ id: uid(), text: t }] });
            fbText.value = '';
            fbMsg.textContent = `Sent. Claude reads it at the ${runAt()} run.`;
            refresh();
          } catch (e) {
            fbMsg.textContent = errorText(e);
          } finally {
            fbSend.disabled = false;
          }
        },
      },
      fbText,
      fbSend,
      fbMsg
    ),
    fbList,
    h(
      'p',
      { class: 'meta foot' },
      `v${VERSION} · `,
      h(
        'button',
        {
          class: 'link',
          onclick: () => {
            store.del('config');
            location.reload();
          },
        },
        'Unlink this phone'
      )
    )
  );

  const MODE_INFO = {
    normal: 'Files notes, answers questions, then builds one feature.',
    light: 'Only files notes and answers questions.',
    paused: 'Scheduled runs do nothing until you switch back. Run now still works.',
  };

  return () => {
    const log = newest(state.log, 'started_at');
    const lastRun = log[0];
    const stale = !lastRun || hoursSince(lastRun.started_at) > 26;
    fill(runs, stale
        ? h(
            'div',
            { class: lastRun ? 'card warn' : 'card' },
            lastRun
              ? `No run since ${shortTime(lastRun.started_at)}. Check claude.ai/code/routines (the GitHub connection may have expired).`
              : `No runs yet. The first one is at ${runAt()}.`
          )
        : '',
      lastRun
        ? h(
            'div',
            { class: 'card' },
            h('div', { class: 'meta' }, `Last run ${shortTime(lastRun.started_at)}${lastRun.finished_at ? '' : ' (still going or cut off)'}`),
            h('p', { class: 'pre' }, lastRun.summary || ''),
            lastRun.shipped ? h('p', { class: 'pre' }, h('strong', null, 'Shipped: '), lastRun.shipped) : '',
            lastRun.needs_you ? h('div', { class: 'needs' }, h('strong', null, 'Needs you: '), lastRun.needs_you) : ''
          )
        : '',
      log.length > 1
        ? h(
            'details',
            null,
            h('summary', null, 'Earlier runs'),
            log.slice(1, 8).map((r) => h('div', { class: 'card' }, h('div', { class: 'meta' }, shortTime(r.started_at)), h('p', { class: 'pre' }, r.summary || '')))
          )
        : ''
    );
    const open = state.decisions.filter((d) => d.status === 'open');
    fill(decisions,
      open.map((d) =>
        h(
          'div',
          { class: 'card decision' },
          h('div', { class: 'meta' }, 'Claude needs a decision'),
          h('p', { class: 'pre' }, d.question),
          h(
            'div',
            { class: 'choices' },
            String(d.options)
              .split('|')
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: o === String(d.recommended).trim() ? 'primary' : 'secondary',
                    onclick: async () => {
                      try {
                        await api.call('update', { tab: TABS.decisions, id: d.id, fields: { answer: o } });
                        d.status = 'answered';
                        d.answer = o;
                        store.set('decisions', state.decisions);
                        update();
                        drawNav();
                      } catch (e) {
                        runMsg.textContent = errorText(e);
                      }
                    },
                  },
                  o === String(d.recommended).trim() ? `${o} (recommended)` : o
                )
              )
          )
        )
      )
    );
    const sessions = state.notes?.rows ?? [];
    const avg = (method) => {
      const rated = state.inbox.filter((r) => (r.method || 'keyboard') === method && /^[1-5]$/.test(String(r.rating)));
      return rated.length ? `${(rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length).toFixed(1)} from ${rated.length}` : 'not rated yet';
    };
    fill(stats, sessions.length
        ? h('p', { class: 'meta' }, `${state.notes.total_hours || '?'} hours over ${sessions.length} sessions. Last: ${sessions[sessions.length - 1].cells[0]}.`)
        : '',
      h('p', { class: 'meta' }, `Dictation accuracy (your ratings): typed ${avg('keyboard')}, recorded ${avg('recording')}.`)
    );
    fill(modes, Object.entries(MODE_INFO).map(([mode, info]) =>
        h(
          'button',
          {
            class: state.settings.routine_mode === mode ? 'mode on' : 'mode',
            onclick: async () => {
              try {
                state.settings = await api.call('settings', { set: { routine_mode: mode } });
                store.set('settings', state.settings);
              } catch (e) {
                fbMsg.textContent = errorText(e);
              }
              update();
            },
          },
          h('strong', null, mode),
          h('span', null, info)
        )
      )
    );
    fill(fbList, newest(state.feedback, 'created_at')
        .slice(0, 10)
        .map((r) =>
          h('div', { class: 'card' }, h('p', null, r.text), r.reply ? h('p', { class: 'note pre' }, r.reply) : h('div', { class: 'meta' }, `Read at the ${runAt()} run.`))
        )
    );
  };
};

async function cancel(tab, id) {
  try {
    await api.call('update', { tab, id, fields: { status: 'cancelled' } });
  } catch (e) {
    setStatus(errorText(e));
  }
  refresh();
}

views.analysis = (root) => {
  const out = h('div');
  root.append(h('h1', null, 'Analysis'), out);
  return () => {
    const gyms = byGym(state.notes);
    if (!gyms.length) return fill(out, h('p', { class: 'meta' }, 'No notes loaded yet.'));
    fill(out,
      h('p', { class: 'meta' }, 'Hours and most covered topics per gym. Sessions since 1 October count as GB SG here; your sheet is unchanged.'),
      h('div', { class: 'card' },
        h('strong', null, 'Fun facts'),
        funFacts(state.notes).map((f) => h('p', null, `${f.label}: ${f.value}`))
      ),
      gyms.map((g) =>
        h('div', { class: 'card' },
          h('strong', null, g.name),
          h('div', { class: 'meta' }, `${g.hours} hours · ${g.sessions} sessions · ${g.tipCount} tips`),
          g.topics.length
            ? h('p', null, g.topics.map((k) => `${k.word} (${k.count})`).join(', '))
            : h('p', { class: 'meta' }, 'No topics found in these notes yet.')
        )
      )
    );
  };
};

// ---- shell ----

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('status');
const pullEl = document.getElementById('pull');
let update = () => {};

function show(view) {
  state.view = view;
  store.set('view', view);
  fill(main);
  if (!store.get('config', null)) {
    nav.hidden = true;
    // Pasting matters on iPhone: a home-screen app doesn't share storage with Safari.
    const input = h('input', { type: 'url', placeholder: 'https://metry630.github.io/bjj-notes/#api=…', autocomplete: 'off' });
    const msg = h('p', { class: 'msg', role: 'status' });
    main.append(
      h('h1', null, 'BJJ notes'),
      h('p', null, 'This phone is not linked to your sheet yet.'),
      h('p', null, 'In your sheet "BJJ Lesson Tracker", open the App · Setup tab, copy the phone link in B4 and paste it here.'),
      h(
        'form',
        {
          onsubmit: (ev) => {
            ev.preventDefault();
            const v = input.value.trim();
            const cfg = v.includes('#') ? parseLink(v.slice(v.indexOf('#'))) : null;
            if (!cfg) return void (msg.textContent = 'That is not the phone link from B4. Copy the whole link and try again.');
            store.set('config', cfg);
            location.reload();
          },
        },
        input,
        h('button', { class: 'primary', type: 'submit' }, 'Link this phone'),
        msg
      )
    );
    return;
  }
  nav.hidden = false;
  update = views[view](main) || (() => {});
  update();
  drawNav();
  window.scrollTo(0, 0);
}

function drawNav() {
  const seen = new Set(store.get('seenAnswers', []));
  const newAnswers = state.questions.filter((r) => r.status === 'answered' && !seen.has(r.id)).length;
  const seenReplies = new Set(store.get('seenReplies', []));
  const newReplies = state.coach.filter((r) => r.reply && !seenReplies.has(r.id)).length;
  const needs = state.decisions.filter((d) => d.status === 'open').length || (newest(state.log, 'started_at')[0]?.needs_you ? 1 : 0);
  const items = navItems(state.view, { run: newReplies, ask: newAnswers, home: needs });
  const menu = h('div', { class: 'moremenu', hidden: true },
    MORE.map(([v, label]) =>
      h('button', { class: state.view === v ? 'on' : '', onclick: () => show(v) }, label, v === 'home' && needs ? h('span', { class: 'badge' }, String(needs)) : '')
    )
  );
  fill(nav, [
    ...items.map(({ v, label, badge, on }) =>
      h('button', { class: on ? 'on' : '', onclick: v === 'more' ? () => { menu.hidden = !menu.hidden; } : () => show(v) }, label, badge ? h('span', { class: 'badge' }, String(badge)) : '')
    ),
    menu,
  ]);
}

function setStatus(text) {
  state.status = text;
  statusEl.classList.toggle('syncing', text === 'Syncing…');
  fill(statusEl, text,
    ' ',
    h('button', { class: 'link', onclick: () => refresh() }, 'Refresh')
  );
}

let syncing = false;
async function refresh() {
  if (!store.get('config', null) || syncing) return;
  syncing = true;
  setStatus('Syncing…');
  try {
    if (state.queue.length) {
      const res = await flush(state.queue, (q) => api.call('add', { tab: q.tab, rows: q.rows }));
      state.queue = res.left;
      store.set('queue', state.queue);
      if (res.error && res.error.message !== 'offline') setStatus(errorText(res.error));
    }
    const keys = ['notes', 'inbox', 'questions', 'feedback', 'log', 'topics', 'settings', 'decisions', 'coach', 'runs', 'plan', 'profile'];
    const results = await api.batch([
      { action: 'notes' },
      { action: 'get', tab: TABS.inbox },
      { action: 'get', tab: TABS.questions },
      { action: 'get', tab: TABS.feedback },
      { action: 'get', tab: TABS.log },
      { action: 'get', tab: TABS.topics },
      { action: 'settings' },
      { action: 'get', tab: TABS.decisions },
      { action: 'get', tab: TABS.coach },
      { action: 'get', tab: TABS.runs },
      { action: 'get', tab: TABS.plan },
      { action: 'get', tab: TABS.profile },
    ]);
    results.forEach((r, i) => {
      if (!r.ok) return;
      const key = keys[i];
      // Rows marked hidden (cleaned up at his request) never show in the app; they stay in the sheet.
      const value =
        key === 'notes' ? { total_hours: r.total_hours, rows: r.rows }
        : key === 'settings' ? { routine_mode: r.routine_mode }
        : r.rows.filter((row) => !row.hidden);
      state[key] = value;
      store.set(key, value);
    });
    state.syncedAt = new Date().toISOString();
    store.set('syncedAt', state.syncedAt);
    setStatus(`Synced ${shortTime(state.syncedAt)}.`);
  } catch (e) {
    setStatus(`${errorText(e)} Showing the copy saved on this phone${state.syncedAt ? ` (${shortTime(state.syncedAt)})` : ''}.`);
  } finally {
    syncing = false;
    update();
    drawNav();
  }
}

// A home-screen app keeps running the code it was opened with. When version.json says a newer
// version is live, reload once (at most every 15 minutes per version, so a stale CDN copy can't
// cause a reload loop).
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const live = (await res.json()).version;
    const last = store.get('reloadFor', {});
    if (!live || live === VERSION || (last.v === live && Date.now() - last.at < 15 * 60000)) return;
    store.set('reloadFor', { v: live, at: Date.now() });
    location.reload();
  } catch {
    // offline: try next time
  }
}

window.addEventListener('online', () => refresh());
attachPull(document, () => refresh(), pullEl);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkVersion();
  if (hoursSince(state.syncedAt) > 0.03) refresh();
});

show(state.view in views ? state.view : 'log');
setStatus(state.syncedAt ? `Saved copy from ${shortTime(state.syncedAt)}.` : '');
refresh();
checkVersion();
