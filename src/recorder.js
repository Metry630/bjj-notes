// Voice notes recorded in the app. The audio goes to the sheet as base64 slices and the routine
// transcribes it with Whisper, so recording costs nothing per use.

export const SLICE = 30000; // base64 chars per App · Audio row (a cell holds 50k)
const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function pickMime(isSupported = (t) => globalThis.MediaRecorder?.isTypeSupported?.(t)) {
  return TYPES.find((t) => isSupported(t)) || '';
}

export function slices(b64, size = SLICE) {
  const out = [];
  for (let i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
  return out;
}

// App · Audio rows for one recording, grouped 10 per request so each upload stays small.
export function audioBatches(inboxId, mime, b64, perBatch = 10) {
  const parts = slices(b64);
  const type = String(mime).replace(/\s+/g, '') || 'audio/mp4';
  const rows = parts.map((data, i) => ({ id: `${inboxId}-${i + 1}`, inbox_id: inboxId, seq: i + 1, total: parts.length, mime: type, data }));
  const out = [];
  for (let i = 0; i < rows.length; i += perBatch) out.push(rows.slice(i, i + perBatch));
  return out;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// 32 kbps is plenty for speech and keeps a 5-minute note around 1.2 MB.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const wanted = pickMime();
  const rec = new MediaRecorder(stream, { ...(wanted ? { mimeType: wanted } : {}), audioBitsPerSecond: 32000 });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.start(1000);
  const started = Date.now();
  // Time spent recording, not counting pauses.
  let pausedAt = 0;
  let pausedMs = 0;
  const elapsed = () => Math.max(0, Math.round(((pausedAt || Date.now()) - started - pausedMs) / 1000));
  // Keep the screen on while recording: a locked phone is the usual reason the mic gets cut.
  let lock = null;
  try {
    navigator.wakeLock?.request?.('screen').then((l) => (lock = l), () => {});
  } catch {
    // not supported
  }
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    try {
      lock?.release?.();
    } catch {
      // already released
    }
  };
  return {
    started,
    elapsed,
    get paused() {
      return !!pausedAt;
    },
    pause: () => {
      if (pausedAt || rec.state !== 'recording') return false;
      try {
        rec.pause();
      } catch {
        return false;
      }
      pausedAt = Date.now();
      return true;
    },
    resume: () => {
      if (!pausedAt) return false;
      try {
        rec.resume();
      } catch {
        return false;
      }
      pausedMs += Date.now() - pausedAt;
      pausedAt = 0;
      return true;
    },
    // Resolves once with what was recorded, even if the phone already ended the recording (screen
    // lock, mic taken by a call) so rec.stop() throws or onstop never fires.
    stop: () =>
      new Promise((resolve, reject) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          release();
          const mime = rec.mimeType || wanted || 'audio/mp4';
          if (!chunks.length) return reject(new Error('empty'));
          resolve({ blob: new Blob(chunks, { type: mime }), mime, seconds: elapsed() });
        };
        if (rec.state === 'inactive') return finish();
        rec.onstop = finish;
        try {
          rec.stop();
        } catch {
          finish();
        }
        setTimeout(finish, 4000);
      }),
    cancel: () => {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
      release();
    },
  };
}

// A recording saved with the Test switch on carries this as its text (the phone can only set text,
// not status). The routine transcribes it, keeps the transcript in agent_note, and never files it.
export const TEST_MARK = '[test voice note]';
