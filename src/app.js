import { store } from './store.js';
import { makeApi, parseLink } from './api.js';
import { search, toCells, highlightTerms, norm } from './search.js';
import { enqueue, flush } from './queue.js';
import { todayISO, isoToSheetDate, nextRunLabel, hoursSince, shortTime } from './dates.js';

export const VERSION = '0.2.0';

const TABS = {
  inbox: 'App · Inbox',
  questions: 'App · Questions',
  feedback: 'App · Feedback',
  log: 'App · Log',
  topics: 'App · Topics',
};
const ERRORS = {
  offline: 'No connection.',
  unauthorized: 'This phone link stopped working. Open the link in App · Setup again.',
  not_linked: 'This phone is not linked yet.',
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
  queue: store.get('queue', []),
  settings: store.get('settings', { routine_mode: 'normal' }),
  syncedAt: store.get('syncedAt', ''),
  status: '',
  askPrefill: '',
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

views.log = (root) => {
  const sessions = state.notes?.rows ?? [];
  const lastRow = sessions[sessions.length - 1]?.cells ?? [];
  const last = store.get('last', { location: lastRow[1] || '', hours: lastRow[2] || '' });
  const draft = store.get('draft', null) || { id: uid(), date: todayISO(), location: last.location, hours: last.hours, text: '' };
  const locations = [...new Set(sessions.map((r) => r.cells[1]).filter(Boolean).reverse())];

  const date = h('input', { type: 'date', value: draft.date, required: true });
  const location = h('input', { type: 'text', value: draft.location, list: 'locations', autocomplete: 'off', placeholder: 'Gym' });
  const hours = h('input', { type: 'number', value: draft.hours, step: '0.25', min: '0', max: '12', inputmode: 'decimal' });
  const text = h('textarea', {
    rows: '10',
    value: draft.text,
    placeholder: 'Tap the mic on your keyboard and talk: what you drilled, what worked, what to fix. Indonesian or English, whatever comes out.',
  });
  const msg = h('p', { class: 'msg', role: 'status' });
  const list = h('div');

  const readForm = () => ({ id: draft.id, date: date.value, location: location.value.trim(), hours: hours.value, text: text.value });
  const keep = () => store.set('draft', readForm());
  for (const el of [date, location, hours, text]) el.addEventListener('input', keep);

  const save = h('button', { class: 'primary', type: 'submit' }, 'Save');
  const form = h(
    'form',
    {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const d = readForm();
        if (!d.text.trim()) return void (msg.textContent = 'Nothing to save yet.');
        save.disabled = true;
        msg.textContent = 'Saving…';
        try {
          const entry = {
            tab: TABS.inbox,
            rows: [{ id: d.id, session_date: d.date, location: d.location, hours: d.hours, text: d.text }],
          };
          let queued = false;
          try {
            await api.call('add', { tab: entry.tab, rows: entry.rows });
          } catch (e) {
            if (e.message !== 'offline') throw e;
            state.queue = enqueue(state.queue, entry);
            store.set('queue', state.queue);
            queued = true;
          }
          store.set('last', { location: d.location, hours: d.hours });
          draft.id = uid();
          text.value = '';
          keep();
          msg.textContent = queued
            ? 'No connection. Your note is queued on this phone and goes out when you are back online.'
            : `Saved. Claude files it into your sheet at ${runAt()}. More to add? Just save again.`;
          if (queued) update();
          else refresh();
        } catch (e) {
          msg.textContent = `${errorText(e)} Your note is still here, tap Save again.`;
        } finally {
          save.disabled = false;
        }
      },
    },
    h('div', { class: 'row3' }, h('label', null, 'Date', date), h('label', null, 'Where', location), h('label', null, 'Hours', hours)),
    h('datalist', { id: 'locations' }, locations.map((l) => h('option', { value: l }))),
    text,
    save,
    msg
  );
  root.append(h('h1', null, 'Log a session'), form, list);

  const update = () => {
    const items = newest(state.inbox, 'created_at').filter((r) => r.status !== 'cancelled').slice(0, 8);
    const queued = state.queue.map((q) => q.rows[0]);
    fill(list, queued.length ? h('h2', null, 'Queued on this phone') : '',
      queued.map((r) =>
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'meta' }, `${isoToSheetDate(r.session_date) || r.session_date} · ${r.location || 'no gym'} · ${r.hours || '?'} h`),
          h('p', { class: 'clip' }, r.text),
          h('div', { class: 'meta' }, 'Queued. Sends when you are back online.')
        )
      ),
      items.length ? h('h2', null, 'Recently saved') : '',
      items.map((r) =>
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'meta' }, `${isoToSheetDate(r.session_date) || r.session_date} · ${r.location || 'no gym'} · ${r.hours || '?'} h`),
          h('p', { class: 'clip' }, r.text),
          r.status === 'new'
            ? h(
                'div',
                { class: 'meta' },
                `Waiting for the ${runAt()} run. `,
                h('button', { class: 'link', onclick: () => cancel(TABS.inbox, r.id) }, 'Cancel')
              )
            : h('div', { class: 'meta ok' }, r.sheet_row ? `Filed in your sheet, row ${r.sheet_row}.` : `Status: ${r.status}.`),
          r.agent_note ? h('p', { class: 'note' }, r.agent_note) : ''
        )
      )
    );
  };
  return update;
};

