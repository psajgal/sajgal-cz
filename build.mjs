// Builds the static site into ./dist (run by Cloudflare Pages on every change; no packages needed).
//   node build.mjs            -> dist/        (real site, clean URLs like /fashion/bfw-aw26)
//   node build.mjs --preview  -> dist-preview/ (relative .html links, for opening without a server)
// Reads data/*.json (edited by admin.html) and writes pages with titles, descriptions,
// share cards, structured data, sitemap.xml, robots.txt, _redirects and _headers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW = process.argv.includes("--preview");
// Cloudflare Pages builds every branch; only "main" is the public site. Other branches (the admin's draft) are previews: kept out of Google.
const BRANCH = process.env.CF_PAGES_BRANCH || "main";
const DRAFT_BUILD = BRANCH !== "main";
const REPO = (JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")).repository || "").replace(/^https?:\/\/github\.com\//, "");
const OUT = path.join(ROOT, PREVIEW ? "dist-preview" : "dist");
const THUMB_EDGE = 1000;
const warnings = [];
const warn = (m) => warnings.push(m);

/* ---------- data ---------- */
function readJSON(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch (e) {
    if (e.code === "ENOENT") return fallback;
    console.error(`Cannot read ${rel}: ${e.message}`); process.exit(1);
  }
}

const DEFAULT_SEO = {
  site: {
    url: "https://sajgal.cz",
    name: "Petr Šajgal",
    tagline: "Fashion photographer",
    country: "Czechia",
    email: "info@sajgal.cz",
    instagram: "petr.sajgal",
    reddit: "psajgal",
    ogImage: "/images/og.jpg",
    mediaUrl: "",
    bio: []
  },
  pages: {
    "home": {
      title: "Petr Šajgal – Fashion photographer",
      description: "Czech fashion photographer. Runway, backstage and editorial photography from Mercedes-Benz Prague Fashion Week, Berlin Fashion Week and designer shows."
    },
    "fashion-shows": {
      title: "Fashion show photography – selected work | Petr Šajgal",
      description: "Selected runway and backstage photography from Prague Fashion Week, Berlin Fashion Week and designer shows, by Czech fashion photographer Petr Šajgal."
    },
    "fashion": {
      title: "All fashion shows – runway photo archive | Petr Šajgal",
      description: "Every fashion show photographed by Petr Šajgal, from Prague to Berlin Fashion Week and designer shows. Open a show for its full set of runway photos."
    },
    "editorial": {
      title: "Fashion editorial photography | Petr Šajgal",
      description: "Fashion editorials by Czech photographer Petr Šajgal, shot with designers, models and magazines."
    },
    "personal": {
      title: "Personal photography projects | Petr Šajgal",
      description: "Personal work by Czech photographer Petr Šajgal: projects made outside of commissions."
    },
    "commercial": {
      title: "Commercial and campaign photography | Petr Šajgal",
      description: "Commercial photography by Petr Šajgal for brands including Kamera, Kido Collective and Converse."
    },
    "video": {
      title: "Fashion video – reels and runway films | Petr Šajgal",
      description: "Fashion video by Czech photographer and videographer Petr Šajgal: runway reels and backstage films from Prague Fashion Week, Berlin Fashion Week and magazine work."
    },
    "contact": {
      title: "Contact – Petr Šajgal, fashion photographer",
      description: "Get in touch with Czech fashion photographer Petr Šajgal for runway coverage, editorials and commissions. Email info@sajgal.cz."
    }
  }
};

const seoFile = readJSON("data/seo.json", {});
const S = {
  site: { ...DEFAULT_SEO.site, ...(seoFile.site || {}) },
  pages: Object.fromEntries(Object.keys(DEFAULT_SEO.pages).map((k) => [k, { ...DEFAULT_SEO.pages[k], ...clean((seoFile.pages || {})[k]) }]))
};
function clean(o) { return Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === "string" && v.trim() !== "")); }

const SITE = S.site.url.replace(/\/$/, "");
const NAME = S.site.name;
const YEAR = new Date().getFullYear();
const INSTAGRAM = S.site.instagram ? `https://www.instagram.com/${S.site.instagram}/` : "";
const REDDIT = S.site.reddit ? `https://www.reddit.com/user/${S.site.reddit}/` : "";

const CATS = [
  { key: "fashion-shows", data: "fashion", route: "/fashion-shows", label: "Fashion shows", h1: "Fashion show photography: selected work", ctx: "Fashion show photography" },
  { key: "editorial", data: "editorial", route: "/editorial", label: "Editorial", h1: "Fashion editorial photography", ctx: "Fashion editorial photography" },
  { key: "personal", data: "personal", route: "/personal", label: "Personal work", h1: "Personal photography projects", ctx: "Personal photography project" }
];

const photos = (arr) => (Array.isArray(arr) ? arr : []).filter((p) => p && p.image);
const shows = (Array.isArray(readJSON("data/shows.json", [])) ? readJSON("data/shows.json", []) : [])
  .filter((s) => s && s.slug && s.title)
  .map((s) => ({ ...s, photos: photos(s.photos) }));
