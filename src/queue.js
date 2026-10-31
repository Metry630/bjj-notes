// Notes saved with no signal wait here (one entry per note, keyed by the note's own id) and are
// sent later. The sheet ignores an id it has already seen, so a retry never files a note twice.

export function enqueue(queue, entry) {
  const id = entry.rows?.[0]?.id;
  const rest = queue.filter((q) => q.rows?.[0]?.id !== id);
  return [...rest, entry];
}

// Sends entries oldest first. Stops at the first failure so order is kept and nothing is lost.
// Returns the entries still waiting and how many went out.
export async function flush(queue, send) {
  const left = [...queue];
  let sent = 0;
  while (left.length) {
    try {
      await send(left[0]);
    } catch (e) {
      return { left, sent, error: e };
    }
    left.shift();
    sent++;
  }
  return { left, sent, error: null };
}
