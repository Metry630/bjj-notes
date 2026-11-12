// Bottom bar: every everyday screen is one tap away. Stats opens from a button on Home.
export const MAIN = [['log', 'Log'], ['search', 'Search'], ['ask', 'Ask'], ['run', 'Run'], ['home', 'Home']];

export function navItems(view, badges = {}) {
  // Stats is a child of Home, so Home stays lit while it is open.
  return MAIN.map(([v, label]) => ({ v, label, badge: badges[v] || 0, on: view === v || (v === 'home' && view === 'analysis' || view === 'before') }));
}
