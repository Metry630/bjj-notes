import test from 'node:test';
import assert from 'node:assert/strict';
import { search, toCells, expand, queryTerms, highlightTerms, topicCells, topicCounts } from '../src/search.js';
import { draftDate, todayISO, sheetDateToISO, isoToSheetDate, nextRunLabel, hoursSince } from '../src/dates.js';
import { parseLink, makeApi } from '../src/api.js';
import { findLeaks, shingles, addedLines } from '../tools/check-public.mjs';

// Synthetic notes only: this repo is public.
const notes = {
  total_hours: '5',
  rows: [
    { row: 5, cells: ['1/1/25', 'Gym A', '1', 'from deep half, get the underhook first', 'kalo dia flatten, recover knee shield'] },
    { row: 6, cells: ['2/1/25', 'Gym A', '2', 'DLR hook then off-balance to the far side', 'side control: knee on belly before mount'] },
    { row: 7, cells: ['3/1/25', 'Gym B', '1', 'de la riva sweep worked twice', 'closed guard posture'] },
  ],
};
const cells = toCells(notes);

test('toCells flattens tips with date and location', () => {
  assert.equal(cells.length, 6);
  assert.deepEqual(cells[0], { row: 5, col: 4, date: '1/1/25', location: 'Gym A', text: 'from deep half, get the underhook first' });
});

test('question words are dropped, so a sentence searches like keywords', () => {
  assert.deepEqual(queryTerms('What did my notes say about deep half again?'), ['deep', 'half']);
  assert.equal(search(cells, 'what did my notes say about deep half')[0].text, 'from deep half, get the underhook first');
});

test('aliases: DLR finds de la riva and the other way round', () => {
  assert.ok(expand('dlr').includes('de la riva'));
  const texts = search(cells, 'de la riva').map((c) => c.text);
  assert.ok(texts.includes('DLR hook then off-balance to the far side'));
  assert.ok(texts.includes('de la riva sweep worked twice'));
  assert.ok(search(cells, 'kalau').some((c) => c.text.startsWith('kalo')));
});

test('exact phrase ranks above scattered words, newest first on ties', () => {
  const res = search(cells, 'knee');
  assert.deepEqual(res.map((c) => c.row), [6, 5]);
});

test('no full match falls back to partial matches', () => {
  const res = search(cells, 'underhook zebra');
  assert.equal(res.length, 1);
  assert.equal(res[0].partial, true);
  assert.deepEqual(search(cells, ''), []);
});

test('highlight terms include alias words', () => {
  assert.ok(highlightTerms('dlr').includes('riva'));
});

test('dates: sheet d/m/yy <-> ISO, today, next run', () => {
  assert.equal(sheetDateToISO('1/11/24'), '2024-11-01');
  assert.equal(sheetDateToISO('Total:'), '');
  assert.equal(isoToSheetDate('2026-10-31'), '31/10/26');
  assert.equal(todayISO(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(nextRunLabel(new Date('2026-10-31T12:00:00Z')), '04:05'); // 20:00 SGT
  assert.equal(nextRunLabel(new Date('2026-10-31T02:00:00Z')), '18:05'); // 10:00 SGT
  assert.equal(nextRunLabel(new Date('2026-10-30T19:00:00Z')), '04:05'); // 03:00 SGT
  assert.equal(hoursSince('nope'), Infinity);
});

const TOKEN = `bjj_${'a'.repeat(64)}`;
const EXEC = 'https://script.google.com/macros/s/AKfy-cbx_123/exec';

test('phone link: only a script.google.com exec URL and a well-formed token are accepted', () => {
  assert.deepEqual(parseLink(`#api=${encodeURIComponent(EXEC)}&k=${TOKEN}`), { api: EXEC, k: TOKEN });
  assert.equal(parseLink(`#api=${encodeURIComponent('https://evil.example/exec')}&k=${TOKEN}`), null);
  assert.equal(parseLink(`#api=${encodeURIComponent(EXEC)}&k=short`), null);
  assert.equal(parseLink(''), null);
});

test('api sends a text/plain-safe body with the token and surfaces API errors', async () => {
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, init });
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => (body.action === 'ping' ? { ok: true, role: 'phone' } : { ok: false, error: 'forbidden' }) };
  };
  const api = makeApi(() => ({ api: EXEC, k: TOKEN }), fake);
  assert.equal((await api.call('ping')).role, 'phone');
  assert.equal(seen[0].url, EXEC);
  assert.equal(seen[0].init.headers, undefined); // no custom headers: keeps it a simple CORS request
  assert.equal(JSON.parse(seen[0].init.body).token, TOKEN);
  await assert.rejects(api.call('appendSession'), /forbidden/);
  await assert.rejects(makeApi(() => null, fake).call('ping'), /not_linked/);
  await assert.rejects(makeApi(() => ({ api: EXEC, k: TOKEN }), async () => { throw new TypeError('fetch failed'); }).call('ping'), /offline/);
});

