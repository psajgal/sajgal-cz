// Even photo columns for the automatic layout. Used by the site (site.js) and by the admin preview.
// sajgalMasonry(root, links, { cols: 0|2..6, phone: 1|2, even: true|false })
// cols 0 = automatic (2 to 5 columns by screen width); even = every column ends at the same height.
(function () {
  function colsFor(W, o) {
    if (W < 640) return o.phone === 2 ? 2 : 1;
    if (o.cols > 0) return W < 800 ? Math.min(o.cols, 2) : W < 1100 ? Math.min(o.cols, 3) : o.cols;
    return W < 900 ? 2 : W < 1300 ? 3 : W < 1800 ? 4 : 5;
  }
  function spread(h) { return Math.max.apply(null, h) - Math.min.apply(null, h); }
  // Spread photos (heights rs, in column widths) over n columns; g = gap in column widths. Returns { colOf, rel }.
  function plan(n, rs, g, greedyOnly) {
    var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var best = null, bestS = Infinity, tries = greedyOnly ? 1 : rs.length > 40 ? 30 : 150;
    function heights(colOf) { var h = [], cnt = [], c, i; for (c = 0; c < n; c++) { h.push(0); cnt.push(0); } for (i = 0; i < rs.length; i++) { h[colOf[i]] += rs[i]; cnt[colOf[i]]++; } return h.map(function (x, k) { return x + Math.max(0, cnt[k] - 1) * g; }); }
    for (var t = 0; t < tries; t++) {
      var colOf = [], i, c, j;
      for (i = 0; i < rs.length; i++) colOf[i] = i < n ? i : (t === 0 ? -1 : Math.floor(rnd() * n));
      if (t === 0) { var hh = []; for (c = 0; c < n; c++) hh.push(0); for (i = 0; i < rs.length; i++) { c = i < n ? i : hh.indexOf(Math.min.apply(null, hh)); colOf[i] = c; hh[c] += rs[i] + g; } }
      var cur = spread(heights(colOf));
      for (var pass = 0; pass < 60 && !greedyOnly; pass++) {
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
  // Same as plan, but the first n photos (one per column) are matched to columns by their own look, not their position,
  // so moving a column in the list only changes the column order and never the grouping.
  function planKeyed(n, rs, g, greedyOnly, keys) {
    if (!keys || rs.length <= n) return plan(n, rs, g, greedyOnly);
    var idx = [], i; for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return rs[a] - rs[b] || (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0); });
    var rs2 = idx.map(function (k) { return rs[k]; }).concat(rs.slice(n)), r = plan(n, rs2, g, greedyOnly), colOf = [];
    for (i = 0; i < rs.length; i++) colOf[i] = i < n ? i : idx[r.colOf[i]];
    return { colOf: colOf, rel: r.rel };
  }
  function ratio(a) {
    var im = a.querySelector("img"), w = im && +im.getAttribute("width"), hh = im && +im.getAttribute("height");
    var m = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(a.style.aspectRatio || "");
    if (a.classList.contains("crop") && m) return +m[2] / +m[1];
    return w && hh ? hh / w : 1.25;
  }
  function run(root, links, opts) {
    opts = opts || {};
    var o = { cols: +opts.cols || 0, phone: +opts.phone === 2 ? 2 : 1, even: opts.even !== false, offs: Array.isArray(opts.offs) ? opts.offs : [] };
    if (!root.classList.contains("gallery") || root.classList.contains("rows") || links.length < 2) return { destroy: function () {} };
    var items = links.slice(), built = false, lastN = 0, lastW = 0, t = null;
    function reset() {
      if (!built) return;
      items.forEach(function (a) { if (a.dataset.mc) { a.style.height = ""; a.style.overflow = ""; var im = a.querySelector("img"); if (im) { im.style.height = ""; im.style.objectFit = ""; } delete a.dataset.mc; } root.appendChild(a); });
      root.style.columns = "";
      Array.prototype.slice.call(root.querySelectorAll(".mcol")).forEach(function (c) { c.remove(); });
      root.classList.remove("mason"); built = false;
    }
    function build() { buildInner(); root.dispatchEvent(new Event("mbuilt")); }
    function buildInner() {
      var W = root.clientWidth, n = colsFor(W, o);
      if (W === lastW && n === lastN) return; lastW = W; lastN = n;
      reset();
      if (n < 2 || items.length < 2) { root.style.columns = "1"; return; }
      n = Math.min(n, items.length);
      var tmp = document.createElement("div"); tmp.style.cssText = "position:absolute;visibility:hidden;width:var(--gap)"; root.appendChild(tmp);
      var gapPx = tmp.getBoundingClientRect().width || 12; tmp.remove();
      var pins = o.cols > 0 && n === o.cols ? items.map(function (a) { var v = a.getAttribute("data-col"); return v !== null && +v >= 0 && +v < n ? +v : -1; }) : null;
      if (pins && pins.every(function (v) { return v < 0; })) pins = null;
      var rs = items.map(ratio), keys = items.map(function (a) { var im = a.querySelector("img"); return im ? (im.getAttribute("src") || "").slice(-60) : ""; }), pick = null;
      var cand = o.cols > 0 || !o.even ? [n] : [n, n + 1].filter(function (k) { return k <= 5 && items.length >= k * 1.5; });
      if (pins) {
        var hh = []; for (var q = 0; q < n; q++) hh.push(0);
        pins.forEach(function (v, i) { if (v >= 0) hh[v] += rs[i] + 0.03; });
        pins.forEach(function (v, i) { if (v < 0) { v = hh.indexOf(Math.min.apply(null, hh)); pins[i] = v; hh[v] += rs[i] + 0.03; } });
        pick = { n: n, colOf: pins }; cand = [];
      }
      cand.forEach(function (k) {
        var cw = (W - (k - 1) * gapPx) / k, r = planKeyed(k, rs, gapPx / cw, !o.even, keys);
        if (!pick || (pick.rel > 0.3 && r.rel < pick.rel - 0.08)) pick = { n: k, colOf: r.colOf };
      });
      if (!pick) return;
      n = pick.n; var colOf = pick.colOf, cols = [], list = [], c;
      for (c = 0; c < n; c++) { cols.push(document.createElement("div")); cols[c].className = "mcol"; list.push([]); }
      items.forEach(function (a, i) { list[colOf[i]].push(i); cols[colOf[i]].appendChild(a); });
      root.classList.add("mason"); cols.forEach(function (el) { root.appendChild(el); }); built = true;
      if (!o.even) {
        // Natural: stagger the column tops so the top and the bottom are both loose, on purpose.
        var cw0 = (W - (n - 1) * gapPx) / n, mean = rs.reduce(function (x, v) { return x + v; }, 0) / rs.length, unit = cw0 * mean, pat = [0, 0.3, 0.1, 0.42, 0.19, 0.36];
        cols.forEach(function (el, k) { var u = o.offs.length && o.offs[k] != null && !isNaN(o.offs[k]) ? o.offs[k] : pat[k % pat.length]; el.style.marginTop = (unit * u).toFixed(1) + "px"; });
        return;
      }
      // Flush bottoms without cropping: columns with less to show are a little wider.
      var avail = W - (n - 1) * gapPx, S = list.map(function (ids) { return ids.reduce(function (x, i) { return x + rs[i]; }, 0); });
      if (S.some(function (v) { return !v; })) return;
      var gaps = list.map(function (ids) { return Math.max(0, ids.length - 1) * gapPx; });
      var inv = S.reduce(function (x, v) { return x + 1 / v; }, 0), Hn = (avail + gaps.reduce(function (x, gp, k) { return x + gp / S[k]; }, 0)) / inv;
      var ws = S.map(function (v, k) { return (Hn - gaps[k]) / v; }), mx = Math.max.apply(null, ws), mn = Math.min.apply(null, ws);
      if (mx / mn > 1.6) { var f = Math.pow(1.6 / (mx / mn), 0.5); var mean = ws.reduce(function (x, v) { return x + v; }, 0) / n; ws = ws.map(function (v) { return v >= mean ? v * (1 - (1 - f) * 0.5) : v * (1 + (1 / f - 1) * 0.5); }); var tot = ws.reduce(function (x, v) { return x + v; }, 0); ws = ws.map(function (v) { return v * avail / tot; }); }
      cols.forEach(function (el, k) { el.style.flex = "0 0 " + ws[k].toFixed(2) + "px"; });
      // Whatever is still uneven: trim the last photo of the taller columns a little so every column ends together.
      var bots = cols.map(function (el) { return el.getBoundingClientRect().height; }), minH = Math.min.apply(null, bots);
      cols.forEach(function (el, k) {
        var ex = bots[k] - minH, a = el.lastElementChild; if (ex < 1 || !a) return;
        var ah = a.getBoundingClientRect().height; if (ex > ah * 0.3) return;
        a.dataset.mc = "1"; a.style.height = (ah - ex) + "px"; a.style.overflow = "hidden";
        var im = a.querySelector("img"); if (im && !a.classList.contains("crop")) { im.style.height = "100%"; im.style.objectFit = "cover"; }
      });
    }
    function onResize() { clearTimeout(t); t = setTimeout(build, 120); }
    build(); window.addEventListener("resize", onResize);
    return { destroy: function () { window.removeEventListener("resize", onResize); reset(); } };
  }
  run.plan = planKeyed; run.keyOf = function (a) { var im = a.querySelector("img"); return im ? (im.getAttribute("src") || "").slice(-60) : ""; }; run.colsFor = colsFor; run.ratio = ratio;
  window.sajgalMasonry = run;
})();
