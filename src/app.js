// The shell: phone link, sync, the outbox, screens and the tab bar. Each screen lives in
// src/views/; they share one `ctx` (state plus the actions that change it).
import { store } from './store.js';
import { makeApi, parseLink } from './api.js';
import { enqueue, flush } from './queue.js';
import { idb } from './idb.js';
import * as voice from './voice.js';
import { h, fill, transition, toast } from './ui.js';
import { icon } from './icons.js';
import { navItems, tabOf, LEGACY } from './nav.js';
import { attachPull } from './pull.js';
import { nextRunLabel, hoursSince, shortTime } from './dates.js';
import { profileMap } from './training.js';
import { parseWeek } from './week.js';
import { latestMarks, markRow } from './marks.js';
import { topicsFor, topicKey } from './journal.js';
import { isBjj, sameJson, quietNow } from './util.js';
import { questionsFor } from './views/shared.js';
import { today } from './views/today.js';
import { settings } from './views/settings.js';
import { bjj, bjjSearch, bjjAsk, bjjBefore, bjjStats } from './views/bjj.js';
import { run, runProgress } from './views/run.js';
import { lift, liftProgress } from './views/lift.js';
import { dance, danceMove, danceSocial, danceSearch } from './views/dance.js';
import { think, thinkConcept, thinkAsk, thinkSearch } from './views/think.js';

export const VERSION = '1.0.0';

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
  lifting: 'App · Lifting',
  dance: 'App · Dance',
  journal: 'App · Journal',
  marks: 'App · Marks',
};
const ERRORS = {
  offline: 'No connection.',
  timeout: 'The sheet took too long to answer.',
  not_json: 'Google sent an error page instead of an answer.',
  unauthorized: 'This phone link stopped working. Open the link in App · Setup again.',
  not_linked: 'This phone is not linked yet.',
  no_run_token: 'Run now is not set up yet: it needs the RUN_TOKEN script property.',
  too_soon: 'A run started less than 10 minutes ago. Give it a moment.',
  daily_limit: 'That is 8 manual runs today. The next scheduled run will pick things up.',
  fire_failed_429: "Claude's limit for runs this hour is reached. Try again later.",
  fire_failed_401: 'The Run now token was replaced or is wrong.',
  fire_failed_400: 'The routine is paused on claude.ai.',
  forbidden: 'The sheet script is older than this app. Paste and deploy the latest Code.gs, then try again.',
  old_script: 'Waiting for the sheet script update (Today has the steps).',
  already_processed: 'Already filed, so it can no longer be changed.',
};
const errorText = (e) => ERRORS[String(e?.message).split(':')[0]] || `Something went wrong (${e?.message}).`;
const runAt = () => `${nextRunLabel()} SGT`;

// ---- link this phone (the link from App · Setup carries the API URL and the phone token) ----
const linked = parseLink(location.hash);
if (linked) {
  store.set('config', linked);
  history.replaceState(null, '', location.pathname + location.search);
}
const api = makeApi(() => store.get('config', null));

const KEYS = ['notes', 'inbox', 'questions', 'feedback', 'log', 'topics', 'settings', 'decisions', 'coach', 'runs', 'plan', 'profile', 'lifting', 'dance', 'journal', 'marks'];
const state = {
  ...Object.fromEntries(KEYS.map((k) => [k, store.get(k, k === 'notes' ? null : k === 'settings' ? { routine_mode: 'normal' } : [])])),
  queue: store.get('queue', []),
  server: { version: store.get('serverVersion', 0) },
  syncedAt: store.get('syncedAt', ''),
  view: 'today',
  param: '',
  opts: {},
  askPrefill: '',
  topic: '',
};

// ---- the outbox: every save is on the phone (IndexedDB) before it is sent ----

async function loadQueue() {
  const legacy = store.get('queue', []);
  let q;
  try {
    q = (await idb.get('kv', 'queue')) || [];
  } catch {
    state.queue = legacy; // no IndexedDB: localStorage as before
    return;
  }
  for (const e of legacy) q = enqueue(q, e);
  state.queue = q;
  if (legacy.length) {
    try {
      await idb.put('kv', q, 'queue');
      store.del('queue');
    } catch {
      // keep the localStorage copy
    }
  }
}
const queueReady = loadQueue();
async function saveQueue() {
  try {
    await idb.put('kv', state.queue, 'queue');
  } catch {
    store.set('queue', state.queue);
  }
}

const serverVersion = () => Number(state.server?.version) || 0;
// A dance or philosophy note (or a question with an activity) waits until the script can store
// its activity: an older script would file it as a BJJ note.
const needsV5 = (q) => q.op !== 'update' && (q.tab === TABS.inbox || q.tab === TABS.questions) && q.rows.some((r) => !isBjj(r.activity) || r.kind);

