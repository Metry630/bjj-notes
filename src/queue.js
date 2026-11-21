// Saves that have not reached the sheet yet (one entry per item, keyed by the item's own id). The
// sheet ignores an id it has already seen, so a retry never files anything twice.

export function enqueue(queue, entry) {
  const id = entry.rows?.[0]?.id;
  const rest = queue.filter((q) => q.rows?.[0]?.id !== id);
  return [...rest, entry];
}

// Network trouble (no signal, a timeout, Google's error page, a busy server) stops a flush so the
// order is kept. Anything else is a refusal a retry can't fix by itself (a stale script, a bad
// value): that entry stays, marked with the reason, and the others keep going. Nothing is dropped.
const TRANSIENT = /^(offline|timeout|not_json|api_error|http_(408|429|5\d\d))$/;
export const permanent = (e) => !TRANSIENT.test(String(e?.message));

// Sends entries oldest first. A network failure stops there (order kept, nothing lost); a refusal
// marks that entry and moves on. Returns the entries still waiting and how many went out.
export async function flush(queue, send) {
  const left = [];
  let sent = 0;
  for (let i = 0; i < queue.length; i++) {
    try {
      await send(queue[i]);
      sent++;
    } catch (e) {
      if (permanent(e)) {
        left.push({ ...queue[i], error: String(e.message) });
        continue;
      }
      return { left: [...left, ...queue.slice(i)], sent, error: e };
    }
  }
  return { left, sent, error: null };
}
