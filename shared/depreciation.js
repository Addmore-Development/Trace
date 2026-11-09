/* Addmore | Automated depreciation (no database change needed)
   Policy lives in each asset's `extra` JSON under reserved keys (hidden from the UI):
     __dd purchase date (YYYY-MM-DD)  __dm method: sl | rb | none
     __dl useful life in years        __dr residual (scrap) value in rand
   Assets with no policy get a sensible default from their category name, so every
   existing asset is depreciated automatically from the day it was registered. */
(function () {
  'use strict';
  /* Useful lives in years. Based on common South African wear-and-tear periods
     (computers 3, phones 2, office equipment 5, furniture 6, appliances 6, vehicles 5).
     These are suggestions: your accountant's policy wins, and every asset can override them. */
  var RULES = [
    [/laptop|computer|\bpc\b|desktop|server|notebook/i, 3],
    [/phone|mobile|cell|tablet|ipad/i, 2],
    [/microwave|fridge|freezer|kettle|oven|stove|appliance|aircon|air.?con|heater|washing|dishwasher/i, 6],
    [/furniture|desk|chair|cabinet|shelf|table|couch/i, 6],
    [/vehicle|car\b|bakkie|truck|van\b|bike|motor/i, 5],
    [/monitor|screen|printer|scanner|projector|camera|tv\b|television|router|network|office/i, 5],
    [/tool|drill|equipment|machine|generator/i, 5]
  ];
  var DEFAULT_LIFE = 5;

  function defLife(name) { for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(name || '')) return RULES[i][1]; return DEFAULT_LIFE; }
  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function dstr(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parse(s) { if (!s) return null; var p = String(s).slice(0, 10).split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? null : d; }

  /* The policy in force for an asset (explicit settings, else category default) */
  function policy(a, catName) {
    var x = (a && a.x) || {}, cost = Math.max(0, num(a && a.val, 0));
    var d = parse(x.__dd) || parse(a && a.at) || new Date();
    var m = x.__dm === 'rb' || x.__dm === 'none' ? x.__dm : 'sl';
    var life = Math.max(1, Math.min(50, num(x.__dl, defLife(catName))));
    var salv = Math.min(cost, Math.max(0, num(x.__dr, 0)));
    return { date: d, method: m, life: life, salvage: salv, cost: cost, custom: x.__dm != null || x.__dl != null || x.__dr != null || x.__dd != null };
  }

  /* Book value at the end of each year of life: closes[0]=cost ... closes[ceil(life)]=residual */
  function closes(p) {
    var n = Math.ceil(p.life), out = [p.cost], i;
    var rb = p.method === 'rb' && p.life >= 3, rate = 2 / p.life;
    for (i = 1; i <= n; i++) {
      var v;
      if (p.method === 'none') v = p.cost;
      else if (i >= p.life) v = p.salvage;
      else if (rb) v = Math.max(p.salvage, p.cost * Math.pow(1 - rate, i));
      else v = p.cost - (p.cost - p.salvage) * (i / p.life);
      out.push(v);
    }
    return out;
  }

  function addYears(d, y) { var r = new Date(d.getTime()); var whole = Math.floor(y); r.setFullYear(r.getFullYear() + whole); r.setDate(r.getDate() + Math.round((y - whole) * 365.25)); return r; }

  /* Full calculation as at `on` (default: today) */
  function calc(a, catName, on) {
    var p = policy(a, catName), now = on || new Date();
    var ageYears = Math.max(0, (now - p.date) / (365.25 * 86400000));
    var C = closes(p), n = C.length - 1, book;
    if (p.method === 'none') book = p.cost;
    else if (ageYears >= p.life) book = p.salvage;
    else { var i = Math.floor(ageYears), f = ageYears - i; book = C[i] + (C[Math.min(i + 1, n)] - C[i]) * f; }
    book = Math.round(book * 100) / 100;
    var yi = Math.min(Math.floor(ageYears) + 1, n), charge = p.method === 'none' ? 0 : (C[yi - 1] - C[yi]);
    if (ageYears >= p.life) charge = 0;
    var sched = [];
    for (var k = 1; k <= n; k++) sched.push({ year: k, on: addYears(p.date, k), open: C[k - 1], charge: C[k - 1] - C[k], close: C[k] });
    return {
      policy: p, cost: p.cost, book: book, accumulated: Math.round((p.cost - book) * 100) / 100,
      pctLeft: p.cost ? book / p.cost * 100 : 100, annual: charge, ageYears: ageYears,
      done: p.method !== 'none' && ageYears >= p.life, endsOn: p.method === 'none' ? null : addYears(p.date, p.life),
      schedule: sched
    };
  }

  window.AMDEP = { calc: calc, policy: policy, defLife: defLife, dstr: dstr, parse: parse,
    book: function (a, cn) { return calc(a, cn).book; },
    METHODS: { sl: 'Straight-line (same amount every year)', rb: 'Reducing balance (bigger drop early on)', none: 'Does not depreciate' } };
})();