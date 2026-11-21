// Small shared helpers. No DOM, so node tests can import them.

export const newest = (rows, key) => [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
export const oldest = (rows, key) => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const plural = (n, word, many) => `${n} ${n === 1 ? word : many || `${word}s`}`;
export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// A row that still counts: not hidden by the routine, not removed by him.
export const live = (r) => !!r && !r.hidden && r.status !== 'cancelled';

// Notes saved before activities existed have none: they were all BJJ.
export const isBjj = (activity) => !activity || activity === 'bjj';
export const activityOf = (r) => (isBjj(r?.activity) ? 'bjj' : r.activity);

export const tagList = (tags) => String(tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

// 09:00-18:00 Singapore is his quiet time: nothing starts a run by itself then.
export const quietNow = (now = new Date()) => {
  const hr = new Date(now.getTime() + 8 * 3600e3).getUTCHours();
  return hr >= 9 && hr < 18;
};

export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
