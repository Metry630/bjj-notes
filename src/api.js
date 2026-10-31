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

export function makeApi(getConfig, fetchImpl = (...a) => fetch(...a)) {
  async function call(action, payload = {}) {
    const cfg = getConfig();
    if (!cfg) throw new Error('not_linked');
    let res;
    try {
      res = await fetchImpl(cfg.api, { method: 'POST', body: JSON.stringify({ ...payload, action, token: cfg.k }) });
    } catch {
      throw new Error('offline');
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'api_error');
    return data;
  }
  return {
    call,
    batch: async (calls) => (await call('batch', { calls })).results,
  };
}
