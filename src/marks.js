// App · Marks: small facts he sets with one tap (a dance move's level). The phone only ever appends
// a row; the newest row for a target and field wins, so every earlier choice stays in the sheet.
import { uid } from './util.js';

export const markKey = (target, field) => `${target}|${field}`;

// rows: App · Marks rows (plus marks still queued on the phone). -> Map(markKey -> value)
export function latestMarks(rows) {
  const out = new Map();
  const sorted = [...(rows || [])].filter((r) => r && !r.hidden && r.target && r.field).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const r of sorted) out.set(markKey(r.target, r.field), String(r.value ?? ''));
  return out;
}

export const markRow = (target, field, value) => ({ id: uid(), target, field, value: String(value ?? ''), created_at: new Date().toISOString() });
