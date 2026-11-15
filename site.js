// Photo pages: the photos are already in the page (good for search engines).
// This only adds the full-screen viewer when a photo is clicked.
(function () {
  var root = document.getElementById("gallery");
  if (!root) return;
  var links = Array.prototype.slice.call(root.querySelectorAll("a[href]"));
  if (!links.length) return;
  var current = 0, opener = null;

  /* Even columns: spread the photos over 2 to 5 columns so that every column ends at the same height.
     Columns with less to show are a little wider, so nothing is cropped. Without JavaScript the page falls back to plain CSS columns. The viewer keeps the original photo order. */
  (function () {
    if (!root.classList.contains("gallery") || root.classList.contains("rows") || links.length < 3) return;
    var items = links.slice(), built = false, lastN = 0, lastW = 0;
    function ratio(a) {
      var im = a.querySelector("img"), w = im && +im.getAttribute("width"), hh = im && +im.getAttribute("height");
      var m = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(a.style.aspectRatio || "");
      if (a.classList.contains("crop") && m) return +m[2] / +m[1];
      return w && hh ? hh / w : 1.25;
    }
    function colsFor(w) { return w < 640 ? 1 : w < 900 ? 2 : w < 1300 ? 3 : w < 1800 ? 4 : 5; }
    function spread(h) { return Math.max.apply(null, h) - Math.min.apply(null, h); }
    // Try many starting points and keep the most even arrangement. rs are heights in column widths, g is the gap in column widths.
    function assign(n, rs, g) {
      var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      var best = null, bestS = Infinity, tries = rs.length > 40 ? 30 : 150;
      function heights(colOf) { var h = [], cnt = [], c, i; for (c = 0; c < n; c++) { h.push(0); cnt.push(0); } for (i = 0; i < rs.length; i++) { h[colOf[i]] += rs[i]; cnt[colOf[i]]++; } return h.map(function (x, k) { return x + Math.max(0, cnt[k] - 1) * g; }); }
      for (var t = 0; t < tries; t++) {
        var colOf = [], i, c, j;
        for (i = 0; i < rs.length; i++) colOf[i] = i < n ? i : (t === 0 ? -1 : Math.floor(rnd() * n));
        if (t === 0) { var hh = []; for (c = 0; c < n; c++) hh.push(0); for (i = 0; i < rs.length; i++) { c = i < n ? i : hh.indexOf(Math.min.apply(null, hh)); colOf[i] = c; hh[c] += rs[i] + g; } }
        var cur = spread(heights(colOf));
        for (var pass = 0; pass < 60; pass++) {
          var improved = false;
          for (i = n; i < rs.length; i++) for (c = 0; c < n; c++) if (c !== colOf[i]) {
            var old = colOf[i]; colOf[i] = c; var sp = spread(heights(colOf));
            if (sp < cur - 1e-9) { cur = sp; improved = true; } else colOf[i] = old;
          }
          for (i = n; i < rs.length; i++) for (j = i + 1; j < rs.length; j++) if (colOf[i] !== colOf[j]) {
            var ci = colOf[i], cj = colOf[j]; colOf[i] = cj; colOf[j] = ci; var sp2 = spread(heights(colOf));
            if (sp2 < cur - 1e-9) { cur = sp2; improved = true; } else { colOf[i] = ci; colOf[j] = cj; }
          }
          if (!improved) break;
        }
        if (cur < bestS) { bestS = cur; best = colOf.slice(); }
        if (bestS < 0.002) break;
      }
      var hs = heights(best), avg = hs.reduce(function (x, y) { return x + y; }, 0) / n;
      return { colOf: best, rel: spread(hs) / avg };
    }
    function reset() {
      if (!built) return;
      items.forEach(function (a) { root.appendChild(a); });
      Array.prototype.slice.call(root.querySelectorAll(".mcol")).forEach(function (c) { c.remove(); });
      root.classList.remove("mason"); built = false;
    }
    function build() {
      var W = root.clientWidth, n = colsFor(W);
      if (W === lastW && n === lastN) return; lastW = W; lastN = n;
      reset();
      if (n < 2) return;
      var gap = parseFloat(getComputedStyle(root).getPropertyValue("--gap")) || parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 12;
      var gapPx = gap; var tmp = document.createElement("div"); tmp.style.cssText = "position:absolute;visibility:hidden;width:var(--gap)"; root.appendChild(tmp); gapPx = tmp.getBoundingClientRect().width || 12; tmp.remove();
      var rs0 = items.map(ratio), pick = null, cand = [n, n + 1].filter(function (k) { return k >= 2 && k <= 5 && items.length >= k * 1.5; });
      cand.forEach(function (k) {
        var cw = (W - (k - 1) * gapPx) / k, r = assign(k, rs0, gapPx / cw);
        // keep the column count for this screen unless one more column is clearly more even
        if (!pick || (pick.rel > 0.3 && r.rel < pick.rel - 0.08)) pick = { n: k, colOf: r.colOf, rel: r.rel };
      });
      if (!pick) return;
      n = pick.n; var colOf = pick.colOf, cols = [], list = [], c;
      for (c = 0; c < n; c++) { cols.push(document.createElement("div")); cols[c].className = "mcol"; list.push([]); }
      items.forEach(function (a, i) { list[colOf[i]].push(i); cols[colOf[i]].appendChild(a); });
      root.classList.add("mason"); cols.forEach(function (el) { root.appendChild(el); }); built = true;
      // Flush bottoms without cropping: columns with less to show are a little wider, so every column ends at the same height.
      var avail = W - (n - 1) * gapPx, S = list.map(function (ids) { return ids.reduce(function (x, i) { return x + rs0[i]; }, 0); });
      var gaps = list.map(function (ids) { return Math.max(0, ids.length - 1) * gapPx; });
      var inv = S.reduce(function (x, v) { return x + 1 / v; }, 0), Hn = (avail + gaps.reduce(function (x, gp, k) { return x + gp / S[k]; }, 0)) / inv;
      var ws = S.map(function (v, k) { return (Hn - gaps[k]) / v; }), mx = Math.max.apply(null, ws), mn = Math.min.apply(null, ws);
      if (mx / mn <= 1.45) cols.forEach(function (el, k) { el.style.flex = "0 0 " + ws[k].toFixed(2) + "px"; });
    }
    build();
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(build, 120); });
  })();

  var lb = document.createElement("div");
  lb.className = "lb"; lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Photo viewer");
  lb.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button>' +
    '<button class="prev" type="button" aria-label="Previous photo">&#8592;</button>' +
    '<button class="next" type="button" aria-label="Next photo">&#8594;</button>' +
    '<figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  var big = lb.querySelector("img"), cap = lb.querySelector("figcaption");

  function data(i) {
    var a = links[i], im = a.querySelector("img");
    return { src: a.getAttribute("href"), caption: a.dataset.cap || "", alt: im ? im.alt : "" };
  }
  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault(); open(i, a);
    });
  });

  function show(i) {
    current = (i + links.length) % links.length;
    var p = data(current);
    big.src = p.src; big.alt = p.alt;
    cap.textContent = p.caption;
    [1, -1].forEach(function (d) { new Image().src = data((current + d + links.length) % links.length).src; });
  }
  function open(i, from) {
    opener = from; show(i);
    lb.classList.add("open"); document.body.classList.add("noscroll");
    lb.querySelector(".x").focus();
  }
  function close() {
    lb.classList.remove("open"); document.body.classList.remove("noscroll");
    if (opener) opener.focus();
  }
  lb.querySelector(".x").onclick = close;
  lb.querySelector(".prev").onclick = function () { show(current - 1); };
  lb.querySelector(".next").onclick = function () { show(current + 1); };
  lb.addEventListener("click", function (e) { if (e.target === lb || e.target.tagName === "FIGURE") close(); });
  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
  });
  var x0 = null;
  lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });
})();
