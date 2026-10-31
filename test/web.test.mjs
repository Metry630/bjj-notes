import test from 'node:test';
import assert from 'node:assert/strict';
import { search, toCells, expand, queryTerms, highlightTerms } from '../src/search.js';
import { todayISO, sheetDateToISO, isoToSheetDate, nextRunLabel, hoursSince } from '../src/dates.js';
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
