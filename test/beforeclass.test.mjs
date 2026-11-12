import test from 'node:test';
import assert from 'node:assert/strict';
import { lastSessions, reviewTopic } from '../src/beforeclass.js';
import { navItems } from '../src/nav.js';

const cells = [
  { row: 5, col: 4, date: '1/1/25', location: 'Gym A', text: 'closed guard posture' },
  { row: 6, col: 4, date: '2/1/25', location: 'Gym A', text: 'knee shield recover' },
  { row: 7, col: 4, date: '10/1/25', location: 'Gym B', text: 'mount escape basics' },
  { row: 8, col: 4, date: '11/1/25', location: 'Gym B', text: 'armbar from guard' },
  { row: 8, col: 5, date: '11/1/25', location: 'Gym B', text: 'second tip' },
  { row: 9, col: 4, date: '12/1/25', location: 'Gym B', text: 'mount again' },
];
const topics = [
  { topic: 'Closed guard', aliases: '', summary: 'sum a' },
  { topic: 'Knee shield', aliases: '', summary: 'sum b' },
  { topic: 'Mount', aliases: '' },
  { topic: 'Unused', aliases: '' },
];

test('lastSessions: newest first, tips grouped by date', () => {
  const s = lastSessions(cells, 3);
  assert.deepEqual(s.map((x) => x.date), ['12/1/25', '11/1/25', '10/1/25']);
  assert.equal(s[1].tips.length, 2);
});

test('reviewTopic: skips topics in recent sessions and topics with no tips', () => {
  const s = lastSessions(cells, 3);
  const r = reviewTopic(cells, topics, s, '2025-01-20');
  assert.ok(['Closed guard', 'Knee shield'].includes(r.topic));
  assert.notEqual(r.topic, 'Mount');
  assert.deepEqual(r, reviewTopic(cells, topics, s, '2025-01-20'));
});

test('reviewTopic: null when nothing qualifies', () => {
  assert.equal(reviewTopic([], topics, [], '2025-01-20'), null);
});

test('Home stays lit on Before class', () => {
  assert.ok(navItems('before').find((i) => i.v === 'home').on);
});
