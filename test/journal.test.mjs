// Dance moves, philosophy concepts, marks and Before class "To try". Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicsFor, tipsFor, legacyDanceTips, groupTopics, sessionsOf, lastSession, socialPicks, thisWeek, revisit, levelTarget, asCells } from '../src/journal.js';
import { latestMarks, markKey } from '../src/marks.js';
import { toTry } from '../src/beforeclass.js';
import { search } from '../src/search.js';

const topics = [
  { id: 'deep-half', topic: 'deep half', summary: 'bjj, from before activities existed' },
  { id: 'dance:cross-body-lead', activity: 'dance', topic: 'Cross body lead', kind: 'move', style: 'salsa', summary: 'Step out of the slot.' },
  { id: 'dance:enchufla', activity: 'dance', topic: 'enchufla', kind: 'move' },
  { id: 'philosophy:attention', activity: 'philosophy', topic: 'Attention', expansion: 'Long text.', question: 'Is attention chosen?', practice: 'Pause first.' },
];

const journal = [
  { id: 'd1-1', activity: 'dance', session_date: '2026-11-23', topic: 'cross body lead', text: 'cue one', tags: 'salsa,class', seq: 1 },
  { id: 'd1-2', activity: 'dance', session_date: '2026-11-23', topic: 'frame', text: 'lead with the frame', tags: 'salsa,class', seq: 2 },
  { id: 'd2-1', activity: 'dance', session_date: '2026-11-26', topic: 'Basic with turn', text: 'turn on 5', tags: 'bachata,class', seq: 1 },
  { id: 'd2-2', activity: 'dance', session_date: '2026-11-26', topic: 'Cross Body Lead', text: 'cue two', tags: 'salsa', seq: 2 },
  { id: 'd3-1', activity: 'dance', session_date: '2026-11-28', topic: 'hammerlock', text: 'gone', hidden: 'yes' },
  { id: 'p1-1', activity: 'philosophy', session_date: '2026-11-22', topic: 'attention', text: 'his words', seq: 1 },
  { id: 'p1-2', activity: 'philosophy', session_date: '2026-11-22', topic: 'practice', text: 'notice the impulse', seq: 2 },
  { id: 'p0-1', activity: 'philosophy', session_date: '2026-11-08', topic: 'unity', text: 'older idea', seq: 1 },
];

test('topics per activity: rows without one are BJJ', () => {
  assert.deepEqual(topicsFor(topics, 'bjj').map((t) => t.id), ['deep-half']);
  assert.deepEqual(topicsFor(topics, 'dance').map((t) => t.id), ['dance:cross-body-lead', 'dance:enchufla']);
});

test('tips per activity, hidden ones out, in the order he said them', () => {
  assert.deepEqual(tipsFor(journal, 'dance').map((t) => t.id), ['d1-1', 'd1-2', 'd2-1', 'd2-2']);
  assert.deepEqual(tipsFor(journal, 'philosophy').map((t) => t.id), ['p0-1', 'p1-1', 'p1-2']);
});

test('moves group by name across spellings, with styles, technique apart, empty topic rows kept', () => {
  const g = groupTopics(tipsFor(journal, 'dance'), topicsFor(topics, 'dance'));
  const cbl = g.find((x) => x.key === 'cross body lead');
  assert.equal(cbl.tips.length, 2);
  assert.deepEqual(cbl.styles, ['salsa']);
  assert.equal(cbl.last, '2026-11-26');
  assert.equal(cbl.row.summary, 'Step out of the slot.');
  assert.equal(g.find((x) => x.key === 'frame').kind, 'technique');
  assert.equal(g.find((x) => x.key === 'basic with turn').kind, 'move');
  assert.equal(g.find((x) => x.key === 'enchufla').tips.length, 0);
  assert.deepEqual(g.map((x) => x.key).slice(0, 2), ['basic with turn', 'cross body lead']);
});

test('the 0.12 typed cues show as tips', () => {
  const tips = legacyDanceTips([{ id: 'x', created_at: '2026-11-21T10:00:00Z', move: 'Turn ', cue: 'prep on 8' }, { id: 'y', move: 'Dip', cue: 'x', status: 'cancelled' }]);
  assert.deepEqual(tips.map((t) => [t.topic, t.text, t.session_date]), [['Turn', 'prep on 8', '2026-11-21']]);
});