test('check-public flags note text and secrets in added lines only', () => {
  const diff = [
    '+++ b/test/x.test.mjs',
    '@@ -0,0 +1,3 @@',
    '+const a = "kalo dia flatten, recover knee shield right away please now";',
    `+const t = "${TOKEN}";`,
    '+const fine = "a synthetic sentence that is not in any of the notes at all";',
    '--- a/old',
    '-kalo dia flatten, recover knee shield right away please now',
  ].join('\n');
  const leaks = findLeaks(diff, ['kalo dia flatten, recover knee shield right away please now'], [TOKEN]);
  assert.deepEqual(leaks.map((l) => [l.file, l.line, l.why]), [
    ['test/x.test.mjs', 1, 'note text'],
    ['test/x.test.mjs', 2, 'secret'],
  ]);
  assert.equal(addedLines(diff).length, 3);
  assert.equal(shingles('too short').size, 0);
});

import { enqueue, flush } from '../src/queue.js';

test('queue keeps one entry per note id and sends oldest first', async () => {
  const a = { tab: 'T', rows: [{ id: 'a' }] };
  const b = { tab: 'T', rows: [{ id: 'b' }] };
  let q = enqueue(enqueue(enqueue([], a), b), { tab: 'T', rows: [{ id: 'a', text: 'x' }] });
  assert.deepEqual(q.map((e) => e.rows[0].id), ['b', 'a']);
  const sent = [];
  const res = await flush(q, async (e) => void sent.push(e.rows[0].id));
  assert.deepEqual(sent, ['b', 'a']);
  assert.deepEqual(res, { left: [], sent: 2, error: null });
});

test('queue stops at the first failure and keeps the rest', async () => {
  const q = ['a', 'b', 'c'].map((id) => ({ tab: 'T', rows: [{ id }] }));
  let n = 0;
  const res = await flush(q, async () => {
    if (++n === 2) throw new Error('offline');
  });
  assert.equal(res.sent, 1);
  assert.deepEqual(res.left.map((e) => e.rows[0].id), ['b', 'c']);
  assert.equal(res.error.message, 'offline');
});

// ---- v0.3: recordings ----
import { slices, audioBatches, pickMime } from '../src/recorder.js';
import { assembleAudio } from '../tools/sheet.mjs';

