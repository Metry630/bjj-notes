// localStorage that never throws (private mode, full storage, blocked site data).
const PREFIX = 'bjj-notes:';

export const store = {
  get(name, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + name);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify(value));
    } catch {
      // the app still works for this visit
    }
  },
  del(name) {
    try {
      localStorage.removeItem(PREFIX + name);
    } catch {
      // nothing to do
    }
  },
};
