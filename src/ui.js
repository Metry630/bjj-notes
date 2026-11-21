// DOM helpers. Everything renders through text nodes and attributes: data never goes through
// innerHTML. Shared by every screen so they look and behave the same.
import { store } from './store.js';
import { icon } from './icons.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Same as h() for SVG (charts). SVG needs setAttribute for class too.
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

// replaceChildren() does not flatten arrays; this does, and skips empty parts.
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
}

// A section that opens and closes; the choice is remembered per key on this phone.
export function fold(key, title, kids, openByDefault = false) {
  const open = store.get(`fold:${key}`, openByDefault);
  return h('details', { class: 'fold', open: open ? true : null, ontoggle: (e) => store.set(`fold:${key}`, e.target.open) }, h('summary', null, title), kids);
}

// Chips: pick one (tap the chosen one again to clear) or, with multi, any number.
export function picker(options, { multi = false, initial, onchange } = {}) {
  let chosen = multi ? new Set(initial || []) : initial || '';
  const buttons = options.map(([v, label]) => h('button', { type: 'button', class: 'pick', 'aria-pressed': 'false', onclick: () => toggle(v) }, label));
  const paint = () =>
    buttons.forEach((b, i) => {
      const on = multi ? chosen.has(options[i][0]) : chosen === options[i][0];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  const api = {
    el: h('div', { class: 'picks' }, buttons),
    value: () => (multi ? options.map((o) => o[0]).filter((v) => chosen.has(v)) : chosen),
    set: (v) => {
      chosen = multi ? new Set(v || []) : v || '';
      paint();
    },
    reset: () => api.set(multi ? [] : ''),
  };
  function toggle(v) {
    if (multi) chosen.has(v) ? chosen.delete(v) : chosen.add(v);
    else chosen = chosen === v ? '' : v;
    paint();
    onchange?.(api.value());
  }
  paint();
  return api;
}

// One line in a grouped list that opens something: label, optional detail, badge, chevron.
export function row({ label, sub, right, badge, onclick, iconName, cls = '' }) {
  return h(
    'button',
    { type: 'button', class: `row ${cls}`.trim(), onclick },
    iconName ? icon(iconName, { size: 20 }) : null,
    h('span', { class: 'rowtext' }, h('span', { class: 'rowlabel' }, label), sub ? h('span', { class: 'rowsub' }, sub) : null),
    badge ? h('span', { class: 'badge' }, String(badge)) : null,
    right ? h('span', { class: 'rowright' }, right) : null,
    icon('chevron-right', { size: 18 })
  );
}

export const sec = (title, ...extra) => h('h2', { class: 'sec' }, title, extra);

// Large title with an optional line under it and buttons on the right.
export const header = (title, sub, ...actions) =>
  h('header', { class: 'head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'headsub' }, sub) : null), actions.length ? h('div', { class: 'headacts' }, actions) : null);

export const iconButton = (name, label, onclick) => h('button', { type: 'button', class: 'iconbtn', 'aria-label': label, onclick }, icon(name, { size: 20 }));

export const backBar = (label, onclick) => h('button', { type: 'button', class: 'back', onclick }, icon('chevron-left', { size: 22 }), label);

// Segmented control: one of a few views of the same list.
export function seg(options, value, onpick) {
  return h(
    'div',
    { class: 'seg', role: 'group' },
    options.map(([v, label]) => h('button', { type: 'button', class: v === value ? 'on' : '', 'aria-pressed': String(v === value), onclick: () => v !== value && onpick(v) }, label))
  );
}

// − value + with a number he can also type. Steps snap (142.5 + 2.5 = 145), limits clamp.
export function stepper({ label, value, step = 1, min = 0, max = 999, decimals = 0, onchange }) {
  const round = (n) => Math.round(n * 10 ** decimals) / 10 ** decimals;
  const clamp = (n) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  const text = (n) => String(round(n));
  const input = h('input', { type: 'text', inputmode: decimals ? 'decimal' : 'numeric', class: 'stepval num', value: text(value), 'aria-label': label, autocomplete: 'off' });
  const get = () => clamp(round(parseFloat(String(input.value).replace(',', '.'))));
  const set = (n, quiet = false) => {
    input.value = text(clamp(round(n)));
    if (!quiet) onchange?.(get());
  };
  input.addEventListener('change', () => set(get()));
  input.addEventListener('focus', () => input.select());
  const btn = (name, delta, what) => h('button', { type: 'button', class: 'stepbtn', 'aria-label': what, onclick: () => set(get() + delta) }, icon(name, { size: 20, stroke: 2.4 }));
  return {
    el: h('div', { class: 'stepper' }, h('span', { class: 'steplabel' }, label), h('div', { class: 'steprow' }, btn('minus', -step, `Less ${label}`), input, btn('plus', step, `More ${label}`))),
    get,
    set,
  };
}

// A bottom sheet (<dialog>). Not dismissible while something would be lost (a recording).
export function sheet(kids, { label = '', dismissible = true, onclose, act } = {}) {
  const box = h('dialog', { class: 'sheet', 'aria-label': label || null, 'data-act': act || null }, h('div', { class: 'grab', 'aria-hidden': 'true' }), kids);
  let canDismiss = dismissible;
  const close = () => {
    if (box.open) box.close();
    else box.remove();
  };
  box.addEventListener('cancel', (e) => {
    if (!canDismiss) e.preventDefault();
  });
  box.addEventListener('click', (e) => {
    if (e.target === box && canDismiss) close();
  });
  box.addEventListener('close', () => {
    box.remove();
    onclose?.();
  });
  document.body.append(box);
  if (box.showModal) box.showModal();
  else box.setAttribute('open', '');
  return { el: box, close, dismissible: (v) => (canDismiss = v) };
}

// A short message above the tab bar, with an optional action (Undo). One at a time.
let toastEl = null;
let toastTimer = 0;
export function toast(text, { action, onaction, ms = 5000 } = {}) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text), action ? h('button', { type: 'button', class: 'toastbtn', onclick: () => { el.remove(); onaction?.(); } }, action) : null);
  toastEl = el;
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// Starts a screen change with a cross-fade where the phone supports it (and motion is welcome).
export function transition(fn) {
  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!calm && document.startViewTransition) document.startViewTransition(fn);
  else fn();
}