test('recordings are sliced into cell-sized parts and batched 10 per request', () => {
  const b64 = 'A'.repeat(30000 * 12 + 5);
  assert.equal(slices(b64).length, 13);
  const batches = audioBatches('n1', 'audio/mp4; codecs=mp4a.40.2', b64);
  assert.deepEqual(batches.map((b) => b.length), [10, 3]);
  assert.deepEqual(batches[0][0], { id: 'n1-1', inbox_id: 'n1', seq: 1, total: 13, mime: 'audio/mp4;codecs=mp4a.40.2', data: 'A'.repeat(30000) });
  assert.equal(batches[1][2].seq, 13);
  assert.equal(pickMime((t) => t === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus');
  assert.equal(pickMime(() => false), '');
});

test('the routine joins slices back into the original bytes, and refuses a partial upload', () => {
  const bytes = Buffer.from('hello voice note, synthetic bytes only');
  const b64 = bytes.toString('base64');
  const rows = audioBatches('n1', 'audio/mp4', b64).flat().map((r) => ({ ...r, data: r.data }));
  const split = slices(b64, 8).map((data, i, all) => ({ id: `n1-${i + 1}`, inbox_id: 'n1', seq: i + 1, total: all.length, mime: 'audio/mp4', data }));
  assert.deepEqual(assembleAudio([...split].reverse(), 'n1').bytes, bytes);
  assert.deepEqual(assembleAudio(rows, 'n1').bytes, bytes);
  assert.throws(() => assembleAudio(split.slice(1), 'n1'), /incomplete: \d+\/\d+/);
  assert.throws(() => assembleAudio(split, 'other'), /no audio/);
});

import { gymOf, latestYear, topics, byGym, funFacts } from '../src/analysis.js';

test('analysis: sessions since 1 October of the latest year count as the current gym', () => {
  const rows = [
    { row: 1, cells: ['30/9/26', 'Gym A', '2', 'x'] },
    { row: 2, cells: ['1/10/26', 'Gym A', '1.5', 'x'] },
    { row: 3, cells: ['5/11/26', '', '1', 'x'] },
    { row: 4, cells: ['1/10/25', 'Gym B', '2', 'x'] },
  ];
  assert.equal(latestYear(rows), 2026);
  assert.deepEqual(rows.map((r) => gymOf(r.cells, 2026)), ['Gym A', 'GB SG', 'GB SG', 'Gym B']);
});

test('analysis: hours and sessions add up per gym, blank hours count as zero', () => {
  const g = byGym({
    rows: [
      { row: 1, cells: ['1/1/25', 'Gym A', '2', 'a'] },
      { row: 2, cells: ['2/1/25', 'Gym A', '', 'b'] },
      { row: 3, cells: ['3/1/25', 'Gym B', '1.5', 'c', 'd'] },
    ],
  });
  assert.deepEqual(g.map((x) => [x.name, x.hours, x.sessions, x.tipCount]), [['Gym A', 2, 2, 2], ['Gym B', 1.5, 1, 2]]);
});

test('analysis: topics count once per tip, merge spellings, ignore filler words', () => {
  const k = topics(['dlr hook and the sweep sweep', 'delariva then kalo armbar', 'armbar finish', 'okay jadi langsung gitu']);
  assert.deepEqual(k, [
    { word: 'arm bar', count: 2 },
    { word: 'de la riva', count: 2 },
    { word: 'sweep', count: 1 },
  ]);
});

test('analysis: fun facts', () => {
  const f = funFacts({
    rows: [
      { row: 1, cells: ['30/9/25', 'A', '1', 'sweep'] },
      { row: 2, cells: ['1/10/25', 'A', '2', 'sweep', 'armbar'] },
      { row: 3, cells: ['2/10/25', 'A', '1.5', 'sweep'] },
      { row: 4, cells: ['9/10/25', 'A', '1', 'x'] },
    ],
  });
  const v = Object.fromEntries(f.map((x) => [x.label, x.value]));
  assert.equal(v['Longest streak'], '3 days in a row');
  assert.equal(v['Busiest month'], 'Oct 2025, 4.5 hours');
  assert.equal(v['Longest session'], '2 hours on 01/10/25');
  assert.equal(v['Most drilled topic'], 'sweep (3 tips)');
  assert.equal(v.Total, '5.5 hours over 4 sessions');
  assert.deepEqual(funFacts({ rows: [] }), []);
});

test('draftDate keeps the date only for an unsent draft', () => {
  const now = new Date(2026, 10, 3);
  assert.equal(draftDate({ date: '2026-10-31', text: 'x' }, now), '2026-10-31');
  assert.equal(draftDate({ date: '2026-10-31', text: '' }, now), '2026-11-03');
  assert.equal(draftDate(null, now), '2026-11-03');
});

test('topic browser: counts tips by topic and aliases, most first', () => {
  const topics = [
    { topic: 'Closed guard', aliases: 'full guard' },
    { topic: 'De la riva', aliases: '' },
    { topic: 'Zebra', aliases: '' },
  ];
  const counts = topicCounts(topics, cells);
  assert.deepEqual(counts.map((c) => c.topic), ['De la riva', 'Closed guard', 'Zebra']);
  assert.deepEqual(counts.map((c) => c.count), [2, 1, 0]);
  assert.equal(topicCells(cells, topics[0])[0].text, 'closed guard posture');
});

test('aliases: spaced and joined spellings find each other', () => {
  const pairs = [['single leg', 'singleleg'], ['body lock', 'bodylock'], ['tech standup', 'technical stand up'],
    ['hip escape', 'shrimp'], ['whizzer', 'wizzer'], ['re guard', 'reguard'], ['deep half', 'deephalf']];
  for (const [a, b] of pairs) {
    assert.ok(expand(a).includes(b), `${a} -> ${b}`);
    assert.ok(expand(b).includes(a), `${b} -> ${a}`);
  }
  const c = [{ row: 1, date: '', location: '', text: 'bodylock pass' }];
  assert.equal(search(c, 'body lock').length, 1);
});

import { navItems } from '../src/nav.js';

test('nav: all five screens are one tap; Stats keeps Home lit', () => {
  const items = navItems('analysis', { run: 2, home: 1 });
  assert.deepEqual(items.map((i) => i.v), ['log', 'search', 'ask', 'run', 'home']);
  assert.equal(items.find((i) => i.v === 'home').on, true);
  assert.equal(items.find((i) => i.v === 'home').badge, 1);
  assert.equal(items.find((i) => i.v === 'run').badge, 2);
  assert.equal(navItems('log').find((i) => i.v === 'log').on, true);
});

import { pullDistance, shouldRefresh, THRESHOLD } from '../src/pull.js';

test('pull to refresh: only from the top, damped, and past the threshold', () => {
  assert.equal(pullDistance(100, 300, 40), 0);
  assert.equal(pullDistance(100, 80, 0), 0);
  assert.equal(shouldRefresh(pullDistance(100, 140, 0)), false);
  assert.equal(shouldRefresh(pullDistance(100, 100 + THRESHOLD * 2, 0)), true);
  assert.ok(pullDistance(0, 5000, 0) <= THRESHOLD * 1.5);
});
