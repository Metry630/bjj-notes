// Small hand-built SVG charts (no library: they take the app's colours and dark mode, and stay a few
// KB). One series per chart, so no legend: the label above names it. Thin marks, hairline grid,
// the latest value labelled, tap or hover for any point, and the numbers in a table underneath.
import { h, s, fold } from './ui.js';
import { dayLabel } from './training.js';

// Round tick values covering [lo, hi]: steps of 1, 2, 2.5 or 5 times a power of ten.
export function niceTicks(lo, hi, count = 3) {
  if (!(hi > lo)) {
    const pad = Math.abs(hi) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < hi) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6);
  return ticks;
}

export const scale = (d0, d1, r0, r1) => (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

const W = 340;
const H = 168;
const PAD = { l: 34, r: 40, t: 14, b: 24 };
const fmt = (v) => String(Math.round(v * 10) / 10);
const dayNum = (iso) => Date.parse(`${iso}T00:00:00Z`) / 864e5;

// The value table under a chart: the readout that never needs a tap.
function numbers(key, rows) {
  return fold(`chart:${key}`, 'Numbers', h('table', { class: 'numbers' }, h('tbody', null, rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', { class: 'num' }, b))))));
}

// points: [{ x: 'YYYY-MM-DD', y }], oldest first.
export function lineChart(points, { unit = '', label = 'Chart', key = label } = {}) {
  const xs = points.map((p) => dayNum(p.x));
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const x = scale(Math.min(...xs), Math.max(...xs), PAD.l, W - PAD.r);
  const y = scale(ticks[0], ticks[ticks.length - 1], H - PAD.b, PAD.t);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${x(xs[xs.length - 1]).toFixed(1)},${H - PAD.b}L${x(xs[0]).toFixed(1)},${H - PAD.b}Z`;
  const last = points[points.length - 1];
  const tip = h('div', { class: 'chtip', hidden: true });
  const cross = s('line', { class: 'ch-cross', x1: 0, x2: 0, y1: PAD.t, y2: H - PAD.b, visibility: 'hidden' });
  const dot = s('circle', { class: 'ch-dot', r: 5, cx: 0, cy: 0, visibility: 'hidden' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${label}: ${fmt(points[0].y)} to ${fmt(last.y)} ${unit} from ${dayLabel(points[0].x)} to ${dayLabel(last.x)}` },
    ticks.map((t) => [s('line', { class: 'ch-grid', x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }), s('text', { class: 'ch-axis', x: PAD.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))]),
    s('path', { class: 'ch-area', d: area }),
    s('path', { class: 'ch-line', d: path }),
    s('circle', { class: 'ch-end', r: 4, cx: x(xs[xs.length - 1]), cy: y(last.y) }),
    s('text', { class: 'ch-label', x: x(xs[xs.length - 1]) + 8, y: y(last.y) + 4 }, fmt(last.y)),
    s('text', { class: 'ch-axis', x: PAD.l, y: H - 6 }, dayLabel(points[0].x)),
    s('text', { class: 'ch-axis', x: W - PAD.r, y: H - 6, 'text-anchor': 'end' }, dayLabel(last.x)),
    cross,
    dot);
  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(x(v) - vx) < Math.abs(x(xs[best]) - vx)) best = i;
    });
    const px = x(xs[best]);
    const py = y(points[best].y);
    for (const [k, v] of [['x1', px], ['x2', px]]) cross.setAttribute(k, v);
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    dot.setAttribute('visibility', 'visible');
    tip.replaceChildren(h('strong', { class: 'num' }, `${fmt(points[best].y)} ${unit}`), h('span', null, dayLabel(points[best].x)));
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max((px / W) * 100, 12), 88)}%`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  return h('figure', { class: 'chartbox' }, h('div', { class: 'chartwrap' }, svg, tip), numbers(key, [...points].reverse().map((p) => [dayLabel(p.x), `${fmt(p.y)} ${unit}`])));
}

// bars: [{ label, value, sub }], oldest first. The latest bar carries its value.
export function barChart(bars, { unit = '', label = 'Chart', key = label } = {}) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  const ticks = niceTicks(0, max || 1);
  const y = scale(0, ticks[ticks.length - 1], H - PAD.b, PAD.t);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.min(24, slot - 2);
  const tip = h('div', { class: 'chtip', hidden: true });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${label}, latest ${fmt(bars[bars.length - 1]?.value || 0)} ${unit}` },
    ticks.map((t) => [s('line', { class: 'ch-grid', x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }), s('text', { class: 'ch-axis', x: PAD.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))]),
    bars.map((b, i) => {
      const cx = PAD.l + slot * i + slot / 2;
      const top = y(b.value);
      const base = H - PAD.b;
      const r = Math.min(4, (base - top) / 2, bw / 2);
      const d = b.value > 0
        ? `M${cx - bw / 2},${base}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${base}Z`
        : '';
      const hit = s('rect', { class: 'ch-hit', x: cx - slot / 2, y: PAD.t, width: slot, height: base - PAD.t, tabindex: '0', 'aria-label': `${b.label}: ${fmt(b.value)} ${unit}` });
      const showTip = () => {
        tip.replaceChildren(h('strong', { class: 'num' }, `${fmt(b.value)} ${unit}`), h('span', null, b.sub || b.label));
        tip.hidden = false;
        tip.style.left = `${Math.min(Math.max((cx / W) * 100, 12), 88)}%`;
      };
      hit.addEventListener('pointerdown', showTip);
      hit.addEventListener('pointerenter', showTip);
      hit.addEventListener('focus', showTip);
      return [
        d ? s('path', { class: i === bars.length - 1 ? 'ch-bar now' : 'ch-bar', d }) : null,
        i === bars.length - 1 && b.value > 0 ? s('text', { class: 'ch-label', x: cx, y: top - 6, 'text-anchor': 'middle' }, fmt(b.value)) : null,
        i % Math.ceil(bars.length / 4) === 0 || i === bars.length - 1 ? s('text', { class: 'ch-axis', x: cx, y: H - 6, 'text-anchor': 'middle' }, b.label) : null,
        hit,
      ];
    }));
  svg.addEventListener('pointerleave', () => (tip.hidden = true));
  return h('figure', { class: 'chartbox' }, h('div', { class: 'chartwrap' }, svg, tip), numbers(key, [...bars].reverse().map((b) => [b.sub || b.label, `${fmt(b.value)} ${unit}`])));
}
