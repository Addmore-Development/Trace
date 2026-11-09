/* Addmore | Depreciation screens: Add-asset preview, asset record card, reports table */
AMDB.ready.then(function () {
  'use strict';
  var AM = window.AM, A = AM.A, CATS = AM.CATS, esc = AM.esc, R = AM.R, $ = AM.$, toast = AM.toast, pg = document.body.getAttribute('data-page');
  function cname(c) { return CATS[c] ? CATS[c].n : c; }
  function dshort(d) { return d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function schedHtml(c) {
    if (c.policy.method === 'none') return '<p style="color:var(--muted)">This asset is set not to depreciate, so its value stays at the purchase price.</p>';
    var nowYear = Math.min(Math.floor(c.ageYears) + 1, c.schedule.length);
    return '<div class="a-tw"><table class="a-tbl"><thead><tr><th>Year</th><th>Ends</th><th>Starts at</th><th>Loses</th><th>Worth at end</th></tr></thead><tbody>' +
      c.schedule.map(function (s) {
        var cur = s.year === nowYear && !c.done;
        return '<tr' + (cur ? ' class="sel"' : '') + '><td>' + s.year + (cur ? ' <small>(now)</small>' : '') + '</td><td>' + dshort(s.on) + '</td><td class="price">' + R(s.open) + '</td><td class="price">' + R(s.charge) + '</td><td class="price">' + R(s.close) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- Add asset: live preview ---------- */
  if (pg === 'new') {
    var f = $('#fm'), cat = $('#cat'), life = $('#dl'), date = $('#dd'), touched = false;
    if (!f || !life) return;
    date.value = AMDEP.dstr(new Date());
    life.oninput = function () { touched = true; };
    function lifeDefault() { if (!touched) life.value = AMDEP.defLife(cname(cat.value)); }
    function preview() {
      var a = { val: +f.elements.val.value || 0, at: date.value, x: { __dd: date.value, __dm: $('#dm').value, __dl: life.value, __dr: $('#dr').value } };
      var c = AMDEP.calc(a, cname(cat.value));
      $('#dp').innerHTML = !a.val ? '<p style="color:var(--muted)">Enter the purchase price to see how this asset loses value.</p>' :
        '<div class="dep-line"><span>Worth today</span><b>' + R(c.book) + '</b></div><div class="dep-line"><span>Loses per year</span><b>' + (c.policy.method === 'none' ? 'Nothing' : R(c.annual || c.schedule[0].charge)) + '</b></div>' +
        (c.endsOn ? '<div class="dep-line"><span>Fully depreciated</span><b>' + dshort(c.endsOn) + '</b></div>' : '') + schedHtml(c);
    }
    cat.addEventListener('change', function () { lifeDefault(); preview(); });
    [f.elements.val, date, $('#dm'), life, $('#dr')].forEach(function (e) { e.addEventListener('input', preview); e.addEventListener('change', preview); });
    $('#dm').addEventListener('change', function () { life.disabled = $('#dr').disabled = this.value === 'none'; });
    lifeDefault(); preview();
  }

  /* ---------- Asset record: card with schedule and editable settings ---------- */
  if (pg === 'detail') {
    var t = new URLSearchParams(location.search).get('tag'), a = A.filter(function (x) { return x.tag === t; })[0] || A[0], box = $('#dep');
    if (!a || !box) return;
    function draw() {
      var c = AMDEP.calc(a, cname(a.c)), p = c.policy, used = Math.min(100, Math.max(0, 100 - c.pctLeft));
      box.innerHTML = '<div class="a-between"><div><h2>Depreciation</h2><p style="color:var(--muted)">' + esc(AMDEP.METHODS[p.method]) + (p.method !== 'none' ? ', ' + p.life + ' year' + (p.life === 1 ? '' : 's') : '') + (p.custom ? '' : ' (default for ' + esc(cname(a.c)) + ')') + '</p></div></div>' +
        '<div class="a-kpis" style="margin:1rem 0">' +
        [['Worth today', R(c.book)], ['Bought for', R(c.cost)], ['Lost so far', R(c.accumulated)], ['Loses this year', p.method === 'none' || c.done ? 'R\u00a00.00' : R(c.annual)]].map(function (k) { return '<div class="card a-k"><div><span>' + k[0] + '</span><b>' + k[1] + '</b></div></div>'; }).join('') + '</div>' +
        '<div class="dep-bar" title="' + Math.round(used) + '% of the purchase price used up"><i style="width:' + used + '%"></i></div><p style="color:var(--muted);margin:.4rem 0 1rem">' + Math.round(c.pctLeft) + '% of the value left' + (c.done ? '. Fully depreciated.' : c.endsOn ? '. Fully depreciated on ' + dshort(c.endsOn) + '.' : '.') + '</p>' +
        schedHtml(c) +
        '<form class="a-form" id="df" style="margin-top:1.25rem"><h3>Change depreciation settings</h3><div class="dep-grid">' +
        '<label class="a-field">Purchase date<input type="date" name="d" value="' + AMDEP.dstr(p.date) + '"></label>' +
        '<label class="a-field">Method<select name="m">' + Object.keys(AMDEP.METHODS).map(function (k) { return '<option value="' + k + '"' + (k === p.method ? ' selected' : '') + '>' + esc(AMDEP.METHODS[k]) + '</option>'; }).join('') + '</select></label>' +
        '<label class="a-field">Useful life (years)<input type="number" name="l" min="1" max="50" step="1" value="' + p.life + '"></label>' +
        '<label class="a-field">Residual value (R)<input type="number" name="r" min="0" step="0.01" value="' + p.salvage + '"></label></div>' +
        '<button class="btn btn--primary" type="submit">Save settings</button></form>';
      $('#df').onsubmit = function (e) {
        e.preventDefault(); var fd = new FormData(e.target), prev = Object.assign({}, a.x || {});
        a.x = Object.assign({}, a.x, { __dd: fd.get('d'), __dm: fd.get('m'), __dl: String(fd.get('l')), __dr: String(fd.get('r') || 0) });
        AM.save(A, true).then(function (ok) { if (!ok) a.x = prev; else toast('Depreciation updated'); draw(); });
      };
    }
    draw();
  }

  /* ---------- Reports: depreciation by category ---------- */
  if (pg === 'reports') {
    var wrap = document.querySelector('main .container'), by = {}, tc = 0, tb = 0;
    A.forEach(function (a) { var c = AMDEP.calc(a, cname(a.c)), k = by[a.c] || (by[a.c] = { n: 0, cost: 0, book: 0 }); k.n++; k.cost += c.cost; k.book += c.book; tc += c.cost; tb += c.book; });
    var card = document.createElement('div'); card.className = 'card'; card.style.marginTop = '1rem';
    card.innerHTML = '<h2>Depreciation by category</h2><p style="color:var(--muted)">Book value is what each asset is worth today after automatic depreciation.</p><div class="a-tw" style="margin-top:.75rem"><table class="a-tbl"><thead><tr><th>Category</th><th>Assets</th><th>Bought for</th><th>Lost so far</th><th>Book value</th><th>Left</th></tr></thead><tbody>' +
      Object.keys(by).map(function (k) { var v = by[k]; return '<tr><td>' + esc(cname(k)) + '</td><td>' + v.n + '</td><td class="price">' + R(v.cost) + '</td><td class="price">' + R(v.cost - v.book) + '</td><td class="price">' + R(v.book) + '</td><td>' + Math.round(v.cost ? v.book / v.cost * 100 : 100) + '%</td></tr>'; }).join('') +
      '<tr><td><strong>Total</strong></td><td>' + A.length + '</td><td class="price"><strong>' + R(tc) + '</strong></td><td class="price"><strong>' + R(tc - tb) + '</strong></td><td class="price"><strong>' + R(tb) + '</strong></td><td>' + Math.round(tc ? tb / tc * 100 : 100) + '%</td></tr></tbody></table></div>';
    wrap.appendChild(card);
  }
});