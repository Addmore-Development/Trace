/* Addmore | Offline support: service worker, local copy of the register, and a sync queue.
   Anything recorded while offline waits in localStorage and is written to Supabase
   (usage_log, and the asset status for damaged/missing reports) when the signal returns. */
(function () {
  'use strict';
  var SK = 'am-snap-v1', QK = 'am-queue-v1', FK = 'am-failed-v1', L = [], busy = null;
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function emit() { L.forEach(function (f) { try { f(); } catch (e) {} }); }
  function pending() { return rd(QK, []); }
  function isNet(e) { return !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed/i.test(String((e && e.message) || e)); }
  function client() { return window.AMDB && window.AMDB.sb ? window.AMDB.sb : null; }

  function send(sb, it, uid) {
    var ev = { verify: 'Stocktake verified', unusable: 'Reported unusable', missing: 'Reported missing' }[it.type];
    var step1 = it.logged ? Promise.resolve() : sb.from('usage_log').insert({
      org_id: it.org, asset_tag: it.tag, asset_name: it.name, category_code: it.c, used_by: it.who || null, location: it.loc || null,
      purpose: it.type === 'verify' ? 'Scanned on site' : (it.note || 'Reported from a scan'), event: ev, created_by: uid, at: it.at
    }).then(function (r) {
      if (r.error) throw r.error;
      var q = pending(); q.forEach(function (x) { if (x.id === it.id) x.logged = true; }); wr(QK, q); it.logged = true;
    });
    return step1.then(function () {
      if (it.type === 'verify') return;
      var al = { t: it.type === 'missing' ? 'Missing' : 'Cannot be used', m: it.note || '', d: new Date(it.at).toLocaleDateString('en-ZA') };
      return sb.from('assets').update({ status: it.type === 'missing' ? 'Lost' : 'In repair', assigned_to: null, approval: null, alert: al })
        .eq('org_id', it.org).eq('tag', it.tag).select().then(function (r) {
          if (r.error) throw r.error;
          if (!r.data || !r.data.length) throw new Error('Your role cannot change this asset');
        });
    });
  }

  function flush() {
    if (busy) return busy;
    var sb = client();
    if (!sb || !navigator.onLine || !pending().length) return Promise.resolve();
    busy = sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) return;
      var uid = s.user.id;
      function next() {
        var it = pending().filter(function (x) { return x.uid === uid; })[0]; if (!it) return;
        return send(sb, it, uid).then(function () {
          wr(QK, pending().filter(function (x) { return x.id !== it.id; })); emit(); return next();
        }, function (e) {
          if (isNet(e)) return;                                  /* still offline: keep it and try later */
          var f = rd(FK, []); f.push({ tag: it.tag, type: it.type, msg: String((e && e.message) || e), at: Date.now() }); wr(FK, f);
          wr(QK, pending().filter(function (x) { return x.id !== it.id; })); emit(); return next();
        });
      }
      return next();
    }).catch(function () {}).then(function () { busy = null; emit(); });
    return busy;
  }

  window.AMOFF = {
    snapshot: function () { return rd(SK, null); },
    saveSnapshot: function (o) { return wr(SK, o); },
    patch: function (tag, fn) { var s = rd(SK, null); if (!s) return; s.assets.forEach(function (a) { if (a.tag === tag) fn(a); }); wr(SK, s); },
    clearSnapshot: function () { try { localStorage.removeItem(SK); } catch (e) {} },
    add: function (it) { var q = pending(); it.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7); q.push(it); wr(QK, q); emit(); flush(); return it; },
    pending: pending,
    failed: function () { return rd(FK, []); },
    clearFailed: function () { wr(FK, []); emit(); },
    flush: flush,
    onchange: function (f) { L.push(f); }
  };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.addEventListener('online', function () { emit(); flush(); });
  window.addEventListener('offline', emit);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
  window.addEventListener('load', function () { setTimeout(flush, 800); });
})();