const published = shows.filter((s) => s.photos.length > 0);
const brands = (Array.isArray(readJSON("data/brands.json", [])) ? readJSON("data/brands.json", []) : [])
  .filter((b) => b && b.slug && b.title)
  .map((b) => ({ ...b, photos: photos(b.photos) }));
const liveBrands = brands.filter((b) => b.photos.length > 0);
// Videos on the /video page: an Instagram link, a title and a thumbnail. Instagram only loads when a visitor clicks.
const igId = (u) => { const m = /instagram\.com\/(?:[^/?#]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(String(u || "")); return m ? m[2] : ""; };
// Automatic photo layout: columns on desktop (0 = automatic), columns on phones, even column bottoms. Lists keep theirs in data/layout.json, shows and brands on the entry itself.
const LAYOUTS = readJSON("data/layout.json", {}) || {};
const layoutAttrs = (cfg) => {
  if (!cfg || typeof cfg !== "object") return "";
  const cols = Math.round(+cfg.cols) >= 2 && Math.round(+cfg.cols) <= 6 ? Math.round(+cfg.cols) : 0;
  return (cols ? ` data-cols="${cols}"` : "") + (+cfg.phone === 2 ? ' data-phone="2"' : "") + (cfg.even === false ? ' data-even="0"' : "") + (cfg.even === false && Array.isArray(cfg.offs) && cfg.offs.length ? ` data-offs="${cfg.offs.slice(0, 6).map((v) => Math.max(0, Math.min(1.5, +v || 0))).join(",")}"` : "");
};
const videos = (Array.isArray(readJSON("data/videos.json", [])) ? readJSON("data/videos.json", []) : [])
  .map((v) => ({ ...v, id: igId(v.ig) }))
  .filter((v) => v.id)
  .map((v) => ({ ...v, permalink: `https://www.instagram.com/${/instagram\.com\/(?:[^/?#]+\/)?(?:p)\//.test(v.ig) ? "p" : "reel"}/${v.id}/` }));
const landing = (Array.isArray(readJSON("data/landing.json", [])) ? readJSON("data/landing.json", []) : []).filter((v) => v && v.video);

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Optional separate address for photos and videos (for example https://media.sajgal.cz). Empty = same site.
const MEDIA = String(S.site.mediaUrl || "").trim().replace(/\/+$/, "");
const isMedia = (p) => /^\/?(images|videos)\//.test(p);
const abs = (p) => (/^https?:/.test(p) ? p : (MEDIA && isMedia(p) ? MEDIA : SITE) + (p.startsWith("/") ? p : "/" + p));
const isRaster = (p) => !/\.svg(\?|$)/i.test(p);
const ld = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const trim = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const cut = s.slice(0, n - 1); return cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:.\s]+$/, "") + "…"; };
function niceDate(d) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d || "");
  if (!m) return d || "";
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
  return dt.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric", ...(m[3] ? { day: "numeric" } : {}) });
}
function thumbOf(p) {
  if (!p.thumb || !p.w || !p.h) return null;
  const k = Math.min(1, THUMB_EDGE / Math.max(p.w, p.h));
  return { src: p.thumb, w: Math.round(p.w * k) };
}

