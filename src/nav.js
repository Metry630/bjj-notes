// Bottom bar: four everyday tabs plus "More" for the rest, so the bar stays uncrowded.
export const MAIN = [['log', 'Log'], ['run', 'Run'], ['search', 'Search'], ['ask', 'Ask']];
export const MORE = [['analysis', 'Stats'], ['home', 'Home']];

export function navItems(view, badges = {}) {
  const items = MAIN.map(([v, label]) => ({ v, label, badge: badges[v] || 0, on: view === v }));
  const inMore = MORE.some(([v]) => v === view);
  const moreBadge = MORE.reduce((n, [v]) => n + (badges[v] || 0), 0);
  items.push({ v: 'more', label: 'More', badge: moreBadge, on: inMore });
  return items;
}