let flushing = null;
function flushQueue(say, label) {
  if (flushing) return flushing;
  flushing = (async () => {
    await queueReady;
    const total = state.queue.length;
    let i = 0;
    const res = await flush(state.queue, async (q) => {
      i++;
      if (label && total > 1) say?.(`${label} (${i}/${total})…`);
      if (needsV5(q) && serverVersion() < 5) throw new Error('old_script');
      if (q.op === 'update') await api.call('update', { tab: q.tab, id: q.id, fields: q.fields });
      else await api.call('add', { tab: q.tab, rows: q.rows });
    });
    state.queue = res.left;
    await saveQueue();
    return res;
  })().finally(() => (flushing = null));
  return flushing;
}

const entryKey = (e) => e.rows?.[0]?.id;

// Saves entries: on the phone first, then out. True when they all reached the sheet.
async function submit(entries, say, label) {
  await queueReady;
  for (const e of entries) state.queue = enqueue(state.queue, { ...e, at: e.at || new Date().toISOString() });
  await saveQueue();
  requestUpdate(true);
  await flushQueue(say, label);
  requestUpdate(true);
  return entries.every((e) => !state.queue.some((q) => entryKey(q) === entryKey(e)));
}

// Changes fields on his own row: in place if it is still waiting on the phone, else as an update.
async function patch(tab, id, fields) {
  const queued = state.queue.find((q) => q.tab === tab && q.op !== 'update' && entryKey(q) === id);
  const key = Object.keys(TABS).find((k) => TABS[k] === tab);
  const local = Array.isArray(state[key]) ? state[key].find((r) => r.id === id) : null;
  if (local) Object.assign(local, fields);
  if (queued) {
    Object.assign(queued.rows[0], fields);
    await saveQueue();
    requestUpdate(true);
    return true;
  }
  return submit([{ op: 'update', tab, id, fields, rows: [{ id: `patch:${tab}:${id}:${Object.keys(fields).join(',')}` }] }]);
}

// Remove = hide it (status cancelled), with Undo. Something not sent yet just leaves the outbox.
async function cancel(tab, id, said = 'Removed.') {
  const queued = state.queue.find((q) => q.tab === tab && q.op !== 'update' && entryKey(q) === id);
  if (queued) {
    state.queue = state.queue.filter((q) => q !== queued);
    await saveQueue();
    requestUpdate(true);
    toast(said, {
      action: 'Undo',
      onaction: async () => {
        state.queue = enqueue(state.queue, queued);
        await saveQueue();
        requestUpdate(true);
        flushQueue();
      },
    });
    return;
  }
  await patch(tab, id, { status: 'cancelled' });
  toast(said, { action: 'Undo', onaction: () => restore(tab, id) });
}

async function restore(tab, id) {
  await patch(tab, id, { status: 'new' });
  toast('Restored.');
}

// ---- runs: start one so a note is filed (or a coach message answered) within minutes ----

let poll = 0;
const pending = () => state.inbox.some((r) => r.status === 'new') || state.coach.some((r) => r.status === 'new');
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
const filingNow = () => hoursSince(store.get('runStartedAt', '')) < 0.25;

const NOTE_TEXTS = {
  quiet: (at) => `Saved. It gets filed at ${at} (quiet hours), or tap File now.`,
  started: 'Saved. Filing it now: it shows up in a few minutes.',
  busy: 'Saved. A run is already going. If it misses this one, tap File now in a few minutes.',
  failed: (e) => `Saved, but filing could not start: ${e}`,
};
async function fileNow({ auto = false, texts = NOTE_TEXTS, say = toast } = {}) {
  if (auto && quietNow()) return say(texts.quiet(runAt()));
  try {
    await api.call('runNow');
    store.set('runStartedAt', new Date().toISOString());
    say(texts.started);
    startPolling();
  } catch (e) {
    if (e.message === 'too_soon') {
      say(texts.busy);
      startPolling();
    } else say(texts.failed(errorText(e)));
  }
}

// ---- screens ----

const VIEWS = {
  today,
  'today/settings': settings,
  bjj,
  'bjj/search': bjjSearch,
  'bjj/ask': bjjAsk,
  'bjj/before': bjjBefore,
  'bjj/stats': bjjStats,
  run,
  'run/progress': runProgress,
  lift,
  'lift/progress': liftProgress,
  dance,
  'dance/move': danceMove,
  'dance/social': danceSocial,
  'dance/search': danceSearch,
  think,
  'think/concept': thinkConcept,
  'think/ask': thinkAsk,
  'think/search': thinkSearch,
};
const TYPE_OPEN = { bjj: 'typeOpen', dance: 'typeOpen:dance', think: 'typeOpen:think' };

