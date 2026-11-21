// Settings (⚙ on Today): Claude's runs and mode, the sheet script, his data and how it is kept,
// removed items with Restore, feedback history. Rarely needed, so one tap away, not on Today.
import { h, fill, backBar, header, sec, toast } from '../ui.js';
import { store } from '../store.js';
import * as voice from '../voice.js';
import { shortTime } from '../dates.js';
import { dayLabel } from '../training.js';
import { newest, plural } from '../util.js';

const MODES = [
  ['normal', 'Files notes, answers questions, then builds one feature.'],
  ['light', 'Only files notes and answers questions.'],
  ['paused', 'Scheduled runs do nothing until you switch back. Run now still works.'],
];

const removedLabel = (tab, r) => {
  if (tab === 'App · Lifting') return `${r.exercise} ${r.weight_kg ? `${r.weight_kg} kg × ` : ''}${r.reps} · ${dayLabel(r.date)}`;
  if (tab === 'App · Inbox') return `${r.method === 'recording' ? 'Voice note' : 'Note'} · ${dayLabel(r.session_date)}${r.text ? ` · ${String(r.text).slice(0, 50)}` : ''}`;
  if (tab === 'App · Questions') return `Question · ${String(r.question).slice(0, 60)}`;
  if (tab === 'App · Coach') return `Coach message · ${String(r.text || r.kind).slice(0, 60)}`;
  return r.id;
};

export function settings(root, ctx) {
  const runs = h('div');
  const modes = h('div', { class: 'modes' });
  const script = h('div');
  const data = h('div');
  const removed = h('div');
  const fb = h('div');
  root.append(backBar('Today', () => ctx.show('today')), header('Settings'), runs, sec('Routine'), modes, script, data, removed, fb,
    h('p', { class: 'meta foot' }, `App ${ctx.version} · `, h('button', { class: 'link', type: 'button', onclick: () => { store.del('config'); location.reload(); } }, 'Unlink this phone')));
  return () => {
    const log = newest(ctx.state.log, 'started_at');
    const last = log[0];
    const stale = !last || (Date.now() - Date.parse(last.started_at)) / 3600e3 > 26;
    fill(runs,
      sec('Claude'),
      stale ? h('div', { class: 'card warn' }, last ? `No run since ${shortTime(last.started_at)}. Check claude.ai/code/routines (the GitHub connection may have expired).` : `No runs yet. The first one is at ${ctx.runAt()}.`) : null,
      last ? h('div', { class: 'card' }, h('div', { class: 'meta' }, `Last run ${shortTime(last.started_at)}${last.finished_at ? '' : ' (still going or cut off)'}`), h('p', { class: 'pre' }, last.summary || ''), last.shipped ? h('p', { class: 'pre' }, h('strong', null, 'Shipped: '), last.shipped) : null, last.needs_you ? h('div', { class: 'needs' }, h('strong', null, 'Needs you: '), last.needs_you) : null) : null,
      h('button', { class: 'primary wide', type: 'button', onclick: () => ctx.fileNow({ say: toast }) }, 'Run now'),
      log.length > 1 ? h('details', { class: 'fold' }, h('summary', null, 'Earlier runs'), log.slice(1, 10).map((r) => h('div', { class: 'card' }, h('div', { class: 'meta' }, shortTime(r.started_at)), h('p', { class: 'pre' }, r.summary || '')))) : null);
    fill(modes, MODES.map(([mode, about]) => h('button', {
      type: 'button',
      class: ctx.state.settings.routine_mode === mode ? 'mode on' : 'mode',
      onclick: async () => {
        try {
          ctx.state.settings = await ctx.api.call('settings', { set: { routine_mode: mode } });
          store.set('settings', ctx.state.settings);
        } catch (e) {
          toast(ctx.errorText(e));
        }
        ctx.update();
      },
    }, h('strong', null, mode), h('span', null, about))));
    const v = ctx.serverVersion();
    fill(script, sec('Sheet script'), h('div', { class: v >= 5 ? 'card' : 'card warn' },
      v >= 5 ? h('p', null, `Version ${v}: up to date.`) : h('p', null, v ? `Version ${v || 'older'}: paste the new Code.gs (Extensions › Apps Script), run setup, then Deploy › Manage deployments › edit › New version.` : 'Not checked yet (no connection).')));
    const s = ctx.state;
    const counts = [
      [`${s.notes?.rows?.length || 0} BJJ sessions`, 'Sheet1'],
      [plural(s.journal.filter((r) => r.activity === 'dance').length, 'dance tip'), 'App · Journal'],
      [plural(s.journal.filter((r) => r.activity === 'philosophy').length, 'philosophy note'), 'App · Journal'],
      [plural(s.runs.length, 'run'), 'App · Runs'],
      [plural(s.lifting.filter((r) => r.status !== 'cancelled').length, 'lift set'), 'App · Lifting'],
      [plural(s.questions.length, 'question'), 'App · Questions'],
    ];
    const local = voice.list();
    fill(data, sec('Your data'), h('div', { class: 'card' },
      h('p', null, 'Everything lives in your Google Sheet “BJJ Lesson Tracker”.'),
      h('ul', { class: 'counts' }, counts.map(([a, b]) => h('li', null, a, h('span', { class: 'meta' }, ` · ${b}`)))),
      h('p', { class: 'meta' }, 'Nothing is ever deleted. Removing hides an item and can be undone below; Claude can fill an empty field but never change your words; every change to a filled cell is copied to App · History first. Voice notes stay on this phone until they are transcribed.'),
      h('p', { class: 'meta' }, `On this phone: ${plural(local.length, 'recording')}${local.filter((r) => !r.committed).length ? `, ${local.filter((r) => !r.committed).length} still to send` : ''} · ${plural(s.queue.length, 'item')} waiting for signal${voice.isDurable() ? '' : ' · this browser cannot keep them after it closes'}.`),
      s.queue.some((q) => q.error) ? h('p', { class: 'meta' }, `Held back: ${s.queue.filter((q) => q.error).map((q) => ctx.errorText(new Error(q.error))).join(' ')}`) : null));
    const gone = [
      ...s.inbox.filter((r) => r.status === 'cancelled').map((r) => ['App · Inbox', r]),
      ...s.lifting.filter((r) => r.status === 'cancelled').map((r) => ['App · Lifting', r]),
      ...s.questions.filter((r) => r.status === 'cancelled').map((r) => ['App · Questions', r]),
      ...s.coach.filter((r) => r.status === 'cancelled').map((r) => ['App · Coach', r]),
    ].sort((a, b) => String(b[1].created_at || b[1].asked_at).localeCompare(String(a[1].created_at || a[1].asked_at))).slice(0, 20);
    fill(removed, gone.length ? [sec('Removed items'), h('div', { class: 'list' }, gone.map(([tab, r]) => h('div', { class: 'row static' }, h('span', { class: 'rowtext' }, h('span', { class: 'rowlabel' }, removedLabel(tab, r))),
      h('button', { type: 'button', class: 'chipbtn', onclick: () => ctx.restore(tab, r.id) }, 'Restore'))))] : null);
    fill(fb, s.feedback.length ? [sec('Feedback'), newest(s.feedback, 'created_at').slice(0, 10).map((r) => h('div', { class: 'card' }, h('p', null, r.text), r.reply ? h('p', { class: 'note pre' }, r.reply) : h('div', { class: 'meta' }, `Read at the ${ctx.runAt()} run.`)))] : null);
  };
}