views.search = (root) => {
  const input = h('input', { type: 'search', placeholder: 'deep half, spider, mount escape…', value: state.query || '', autocomplete: 'off' });
  const out = h('div');
  input.addEventListener('input', () => {
    state.query = input.value;
    draw();
  });
  root.append(h('h1', null, 'Search your notes'), input, out);

  function draw() {
    const q = input.value.trim();
    const cells = toCells(state.notes);
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

views.home = (root) => {
  const modes = h('div', { class: 'modes' });
  const fbText = h('textarea', { rows: '3', placeholder: 'Feedback for Claude: what to change, what is annoying, what you want next.' });
  const fbMsg = h('p', { class: 'msg', role: 'status' });
  const fbSend = h('button', { class: 'primary', type: 'submit' }, 'Send');
  const runs = h('div');
  const stats = h('div');
  const fbList = h('div');
  root.append(
    h('h1', null, 'Home'),
    runs,
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
    paused: 'Does nothing until you switch back.',
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
    const sessions = state.notes?.rows ?? [];
    fill(stats, sessions.length
        ? h('p', { class: 'meta' }, `${state.notes.total_hours || '?'} hours over ${sessions.length} sessions. Last: ${sessions[sessions.length - 1].cells[0]}.`)
        : ''
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

// ---- shell ----

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('status');
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
  const needs = newest(state.log, 'started_at')[0]?.needs_you ? 1 : 0;
  const items = [
    ['log', 'Log', 0],
    ['search', 'Search', 0],
    ['ask', 'Ask', newAnswers],
    ['home', 'Home', needs],
  ];
  fill(nav, items.map(([v, label, badge]) =>
      h('button', { class: state.view === v ? 'on' : '', onclick: () => show(v) }, label, badge ? h('span', { class: 'badge' }, String(badge)) : '')
    )
  );
}

function setStatus(text) {
  state.status = text;
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
    const keys = ['notes', 'inbox', 'questions', 'feedback', 'log', 'topics', 'settings'];
    const results = await api.batch([
      { action: 'notes' },
      { action: 'get', tab: TABS.inbox },
      { action: 'get', tab: TABS.questions },
      { action: 'get', tab: TABS.feedback },
      { action: 'get', tab: TABS.log },
      { action: 'get', tab: TABS.topics },
      { action: 'settings' },
    ]);
    results.forEach((r, i) => {
      if (!r.ok) return;
      const key = keys[i];
      const value = key === 'notes' ? { total_hours: r.total_hours, rows: r.rows } : key === 'settings' ? { routine_mode: r.routine_mode } : r.rows;
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

window.addEventListener('online', () => refresh());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && hoursSince(state.syncedAt) > 0.03) refresh();
});

show(state.view in views ? state.view : 'log');
setStatus(state.syncedAt ? `Saved copy from ${shortTime(state.syncedAt)}.` : '');
refresh();
