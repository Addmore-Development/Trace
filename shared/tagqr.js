/* Addmore | Puts a scannable QR code on the asset record so the printed tag works with the scanner */
AMDB.ready.then(function () {
  'use strict';
  var tg = document.getElementById('tg'); if (!tg || typeof qrcode === 'undefined') return;
  var tag = tg.textContent.trim(); if (!tag) return;
  var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'asset-detail.html?tag=' + encodeURIComponent(tag);
  var q = qrcode(0, 'M'); q.addData(url); q.make();
  var box = document.createElement('div'); box.className = 'tag-qr'; box.setAttribute('role', 'img'); box.setAttribute('aria-label', 'QR code for ' + tag);
  box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  tg.parentNode.insertBefore(box, tg.nextSibling);
});