// Voice notes that can't be lost: chunks kept as they arrive, slices sent while recording, the
// inbox item last, and the routine's assembler gets the exact bytes back. Synthetic audio only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBatch, toBase64, joinChunks, audioRows, inboxRow, expired, sliceCount, SLICE_BYTES, BATCH, UNKNOWN_TOTAL } from '../src/voice.js';
import { assembleAudio } from '../tools/sheet.mjs';
import { TEST_MARK } from '../src/recorder.js';

const bytesOf = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 256);

test('while recording, only full batches of whole slices go, and the last whole slice waits for Stop', () => {
  const KB = 1000;
  assert.equal(nextBatch({ bytes: 200 * KB, sent: 0, stopped: false }), null); // 6 whole slices, not a batch yet
  assert.deepEqual(nextBatch({ bytes: 280 * KB, sent: 0, stopped: false }), { from: 0, to: 8, total: UNKNOWN_TOTAL });
  assert.equal(nextBatch({ bytes: 280 * KB, sent: 8, stopped: false }), null);
  // After Stop everything goes, carrying the real total.
  assert.deepEqual(nextBatch({ bytes: 280 * KB, sent: 8, stopped: true }), { from: 8, to: 10, total: 10 });
  assert.equal(nextBatch({ bytes: 280 * KB, sent: 10, stopped: true }), null);
  // Exactly on a slice boundary: the held-back slice still goes after Stop with the total.
  const exact = SLICE_BYTES * (BATCH + 1);
  assert.deepEqual(nextBatch({ bytes: exact, sent: 0, stopped: false }), { from: 0, to: 8, total: UNKNOWN_TOTAL });
  assert.deepEqual(nextBatch({ bytes: exact, sent: 8, stopped: true }), { from: 8, to: 9, total: 9 });
  assert.equal(sliceCount(1), 1);
});

test('base64 in pieces matches the whole, and slices join back exactly', () => {
  const b = bytesOf(100003);
  assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
  const joined = joinChunks([{ seq: 1, data: b.slice(50000).buffer }, { seq: 0, data: b.slice(0, 50000).buffer }]);
  assert.deepEqual(Buffer.from(joined), Buffer.from(b));
});

test('slices sent before and after Stop assemble into the original recording', () => {
  const audio = bytesOf(SLICE_BYTES * 9 + 1234);
  const early = audioRows('r1', 'audio/mp4; codecs=mp4a.40.2', audio, { from: 0, to: 8, total: UNKNOWN_TOTAL });
  const late = audioRows('r1', 'audio/mp4', audio, { from: 8, to: 10, total: 10 });
  assert.equal(early[0].mime, 'audio/mp4;codecs=mp4a.40.2');
  assert.ok(early.every((r) => r.data.length <= 40000));
  assert.deepEqual(assembleAudio([...late, ...early].reverse(), 'r1').bytes, Buffer.from(audio));
  // Before the last slices arrive the routine sees an unfinished upload, never half a note.
  assert.throws(() => assembleAudio(early, 'r1'), /incomplete/);
});

test('the inbox item carries the activity, tags and the test marker', () => {
  const r = { id: 'r1', meta: { activity: 'dance', session_date: '2026-11-23', hours: 3, tags: ['salsa', 'class'], test: false } };
  assert.deepEqual(inboxRow(r), { id: 'r1', session_date: '2026-11-23', location: '', hours: 3, text: '', method: 'recording', activity: 'dance', tags: 'salsa,class' });
  assert.equal(inboxRow({ ...r, meta: { ...r.meta, activity: 'bjj', test: true } }).text, TEST_MARK);
  assert.equal(inboxRow({ ...r, meta: { ...r.meta, activity: 'bjj' } }).activity, '');
});

test('local copies go once transcribed, or after a week; never before the item is saved', () => {
  const now = Date.parse('2026-11-30T00:00:00Z');
  const recs = [
    { id: 'a', committed: true, committed_at: '2026-11-29T00:00:00Z' },
    { id: 'b', committed: true, committed_at: '2026-11-29T00:00:00Z' },
    { id: 'c', committed: true, committed_at: '2026-11-20T00:00:00Z' },
    { id: 'd', committed: false, created_at: '2026-11-01T00:00:00Z' },
  ];
  const inbox = [{ id: 'a', status: 'processed', text: 'transcript' }, { id: 'b', status: 'new' }];
  assert.deepEqual(expired(recs, inbox, now), ['a', 'c']);
});

// ---- the whole path with a fake microphone and a fake sheet ----

function installRecorder(chunkSizes) {
  class FakeRecorder {
    constructor() {
      this.state = 'inactive';
      this.mimeType = 'audio/mp4';
    }
    start() {
      this.state = 'recording';
      let i = 0;
      this.timer = setInterval(() => {
        if (i >= chunkSizes.length - 1) return clearInterval(this.timer);
        this.ondataavailable?.({ data: new Blob([bytesOf(chunkSizes[i], i)]) });
        i++;
      }, 1);
      this.last = () => new Blob([bytesOf(chunkSizes[chunkSizes.length - 1], chunkSizes.length - 1)]);
    }
    pause() {}
    resume() {}
    stop() {
      clearInterval(this.timer);
      this.state = 'inactive';
      setTimeout(() => {
        this.ondataavailable?.({ data: this.last() });
        this.onstop?.();
      }, 0);
    }
  }
  FakeRecorder.isTypeSupported = () => true;
  globalThis.MediaRecorder = FakeRecorder;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
  });
}

test('record, upload while talking, stop, then the inbox item: the routine gets every byte', async () => {
  const sizes = Array.from({ length: 31 }, () => 10000); // 30 chunks while talking + 1 at Stop
  installRecorder(sizes);
  const voice = await import('../src/voice.js');
  const calls = [];
  let failNext = false;
  voice.configure({
    api: {
      call: async (action, payload) => {
        if (failNext) {
          failNext = false;
          throw new Error('offline');
        }
        calls.push(payload);
        return { ok: true };
      },
    },
  });
  const session = await voice.record({ activity: 'philosophy', session_date: '2026-11-29', tags: ['meetup'] });
  await new Promise((res) => setTimeout(res, 120)); // he talks; batches go up meanwhile
  await voice.kick();
  const during = calls.filter((c) => c.tab === 'App · Audio').flatMap((c) => c.rows);
  assert.ok(during.length >= BATCH, `sent ${during.length} slices while recording`);
  assert.ok(during.every((r) => r.total === UNKNOWN_TOTAL));
  assert.equal(calls.some((c) => c.tab === 'App · Inbox'), false);

  failNext = true; // the signal drops right at Stop
  const out = await session.stop({ hours: '' });
  assert.equal(out.bytes, 310000);
  await voice.kick();
  assert.equal(voice.list().find((r) => r.id === session.id).committed, false);
  await voice.kick(); // signal is back
  const rec = voice.list().find((r) => r.id === session.id);
  assert.equal(rec.committed, true);
  const audioRowsSent = calls.filter((c) => c.tab === 'App · Audio').flatMap((c) => c.rows);
  const inboxCall = calls.findIndex((c) => c.tab === 'App · Inbox');
  assert.equal(inboxCall, calls.length - 1); // the item goes last
  assert.equal(calls[inboxCall].rows[0].activity, 'philosophy');
  const original = Buffer.concat(sizes.map((n, i) => Buffer.from(bytesOf(n, i))));
  assert.deepEqual(assembleAudio(audioRowsSent, session.id).bytes, original);
});