let weekCache = { profile: null, week: null };
const ctx = {
  state,
  api,
  TABS,
  version: VERSION,
  errorText,
  runAt,
  filingNow,
  startPolling,
  serverVersion,
  submit,
  patch,
  cancel,
  restore,
  fileNow: (o) => fileNow(o),
  refresh: () => refresh(),
  update: () => requestUpdate(true),
  show: (v, o) => show(v, o),
  week: () => {
    if (weekCache.profile !== state.profile) weekCache = { profile: state.profile, week: parseWeek(profileMap(state.profile).week) };
    return weekCache.week;
  },
  marks: () => latestMarks([...state.marks, ...state.queue.filter((q) => q.tab === TABS.marks).map((q) => q.rows[0])]),
  mark: (target, field, value) => submit([{ tab: TABS.marks, rows: [markRow(target, field, value)] }]),
};

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('status');
const pullEl = document.getElementById('pull');
let update = () => {};

function show(view, opts = {}) {
  const target = LEGACY[view] || view;
  const next = target in VIEWS ? target : 'today';
  if (opts.typeOpen && TYPE_OPEN[next]) store.set(TYPE_OPEN[next], true);
  state.param = opts.param ?? (next === state.view ? state.param : '');
  state.view = next;
  state.opts = opts;
  store.set('view', next);
  store.set('viewAt', Date.now());
  store.set('param', state.param);
  transition(render);
}

function render() {
  fill(main);
  document.body.dataset.tab = tabOf(state.view);
  document.body.dataset.view = state.view;
  if (!store.get('config', null)) {
    nav.hidden = true;
    // Pasting matters on iPhone: a home-screen app doesn't share storage with Safari.
    const input = h('input', { type: 'url', placeholder: 'https://metry630.github.io/bjj-notes/#api=…', autocomplete: 'off' });
    const msg = h('p', { class: 'msg', role: 'status' });
    main.append(
      h('header', { class: 'head' }, h('div', null, h('h1', null, 'Your notes'))),
      h('p', null, 'This phone is not linked to your sheet yet.'),
      h('p', null, 'In your sheet "BJJ Lesson Tracker", open the App · Setup tab, copy the phone link in B4 and paste it here.'),
      h('form', {
        onsubmit: (ev) => {
          ev.preventDefault();
          const v = input.value.trim();
          const cfg = v.includes('#') ? parseLink(v.slice(v.indexOf('#'))) : null;
          if (!cfg) return void (msg.textContent = 'That is not the phone link from B4. Copy the whole link and try again.');
          store.set('config', cfg);
          location.reload();
        },
      }, input, h('button', { class: 'primary', type: 'submit' }, 'Link this phone'), msg)
    );
    return;
  }
  nav.hidden = false;
  update = VIEWS[state.view](main, ctx) || (() => {});
  update();
  drawNav();
  window.scrollTo(0, 0);
}

// Redraw the data parts of the screen. A background sync never redraws under his thumb: not while
// he is typing, and not when nothing changed (so open sections stay open and the page stays put).
let pendingUpdate = false;
function requestUpdate(now = false) {
  const el = document.activeElement;
  if (!now && el && main.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
    pendingUpdate = true;
    return;
  }
  pendingUpdate = false;
  update();
  drawNav();
}
document.addEventListener('focusout', () => setTimeout(() => pendingUpdate && requestUpdate(), 0));

function drawNav() {
  const seenReplies = new Set(store.get('seenReplies', []));
  const seenAnswers = new Set(store.get('seenAnswers', []));
  const seenConcepts = new Set(store.get('seenConcepts', []));
  const unread = (activity) => questionsFor(state.questions, activity).filter((q) => q.status === 'answered' && !seenAnswers.has(q.id)).length;
  const lastLog = [...state.log].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
  const badges = {
    today: state.decisions.filter((d) => d.status === 'open').length + (lastLog?.needs_you ? 1 : 0) + (serverVersion() > 0 && serverVersion() < 5 ? 1 : 0),
    run: state.coach.filter((r) => r.reply && !seenReplies.has(r.id)).length,
    bjj: unread('bjj'),
    think: unread('philosophy') + topicsFor(state.topics, 'philosophy').filter((t) => t.expansion && !seenConcepts.has(topicKey(t.topic))).length,
  };
  fill(nav, navItems(state.view, badges).map(({ v, label, icon: name, badge, on }) =>
    h('button', { type: 'button', class: on ? 'on' : '', 'aria-current': on ? 'page' : null, onclick: () => show(v) },
      h('span', { class: 'navicon' }, icon(name, { size: 24, stroke: 1.9 }), badge ? h('span', { class: 'badge', 'aria-label': `${badge} new` }, String(badge)) : null),
      h('span', { class: 'navlabel' }, label))));
}

