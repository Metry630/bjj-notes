// Date helpers. The sheet writes dates d/m/yy; the API takes YYYY-MM-DD.

const pad = (n) => String(n).padStart(2, '0');

// Today on this phone, as YYYY-MM-DD.
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// A saved draft keeps its date only while it holds unsent text; otherwise the date is today.
export function draftDate(draft, now = new Date()) {
  return draft && draft.text && draft.date ? draft.date : todayISO(now);
}

// "27/10/24" -> "2024-10-27"; anything else -> "".
export function sheetDateToISO(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(s).trim());
  if (!m) return '';
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${pad(m[2])}-${pad(m[1])}`;
}

// "2026-10-31" -> "31/10/26", the way his sheet shows dates.
export function isoToSheetDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1].slice(2)}` : '';
}

// Runs fire at 04:05 and 18:05 Singapore time (UTC+8, no DST).
export function nextRunLabel(now = new Date()) {
  const sgt = new Date(now.getTime() + 8 * 3600e3);
  const mins = sgt.getUTCHours() * 60 + sgt.getUTCMinutes();
  return mins >= 4 * 60 + 5 && mins < 18 * 60 + 5 ? '18:05' : '04:05';
}

export function hoursSince(iso, now = new Date()) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now.getTime() - t) / 3600e3 : Infinity;
}

// "2026-10-31T13:20:00.000Z" -> "Sat 31 Oct, 21:20" in the phone's time zone.
export function shortTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
