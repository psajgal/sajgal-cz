// Home background: three columns (one on phones), each plays its own clips one after another with a cross-fade.
// Clip n belongs to column n mod 3. On phones the one column plays every clip, using the lighter phone files.
// Data saver, a slow connection or reduced motion: the still poster images only.
(function () {
  var bg = document.getElementById("bg");
  if (!bg) return;
  var clips;
  try { clips = JSON.parse(bg.getAttribute("data-clips") || "[]"); } catch (e) { clips = []; }
  var cols = Array.prototype.slice.call(bg.querySelectorAll(".vcol"));
  var phone = window.matchMedia("(max-width:700px)");
  var reduce = window.matchMedia("(prefers-reduced-motion:reduce)");
  var FADE = 0.9, players = [];

  function stillOnly() {
    var c = navigator.connection || {};
    return reduce.matches || c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || "");
  }
  function stop() {
    players.forEach(function (p) { p.dead = true; p.layers.forEach(function (v) { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); }); });
    players = [];
  }
  function player(col, list, isPhone) {
    var p = { dead: false, i: 0, cur: 0, layers: [] };
    for (var k = 0; k < 2; k++) {
      var v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("tabindex", "-1"); v.disablePictureInPicture = true;
      col.appendChild(v); p.layers.push(v);
    }
    function src(n) { var c = list[n % list.length]; return isPhone ? c.m : c.d; }
    function load(layer, n) { layer.src = src(n); layer.load(); }
    function start(layer, n) {
      var q = layer.play(); if (q && q.catch) q.catch(function () {});
      layer.classList.add("on");
    }
    var swapped = false;
    function next() {
      if (p.dead || swapped) return; swapped = true;
      var a = p.layers[p.cur], b = p.layers[1 - p.cur];
      p.i = (p.i + 1) % list.length; p.cur = 1 - p.cur;
      if (!b.getAttribute("src")) load(b, p.i);
      start(b, p.i); a.classList.remove("on");
      setTimeout(function () { if (!p.dead) { a.pause(); a.removeAttribute("src"); a.load(); } }, FADE * 1000 + 100);
      swapped = false; watch(b);
    }
    function watch(v) {
      var queued = false;
      v.ontimeupdate = function () {
        // fetch the next clip only once this one is well under way, so the page never downloads two clips at once
        if (!queued && v.duration && v.currentTime > v.duration * 0.4) { queued = true; var o = p.layers[1 - p.cur]; if (!o.getAttribute("src")) load(o, p.i + 1); }
        if (v.duration && v.duration - v.currentTime <= FADE) { v.ontimeupdate = null; v.onended = null; next(); }
      };
      v.onended = function () { v.onended = null; v.ontimeupdate = null; next(); };
    }
    if (list.length === 1) { var only = p.layers[0]; only.loop = true; only.src = src(0); start(only, 0); return p; }
    load(p.layers[0], 0);
    p.layers[0].oncanplay = function () { p.layers[0].oncanplay = null; start(p.layers[0], 0); watch(p.layers[0]); };
    return p;
  }
  function apply() {
    stop();
    if (!clips.length || stillOnly()) return;
    var isPhone = phone.matches;
    if (isPhone) players.push(player(cols[0], clips, true));
    else cols.forEach(function (col, k) {
      var list = clips.filter(function (_, i) { return i % 3 === k; });
      if (list.length) players.push(player(col, list, false));
    });
  }
  apply();
  if (phone.addEventListener) phone.addEventListener("change", apply);
  document.addEventListener("visibilitychange", function () {
    players.forEach(function (p) { var v = p.layers[p.cur]; if (document.hidden) v.pause(); else { var q = v.play(); if (q && q.catch) q.catch(function () {}); } });
  });
})();
