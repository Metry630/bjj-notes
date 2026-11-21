// Dance: the 0.12 cues (App · Dance) still save and still show, now as tips of the Dance tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { navItems } from '../src/nav.js';
import { legacyDanceTips } from '../src/journal.js';
import { loadCodeGs } from './fake-gas.mjs';

test('Dance has its own tab now', () => {
  assert.equal(navItems('dance').find((i) => i.v === 'dance').on, true);
  assert.equal(navItems('dance').find((i) => i.v === 'lift').on, false);
});

test('Code.gs: phone can still add a 0.12 cue, empty or long ones are refused', () => {
  const env = loadCodeGs();
  env.api.setup();
  const phone = env.props.get('PHONE_TOKEN');
  const add = (row) => env.post({ action: 'add', tab: 'App · Dance', rows: [row], token: phone });
  assert.equal(add({ move: 'Turn', cue: 'x' }).ok, true);
  assert.equal(add({ move: '', cue: 'x' }).error, 'bad_move');
  assert.equal(add({ move: 'Turn', cue: 'x'.repeat(301) }).error, 'bad_cue');
  const rows = env.post({ action: 'get', tab: 'App · Dance', token: phone }).rows;
  assert.deepEqual(legacyDanceTips(rows).map((t) => [t.topic, t.text]), [['Turn', 'x']]);
});
