/* Addmore admin console.
   Loaded ONLY by admin.html. Normal users never receive this file's data:
   every query goes through admin_* database functions that refuse anyone
   who is not in public.platform_admins (see supabase/schema.sql). */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var PS = 10;

  /* ---------- theme + mobile menu (same storage key as the rest of the site) ---------- */
  var tb = $('#theme-toggle');
  function setT(t) { root.setAttribute('data-theme', t); if (tb) tb.setAttribute('aria-pressed', String(t === 'dark')); }
  setT(root.getAttribute('data-theme') || 'light');
  if (tb) tb.onclick = function () {
    var n = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setT(n); try { localStorage.setItem('addmore-theme', n); } catch (e) {}
  };
  var mb = $('#menu-toggle'), nv = $('#primary-nav');
  if (mb) mb.onclick = function () {
    var o = mb.getAttribute('aria-expanded') !== 'true';
    mb.setAttribute('aria-expanded', String(o)); nv.classList.toggle('is-open', o);
  };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function R(n) { return 'R\u00a0' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 }); }
  function N(n) { return Number(n || 0).toLocaleString('en-ZA'); }
  function fmt(d) { return new Date(d).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }); }
  function when(d) { return d ? fmt(d) : '<span style="color:var(--muted)">Never</span>'; }
  var toastTimer;
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000); }
  function go(p) { location.replace(p); }
  function chk(r) { if (r.error) throw r.error; return r.data; }
  function fail(e) {
    console.error(e);
    var m = (e && e.message) ? e.message : String(e);
    if (/platform admins only/i.test(m)) { go('dashboard.html'); return; }
    if (/jwt|not authenticated/i.test(m)) { go('login.html'); return; }
    toast(m);
  }

  var COL = { Active: 'var(--status-active)', Assigned: 'var(--status-assigned)', 'In repair': 'var(--status-repair)', Lost: 'var(--status-lost)' };
  var STATUSES = ['Active', 'Assigned', 'In repair', 'Lost'];
  var IC = { Active: ['active', 'i-check-circle'], Assigned: ['assigned', 'i-user'], 'In repair': ['repair', 'i-wrench'], Lost: ['lost', 'i-alert'] };
  function chip(s) { var i = IC[s] || IC.Active; return '<span class="status status--' + i[0] + '"><svg class="icon" aria-hidden="true"><use href="#' + i[1] + '"></use></svg>' + esc(s) + '</span>'; }
  function orgChip(s) { return s === 'Suspended' ? '<span class="status status--lost"><svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>Suspended</span>' : chip('Active'); }

  /* ---------- guard: signed in AND a platform admin, otherwise leave ---------- */
  var sb = window.AMDB && window.AMDB.sb;
  var gate = $('#gate');
  $$('[data-logout]').forEach(function (l) { l.onclick = function (e) { e.preventDefault(); if (window.AMDB && AMDB.signOut) AMDB.signOut(); else go('index.html'); }; });
  if (!sb) { gate.textContent = 'Supabase is not configured. Add your anon key to shared/config.js'; return; }

  sb.auth.getSession().then(function (r) {
    if (!r.data || !r.data.session) { go('login.html'); return; }
    return sb.rpc('is_platform_admin').then(function (x) {
      if (x.error) { gate.textContent = 'Could not check your access: ' + x.error.message; return; }
      if (x.data !== true) { go('dashboard.html'); return; }
      start(r.data.session.user);
    });
  }).catch(function (e) { gate.textContent = 'Could not check your access: ' + (e && e.message ? e.message : e); });

  /* ---------- state ---------- */
  var S = { orgs: [], assets: [], users: [], recent: [], report: null, audit: [] };
  var st = { tab: 'overview', b: 0, a: 0, l: 0 };
  var TABS = ['overview', 'businesses', 'assets', 'logins', 'reports'];
  var ORGN = {};

  function loadReport() {
    return Promise.all([
      sb.rpc('admin_report').then(chk),
      sb.from('admin_audit').select('*').order('at', { ascending: false }).limit(10).then(chk)
    ]).then(function (r) { S.report = r[0]; S.audit = r[1] || []; });
  }
  function load() {
    return Promise.all([
      sb.rpc('admin_orgs').then(chk),
      sb.rpc('admin_assets').then(chk),
      sb.rpc('admin_login_summary').then(chk),
      sb.rpc('admin_recent_logins', { p_limit: 30 }).then(chk),
      loadReport()
    ]).then(function (r) {
      S.orgs = r[0] || []; S.assets = r[1] || []; S.users = r[2] || []; S.recent = r[3] || [];
      ORGN = {}; S.orgs.forEach(function (o) { ORGN[o.id] = o.name; });
    });
  }

  /* ---------- small UI pieces ---------- */
  function pager(sel, pgs, cur) {
    var b = ''; for (var i = 0; i < pgs; i++) b += '<button data-p="' + i + '" class="' + (i === cur ? 'on' : '') + '">' + (i + 1) + '</button>';
    $(sel).innerHTML = b;
  }
  function kpi(label, value, sub) { return '<div class="card a-stat"><span>' + label + '</span><b>' + value + '</b>' + (sub ? '<small style="color:var(--muted)">' + sub + '</small>' : '') + '</div>'; }
  function bars(el, rows, colour) {
    var mx = Math.max.apply(null, [1].concat(rows.map(function (r) { return r[1]; })));
    el.innerHTML = rows.length ? rows.map(function (r) {
      return '<div><span>' + esc(r[0]) + '</span><i data-w="' + (r[1] / mx * 100) + '"' + (colour ? ' style="background:' + colour + '"' : '') + '></i><span class="price">' + N(r[1]) + '</span></div>';
    }).join('') : '<p style="color:var(--muted)">Nothing to show yet.</p>';
    requestAnimationFrame(function () { requestAnimationFrame(function () { $$('i[data-w]', el).forEach(function (i) { i.style.width = i.dataset.w + '%'; }); }); });
  }
  function entries(o) { return Object.keys(o || {}).map(function (k) { return [k, Number(o[k])]; }).sort(function (a, b) { return b[1] - a[1]; }); }

  /* ---------- Overview ---------- */
  function drawOverview() {
    var T = (S.report && S.report.totals) || {};
    $('#kpis').innerHTML =
      kpi('Businesses', N(T.businesses), N(T.active) + ' active, ' + N(T.suspended) + ' suspended') +
      kpi('Users', N(T.users)) +
      kpi('Assets tracked', N(T.assets), R(T.asset_value) + ' on registers') +
      kpi('Logins in the last 7 days', N(T.logins_7d), N(T.active_users_7d) + ' different users') +
      kpi('Logins, all time', N(T.logins_total));
    var attn = S.orgs.filter(function (o) { return o.status === 'Suspended'; });
    var bad = S.assets.filter(function (a) { return a.status === 'Lost' || a.status === 'In repair'; }).length;
    $('#attn').innerHTML =
      '<li><span>Suspended businesses</span><b>' + attn.length + '</b></li>' +
      '<li><span>Assets lost or in repair</span><b>' + N(bad) + '</b></li>' +
      '<li><span>Users who have never signed in</span><b>' + S.users.filter(function (u) { return !Number(u.login_count); }).length + '</b></li>';
    $('#rl').innerHTML = S.recent.slice(0, 8).map(function (g) {
      return '<li><span>' + esc(g.full_name || g.email) + '<small>' + esc(g.org_name || '') + '</small></span><small>' + fmt(g.logged_in_at) + '</small></li>';
    }).join('') || '<li>No sign-ins recorded yet.</li>';
    $('#au').innerHTML = S.audit.map(function (g) {
      return '<li><span>' + esc(g.action) + (g.org_id && ORGN[g.org_id] ? ' &middot; ' + esc(ORGN[g.org_id]) : '') + '<small>' + esc(g.detail || '') + '</small></span><small>' + fmt(g.at) + '</small></li>';
    }).join('') || '<li>No admin actions yet.</li>';
  }

  /* ---------- Businesses (view + moderate) ---------- */
  function orgList() {
    var q = $('#bq').value.toLowerCase(), f = $('#bs').value;
    return S.orgs.filter(function (o) { return (!f || o.status === f) && (o.name + ' ' + o.sector + ' ' + o.plan).toLowerCase().indexOf(q) > -1; });
  }
  function drawOrgs() {
    var r = orgList(), pgs = Math.max(1, Math.ceil(r.length / PS)); st.b = Math.min(st.b, pgs - 1);
    $('#biz').innerHTML = r.slice(st.b * PS, st.b * PS + PS).map(function (o) {
      return '<tr><td><strong>' + esc(o.name) + '</strong><small>' + esc(o.sector) + '</small></td><td>' + esc(o.plan) + '</td><td class="price">' + N(o.users) + '</td><td class="price">' + N(o.assets) + '</td><td class="price">' + R(o.asset_value) + '</td><td>' + when(o.last_login_at) + '</td><td>' + orgChip(o.status) + '</td><td><button class="a-mini" data-v="' + o.id + '">View</button><button class="a-mini" data-s="' + o.id + '">' + (o.status === 'Active' ? 'Suspend' : 'Reactivate') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="8">No businesses match.</td></tr>';
    pager('#bpg', pgs, st.b);
  }
  function setOrg(id, next) {
    var o = S.orgs.filter(function (x) { return x.id === id; })[0]; if (!o) return Promise.resolve();
    var reason = '';
    if (next === 'Suspended') {
      reason = prompt('Suspend ' + o.name + '? Their people will be signed out and blocked.\nReason (only Addmore staff see this):', '');
      if (reason === null) return Promise.resolve();
    } else if (!confirm('Reactivate ' + o.name + '?')) return Promise.resolve();
    return sb.rpc('admin_set_org_status', { p_org: id, p_status: next, p_reason: reason }).then(chk).then(function () {
      o.status = next; o.suspended_reason = next === 'Suspended' ? (reason.trim() || null) : null;
      return loadReport();
    }).then(function () { drawAll(); toast(o.name + ' is now ' + next.toLowerCase()); }, fail);
  }
  function openOrg(id) {
    var o = S.orgs.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var as = S.assets.filter(function (a) { return a.org_id === id; }), us = S.users.filter(function (u) { return u.org_id === id; });
    var cnt = {}; as.forEach(function (a) { cnt[a.status] = (cnt[a.status] || 0) + 1; });
    $('#dlg-body').innerHTML =
      '<div class="ad-dh"><div><h2 id="dlg-t">' + esc(o.name) + '</h2><p style="color:var(--muted)">' + esc(o.sector) + ' &middot; ' + esc(o.plan) + ' plan &middot; joined ' + new Date(o.created_at).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) + '</p></div><button class="icon-btn" data-close type="button" aria-label="Close"><svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg></button></div>' +
      '<p>' + orgChip(o.status) + (o.status === 'Suspended' && o.suspended_reason ? ' <span style="color:var(--muted)">Reason: ' + esc(o.suspended_reason) + '</span>' : '') + '</p>' +
      '<div class="a-stats">' + kpi('Users', N(o.users)) + kpi('Assets', N(o.assets)) + kpi('Register value', R(o.asset_value)) + '</div>' +
      '<div class="a-chips" style="margin:0 0 1rem">' + STATUSES.map(function (s) { return '<span class="status"><i style="width:.6rem;height:.6rem;border-radius:50%;background:' + COL[s] + '"></i>' + s + ' ' + (cnt[s] || 0) + '</span>'; }).join('') + '</div>' +
      '<h3 style="margin:1rem 0 .5rem">People</h3><div class="card a-tw"><table class="a-tbl"><thead><tr><th>Name</th><th>Role</th><th>Logins</th><th>Last login</th></tr></thead><tbody>' +
      (us.map(function (u) { return '<tr><td>' + esc(u.full_name || u.email) + '<small>' + esc(u.email) + '</small></td><td>' + esc(u.role) + '</td><td class="price">' + N(u.login_count) + '</td><td>' + when(u.last_login_at) + '</td></tr>'; }).join('') || '<tr><td colspan="4">No people.</td></tr>') +
      '</tbody></table></div>' +
      '<h3 style="margin:1rem 0 .5rem">Moderation notes</h3><label class="a-field">Only visible to Addmore staff<textarea id="nt" rows="3" maxlength="2000" style="padding:.6rem .8rem;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);font:inherit">' + esc(o.notes || '') + '</textarea></label>' +
      '<div class="a-row" style="margin-top:.9rem"><button class="btn btn--primary" data-notes="' + o.id + '" type="button">Save notes</button><button class="btn btn--ghost" data-s="' + o.id + '" type="button">' + (o.status === 'Active' ? 'Suspend business' : 'Reactivate business') + '</button></div>';
    var d = $('#dlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  /* ---------- Assets (update statuses) ---------- */
  function assetList() {
    var q = $('#aq').value.toLowerCase(), f = $('#as').value, o = $('#ao').value;
    return S.assets.filter(function (a) { return (!f || a.status === f) && (!o || a.org_id === o) && (a.tag + ' ' + a.name + ' ' + (a.assigned_to || '') + ' ' + (a.location || '') + ' ' + a.org_name).toLowerCase().indexOf(q) > -1; });
  }
  function drawAssets() {
    var r = assetList(), pgs = Math.max(1, Math.ceil(r.length / 12)); st.a = Math.min(st.a, pgs - 1);
    $('#ar').innerHTML = r.slice(st.a * 12, st.a * 12 + 12).map(function (a) {
      return '<tr><td><span class="tag-chip">' + esc(a.tag) + '</span></td><td>' + esc(a.name) + '<small>' + esc(a.category_code) + '</small></td><td>' + esc(a.org_name) + '</td><td>' + esc(a.location || '') + '</td><td>' + esc(a.assigned_to || 'Nobody') + '</td><td class="price">' + R(a.value) + '</td><td><select class="a-select" data-asset="' + a.id + '" data-was="' + esc(a.status) + '" aria-label="Status of ' + esc(a.tag) + '">' + STATUSES.map(function (s) { return '<option' + (s === a.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') || '<tr><td colspan="7">No assets match.</td></tr>';
    pager('#apg', pgs, st.a);
    $('#acount').textContent = N(r.length) + ' of ' + N(S.assets.length) + ' assets' + (S.assets.length >= 5000 ? ' (showing the 5,000 most recently updated)' : '');
  }
  function setAsset(sel) {
    var id = sel.dataset.asset, was = sel.dataset.was, next = sel.value;
    var a = S.assets.filter(function (x) { return x.id === id; })[0]; if (!a || next === was) return;
    sel.disabled = true;
    sb.rpc('admin_set_asset_status', { p_asset: id, p_status: next }).then(chk).then(function () {
      a.status = next; if (next !== 'Assigned') a.assigned_to = null;
      return loadReport();
    }).then(function () { drawAll(); toast(a.tag + ' is now ' + next); }, function (e) { sel.value = was; sel.disabled = false; fail(e); });
  }

  /* ---------- Logins ---------- */
  function userList() {
    var q = $('#lq').value.toLowerCase(), s = $('#ls').value;
    var r = S.users.filter(function (u) { return ((u.full_name || '') + ' ' + u.email + ' ' + u.org_name).toLowerCase().indexOf(q) > -1; });
    if (s === 'count') r = r.slice().sort(function (a, b) { return Number(b.login_count) - Number(a.login_count); });
    else if (s === 'never') r = r.filter(function (u) { return !Number(u.login_count); });
    return r;
  }
  function drawLogins() {
    var T = (S.report && S.report.totals) || {}, today = ((S.report && S.report.logins_by_day) || []).slice(-1)[0];
    var seen = S.users.filter(function (u) { return Number(u.login_count) > 0; }).length;
    $('#lk').innerHTML = kpi('Logins, all time', N(T.logins_total)) + kpi('Logins today', N(today ? today.n : 0)) + kpi('Logins, last 7 days', N(T.logins_7d)) + kpi('Users who have logged in', N(seen), 'of ' + N(S.users.length) + ' users');
    var r = userList(), pgs = Math.max(1, Math.ceil(r.length / PS)); st.l = Math.min(st.l, pgs - 1);
    $('#lu').innerHTML = r.slice(st.l * PS, st.l * PS + PS).map(function (u) {
      return '<tr><td>' + esc(u.full_name || u.email) + '<small>' + esc(u.email) + '</small></td><td>' + esc(u.org_name) + '</td><td>' + esc(u.role) + '</td><td class="price"><strong>' + N(u.login_count) + '</strong></td><td>' + when(u.first_login_at) + '</td><td>' + when(u.last_login_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="6">No users match.</td></tr>';
    pager('#lpg', pgs, st.l);
    $('#lr').innerHTML = S.recent.map(function (g) {
      return '<li><span>' + esc(g.full_name || g.email) + '<small>' + esc(g.org_name || '') + '</small></span><small>' + fmt(g.logged_in_at) + '</small></li>';
    }).join('') || '<li>No sign-ins recorded yet.</li>';
  }

  /* ---------- Reports ---------- */
  function drawReports() {
    var Rp = S.report || {}, T = Rp.totals || {}, byS = Rp.assets_by_status || {};
    $('#gen').textContent = Rp.generated_at ? 'Generated ' + fmt(Rp.generated_at) : '';
    $('#rk').innerHTML = kpi('Businesses', N(T.businesses), N(T.suspended) + ' suspended') + kpi('Users', N(T.users)) + kpi('Assets', N(T.assets)) + kpi('Register value', R(T.asset_value));
    var tot = STATUSES.reduce(function (s, k) { return s + Number(byS[k] || 0); }, 0) || 1;
    $('#sbar').innerHTML = STATUSES.map(function (k) { return '<i data-w="' + (Number(byS[k] || 0) / tot * 100) + '" style="background:' + COL[k] + '"></i>'; }).join('');
    requestAnimationFrame(function () { requestAnimationFrame(function () { $$('#sbar i').forEach(function (i) { i.style.width = i.dataset.w + '%'; }); }); });
    $('#sleg').innerHTML = STATUSES.map(function (k) { return '<li><i style="background:' + COL[k] + '"></i>' + k + '<b>' + N(byS[k] || 0) + '</b></li>'; }).join('');
    bars($('#r-sec'), entries(Rp.orgs_by_sector));
    bars($('#r-plan'), entries(Rp.orgs_by_plan));
    bars($('#r-top'), (Rp.top_orgs || []).map(function (o) { return [o.name, Number(o.assets)]; }));
    bars($('#r-new'), (Rp.new_orgs_by_month || []).map(function (o) { return [o.label, Number(o.n)]; }), 'var(--accent)');
    bars($('#r-log'), (Rp.logins_by_day || []).map(function (o) { return [o.label, Number(o.n)]; }), 'var(--status-assigned)');
  }

  /* ---------- CSV downloads ---------- */
  function cell(v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
  function csv(name, head, rows) {
    var L = [head.map(cell).join(',')].concat(rows.map(function (r) { return r.map(cell).join(','); }));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'addmore-' + name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); toast('Report downloaded');
  }
  var iso = function (d) { return d ? new Date(d).toISOString() : ''; };
  var EXPORTS = {
    businesses: function () { csv('businesses', ['Business', 'Sector', 'Plan', 'Status', 'Users', 'Assets', 'Register value', 'Last login', 'Joined', 'Suspension reason'], S.orgs.map(function (o) { return [o.name, o.sector, o.plan, o.status, o.users, o.assets, o.asset_value, iso(o.last_login_at), iso(o.created_at), o.suspended_reason || '']; })); },
    assets: function () { csv('assets', ['Business', 'Tag', 'Asset', 'Category', 'Location', 'Assigned to', 'Status', 'Value', 'Updated'], S.assets.map(function (a) { return [a.org_name, a.tag, a.name, a.category_code, a.location, a.assigned_to || '', a.status, a.value, iso(a.updated_at)]; })); },
    logins: function () { csv('logins', ['Name', 'Email', 'Business', 'Role', 'Login count', 'First login', 'Last login'], S.users.map(function (u) { return [u.full_name, u.email, u.org_name, u.role, u.login_count, iso(u.first_login_at), iso(u.last_login_at)]; })); }
  };

  /* ---------- tabs ---------- */
  function show(t) {
    if (TABS.indexOf(t) < 0) t = 'overview'; st.tab = t;
    $$('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
    $$('[data-tab]').forEach(function (a) { if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (nv) nv.classList.remove('is-open'); if (mb) mb.setAttribute('aria-expanded', 'false');
    if (t === 'reports') drawReports();
    if (history.replaceState) history.replaceState(null, '', '#' + t); else location.hash = t;
  }
  function drawAll() { drawOverview(); drawOrgs(); drawAssets(); drawLogins(); if (st.tab === 'reports') drawReports(); }

  /* ---------- boot ---------- */
  function start() {
    load().then(function () {
      gate.hidden = true; $('#app').hidden = false;
      $('#ao').innerHTML = '<option value="">All businesses</option>' + S.orgs.map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + '</option>'; }).join('');
      drawAll(); show((location.hash || '').slice(1));
    }).catch(function (e) { gate.textContent = 'Could not load the console: ' + (e && e.message ? e.message : e); });

    $$('[data-tab]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); show(a.dataset.tab); }; });
    $('#refresh').onclick = function () { toast('Refreshing...'); load().then(function () { drawAll(); toast('Up to date'); }, fail); };
    $('#bq').oninput = function () { st.b = 0; drawOrgs(); }; $('#bs').onchange = function () { st.b = 0; drawOrgs(); };
    $('#aq').oninput = $('#as').onchange = $('#ao').onchange = function () { st.a = 0; drawAssets(); };
    $('#lq').oninput = $('#ls').onchange = function () { st.l = 0; drawLogins(); };
    $('#bpg').onclick = function (e) { var b = e.target.closest('button'); if (b) { st.b = +b.dataset.p; drawOrgs(); } };
    $('#apg').onclick = function (e) { var b = e.target.closest('button'); if (b) { st.a = +b.dataset.p; drawAssets(); } };
    $('#lpg').onclick = function (e) { var b = e.target.closest('button'); if (b) { st.l = +b.dataset.p; drawLogins(); } };
    $('#biz').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) openOrg(b.dataset.v); else if (b.dataset.s) { var o = S.orgs.filter(function (x) { return x.id === b.dataset.s; })[0]; if (o) setOrg(o.id, o.status === 'Active' ? 'Suspended' : 'Active'); }
    };
    $('#ar').onchange = function (e) { if (e.target.dataset.asset) setAsset(e.target); };
    $('#dlg').onclick = function (e) {
      var b = e.target.closest('button');
      if (e.target === $('#dlg') || (b && b.hasAttribute('data-close'))) { $('#dlg').close(); return; }
      if (!b) return;
      if (b.dataset.notes) {
        var id = b.dataset.notes, v = $('#nt').value, o = S.orgs.filter(function (x) { return x.id === id; })[0];
        sb.rpc('admin_set_org_notes', { p_org: id, p_notes: v }).then(chk).then(function () { o.notes = v; toast('Notes saved'); }, fail);
      } else if (b.dataset.s) {
        var o2 = S.orgs.filter(function (x) { return x.id === b.dataset.s; })[0];
        if (o2) { $('#dlg').close(); setOrg(o2.id, o2.status === 'Active' ? 'Suspended' : 'Active'); }
      }
    };
    $$('[data-export]').forEach(function (b) { b.onclick = function () { EXPORTS[b.dataset.export](); }; });
    $('#print').onclick = function () { show('reports'); window.print(); };
  }
})();