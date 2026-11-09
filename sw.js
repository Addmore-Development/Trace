/* Addmore Trace | service worker: keeps the app shell and the scanner available offline.
   Bump VERSION whenever you want every device to drop its old cache. */
var VERSION = 'trace-v1';
var LOCAL = ['scan.html', 'offline.html', 'login.html', 'dashboard.html', 'assets.html', 'asset-detail.html', 'asset-new.html',
  'categories.html', 'team.html', 'reports.html', 'approvals.html', 'manager.html', 'admin.html', 'index.html', 'manifest.webmanifest',
  'shared/addmore.css', 'shared/app.css', 'shared/config.js', 'shared/supabase.js', 'shared/offline.js', 'shared/depreciation.js',
  'shared/app.js', 'shared/ui.js', 'shared/dep-ui.js', 'shared/admin.js', 'shared/scan.js', 'shared/tagqr.js',
  'shared/vendor/jsQR.js', 'shared/vendor/qrcode.js', 'icons/icon-192.png', 'icons/icon-512.png'];
var CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    var jobs = LOCAL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); })
      .concat(CDN.map(function (u) { return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
    return Promise.all(jobs);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n !== VERSION; }).map(function (n) { return caches.delete(n); })); }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/\.supabase\.(co|in)$/.test(url.hostname)) return;           /* live data is never served from cache */
  if (url.origin === location.origin) {
    /* network first so a new deploy shows straight away; cache when the network is gone */
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (m) {
        return m || (req.mode === 'navigate' ? caches.match('offline.html') : Response.error());
      });
    }));
    return;
  }
  /* fonts and the Supabase library: cache first, refresh in the background */
  e.respondWith(caches.match(req).then(function (m) {
    var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); } return r; }).catch(function () { return m; });
    return m || net;
  }));
});