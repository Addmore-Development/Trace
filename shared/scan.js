/* Addmore | Scanner. Works with no signal: it reads the register saved on this device,
   records confirmations in a local queue, and syncs them when the connection returns. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function R(n) { return 'R\u00a0' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 }); }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
  var root = document.documentElement, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* theme, menu, log out (the shared app.js is not loaded on this page) */
  var tb = $('#theme-toggle');
  function setT(t) { root.setAttribute('data-theme', t); if (tb) tb.setAttribute('aria-pressed', String(t === 'dark')); }
  setT(root.getAttribute('data-theme') || 'light');
  if (tb) tb.onclick = function () { var n = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; setT(n); try { localStorage.setItem('addmore-theme', n); } catch (e) {} };
  var mb = $('#menu-toggle'), nv = $('#primary-nav');
  if (mb) mb.onclick = function () { var o = mb.getAttribute('aria-expanded') !== 'true'; mb.setAttribute('aria-expanded', String(o)); nv.classList.toggle('is-open', o); };
  [].forEach.call(document.querySelectorAll('[data-logout]'), function (l) {
    l.onclick = function (e) { e.preventDefault(); if (window.AMDB && AMDB.signOut && navigator.onLine) AMDB.signOut(); else { AMOFF.clearSnapshot(); location.replace('index.html'); } };
  });

  var toastT; function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2800); }

  var SN = AMOFF.snapshot(), STK = 'am-stock-v1';
  function stock() { var s; try { s = JSON.parse(localStorage.getItem(STK)); } catch (e) {} if (!s || !SN || s.org !== SN.org) s = { org: SN && SN.org, started: Date.now(), tags: {} }; return s; }
  function saveStock(s) { try { localStorage.setItem(STK, JSON.stringify(s)); } catch (e) {} }
  function cname(c) { var k = SN && SN.cats.filter(function (x) { return x.code === c; })[0]; return k ? k.name : c; }
  function find(t) { t = String(t).trim().toUpperCase(); return SN && SN.assets.filter(function (a) { return a.tag.toUpperCase() === t; })[0]; }
  function tagFrom(txt) { txt = String(txt).trim(); try { var u = new URL(txt), t = u.searchParams.get('tag'); if (t) return t; } catch (e) {} return txt; }

  /* ---------- connection pill ---------- */
  function pill() {
    var on = navigator.onLine, p = AMOFF.pending().length, f = AMOFF.failed();
    $('#net').className = 'scan-pill ' + (on ? 'on' : 'off');
    $('#net').textContent = on ? 'Online' : 'Offline: scanning still works';
    $('#snapinfo').textContent = SN ? SN.assets.length + ' assets saved on this device, updated ' + ago(SN.at) : 'No register saved on this device yet';
    $('#pend').innerHTML = p ? '<b>' + p + '</b> change' + (p === 1 ? '' : 's') + ' waiting to sync' + (on ? '' : ' (will sync when you are back online)') : 'Everything is synced';
    $('#syncnow').hidden = !(p && on);
    $('#fails').innerHTML = f.length ? '<div class="scan-warn"><b>' + f.length + ' could not be saved</b><ul>' + f.map(function (x) { return '<li>' + esc(x.tag) + ': ' + esc(x.msg) + '</li>'; }).join('') + '</ul><button class="a-mini" id="clrf" type="button">Dismiss</button></div>' : '';
    var c = $('#clrf'); if (c) c.onclick = function () { AMOFF.clearFailed(); };
  }
  AMOFF.onchange(function () { pill(); stockUI(); });

  /* ---------- download / refresh the register (online only) ---------- */
  function refresh() {
    var sb = window.AMDB && AMDB.sb; if (!sb || !navigator.onLine) return Promise.resolve();
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) { if (!SN) location.replace('login.html'); return; }
      return sb.from('profiles').select('org_id,role').eq('id', s.user.id).maybeSingle().then(function (p) {
        if (p.error || !p.data) throw (p.error || new Error('No profile'));
        var all = [];
        function page(from) {
          return sb.from('assets').select('*').order('created_at', { ascending: false }).range(from, from + 999).then(function (x) {
            if (x.error) throw x.error; all = all.concat(x.data); if (x.data.length === 1000) return page(from + 1000);
          });
        }
        return Promise.all([sb.from('categories').select('code,name').order('sort_order'), sb.from('organisations').select('name').eq('id', p.data.org_id).maybeSingle(), page(0)]).then(function (R2) {
          if (R2[0].error) throw R2[0].error;
          var queued = AMOFF.pending(), assets = all.map(function (r) {
            var a = { tag: r.tag, c: r.category_code, name: r.name, loc: r.location || '', st: r.status, who: r.assigned_to || '', val: Number(r.value) || 0, x: r.extra || {}, at: r.created_at };
            if (r.alert) a.al = r.alert; if (r.approval) a.ap = r.approval; return a;
          });
          AMOFF.saveSnapshot({ uid: s.user.id, org: p.data.org_id, orgName: R2[1].data ? R2[1].data.name : '', role: p.data.role, at: Date.now(), cats: R2[0].data, assets: assets });
          SN = AMOFF.snapshot();
          queued.forEach(function (q) { if (q.type !== 'verify') AMOFF.patch(q.tag, function (a) { a.st = q.type === 'missing' ? 'Lost' : 'In repair'; a.who = ''; }); });
          SN = AMOFF.snapshot();
        });
      });
    }).catch(function () { /* offline or blocked: keep what we already have */ });
  }

  /* ---------- result card ---------- */
  var cur = null;
  var STC = { Active: 'active', Assigned: 'assigned', 'In repair': 'repair', Lost: 'lost' };
  function show(a, via) {
    cur = a; var c = AMDEP.calc(a, cname(a.c)), done = !!stock().tags[a.tag];
    $('#res').hidden = false; $('#res').classList.remove('pop'); void $('#res').offsetWidth; if (!reduce) $('#res').classList.add('pop');
    $('#res').innerHTML = '<div class="a-between"><div><span class="tag-chip tag-chip--lg">' + esc(a.tag) + '</span><h2 style="margin-top:.6rem">' + esc(a.name) + '</h2></div><span class="status status--' + (STC[a.st] || 'active') + '">' + esc(a.st) + '</span></div>' +
      '<dl class="a-dl" style="margin:1rem 0"><div><dt>Category</dt><dd>' + esc(cname(a.c)) + '</dd></div><div><dt>Location</dt><dd>' + esc(a.loc || 'Not set') + '</dd></div><div><dt>Assigned to</dt><dd>' + esc(a.who || 'Nobody') + '</dd></div><div><dt>Bought for</dt><dd>' + R(a.val) + '</dd></div><div><dt>Worth today</dt><dd>' + R(c.book) + '</dd></div></dl>' +
      '<div class="a-row"><button class="btn btn--primary" id="ok" type="button">' + (done ? 'Confirmed again' : 'Confirm it is here') + '</button><button class="btn btn--ghost" id="bad" type="button">Report damaged</button>' + (navigator.onLine ? '<a class="btn btn--ghost" href="asset-detail.html?tag=' + encodeURIComponent(a.tag) + '">Full record</a>' : '') + '</div>';
    $('#ok').onclick = function () { act('verify', a); };
    $('#bad').onclick = function () { var n = prompt('What is wrong with ' + a.tag + '? (optional)', ''); if (n === null) return; act('unusable', a, n.trim()); };
    $('#res').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }
  function act(type, a, note) {
    var sk = stock();
    AMOFF.add({ type: type, tag: a.tag, name: a.name, c: a.c, loc: a.loc, who: a.who, note: note || '', at: new Date().toISOString(), uid: SN.uid, org: SN.org });
    if (type === 'verify') { sk.tags[a.tag] = Date.now(); saveStock(sk); toast(a.tag + ' confirmed' + (navigator.onLine ? '' : ' (saved, will sync)')); }
    else { AMOFF.patch(a.tag, function (x) { x.st = type === 'missing' ? 'Lost' : 'In repair'; x.who = ''; }); SN = AMOFF.snapshot(); toast(a.tag + (type === 'missing' ? ' reported missing' : ' reported damaged') + (navigator.onLine ? '' : ' (saved, will sync)')); }
    stockUI(); if (type !== 'verify') { var n = find(a.tag); if (n) show(n); } else { $('#ok').textContent = 'Confirmed'; $('#ok').disabled = true; }
  }
  function lookup(tag, via) {
    if (!SN) { say('No register is saved on this device yet. Open the scanner once while online.'); return; }
    var a = find(tag);
    if (a) { if (navigator.vibrate) navigator.vibrate(60); beep(); show(a, via); }
    else { cur = null; $('#res').hidden = false; $('#res').innerHTML = '<h2>Tag not found</h2><p style="color:var(--muted)"><strong>' + esc(tag) + '</strong> is not in the register saved on this device. If it was added recently, reconnect and reopen this page to refresh.</p>'; }
  }
  function beep() { try { var C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 90); } catch (e) {} }
  function say(m) { $('#hint').textContent = m; }

  /* ---------- stocktake ---------- */
  function stockUI() {
    if (!SN) { $('#stk').innerHTML = ''; return; }
    var sk = stock(), live = SN.assets.filter(function (a) { return a.st !== 'Lost' || sk.tags[a.tag]; }), found = live.filter(function (a) { return sk.tags[a.tag]; }), left = live.filter(function (a) { return !sk.tags[a.tag]; });
    var pc = live.length ? Math.round(found.length / live.length * 100) : 0;
    $('#stk').innerHTML = '<div class="a-between"><h2>Stocktake</h2><button class="a-mini" id="newstk" type="button">Start a new one</button></div><p style="color:var(--muted)">Confirm each asset as you find it. Started ' + ago(sk.started) + '.</p>' +
      '<div class="dep-bar" style="margin:.75rem 0"><i style="width:' + pc + '%"></i></div><p><b>' + found.length + '</b> of ' + live.length + ' confirmed (' + pc + '%)</p>' +
      (left.length ? '<details style="margin-top:.75rem"><summary>Not found yet (' + left.length + ')</summary><ul class="a-list">' + left.slice(0, 200).map(function (a) { return '<li><span><span class="tag-chip">' + esc(a.tag) + '</span><small>' + esc(a.name) + ' &middot; ' + esc(a.loc) + '</small></span><button class="a-mini" data-miss="' + esc(a.tag) + '" type="button">Mark missing</button></li>'; }).join('') + '</ul></details>' : '<p style="color:var(--status-active)"><b>Everything is accounted for.</b></p>');
    $('#newstk').onclick = function () { if (confirm('Clear the confirmed list and start a new stocktake?')) { saveStock({ org: SN.org, started: Date.now(), tags: {} }); stockUI(); } };
    [].forEach.call(document.querySelectorAll('[data-miss]'), function (b) { b.onclick = function () { var a = find(b.dataset.miss); if (a && confirm('Report ' + a.tag + ' as missing?')) act('missing', a, 'Not found during stocktake'); }; });
  }

  /* ---------- camera ---------- */
  var vid = $('#vid'), view = $('#view'), cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }), stream = null, raf = 0, last = { t: '', at: 0 };
  function tick() {
    if (!stream) return;
    if (vid.readyState >= 2 && vid.videoWidth) {
      var w = Math.min(640, vid.videoWidth), h = Math.round(w * vid.videoHeight / vid.videoWidth); cv.width = w; cv.height = h; cx.drawImage(vid, 0, 0, w, h);
      var code = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data) { var now = Date.now(); if (code.data !== last.t || now - last.at > 3000) { last = { t: code.data, at: now }; lookup(tagFrom(code.data), 'camera'); } }
    }
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return say('The camera is not available here. Use "Scan from photo" or type the tag.');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }).then(function (s) {
      stream = s; vid.srcObject = s; vid.setAttribute('playsinline', ''); return vid.play();
    }).then(function () { view.classList.add('on'); $('#go').textContent = 'Stop camera'; say('Point the camera at a tag QR code.'); tick(); })
      .catch(function (e) { stop(); say('Could not open the camera (' + (e && e.name === 'NotAllowedError' ? 'permission was denied' : (e && e.message) || e) + '). Use "Scan from photo" or type the tag.'); });
  }
  function stop() { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; vid.srcObject = null; view.classList.remove('on'); $('#go').textContent = 'Start camera'; }
  $('#go').onclick = function () { stream ? stop() : start(); };
  document.addEventListener('visibilitychange', function () { if (document.hidden && stream) stop(); });

  $('#photo').onchange = function (e) {
    var f = e.target.files[0]; if (!f) return; var img = new Image(), u = URL.createObjectURL(f);
    img.onload = function () {
      var s = Math.min(1, 1280 / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s); cv.width = w; cv.height = h; cx.drawImage(img, 0, 0, w, h);
      var code = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' }); URL.revokeObjectURL(u);
      if (code && code.data) lookup(tagFrom(code.data), 'photo'); else say('No QR code found in that photo. Try again closer and in better light.');
    }; img.src = u; e.target.value = '';
  };
  $('#man').onsubmit = function (e) { e.preventDefault(); var v = e.target.elements.t.value; if (v.trim()) lookup(tagFrom(v), 'typed'); e.target.reset(); };
  $('#syncnow').onclick = function () { AMOFF.flush().then(function () { toast('Synced'); }); };

  /* ---------- boot ---------- */
  pill(); stockUI();
  if (!SN && !navigator.onLine) { say('This device has no saved register yet. Connect once, open this page, and it will download automatically.'); }
  refresh().then(function () { pill(); stockUI(); if (!SN) say('Could not download your register. Check your connection and sign in.'); });
  window.addEventListener('online', function () { refresh().then(function () { pill(); stockUI(); }); });
  window.addEventListener('offline', pill); setInterval(pill, 60000);
})();