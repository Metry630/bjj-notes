// Talks to the Apps Script web app. A plain string body keeps the request "simple"
// (text/plain, no CORS preflight), which is what Apps Script can answer.

const LINK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const TOKEN = /^bjj_[0-9a-f]{64}$/;

// The phone link from App · Setup: ...#api=<encoded exec url>&k=<phone token>
export function parseLink(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const api = params.get('api') || '';
  const k = params.get('k') || '';
  return LINK.test(api) && TOKEN.test(k) ? { api, k } : null;
}

// A request that hangs (weak signal) fails after `timeoutMs` instead of waiting forever, so the
// item stays queued and the next try starts fresh.
export function makeApi(getConfig, fetchImpl = (...a) => fetch(...a), timeoutMs = 90000) {
  async function call(action, payload = {}) {
    const cfg = getConfig();
    if (!cfg) throw new Error('not_linked');
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
    let res;
    try {
      res = await fetchImpl(cfg.api, { method: 'POST', body: JSON.stringify({ ...payload, action, token: cfg.k }), ...(ctrl ? { signal: ctrl.signal } : {}) });
    } catch {
      throw new Error(ctrl?.signal.aborted ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('not_json'); // Google's error page instead of an answer: worth a retry
    }
    if (!data.ok) throw new Error(data.error || 'api_error');
    return data;
  }
  return {
    call,
    batch: async (calls) => (await call('batch', { calls })).results,
  };
}
