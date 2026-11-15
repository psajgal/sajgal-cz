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
  var WB = "draft", D = { loaded: false, ahead: 0, behind: 0, files: [], head: "", main: "" }, pv = { state: "", timer: null }, view = "text", lay = null, layoutSort = [], layBackup = [], draftN = 0, phoneFor = null, editing = null, deletedSlugs = { shows: [], brands: [] }, sortGrid = null, sortList = null, seoRefresh = [], layoutFile = {}, layoutSha = null, layoutDirty = {}, apMode = "desktop", msrc = null;

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
    opts.cache = "no-store"; /* GitHub lets browsers cache API answers for a minute, which made the draft state look stale */
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
    var body = { message: message, content: contentB64, branch: WB };
    if (sha) body.sha = sha;
    return api("/contents/" + path.split("/").map(encodeURIComponent).join("/"), { method: "PUT", body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || r.status); });
        return r.json();
      });
  }

  /* ---------- Data shapes ---------- */
  function photoItem(p) {
    return { id: ++uid, src: p.image || "", thumb: p.thumb || "", caption: p.caption || "", alt: p.alt || "", w: p.w, h: p.h, row: p.row, cols: p.cols, stack: p.stack, al: p.al, ar: p.ar, fx: p.fx, fy: p.fy, z: p.z, col: p.col };
  }
  function videoItem(p) { return { id: ++uid, src: p.video || "", mobile: p.mobile || "", poster: p.poster || "" }; }
  function showModel(s) {
    return {
      key: ++uid, slug: s.slug || "", origSlug: s.slug || "", title: s.title || "", summary: s.summary || "", event: s.event || "", designer: s.designer || "",
      date: s.date || "", location: s.location || "", description: s.description || "", seoTitle: s.seoTitle || "",
      seoDescription: s.seoDescription || "", layout: s.layout || null, cover: s.cover || "", photos: (s.photos || []).filter(function (p) { return p.image; }).map(photoItem)
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
    if (p.col != null && p.row == null) o.col = p.col;
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
        if (x.layout && Object.keys(x.layout).length) base.layout = x.layout;
        return base;
      });
    }
    if (k === "reels") return s.map(function (v) { return { ig: v.ig, title: v.title.trim(), date: v.date, thumb: v.thumb }; });
    if (k === "videos") return s.map(function (p) { var o = { video: p.src }; if (p.mobile) o.mobile = p.mobile; if (p.poster) o.poster = p.poster; return o; });
    return s.map(outPhoto);
  }

  /* ---------- Load / save ---------- */
  function load(id) {
    return api("/contents/data/" + id + ".json?ref=" + encodeURIComponent(WB)).then(function (r) {
      if (r.status === 404) { shas[id] = null; state[id] = parse(id, meta(id).kind === "seo" ? {} : []); return; }
      if (!r.ok) throw new Error(r.status === 401 ? "The token was rejected. Reconnect with a new one." : "Could not load " + id + " (" + r.status + ").");
      return r.json().then(function (j) { shas[id] = j.sha; state[id] = parse(id, JSON.parse(textFromB64(j.content))); });
    });
  }
  function loadLayoutFile() {
    return api("/contents/data/layout.json?ref=" + encodeURIComponent(WB)).then(function (r) {
      if (r.status === 404) { layoutSha = null; layoutFile = {}; return; }
      if (!r.ok) throw new Error("Could not load the photo layout settings (" + r.status + ").");
      return r.json().then(function (j) { layoutSha = j.sha; try { layoutFile = JSON.parse(textFromB64(j.content)) || {}; } catch (e) { layoutFile = {}; } });
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
    return api("/contents/redirects.txt?ref=" + encodeURIComponent(WB)).then(function (r) {
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
    btn.disabled = true; setStatus("Saving…"); saving = true; renderDraft();
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
      var lp = layoutDirty[id] ? put("data/layout.json", b64FromText(JSON.stringify(layoutFile, null, 2) + "\n"), "Update photo layout", layoutSha).then(function (r) { layoutSha = r.content.sha; layoutDirty[id] = false; }) : Promise.resolve();
      return lp.then(function () { return addRedirects(lines); }).then(function () {
        if (meta(id).kind === "entries") { state[id].forEach(function (s) { s.origSlug = s.slug; }); deletedSlugs[id] = []; }
      });
    }).then(function () {
      saving = false; noteMsg = ""; setStatus("Saved to the draft.");
      layout(); refreshSave(); refreshDraft(); [2500, 7000].forEach(function (ms) { setTimeout(refreshDraft, ms); });
    }).catch(function (e) {
      setStatus(String(e.message || e).indexOf("does not match") > -1
        ? "The site changed elsewhere. Reload this page and try again." : "Could not save: " + (e.message || e), true);
      btn.disabled = false; saving = false; renderDraft();
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

  /* ---------- Selected fashion: photos from the shows ---------- */
  function showsRanked() {
    var ss = (state.shows || []).filter(function (s) { return s.photos.some(function (p) { return !p.blob; }); });
    if (ss.length && ss.every(function (s) { return /^\d{4}/.test(s.date || ""); })) ss = ss.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return ss; // newest first: by date when every show has one, otherwise in the order of the All shows list
  }
  function fashionItem(p, s) { return { id: ++uid, src: p.src, thumb: p.thumb || "", caption: s.title || "", alt: p.alt || "", w: p.w, h: p.h }; }
  function putInFashion(picked, replace) {
    var list = state.fashion, have = {}, added = 0;
    if (replace) list.length = 0;
    list.forEach(function (p) { have[p.src] = 1; });
    picked.forEach(function (x) { if (!have[x.p.src]) { have[x.p.src] = 1; list.push(fashionItem(x.p, x.s)); added++; } });
    lay = null; dirty.fashion = true;
    if (tab === "fashion") { renderGrid(); refreshSave(); }
    setStatus(added + " photo" + (added === 1 ? "" : "s") + (replace ? " now in Selected fashion." : " added to Selected fashion.") + " Save to draft to keep them.");
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // Random photos from every show; newer shows are more likely (and get more photos in "from each show" mode).
  function randomPick(n, perShow) {
    var ss = showsRanked(), out = [];
    var pools = ss.map(function (s) { return { s: s, left: shuffle(s.photos.filter(function (p) { return !p.blob; })), got: 0 }; });
    var rec = function (i) { return 1 / (1 + i * 0.35); };
    if (perShow) {
      pools.forEach(function (pl, i) {
        var k = Math.max(1, Math.round(n * (0.4 + 0.6 * rec(i))));
        pl.left.slice(0, k).forEach(function (p) { out.push({ p: p, s: pl.s }); });
      });
      return out;
    }
    while (out.length < n) {
      var live = pools.map(function (pl, i) { return pl.left.length ? { pl: pl, w: rec(i) / (1 + pl.got) } : null; }).filter(Boolean);
      if (!live.length) break;
      var tot = live.reduce(function (a, x) { return a + x.w; }, 0), r = Math.random() * tot, pick = live[live.length - 1];
      for (var k = 0; k < live.length; k++) { r -= live[k].w; if (r <= 0) { pick = live[k]; break; } }
      out.push({ p: pick.pl.left.shift(), s: pick.pl.s }); pick.pl.got++;
    }
    return out;
  }
  function modal(title, body, actions) {
    var ov = h("div", { class: "pk-over", role: "dialog", "aria-label": title });
    var close = function () { document.removeEventListener("keydown", key); ov.remove(); };
    var key = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    var panel = h("div", { class: "pk-panel" }, [h("div", { class: "pk-head" }, [h("h2", { text: title }), h("button", { type: "button", class: "link", text: "Close", onclick: close })]), body, h("div", { class: "pk-foot" }, actions(close))]);
    ov.appendChild(panel); ov.onclick = function (e) { if (e.target === ov) close(); };
    document.body.appendChild(ov);
    return close;
  }
  function openFromShows() {
    var ss = showsRanked(), sel = [], have = {};
    state.fashion.forEach(function (p) { have[p.src] = 1; });
    if (!ss.length) { setStatus("No show has saved photos yet.", true); return; }
    var body = h("div", { class: "pk-body" }), count = h("span", { class: "pk-count" }), addBtn;
    function upd() { count.textContent = sel.length ? sel.length + " selected" : "Click photos to select them"; if (addBtn) { addBtn.disabled = !sel.length; addBtn.textContent = sel.length ? "Add " + sel.length + " photo" + (sel.length > 1 ? "s" : "") : "Add photos"; } }
    ss.forEach(function (s) {
      var photos = s.photos.filter(function (p) { return !p.blob; }), grid = h("div", { class: "pk-grid" }), btns = [];
      var sec = h("section", { class: "pk-show" }, [h("div", { class: "pk-sh" }, [h("strong", { text: s.title || s.slug }), h("span", { class: "hint", text: photos.length + " photos" }),
        h("button", { type: "button", class: "link", text: "Select all", onclick: function () { var all = btns.every(function (b) { return b.on; }); btns.forEach(function (b) { if (b.on === all) b.toggle(); }); } })]), grid]);
      photos.forEach(function (p) {
        var item = { p: p, s: s }, b = h("button", { type: "button", class: "pk-ph", "aria-pressed": "false", title: have[p.src] ? "Already in Selected fashion" : "" });
        var im = h("img", { alt: "", loading: "lazy", decoding: "async" }); var u = p.thumb || p.src; im.src = /^(data|blob):/.test(u) ? u : "https://raw.githubusercontent.com/" + cfg.repo + "/" + WB + u;
        b.appendChild(im); if (have[p.src]) b.classList.add("had");
        b.on = false;
        b.toggle = function () { b.on = !b.on; b.setAttribute("aria-pressed", String(b.on)); if (b.on) sel.push(item); else sel.splice(sel.indexOf(item), 1); upd(); };
        b.onclick = b.toggle; btns.push(b); grid.appendChild(b);
      });
      body.appendChild(sec);
    });
    modal("Add photos from your shows", body, function (close) {
      addBtn = h("button", { type: "button", class: "btn primary", text: "Add photos", disabled: "", onclick: function () { putInFashion(sel, false); close(); } });
      upd(); return [count, h("button", { type: "button", class: "btn", text: "Cancel", onclick: close }), addBtn];
    });
  }
  function openRandom() {
    var n = h("input", { type: "number", min: "1", max: "300", value: "25", class: "pk-num" }), mode = "total", repl = false;
    function radio(name, opts, cur, set) {
      var wrap = h("div", { class: "seg" });
      opts.forEach(function (o) { wrap.appendChild(h("button", { type: "button", "aria-pressed": String(o[0] === cur), text: o[1], onclick: function () { set(o[0]); Array.prototype.forEach.call(wrap.children, function (b, i) { b.setAttribute("aria-pressed", String(opts[i][0] === o[0])); }); } })); });
      return wrap;
    }
    var body = h("div", { class: "pk-body pk-rand" }, [
      h("p", { text: "Picks random photos from your shows and puts them in Selected fashion. Newer shows (higher in the All shows list) are more likely." }),
      h("label", { class: "fld" }, [h("span", { text: "How many photos" }), n]),
      radio("mode", [["total", "In total"], ["each", "From each show"]], mode, function (v) { mode = v; }),
      h("p", { class: "hint", text: "“From each show” gives every show that many photos, a bit fewer for older shows." }),
      radio("repl", [[false, "Add to the photos already there"], [true, "Replace what is there"]], repl, function (v) { repl = v; })
    ]);
    modal("Random pick", body, function (close) {
      return [h("button", { type: "button", class: "btn", text: "Cancel", onclick: close }), h("button", { type: "button", class: "btn primary", text: "Pick photos", onclick: function () {
        var k = Math.max(1, Math.min(300, parseInt(n.value, 10) || 25)), picked = randomPick(k, mode === "each");
        if (!picked.length) { setStatus("No show has saved photos yet.", true); close(); return; }
        putInFashion(picked, repl); close();
      } })];
    });
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
    box.appendChild(modeSwitch(list, layoutOn(list)));
    if (!layoutOn(list)) { lay = null; renderAutoPanel(box, list); return; }
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
      h("button", { type: "button", class: "btn", text: "+ Add row", onclick: function () { readDom(box); lay.rows.push({ al: "", cols: [{ w: 6, items: [] }, { w: 6, items: [] }] }); markDirty(); renderLayout(); } })
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

  /* ---------- Automatic layout settings ---------- */
  function layCfgObj() { return editing ? (editing.layout || {}) : (layoutFile[tab] || {}); }
  function layCfg() { var o = layCfgObj(); return { cols: +o.cols >= 2 && +o.cols <= 6 ? +o.cols : 0, phone: +o.phone === 2 ? 2 : 1, even: o.even !== false, offs: Array.isArray(o.offs) ? o.offs.slice(0, 6) : [] }; }
  function setLayCfg(patch) {
    var c = Object.assign(layCfg(), patch), o = {};
    if (c.cols) o.cols = c.cols;
    if (c.phone === 2) o.phone = 2;
    if (!c.even) { o.even = false; if (c.offs && c.offs.length) o.offs = c.offs; }
    if (editing) editing.layout = Object.keys(o).length ? o : null;
    else { if (Object.keys(o).length) layoutFile[tab] = o; else delete layoutFile[tab]; layoutDirty[tab] = true; }
    markDirty();
  }
  function autoRows(list) {
    var c = layCfg(), n = Math.max(2, Math.min(4, c.cols || 4, list.length));
    if (list.length < 2 || !window.sajgalMasonry) return toRows(list);
    var rs = list.map(function (p) { return p.w && p.h ? p.h / p.w : 1.25; }), r = window.sajgalMasonry.plan(n, rs, 0.04, !c.even, list.map(function (p) { return (p.preview || p.src.replace(/^\//, "")).slice(-60); })), cols = [], i;
    for (i = 0; i < n; i++) cols.push({ w: 12 / n, items: [] });
    list.forEach(function (p, k) { cols[r.colOf[k]].items.push(p); });
    return [{ al: "", cols: cols }];
  }
  function startManual(list) {
    if (!list.length) { setStatus("Add photos first.", true); return; }
    if (layBackup.length && layBackup.length === list.length && layBackup.every(function (b) { return list.indexOf(b.p) > -1; })) {
      layBackup.forEach(function (b) { if (b.row != null) { b.p.row = b.row; b.p.cols = b.cols; b.p.stack = b.stack; if (b.al) b.p.al = b.al; } });
    }
    if (!layoutOn(list)) { lay = { rows: autoRows(list) }; writeRows(list, lay.rows); }
    markDirty(); renderLayout();
  }
  function modeSwitch(list, manual) {
    var armed = false, t = null;
    var a = h("button", { type: "button", "aria-pressed": String(!manual), text: "Automatic" });
    var m = h("button", { type: "button", "aria-pressed": String(manual), text: "Manual", onclick: function () { if (!manual) startManual(list); } });
    a.onclick = function () {
      if (!manual) return;
      if (!armed) { armed = true; a.textContent = "Click again: your row layout is removed"; t = setTimeout(function () { armed = false; a.textContent = "Automatic"; }, 4000); return; }
      clearTimeout(t); clearLayout(list); lay = null; markDirty(); renderLayout();
    };
    return h("div", { class: "lay-modebar" }, [h("div", { class: "seg lay-mode", role: "group", "aria-label": "Layout mode" }, [a, m]),
      h("span", { class: "hint", text: manual ? "You place every photo yourself. Visitors on phones always see one column." : "The site arranges the photos in even columns for every screen size." })]);
  }
  function getMasonrySrc() {
    if (window.__MASONRY_SRC__) return Promise.resolve(window.__MASONRY_SRC__);
    return msrc || (msrc = fetch("masonry.js", { cache: "no-store" }).then(function (r) { return r.text(); }));
  }
  var DRAG_JS = "(" + function () {
    if (document.documentElement.hasAttribute("data-nodrag")) return;
    var d = null, root = document.getElementById("gallery");
    function idOf(a) { return +a.getAttribute("data-id"); }
    function groups() {
      var cs = root.querySelectorAll(".mcol");
      if (!cs.length) return [[].map.call(root.querySelectorAll("a"), idOf)];
      return [].map.call(cs, function (c) { return [].map.call(c.querySelectorAll("a"), idOf); });
    }
    function colEls() { var cs = root.querySelectorAll(".mcol"); return cs.length ? [].slice.call(cs) : [root]; }
    document.addEventListener("click", function (e) { e.preventDefault(); });
    document.addEventListener("dragstart", function (e) { e.preventDefault(); });
    document.addEventListener("pointerdown", function (e) {
      var a = e.target.closest && e.target.closest("#gallery a"); if (!a || e.button) return;
      d = { a: a, x: e.clientX, y: e.clientY, on: false, g: null, t: null };
    });
    var bar = null;
    function clear() { if (bar) { bar.remove(); bar = null; } }
    function place(cls, l, t, w, h) { bar = document.createElement("div"); bar.className = cls; bar.style.cssText = "left:" + (l + window.scrollX) + "px;top:" + (t + window.scrollY) + "px;width:" + w + "px;height:" + h + "px"; document.body.appendChild(bar); }
    // Where would a drop at this point go? Over the middle of a photo: swap with it. Between photos (or on their edges): move in there.
    function target(x, y) {
      var cs = colEls(), best = 0, bd = 1e9;
      cs.forEach(function (c, k) { var r = c.getBoundingClientRect(), dd = Math.abs(x - (r.left + r.width / 2)); if (dd < bd) { bd = dd; best = k; } });
      var as = [].slice.call(cs[best].querySelectorAll("a")), cr = cs[best].getBoundingClientRect(), slot = as.length, i;
      for (i = 0; i < as.length; i++) {
        var r = as[i].getBoundingClientRect();
        if (y >= r.top + r.height * .27 && y <= r.bottom - r.height * .27) return as[i] === d.a ? null : { kind: "swap", a: as[i], r: r };
        if (y < r.top + r.height / 2) { slot = i; break; }
      }
      var yy = slot === 0 ? as[0].getBoundingClientRect().top - 7 : slot === as.length ? as[as.length - 1].getBoundingClientRect().bottom + 1 : (as[slot - 1].getBoundingClientRect().bottom + as[slot].getBoundingClientRect().top) / 2 - 3;
      return { kind: "ins", col: best, slot: slot, as: as, x: cr.left, w: cr.width, y: yy };
    }
    document.addEventListener("pointermove", function (e) {
      if (!d) return;
      if (!d.on) {
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) return;
        d.on = true; var r = d.a.getBoundingClientRect(); d.g = d.a.cloneNode(true); d.g.className = "dg-ghost"; d.g.style.cssText = "width:" + r.width + "px;height:" + r.height + "px;overflow:hidden;transform:scale(.5);transform-origin:0 0"; d.ox = (e.clientX - r.left) * .5; d.oy = (e.clientY - r.top) * .5;
        document.body.appendChild(d.g); d.a.classList.add("dg-src");
      }
      d.g.style.left = (e.clientX - d.ox) + "px"; d.g.style.top = (e.clientY - d.oy) + "px";
      clear(); d.t = target(e.clientX, e.clientY);
      if (!d.t) return;
      if (d.t.kind === "swap") place("dg-line", d.t.r.left, d.t.r.top, d.t.r.width, d.t.r.height);
      else place("dg-hbar", d.t.x, d.t.y, d.t.w, 10);
    });
    function end(e) {
      if (!d) return; var x = d; d = null; clear();
      if (!x.on) return;
      x.g.remove(); x.a.classList.remove("dg-src");
      if (!x.t) return;
      var gs = groups(), me = idOf(x.a), gi = -1, pi = -1, k;
      gs.forEach(function (g, c) { var p = g.indexOf(me); if (p > -1) { gi = c; pi = p; } });
      if (x.t.kind === "swap") {
        var tid = idOf(x.t.a), tg = -1, tp = -1; gs.forEach(function (g, c) { var p = g.indexOf(tid); if (p > -1) { tg = c; tp = p; } });
        gs[gi][pi] = tid; gs[tg][tp] = me;
      } else {
        var slot = x.t.slot; if (x.t.col === gi && pi < slot) slot--;
        if (x.t.col === gi && slot === pi) return;
        gs[gi].splice(pi, 1); gs[x.t.col].splice(slot, 0, me);
      }
      parent.__apGroups(gs);
    }
    var cols = document.querySelectorAll("#gallery .mcol"), cd = null, cbar = null, natural = document.getElementById("gallery").getAttribute("data-even") === "0";
    function clearC() { if (cbar) { cbar.remove(); cbar = null; } [].forEach.call(cols, function (c) { c.style.opacity = ""; }); }
    document.addEventListener("pointermove", function (e) {
      if (!cd) return;
      if (cd.kind === "off") {
        var v = Math.max(0, Math.min(1.5, cd.v0 + (e.clientY - cd.y0) / cd.unit)); cd.v = v; cols[cd.i].style.marginTop = (v * cd.unit) + "px";
        var wb = cols[cd.i].__cb; if (wb) wb.style.top = (cols[cd.i].getBoundingClientRect().top + window.scrollY - 50) + "px";
        return;
      }
      var to = cd.to, best = 1e9;
      [].forEach.call(cols, function (c, k) { var r = c.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)); if (d < best) { best = d; to = k; } });
      cd.to = to; clearC();
      cols[cd.i].style.opacity = ".3";
      if (to !== cd.i) {
        var r = cols[to].getBoundingClientRect(), x = to > cd.i ? r.right + 3 : r.left - 3, g = document.getElementById("gallery").getBoundingClientRect();
        cbar = document.createElement("div"); cbar.className = "dg-ins";
        cbar.style.cssText = "left:" + (x + window.scrollX - 4) + "px;top:" + (g.top + window.scrollY - 6) + "px;height:" + (g.height + 12) + "px";
        document.body.appendChild(cbar);
      }
    });
    function cend() {
      if (!cd) return; var x = cd; cd = null; document.body.style.cursor = ""; clearC();
      if (x.kind === "off") { if (x.v !== x.v0) parent.__apOff(x.i, x.v, cols.length); }
      else if (x.to !== x.i) { var gs = groups(), m = gs.splice(x.i, 1)[0]; gs.splice(x.to, 0, m); parent.__apGroups(gs, { from: x.i, to: x.to }); }
    }
    document.addEventListener("pointerup", cend); document.addEventListener("pointercancel", cend);
    function overlay() {
      [].forEach.call(document.querySelectorAll(".dg-cb"), function (o) { o.remove(); }); clearC();
      cols = document.querySelectorAll("#gallery .mcol");
      if (cols.length < 2) return;
      var anchors = document.querySelectorAll("#gallery a"), unit = [].reduce.call(anchors, function (t, a) { return t + a.getBoundingClientRect().height; }, 0) / anchors.length;
      var mt = function (c) { return parseFloat(c.style.marginTop) || 0; };
      [].forEach.call(cols, function (c, i) {
        var r = c.getBoundingClientRect(), w = document.createElement("div"); w.className = "dg-cb"; c.__cb = w;
        w.style.cssText = "left:" + (r.left + window.scrollX) + "px;width:" + r.width + "px;top:" + (r.top + window.scrollY - 50) + "px";
        var mv = document.createElement("button"); mv.type = "button"; mv.className = "dg-mv"; mv.innerHTML = "<b>\u2194</b>"; mv.title = "Drag sideways to put this column somewhere else";
        mv.onpointerdown = function (e) { e.preventDefault(); e.stopPropagation(); cd = { kind: "mv", i: i, to: i }; try { mv.setPointerCapture(e.pointerId); } catch (x) {} document.body.style.cursor = "grabbing"; cols[i].style.opacity = ".3"; };
        w.appendChild(mv);
        if (natural) {
          var ud = document.createElement("button"); ud.type = "button"; ud.className = "dg-ud"; ud.innerHTML = "<b>\u2195</b>"; ud.title = "Drag up or down to set where this column starts";
          ud.onpointerdown = function (e) { e.preventDefault(); e.stopPropagation(); cd = { kind: "off", i: i, y0: e.clientY, v0: mt(c) / unit, v: mt(c) / unit, unit: unit }; try { ud.setPointerCapture(e.pointerId); } catch (x) {} document.body.style.cursor = "ns-resize"; };
          w.appendChild(ud);
        }
        document.body.appendChild(w);
      });
    }
    document.getElementById("gallery").addEventListener("mbuilt", overlay); overlay();
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  }.toString() + ")();";
  function autoPreview(list, c) {
    var box = h("div", { class: "ap" }), seg = h("div", { class: "seg" }), stage = h("div", { class: "ap-stage" });
    var frame = h("iframe", { class: "ap-frame", title: "Preview of the automatic layout", sandbox: "allow-same-origin allow-scripts" });
    [["desktop", "Computer"], ["phone", "Phone"]].forEach(function (x) {
      seg.appendChild(h("button", { type: "button", "aria-pressed": String(apMode === x[0]), text: x[1], onclick: function () { if (apMode !== x[0]) { apMode = x[0]; renderLayout(); } } }));
    });
    box.appendChild(h("div", { class: "ap-head" }, [h("strong", { text: "Preview" }), seg, h("span", { class: "hint", text: apMode === "phone" ? "Switch to Computer to rearrange photos and columns." : "Drag a photo onto another to swap them, or between two photos to move it there. Use ↔ above a column to move it" + (layCfg().even ? "." : ", ↕ to raise or lower it.") })]));
    window.__apGroups = function (gs, mv) {
      var n = gs.length, byId = {}, i, r;
      list.forEach(function (p) { byId[p.id] = p; });
      var next = [], longest = Math.max.apply(null, gs.map(function (g) { return g.length; }));
      for (r = 0; r < longest; r++) gs.forEach(function (g, c) { if (g[r] != null && byId[g[r]]) { next.push(byId[g[r]]); if (n > 1) byId[g[r]].col = c; } });
      if (next.length !== list.length) return;
      for (i = 0; i < next.length; i++) list[i] = next[i];
      if (n > 1 && n <= 6) {
        var cc = layCfg(), patch = { cols: n };
        if (mv && cc.offs.length) { var of = []; for (i = 0; i < n; i++) of.push(cc.offs[i] != null ? cc.offs[i] : 0); var y = of.splice(mv.from, 1)[0]; of.splice(mv.to, 0, y); patch.offs = of; }
        setLayCfg(patch);
      }
      markDirty(); renderLayout();
    };
    window.__apOff = function (idx, val, n) {
      var cc = layCfg(), of = [], i, pat = [0, 0.3, 0.1, 0.42, 0.19, 0.36];
      for (i = 0; i < n; i++) of.push(cc.offs[i] != null ? cc.offs[i] : pat[i % pat.length]);
      of[idx] = Math.max(0, Math.min(1.5, Math.round(val * 20) / 20)); setLayCfg({ offs: of }); renderLayout();
    };
    stage.appendChild(frame); box.appendChild(stage);
    var W = apMode === "phone" ? 390 : 1440;
    function link(p) {
      var q = cropOf(p), src = p.preview || p.src.replace(/^\//, ""), raw = "https://raw.githubusercontent.com/" + cfg.repo + "/" + WB + p.src;
      return '<a href="#" data-id="' + p.id + '"' + (p.col != null ? ' data-col="' + p.col + '"' : "") + (q ? ' class="crop" style="aspect-ratio:' + q.ar + '"' : "") + '><img src="' + escA(src) + '" alt="" ' + (p.w && p.h ? 'width="' + p.w + '" height="' + p.h + '" ' : "") + "onerror=\"this.onerror=null;this.src='" + escA(raw) + "'\"" + (q ? ' style="' + q.css + '"' : "") + "></a>";
    }
    var opts = JSON.stringify({ cols: c.cols, phone: c.phone, even: c.even, offs: c.offs });
    getMasonrySrc().then(function (src) {
      frame.srcdoc = '<!doctype html><html' + (apMode === 'phone' ? ' data-nodrag' : '') + '><head><meta charset="utf-8"><base href="' + escA(location.href) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + pageCss() + '</style></head><body><main class="gut"><div class="gallery" id="gallery'+(c.even?'':'" data-even="0')+'">' + list.map(link).join("") + "</div></main><script>" + src.replace(/<\/script/gi, "<\\/script") + ";window.__m=sajgalMasonry(document.getElementById('gallery'),[].slice.call(document.querySelectorAll('#gallery a'))," + opts + ");" + DRAG_JS + "</scr" + "ipt><style>#gallery a{cursor:grab}.dg-ghost{position:fixed;z-index:9;pointer-events:none;opacity:.8;box-shadow:0 6px 24px rgba(0,0,0,.3)}.dg-src{opacity:.3}.dg-cb{position:absolute;z-index:7;display:flex;gap:6px;justify-content:center}.dg-cb button{font:600 14px/1 sans-serif;height:36px;border:0;border-radius:18px;background:#111;color:#fff;touch-action:none;display:flex;align-items:center;gap:6px;padding:0 14px}.dg-cb b{font-size:28px;line-height:1;font-weight:400}.dg-cb button{width:48px;justify-content:center;padding:0}.dg-mv{cursor:grab}.dg-ud{cursor:ns-resize}.dg-cb button:hover{background:#1565c0}.dg-ins{position:absolute;z-index:8;width:8px;border-radius:4px;background:#1565c0;box-shadow:0 0 0 2px #fff;pointer-events:none}.dg-hbar{position:absolute;z-index:8;border-radius:5px;background:#1565c0;box-shadow:0 0 0 2px #fff;pointer-events:none}.dg-line{position:absolute;z-index:8;box-sizing:border-box;border:8px solid #1565c0;background:rgba(21,101,192,.25);pointer-events:none}</style></body></html>";
    });
    function fit() {
      var sw = stage.clientWidth || 900, k = Math.min(1, sw / W), d = frame.contentDocument, hh = d && d.documentElement ? d.documentElement.scrollHeight : 800;
      frame.style.width = W + "px"; frame.style.height = hh + "px"; frame.style.transform = "scale(" + k + ")"; frame.style.transformOrigin = "top left";
      frame.style.left = apMode === "phone" ? Math.max(0, (sw - W * k) / 2) + "px" : "0px";
      stage.style.height = Math.round(hh * k) + "px";
    }
    frame.onload = function () { fit(); setTimeout(fit, 400); setTimeout(fit, 1500); };
    return box;
  }
  function renderAutoPanel(box, list) {
    var c = layCfg(), ctl = h("div", { class: "auto-ctl" });
    function row(label, opts, cur, key, note) {
      var seg = h("div", { class: "seg" });
      opts.forEach(function (o) {
        seg.appendChild(h("button", { type: "button", "aria-pressed": String(o[0] === cur), text: o[1], onclick: function () { if (o[0] === cur) return; var p = {}; p[key] = o[0]; setLayCfg(p); renderLayout(); } }));
      });
      return h("div", { class: "auto-row" }, [h("span", { class: "auto-label", text: label }), seg, note ? h("span", { class: "hint", text: note }) : null]);
    }
    ctl.appendChild(row("Columns on a computer", [[0, "Auto"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]], c.cols, "cols", "Auto uses 3 to 5, depending on the screen width."));
    ctl.appendChild(row("Columns on a phone", [[1, "1"], [2, "2"]], c.phone, "phone", "One column shows each photo large."));
    ctl.appendChild(row("Bottom edge", [[true, "Even"], [false, "Natural"]], c.even, "even", "Even: all columns end at the same height, with slightly wider columns where there is less to show. Natural: equal columns with staggered tops and bottoms."));
    box.appendChild(h("div", { class: "auto-panel" }, [ctl, autoPreview(list, c)]));
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

  /* ---------- Draft, preview and publish ---------- */
  var publishing = false, saving = false, liveWait = "", confirmPub = false, confirmDiscard = false, noteMsg = "";
  try { noteMsg = sessionStorage.getItem("sajgal-note") || ""; sessionStorage.removeItem("sajgal-note"); } catch (x) {}
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
    } else { var lc = layCfg(); g = '<div class="gallery" id="gallery"' + (lc.cols ? ' data-cols="' + lc.cols + '"' : "") + (lc.phone === 2 ? ' data-phone="2"' : "") + (lc.even ? "" : ' data-even="0"' + (lc.offs.length ? ' data-offs="' + lc.offs.join(",") + '"' : "")) + ">" + list.map(link).join("") + "</div>"; }
    var arrow = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10H3M8 5l-5 5 5 5"/></svg>';
    return { name: name, html: '<!doctype html><html><head><meta charset="utf-8"><base href="' + escA(location.href) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + pageCss() + '</style></head><body><a class="back" href="#">' + arrow + '</a><main class="gut">' + g + "</main></body></html>" };
  }
  function openPreview() {
    var pv = previewDoc(), mode = "desktop";
    var ov = h("div", { class: "pv-over", role: "dialog", "aria-label": "Draft preview" });
    var close = function () { window.removeEventListener("resize", fit); ov.remove(); };
    var seg = h("div", { class: "seg pv-seg" });
    var url = h("span", { class: "pv-url", text: "Screen-size preview of the page you are editing: " + pv.name });
    ov.appendChild(h("div", { class: "pv-chrome" }, [h("span", { class: "pv-dots", text: "● ● ●" }), url, seg, h("button", { type: "button", class: "btn", text: "Close preview", onclick: close })]));
    ov.appendChild(h("div", { class: "pv-note", text: "This is the page you are editing, unsaved changes included, at real page size and scaled to fit your screen." }));
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
  var FRIENDLY = { layout: "Photo layout", fashion: "Selected fashion", shows: "All shows", editorial: "Editorial", personal: "Personal work", brands: "Commercial", videos: "Video page", landing: "Home background", seo: "SEO and contact" };
  // The page of the site that matches what is being edited, so the draft opens right there.
  function draftPath() {
    if (editing && ENT[tab]) return editing.origSlug ? ENT[tab].base + "/" + editing.origSlug : ENT[tab].base;
    return { fashion: "/fashion-shows", shows: "/fashion", editorial: "/editorial", personal: "/personal", brands: "/commercial", videos: "/video", landing: "/", seo: "/" }[tab] || "/";
  }
  function previewBase() { return cfg.previewBase || "https://" + WB + "." + cfg.repo.split("/")[1] + ".pages.dev"; }
  function ghJson(path, opts) {
    return api(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || ("GitHub returned " + r.status)); e.status = r.status; throw e; } return j; });
    });
  }
  function ensureDraft() {
    return api("/git/ref/heads/" + WB).then(function (r) {
      if (r.ok) return;
      if (r.status !== 404) throw new Error("GitHub returned " + r.status + " while checking the draft.");
      return ghJson("/git/ref/heads/" + cfg.branch).then(function (m) {
        return ghJson("/git/refs", { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + WB, sha: m.object.sha }) });
      });
    });
  }
  function refreshDraft() {
    return Promise.all([ghJson("/git/ref/heads/" + WB), ghJson("/git/ref/heads/" + cfg.branch)]).then(function (r) {
      D.head = r[0].object.sha; D.main = r[1].object.sha;
      if (D.head === D.main) return { ahead_by: 0, behind_by: 0, files: [] };
      return ghJson("/compare/" + encodeURIComponent(cfg.branch) + "..." + encodeURIComponent(WB));
    }).then(function (c) {
      D.ahead = c.ahead_by || 0; D.behind = c.behind_by || 0;
      D.files = (c.files || []).map(function (f) { return f.filename; });
      if (!D.ahead && D.behind) {
        /* nothing unpublished, but the live site moved on (for example a code update): bring the draft up to date */
        return api("/git/refs/heads/" + WB, { method: "PATCH", body: JSON.stringify({ sha: D.main, force: true }) }).then(function () { D.head = D.main; D.behind = 0; D.loaded = true; pv.state = ""; renderDraft(); });
      }
      if (D.ahead && D.behind && !D.merging) {
        /* unpublished edits, and the live site got a code update: bring the update into the draft so the preview uses the same code */
        D.merging = true;
        return api("/merges", { method: "POST", body: JSON.stringify({ base: WB, head: cfg.branch, commit_message: "Bring site updates into the draft" }) }).then(function () { D.merging = false; return refreshDraft(); }, function () { D.merging = false; D.loaded = true; pv.state = ""; renderDraft(); watchPreview(); });
      }
      D.loaded = true; pv.state = ""; renderDraft(); watchPreview();
    }).catch(function (e) { D.loaded = true; D.error = e.message; renderDraft(); });
  }
  function areas() {
    var names = {}, media = 0;
    D.files.forEach(function (f) {
      var m = /^data\/(\w+)\.json$/.exec(f);
      if (m) names[FRIENDLY[m[1]] || m[1]] = 1; else if (/^(images|videos)\//.test(f)) media++;
    });
    var out = Object.keys(names);
    if (media) out.push(media + " new file" + (media > 1 ? "s" : ""));
    return out.join(", ");
  }
  function watchPreview() {
    clearTimeout(pv.timer);
    if (!D.ahead || !D.head) return;
    var tries = 0;
    (function tick() {
      fetch(previewBase() + "/_build.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
        var ok = !!(j && j.sha && j.sha === D.head);
        if (ok !== (pv.state === "ready") || !pv.state) { pv.state = ok ? "ready" : "building"; renderDraft(); }
        if (!ok && ++tries < 60) pv.timer = setTimeout(tick, 6000);
      });
    })();
  }
  function watchLive(sha) {
    liveWait = sha; renderDraft(); var tries = 0;
    (function tick() {
      fetch("/_build.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
        if (liveWait !== sha) return;
        if (j && j.sha === sha) { liveWait = ""; renderDraft(); }
        else if (++tries < 90) setTimeout(tick, 6000); else { liveWait = ""; renderDraft(); }
      });
    })();
  }
  function publish() {
    publishing = true; confirmPub = false; renderDraft();
    ghJson("/git/ref/heads/" + WB).then(function (d) {
      return ghJson("/git/refs/heads/" + cfg.branch, { method: "PATCH", body: JSON.stringify({ sha: d.object.sha, force: false }) }).catch(function (e) {
        if (e.status === 422) return ghJson("/merges", { method: "POST", body: JSON.stringify({ base: cfg.branch, head: WB, commit_message: "Publish draft" }) });
        throw e;
      });
    }).then(function () {
      return ghJson("/git/ref/heads/" + cfg.branch).then(function (m) {
        return api("/git/refs/heads/" + WB, { method: "PATCH", body: JSON.stringify({ sha: m.object.sha, force: true }) });
      });
    }).then(function () {
      publishing = false; noteMsg = "Published. The live site is up to date."; return refreshDraft().then(function () { watchLive(D.main); });
    }).catch(function (e) { publishing = false; noteMsg = ""; setStatus("Could not publish: " + e.message, true); refreshDraft(); });
  }
  function discard() {
    publishing = true; confirmDiscard = false; renderDraft();
    ghJson("/git/ref/heads/" + cfg.branch).then(function (m) {
      return ghJson("/git/refs/heads/" + WB, { method: "PATCH", body: JSON.stringify({ sha: m.object.sha, force: true }) });
    }).then(function () {
      try { sessionStorage.setItem("sajgal-note", "Draft reset to the live site."); } catch (x) {}
      dirty = {}; location.reload();
    }).catch(function (e) { publishing = false; setStatus("Could not discard: " + e.message, true); renderDraft(); });
  }
  function renderDraft() {
    var bar = $("#draftbar");
    bar.hidden = false; bar.innerHTML = "";
    var unsaved = Object.keys(dirty).some(function (k) { return dirty[k]; });
    var left = h("div", { class: "db-state" }), subs = [], tone = "ok", head = "";
    if (!D.loaded) { tone = "busy"; head = "Checking the draft…"; }
    else if (D.error) { tone = "err"; head = "Could not read the draft state: " + D.error; }
    else if (saving) { tone = "busy"; head = "Saving to the draft…"; }
    else if (publishing) { tone = "busy"; head = "Working…"; }
    else if (D.ahead) {
      areas() && subs.push("Changed: " + areas());
      if (pv.state === "ready") { tone = "warn"; head = "Draft is ready to preview. Not public yet."; }
      else { tone = "busy"; head = "Updating the draft preview… usually about a minute."; }
    } else if (liveWait) { tone = "busy"; head = "Publishing… the live site is updating, usually about a minute."; }
    else { head = noteMsg || "Draft and live site are the same"; }
    left.appendChild(h("span", { class: "db-dot " + (tone === "err" ? "warn" : tone) })); left.appendChild(h("strong", { text: head }));
    bar.className = "draftbar s-" + tone;
    if (unsaved) subs.push("You have edits that are not saved yet.");
    subs.forEach(function (t) { if (t) left.appendChild(h("span", { class: "db-sub", text: t })); });
    left.appendChild(h("button", { type: "button", class: "link db-check", text: "Check again", onclick: function () { refreshDraft(); } }));
    bar.appendChild(left);
    var right = h("div", { class: "db-actions" });
    var kind = meta(tab).kind, pb = $("#prevbtn");
    pb.hidden = !(kind === "photos" || (kind === "entries" && editing)); pb.onclick = openPreview;
    if (D.ahead && !publishing) {
      var dl = h("a", { class: "btn", href: previewBase() + draftPath(), target: "_blank", text: "Open draft site ↗" });
      dl.onclick = function () { dl.href = previewBase() + draftPath(); };
      right.appendChild(dl);
      if (confirmPub) {
        right.appendChild(h("span", { class: "db-ask", text: "Make these changes public on the live site?" }));
        right.appendChild(h("button", { type: "button", class: "btn primary", text: "Yes, publish", onclick: publish }));
        right.appendChild(h("button", { type: "button", class: "link", text: "Cancel", onclick: function () { confirmPub = false; renderDraft(); } }));
      } else if (confirmDiscard) {
        right.appendChild(h("span", { class: "db-ask", text: "Throw away all unpublished changes?" }));
        right.appendChild(h("button", { type: "button", class: "btn primary", text: "Yes, discard", onclick: discard }));
        right.appendChild(h("button", { type: "button", class: "link", text: "Cancel", onclick: function () { confirmDiscard = false; renderDraft(); } }));
      } else {
        right.appendChild(h("button", { type: "button", class: "btn primary", text: "Publish to live site", onclick: function () { confirmPub = true; renderDraft(); } }));
        right.appendChild(h("button", { type: "button", class: "link", text: "Discard draft", onclick: function () { confirmDiscard = true; renderDraft(); } }));
      }
    }
    bar.appendChild(right);
    $("#save").textContent = "Save to draft";
  }

  /* ---------- Grid (photos and videos) ---------- */
  function mediaEl(p, isVid) {
    var el, rawUrl = "https://raw.githubusercontent.com/" + cfg.repo + "/" + WB + (isVid ? p.src : (p.thumb || p.src));
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
        animation: 150, ghostClass: "sortable-ghost", filter: "input,.del,.rep", preventOnFilter: false, disabled: true,
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
        if (v.thumb) { var im = new Image(); im.alt = ""; im.src = v.preview || v.thumb.replace(/^\//, ""); im.onerror = function () { im.onerror = null; im.src = "https://raw.githubusercontent.com/" + cfg.repo + "/" + WB + v.thumb; }; thumb.appendChild(im); }
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
    box.appendChild(h("h1", { class: "pg-title", text: "SEO and contact details" }));
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
    shareImg.onerror = function () { shareImg.onerror = null; shareImg.src = "https://raw.githubusercontent.com/" + cfg.repo + "/" + WB + (site.ogImage || "/images/og.jpg"); };
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
    else if (k === "photos") hint = "Captions and alt text. To reorder photos, use the Layout view. Alt text describes the photo for Google and screen readers; blank is filled in automatically.";
    else if (k === "entries" && editing) hint = "Captions and alt text. To reorder photos, use the Layout view; the first photo is the cover.";
    $("#hint").textContent = hint;
    $("#empty").textContent = k === "videos" ? "No videos yet. Add up to " + m.max + " MP4 or WebM clips." : "No photos yet. Drop images here or use Add photos.";
  }
  function layout() {
    try { localStorage.setItem("sajgal-admin-pos", JSON.stringify({ tab: tab, view: view, slug: editing ? editing.slug : "" })); } catch (x) {}
    var m = meta(tab), k = m.kind, grid = k === "photos" || k === "videos" || (k === "entries" && !!editing);
    $("#addbtn").hidden = !grid; $("#drop").hidden = !grid;
    $("#fromshows").hidden = $("#randombtn").hidden = !(tab === "fashion" && !editing);
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
    var sl = $("#seolink"); sl.hidden = false; sl.setAttribute("aria-current", tab === "seo" ? "page" : "false");
    TABS.forEach(function (c) {
      if (c.id === "seo") return;
      t.appendChild(h("button", { type: "button", role: "tab", class: c.id === "videos" ? "sep" : false, "aria-selected": String(c.id === tab), text: c.label, onclick: function () {
        if (c.id === tab && !editing) return;
        tab = c.id; editing = null; view = "text"; lay = null; setStatus(""); tabs(); layout();
      } }));
    });
  }
  $("#fromshows").onclick = openFromShows; $("#randombtn").onclick = openRandom;
  $("#seolink").onclick = function (e) {
    e.preventDefault(); if (tab === "seo" && !editing) return;
    tab = "seo"; editing = null; view = "text"; lay = null; setStatus(""); tabs(); layout();
  };
  function start() {
    $("#setup").hidden = true; $("#editor").hidden = false; $("#disconnect").hidden = false;
    setStatus("Loading…");
    ensureDraft().then(function () { return Promise.all(TABS.map(function (c) { return load(c.id); }).concat([loadLayoutFile()])); }).then(function () {
      setStatus("");
      try {
        var pos = JSON.parse(localStorage.getItem("sajgal-admin-pos") || "null");
        if (pos && pos.tab && meta(pos.tab)) {
          tab = pos.tab;
          if (pos.slug && ENT[tab]) editing = (state[tab] || []).filter(function (x) { return x.slug === pos.slug; })[0] || null;
          if ((pos.view === "layout") && (meta(tab).kind === "photos" || editing)) view = "layout";
        }
      } catch (x) {}
      tabs(); layout(); refreshDraft();
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

  setInterval(function () { if (cfg && cfg.token && D.loaded && !publishing && !document.hidden) refreshDraft(); }, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && cfg && cfg.token && D.loaded && !publishing) refreshDraft(); });
  if (cfg && cfg.token) start(); else $("#setup").hidden = false;
})();
