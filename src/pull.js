// Pull to refresh: drag down from the top of any screen, let go past the threshold, and it syncs.
export const THRESHOLD = 70;

// How far the pull counts: only when the page is at the top, damped so it feels springy, capped.
export function pullDistance(startY, currentY, scrollTop) {
  if (scrollTop > 0) return 0;
  const raw = currentY - startY;
  return raw <= 0 ? 0 : Math.min(raw * 0.5, THRESHOLD * 1.5);
}

export function shouldRefresh(distance) {
  return distance >= THRESHOLD;
}

export function attachPull(doc, onRefresh, indicator) {
  let startY = null;
  let dist = 0;
  const scrollTop = () => doc.scrollingElement?.scrollTop ?? 0;
  const show = (text) => {
    indicator.textContent = text;
    indicator.style.height = text ? `${Math.max(dist, 28)}px` : '0';
  };
  doc.addEventListener('touchstart', (e) => {
    startY = scrollTop() === 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    dist = 0;
  }, { passive: true });
  doc.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dist = pullDistance(startY, e.touches[0].clientY, scrollTop());
    show(dist ? (shouldRefresh(dist) ? 'Release to sync' : 'Pull to sync') : '');
  }, { passive: true });
  doc.addEventListener('touchend', () => {
    const go = startY != null && shouldRefresh(dist);
    startY = null;
    dist = 0;
    show('');
    if (go) onRefresh();
  }, { passive: true });
}
