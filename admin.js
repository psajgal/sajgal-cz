(function () {
  /* ---------- What can be edited ---------- */
  var TABS = [
    { id: "fashion", label: "Selected fashion", kind: "photos", cap: "Show name" },
    { id: "shows", label: "All shows", kind: "entries" },
    { id: "editorial", label: "Editorial", kind: "photos", cap: "Caption" },
    { id: "personal", label: "Personal work", kind: "photos", cap: "Caption" },
    { id: "brands", label: "Commercial", kind: "entries" },
    { id: "videos", label: "Video page", kind: "reels" },
    { id: "landing", label: "Home background", kind: "videos", max: 12 },
    { id: "seo", label: "SEO", kind: "seo" }
  ];
  var PAGES = [
    { key: "home", label: "Home", url: "/" },
    { key: "fashion-shows", label: "Fashion shows (selected work)", url: "/fashion-shows" },
    { key: "fashion", label: "All shows", url: "/fashion" },
    { key: "editorial", label: "Editorial", url: "/editorial" },
    { key: "personal", label: "Personal work", url: "/personal" },
    { key: "commercial", label: "Commercial", url: "/commercial" },
    { key: "video", label: "Video", url: "/video" },
    { key: "contact", label: "Contact", url: "/contact" }
  ];
  // Used when a title or description is left blank. Keep in step with build.mjs.
  var DEFAULTS = {
    "home": ["Petr Šajgal – Fashion photographer", "Czech fashion photographer. Runway, backstage and editorial photography from Mercedes-Benz Prague Fashion Week, Berlin Fashion Week and designer shows."],
    "fashion-shows": ["Fashion show photography – selected work | Petr Šajgal", "Selected runway and backstage photography from Prague Fashion Week, Berlin Fashion Week and designer shows, by Czech fashion photographer Petr Šajgal."],
    "fashion": ["All fashion shows – runway photo archive | Petr Šajgal", "Every fashion show photographed by Petr Šajgal, from Prague to Berlin Fashion Week and designer shows. Open a show for its full set of runway photos."],
    "editorial": ["Fashion editorial photography | Petr Šajgal", "Fashion editorials by Czech photographer Petr Šajgal, shot with designers, models and magazines."],
    "personal": ["Personal photography projects | Petr Šajgal", "Personal work by Czech photographer Petr Šajgal: projects made outside of commissions."],
    "commercial": ["Commercial and campaign photography | Petr Šajgal", "Commercial photography by Petr Šajgal for brands including Kamera, Kido Collective and Converse."],
    "video": ["Fashion video – reels and runway films | Petr Šajgal", "Fashion video by Czech photographer and videographer Petr Šajgal: runway reels and backstage films from Prague Fashion Week, Berlin Fashion Week and magazine work."],
    "contact": ["Contact – Petr Šajgal, fashion photographer", "Get in touch with Czech fashion photographer Petr Šajgal for runway coverage, editorials and commissions. Email info@sajgal.cz."]
  };
  // Shows and brands are the same kind of thing: a page with its own photos, text and web address.
  var ENT = {
    shows: { base: "/fashion", noun: "show", Noun: "Show", plural: "shows", all: "All shows", dir: "images/shows/", tail: "fashion show photos",
      placeholder: "New show, e.g. Berlin Fashion Week AW26", namePh: "e.g. Berlin Fashion Week AW26",
      descNote: "Two or three sentences about the show: who, where, what the collection was about. This text is what helps the page rank. A blank line starts a new paragraph.",
      listHint: "Drag to reorder: the first show appears first on /fashion. Shows without photos stay hidden from visitors and from Google." },
    brands: { base: "/commercial", noun: "brand", Noun: "Brand", plural: "brands", all: "All brands", dir: "images/brands/", tail: "commercial photography",
      placeholder: "New brand, e.g. Converse", namePh: "e.g. Converse",
      descNote: "A few sentences about the project: what the brand is, what you shot, where it ran. Shown on the brand page and helps it rank. A blank line starts a new paragraph.",
      listHint: "Drag to reorder: the first brand appears first on /commercial. Brands without photos stay hidden from visitors and from Google." }
  };
  var KEY = "sajgal-admin", MAX_EDGE = 2200, THUMB_EDGE = 1000, MAX_VIDEO_MB = 25;
  var $ = function (s) { return document.querySelector(s); };
  var cfg = null, tab = "fashion", state = {}, shas = {}, dirty = {}, uid = 0, replacing = null;
  var DEMO = !!window.__DEMO_DRAFT__, view = "text", lay = null, layoutSort = [], layBackup = [], draftN = 0, phoneFor = null, editing = null, deletedSlugs = { shows: [], brands: [] }, sortGrid = null, sortList = null, seoRefresh = [];

  try { cfg = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}

  function meta(id) { return TABS.filter(function (c) { return c.id === id; })[0]; }
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === false || v == null) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e[k] = v;
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* ---------- GitHub API ---------- */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" }, opts.headers || {});
    return fetch("https://api.github.com/repos/" + cfg.repo + path, opts);
  }
  function b64FromText(t) {
    var bytes = new TextEncoder().encode(t), s = "";
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s);
  }
  function textFromB64(b) {
    var s = atob(b.replace(/\n/g, "")), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  function put(path, contentB64, message, sha) {
    var body = { message: message, content: contentB64, branch: cfg.branch };
    if (sha) body.sha = sha;
    return api("/contents/" + path.split("/").map(encodeURIComponent).join("/"), { method: "PUT", body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || r.status); });
        return r.json();
      });
  }

  /* ---------- Data shapes ---------- */
  function photoItem(p) {
    return { id: ++uid, src: p.image || "", thumb: p.thumb || "", caption: p.caption || "", alt: p.alt || "", w: p.w, h: p.h, row: p.row, cols: p.cols, stack: p.stack, al: p.al, ar: p.ar, fx: p.fx, fy: p.fy, z: p.z };
  }
  function videoItem(p) { return { id: ++uid, src: p.video || "", mobile: p.mobile || "", poster: p.poster || "" }; }
  function showModel(s) {
    return {
      key: ++uid, slug: s.slug || "", origSlug: s.slug || "", title: s.title || "", summary: s.summary || "", event: s.event || "", designer: s.designer || "",
      date: s.date || "", location: s.location || "", description: s.description || "", seoTitle: s.seoTitle || "",
      seoDescription: s.seoDescription || "", cover: s.cover || "", photos: (s.photos || []).filter(function (p) { return p.image; }).map(photoItem)
    };
  }
  function parse(id, data) {
    var k = meta(id).kind;
    if (k === "seo") return { site: Object.assign({}, data.site || {}), pages: Object.assign({}, data.pages || {}) };
    var list = Array.isArray(data) ? data : [];
    if (k === "entries") return list.filter(function (s) { return s && s.slug; }).map(showModel);
    if (k === "videos") return list.filter(function (p) { return p.video; }).map(videoItem);
    if (k === "reels") return list.filter(function (v) { return v && v.ig; }).map(function (v) { return { id: ++uid, ig: v.ig, title: v.title || "", date: v.date || "", thumb: v.thumb || "" }; });
    return list.filter(function (p) { return p.image; }).map(photoItem);
  }
  function outPhoto(p) {
    var o = { image: p.src };
    if (p.thumb) o.thumb = p.thumb;
    o.caption = p.caption;
    if (p.alt && p.alt.trim()) o.alt = p.alt.trim();
    if (p.w && p.h) { o.w = p.w; o.h = p.h; }
    if (p.row != null) { o.row = p.row; if (p.cols) o.cols = p.cols; if (p.stack) o.stack = true; if (p.al) o.al = p.al; }
    if (p.ar) { o.ar = p.ar; if (p.fx != null && p.fx !== 50) o.fx = p.fx; if (p.fy != null && p.fy !== 50) o.fy = p.fy; if (p.z > 1) o.z = p.z; }
    return o;
  }
  function serialize(id) {
    var k = meta(id).kind, s = state[id];
    if (k === "seo") {
      var pages = {};
      Object.keys(s.pages).forEach(function (key) {
        var o = {};
        ["title", "description"].forEach(function (f) { if ((s.pages[key][f] || "").trim()) o[f] = s.pages[key][f].trim(); });
        if (Object.keys(o).length) pages[key] = o;
      });
      return { site: s.site, pages: pages };
    }
    if (k === "entries") {
      return s.map(function (x) {
        var base = { slug: x.slug, title: x.title.trim() };
        if (id === "brands") base.summary = x.summary.trim();
        else { base.event = x.event.trim(); base.designer = x.designer.trim(); }
        base.date = x.date.trim();
        if (id === "shows") base.location = x.location.trim();
        base.description = x.description.trim(); base.seoTitle = x.seoTitle.trim(); base.seoDescription = x.seoDescription.trim();
        base.cover = x.cover; base.photos = x.photos.map(outPhoto);
        return base;
      });
    }
    if (k === "reels") return s.map(function (v) { return { ig: v.ig, title: v.title.trim(), date: v.date, thumb: v.thumb }; });
    if (k === "videos") return s.map(function (p) { var o = { video: p.src }; if (p.mobile) o.mobile = p.mobile; if (p.poster) o.poster = p.poster; return o; });
    return s.map(outPhoto);
  }

  /* ---------- Load / save ---------- */
  function load(id) {
    return api("/contents/data/" + id + ".json?ref=" + encodeURIComponent(cfg.branch)).then(function (r) {
      if (r.status === 404) { shas[id] = null; state[id] = parse(id, meta(id).kind === "seo" ? {} : []); return; }
      if (!r.ok) throw new Error(r.status === 401 ? "The token was rejected. Reconnect with a new one." : "Could not load " + id + " (" + r.status + ").");
      return r.json().then(function (j) { shas[id] = j.sha; state[id] = parse(id, JSON.parse(textFromB64(j.content))); });
    });
  }
  function filesToUpload(id) {
    var out = [], lists = [];
    if (meta(id).kind === "entries") lists = state[id].map(function (s) { return s.photos; });
    else if (meta(id).kind !== "seo") lists = [state[id]];
    lists.forEach(function (l) {
      l.forEach(function (p) {
        if (p.blob) out.push({ path: p.src, blob: p.blob, item: p, key: "blob" });
        if (p.thumbBlob) out.push({ path: p.thumb, blob: p.thumbBlob, item: p, key: "thumbBlob" });
        if (p.posterBlob) out.push({ path: p.poster, blob: p.posterBlob, item: p, key: "posterBlob" });
        if (p.mobileBlob) out.push({ path: p.mobile, blob: p.mobileBlob, item: p, key: "mobileBlob" });
      });
    });
    if (id === "seo" && state.seo.ogBlob) out.push({ path: state.seo.site.ogImage, blob: state.seo.ogBlob, item: state.seo, key: "ogBlob" });
    return out;
  }
  function validate(id) {
    if (meta(id).kind === "reels") { for (var q = 0; q < state[id].length; q++) if (!igParse(state[id][q].ig)) return "One video has no valid Instagram link."; return ""; }
    if (meta(id).kind !== "entries") return "";
    var seen = {}, E = ENT[id];
    for (var i = 0; i < state[id].length; i++) {
      var s = state[id][i];
      if (!s.title.trim()) return "A " + E.noun + " has no name. Open it and add one.";
      if (!s.slug) return "“" + s.title + "” has no web address.";
      if (seen[s.slug]) return "Two " + E.plural + " share the address " + E.base + "/" + s.slug + ". Change one.";
      seen[s.slug] = 1;
    }
    return "";
  }
  function redirectLines(id) {
    var lines = [], b = ENT[id].base;
    state[id].forEach(function (s) { if (s.origSlug && s.origSlug !== s.slug) lines.push(b + "/" + s.origSlug + " " + b + "/" + s.slug + " 301"); });
    deletedSlugs[id].forEach(function (sl) { lines.push(b + "/" + sl + " " + b + " 301"); });
    return lines;
  }
  function addRedirects(lines) {
    if (!lines.length) return Promise.resolve();
    return api("/contents/redirects.txt?ref=" + encodeURIComponent(cfg.branch)).then(function (r) {
      if (r.status === 404) return { sha: null, text: "" };
      if (!r.ok) throw new Error("redirects.txt " + r.status);
      return r.json().then(function (j) { return { sha: j.sha, text: textFromB64(j.content) }; });
    }).then(function (cur) {
      var add = lines.filter(function (l) { return cur.text.indexOf(l) === -1; });
      if (!add.length) return;
      var text = cur.text.replace(/\s*$/, "\n") + add.join("\n") + "\n";
      return put("redirects.txt", b64FromText(text), "Add redirects for changed addresses", cur.sha);
    });
  }
  function save() {
    var id = tab, btn = $("#save"), bad = validate(id);
    if (bad) { setStatus(bad, true); return; }
    btn.disabled = true; setStatus("Saving…");
    var files = filesToUpload(id), chain = Promise.resolve(), lines = meta(id).kind === "entries" ? redirectLines(id) : [];
    files.forEach(function (f, n) {
      chain = chain.then(function () {
        setStatus("Uploading file " + (n + 1) + " of " + files.length + "…");
        return blobToB64(f.blob).then(function (b) { return put(f.path.replace(/^\//, ""), b, "Add " + f.path.split("/").pop()); })
          .then(function () { delete f.item[f.key]; });
      });
    });
    chain.then(function () {
      setStatus("Saving…");
      var json = JSON.stringify(serialize(id), null, 2) + "\n";
      return put("data/" + id + ".json", b64FromText(json), "Update " + id, shas[id]);
    }).then(function (j) {
      shas[id] = j.content.sha; dirty[id] = false;
      return addRedirects(lines).then(function () {
        if (meta(id).kind === "entries") { state[id].forEach(function (s) { s.origSlug = s.slug; }); deletedSlugs[id] = []; }
      });
    }).then(function () {
      if (DEMO) { draftN++; noteMsg = ""; setStatus("Saved to draft. Preview it, then publish when you are happy."); }
      else setStatus("Saved. The live site updates in about a minute.");
      layout(); refreshSave();
    }).catch(function (e) {
      setStatus(String(e.message || e).indexOf("does not match") > -1
        ? "The site changed elsewhere. Reload this page and try again." : "Could not save: " + (e.message || e), true);
      btn.disabled = false;
    });
  }

  /* ---------- Files ---------- */
  function slug(s) {
    return String(s).replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "file";
  }
  function stamp() { return Date.now().toString(36) + (uid++ % 100); }
  function scaled(bmp, edge, q) {
    var k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    var c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(function (blob) { res({ blob: blob, w: c.width, h: c.height }); }, "image/jpeg", q); });
  }
  function shrink(file) {
    return createImageBitmap(file).then(function (bmp) {
      return scaled(bmp, MAX_EDGE, 0.88).then(function (full) {
        if (Math.max(full.w, full.h) <= THUMB_EDGE) return { blob: full.blob, w: full.w, h: full.h, thumb: null };
        return scaled(bmp, THUMB_EDGE, 0.8).then(function (t) { return { blob: full.blob, w: full.w, h: full.h, thumb: t.blob }; });
      });
    });
  }
  function cropOg(file) {
    return createImageBitmap(file).then(function (bmp) {
      var c = document.createElement("canvas"); c.width = 1200; c.height = 630;
      var k = Math.max(1200 / bmp.width, 630 / bmp.height), w = bmp.width * k, hh = bmp.height * k;
      c.getContext("2d").drawImage(bmp, (1200 - w) / 2, (630 - hh) * 0.3, w, hh);
      return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.85); });
    });
  }
  function posterOf(blob) {
    return new Promise(function (res) {
      var v = document.createElement("video"), url = URL.createObjectURL(blob), done = false;
      function finish(b) { if (done) return; done = true; URL.revokeObjectURL(url); res(b); }
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      v.onloadeddata = function () { v.currentTime = Math.min(1.5, (v.duration || 2) / 2); };
      v.onseeked = function () {
        var k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(finish, "image/jpeg", 0.72);
      };
      v.onerror = function () { finish(null); };
      setTimeout(function () { finish(null); }, 10000);
    });
  }
  function curItems() { return editing ? editing.photos : state[tab]; }
  function curDir() { return editing ? ENT[tab].dir + (editing.slug || "new") : "images/" + tab; }
  function addPhotos(files) {
    var list = curItems(), dir = curDir(), t = tab;
    var imgs = Array.prototype.filter.call(files, function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
    if (!imgs.length) { setStatus("Use JPG, PNG or WebP files.", true); return; }
    setStatus("Preparing " + imgs.length + " photo" + (imgs.length > 1 ? "s" : "") + "…");
    Promise.all(imgs.map(function (f) {
      return shrink(f).then(function (r) {
        var name = slug(f.name) + "-" + stamp();
        var p = { id: ++uid, src: "/" + dir + "/" + name + ".jpg", thumb: r.thumb ? "/" + dir + "/" + name + "-" + THUMB_EDGE + ".jpg" : "", caption: "", alt: "", w: r.w, h: r.h, blob: r.blob, thumbBlob: r.thumb || undefined, preview: URL.createObjectURL(r.blob) };
        return p;
      });
    })).then(function (made) {
      made.forEach(function (p) { list.push(p); });
      lay = null;
      dirty[t] = true; setStatus("");
      if (t === tab) renderGrid(); refreshSave();
    }).catch(function () { setStatus("One of the files could not be read.", true); });
  }
  function checkVideo(f) {
    if (!/^video\/(mp4|webm)$/.test(f.type)) return "Use MP4 or WebM files.";
    if (f.size > MAX_VIDEO_MB * 1048576) return f.name + " is " + Math.round(f.size / 1048576) + " MB. Export it under " + MAX_VIDEO_MB + " MB first (see the export settings above).";
    return "";
  }
  function newVideo(f) {
    var base = slug(f.name) + "-" + stamp();
    return posterOf(f).then(function (pb) {
      return { src: "/videos/" + base + (f.type === "video/webm" ? ".webm" : ".mp4"), blob: f, preview: URL.createObjectURL(f), poster: pb ? "/images/home/" + base + ".jpg" : "", posterBlob: pb || undefined, posterPreview: pb ? URL.createObjectURL(pb) : "" };
    });
  }
  function addVideos(files, m) {
    var list = state[tab], room = m.max - list.length;
    if (room <= 0) { setStatus("The home page can rotate up to " + m.max + " videos. Remove one first, or use Replace on a video.", true); return; }
    var err = "", ok = [];
    Array.prototype.slice.call(files, 0, room).forEach(function (f) { var e = checkVideo(f); if (e) err = e; else ok.push(f); });
    if (!ok.length) { setStatus(err, !!err); return; }
    setStatus("Preparing video…");
    Promise.all(ok.map(newVideo)).then(function (made) {
      made.forEach(function (v) { v.id = ++uid; list.push(v); });
      dirty[tab] = true; renderGrid(); refreshSave(); setStatus(err, !!err);
    });
  }
  function addFiles(files) {
    var m = meta(tab);
    if (m.kind === "videos") addVideos(files, m);
    else if (m.kind === "photos" || editing) addPhotos(files);
  }

  /* ---------- UI helpers ---------- */
  function setStatus(t, err) { var s = $("#status"); s.textContent = t; s.className = "msg" + (err ? " err" : ""); }
  function refreshSave() { $("#save").disabled = !dirty[tab]; }
  function markDirty() { dirty[tab] = true; refreshSave(); setStatus(""); }
  function counter(len, lo, hi) {
    var ok = len >= lo && len <= hi;
    return { text: len + " characters (aim for " + lo + " to " + hi + ")", cls: "ctr " + (ok ? "good" : len === 0 ? "" : "warn") };
  }
  function textField(label, value, onInput, opts) {
    opts = opts || {};
    var input = h(opts.area ? "textarea" : "input", { type: opts.area ? false : (opts.type || "text"), rows: opts.rows, placeholder: opts.placeholder || "", autocomplete: "off", readonly: opts.readonly ? "" : false });
    input.value = value || "";
    input.oninput = function () { onInput(input.value); };
    var kids = [h("span", { text: label }), input];
    if (opts.note) kids.push(h("small", { class: "note", text: opts.note }));
    var lab = h("label", { class: "fld" + (opts.wide ? " wide" : "") }, kids);
    lab.input = input;
    return lab;
  }
  function snippet(urlText, getTitle, getDesc) {
    var u = h("div", { class: "u" }), t = h("div", { class: "t" }), d = h("div", { class: "d" });
    var box = h("div", { class: "snip", "aria-label": "How this may look in Google" }, [u, t, d]);
    function clip(s, n) { return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }
    box.update = function () { u.textContent = urlText; t.textContent = clip(getTitle(), 60); d.textContent = clip(getDesc(), 155); };
    box.update();
    return box;
  }


  /* ---------- Layout editor (rows of photos side by side) ---------- */
  var PRESETS = [
    { id: "12", label: "One wide photo", w: [12] },
    { id: "6-6", label: "Two equal", w: [6, 6] },
    { id: "5-7", label: "Narrow + wide", w: [5, 7] },
    { id: "7-5", label: "Wide + narrow", w: [7, 5] },
    { id: "4-8", label: "Small + large", w: [4, 8] },
    { id: "8-4", label: "Large + small", w: [8, 4] },
    { id: "4-4-4", label: "Three equal", w: [4, 4, 4] }
  ];
  var SHAPES = [["", "Original"], ["1/1", "1:1"], ["4/5", "4:5"], ["3/4", "3:4"], ["2/3", "2:3"], ["5/4", "5:4"], ["4/3", "4:3"], ["3/2", "3:2"], ["16/9", "16:9"], ["3/1", "3:1"]];
  function layoutOn(list) { return list.some(function (p) { return p.row != null; }); }
  function toRows(list) {
    var rows = [], cur = null, last = null, pend = [];
    list.forEach(function (p) {
      if (p.row == null) { pend.push(p); return; }
      if (!cur || p.row !== last) { cur = { cols: [], al: p.al || "" }; rows.push(cur); last = p.row; }
      if (p.stack && cur.cols.length) cur.cols[cur.cols.length - 1].items.push(p);
      else cur.cols.push({ w: p.cols || 6, items: [p] });
    });
    for (var i = 0; i < pend.length; i += 2) {
      var pair = pend.slice(i, i + 2);
      rows.push({ al: "", cols: pair.map(function (p) { return { w: pair.length === 1 ? 12 : 6, items: [p] }; }) });
    }
    return rows;
  }
  function writeRows(list, rows) {
    var out = [], n = 0;
    rows.forEach(function (r) {
      var cols = r.cols.filter(function (c) { return c.items.length; });
      if (!cols.length) return;
      n++;
      cols.forEach(function (c, ci) {
        c.items.forEach(function (p, k) {
          p.row = n;
          if (k === 0) { p.cols = c.w; delete p.stack; } else { delete p.cols; p.stack = true; }
          if (ci === 0 && k === 0 && r.al) p.al = r.al; else delete p.al;
          out.push(p);
        });
      });
    });
    list.length = 0; out.forEach(function (p) { list.push(p); });
  }
  function clearLayout(list) {
    layBackup = list.map(function (p) { return { p: p, row: p.row, cols: p.cols, stack: p.stack, al: p.al }; });
    list.forEach(function (p) { delete p.row; delete p.cols; delete p.stack; delete p.al; });
  }
  function rowSum(r) { return r.cols.reduce(function (a, c) { return a + c.w; }, 0); }
  function presetOf(r) {
    var key = r.cols.map(function (c) { return c.w; }).join("-");
    return PRESETS.filter(function (p) { return p.id === key; })[0] || null;
  }
  function setPreset(r, preset) {
    var n = preset.w.length;
    while (r.cols.length > n) { var x = r.cols.pop(); x.items.forEach(function (p) { r.cols[n - 1].items.push(p); }); }
    while (r.cols.length < n) r.cols.push({ w: 6, items: [] });
    preset.w.forEach(function (w, i) { r.cols[i].w = w; });
    r.al = "";
  }
  function readDom(box) {
    var byId = {}, list = curItems();
    list.forEach(function (p) { byId[p.id] = p; });
    var rows = [];
    Array.prototype.forEach.call(box.querySelectorAll(".lrow"), function (rowEl) {
      var cols = Array.prototype.map.call(rowEl.querySelectorAll(".lcol"), function (colEl) {
        return { w: +colEl.dataset.w, items: Array.prototype.map.call(colEl.querySelectorAll(".lph"), function (el) { return byId[+el.dataset.id]; }).filter(Boolean) };
      });
      var has = cols.some(function (c) { return c.items.length; });
      if (rowEl.classList.contains("ghost") && !has) return;
      rows.push({ cols: cols, al: rowEl.dataset.al || "" });
    });
    lay.rows = rows;
  }
  function layChanged(box, redraw) {
    readDom(box); writeRows(curItems(), lay.rows); markDirty();
    if (redraw) renderLayout();
  }
  function resizeCol(box, ri, ci, delta) {
    readDom(box);
    var r = lay.rows[ri]; if (!r) return;
    var c = r.cols[ci], nw = c.w + delta;
    if (nw < 2 || nw > 12) return;
    if (delta > 0 && rowSum(r) + delta > 12) {
      var nb = r.cols[ci + 1] || r.cols[ci - 1];
      if (!nb || nb.w - delta < 2) return;
      nb.w -= delta;
    }
    c.w = nw; writeRows(curItems(), lay.rows); markDirty(); renderLayout();
  }

  // How a cropped photo is drawn: a frame of the chosen shape, the photo inside it zoomed and moved.
  function cropOf(p) {
    if (!p.ar) return null;
    var m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(p.ar); if (!m) return null;
    var fx = p.fx == null ? 50 : p.fx, fy = p.fy == null ? 50 : p.fy, z = Math.max(1, Math.min(4, p.z || 1));
    return { ar: m[1] + " / " + m[2], css: "position:absolute;width:" + (z * 100) + "%;height:" + (z * 100) + "%;max-width:none;left:-" + ((z - 1) * fx).toFixed(2) + "%;top:-" + ((z - 1) * fy).toFixed(2) + "%;object-fit:cover;object-position:" + fx + "% " + fy + "%" };
  }
  function drawPhoto(frame, p) {
    var el = mediaEl(p, false), c = cropOf(p);
    frame.style.aspectRatio = c ? c.ar : (p.w && p.h ? p.w + " / " + p.h : "");
    if (c) el.style.cssText = c.css;
    frame.appendChild(el);
    return el;
  }
  function openCrop(p) {
    var ar = p.ar || "", fx = p.fx == null ? 50 : p.fx, fy = p.fy == null ? 50 : p.fy, z = p.z || 1;
    var natAR = p.w && p.h ? p.w / p.h : 1;
    var ov = h("div", { class: "cropmod", role: "dialog", "aria-label": "Crop photo" });
    var panel = h("div", { class: "cm-panel" });
    var frame = h("div", { class: "cm-frame" }), img = null;
    var shapes = h("div", { class: "cm-shapes" }), zoom = h("input", { type: "range", min: "1", max: "3", step: "0.05", "aria-label": "Zoom" });
    zoom.value = z;
    function ratio() { var m = ar && /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(ar); return m ? (+m[1]) / (+m[2]) : natAR; }
    function draw() {
      frame.innerHTML = "";
      var tmp = { w: p.w, h: p.h, src: p.src, thumb: "", preview: p.preview, ar: ar || (z > 1 ? w2ar() : ""), fx: fx, fy: fy, z: z };
      img = drawPhoto(frame, tmp);
      frame.style.aspectRatio = ar ? ar.replace("/", " / ") : String(natAR);
      frame.style.width = "min(100%, 360px, " + (50 * ratio()).toFixed(1) + "vh)";
      Array.prototype.forEach.call(shapes.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.ar === ar)); });
    }
    function w2ar() { return p.w + "/" + p.h; }
    SHAPES.forEach(function (sh) { shapes.appendChild(h("button", { type: "button", "data-ar": sh[0], text: sh[1], onclick: function () { ar = sh[0]; draw(); } })); });
    zoom.oninput = function () { z = +zoom.value; draw(); };
    var drag = null;
    frame.onpointerdown = function (e) { drag = { x: e.clientX, y: e.clientY, fx: fx, fy: fy }; frame.setPointerCapture(e.pointerId); };
    frame.onpointermove = function (e) {
      if (!drag) return;
      var W = frame.clientWidth, H = frame.clientHeight, r = ratio(), s0 = Math.max(W / (natAR * 1000), H / 1000), iw = natAR * 1000 * s0 * z, ih = 1000 * s0 * z;
      var ox = iw - W, oy = ih - H;
      if (ox > 1) fx = Math.max(0, Math.min(100, drag.fx - (e.clientX - drag.x) / ox * 100));
      if (oy > 1) fy = Math.max(0, Math.min(100, drag.fy - (e.clientY - drag.y) / oy * 100));
      fx = Math.round(fx * 10) / 10; fy = Math.round(fy * 10) / 10; draw();
    };
    frame.onpointerup = frame.onpointercancel = function () { drag = null; };
    var close = function () { ov.remove(); };
    panel.appendChild(h("h3", { text: "Crop photo" }));
    panel.appendChild(h("p", { class: "note", text: "Choose a shape, then drag the photo to choose what stays in view. The original file is not changed, and the enlarged view still shows the whole photo." }));
    panel.appendChild(shapes); panel.appendChild(frame);
    panel.appendChild(h("label", { class: "cm-zoom" }, [h("span", { text: "Zoom" }), zoom]));
    panel.appendChild(h("div", { class: "cm-actions" }, [
      h("button", { type: "button", class: "btn primary", text: "Apply", onclick: function () {
        if (!ar && z <= 1) { delete p.ar; delete p.fx; delete p.fy; delete p.z; }
        else { p.ar = ar || w2ar(); p.fx = fx; p.fy = fy; if (z > 1) p.z = Math.round(z * 100) / 100; else delete p.z; }
        close(); markDirty(); if (lay || view === "layout") renderLayout();
      } }),
      h("button", { type: "button", class: "btn", text: "Cancel", onclick: close }),
      h("button", { type: "button", class: "link", text: "Reset crop", onclick: function () { ar = ""; fx = 50; fy = 50; z = 1; zoom.value = 1; draw(); } })
    ]));
    ov.appendChild(panel); document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) close(); };
    draw();
  }

  function ghostRow(last) {
    var col = h("div", { class: "lcol", "data-w": 12, style: "--w:12" });
    col.appendChild(h("span", { class: "ldrop", text: "Drop here to start a new row" }));
    return h("div", { class: "lrow ghost" + (last ? " last" : ""), "data-al": "" }, [h("div", { class: "lcols" }, [col])]);
  }
  function renderLayout() {
    var box = $("#lay"), list = curItems();
    box.innerHTML = ""; layoutSort.forEach(function (x) { x.destroy(); }); layoutSort = [];
    if (!layoutOn(list)) {
      lay = null;
      box.appendChild(h("div", { class: "lay-intro" }, [
        h("h2", { text: "Automatic columns" }),
        h("p", { text: "Photos flow into columns in the order you set. To place photos yourself, side by side and in rows like on your old Google Sites page, start a custom layout." }),
        h("button", { type: "button", class: "btn primary", text: "Start custom layout", onclick: function () {
          if (!list.length) { setStatus("Add photos first.", true); return; }
          if (layBackup.length && layBackup.length === list.length && layBackup.every(function (b) { return list.indexOf(b.p) > -1; })) {
            layBackup.forEach(function (b) { if (b.row != null) { b.p.row = b.row; b.p.cols = b.cols; b.p.stack = b.stack; if (b.al) b.p.al = b.al; } });
          }
          if (!layoutOn(list)) { lay = { rows: toRows(list) }; writeRows(list, lay.rows); }
          markDirty(); renderLayout();
        } })
      ]));
      return;
    }
    if (!lay) lay = { rows: toRows(list) };
    writeRows(list, lay.rows);
    box.appendChild(h("p", { class: "hint", text: "Drag a photo onto the left or right edge of another to put them side by side, onto the top or bottom half to stack them, or between rows to start a new row. Rows re-balance on their own. Use − and + to resize a box, ✂ to crop. Visitors on phones always see one column." }));
    var rowsEl = h("div", { class: "lrows" });
    lay.rows.forEach(function (r, ri) {
      var preset = presetOf(r), sum = rowSum(r);
      var sel = h("select", { "aria-label": "Row shape" });
      PRESETS.forEach(function (p) { var o = h("option", { value: p.id, text: p.label }); if (preset && preset.id === p.id) o.selected = true; sel.appendChild(o); });
      if (!preset) sel.insertBefore(h("option", { value: "custom", text: "Custom widths", selected: "" }), sel.firstChild);
      sel.onchange = function () {
        var p = PRESETS.filter(function (x) { return x.id === sel.value; })[0]; if (!p) return;
        readDom(box); setPreset(lay.rows[ri], p); writeRows(curItems(), lay.rows); markDirty(); renderLayout();
      };
      var empty = r.cols.every(function (c) { return !c.items.length; });
      var bar = h("div", { class: "lbar" }, [h("span", { class: "lgrip", "aria-hidden": "true", text: "⋮⋮", title: "Drag to move the row" }), h("span", { class: "lno", text: "Row " + (ri + 1) }), sel]);
      if (sum < 12) {
        var al = h("select", { "aria-label": "Row position" });
        [["", "Align left"], ["center", "Center"], ["end", "Align right"]].forEach(function (o) { var op = h("option", { value: o[0], text: o[1] }); if ((r.al || "") === o[0]) op.selected = true; al.appendChild(op); });
        al.onchange = function () { readDom(box); lay.rows[ri].al = al.value; writeRows(curItems(), lay.rows); markDirty(); renderLayout(); };
        bar.appendChild(al);
      }
      if (empty) bar.appendChild(h("button", { type: "button", class: "link danger", text: "Remove row", onclick: function () { readDom(box); lay.rows.splice(ri, 1); writeRows(curItems(), lay.rows); markDirty(); renderLayout(); } }));
      var cols = h("div", { class: "lcols", style: r.al === "center" ? "justify-content:center" : r.al === "end" ? "justify-content:flex-end" : "" });
      r.cols.forEach(function (c, ci) {
        var col = h("div", { class: "lcol", "data-w": c.w, style: "--w:" + c.w });
        col.appendChild(h("div", { class: "lcw" }, [
          h("button", { type: "button", "aria-label": "Narrower", text: "−", onclick: function () { resizeCol(box, ri, ci, -1); } }),
          h("span", { text: c.w + "/12" }),
          h("button", { type: "button", "aria-label": "Wider", text: "+", onclick: function () { resizeCol(box, ri, ci, 1); } })
        ]));
        c.items.forEach(function (p) {
          var ph = h("div", { class: "lph", "data-id": p.id, title: p.caption || p.alt || "" });
          drawPhoto(ph, p);
          ph.appendChild(h("button", { type: "button", class: "cropbtn", "aria-label": "Crop photo", title: "Crop", text: "✂", onclick: function () { openCrop(p); } }));
          if (p.ar) ph.appendChild(h("span", { class: "cropped", text: p.ar.replace("/", ":") }));
          ph.appendChild(h("button", { type: "button", class: "del", "aria-label": "Remove photo", text: "×", onclick: function () {
            var l = curItems(), i = l.indexOf(p); if (i > -1) l.splice(i, 1);
            readDom(box); lay.rows.forEach(function (rr) { rr.cols.forEach(function (cc) { cc.items = cc.items.filter(function (q) { return q !== p; }); }); });
            writeRows(curItems(), lay.rows); markDirty(); renderLayout();
          } }));
          col.appendChild(ph);
        });
        if (!c.items.length) col.appendChild(h("span", { class: "ldrop", text: "Drop a photo here" }));
        cols.appendChild(col);
      });
      var rowEl = h("div", { class: "lrow", "data-al": r.al || "" }, [bar, cols]);
      rowEl._row = r;
      Array.prototype.forEach.call(cols.querySelectorAll(".lcol"), function (ce, k) { ce._col = r.cols[k]; });
      Array.prototype.forEach.call(cols.querySelectorAll(".lph"), function (pe) { pe._p = list.filter(function (q) { return q.id === +pe.dataset.id; })[0]; pe.onpointerdown = function (e) { startDnD(e, { kind: "photo", p: pe._p, el: pe }); }; });
      bar.querySelector(".lgrip").onpointerdown = function (e) { startDnD(e, { kind: "row", row: r, el: rowEl }); };
      rowsEl.appendChild(rowEl);
    });
    rowsEl.appendChild(ghostRow(true));
    box.appendChild(rowsEl);
    box.appendChild(h("div", { class: "lfoot" }, [
      h("button", { type: "button", class: "btn", text: "+ Add row", onclick: function () { readDom(box); lay.rows.push({ al: "", cols: [{ w: 6, items: [] }, { w: 6, items: [] }] }); markDirty(); renderLayout(); } }),
      backAuto(list)
    ]));
  }

  /* ---------- Drag and drop in the layout view ---------- */
  function equalize(r) {
    var n = r.cols.length; if (n < 1 || n > 4) return;
    r.cols.forEach(function (c) { c.w = 12 / n; }); r.al = "";
  }
  function findPos(p) {
    for (var i = 0; i < lay.rows.length; i++) for (var j = 0; j < lay.rows[i].cols.length; j++) {
      var c = lay.rows[i].cols[j], k = c.items.indexOf(p);
      if (k > -1) return { row: lay.rows[i], col: c, k: k };
    }
    return null;
  }
  function hit(x, y, pl) {
    var box = $("#lay"), rowsEl = box.querySelector(".lrows"); if (!rowsEl) return null;
    var rr = rowsEl.getBoundingClientRect();
    if (x < rr.left - 30 || x > rr.right + 30) return null;
    var rowEls = Array.prototype.slice.call(rowsEl.querySelectorAll(".lrow:not(.ghost)")), ghost = rowsEl.querySelector(".lrow.ghost");
    var gr = ghost ? ghost.getBoundingClientRect() : null, n = rowEls.length, BAND = 30;
    var rects = rowEls.map(function (e) { return e.querySelector(".lcols").getBoundingClientRect(); });
    var outer = rowEls.map(function (e) { return e.getBoundingClientRect(); });
    for (var i = 0; i <= n; i++) {
      var top = i === 0 ? (n ? rects[0].top - 90 : (gr ? gr.top - 20 : y)) : rects[i - 1].bottom - BAND;
      var bot = i === n ? (gr ? gr.bottom + 40 : (n ? rects[n - 1].bottom + 60 : y + 1)) : rects[i].top + BAND;
      if (y >= top && y <= bot) {
        var line = i === 0 ? (n ? outer[0].top - 8 : (gr ? gr.top : y)) : i === n ? (gr ? gr.top - 8 : outer[n - 1].bottom + 8) : outer[i].top - 8;
        if (pl.kind === "row") { var me = lay.rows.indexOf(pl.row); if (i === me || i === me + 1) return null; }
        return { t: "row", index: i, line: line, left: rr.left, width: rr.width };
      }
    }
    if (pl.kind === "row") return null;
    for (i = 0; i < n; i++) {
      var R = rects[i];
      if (y < R.top || y > R.bottom) continue;
      var cols = Array.prototype.slice.call(rowEls[i].querySelectorAll(".lcol")), rm = rowEls[i]._row, forced = "", col = null;
      cols.forEach(function (c) { var r = c.getBoundingClientRect(); if (!col && x >= r.left - 4 && x <= r.right + 4) col = c; });
      if (!col) { col = x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1]; forced = x < cols[0].getBoundingClientRect().left ? "l" : "r"; }
      var cr = col.getBoundingClientRect(), items = Array.prototype.slice.call(col.querySelectorAll(".lph"));
      if (!items.length) return { t: "into", col: col._col, rect: cr };
      var it = null, best = 1e9;
      items.forEach(function (e) { var r = e.getBoundingClientRect(), d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (d < best) { best = d; it = e; } });
      var ir = it.getBoundingClientRect(), fx = (x - ir.left) / ir.width;
      var canSide = rm.cols.length < 4;
      if (it._p === pl.p) return null;
      if (canSide && (forced || fx < .25 || fx > .75)) return { t: "side", row: rm, col: col._col, after: forced ? forced === "r" : fx > .5, rect: cr };
      return { t: "stack", col: col._col, ref: it._p, after: y > ir.top + ir.height / 2, rect: ir };
    }
    return null;
  }
  function applyDrop(pl, tg) {
    var rows = lay.rows;
    if (pl.kind === "row") {
      var from = rows.indexOf(pl.row); rows.splice(from, 1);
      var at = tg.index > from ? tg.index - 1 : tg.index; rows.splice(at, 0, pl.row);
    } else {
      var pos = findPos(pl.p), eq = [];
      if (!pos) return;
      var srcRowIdx = rows.indexOf(pos.row), srcRowGone = false;
      pos.col.items.splice(pos.k, 1);
      var srcGone = false;
      if (!pos.col.items.length && !(tg.t === "into" && tg.col === pos.col)) {
        pos.row.cols.splice(pos.row.cols.indexOf(pos.col), 1); srcGone = true;
        if (!pos.row.cols.length) { rows.splice(srcRowIdx, 1); srcRowGone = true; } else eq.push(pos.row);
      }
      if (tg.t === "into") tg.col.items.push(pl.p);
      else if (tg.t === "stack") { var ci = tg.col.items.indexOf(tg.ref); tg.col.items.splice(ci + (tg.after ? 1 : 0), 0, pl.p); }
      else if (tg.t === "side") { var k2 = tg.row.cols.indexOf(tg.col); tg.row.cols.splice(k2 + (tg.after ? 1 : 0), 0, { w: 6, items: [pl.p] }); eq.push(tg.row); }
      else if (tg.t === "row") {
        var nr = { al: "", cols: [{ w: 12, items: [pl.p] }] };
        var idx = tg.index - (srcRowGone && srcRowIdx < tg.index ? 1 : 0);
        rows.splice(Math.max(0, Math.min(idx, rows.length)), 0, nr);
      }
      eq.forEach(equalize);
    }
    writeRows(curItems(), rows); markDirty(); renderLayout();
  }
  function startDnD(e, pl) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest && e.target.closest("button,select,input")) return;
    var box = $("#lay"), sx = e.clientX, sy = e.clientY, on = false, ghost = null, ind = null, tg = null, raf = 0, px = sx, py = sy;
    function begin() {
      on = true; box.classList.add("dragging"); pl.el.classList.add("lifting"); document.body.classList.add("dnd");
      if (pl.kind === "photo") { ghost = pl.el.cloneNode(true); ghost.className = "dnd-ghost"; ghost.style.width = Math.min(150, pl.el.offsetWidth) + "px"; Array.prototype.forEach.call(ghost.querySelectorAll("button,span"), function (x) { x.remove(); }); }
      else ghost = h("div", { class: "dnd-ghost row", text: "Row " + (lay.rows.indexOf(pl.row) + 1) });
      document.body.appendChild(ghost);
      ind = h("div", { class: "dz" }); box.appendChild(ind); loop();
    }
    function show() {
      var br = box.getBoundingClientRect();
      if (!tg) { ind.style.display = "none"; return; }
      ind.style.display = "block"; ind.className = "dz " + tg.t; ind.textContent = "";
      var l, t, w, hh;
      if (tg.t === "row") { l = tg.left - br.left; t = tg.line - br.top - 4; w = tg.width; hh = 8; ind.textContent = "New row"; }
      else if (tg.t === "side") { var r = tg.rect; l = (tg.after ? r.right + 3 : r.left - 9) - br.left; t = r.top - br.top; w = 8; hh = r.height; }
      else if (tg.t === "stack") { var q = tg.rect; l = q.left - br.left; t = (tg.after ? q.bottom : q.top) - br.top - 4; w = q.width; hh = 8; }
      else { var c = tg.rect; l = c.left - br.left; t = c.top - br.top; w = c.width; hh = c.height; }
      ind.style.left = l + "px"; ind.style.top = t + "px"; ind.style.width = w + "px"; ind.style.height = hh + "px";
    }
    function loop() {
      if (!on) return;
      var vh = window.innerHeight, dy = py < 70 ? -Math.ceil((70 - py) / 5) : py > vh - 70 ? Math.ceil((py - (vh - 70)) / 5) : 0;
      if (dy) { window.scrollBy(0, dy); tg = hit(px, py, pl); show(); }
      raf = requestAnimationFrame(loop);
    }
    function move(ev) {
      px = ev.clientX; py = ev.clientY;
      if (!on) { if (Math.abs(px - sx) + Math.abs(py - sy) < 6) return; begin(); }
      ghost.style.transform = "translate(" + (px + 14) + "px," + (py + 14) + "px)";
      tg = hit(px, py, pl); show();
    }
    function done(ev, cancel) {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", can); window.removeEventListener("keydown", key);
      cancelAnimationFrame(raf);
      if (!on) return;
      on = false; box.classList.remove("dragging"); pl.el.classList.remove("lifting"); document.body.classList.remove("dnd");
      ghost.remove(); ind.remove();
      if (!cancel && tg) applyDrop(pl, tg);
    }
    function up(ev) { done(ev, false); }
    function can(ev) { done(ev, true); }
    function key(ev) { if (ev.key === "Escape") done(ev, true); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", can); window.addEventListener("keydown", key);
    e.preventDefault();
  }

  function backAuto(list) {
    var armed = false, t = null;
    var b = h("button", { type: "button", class: "link", text: "Back to automatic columns" });
    b.onclick = function () {
      if (!armed) { armed = true; b.textContent = "Click again: your row layout is removed"; t = setTimeout(function () { armed = false; b.textContent = "Back to automatic columns"; }, 4000); return; }
      clearTimeout(t); clearLayout(list); lay = null; markDirty(); renderLayout();
    };
    return b;
  }
  function renderViewToggle() {
    var box = $("#viewtoggle"), m = meta(tab);
    var ok = m.kind === "photos" || (m.kind === "entries" && !!editing);
    box.hidden = !ok; box.innerHTML = "";
    if (!ok) return;
    [["text", "Photos and text"], ["layout", "Layout"]].forEach(function (v) {
      box.appendChild(h("button", { type: "button", "aria-pressed": String(view === v[0]), text: v[1], onclick: function () {
        if (view === v[0]) return; view = v[0]; lay = null; renderGrid(); renderViewToggle(); applyHints();
      } }));
    });
  }

  /* ---------- Draft, preview and publish (demo) ---------- */
  var publishing = false, confirmPub = false, noteMsg = "";
  function pageCss() {
    var out = "";
    Array.prototype.forEach.call(document.styleSheets, function (sh) {
      try {
        var t = Array.prototype.map.call(sh.cssRules, function (r) { return r.cssText; }).join("\n");
        if (t.indexOf(".gallery") > -1 && t.indexOf("--gap") > -1) out += t;
      } catch (e) {}
    });
    return out;
  }
  function escA(t) { return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
  function previewDoc() {
    var m = meta(tab), list, name;
    if (editing) { list = editing.photos; name = ENT[tab].base + "/" + editing.slug; }
    else if (m.kind === "photos") { list = state[tab]; name = "/" + (tab === "fashion" ? "fashion-shows" : tab); }
    else { list = state.personal; name = "/personal"; }
    function link(p) {
      var c = cropOf(p), src = p.preview || p.src.replace(/^\//, "");
      return '<a href="#"' + (c ? ' class="crop" style="aspect-ratio:' + c.ar + '"' : "") + '><img src="' + escA(src) + '" alt=""' + (c ? ' style="' + c.css + '"' : "") + "></a>";
    }
    var g;
    if (layoutOn(list)) {
      g = '<div class="gallery rows">' + toRows(list).map(function (r) {
        return '<div class="row"' + (r.al === "center" ? ' style="--j:center"' : r.al === "end" ? ' style="--j:flex-end"' : "") + ">" + r.cols.map(function (c) { return '<div class="col" style="--w:' + c.w + '">' + c.items.map(link).join("") + "</div>"; }).join("") + "</div>";
      }).join("") + "</div>";
    } else g = '<div class="gallery">' + list.map(link).join("") + "</div>";
    var arrow = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10H3M8 5l-5 5 5 5"/></svg>';
    return { name: name, html: '<!doctype html><html><head><meta charset="utf-8"><base href="' + escA(location.href) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + pageCss() + '</style></head><body><a class="back" href="#">' + arrow + '</a><main class="gut">' + g + "</main></body></html>" };
  }
  function openPreview() {
    var pv = previewDoc(), mode = "desktop";
    var ov = h("div", { class: "pv-over", role: "dialog", "aria-label": "Draft preview" });
    var close = function () { window.removeEventListener("resize", fit); ov.remove(); };
    var seg = h("div", { class: "seg pv-seg" });
    var url = h("span", { class: "pv-url", text: "https://draft.sajgal.pages.dev" + pv.name });
    ov.appendChild(h("div", { class: "pv-chrome" }, [h("span", { class: "pv-dots", text: "● ● ●" }), url, seg, h("button", { type: "button", class: "btn", text: "Close preview", onclick: close })]));
    ov.appendChild(h("div", { class: "pv-note", text: "This is your draft at real page size, scaled to fit your screen. Only people with this address can see it, and Google is told not to index it." }));
    var stage = h("div", { class: "pv-stage" }), frame = h("iframe", { class: "pv-iframe", title: "Draft page", sandbox: "allow-same-origin" });
    frame.srcdoc = pv.html; stage.appendChild(frame); ov.appendChild(stage);
    [["desktop", "Desktop"], ["phone", "Phone"]].forEach(function (x) {
      seg.appendChild(h("button", { type: "button", "data-m": x[0], text: x[1], onclick: function () { mode = x[0]; fit(); } }));
    });
    function fit() {
      var W = stage.clientWidth, H = stage.clientHeight, vw = mode === "phone" ? 390 : 1440, s, w, hh;
      if (mode === "phone") { var ph = 844; s = Math.min(1, (H - 16) / ph); hh = ph; }
      else { s = Math.min(1, W / vw); hh = H / s; }
      w = vw;
      frame.style.width = w + "px"; frame.style.height = hh + "px";
      frame.style.transform = "scale(" + s + ")"; frame.style.transformOrigin = "top left";
      frame.style.left = Math.max(0, (W - w * s) / 2) + "px"; frame.style.top = mode === "phone" ? Math.max(0, (H - hh * s) / 2) + "px" : "0px";
      frame.className = "pv-iframe" + (mode === "phone" ? " phone" : "");
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === mode)); });
    }
    window.addEventListener("resize", fit);
    document.body.appendChild(ov); fit();
  }
  function renderDraft() {
    var bar = $("#draftbar");
    if (!DEMO) { bar.hidden = true; return; }
    bar.hidden = false; bar.innerHTML = "";
    var unsaved = Object.keys(dirty).some(function (k) { return dirty[k]; });
    var left = h("div", { class: "db-state" });
    if (publishing) left.appendChild(h("span", { class: "db-dot busy" })), left.appendChild(h("strong", { text: "Publishing…" }));
    else if (draftN) { left.appendChild(h("span", { class: "db-dot warn" })); left.appendChild(h("strong", { text: "Draft: " + draftN + " saved change" + (draftN > 1 ? "s" : "") + " not public yet" })); }
    else { left.appendChild(h("span", { class: "db-dot ok" })); left.appendChild(h("strong", { text: noteMsg || "Draft and live site are the same" })); }
    if (unsaved && draftN === 0 && !noteMsg) left.appendChild(h("span", { class: "db-sub", text: "You have edits that are not saved yet." }));
    bar.appendChild(left);
    var right = h("div", { class: "db-actions" });
    if (draftN && !publishing) {
      right.appendChild(h("button", { type: "button", class: "btn", text: "Preview draft ↗", onclick: openPreview }));
      if (!confirmPub) {
        right.appendChild(h("button", { type: "button", class: "btn primary", text: "Publish to live site", onclick: function () { confirmPub = true; renderDraft(); } }));
        right.appendChild(h("button", { type: "button", class: "link", text: "Discard draft", onclick: function () { draftN = 0; noteMsg = "Draft reset to the live site"; renderDraft(); } }));
      } else {
        right.appendChild(h("span", { class: "db-ask", text: "Make these changes public on sajgal.cz?" }));
        right.appendChild(h("button", { type: "button", class: "btn primary", text: "Yes, publish", onclick: function () {
          confirmPub = false; publishing = true; renderDraft();
          setTimeout(function () { publishing = false; draftN = 0; noteMsg = "Published. The live site updates in about a minute."; renderDraft(); }, 1400);
        } }));
        right.appendChild(h("button", { type: "button", class: "link", text: "Cancel", onclick: function () { confirmPub = false; renderDraft(); } }));
      }
    }
    bar.appendChild(right);
    $("#save").textContent = "Save to draft";
  }

  /* ---------- Grid (photos and videos) ---------- */
  function mediaEl(p, isVid) {
    var el, rawUrl = "https://raw.githubusercontent.com/" + cfg.repo + "/" + cfg.branch + (isVid ? p.src : (p.thumb || p.src));
    if (isVid) {
      el = document.createElement("video");
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = "metadata";
      el.src = p.preview || (p.src.replace(/^\//, "") + "#t=0.1");
      if (p.poster) el.poster = (p.posterBlob && p.posterPreview) ? p.posterPreview : p.poster.replace(/^\//, "");
    } else {
      el = new Image(); el.alt = ""; el.loading = "lazy";
      el.src = p.preview || (p.thumb || p.src).replace(/^\//, "");
    }
    el.onerror = function () { el.onerror = null; if (!isVid || !el.poster) el.src = rawUrl; };
    return el;
  }
  function renderGrid() {
    var grid = $("#grid"), items = curItems(), m = meta(tab), isVid = m.kind === "videos";
    var capLabel = editing ? "Caption (optional)" : m.cap;
    var useLayout = view === "layout" && !isVid;
    grid.hidden = useLayout; $("#lay").hidden = !useLayout; if (!useLayout) lay = null;
    if (useLayout) { $("#empty").hidden = items.length > 0; if (items.length) renderLayout(); else { $("#lay").innerHTML = ""; } return; }
    grid.innerHTML = "";
    $("#empty").hidden = items.length > 0;
    items.forEach(function (p) {
      var li = h("li", { class: "card" + (isVid ? " isvid" : ""), "data-id": p.id });
      var ph = h("div", { class: "ph" }), el = mediaEl(p, isVid);
      ph.appendChild(el); li.appendChild(ph);
      if (isVid) {
        li.onmouseenter = function () { var r = el.play(); if (r && r.catch) r.catch(function () {}); };
        li.onmouseleave = function () { el.pause(); };
      }
      if (p.blob) li.appendChild(h("span", { class: "new", text: "New" }));
      li.appendChild(h("button", { type: "button", class: "del", "aria-label": "Remove", text: "×", onclick: function () {
        var list = curItems(), i = list.indexOf(p); if (i > -1) list.splice(i, 1);
        markDirty(); renderGrid();
      } }));
      if (isVid) {
        li.appendChild(h("button", { type: "button", class: "rep", text: "Replace", onclick: function () { replacing = p; $("#repfile").click(); } }));
        var n = items.indexOf(p) + 1;
        li.appendChild(h("span", { class: "colno", text: "Column " + (((n - 1) % 3) + 1) + (p.mobile ? " · phone version ✓" : " · no phone version") }));
        li.appendChild(h("button", { type: "button", class: "rep phone", text: p.mobile ? "Replace phone version" : "Add phone version", onclick: function () { phoneFor = p; $("#phonefile").click(); } }));
      } else {
        var cap = h("input", { type: "text", placeholder: capLabel, "aria-label": capLabel });
        cap.value = p.caption; cap.oninput = function () { p.caption = cap.value; markDirty(); };
        var alt = h("input", { type: "text", class: "alt", placeholder: "Alt text: describe the photo", "aria-label": "Alt text" });
        alt.value = p.alt; alt.oninput = function () { p.alt = alt.value; markDirty(); };
        li.appendChild(cap); li.appendChild(alt);
      }
      grid.appendChild(li);
    });
    if (sortGrid) { sortGrid.destroy(); sortGrid = null; }
    if (window.Sortable) {
      sortGrid = Sortable.create(grid, {
        animation: 150, ghostClass: "sortable-ghost", filter: "input,.del,.rep", preventOnFilter: false, disabled: layoutOn(items),
        onEnd: function () {
          var order = Array.prototype.map.call(grid.children, function (li) { return +li.dataset.id; }), list = curItems();
          var next = order.map(function (id) { return list.filter(function (p) { return p.id === id; })[0]; });
          list.length = 0; next.forEach(function (p) { list.push(p); });
          markDirty();
        }
      });
    }
  }

  /* ---------- Shows ---------- */
  function showStatus(s) {
    return s.photos.length ? "Live · " + s.photos.length + " photo" + (s.photos.length > 1 ? "s" : "") : "Draft · add photos to publish";
  }
  function uniqueSlug(base, except) {
    var s = slug(base) === "file" ? ENT[tab].noun : slug(base), n = 2, cand = s;
    function taken(c) { return state[tab].some(function (x) { return x !== except && x.slug === c; }); }
    while (taken(cand)) cand = s + "-" + n++;
    return cand;
  }
  function renderShowList() {
    var box = $("#p-shows"), id = tab, E = ENT[id]; box.innerHTML = "";
    if (editing) { renderShowForm(box); return; }
    var form = h("form", { class: "newshow" });
    var inp = h("input", { type: "text", placeholder: E.placeholder, "aria-label": "New " + E.noun + " name" });
    form.appendChild(inp);
    form.appendChild(h("button", { type: "submit", class: "btn", text: "Add " + E.noun }));
    form.onsubmit = function (e) {
      e.preventDefault();
      var t = inp.value.trim(); if (!t) return;
      var s = showModel({ title: t, slug: "" });
      s.slug = uniqueSlug(t); s.origSlug = ""; s.isNew = true; s.autoSlug = true;
      state[id].unshift(s); markDirty(); openShow(s);
    };
    box.appendChild(form);
    var ul = h("ul", { class: "showrows", id: "showrows" });
    state[id].forEach(function (s) {
      var thumb = h("div", { class: "cv" });
      if (s.photos[0]) thumb.appendChild(mediaEl(s.photos[0], false));
      var li = h("li", { class: "showrow", "data-key": s.key }, [
        h("span", { class: "grab", "aria-hidden": "true", text: "⋮⋮" }), thumb,
        h("div", { class: "tx" }, [h("strong", { text: s.title || "Untitled" }), h("span", { class: "sub", text: E.base + "/" + s.slug }), h("span", { class: "st" + (s.photos.length ? " live" : ""), text: showStatus(s) })]),
        h("button", { type: "button", class: "btn", text: "Edit", onclick: function () { openShow(s); } })
      ]);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (!state[id].length) box.appendChild(h("p", { class: "empty", text: "No " + E.plural + " yet. Add one above." }));
    else box.appendChild(h("p", { class: "hint", text: E.listHint }));
    if (sortList) { sortList.destroy(); sortList = null; }
    if (window.Sortable) {
      sortList = Sortable.create(ul, {
        animation: 150, handle: ".grab", ghostClass: "sortable-ghost",
        onEnd: function () {
          var order = Array.prototype.map.call(ul.children, function (li) { return +li.dataset.key; });
          state[id] = order.map(function (k) { return state[id].filter(function (s) { return s.key === k; })[0]; });
          markDirty();
        }
      });
    }
  }
  function openShow(s) { editing = s; view = "text"; lay = null; setStatus(""); layout(); window.scrollTo(0, 0); }
  function closeShow() { editing = null; view = "text"; lay = null; layout(); }
  function autoTitle(s) { var t = s.title + " – " + ENT[tab].tail + " | Petr Šajgal"; return t.length <= 62 ? t : s.title + " | Petr Šajgal"; }
  function autoDesc(s) {
    if (s.description.trim()) return s.description.trim().replace(/\s+/g, " ");
    if (tab === "brands") return "Commercial and campaign photography for " + s.title + (s.date ? " (" + s.date + ")" : "") + " by Petr Šajgal, fashion photographer from Czechia.";
    var d = ""; if (/^\d{4}-\d{2}/.test(s.date)) { var p = s.date.split("-"); d = new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }); }
    return "Photos from " + s.title + (s.designer ? " by " + s.designer : "") + (s.location ? ", " + s.location : "") + (d ? " (" + d + ")" : "") + ": runway and backstage photography by Petr Šajgal.";
  }
  function renderShowForm(box) {
    var s = editing, upd = [], id = tab, E = ENT[id];
    box.appendChild(h("button", { type: "button", class: "link", text: "← " + E.all, onclick: closeShow }));
    var urlInput = h("input", { type: "text", readonly: "", "aria-label": "Web address", id: "slugin" }); urlInput.value = s.slug;
    var urlNote = h("small", { class: "note" });
    var changeBtn = null;
    function lockState() {
      var locked = !s.isNew && !s.unlocked;
      if (locked) urlInput.setAttribute("readonly", ""); else urlInput.removeAttribute("readonly");
      urlNote.textContent = locked ? "" : (s.origSlug ? "Changing the address breaks old links, so a redirect from the old address is added when you save." : "Filled in from the name. You can adjust it.");
    }
    if (!s.isNew) changeBtn = h("button", { type: "button", class: "link", text: "Change", onclick: function () { s.unlocked = true; lockState(); urlInput.focus(); if (changeBtn) changeBtn.hidden = true; } });
    urlInput.oninput = function () { s.autoSlug = false; };
    urlInput.onblur = function () { s.slug = uniqueSlug(urlInput.value || s.title, s); urlInput.value = s.slug; markDirty(); upd.forEach(function (f) { f(); }); };
    var title = textField(E.Noun + " name", s.title, function (v) {
      s.title = v;
      if (s.isNew && s.autoSlug !== false) { s.slug = uniqueSlug(v, s); urlInput.value = s.slug; }
      markDirty(); upd.forEach(function (f) { f(); });
    }, { wide: true, placeholder: E.namePh });
    var isShow = id === "shows";
    var dateInp = isShow
      ? textField("Date", /^\d{4}-\d{2}/.test(s.date) ? s.date.slice(0, 7) : s.date, function (v) { s.date = v; markDirty(); upd.forEach(function (f) { f(); }); }, { type: "month", placeholder: "YYYY-MM" })
      : textField("Year", s.date, function (v) { s.date = v; markDirty(); upd.forEach(function (f) { f(); }); }, { placeholder: "e.g. 2024" });
    var fields = h("div", { class: "fields" }, [
      title,
      h("div", { class: "fld wide" }, [h("span", { text: "Web address" }), h("div", { class: "urlrow" }, [h("span", { class: "pre", text: "sajgal.cz" + E.base + "/" }), urlInput, changeBtn]), urlNote]),
      isShow ? textField("Event or fashion week", s.event, function (v) { s.event = v; markDirty(); }, { placeholder: "e.g. Berlin Fashion Week" }) : textField("One-line summary", s.summary, function (v) { s.summary = v; markDirty(); }, { wide: true, placeholder: "e.g. Autumn campaign, Prague", note: "Shown under the brand's photos on the Commercial page." }),
      isShow ? textField("Designer or brand", s.designer, function (v) { s.designer = v; markDirty(); upd.forEach(function (f) { f(); }); }) : null,
      isShow ? textField("Location", s.location, function (v) { s.location = v; markDirty(); upd.forEach(function (f) { f(); }); }, { placeholder: "e.g. Berlin" }) : null,
      dateInp,
      textField("Description", s.description, function (v) { s.description = v; markDirty(); upd.forEach(function (f) { f(); }); }, { area: true, rows: 5, wide: true, note: E.descNote })
    ]);
    lockState();
    box.appendChild(fields);

    var st = textField("Title in Google (optional)", s.seoTitle, function (v) { s.seoTitle = v; markDirty(); upd.forEach(function (f) { f(); }); }, { wide: true });
    var sd = textField("Description in Google (optional)", s.seoDescription, function (v) { s.seoDescription = v; markDirty(); upd.forEach(function (f) { f(); }); }, { area: true, rows: 3, wide: true });
    var stc = h("span", { class: "ctr" }), sdc = h("span", { class: "ctr" });
    st.appendChild(stc); sd.appendChild(sdc);
    var sn = snippet("sajgal.cz › " + E.base.slice(1) + " › " + s.slug, function () { return s.seoTitle.trim() || autoTitle(s); }, function () { return s.seoDescription.trim() || autoDesc(s); });
    function refresh() {
      st.input.placeholder = autoTitle(s); sd.input.placeholder = autoDesc(s);
      var a = counter((s.seoTitle.trim() || autoTitle(s)).length, 30, 60), b = counter((s.seoDescription.trim() || autoDesc(s)).length, 70, 155);
      stc.textContent = a.text; stc.className = a.cls; sdc.textContent = b.text; sdc.className = b.cls;
      sn.update();
    }
    upd.push(refresh); refresh();
    box.appendChild(h("details", { class: "seo-d" }, [h("summary", { text: "Search appearance" }), h("p", { class: "note", text: "Leave blank and a good title and description are written from the fields above." }), st, sd, sn]));

    var actions = h("div", { class: "show-actions" });
    if (!s.isNew) actions.appendChild(h("a", { href: E.base + "/" + s.slug, target: "_blank", rel: "noopener", class: "link", text: "View page ↗" }));
    var del = h("button", { type: "button", class: "link danger", text: "Delete " + E.noun });
    var armed = false, timer = null;
    del.onclick = function () {
      if (!armed) { armed = true; del.textContent = "Click again to delete this " + E.noun; timer = setTimeout(function () { armed = false; del.textContent = "Delete " + E.noun; }, 4000); return; }
      clearTimeout(timer);
      if (s.origSlug) deletedSlugs[id].push(s.origSlug);
      state[id] = state[id].filter(function (x) { return x !== s; });
      markDirty(); closeShow();
    };
    actions.appendChild(del);
    box.appendChild(actions);
    box.appendChild(h("h2", { class: "ph2", text: "Photos in this " + E.noun }));
  }


  /* ---------- Video page (Instagram reels) ---------- */
  function igParse(text) {
    var m = /instagram\.com\/(?:[^\/?#"'\s]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(String(text || ""));
    if (!m) return null;
    var who = /A post shared by ([^<(]+?)\s*\(@/.exec(String(text));
    return { id: m[2], link: "https://www.instagram.com/" + (m[1] === "p" ? "p" : "reel") + "/" + m[2] + "/", name: who ? who[1].trim() : "" };
  }
  function renderReels() {
    var box = $("#p-reels"), list = state[tab]; box.innerHTML = "";
    var paste = h("textarea", { rows: "2", placeholder: "Paste an Instagram link, or the whole embed code from Instagram", "aria-label": "Instagram link or embed code" });
    var add = h("button", { type: "button", class: "btn primary", text: "Add video" });
    var msg = h("span", { class: "msg", role: "status" });
    add.onclick = function () {
      var r = igParse(paste.value);
      if (!r) { msg.className = "msg err"; msg.textContent = "That does not look like an Instagram post or reel link."; return; }
      if (list.some(function (v) { return igParse(v.ig) && igParse(v.ig).id === r.id; })) { msg.className = "msg err"; msg.textContent = "That video is already in the list."; return; }
      list.unshift({ id: ++uid, ig: r.link, title: r.name, date: "", thumb: "" });
      paste.value = ""; msg.textContent = ""; markDirty(); renderReels();
    };
    box.appendChild(h("div", { class: "reeladd" }, [h("label", { class: "fld wide" }, [h("span", { text: "New video" }), paste]), h("div", { class: "reelbtn" }, [add, msg])]));
    var ul = h("ul", { class: "reelrows", id: "reelrows" });
    list.forEach(function (v) {
      var row = {}, thumb = h("div", { class: "rthumb", tabindex: "0", title: "Click to choose an image or video. Or drop a file here, or paste a screenshot while this row is selected." });
      var file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v", hidden: "" });
      function paint() {
        thumb.innerHTML = "";
        if (v.thumb) { var im = new Image(); im.alt = ""; im.src = v.preview || v.thumb.replace(/^\//, ""); im.onerror = function () { im.onerror = null; im.src = "https://raw.githubusercontent.com/" + cfg.repo + "/" + cfg.branch + v.thumb; }; thumb.appendChild(im); }
        thumb.appendChild(h("span", { class: "rt-label", text: v.thumb ? "Change" : "Add thumbnail" }));
        thumb.appendChild(file);
      }
      function setThumb(blob) {
        var id = (igParse(v.ig) || { id: "video" }).id;
        v.thumb = "/images/video/" + id + "-" + stamp() + ".jpg"; v.thumbBlob = blob; v.preview = URL.createObjectURL(blob);
        markDirty(); paint();
      }
      function useFile(f) {
        if (!f) return;
        if (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
          setStatus("Taking a still from the video…");
          posterOf(f).then(function (b) { if (b) { setThumb(b); setStatus("Thumbnail set from the video."); } else setStatus("That video could not be read. Try a screenshot instead.", true); });
        } else if (/^image\//.test(f.type)) {
          createImageBitmap(f).then(function (bmp) { return scaled(bmp, 720, 0.82); }).then(function (r) { setThumb(r.blob); setStatus(""); })
            .catch(function () { setStatus("That image could not be read.", true); });
        } else setStatus("Use an image (JPG, PNG, WebP) or a video (MP4, MOV).", true);
      }
      file.onchange = function () { var f = file.files[0]; file.value = ""; useFile(f); };
      row.useFile = useFile;
      thumb.onclick = function () { file.click(); };
      paint();
      var title = textField("Title", v.title, function (x) { v.title = x; markDirty(); }, { placeholder: "e.g. ELLE Czech, MBPFW SS27" });
      var date = textField("Date (optional)", v.date, function (x) { v.date = x; markDirty(); }, { type: "date", note: "Helps Google list the video." });
      var link = h("a", { href: v.ig, target: "_blank", rel: "noopener", class: "link", text: v.ig.replace(/^https?:\/\/(www\.)?/, "") });
      var del = h("button", { type: "button", class: "link danger", text: "Remove" });
      var armed = false, t = null;
      del.onclick = function () {
        if (!armed) { armed = true; del.textContent = "Click again to remove"; t = setTimeout(function () { armed = false; del.textContent = "Remove"; }, 4000); return; }
        clearTimeout(t); var i = list.indexOf(v); if (i > -1) list.splice(i, 1); markDirty(); renderReels();
      };
      var li = h("li", { class: "reelrow", "data-id": v.id, tabindex: "-1" }, [h("span", { class: "grab", "aria-hidden": "true", text: "⋮⋮" }), thumb, h("div", { class: "rfields" }, [title, date, h("div", { class: "rlinks" }, [link, del])])]);
      li.ondragover = function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") > -1) { e.preventDefault(); li.classList.add("dropping"); } };
      li.ondragleave = function () { li.classList.remove("dropping"); };
      li.ondrop = function (e) { li.classList.remove("dropping"); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); row.useFile(f); } };
      li.onpaste = function (e) { var it = Array.prototype.filter.call((e.clipboardData && e.clipboardData.items) || [], function (x) { return x.kind === "file"; })[0]; if (it) { e.preventDefault(); row.useFile(it.getAsFile()); } };
      thumb.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (!list.length) box.appendChild(h("p", { class: "empty", text: "No videos yet. Paste an Instagram link above." }));
    else box.appendChild(h("p", { class: "hint", text: "Thumbnail: click it and choose the video file (a still is taken automatically) or a screenshot. You can also drop a file on the row, or click the row and paste a screenshot. Instagram only loads when a visitor clicks a video, so the page stays fast." }));
    if (window.Sortable) {
      Sortable.create(ul, { animation: 150, handle: ".grab", ghostClass: "sortable-ghost", onEnd: function () {
        var order = Array.prototype.map.call(ul.children, function (li) { return +li.dataset.id; });
        state[tab] = order.map(function (id) { return list.filter(function (x) { return x.id === id; })[0]; }); markDirty();
      } });
    }
  }

  /* ---------- SEO tab ---------- */
  function effective(key, f) { var o = state.seo.pages[key] || {}; return (o[f] || "").trim() || DEFAULTS[key][f === "title" ? 0 : 1]; }
  function renderSeo() {
    var box = $("#p-seo"); box.innerHTML = ""; seoRefresh = [];
    var S = state.seo, site = S.site;
    function setSite(k) { return function (v) { site[k] = v; markDirty(); }; }

    var health = h("section", { class: "seo-health" });
    box.appendChild(health);
    function renderHealth() {
      health.innerHTML = "";
      var notes = [], noAlt = 0, lists = [state.fashion, state.editorial, state.personal].concat(state.shows.map(function (s) { return s.photos; }), state.brands.map(function (s) { return s.photos; }));
      lists.forEach(function (l) { (l || []).forEach(function (p) { if (!p.alt.trim()) noAlt++; }); });
      PAGES.forEach(function (pg) {
        var t = effective(pg.key, "title").length, d = effective(pg.key, "description").length;
        if (t > 60) notes.push([false, pg.label + ": title is " + t + " characters, Google cuts it at about 60."]);
        if (d > 155) notes.push([false, pg.label + ": description is " + d + " characters, Google cuts it at about 155."]);
      });
      [["shows", "show", "All shows"], ["brands", "brand", "Commercial"]].forEach(function (g) {
        var list = state[g[0]], live = list.filter(function (s) { return s.photos.length; }), nodesc = live.filter(function (s) { return !s.description.trim(); }).length, drafts = list.length - live.length;
        if (nodesc) notes.push([false, nodesc + " live " + g[1] + (nodesc > 1 ? "s have" : " has") + " no description text. Add two or three sentences in the " + g[2] + " tab."]);
        if (drafts) notes.push([true, drafts + " " + g[1] + (drafts > 1 ? "s have" : " has") + " no photos yet and stay hidden from visitors and Google."]);
      });
      notes.push([noAlt === 0, noAlt ? noAlt + " photo" + (noAlt > 1 ? "s have" : " has") + " no alt text. A description is written automatically from the show or caption; your own wording is better for image search." : "Every photo has alt text."]);
      if (!notes.some(function (n) { return !n[0]; })) notes.unshift([true, "Titles and descriptions are within Google's limits."]);
      health.appendChild(h("h2", { text: "Check" }));
      health.appendChild(h("ul", {}, notes.map(function (n) { return h("li", { class: n[0] ? "ok" : "warn", text: (n[0] ? "✓ " : "! ") + n[1] }); })));
    }
    seoRefresh.push(renderHealth); renderHealth();

    var shareImg = h("img", { class: "ogprev", alt: "Share image preview" });
    shareImg.src = S.ogPreview || (site.ogImage || "/images/og.jpg").replace(/^\//, "");
    shareImg.onerror = function () { shareImg.onerror = null; shareImg.src = "https://raw.githubusercontent.com/" + cfg.repo + "/" + cfg.branch + (site.ogImage || "/images/og.jpg"); };
    var ogFile = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: "" });
    ogFile.onchange = function () {
      var f = ogFile.files[0]; ogFile.value = ""; if (!f) return;
      cropOg(f).then(function (b) {
        S.ogBlob = b; S.ogPreview = URL.createObjectURL(b); site.ogImage = "/images/og-" + stamp() + ".jpg";
        shareImg.src = S.ogPreview; markDirty();
      });
    };
    box.appendChild(h("section", { class: "seo-card" }, [
      h("h2", { text: "Site" }),
      h("div", { class: "fields" }, [
        textField("Your name", site.name, setSite("name")),
        textField("What you do (one short phrase)", site.tagline, setSite("tagline"), { note: "Used in the hidden heading on the home page and in search results, e.g. “Fashion photographer”." }),
        textField("Email", site.email, setSite("email")),
        textField("Country", site.country, setSite("country")),
        textField("Instagram username", site.instagram, setSite("instagram")),
        textField("Reddit username", site.reddit, setSite("reddit")),
        textField("Website address", site.url, setSite("url"), { wide: true, note: "Only change this if the domain changes. Used in the sitemap and for share links." }),
        textField("Media address (optional)", site.mediaUrl || "", setSite("mediaUrl"), { wide: true, placeholder: "e.g. https://media.sajgal.cz", note: "Leave empty to serve photos and videos from the site itself. Fill it in only if you later move media to separate storage such as Cloudflare R2." }),
        textField("Bio (shown on the Contact page)", (site.bio || []).join("\n\n"), function (v) { site.bio = v.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean); markDirty(); }, { area: true, rows: 7, wide: true, note: "Also used by Google to understand who you are. A blank line starts a new paragraph." })
      ]),
      h("div", { class: "fld wide" }, [h("span", { text: "Share image" }), h("div", { class: "ogrow" }, [shareImg, h("div", {}, [
        h("p", { class: "note", text: "Shown when a link to the site is shared on WhatsApp, Instagram, LinkedIn or Facebook, and used on pages without their own photo. Cropped to 1200 × 630." }),
        h("label", { class: "btn" }, ["Change image", ogFile])])])])
    ]));

    PAGES.forEach(function (pg) {
      var o = S.pages[pg.key] = S.pages[pg.key] || {};
      var ti = textField("Title", o.title || "", function (v) { o.title = v; markDirty(); r(); }, { wide: true });
      var de = textField("Description", o.description || "", function (v) { o.description = v; markDirty(); r(); }, { area: true, rows: 3, wide: true });
      var tc = h("span", { class: "ctr" }), dc = h("span", { class: "ctr" });
      ti.appendChild(tc); de.appendChild(dc);
      ti.input.placeholder = DEFAULTS[pg.key][0]; de.input.placeholder = DEFAULTS[pg.key][1];
      var sn = snippet("sajgal.cz" + (pg.url === "/" ? "" : " › " + pg.url.slice(1)), function () { return effective(pg.key, "title"); }, function () { return effective(pg.key, "description"); });
      function r() {
        var a = counter(effective(pg.key, "title").length, 30, 60), b = counter(effective(pg.key, "description").length, 70, 155);
        tc.textContent = a.text; tc.className = a.cls; dc.textContent = b.text; dc.className = b.cls; sn.update(); renderHealth();
      }
      r();
      box.appendChild(h("section", { class: "seo-card" }, [h("h2", {}, [pg.label, h("small", { text: " " + pg.url })]), ti, de, sn]));
    });

    box.appendChild(h("section", { class: "seo-card" }, [
      h("h2", { text: "After the site is live" }),
      h("ol", { class: "steps" }, [
        h("li", { text: "Open Google Search Console, add sajgal.cz as a domain property, and verify it with the DNS record it gives you (you already use Cloudflare for DNS)." }),
        h("li", { text: "Under Sitemaps, submit sitemap.xml. It lists every page and photo, and updates itself when you save here." }),
        h("li", { text: "Under Pages, check which old addresses had visitors, and confirm they now redirect." })
      ])
    ]));
  }

  /* ---------- Layout ---------- */
  function applyHints() {
    var m = meta(tab), k = m.kind;
    $("#addlabel").textContent = k === "videos" ? "Add videos" : "Add photos";
    $("#file").accept = k === "videos" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp";
    var hint = "";
    if (view === "layout" && (k === "photos" || (k === "entries" && editing))) hint = "Place photos side by side in rows, like a printed layout.";
    else if (k === "videos") hint = "Drag to reorder. Desktop has three columns, each plays its own clips in turn (clip 1, 4, 7 in the left column; 2, 5 in the middle; 3, 6 on the right). Phones play them all in one column.";
    else if (k === "reels") hint = "Drag to reorder. The first video appears first on the Video page.";
    else if (k === "photos") hint = (layoutOn(curItems()) ? "This page has a custom layout: change the order in the Layout view. " : "Drag photos to reorder. ") + "Alt text describes the photo for Google and screen readers; blank is filled in automatically.";
    else if (k === "entries" && editing) hint = (layoutOn(curItems()) ? "This page has a custom layout: change the order in the Layout view. " : "Drag photos to reorder. ") + "The first photo is the cover.";
    $("#hint").textContent = hint;
    $("#empty").textContent = k === "videos" ? "No videos yet. Add up to " + m.max + " MP4 or WebM clips." : "No photos yet. Drop images here or use Add photos.";
  }
  function layout() {
    var m = meta(tab), k = m.kind, grid = k === "photos" || k === "videos" || (k === "entries" && !!editing);
    $("#addbtn").hidden = !grid; $("#drop").hidden = !grid;
    $("#p-shows").hidden = k !== "entries"; $("#p-reels").hidden = k !== "reels";
    $("#exporthint").hidden = k !== "videos"; $("#p-seo").hidden = k !== "seo";
    applyHints();
    if (k === "entries") renderShowList();
    if (k === "reels") renderReels();
    if (k === "seo") renderSeo();
    if (grid) renderGrid();
    renderViewToggle(); renderDraft();
    refreshSave();
  }
  function tabs() {
    var t = $("#tabs"); t.innerHTML = "";
    TABS.forEach(function (c) {
      t.appendChild(h("button", { type: "button", role: "tab", "aria-selected": String(c.id === tab), text: c.label, onclick: function () {
        if (c.id === tab && !editing) return;
        tab = c.id; editing = null; view = "text"; lay = null; setStatus(""); tabs(); layout();
      } }));
    });
  }
  function start() {
    $("#setup").hidden = true; $("#editor").hidden = false; $("#disconnect").hidden = false;
    setStatus("Loading…");
    Promise.all(TABS.map(function (c) { return load(c.id); })).then(function () {
      setStatus(""); tabs(); layout();
    }).catch(function (e) { setStatus(e.message, true); });
  }

  /* ---------- Setup ---------- */
  $("#setup-form").onsubmit = function (e) {
    e.preventDefault();
    var next = { repo: $("#f-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, ""), branch: $("#f-branch").value.trim(), token: $("#f-token").value.trim() };
    var msg = $("#setup-msg"); msg.className = "msg"; msg.textContent = "Checking…";
    cfg = next;
    api("").then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 || r.status === 401 ? "GitHub could not open that repository with this token. Check the name and the token's permissions." : "GitHub returned " + r.status + ".");
      return r.json();
    }).then(function (j) {
      if (j.permissions && !j.permissions.push) throw new Error("The token can read but not write. Set Contents to Read and write.");
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (x) {}
      start();
    }).catch(function (err) { cfg = null; msg.className = "msg err"; msg.textContent = err.message; });
  };
  $("#disconnect").onclick = function (e) {
    e.preventDefault();
    try { localStorage.removeItem(KEY); } catch (x) {}
    location.reload();
  };

  /* ---------- Wiring ---------- */
  $("#file").onchange = function (e) { addFiles(e.target.files); e.target.value = ""; };
  var repInput = h("input", { type: "file", id: "repfile", accept: "video/mp4,video/webm", hidden: "" });
  document.body.appendChild(repInput);
  repInput.onchange = function () {
    var f = repInput.files[0], p = replacing; repInput.value = ""; replacing = null;
    if (!f || !p) return;
    var e = checkVideo(f);
    if (e) { setStatus(e, true); return; }
    setStatus("Preparing video…");
    newVideo(f).then(function (v) {
      p.src = v.src; p.blob = v.blob; p.preview = v.preview; p.poster = v.poster; p.posterBlob = v.posterBlob; p.posterPreview = v.posterPreview;
      markDirty(); renderGrid();
    });
  };
  var phoneInput = h("input", { type: "file", id: "phonefile", accept: "video/mp4,video/webm", hidden: "" });
  document.body.appendChild(phoneInput);
  phoneInput.onchange = function () {
    var f = phoneInput.files[0], p = phoneFor; phoneInput.value = ""; phoneFor = null;
    if (!f || !p) return;
    var e = checkVideo(f); if (e) { setStatus(e, true); return; }
    p.mobile = "/videos/" + slug(f.name) + "-" + stamp() + "-m" + (f.type === "video/webm" ? ".webm" : ".mp4"); p.mobileBlob = f;
    markDirty(); renderGrid();
  };
  $("#save").onclick = save;
  var drop = $("#drop");
  ["dragenter", "dragover"].forEach(function (n) {
    drop.addEventListener(n, function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") > -1) { e.preventDefault(); drop.classList.add("over"); }
    });
  });
  ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  });
  window.addEventListener("beforeunload", function (e) {
    if (Object.keys(dirty).some(function (k) { return dirty[k]; })) { e.preventDefault(); e.returnValue = ""; }
  });

  if (cfg && cfg.token) start(); else $("#setup").hidden = false;
})();
