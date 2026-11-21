// The phone's durable storage (IndexedDB). localStorage holds about 5 MB and a write that does not
// fit fails silently, which is how a long recording waiting for signal could vanish. Recordings,
// their audio chunks and every unsent save live here instead, until the sheet has them.
const NAME = 'bjj-notes';
const VERSION = 1;
let opening = null;

export const available = () => !!globalThis.indexedDB;

function open() {
  if (!available()) return Promise.reject(new Error('no_idb'));
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['rid', 'seq'] });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('idb_open'));
      req.onblocked = () => reject(new Error('idb_blocked'));
    });
    opening.catch(() => (opening = null));
  }
  return opening;
}

// One transaction; resolves with fn's request result once the transaction has committed, so a
// resolved write is on disk.
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    const req = fn(tx.objectStore(store));
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('idb_tx'));
    tx.onabort = () => reject(tx.error || new Error('idb_abort'));
  });
}

const chunkRange = (rid) => IDBKeyRange.bound([rid, 0], [rid, Number.MAX_SAFE_INTEGER]);

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  put: (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  chunks: (rid) => run('chunks', 'readonly', (s) => s.getAll(chunkRange(rid))),
  dropChunks: (rid) => run('chunks', 'readwrite', (s) => s.delete(chunkRange(rid))),
  // Asks the browser not to clear this storage under pressure (a home-screen app usually gets it).
  persist: () => globalThis.navigator?.storage?.persist?.().catch(() => false),
};
