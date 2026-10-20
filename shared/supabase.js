
(function () {
  'use strict';
  var CFG = window.AM_CONFIG || {};
  var page = document.body ? document.body.getAttribute('data-page') : null;

  function banner(msg) {
    var d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;padding:.9rem 1rem;background:#C0392B;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center';
    d.textContent = msg;
    document.body.appendChild(d);
  }

  if (!window.supabase || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || /PASTE/i.test(CFG.SUPABASE_ANON_KEY)) {
    console.error('Supabase is not configured. Open shared/config.js and set SUPABASE_URL and SUPABASE_ANON_KEY.');
    window.AMDB = { ready: new Promise(function () {}), configError: true };
    if (document.body) banner('Supabase is not configured. Add your anon key to shared/config.js');
    return;
  }

  var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var ORG = null, UID = null, SNAP = {}, A = [], CATS = {}, D = null, Q = Promise.resolve();

  function chk(r) { if (r.error) throw r.error; return r.data; }
  function queue(fn) { var p = Q.then(fn); Q = p.catch(function () {}); return p; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

  /* ---- row <-> app object mappers ---- */
  function toApp(r) {
    var a = { tag: r.tag, c: r.category_code, name: r.name, loc: r.location || '', st: r.status, who: r.assigned_to || '', val: Number(r.value) || 0, x: r.extra || {}, at: r.created_at };
    if (r.approval) a.ap = r.approval;
    if (r.alert) a.al = r.alert;
    return a;
  }
  function toRow(a) {
    return { org_id: ORG, tag: a.tag, category_code: a.c, name: a.name, location: a.loc || '', status: a.st, assigned_to: a.who || null, value: Number(a.val) || 0, extra: a.x || {}, approval: a.ap || null, alert: a.al || null };
  }
  function toLog(r) { return { t: r.asset_tag, n: r.asset_name, c: r.category_code, w: r.used_by || '', l: r.location || '', y: r.purpose || '', e: r.event, at: r.at }; }

  /* ---- boot: session check, then load everything for this organisation ---- */
  function boot() {
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { location.replace('login.html'); return new Promise(function () {}); }
      UID = s.user.id;
      return Promise.all([
        sb.from('profiles').select('*').order('created_at'),
        sb.from('categories').select('*').order('sort_order').order('created_at'),
        sb.from('assets').select('*').order('created_at', { ascending: false }),
        sb.from('usage_log').select('*').order('at', { ascending: false }).limit(1000),
        sb.from('invites').select('*').is('accepted_at', null).order('created_at'),
        sb.from('organisations').select('*')
      ]);
    }).then(function (R) {
      var profiles = chk(R[0]), cats = chk(R[1]), assets = chk(R[2]), logs = chk(R[3]), invites = chk(R[4]), orgs = chk(R[5]);
      var me = profiles.filter(function (p) { return p.id === UID; })[0];
      if (!me) throw new Error('No profile found for this account. Run supabase/schema.sql (including the back-fill block) and sign in again.');
      ORG = me.org_id;
      var org = orgs.filter(function (o) { return o.id === ORG; })[0] || { name: 'Your organisation', status: 'Active' };
      if (org.status === 'Suspended') { sb.auth.signOut().then(function () { location.replace('login.html?suspended=1'); }); return new Promise(function () {}); }

      CATS = {}; var MG = {}, byId = {};
      profiles.forEach(function (p) { byId[p.id] = p.full_name || p.email; });
      cats.forEach(function (c) { CATS[c.code] = { n: c.name, f: Array.isArray(c.fields) ? c.fields : [] }; if (c.manager_id && byId[c.manager_id]) MG[c.code] = byId[c.manager_id]; });

      A = assets.map(toApp);
      A.forEach(function (a) { SNAP[a.tag] = JSON.stringify(toRow(a)); });

      var team = profiles.map(function (p) {
        return { id: p.id, n: p.full_name || p.email, r: p.role, e: p.email, s: 'Joined ' + new Date(p.created_at).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }), b: p.bio || '', photo: p.photo_url || '' };
      }).concat(invites.map(function (i) {
        return { id: i.id, n: i.email.split('@')[0], r: i.role, e: i.email, s: 'Invited ' + new Date(i.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), b: 'Waiting to accept the invite. Photo and details appear once they join.', pending: true };
      }));

      D = {
        A: A, CATS: CATS, MG: MG, LG: logs.map(toLog), team: team,
        MGR: profiles.filter(function (p) { return p.role === 'Owner' || p.role === 'Manager'; }).map(function (p) { return p.full_name || p.email; }),
        me: { id: UID, name: me.full_name || me.email, role: me.role, orgId: ORG },
        org: org
      };
      return D;
    }).catch(function (e) {
      console.error(e);
      banner('Could not load your data: ' + (e && e.message ? e.message : e));
      return new Promise(function () {});
    });
  }

  var ready = page ? boot() : Promise.resolve(null);

  window.AMDB = {
    sb: sb,
    ready: ready,
    hue: hash,

    /* Save only what changed in the assets array (upsert changed, delete removed) */
    saveAssets: function (arr) {
      return queue(function () {
        var rows = [], seen = {}, prev = Object.assign({}, SNAP);
        arr.forEach(function (a) { var r = toRow(a), j = JSON.stringify(r); seen[a.tag] = 1; if (SNAP[a.tag] !== j) { rows.push(r); SNAP[a.tag] = j; } });
        var gone = Object.keys(SNAP).filter(function (t) { return !seen[t]; });
        gone.forEach(function (t) { delete SNAP[t]; });
        var jobs = [];
        if (rows.length) jobs.push(sb.from('assets').upsert(rows, { onConflict: 'org_id,tag' }).then(chk));
        if (gone.length) jobs.push(sb.from('assets').delete().eq('org_id', ORG).in('tag', gone).select().then(function (r) {
          var d = chk(r); if ((d || []).length < gone.length) throw new Error('You do not have permission to retire assets');
        }));
        return Promise.all(jobs).catch(function (e) { SNAP = prev; throw e; });
      });
    },

    logEvent: function (g) {
      return sb.from('usage_log').insert({ org_id: ORG, asset_tag: g.t, asset_name: g.n, category_code: g.c, used_by: g.w || null, location: g.l || null, purpose: g.y || null, event: g.e, created_by: UID, at: g.at }).then(chk);
    },

    saveCategory: function (code, c) {
      var order = Object.keys(CATS).indexOf(code); if (order < 0) order = Object.keys(CATS).length;
      return sb.from('categories').upsert({ org_id: ORG, code: code, name: c.n, fields: c.f, sort_order: order + 1 }, { onConflict: 'org_id,code' }).select().then(function (r) {
        var d = chk(r); if (!d || !d.length) throw new Error('You do not have permission to change categories');
      });
    },

    setManager: function (code, name) {
      return sb.from('profiles').select('id,full_name,email').eq('org_id', ORG).then(chk).then(function (ps) {
        var p = ps.filter(function (x) { return (x.full_name || x.email) === name; })[0];
        return sb.from('categories').update({ manager_id: p ? p.id : null }).eq('org_id', ORG).eq('code', code).select().then(function (r) {
          var d = chk(r); if (!d || !d.length) throw new Error('You do not have permission to assign managers');
        });
      });
    },

    setRole: function (id, role) {
      return sb.from('profiles').update({ role: role }).eq('id', id).select().then(function (r) {
        var d = chk(r); if (!d || !d.length) throw new Error('Only an Owner can change roles');
      });
    },

    invite: function (email, role) {
      return sb.from('invites').insert({ org_id: ORG, email: email.trim().toLowerCase(), role: role, invited_by: UID }).then(chk);
    },

    /* True only for Addmore platform admins (public.platform_admins) */
    isAdmin: function () {
      return sb.rpc('is_platform_admin').then(function (r) { return !r.error && r.data === true; }, function () { return false; });
    },

    /* After a successful sign-in: count the login, then send admins to the admin
       console and everyone else to their dashboard. Pass false to skip counting
       (used when an existing session is simply being resumed). */
    afterLogin: function (record) {
      var counted = record === false ? Promise.resolve() : sb.rpc('record_login').then(function () {}, function () {});
      return counted.then(function () { return window.AMDB.isAdmin(); }).then(function (admin) {
        location.href = admin ? 'admin.html' : 'dashboard.html';
      });
    },

    /* Log out always lands on the public home page */
    signOut: function () {
      var home = function () { location.replace('index.html'); };
      return sb.auth.signOut().then(home, home);
    }
  };
})();