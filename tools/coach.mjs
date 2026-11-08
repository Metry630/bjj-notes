#!/usr/bin/env node
// The running coach's arithmetic, so the model never does it in its head. See COACH.md.
//
//   node tools/coach.mjs ladder [start_km] [steps]   long-run steps, each 10% over the start compounded
//   node tools/coach.mjs spike <km> [YYYY-MM-DD]     is a <km> run that day within 10% of the longest
//                                                    run in the 30 days before it? (reads App · Runs)
//   node tools/coach.mjs paces <distance> <time>     VDOT, race predictions and training paces from a
//                                                    result: paces 5k 33:00, paces 10k 1:05:00
//   node tools/coach.mjs week [YYYY-MM-DD]           which plan week and day that is (reads App · Plan)
//
// Dates default to today in Singapore.
import { pathToFileURL } from 'node:url';
import { call } from './sheet.mjs';

const DAY = 864e5;
const floor1 = (x) => Math.floor(x * 10 + 1e-9) / 10;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// 5.0 -> 5.5, 6.0, 6.6, 7.3 ... (start x 1.1^n, rounded down to 0.1 km). Rounding down keeps each
// step within 10% of the plan; against the step before it, a step is at most ~10.6% (GPS noise is
// bigger than that).
export function ladder(start = 5, steps = 13, pct = 0.1) {
  return Array.from({ length: steps }, (_, i) => floor1(start * (1 + pct) ** (i + 1)));
}

// Frandsen et al., BJSM 2025: overuse injuries rose when one run was more than 10% longer than the
// longest run of the previous 30 days. 0.2 km of slack covers phone GPS and rounding.
export function spike(km, runs, date) {
  const from = addDays(date, -30);
  const recent = runs.filter((r) => r.date >= from && r.date < date && Number(r.distance_km) > 0);
  if (!recent.length) return { km, longest: 0, ok: null, note: 'No run in the last 30 days: restart the ladder low, not where it was.' };
  const top = recent.reduce((a, b) => (Number(b.distance_km) > Number(a.distance_km) ? b : a));
  const longest = Number(top.distance_km);
  return {
    km,
    longest,
    longest_date: top.date,
    ratio: Math.round((km / longest) * 1000) / 1000,
    cap: floor1(longest * 1.1 + 0.2),
    ok: km <= longest * 1.1 + 0.2,
  };
}

// ---- Daniels & Gilbert VDOT ----
const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v in m/min
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t in min
const velocity = (o2) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (o2 + 4.6))) / (2 * 0.000104);

export function vdot(meters, seconds) {
  const t = seconds / 60;
  return vo2(meters / t) / pctMax(t);
}

// Race time in seconds that a VDOT predicts for a distance (vdot falls as time grows: bisect).
export function predict(vd, meters) {
  let lo = 60;
  let hi = 86400;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(meters, mid) > vd) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// Seconds per km at a share of VDOT: easy 62-70%, threshold 88%, interval 97.5% (these reproduce
// Daniels' table paces, e.g. VDOT 50: T 4:15/km, I 3:55/km).
export const paceAt = (vd, share) => 60000 / velocity(vd * share);

export function trainingPaces(vd) {
  const hm = predict(vd, 21097.5);
  const m = predict(vd, 42195);
  return {
    vdot: Math.round(vd * 10) / 10,
    predicted: { '5k': predict(vd, 5000), '10k': predict(vd, 10000), half: hm, marathon: m },
    per_km: {
      easy: [paceAt(vd, 0.7), paceAt(vd, 0.62)],
      marathon: m / 42.195,
      half: hm / 21.0975,
      threshold: paceAt(vd, 0.88),
      interval: paceAt(vd, 0.975),
    },
  };
}

const NAMED = { '5k': 5000, '10k': 10000, half: 21097.5, hm: 21097.5, marathon: 42195 };

// "5k", "10k", "half", "4.3", "4.3km", "800m" -> meters.
export function parseDistance(s) {
  const t = String(s).trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  const m = /^(\d+(?:\.\d+)?)\s*(km|k|m)?$/.exec(t);
  if (!m) throw new Error(`bad distance: ${s}`);
  return m[2] === 'm' ? Number(m[1]) : Number(m[1]) * 1000;
}

// "33:00" or "1:05:30" -> seconds.
export function parseTime(s) {
  const parts = String(s).trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) throw new Error(`bad time: ${s}`);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function clock(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
}

// Plan rows (App · Plan) -> the week and day a date falls in.
export function planWeek(plan, iso) {
  const w = plan.find((r) => r.start && r.start <= iso && iso < addDays(r.start, 7));
  if (!w) return null;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return { week: w.week, block: w.block, day, session: { Fri: w.fri, Sat: w.sat, Sun: w.sun }[day] || 'rest or BJJ' };
}

const sgToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

function main(argv) {
  const [cmd, ...rest] = argv;
  const print = (x) => process.stdout.write(`${typeof x === 'string' ? x : JSON.stringify(x, null, 2)}\n`);
  switch (cmd) {
    case 'ladder': {
      const steps = ladder(Number(rest[0] || 5), Number(rest[1] || 13));
      return print(steps.map((km, i) => `step ${i + 1}: ${km} km`).join('\n'));
    }
    case 'spike':
      return print(spike(Number(rest[0]), call('get', { tab: 'App · Runs' }).rows, rest[1] || sgToday()));
    case 'paces': {
      const p = trainingPaces(vdot(parseDistance(rest[0]), parseTime(rest[1])));
      const k = (sec) => `${clock(sec)}/km`;
      return print({
        vdot: p.vdot,
        predicted: Object.fromEntries(Object.entries(p.predicted).map(([d, s]) => [d, clock(s)])),
        per_km: {
          easy: `${k(p.per_km.easy[0])} to ${k(p.per_km.easy[1])}`,
          marathon: k(p.per_km.marathon),
          half: k(p.per_km.half),
          threshold: k(p.per_km.threshold),
          interval: k(p.per_km.interval),
        },
      });
    }
    case 'week':
      return print(planWeek(call('get', { tab: 'App · Plan' }).rows, rest[0] || sgToday()) || 'Not in the plan.');
    default:
      process.stderr.write('usage: see the header of tools/coach.mjs\n');
      process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