test('classes as days; the last class on or before today', () => {
  const tips = tipsFor(journal, 'dance');
  assert.deepEqual(sessionsOf(tips).map((s) => [s.date, s.styles]), [['2026-11-26', ['bachata', 'salsa']], ['2026-11-23', ['salsa']]]);
  assert.equal(lastSession(tips, '2026-11-25').date, '2026-11-23');
  assert.equal(lastSession(tips, '2026-11-20'), null);
});

test('before the social: got-it and learning moves per style, levels from marks', () => {
  const groups = groupTopics(tipsFor(journal, 'dance'), topicsFor(topics, 'dance'));
  const marks = latestMarks([
    { target: levelTarget('cross body lead'), field: 'level', value: 'learning', created_at: '2026-11-24T01:00:00Z' },
    { target: levelTarget('cross body lead'), field: 'level', value: 'got', created_at: '2026-11-25T01:00:00Z' },
    { target: levelTarget('enchufla'), field: 'level', value: 'learning', created_at: '2026-11-25T01:00:00Z' },
  ]);
  const levelOf = (key) => marks.get(markKey(levelTarget(key), 'level')) || 'new';
  const picks = socialPicks(groups, levelOf, () => 0.5);
  const salsa = picks.find((p) => p.style === 'salsa');
  assert.deepEqual(salsa.got.map((m) => [m.name, m.cue]), [['cross body lead', 'cue two']]);
  // Without any level set, the moves with the most cues count as got.
  const fresh = socialPicks(groups, () => 'new', () => 0.5);
  assert.deepEqual(fresh.find((p) => p.style === 'bachata').got.map((m) => m.name), ['Basic with turn']);
  assert.ok(fresh.some((p) => p.style === '' && p.got.some((m) => m.key === 'enchufla')));
});

test('marks: the newest row wins, every earlier one stays', () => {
  const m = latestMarks([
    { target: 't', field: 'level', value: 'new', created_at: '2026-11-25T03:00:00Z' },
    { target: 't', field: 'level', value: 'got', created_at: '2026-11-25T01:00:00Z' },
    { target: 'u', field: 'level', value: 'x', hidden: 'yes' },
  ]);
  assert.equal(m.get(markKey('t', 'level')), 'new');
  assert.equal(m.has(markKey('u', 'level')), false);
});

test('philosophy: this week’s practice and the question to bring; revisit rotates daily', () => {
  const tips = tipsFor(journal, 'philosophy');
  const concepts = topicsFor(topics, 'philosophy');
  const w = thisWeek(tips, concepts, '2026-11-25');
  assert.deepEqual([w.practice.text, w.practice.mine], ['notice the impulse', true]);
  assert.equal(w.question.text, 'Is attention chosen?');
  assert.equal(thisWeek(tips, concepts, '2026-12-05').practice, null); // older than 8 days
  const groups = groupTopics(tips, concepts);
  assert.equal(revisit(groups, '2026-11-25').key, 'unity');
  assert.equal(revisit(groups, '2026-11-09'), null);
});

test('dance and philosophy tips are searchable like BJJ cells', () => {
  const hits = search(asCells(tipsFor(journal, 'dance')), 'frame');
  assert.equal(hits[0].text, 'lead with the frame');
});

test('To try: recent tips phrased as something to try, newest first', () => {
  const cells = [
    { row: 1, col: 4, date: '20/11/26', location: 'G', text: 'Next time try the knee cut earlier' },
    { row: 1, col: 5, date: '20/11/26', location: 'G', text: 'underhook first' },
    { row: 2, col: 4, date: '24/11/26', location: 'G', text: 'coba frame dulu' },
    { row: 0, col: 4, date: '1/10/26', location: 'G', text: 'try this, but too old' },
  ];
  assert.deepEqual(toTry(cells, '2026-11-25').map((c) => c.text), ['coba frame dulu', 'Next time try the knee cut earlier']);
});
