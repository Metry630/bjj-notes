import test from 'node:test';
import assert from 'node:assert/strict';
import { monthStats } from '../src/analysis.js';

const notes = { rows: [
  { row: 5, cells: ['28/12/25', 'Gym', 1.5] },
  { row: 6, cells: ['2/1/26', 'Gym', 1] },
  { row: 7, cells: ['9/1/26', 'Gym', '2'] },
  { row: 8, cells: ['9/2/26', 'Gym', 1] },
] };

test('this month and last month', () => {
  const [a, b] = monthStats(notes, '2026-01-15');
  assert.deepEqual([a.label, a.hours, a.sessions], ['Jan', 3, 2]);
  assert.deepEqual([b.label, b.hours, b.sessions], ['Dec', 1.5, 1]);
});

test('empty month and missing notes', () => {
  assert.equal(monthStats(notes, '2026-03-01')[0].sessions, 0);
  assert.equal(monthStats(null, '2026-03-01')[1].hours, 0);
});