// Links and asset paths: clean absolute URLs on the real site, relative .html files in preview.
let CUR = "/";
const fileOf = (route) => (route === "/" ? "index.html" : route.slice(1) + ".html");
function L(route) {
  if (!PREVIEW) return route;
  return path.posix.relative(path.posix.dirname(fileOf(CUR)), fileOf(route)) || fileOf(route);
}
function A(p) {
  p = p.replace(/^\//, "");
  if (MEDIA && isMedia(p)) return MEDIA + "/" + p;
  if (!PREVIEW) return "/" + p;
  return path.posix.relative(path.posix.dirname(fileOf(CUR)), p);
}

const ARROW = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 10H3M8 5l-5 5 5 5"/></svg>';

function checkMeta(route, title, desc) {
  if (title.length > 65) warn(`${route}: title is ${title.length} characters (Google shows about 60).`);
  if (title.length < 20) warn(`${route}: title is very short (${title.length} characters).`);
  if (desc.length > 165) warn(`${route}: description is ${desc.length} characters (Google shows about 155).`);
  if (desc.length < 70) warn(`${route}: description is short (${desc.length} characters); 70 to 155 works best.`);
}

/* ---------- page shell ---------- */
function shell({ route, title, description, ogImage, ogAlt, ogType = "website", noindex = false, jsonld, preloads = [], bodyClass = "", body, scripts = [], lang = "en" }) {
  const url = SITE + (route === "/" ? "/" : route);
  const img = ogImage && isRaster(ogImage.src) ? ogImage : { src: S.site.ogImage, w: 1200, h: 630 };
  const robots = noindex || DRAFT_BUILD ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
${PREVIEW ? "" : `<link rel="canonical" href="${esc(url)}">\n`}<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="en_GB">
<meta property="og:image" content="${esc(abs(img.src))}">
${img.w ? `<meta property="og:image:width" content="${img.w}">\n<meta property="og:image:height" content="${img.h}">\n` : ""}<meta property="og:image:alt" content="${esc(ogAlt || `${NAME}, ${S.site.tagline.toLowerCase()}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(abs(img.src))}">
<link rel="icon" href="${A("favicon.svg")}" type="image/svg+xml">
<link rel="preload" href="${A("fonts/archivo-lat.woff2")}" as="font" type="font/woff2" crossorigin>
${preloads.join("\n")}${preloads.length ? "\n" : ""}<link rel="stylesheet" href="${A("style.css")}">
${jsonld ? `<script type="application/ld+json">${ld(jsonld)}</script>\n` : ""}</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${body}
${scripts.concat(DRAFT_BUILD ? ["draft.js"] : []).map((s) => `<script src="${A(s)}" defer></script>`).join("\n")}
</body>
</html>
`;
}

const back = (route, label) => `<a class="back" href="${L(route)}" aria-label="${esc(label)}">${ARROW}</a>`;

const person = () => ({
  "@type": "Person",
  "@id": SITE + "/#person",
  name: NAME,
  url: SITE + "/",
  jobTitle: "Photographer",
  description: S.site.bio.length ? S.site.bio[0] : `${S.site.tagline} from ${S.site.country}.`,
  nationality: { "@type": "Country", name: S.site.country },
  knowsAbout: ["Fashion photography", "Runway photography", "Backstage photography", "Editorial photography"],
  ...(S.site.email ? { email: S.site.email } : {}),
  ...(INSTAGRAM || REDDIT ? { sameAs: [INSTAGRAM, REDDIT].filter(Boolean) } : {})
});
const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, route], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + (route === "/" ? "/" : route) }))
});
function imageObjects(items, ctx) {
  return items.slice(0, 40).map((p, i) => ({
    "@type": "ImageObject",
    contentUrl: abs(p.image),
    ...(thumbOf(p) ? { thumbnailUrl: abs(thumbOf(p).src) } : {}),
    name: altFor(p, ctx, i),
    ...(p.caption ? { caption: p.caption } : {}),
    ...(p.w && p.h ? { width: p.w, height: p.h } : {}),
    creator: { "@type": "Person", name: NAME, url: SITE + "/" },
    creditText: NAME,
    copyrightNotice: `© ${YEAR} ${NAME}`
  }));
}

/* ---------- gallery ---------- */
function altFor(p, ctx, i) {
  if (p.alt && p.alt.trim()) return p.alt.trim();
  if (p.caption && p.caption.trim()) return `${p.caption.trim()} – photo by ${NAME}`;
  return `${ctx} – photo ${i + 1} by ${NAME}`;
}
// A photo can be cropped on the page without touching the file: `ar` (for example "4/5") is the shape,
// `fx` and `fy` (0 to 100) say which part stays in view and `z` zooms in. The lightbox still shows the whole photo.
function cropOf(p) {
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(String(p.ar || ""));
  if (!m) return null;
  const cl = (v, lo, hi, d) => (Number.isFinite(+v) && v !== "" && v != null ? Math.min(hi, Math.max(lo, +v)) : d);
  const fx = cl(p.fx, 0, 100, 50), fy = cl(p.fy, 0, 100, 50), z = cl(p.z, 1, 4, 1), r = (n) => +n.toFixed(2);
  return { ar: `${m[1]} / ${m[2]}`, img: `position:absolute;width:${r(z * 100)}%;height:${r(z * 100)}%;max-width:none;left:-${r((z - 1) * fx)}%;top:-${r((z - 1) * fy)}%;object-fit:cover;object-position:${r(fx)}% ${r(fy)}%` };
}
function photoLink(p, i, ctx, sizes, pin = false) {
  const t = thumbOf(p), eager = i < 4, crop = cropOf(p);
  const attrs = [
    `src="${esc(A(t ? t.src : p.image))}"`,
    t ? `srcset="${esc(A(t.src))} ${t.w}w, ${esc(A(p.image))} ${p.w}w" sizes="${sizes}"` : "",
    `alt="${esc(altFor(p, ctx, i))}"`,
    p.w && p.h ? `width="${p.w}" height="${p.h}"` : "",
    eager ? (i === 0 ? 'fetchpriority="high"' : "") : 'loading="lazy"',
    'decoding="async"',
    crop ? `style="${crop.img}"` : ""
  ].filter(Boolean).join(" ");
  return `<a href="${esc(A(p.image))}"${pin && Number.isInteger(p.col) && p.col >= 0 && p.col < 6 ? ` data-col="${p.col}"` : ""}${crop ? ` class="crop" style="aspect-ratio:${crop.ar}"` : ""} data-cap="${esc(p.caption || "")}"><img ${attrs}></a>`;
}
// A page's photos can carry a hand-made layout: `row` groups photos side by side, `cols` is the column width
// out of 12 (set on the first photo of a column) and `stack` puts a photo under the one before it.
function rowGallery(items, ctx, extraClass = "") {
  const sizesFor = (w) => `(max-width:700px) 100vw, ${Math.round((w / 12) * 100)}vw`;
  const rows = [];
  items.forEach((p, i) => {
    const r = p.row ?? (rows.length + 1);
    let row = rows[rows.length - 1];
    if (!row || row.id !== r) { row = { id: r, cols: [], al: p.al }; rows.push(row); }
    if (p.stack && row.cols.length) row.cols[row.cols.length - 1].html.push(photoLink(p, i, ctx, sizesFor(p.cols || 6)));
    else row.cols.push({ w: p.cols || 6, html: [photoLink(p, i, ctx, sizesFor(p.cols || 6))] });
  });
  const J = { center: "center", end: "flex-end" };
  const out = rows.map((r) => `<div class="row"${J[r.al] ? ` style="--j:${J[r.al]}"` : ""}>${r.cols.map((c) => `<div class="col" style="--w:${c.w}">${c.html.join("")}</div>`).join("")}</div>`);
  return `<div class="gallery rows${extraClass ? " " + extraClass : ""}" id="gallery">\n${out.join("\n")}\n</div>`;
}
function gallery(items, ctx, extraClass = "", cfg = null) {
  if (items.some((p) => p.row != null)) return rowGallery(items, ctx, extraClass);
  const rows = items.map((p, i) => photoLink(p, i, ctx, "(max-width:640px) 100vw, (max-width:1300px) 33vw, 25vw", true));
  return `<div class="gallery${extraClass ? " " + extraClass : ""}" id="gallery"${layoutAttrs(cfg)}>\n${rows.join("\n")}\n</div>`;
}

/* ---------- pages ---------- */
const pages = [];     // { file, html }
const sitemap = [];   // { route, images: [{loc, title}] }
function emit(route, html) { pages.push({ file: fileOf(route), html }); }

function render() {
  /* Home */
  CUR = "/";
  {
    const pg = S.pages.home;
    checkMeta("/", pg.title, pg.description);
    // Three columns; clip n goes to column n mod 3. home.js plays each column's clips one after another.
    const clipsJson = esc(JSON.stringify(landing.map((v) => ({ d: A(v.video), m: A(v.mobile || v.video), p: v.poster ? A(v.poster) : "" }))));
    const vids = [0, 1, 2].map((k) => { const c = landing.filter((_, i) => i % 3 === k)[0] || landing[0]; return c ? `<div class="vcol"${c.poster ? ` style="background-image:url('${esc(A(c.poster))}')"` : ""}></div>` : ""; }).join("");
    if (!landing.length) warn("Home: no background videos in data/landing.json.");
    const body = `<main class="home">
  <div class="bg" id="bg" aria-hidden="true" data-clips="${clipsJson}">${vids}</div>
  <header class="top gut">
    <h1 class="name disp"><a href="${L("/")}">${esc(NAME)}</a><span class="sr"> – ${esc(S.site.tagline)}</span></h1>
    <nav aria-label="Contact"><a href="${L("/contact")}">Contact</a></nav>
  </header>
  <nav class="menu gut" aria-label="Sections">
    <a class="disp" href="${L("/fashion-shows")}">Fashion shows</a>
    <a class="disp" href="${L("/editorial")}">Editorial</a>
    <a class="disp" href="${L("/commercial")}">Commercial</a>${videos.length ? `
    <a class="disp" href="${L("/video")}">Video</a>` : ""}
    <a class="disp" href="${L("/personal")}">Personal work</a>
  </nav>
</main>`;
    emit("/", shell({
      route: "/", title: pg.title, description: pg.description,
      jsonld: { "@context": "https://schema.org", "@graph": [person(), { "@type": "WebSite", "@id": SITE + "/#website", url: SITE + "/", name: NAME, inLanguage: "en", publisher: { "@id": SITE + "/#person" } }] },
      preloads: landing[0] && landing[0].poster ? [`<link rel="preload" href="${A(landing[0].poster)}" as="image" fetchpriority="high">`] : [],
      body, scripts: ["home.js"]
    }));
    sitemap.push({ route: "/", images: [] });
  }

  /* Category pages */
  for (const c of CATS) {
    CUR = c.route;
    const items = photos(readJSON(`data/${c.data}.json`, []));
    const pg = S.pages[c.key];
    const live = items.some((p) => isRaster(p.image));
    checkMeta(c.route, pg.title, pg.description);
    if (!live) warn(`${c.route}: no real photos yet (empty or only grey placeholders), so the page is hidden from search engines until you add some.`);
    let more = "";
    if (c.key === "fashion-shows" && published.length) {
      more = `<a class="toplink" href="${L("/fashion")}">All shows <span aria-hidden="true">→</span></a>\n`;
    }
    const body = `${back("/", "Back to home")}
${more}<main class="gut">
<h1 class="sr">${esc(c.h1)}</h1>
${gallery(items, c.ctx, "", LAYOUTS[c.data])}
</main>`;
    const first = items.find((p) => isRaster(p.image));
    emit(c.route, shell({
      route: c.route, title: pg.title, description: pg.description, noindex: !live,
      ogImage: first ? { src: first.image, w: first.w, h: first.h } : null, ogAlt: first ? altFor(first, c.ctx, 0) : "",
      jsonld: { "@context": "https://schema.org", "@graph": [crumbs([["Home", "/"], [c.label, c.route]]), { "@type": "ImageGallery", "@id": SITE + c.route + "#gallery", url: SITE + c.route, name: c.h1, description: pg.description, inLanguage: "en", isPartOf: { "@id": SITE + "/#website" }, author: { "@type": "Person", name: NAME, url: SITE + "/" }, image: imageObjects(items, c.ctx) }] },
      body, scripts: ["masonry.js", "site.js"]
    }));
    if (live) sitemap.push({ route: c.route, images: items.filter((p) => isRaster(p.image)).slice(0, 1000).map((p, i) => ({ loc: p.image, title: altFor(p, c.ctx, i), caption: p.caption })) });
  }

  /* All shows (index) */
  CUR = "/fashion";
  {
    const pg = S.pages.fashion;
    checkMeta("/fashion", pg.title, pg.description);
    const live = published.length > 0;
    if (!live) warn("/fashion: no show has photos yet, so the page is hidden from search engines.");
    // Computer: like the Commercial page, a row of photos per show with its title and a short line. Phone: one cover per show.
    const cards = published.map((s, i) => {
      const cover = coverOf(s), href = L("/fashion/" + s.slug);
      const sub = [s.event, niceDate(s.date)].filter(Boolean).join(" · ");
      const line = ((s.summary && s.summary.trim()) || ((s.description || "").split(/(?<=[.!?])\s/)[0] || "")).trim();
      const shown = [cover, ...s.photos.filter((p) => p !== cover)].slice(0, 4);
      const imgs = shown.map((p, k) => {
        const t = thumbOf(p), attrs = `src="${esc(A(t ? t.src : p.image))}" alt="${k === 0 ? esc(altFor(p, s.title + " fashion show", 0)) : ""}"${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ""}${i < 2 && k < 4 ? "" : ' loading="lazy"'} decoding="async"`;
        return k === 0 ? `<a href="${href}"><img ${attrs}></a>` : `<a href="${href}" tabindex="-1" aria-hidden="true"><img ${attrs}></a>`;
      }).join("");
      return `<section class="brand fshow">
<div class="cluster">${imgs}</div>
<h2 class="disp"><a href="${href}">${esc(s.title)}</a></h2>
${sub ? `<p class="meta">${esc(sub)}</p>` : ""}${line ? `\n<p class="line">${esc(line)}</p>` : ""}
<a class="all" href="${href}">View all ${s.photos.length} photos <span aria-hidden="true">→</span></a>
</section>`;
    }).join("\n");
    const body = `${back("/fashion-shows", "Back to selected fashion shows work")}
<main class="gut">
<h1 class="sr">All fashion shows</h1>
<div class="fshows">
${cards}
</div>
</main>`;
    const first = published[0] ? coverOf(published[0]) : null;
    emit("/fashion", shell({
      route: "/fashion", title: pg.title, description: pg.description, noindex: !live,
      ogImage: first && isRaster(first.image) ? { src: first.image, w: first.w, h: first.h } : null,
      jsonld: { "@context": "https://schema.org", "@graph": [crumbs([["Home", "/"], ["Fashion shows", "/fashion-shows"], ["All shows", "/fashion"]]), { "@type": "CollectionPage", "@id": SITE + "/fashion#page", url: SITE + "/fashion", name: "All fashion shows", description: pg.description, isPartOf: { "@id": SITE + "/#website" }, mainEntity: { "@type": "ItemList", itemListElement: published.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/fashion/${s.slug}`, name: s.title })) } }] },
      body
    }));
    if (live) sitemap.push({ route: "/fashion", images: [] });
  }

  /* One page per show, and one per brand */
  const SHOW_CFG = {
    base: "/fashion", listLabel: "All shows", crumbs: (s) => [["Home", "/"], ["All shows", "/fashion"], [s.title, "/fashion/" + s.slug]],
    ctx: (s) => `${s.title} fashion show`, titleTail: "fashion show photos", more: "More shows", noun: "show", live: published,
    facts: (s, when) => [["Event", s.event], ["Designer", s.designer], ["Location", s.location], ["Date", when]],
    auto: (s, when) => `Photos from ${s.title}${s.designer ? ` by ${s.designer}` : ""}${s.location ? `, ${s.location}` : ""}${when ? ` (${when})` : ""}: runway and backstage photography by ${NAME}.`
  };
  const BRAND_CFG = {
    base: "/commercial", listLabel: "All commercial work", crumbs: (s) => [["Home", "/"], ["Commercial", "/commercial"], [s.title, "/commercial/" + s.slug]],
    ctx: (s) => `${s.title} commercial photography`, titleTail: "commercial photography", more: "More brands", noun: "brand", live: liveBrands,
    facts: (s, when) => [["Year", when]],
    auto: (s, when) => `Commercial and campaign photography for ${s.title}${when ? ` (${when})` : ""} by ${NAME}, fashion photographer from ${S.site.country}.`
  };
  function entryPages(cfg, list) {
    list.forEach((s) => {
      const route = cfg.base + "/" + s.slug;
      CUR = route;
      const live = s.photos.length > 0;
      const ctx = cfg.ctx(s);
      const when = cfg === BRAND_CFG ? (s.date || "") : niceDate(s.date);
      const longTitle = `${s.title}${s.event && !s.title.toLowerCase().includes(s.event.toLowerCase()) ? ` (${s.event})` : ""} – ${cfg.titleTail} | ${NAME}`;
      const midTitle = `${s.title} – ${cfg.titleTail} | ${NAME}`;
      const title = (s.seoTitle && s.seoTitle.trim()) || (longTitle.length <= 62 ? longTitle : midTitle.length <= 62 ? midTitle : `${s.title} | ${NAME}`);
      const text = (s.description && s.description.trim()) || (s.summary && s.summary.trim()) || "";
      const description = (s.seoDescription && s.seoDescription.trim()) || (text ? trim(text, 158) : cfg.auto(s, when));
      if (live) checkMeta(route, title, description);
      if (live && !text) warn(`${route}: no description text. Two or three sentences about the ${cfg.noun} help it rank.`);
      const facts = cfg.facts(s, when).filter(([, v]) => v);
      const paras = (s.description || s.summary || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      const idx = cfg.live.findIndex((x) => x.slug === s.slug);
      const others = [];
      for (let k = 1; k < cfg.live.length && others.length < 3; k++) others.push(cfg.live[(Math.max(idx, 0) + k) % cfg.live.length]);
      const allLink = `<p class="more"><a class="disp" href="${L(cfg.base)}">${cfg.listLabel} <span aria-hidden="true">→</span></a></p>`;
      const othersHtml = others.length ? `<nav class="more-shows" aria-label="${cfg.more}">
<h2 class="disp">${cfg.more}</h2>
<ul class="shows">
${others.map((o) => { const cv = coverOf(o), t = thumbOf(cv); return `<li><a class="show" href="${L(cfg.base + "/" + o.slug)}"><img src="${esc(A(t ? t.src : cv.image))}" alt="${esc(altFor(cv, cfg.ctx(o), 0))}"${cv.w && cv.h ? ` width="${cv.w}" height="${cv.h}"` : ""} loading="lazy" decoding="async"><span class="t disp">${esc(o.title)}</span></a></li>`; }).join("\n")}
</ul>
${allLink}
</nav>` : allLink;
      const body = `${back(cfg.base, cfg === BRAND_CFG ? "Back to commercial work" : "Back to all shows")}
<main class="gut">
<header class="show-head">
<h1 class="disp">${esc(s.title)}</h1>
${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
${paras.map((x) => `<p>${esc(x).replace(/\n/g, "<br>")}</p>`).join("\n")}
</header>
${gallery(s.photos, ctx, "after-head", s.layout)}
${live ? othersHtml : ""}
</main>`;
      const first = s.photos.find((p) => isRaster(p.image));
      const dateIso = /^\d{4}-\d{2}(-\d{2})?$/.test(s.date || "") ? s.date : undefined;
      emit(route, shell({
        route, title, description, noindex: !live, ogType: "article",
        ogImage: first ? { src: first.image, w: first.w, h: first.h } : null, ogAlt: first ? altFor(first, ctx, 0) : "",
        jsonld: { "@context": "https://schema.org", "@graph": [crumbs(cfg.crumbs(s)), { "@type": "ImageGallery", "@id": SITE + route + "#gallery", url: SITE + route, name: s.title, description, inLanguage: "en", isPartOf: { "@id": SITE + "/#website" }, author: { "@type": "Person", name: NAME, url: SITE + "/" }, ...(dateIso ? { dateCreated: dateIso } : {}), ...(s.location ? { contentLocation: { "@type": "Place", name: s.location } } : {}), ...(s.designer ? { about: { "@type": "Person", name: s.designer } } : {}), image: imageObjects(s.photos, ctx) }] },
        body, scripts: ["masonry.js", "site.js"]
      }));
      if (live) sitemap.push({ route, images: s.photos.filter((p) => isRaster(p.image)).slice(0, 1000).map((p, i) => ({ loc: p.image, title: altFor(p, ctx, i), caption: p.caption })) });
    });
  }
  entryPages(SHOW_CFG, shows);
  entryPages(BRAND_CFG, brands);

  /* Commercial: a cluster of photos per brand */
  CUR = "/commercial";
  {
    const pg = S.pages.commercial;
    checkMeta("/commercial", pg.title, pg.description);
    const live = liveBrands.length > 0;
    if (!live) warn("/commercial: no brand has photos yet, so the page is hidden from search engines.");
    const blocks = liveBrands.map((b) => {
      const ctx = `${b.title} commercial photography`;
      const shown = b.photos.slice(0, 4);
      const imgs = shown.map((p, i) => { const t = thumbOf(p); return `<a href="${L("/commercial/" + b.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(A(t ? t.src : p.image))}" alt=""${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ""} loading="lazy" decoding="async"></a>`; }).join("");
      const line = ((b.summary && b.summary.trim()) || ((b.description || "").split(/(?<=[.!?])\s/)[0] || "")).trim();
      return `<section class="brand">
<div class="cluster">${imgs}</div>
<h2 class="disp"><a href="${L("/commercial/" + b.slug)}">${esc(b.title)}</a></h2>
${line ? `<p class="line">${esc(line)}</p>` : ""}
<a class="all" href="${L("/commercial/" + b.slug)}">View all ${b.photos.length} photos <span aria-hidden="true">→</span></a>
</section>`;
    }).join("\n");
    const body = `${back("/", "Back to home")}
<main class="gut">
<h1 class="sr">Commercial and campaign photography</h1>
<div class="brands">
${blocks}
</div>
</main>`;
    const first = liveBrands[0] ? coverOf(liveBrands[0]) : null;
    emit("/commercial", shell({
      route: "/commercial", title: pg.title, description: pg.description, noindex: !live,
      ogImage: first && isRaster(first.image) ? { src: first.image, w: first.w, h: first.h } : null,
      jsonld: { "@context": "https://schema.org", "@graph": [crumbs([["Home", "/"], ["Commercial", "/commercial"]]), { "@type": "CollectionPage", "@id": SITE + "/commercial#page", url: SITE + "/commercial", name: "Commercial and campaign photography", description: pg.description, isPartOf: { "@id": SITE + "/#website" }, mainEntity: { "@type": "ItemList", itemListElement: liveBrands.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/commercial/${b.slug}`, name: b.title })) } }] },
      body
    }));
    if (live) sitemap.push({ route: "/commercial", images: [] });
  }

  /* Video */
  CUR = "/video";
  {
    const pg = S.pages.video, live = videos.length > 0;
    checkMeta("/video", pg.title, pg.description);
    const tiles = videos.map((v) => {
      const alt = `${v.title || "Video"} – video by ${NAME}`;
      return `<li><a class="vt" href="${esc(v.permalink)}" target="_blank" rel="noopener" data-ig="${esc(v.permalink)}"><span class="ph">${v.thumb ? `<img src="${esc(A(v.thumb))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : ""}<span class="play" aria-hidden="true"></span></span><span class="t disp">${esc(v.title || "Watch on Instagram")}</span></a></li>`;
    }).join("\n");
    const body = `${back("/", "Back to home")}
<main class="gut">
<h1 class="sr">Fashion video</h1>
<ul class="vgrid">
${tiles}
</ul>
</main>
<div class="vo" id="vo" hidden role="dialog" aria-modal="true" aria-label="Video"><button class="vx" id="vx" type="button">Close</button><div class="vbox" id="vbox"></div></div>`;
    const withThumb = videos.filter((v) => v.thumb && /^\d{4}-\d{2}-\d{2}/.test(v.date || ""));
    emit("/video", shell({
      route: "/video", title: pg.title, description: pg.description, noindex: !live,
      ogImage: videos[0] && videos[0].thumb && isRaster(videos[0].thumb) ? { src: videos[0].thumb } : null,
      jsonld: { "@context": "https://schema.org", "@graph": [crumbs([["Home", "/"], ["Video", "/video"]]), { "@type": "CollectionPage", "@id": SITE + "/video#page", url: SITE + "/video", name: "Fashion video", description: pg.description, isPartOf: { "@id": SITE + "/#website" }, mainEntity: { "@type": "ItemList", itemListElement: videos.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: v.permalink, name: v.title || v.id })) } }, ...withThumb.map((v) => ({ "@type": "VideoObject", name: v.title || v.id, description: v.title || v.id, thumbnailUrl: abs(v.thumb), uploadDate: v.date, embedUrl: `${v.permalink}embed/`, contentUrl: v.permalink, author: { "@type": "Person", name: NAME, url: SITE + "/" } }))] },
      body, scripts: ["video.js"]
    }));
    if (live) sitemap.push({ route: "/video", images: videos.filter((v) => v.thumb && isRaster(v.thumb)).map((v) => ({ loc: v.thumb, title: `${v.title || "Video"} – video by ${NAME}`, caption: "" })) });
  }

  /* Contact */
  CUR = "/contact";
  {
    const pg = S.pages.contact;
    checkMeta("/contact", pg.title, pg.description);
    const bio = S.site.bio.length ? S.site.bio : [`${NAME} is a ${S.site.country === "Czechia" ? "Czech " : ""}photographer specialising in fashion.`];
    const links = [
      S.site.email ? `Email: <a href="mailto:${esc(S.site.email)}">${esc(S.site.email)}</a>` : "",
      INSTAGRAM ? `Instagram: <a href="${esc(INSTAGRAM)}" target="_blank" rel="noopener">${esc(S.site.instagram)}</a>` : "",
      REDDIT ? `Reddit: <a href="${esc(REDDIT)}" target="_blank" rel="noopener">u/${esc(S.site.reddit)}</a>` : ""
    ].filter(Boolean).join("<br>\n");
    const body = `${back("/", "Back to home")}
<main class="gut contact">
<h1 class="disp">Contact</h1>
${bio.map((p) => `<p>${esc(p)}</p>`).join("\n")}
<p>Get in touch:<br>
${links}</p>
</main>`;
    emit("/contact", shell({
      route: "/contact", title: pg.title, description: pg.description,
      jsonld: { "@context": "https://schema.org", "@graph": [crumbs([["Home", "/"], ["Contact", "/contact"]]), { "@type": "ContactPage", "@id": SITE + "/contact#page", url: SITE + "/contact", name: "Contact", isPartOf: { "@id": SITE + "/#website" }, mainEntity: person() }] },
      body
    }));
    sitemap.push({ route: "/contact", images: [] });
  }

  /* 404 */
  CUR = "/404";
  pages.push({
    file: "404.html",
    html: shell({ route: "/404", title: `Page not found – ${NAME}`, description: "This page does not exist.", noindex: true, body: `${back("/", "Back to home")}\n<main class="gut contact">\n<h1 class="disp">Page not found</h1>\n<p><a href="${L("/")}">Go to the home page</a> or <a href="${L("/fashion")}">browse all fashion shows</a>.</p>\n</main>` })
  });
}

function coverOf(s) {
  const c = s.cover && s.photos.find((p) => p.image === s.cover);
  return c || s.photos[0];
}

/* ---------- sitemap, robots, redirects, headers ---------- */
function sitemapXml() {
  const urls = sitemap.map(({ route, images }) => {
    const loc = SITE + (route === "/" ? "/" : route);
    const imgs = images.map((i) => `    <image:image><image:loc>${esc(abs(i.loc))}</image:loc>${i.title ? `<image:title>${esc(i.title)}</image:title>` : ""}${i.caption ? `<image:caption>${esc(i.caption)}</image:caption>` : ""}</image:image>`).join("\n");
    return `  <url>\n    <loc>${esc(loc)}</loc>${imgs ? "\n" + imgs : ""}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>\n`;
}
const robotsTxt = () => DRAFT_BUILD ? `User-agent: *\nDisallow: /\n` : `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`;
const headersTxt = () => `/_build.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-store\n${DRAFT_BUILD ? "/*\n  X-Robots-Tag: noindex, nofollow\n" : ""}/images/*\n  Cache-Control: public, max-age=31536000, immutable\n/videos/*\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/admin*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`;

/* ---------- write ---------- */
function copy(rel) {
  const from = path.join(ROOT, rel);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(OUT, rel), { recursive: true });
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

render();
for (const p of pages) {
  const f = path.join(OUT, p.file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, p.html);
}
["style.css", "site.js", "home.js", "video.js", "masonry.js", "favicon.svg", "fonts", "images", "videos"].forEach(copy);
if (DRAFT_BUILD) fs.writeFileSync(path.join(OUT, "draft.js"), fs.readFileSync(path.join(ROOT, "draft.js"), "utf8").replace("__REPO__", REPO).replace("__BRANCH__", BRANCH));
if (!PREVIEW) {
  ["admin.html", "admin.css", "admin.js"].forEach(copy);
  if (!DRAFT_BUILD) fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemapXml());
  fs.writeFileSync(path.join(OUT, "_build.json"), JSON.stringify({ sha: process.env.CF_PAGES_COMMIT_SHA || "", branch: BRANCH }));
  fs.writeFileSync(path.join(OUT, "robots.txt"), robotsTxt());
  fs.writeFileSync(path.join(OUT, "_headers"), headersTxt());
  if (fs.existsSync(path.join(ROOT, "redirects.txt"))) fs.copyFileSync(path.join(ROOT, "redirects.txt"), path.join(OUT, "_redirects"));
}

const drafts = shows.concat(brands).filter((s) => !s.photos.length).map((s) => s.slug);
if (drafts.length) warn(`${drafts.length} shows have no photos yet and stay hidden (not listed, noindex, not in the sitemap): ${drafts.join(", ")}.`);
console.log(`Built ${pages.length} pages into ${path.basename(OUT)}/ (${published.length} shows live, ${shows.length - published.length} drafts).`);
if (warnings.length) { console.log("\nSEO notes:"); warnings.forEach((w) => console.log("  - " + w)); }
