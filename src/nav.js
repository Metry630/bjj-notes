// Bottom bar: Today and one tab per activity (six, his pick). A screen inside a tab (BJJ › Search)
// keeps its tab lit.
export const MAIN = [
  ['today', 'Today', 'calendar-days'],
  ['bjj', 'BJJ', 'belt'],
  ['run', 'Run', 'footprints'],
  ['lift', 'Lift', 'dumbbell'],
  ['dance', 'Dance', 'music'],
  ['think', 'Think', 'lightbulb'],
];

export const tabOf = (view) => String(view || 'today').split('/')[0];

// Screen names from before 1.0, so a phone that was on "Log" opens on BJJ.
export const LEGACY = { log: 'bjj', search: 'bjj/search', ask: 'bjj/ask', home: 'today', analysis: 'bjj/stats', before: 'bjj/before' };

export function navItems(view, badges = {}) {
  const tab = tabOf(view);
  return MAIN.map(([v, label, iconName]) => ({ v, label, icon: iconName, badge: badges[v] || 0, on: tab === v }));
}
