// Dev harness: the real app against a fake sheet API with synthetic data (this repo is public, so
// nothing here is his). Open tools/dev/index.html?view=lift through `node tools/dev/serve.mjs`.
// Query options: view=<screen>, v=<script version>, offline=1, empty=1.
const params = new URLSearchParams(location.search);
const pad = (n) => String(n).padStart(2, '0');
const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const day = (n) => {
  const t = new Date();
  t.setDate(t.getDate() + n);
  return iso(t);
};
const sheetDate = (s) => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}/${s.slice(2, 4)}`;
const stamp = (n, hh = 20) => `${day(n)}T${pad(hh - 8)}:10:00.000Z`;
const monday = (() => {
  const t = new Date();
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return iso(t);
})();
const addDays = (s, n) => {
  const t = new Date(`${s}T00:00:00`);
  t.setDate(t.getDate() + n);
  return iso(t);
};

const empty = params.get('empty') === '1';
const week = {
  updated: day(-1),
  slots: [
    { day: 'mon', time: '18:00', activity: 'lift', lifts: ['Deadlift'] },
    { day: 'mon', time: '20:00', activity: 'bjj', hours: 1.5 },
    { day: 'tue', time: 'evening', activity: 'dance', what: 'Bachata class', hours: 2, tags: 'bachata,class' },
    { day: 'wed', time: '17:30', activity: 'lift', lifts: ['Squat', 'Pull ups'] },
    { day: 'thu', time: 'morning', activity: 'run', what: 'Easy run' },
    { day: 'thu', time: '20:00', activity: 'bjj', hours: 1 },
    { day: 'fri', time: '19:30', activity: 'philosophy', what: 'Reading group', optional: true },
    { day: 'sat', time: 'morning', activity: 'run', what: 'Quality run' },
    { day: 'sat', time: '15:00', activity: 'dance', what: 'Salsa class', hours: 2, tags: 'salsa,class' },
    { day: 'sat', time: '22:00', activity: 'dance', what: 'Social', hours: 2, tags: 'salsa,social', optional: true },
    { day: 'sun', time: 'morning', activity: 'run', what: 'Long run' },
    { day: 'sun', time: '18:00', activity: 'philosophy', what: 'Discussion group' },
  ],
  extra: [],
};
const runTypes = [
  { key: 'easy', name: 'Easy', pace: '7:40-8:10/km', feel: 'Conversational the whole way.', how: 'Relaxed, you could talk in full sentences.' },
  { key: 'long', name: 'Long', pace: '7:50-8:20/km', feel: 'Easy, just longer.', how: 'Start slower than you think.' },
  { key: 'fast', name: 'Fast km', pace: '6:05-6:15/km', feel: 'Hard but controlled.', how: '1 km easy, then fast and easy km in turn.' },
  { key: 'tempo', name: 'Tempo', pace: '6:40-6:50/km', feel: 'Comfortably hard.', how: '1 km easy, the block in one go, 1-2 km easy.' },
  { key: 'strides', name: 'Strides', pace: '', feel: 'Quick and light.', how: '4 × 20 s fast, walk back.' },
];
const plan = [
  { id: 'w1', week: '1', start: addDays(monday, -7), block: 'Base', thu: 'Easy 5 km', thu_type: 'easy', sat: 'Fast km 7 km', sat_type: 'fast', sun: 'Long 8 km', sun_type: 'long', status: 'done' },
  { id: 'w2', week: '2', start: monday, block: 'Base', thu: 'Easy 5 km + strides', thu_type: 'easy,strides', sat: 'Fast km 8 km', sat_type: 'fast', sun: 'Long 9 km', sun_type: 'long', note: 'Keep Thursday short: BJJ comes after.' },
  { id: 'w3', week: '3', start: addDays(monday, 7), block: 'Base', thu: 'Easy 5 km', thu_type: 'easy', sat: 'Tempo 6 km', sat_type: 'tempo', sun: 'Long 9.9 km', sun_type: 'long' },
];
const DB = empty ? {} : {
  'App · Profile': [
    { id: 'race', value: JSON.stringify({ name: 'City 10K', date: addDays(monday, 70), goal: '58:00' }) },
    { id: 'ladder', value: JSON.stringify({ steps: [5.5, 6, 6.6, 7.3, 8, 8.8, 9.6], done: 5, spare_total: 2, spare_used: 0 }) },
    { id: 'run_types', value: JSON.stringify(runTypes) },
    { id: 'week', value: JSON.stringify(week) },
    { id: 'guide', value: 'Gels after 75 minutes, 30-60 g of carbs an hour. Drink to thirst.' },
  ],
  'App · Plan': plan,
  'App · Runs': [
    { id: 'c1', date: addDays(monday, -12), distance_km: '5.1', pace: '8:31/km', verdict: 'done', session: 'Easy 5 km' },
    { id: 'c2', date: addDays(monday, -9), distance_km: '6.8', pace: '7:40/km', verdict: 'done', session: 'Fast km 7 km' },
    { id: 'c3', date: addDays(monday, -8), distance_km: '8.2', pace: '8:44/km', verdict: 'done', session: 'Long 8 km' },
    { id: 'c4', date: addDays(monday, -5), distance_km: '5.0', pace: '8:25/km', verdict: 'done', session: 'Easy 5 km' },
    { id: 'c5', date: addDays(monday, -2), distance_km: '7.0', pace: '7:35/km', verdict: 'too fast early', session: 'Fast km 7 km' },
    { id: 'c6', date: addDays(monday, -1), distance_km: '8.0', pace: '8:50/km', verdict: 'done', session: 'Long 8 km' },
    { id: 'c7', date: addDays(monday, 3), distance_km: '5.2', pace: '7:58/km', verdict: 'on track', session: 'Easy 5 km + strides' },
  ].filter((r) => r.date <= day(0)),
  'App · Coach': [
    { id: 'c6', created_at: stamp(-((new Date().getDay() + 6) % 7) - 1, 10), kind: 'run', run_date: addDays(monday, -1), text: 'Felt fine, hot', feel: 'ok', pain: 'none', images: 2, status: 'answered', reply: 'On track. 8.0 km at 8:05/km, even splits. Next: Thursday easy 5 km with strides.', replied_at: stamp(-((new Date().getDay() + 6) % 7) - 1, 11) },
    { id: 'q1', created_at: stamp(-3, 9), kind: 'ask', text: 'Can I squat heavy the day before a long run?', status: 'answered', reply: 'Keep heavy squats at least two days before the long run. Wednesday works.', replied_at: stamp(-3, 18) },
    { id: 'wk', created_at: stamp(-((new Date().getDay() + 6) % 7), 4), kind: 'coach', text: 'Week 2. Last week done in full. This week: Thu easy 5 km + strides, Sat fast km 8 km, Sun long 9 km.', status: 'answered' },
    { id: 'c5', created_at: stamp(-((new Date().getDay() + 6) % 7) - 2, 9), kind: 'run', run_date: addDays(monday, -2), text: '', feel: 'hard', pain: 'none', images: 1, status: 'answered', reply: 'Too fast early: km 1 at 6:50. Start the warm-up km at easy pace.', replied_at: stamp(-((new Date().getDay() + 6) % 7) - 2, 18) },
  ],
  'App · Lifting': [
    ...[[60, 5], [100, 3], [100, 3], [100, 3, 'ok'], [115, 1, 'max']].map(([w, r, e], i) => ({ id: `s${i}`, created_at: stamp(-7, 18).replace(':10:', `:${pad(10 + i * 4)}:`), date: day(-7), exercise: 'Squat', weight_kg: String(w), sets: '1', reps: String(r), effort: e || '', status: 'new' })),
    { id: 'old', created_at: stamp(-14, 18), date: day(-14), exercise: 'Squat', weight_kg: '97.5', sets: '3', reps: '3', status: 'new' },
    { id: 'old2', created_at: stamp(-21, 18), date: day(-21), exercise: 'Squat', weight_kg: '95', sets: '3', reps: '3', status: 'new' },
    { id: 'b1', created_at: stamp(-6, 18), date: day(-6), exercise: 'Bench press', weight_kg: '60', sets: '3', reps: '5', status: 'new' },
    { id: 'p1', created_at: stamp(-5, 18), date: day(-5), exercise: 'Pull ups', weight_kg: '0', sets: '3', reps: '8', effort: 'hard', status: 'new' },
    { id: 't1', created_at: new Date(Date.now() - 6 * 60000).toISOString(), date: day(0), exercise: 'Squat', weight_kg: '60', sets: '1', reps: '5', status: 'new' },
    { id: 't2', created_at: new Date(Date.now() - 3 * 60000).toISOString(), date: day(0), exercise: 'Squat', weight_kg: '102.5', sets: '1', reps: '3', status: 'new' },
    { id: 't3', created_at: new Date(Date.now() - 100000).toISOString(), date: day(0), exercise: 'Squat', weight_kg: '102.5', sets: '1', reps: '3', status: 'new' },
  ],
  'App · Inbox': [
    { id: 'i1', created_at: stamp(-2, 21), session_date: day(-2), location: 'Gym A', hours: '1', text: 'Get the underhook before the knee cut. Next time try framing earlier.', method: 'recording', status: 'processed', sheet_row: '212', rating: '4' },
    { id: 'i2', created_at: stamp(-1, 21), session_date: day(-1), location: '', hours: '3', text: 'Cross body lead, step out on 2. Frame stays.', method: 'recording', status: 'processed', activity: 'dance', tags: 'salsa,class' },
    { id: 'i3', created_at: stamp(-3, 21), session_date: day(-3), location: '', hours: '', text: 'Attention as the one thing you own.', method: 'keyboard', status: 'processed', activity: 'philosophy', tags: 'meetup' },
    { id: 'i4', created_at: new Date(Date.now() - 20 * 60000).toISOString(), session_date: day(0), location: 'Gym A', hours: '1', text: '', method: 'recording', status: 'new' },
  ],
  'App · Journal': [
    { id: 'i2-1', activity: 'dance', session_date: day(-1), topic: 'Cross body lead', text: 'step out of the slot on 2', tags: 'salsa,class', source_id: 'i2', seq: 1 },
    { id: 'i2-2', activity: 'dance', session_date: day(-1), topic: 'frame', text: 'lead with the frame, not the arms', tags: 'salsa,class', source_id: 'i2', seq: 2 },
    { id: 'i2-3', activity: 'dance', session_date: day(-1), topic: 'Basic with turn', text: 'small steps, turn her on 5', tags: 'bachata,class', source_id: 'i2', seq: 3 },
    { id: 'x1', activity: 'dance', session_date: day(-8), topic: 'Enchufla', text: 'turn her before you pass behind', tags: 'salsa,class', seq: 1 },
    { id: 'x2', activity: 'dance', session_date: day(-8), topic: 'Hammerlock', text: 'prep on 8, keep the hand low', tags: 'bachata,class', seq: 2 },
    { id: 'x3', activity: 'dance', session_date: day(-8), topic: 'Cross body lead', text: 'open the door with the left hand', tags: 'salsa,class', seq: 3 },
    { id: 'i3-1', activity: 'philosophy', session_date: day(-3), topic: 'Attention and presence', text: 'they said attention is the one thing you actually own', tags: 'meetup', source_id: 'i3', seq: 1 },
    { id: 'i3-2', activity: 'philosophy', session_date: day(-3), topic: 'practice', text: 'pause before answering and notice the impulse', tags: 'meetup', source_id: 'i3', seq: 2 },
    { id: 'y1', activity: 'philosophy', session_date: day(-10), topic: 'Unity', text: 'everything you see is one thing looking at itself', tags: 'meetup', seq: 1 },
  ],
  'App · Topics': [
    { id: 'knee-shield', topic: 'knee shield', summary: 'Frame the knee across, keep the elbow tight.', aliases: 'kneeshield' },
    { id: 'spider-guard', topic: 'spider guard', summary: 'Feet on the biceps, pull to break posture.' },
    { id: 'dance:cross-body-lead', activity: 'dance', topic: 'Cross body lead', kind: 'move', style: 'salsa', summary: 'Step out of the slot on 2 and open the door with the left hand.' },
    { id: 'philosophy:attention', activity: 'philosophy', topic: 'Attention and presence', summary: 'Attention is where awareness rests. Many traditions treat it as the one thing a person can steer.', expansion: 'Simone Weil called attention the rarest and purest form of generosity.\n\nThe Stoics practised prosoche, a steady watch over your own judgements.', practice: 'Twice a day, stop for a minute and name what has your attention.', question: 'If attention is ours, why does it wander so easily?', sources: 'Attention · Stanford Encyclopedia of Philosophy | https://plato.stanford.edu/entries/attention/\nPierre Hadot, Philosophy as a Way of Life' },
  ],
  'App · Marks': [
    { id: 'm1', created_at: stamp(-1, 22), target: 'topic:dance:cross body lead', field: 'level', value: 'got' },
    { id: 'm2', created_at: stamp(-1, 22), target: 'topic:dance:enchufla', field: 'level', value: 'learning' },
  ],
  'App · Questions': [{ id: 'qq', asked_at: stamp(-2, 22), question: 'What did my notes say about knee shield?', status: 'answered', answer: 'Frame the knee across and keep the elbow tight (from 12/11/26).', sources: '12/11/26', answered_at: stamp(-1, 4) }],
  'App · Feedback': [{ id: 'f1', created_at: stamp(-4, 21), text: 'Make the coach log shorter', status: 'read', reply: 'Next run builds it.' }],
  'App · Log': [{ id: 'run1', started_at: stamp(0, 18), finished_at: stamp(0, 18), mode: 'normal', summary: 'Filed 2 notes, coached 1 run.', shipped: '' }],
  'App · Decisions': [],
};
const NOTES = empty ? [] : Array.from({ length: 24 }, (_, i) => {
  const d = addDays(day(0), -(i * 3 + 2));
  return { row: 200 - i, cells: [sheetDate(d), 'Gym A', i % 4 ? '1' : '1.5', i % 3 ? 'Get the underhook before the knee cut' : 'Next time try the knee shield earlier', 'Spider guard: feet on the biceps', 'Waiter sweep, lift the leg not the hips'] };
}).reverse();

const version = Number(params.get('v') || 5);
const offline = params.get('offline') === '1';
let n = 0;
function one(c) {
  switch (c.action) {
    case 'ping': return version >= 5 ? { ok: true, role: 'phone', version } : { ok: true, role: 'phone' };
    case 'notes': return { ok: true, total_hours: '351', rows: NOTES };
    case 'settings': return { ok: true, routine_mode: 'normal' };
    case 'get': return { ok: true, rows: DB[c.tab] || [] };
    case 'add': {
      DB[c.tab] = DB[c.tab] || [];
      return { ok: true, added: c.rows.map((r) => { const row = { status: 'new', created_at: new Date().toISOString(), ...r, id: r.id || `fake-${++n}` }; if (!DB[c.tab].some((x) => x.id === row.id)) DB[c.tab].push(row); return { id: row.id }; }) };
    }
    case 'update': {
      const row = (DB[c.tab] || []).find((r) => r.id === c.id);
      if (!row) return { ok: false, error: 'no_such_id' };
      Object.assign(row, c.fields);
      return { ok: true, id: c.id };
    }
    case 'runNow': return { ok: true, fired: true };
    default: return { ok: false, error: 'unknown_action' };
  }
}
const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (!String(url).startsWith('https://script.google.com/')) return realFetch(url, init);
  if (offline) throw new TypeError('Failed to fetch');
  await new Promise((r) => setTimeout(r, 120));
  const body = JSON.parse(init.body);
  const out = body.action === 'batch' ? { ok: true, results: body.calls.map(one) } : one(body);
  return { ok: true, status: 200, json: async () => out };
};

localStorage.setItem('bjj-notes:config', JSON.stringify({ api: 'https://script.google.com/macros/s/DEV-HARNESS/exec', k: `bjj_${'0'.repeat(64)}` }));
if (params.get('view')) {
  localStorage.setItem('bjj-notes:view', JSON.stringify(params.get('view')));
  localStorage.setItem('bjj-notes:viewAt', JSON.stringify(Date.now()));
  localStorage.setItem('bjj-notes:param', JSON.stringify(params.get('param') || ''));
}
await import('../../src/app.js');
// ?click=<css selector>: tap something once the screen has loaded (to capture a sheet, say).
if (params.get('click')) setTimeout(() => document.querySelector(params.get('click'))?.click(), Number(params.get('wait') || 2500));
// ?taps=<selector>@<ms>,<selector>@<ms>: a scripted sequence (record, then stop).
for (const step of (params.get('taps') || '').split(',').filter(Boolean)) {
  const [sel, ms] = step.split('@');
  setTimeout(() => document.querySelector(sel)?.click(), Number(ms));
}
// The fake sheet's audio and inbox rows, for checking an upload end to end.
window.__fakeSheet = DB;
if (params.get('report')) {
  setTimeout(() => {
    const audio = DB['App · Audio'] || [];
    const inbox = (DB['App · Inbox'] || []).filter((r) => r.method === 'recording' && !String(r.id).startsWith('i'));
    const out = document.createElement('pre');
    out.className = 'card';
    out.textContent = `audio rows ${audio.length} · totals ${[...new Set(audio.map((r) => r.total))].join('/')} · inbox items ${inbox.length} (${inbox.map((r) => `${r.activity || 'bjj'} ${r.tags}`).join('; ')})`;
    document.getElementById('main').prepend(out);
  }, Number(params.get('report')));
}
