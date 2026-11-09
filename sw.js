// Keeps the app shell on the phone so it opens with no signal. Network first, so a new version
// shows up as soon as there is a connection: requests revalidate with the server ("no-cache")
// rather than reusing GitHub Pages' 10-minute browser cache. Only same-origin GET requests are touched; calls to
// the sheet API go straight through.
const CACHE = 'bjj-notes-shell';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'icon-180.png',
  'src/app.js', 'src/analysis.js', 'src/api.js', 'src/dates.js', 'src/images.js', 'src/nav.js', 'src/queue.js', 'src/recorder.js',
  'src/search.js', 'src/store.js', 'src/training.js'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
