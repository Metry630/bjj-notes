import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByMove, reminder, validCue } from '../src/dance.js';
import { navItems } from '../src/nav.js';
import { loadCodeGs } from './fake-gas.mjs';

const rows = [
  { id: 'a', created_at: '2026-01-01T01:00:00Z', move: 'Turn', cue: 'cue one' },
  { id: 'b', created_at: '2026-01-01T01:05:00Z', move: 'basic step', cue: 'cue two' },
  { id: 'c', created_at: '2026-01-02T01:00:00Z', move: 'turn ', cue: 'cue three' },
  { id: 'd', created_at: '2026-01-03T01:00:00Z', move: 'Dip', cue: 'gone', status: 'cancelled' },
];

test('moves group case-insensitively, A to Z, skipping cancelled', () => {
  const g = groupByMove(rows);
  assert.deepEqual(g.map((x) => x.move), ['basic step', 'Turn']);
  assert.deepEqual(g[1].items.map((r) => r.id), ['a', 'c']);
});

test('reminder picks a move, avoids the last one, null when empty', () => {
  assert.equal(reminder([], 0.5), null);
  assert.equal(reminder(rows, 0.99).move, 'Turn');
  assert.equal(reminder(rows, 0, 'basic step').move, 'Turn');
  assert.equal(reminder([rows[0]], 0, 'Turn').move, 'Turn');
});

test('cue checks', () => {
  assert.equal(validCue({ move: 'Turn', cue: 'x' }), '');
  assert.notEqual(validCue({ move: ' ', cue: 'x' }), '');
  assert.notEqual(validCue({ move: 'Turn', cue: '' }), '');
  assert.notEqual(validCue({ move: 'Turn', cue: 'x'.repeat(301) }), '');
});

test('Lift stays lit on the Dance screen', () => {
  assert.equal(navItems('dance').find((i) => i.v === 'lift').on, true);
});

test('Code.gs: phone can add a cue, empty or long ones are refused', () => {
  const env = loadCodeGs();
  env.api.setup();
  const phone = env.props.get('PHONE_TOKEN');
  const add = (row) => env.post({ action: 'add', tab: 'App · Dance', rows: [row], token: phone });
  assert.equal(add({ move: 'Turn', cue: 'x' }).ok, true);
  assert.equal(add({ move: '', cue: 'x' }).error, 'bad_move');
  assert.equal(add({ move: 'Turn', cue: 'x'.repeat(301) }).error, 'bad_cue');
});