function setStatus(text, busy = false) {
  statusEl.classList.toggle('syncing', busy);
  fill(statusEl, h('span', null, text), h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Sync now', onclick: () => refresh() }, icon('refresh-cw', { size: 16 })));
}

let syncing = false;
async function refresh() {
  if (!store.get('config', null) || syncing) return;
  syncing = true;
  setStatus('Syncing…', true);
  try {
    await queueReady;
    if (state.queue.length) await flushQueue();
    const results = await api.batch([
      { action: 'ping' },
      { action: 'notes' },
      ...KEYS.slice(1).map((k) => (k === 'settings' ? { action: 'settings' } : { action: 'get', tab: TABS[k] })),
    ]);
    let changed = false;
    const [ping, ...rest] = results;
    if (ping.ok) {
      const v = Number(ping.version) || 4; // a script without a version is v4 or older
      if (v !== serverVersion()) changed = true;
      state.server = { version: v };
      store.set('serverVersion', v);
    }
    rest.forEach((r, i) => {
      if (!r.ok) return;
      const key = KEYS[i];
      // Rows marked hidden (cleaned up at his request) never show in the app; they stay in the sheet.
      const value = key === 'notes' ? { total_hours: r.total_hours, rows: r.rows } : key === 'settings' ? { routine_mode: r.routine_mode } : r.rows.filter((row) => !row.hidden);
      if (!sameJson(state[key], value)) {
        state[key] = value;
        store.set(key, value);
        changed = true;
      }
    });
    state.syncedAt = new Date().toISOString();
    store.set('syncedAt', state.syncedAt);
    if (state.queue.length) await flushQueue(); // the version may have unlocked held notes
    voice.unblock();
    voice.kick();
    voice.tidy(state.inbox);
    setStatus(`Synced ${shortTime(state.syncedAt)}`);
    if (changed) requestUpdate();
  } catch (e) {
    setStatus(`${errorText(e)} Showing the copy on this phone${state.syncedAt ? ` (${shortTime(state.syncedAt)})` : ''}.`);
  } finally {
    syncing = false;
    drawNav();
  }
}

// A home-screen app keeps running the code it was opened with. When version.json says a newer
// version is live, reload once (at most every 15 minutes per version), but never in the middle of
// a recording or with a sheet open.
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const live = (await res.json()).version;
    const last = store.get('reloadFor', {});
    if (!live || live === VERSION || (last.v === live && Date.now() - last.at < 15 * 60000)) return;
    if (voice.list().some((r) => r.state === 'recording') || document.querySelector('dialog[open]')) return;
    store.set('reloadFor', { v: live, at: Date.now() });
    location.reload();
  } catch {
    // offline: try next time
  }
}

// ---- start ----

let lastVoiceDraw = 0;
voice.configure({
  api,
  canCommit: (r) => isBjj(r.meta?.activity) || serverVersion() >= 5,
  onCommit: async () => {
    await refresh();
    fileNow({ auto: true, say: toast });
  },
});
voice.onChange(() => {
  // Upload progress redraws at most every 2 s, so a recording does not repaint the screen each second.
  const now = Date.now();
  if (now - lastVoiceDraw > 2000) {
    lastVoiceDraw = now;
    requestUpdate();
  }
});
voice.load().then(() => {
  requestUpdate();
  voice.kick();
});

window.addEventListener('online', () => {
  refresh();
  voice.kick();
});
attachPull(document, () => refresh(), pullEl);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkVersion();
  voice.kick();
  if (hoursSince(state.syncedAt) > 0.03) refresh();
});
// While the app is open, keep sending what waits: recordings and the outbox.
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (voice.list().some((r) => !r.committed)) voice.kick();
  if (state.queue.length) flushQueue().then(() => requestUpdate());
}, 30000);

// Open on Today, unless he was on another screen in the last 20 minutes (between sets, say).
const lastView = LEGACY[store.get('view', 'today')] || store.get('view', 'today');
const recent = Date.now() - Number(store.get('viewAt', 0)) < 20 * 60000;
state.view = recent && lastView in VIEWS ? lastView : 'today';
state.param = recent ? store.get('param', '') : '';
render();
setStatus(state.syncedAt ? `Copy from ${shortTime(state.syncedAt)}` : '');
queueReady.then(() => requestUpdate());
refresh();
checkVersion();
