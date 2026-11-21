// Voice notes that can't be lost.
//
// 1. While he talks, every second of audio is written to the phone's database (idb.js) as it
//    arrives. A phone call, a locked screen or the app being closed loses nothing already said.
// 2. Whole slices go up to App · Audio in batches while he is still talking, so Stop only has the
//    last minute or so left to send.
// 3. After Stop the rest goes up, then the App · Inbox item. The item only exists once its audio is
//    complete, so the routine never sees half a recording.
// 4. The phone keeps the audio until the transcript is back (or 7 days), and can play or save it.
// 5. A recording the app was closed in the middle of is found at the next start and finished.
//
// Uploads resume where they stopped (each slice has a fixed id; the sheet ignores a repeat).
import { idb, available as durableStorage } from './idb.js';
import { startRecording, TEST_MARK } from './recorder.js';
import { uid } from './util.js';
import { permanent } from './queue.js';

export const SLICE_BYTES = 30000; // -> 40,000 base64 characters, the script's limit for one cell
export const BATCH = 8; // slices per request: about 240 KB, a minute of speech
export const UNKNOWN_TOTAL = 500; // slices sent before Stop: the routine takes the smallest total
export const KEEP_DAYS = 7;
const AUDIO_TAB = 'App · Audio';
const INBOX_TAB = 'App · Inbox';

// ---- pure parts (tested) ----

export const sliceCount = (bytes) => Math.ceil(bytes / SLICE_BYTES);

// The slices that can go now. While recording: whole slices only, a full batch at a time, and the
// last whole slice is held back so a slice carrying the real total always goes after Stop.
export function nextBatch({ bytes, sent, stopped }, batch = BATCH) {
  const ready = stopped ? sliceCount(bytes) : Math.max(0, Math.floor(bytes / SLICE_BYTES) - 1);
  if (ready <= sent) return null;
  if (!stopped && ready - sent < batch) return null;
  const to = Math.min(ready, sent + batch);
  return { from: sent, to, total: stopped ? sliceCount(bytes) : UNKNOWN_TOTAL };
}

// Uint8Array -> base64, in pieces (one String.fromCharCode over 30 KB can overflow the stack).
export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function joinChunks(chunks) {
  const parts = [...chunks].sort((a, b) => a.seq - b.seq).map((c) => new Uint8Array(c.data));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// App · Audio rows for slices [from, to) of one recording.
export function audioRows(rid, mime, bytes, { from, to, total }) {
  const type = String(mime || 'audio/mp4').replace(/\s+/g, '');
  const rows = [];
  for (let i = from; i < to; i++) {
    rows.push({ id: `${rid}-${i + 1}`, inbox_id: rid, seq: i + 1, total, mime: type, data: toBase64(bytes.subarray(i * SLICE_BYTES, (i + 1) * SLICE_BYTES)) });
  }
  return rows;
}

export function inboxRow(r) {
  const m = r.meta || {};
  return {
    id: r.id,
    session_date: m.session_date,
    location: m.location || '',
    hours: m.hours ?? '',
    text: m.test ? TEST_MARK : '',
    method: 'recording',
    activity: m.activity && m.activity !== 'bjj' ? m.activity : '',
    tags: (m.tags || []).join(','),
  };
}

// Where a recording stands, for the screen.
export function stage(r) {
  if (r.state === 'recording') return 'recording';
  if (r.committed) return 'saved';
  if (r.blocked) return 'blocked';
  if (r.hold) return 'held';
  if (r.uploading) return 'uploading';
  return 'waiting';
}

// Local copies no longer needed: transcribed (or a filed test), or older than KEEP_DAYS.
export function expired(recordings, inbox, now = Date.now()) {
  return recordings
    .filter((r) => r.committed)
    .filter((r) => {
      const item = (inbox || []).find((i) => String(i.id) === r.id);
      const done = item && (item.status === 'processed' || item.status === 'test');
      return done || now - Date.parse(r.committed_at || r.created_at) > KEEP_DAYS * 864e5;
    })
    .map((r) => r.id);
}

// ---- the phone side ----

let recordings = []; // mirror of idb 'recordings'
const memory = new Map(); // rid -> chunk list, for recordings in this session (and without durable storage)
const listeners = new Set();
let api = null;
let onCommit = null;
let pumping = null;

export const list = () => recordings;
export const isDurable = durableStorage;
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => {
  try {
    fn();
  } catch {
    // a screen that went away
  }
});

// canCommit(r): false holds the inbox item back (a dance note while the sheet script is too old to
// store its activity). The audio still goes up; nothing is lost while it waits.
let canCommit = () => true;
export function configure(opts) {
  api = opts.api;
  onCommit = opts.onCommit || null;
  canCommit = opts.canCommit || (() => true);
}

const save = (r) => {
  const { uploading, ...rest } = r; // uploading is this session's state only
  return idb.put('recordings', rest).catch(() => {});
};

// At start: load what is on the phone. A recording the app was closed in counts as stopped there.
export async function load() {
  try {
    recordings = await idb.all('recordings');
  } catch {
    recordings = [];
  }
  for (const r of recordings) {
    if (r.state === 'recording') {
      r.state = 'stopped';
      r.recovered = true;
      r.stopped_at = new Date().toISOString();
      await save(r);
    }
  }
  idb.persist();
  changed();
  return recordings;
}

async function chunksOf(r) {
  if (memory.has(r.id)) return memory.get(r.id);
  try {
    const rows = await idb.chunks(r.id);
    memory.set(r.id, rows);
    return rows;
  } catch {
    return [];
  }
}

export async function bytesOf(r) {
  return joinChunks(await chunksOf(r));
}

export async function blobOf(r) {
  return new Blob([await bytesOf(r)], { type: String(r.mime || 'audio/mp4').split(';')[0] });
}

export async function discard(id) {
  recordings = recordings.filter((r) => r.id !== id);
  memory.delete(id);
  await idb.del('recordings', id).catch(() => {});
  await idb.dropChunks(id).catch(() => {});
  changed();
}

// Start recording. meta: { activity, session_date, location, hours, tags, test }.
export async function record(meta) {
  const r = { id: uid(), created_at: new Date().toISOString(), state: 'recording', meta: { ...meta }, mime: '', bytes: 0, chunks: 0, sent: 0, seconds: 0, committed: false };
  const mine = [];
  memory.set(r.id, mine);
  let chain = Promise.resolve();
  const rec = await startRecording({
    onChunk: (blob) => {
      const seq = r.chunks++;
      chain = chain
        .then(async () => {
          const data = await blob.arrayBuffer();
          const row = { rid: r.id, seq, data };
          mine.push(row);
          r.bytes += data.byteLength;
          await idb.put('chunks', row).catch(() => {});
          await save(r);
          if (r.state === 'recording') kick();
        })
        .catch(() => {});
    },
  });
  r.mime = rec.mime;
  recordings.push(r);
  chain = chain.then(() => save(r));
  changed();
  return {
    id: r.id,
    elapsed: rec.elapsed,
    get paused() {
      return rec.paused;
    },
    pause: rec.pause,
    resume: rec.resume,
    // Resolves { seconds, bytes } once everything is on the phone; rejects 'empty' if nothing was.
    async stop(more = {}) {
      let seconds = rec.elapsed();
      try {
        seconds = (await rec.stop()).seconds;
      } catch {
        // the phone ended it already: what is in the database is what there is
      }
      await chain;
      if (!r.bytes) {
        await discard(r.id);
        throw new Error('empty');
      }
      Object.assign(r.meta, more);
      r.seconds = seconds;
      r.state = 'stopped';
      r.stopped_at = new Date().toISOString();
      await save(r);
      changed();
      kick();
      return { seconds, bytes: r.bytes };
    },
    async cancel() {
      rec.cancel();
      await chain;
      await discard(r.id);
    },
  };
}

// Send whatever can go now. One pump at a time, and a kick during a pump runs it once more, so a
// Stop that lands mid-upload is never left waiting. Safe to call often.
let again = false;
export function kick() {
  if (pumping) {
    again = true;
    return pumping;
  }
  pumping = pump().finally(() => {
    pumping = null;
    if (again) {
      again = false;
      kick();
    }
  });
  return pumping;
}

// After a good sync: give refused recordings another go (a script paste may have fixed it).
export function unblock() {
  let any = false;
  for (const r of recordings) {
    if (r.blocked) {
      r.blocked = '';
      any = true;
    }
  }
  if (any) kick();
}

// Clears a refusal (after a script paste, say) and tries again.
export function retry(id) {
  const r = recordings.find((x) => x.id === id);
  if (r) {
    r.blocked = '';
    r.error = '';
    save(r);
  }
  return kick();
}

async function pump() {
  if (!api) return;
  for (let guard = 0; guard < 500; guard++) {
    const r = [...recordings].filter((x) => !x.committed && !x.blocked).sort((a, b) => a.created_at.localeCompare(b.created_at)).find((x) => {
      if (nextBatch({ bytes: x.bytes, sent: x.sent, stopped: x.state !== 'recording' })) return true;
      x.hold = x.state !== 'recording' && x.sent >= sliceCount(x.bytes) && !canCommit(x) ? 'old_script' : '';
      return x.state !== 'recording' && x.sent >= sliceCount(x.bytes) && !x.hold;
    });
    if (!r) return;
    const batch = nextBatch({ bytes: r.bytes, sent: r.sent, stopped: r.state !== 'recording' });
    r.uploading = true;
    changed();
    try {
      if (batch) {
        const rows = audioRows(r.id, r.mime, await bytesOf(r), batch);
        await api.call('add', { tab: AUDIO_TAB, rows });
        r.sent = batch.to;
      } else {
        await api.call('add', { tab: INBOX_TAB, rows: [inboxRow(r)] });
        r.committed = true;
        r.committed_at = new Date().toISOString();
      }
      r.error = '';
      r.uploading = false;
      await save(r);
      changed();
      if (r.committed) onCommit?.(r);
    } catch (e) {
      r.uploading = false;
      r.error = String(e.message || e);
      if (permanent(e)) r.blocked = r.error;
      await save(r);
      changed();
      if (!r.blocked) return; // no signal: the next kick (online, app opened, timer) carries on
    }
  }
}

// Drops local copies the transcript has replaced.
export async function tidy(inbox) {
  for (const id of expired(recordings, inbox)) await discard(id);
}

// Hands the audio file to the share sheet (Save to Files, AirDrop), or downloads it.
export async function shareAudio(r) {
  const blob = await blobOf(r);
  const ext = /webm/.test(r.mime) ? 'webm' : /ogg/.test(r.mime) ? 'ogg' : 'm4a';
  const name = `voice-note-${r.meta?.session_date || 'today'}-${r.id.slice(0, 6)}.${ext}`;
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
