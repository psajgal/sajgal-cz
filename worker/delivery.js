// Client deliveries ("gallery.sajgal.cz/<code>").
// Private R2 bucket (binding DELIVERIES): nothing in it is ever public. Every byte is served through this
// Worker, which checks expiry and the optional password first.
//
// Bucket layout, per gallery <id> (22 random URL-safe characters):
//   <id>/manifest.json        title, dates, password hash, file list
//   <id>/o/<n>                the original file, untouched
//   <id>/t/<n>                grid preview (about 600 px JPEG), made in the admin
//   <id>/v/<n>                full-screen preview (about 2000 px JPEG), made in the admin
//
// Variables: GALLERY_BASE (https://gallery.sajgal.cz), DELIVERY_CAP_GB (5), DELIVERY_GALLERY_MB (1024),
//            DELIVERY_MAX_FILES (500). Secret UPLOAD_SECRET is shared with the upload Worker routes.
import { VIEWER_JS, VIEWER_CSS, viewerShell } from "./viewer.js";

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const PART = 10 * 1024 * 1024;
const SINGLE_MAX = 26 * 1024 * 1024;
const DAY = 86400000;
const DAYS_OK = [1, 3, 7, 30];
const PBKDF2_ITER = 10000;
const COOKIE_HOURS = 12;
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const capBytes = (env) => Math.floor(num(env.DELIVERY_CAP_GB, 5) * 1024 ** 3);
const galleryMax = (env) => Math.floor(num(env.DELIVERY_GALLERY_MB, 1024) * 1024 ** 2);
const maxFiles = (env) => Math.floor(num(env.DELIVERY_MAX_FILES, 500));
const galleryBase = (env) => String(env.GALLERY_BASE || "https://gallery.sajgal.cz").replace(/\/+$/, "");

const enc = new TextEncoder();
const b64u = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
const newId = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function same(a, b) {
  a = String(a); b = String(b); let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
const kindOf = (type) => /^image\/(jpeg|png|webp|gif|avif)$/i.test(type) ? "image" : /^video\/(mp4|webm|quicktime)$/i.test(type) ? "video" : "file";
const safeName = (n, i) => String(n || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 180) || "file-" + (i + 1);
const slug = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "gallery";

async function listAll(bucket, opts) {
  const out = []; let cursor;
  do {
    const r = await bucket.list({ ...opts, cursor, limit: 1000 });
    out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function deletePrefix(bucket, prefix) {
  const all = await listAll(bucket, { prefix });
  for (let i = 0; i < all.length; i += 500) await bucket.delete(all.slice(i, i + 500).map((o) => o.key));
  return all.length;
}

/* ---------- passwords and access tokens ---------- */
async function hashPw(pw, saltB64) {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { salt: b64u(salt), hash: b64u(bits) };
}
async function hmac(env, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode("gallery:" + env.UPLOAD_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
async function makeToken(env, id, m) {
  const exp = Date.now() + COOKIE_HOURS * 3600 * 1000;
  return exp + "." + (await hmac(env, id + "." + exp + "." + ((m.pw && m.pw.v) || "")));
}
async function tokenOk(env, id, m, tok) {
  const [exp, sig] = String(tok || "").split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  return same(sig, await hmac(env, id + "." + exp + "." + ((m.pw && m.pw.v) || "")));
}
function cookieOf(req, id) {
  const m = (req.headers.get("Cookie") || "").split(/;\s*/).find((c) => c.startsWith("gl_" + id + "="));
  return m ? m.slice(("gl_" + id + "=").length) : "";
}

/* ---------- manifest ---------- */
async function readManifest(env, id) {
  const o = await env.DELIVERIES.get(id + "/manifest.json");
  if (!o) return null;
  try { return await o.json(); } catch { return null; }
}
async function writeManifest(env, m) {
  const uploaded = 0;
  await env.DELIVERIES.put(m.id + "/manifest.json", JSON.stringify(m), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { ready: m.ready ? "1" : "0", planned: String(m.planned || 0), created: String(m.createdAt), uploaded: String(uploaded) }
  });
}
const expired = (m) => m.expiresAt != null && Date.now() > m.expiresAt;
const expiryFromDays = (d) => (d == null ? null : Date.now() + d * DAY);

// Bytes stored + bytes still promised to galleries that are being uploaded.
async function usage(env) {
  const all = await listAll(env.DELIVERIES, { include: ["customMetadata"] });
  const per = new Map(); let used = 0;
  for (const o of all) {
    used += o.size;
    const id = o.key.split("/")[0]; const e = per.get(id) || { size: 0, man: null };
    e.size += o.size; if (o.key === id + "/manifest.json") e.man = o.customMetadata || {}; per.set(id, e);
  }
  let reserved = 0;
  for (const e of per.values()) {
    if (e.man && e.man.ready === "0" && Date.now() - +e.man.created < DAY) reserved += Math.max(0, +e.man.planned - e.size);
  }
  return { used, reserved, galleries: per.size, cap: capBytes(env) };
}

/* ---------- streaming zip (stored, no compression; CRC values come from the admin) ---------- */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf, crc) { let c = (crc == null ? 0 : crc) ^ 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function dosTime(ms) {
  const d = new Date(ms); const y = Math.max(1980, d.getUTCFullYear());
  return { time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}
function zipPlan(m) {
  const t = dosTime(m.createdAt); const used = new Set(); let off = 0; const items = [];
  m.files.forEach((f, i) => {
    let name = safeName(f.name, i), base = name, k = 2;
    while (used.has(name.toLowerCase())) { const dot = base.lastIndexOf("."); name = dot > 0 ? base.slice(0, dot) + "-" + k + base.slice(dot) : base + "-" + k; k++; }
    used.add(name.toLowerCase());
    const nb = enc.encode(name);
    const lfh = new Uint8Array(30 + nb.length), v = new DataView(lfh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
    v.setUint16(10, t.time, true); v.setUint16(12, t.date, true); v.setUint32(14, f.crc >>> 0, true);
    v.setUint32(18, f.size, true); v.setUint32(22, f.size, true); v.setUint16(26, nb.length, true); v.setUint16(28, 0, true); lfh.set(nb, 30);
    items.push({ f, nb, lfh, off }); off += lfh.length + f.size;
  });
  const cds = items.map((it) => {
    const c = new Uint8Array(46 + it.nb.length), v = new DataView(c.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(10, 0, true);
    v.setUint16(12, t.time, true); v.setUint16(14, t.date, true); v.setUint32(16, it.f.crc >>> 0, true);
    v.setUint32(20, it.f.size, true); v.setUint32(24, it.f.size, true); v.setUint16(28, it.nb.length, true);
    v.setUint32(42, it.off, true); c.set(it.nb, 46); return c;
  });
  const cdSize = cds.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22), e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, items.length, true); e.setUint16(10, items.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return { items, cds, eocd, total: off + cdSize + 22 };
}
async function pumpZip(env, id, plan, writable) {
  const w = writable.getWriter();
  try {
    for (const it of plan.items) {
      await w.write(it.lfh);
      if (!it.f.size) continue;
      const o = await env.DELIVERIES.get(id + "/o/" + it.f.n);
      if (!o) throw new Error("missing " + it.f.n);
      const r = o.body.getReader();
      for (;;) { const { done, value } = await r.read(); if (done) break; await w.write(value); }
    }
    for (const c of plan.cds) await w.write(c);
    await w.write(plan.eocd);
    await w.close();
  } catch (e) { try { await w.abort(e); } catch {} }
}

/* ---------- helpers for responses ---------- */
const SEC = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "Strict-Transport-Security": "max-age=31536000; includeSubDomains" };
const PAGE_SEC = { ...SEC, "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://sajgal.cz; media-src 'self'; font-src https://sajgal.cz; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY" };
const jres = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SEC, ...extra } });
const attach = (name) => "attachment; filename=\"" + name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'") + "\"; filename*=UTF-8''" + encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function publicView(m) {
  return {
    title: m.title, createdAt: m.createdAt, expiresAt: m.expiresAt, locked: false,
    total: m.files.reduce((a, f) => a + f.size, 0),
    files: m.files.map((f) => ({ n: f.n, name: f.name, size: f.size, kind: kindOf(f.type), type: f.type, w: f.w || 0, h: f.h || 0, t: !!f.t, v: !!f.v, dur: f.dur || 0 }))
  };
}

/* ---------- public routes (no admin secret) ---------- */
async function publicRoute(req, env, url, path, ctx) {
  if (path === "/_/viewer.js") return new Response(VIEWER_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", ...SEC } });
  if (path === "/_/viewer.css") return new Response(VIEWER_CSS, { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300", ...SEC } });
  const parts = path.split("/").filter(Boolean);
  if (!parts.length || !ID_RE.test(parts[0])) return null;
  const id = parts[0], sub = parts[1] || "";
  if (!["", "m", "auth", "t", "v", "f", "zip"].includes(sub)) return null;

  if (sub === "" && req.method === "GET") return new Response(viewerShell(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...PAGE_SEC } });

  const m = await readManifest(env, id);
  if (!m || !m.ready) return jres({ error: "gone", reason: "missing" }, 404);
  if (expired(m)) return jres({ error: "gone", reason: "expired" }, 410);
  const authed = !m.pw || (await tokenOk(env, id, m, cookieOf(req, id)));

  if (sub === "auth" && req.method === "POST") {
    if (!m.pw) return jres({ ok: true });
    let b = {}; try { b = await req.json(); } catch {}
    const h = await hashPw(String(b.password || ""), m.pw.salt);
    if (!same(h.hash, m.pw.hash)) { await sleep(600); return jres({ error: "Wrong password." }, 401); }
    const tok = await makeToken(env, id, m);
    return jres({ ok: true }, 200, { "Set-Cookie": "gl_" + id + "=" + tok + "; Path=/" + id + "; Max-Age=" + COOKIE_HOURS * 3600 + "; HttpOnly; Secure; SameSite=Lax" });
  }
  if (sub === "m" && req.method === "GET") {
    if (!authed) return jres({ locked: true }, 200);
    return jres(publicView(m));
  }
  if (!authed) return jres({ error: "locked" }, 401);
  if (req.method !== "GET" && req.method !== "HEAD") return jres({ error: "Method not allowed" }, 405);

  if (sub === "zip") {
    if (!m.files.length) return jres({ error: "Empty gallery." }, 404);
    const plan = zipPlan(m);
    const fl = typeof FixedLengthStream !== "undefined" ? new FixedLengthStream(plan.total) : new TransformStream();
    const done = pumpZip(env, id, plan, fl.writable);
    if (ctx && ctx.waitUntil) ctx.waitUntil(done);
    return new Response(fl.readable, { headers: { "Content-Type": "application/zip", "Content-Length": String(plan.total), "Content-Disposition": attach(slug(m.title) + ".zip"), "Cache-Control": "private, no-store", ...SEC } });
  }

  const n = parts[2]; if (!/^\d{1,4}$/.test(n || "")) return jres({ error: "Not found" }, 404);
  const f = m.files.find((x) => x.n === +n); if (!f) return jres({ error: "Not found" }, 404);
  const key = id + "/" + (sub === "f" ? "o" : sub) + "/" + n;
  if ((sub === "t" && !f.t) || (sub === "v" && !f.v)) return jres({ error: "Not found" }, 404);
  const o = await env.DELIVERIES.get(key, sub === "f" ? { range: req.headers } : undefined);
  if (!o) return jres({ error: "Not found" }, 404);
  const hdr = { ...SEC, "Cache-Control": "private, max-age=600", "Accept-Ranges": "bytes" };
  if (sub !== "f") { hdr["Content-Type"] = "image/jpeg"; return new Response(o.body, { headers: hdr }); }
  const kind = kindOf(f.type), inline = (kind === "image" || kind === "video") && url.searchParams.get("dl") !== "1";
  hdr["Content-Type"] = kind === "file" ? "application/octet-stream" : f.type;
  hdr["Content-Disposition"] = inline ? "inline" : attach(safeName(f.name, f.n));
  if (inline) hdr["Content-Security-Policy"] = "default-src 'none'; sandbox";
  let status = 200, len = o.size;
  if (o.range && (o.range.offset != null || o.range.suffix != null) && req.headers.get("Range")) {
    const off = o.range.offset != null ? o.range.offset : o.size - o.range.suffix;
    len = o.range.length != null ? o.range.length : o.size - off;
    if (off !== 0 || len !== o.size) { status = 206; hdr["Content-Range"] = "bytes " + off + "-" + (off + len - 1) + "/" + o.size; }
  }
  hdr["Content-Length"] = String(len);
  return new Response(req.method === "HEAD" ? null : o.body, { status, headers: hdr });
}

/* ---------- admin routes (/dl/…, Bearer secret already checked) ---------- */
async function adminRoute(req, env, url, path, h) {
  const J = (o, s) => jres(o, s, h);
  const parts = path.split("/").filter(Boolean); // ["dl", ...]
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  if (parts[1] === "list" && req.method === "GET") {
    const u = await usage(env);
    const all = await listAll(env.DELIVERIES, { include: ["customMetadata"] });
    const ids = all.filter((o) => o.key.endsWith("/manifest.json")).map((o) => o.key.split("/")[0]);
    const sizes = new Map(); for (const o of all) { const id = o.key.split("/")[0]; sizes.set(id, (sizes.get(id) || 0) + o.size); }
    const gs = [];
    for (const id of ids) {
      const m = await readManifest(env, id); if (!m) continue;
      gs.push({ id, title: m.title, createdAt: m.createdAt, expiresAt: m.expiresAt, ready: !!m.ready, files: m.files.length, bytes: sizes.get(id) || 0, locked: !!m.pw, url: galleryBase(env) + "/" + id, expired: expired(m) });
    }
    gs.sort((a, b) => b.createdAt - a.createdAt);
    return J({ galleries: gs, used: u.used, reserved: u.reserved, cap: u.cap, free: Math.max(0, u.cap - u.used - u.reserved), galleryMax: galleryMax(env), maxFiles: maxFiles(env), base: galleryBase(env), singleMax: SINGLE_MAX, part: PART });
  }

  if (parts[1] === "create" && req.method === "POST") {
    const b = await body();
    const title = String(b.title || "").trim().slice(0, 120) || "Photos";
    const days = b.days == null ? null : +b.days;
    if (days !== null && !DAYS_OK.includes(days)) return J({ error: "Choose 1, 3, 7 or 30 days, or no expiry." }, 400);
    const planned = Math.max(0, Math.floor(+b.planned || 0)), bytes = Math.max(0, Math.floor(+b.bytes || planned)), count = Math.max(0, Math.floor(+b.count || 0));
    if (bytes > galleryMax(env)) return J({ error: "A gallery can hold at most " + Math.round(galleryMax(env) / 1048576) + " MB. This one is " + Math.round(bytes / 1048576) + " MB." }, 413);
    if (count > maxFiles(env)) return J({ error: "At most " + maxFiles(env) + " files per gallery." }, 413);
    const u = await usage(env);
    if (u.used + u.reserved + planned > u.cap) return J({ error: "Not enough delivery space: " + Math.round(Math.max(0, u.cap - u.used - u.reserved) / 1048576) + " MB free, this gallery needs " + Math.round(planned / 1048576) + " MB. Delete an old gallery first." }, 507);
    const m = { v: 1, id: newId(), title, createdAt: Date.now(), expiresAt: expiryFromDays(days), days, ready: false, planned, files: [] };
    if (b.password) { const hh = await hashPw(String(b.password)); m.pw = { ...hh, v: newId().slice(0, 8) }; }
    await writeManifest(env, m);
    return J({ id: m.id, url: galleryBase(env) + "/" + m.id });
  }

  const id = parts[1];
  if (!ID_RE.test(id || "")) return J({ error: "Not found." }, 404);

  if (parts.length === 2 && req.method === "DELETE") {
    const n = await deletePrefix(env.DELIVERIES, id + "/");
    return J({ ok: true, deleted: n });
  }
  const m = await readManifest(env, id);
  if (!m) return J({ error: "Gallery not found." }, 404);

  // uploads: o = original, t = grid preview, v = large preview
  if ((parts[2] === "o" || parts[2] === "t" || parts[2] === "v") && /^\d{1,4}$/.test(parts[3] || "")) {
    const kind = parts[2], n = parts[3], key = id + "/" + kind + "/" + n;
    if (m.ready && !b0(url, "more")) return J({ error: "This gallery is already finished." }, 409);
    if (!parts[4] && req.method === "PUT") {
      const len = +req.headers.get("Content-Length");
      const lim = kind === "o" ? SINGLE_MAX : 8 * 1024 * 1024;
      if (!(len >= 0) || len > lim) return J({ error: "File too large for this route." }, 413);
      const type = kind === "o" ? String(url.searchParams.get("type") || "application/octet-stream").slice(0, 100) : "image/jpeg";
      const o = await env.DELIVERIES.put(key, req.body, { httpMetadata: { contentType: type } });
      return J({ key, size: o.size });
    }
    if (kind === "o" && parts[4] === "start" && req.method === "POST") {
      const type = String(url.searchParams.get("type") || "application/octet-stream").slice(0, 100);
      const mp = await env.DELIVERIES.createMultipartUpload(key, { httpMetadata: { contentType: type } });
      return J({ uploadId: mp.uploadId, part: PART });
    }
    if (kind === "o" && parts[4] === "part" && req.method === "PUT") {
      const uploadId = url.searchParams.get("uploadId") || "", pn = +url.searchParams.get("part");
      const len = +req.headers.get("Content-Length");
      if (!uploadId || !(pn >= 1 && pn <= 10000) || !(len > 0) || len > 16 * 1024 * 1024) return J({ error: "Bad part." }, 400);
      const p = await env.DELIVERIES.resumeMultipartUpload(key, uploadId).uploadPart(pn, req.body);
      return J({ partNumber: p.partNumber, etag: p.etag });
    }
    if (kind === "o" && parts[4] === "complete" && req.method === "POST") {
      const b = await body();
      const o = await env.DELIVERIES.resumeMultipartUpload(key, String(b.uploadId || "")).complete((b.parts || []).map((p) => ({ partNumber: +p.partNumber, etag: String(p.etag) })));
      return J({ key, size: o.size });
    }
    if (kind === "o" && parts[4] === "abort" && req.method === "POST") {
      const b = await body();
      try { await env.DELIVERIES.resumeMultipartUpload(key, String(b.uploadId || "")).abort(); } catch {}
      return J({ ok: true });
    }
  }

  if (parts[2] === "commit" && req.method === "POST") {
    const b = await body(); const list = Array.isArray(b.files) ? b.files : [];
    if (list.length > maxFiles(env)) return J({ error: "Too many files." }, 413);
    const have = new Map((await listAll(env.DELIVERIES, { prefix: id + "/" })).map((o) => [o.key, o.size]));
    const files = []; let total = 0;
    for (const x of list) {
      const n = +x.n, size = have.get(id + "/o/" + n);
      if (!Number.isInteger(n) || n < 0 || n > 9999) return J({ error: "Bad file number." }, 400);
      if (size == null) return J({ error: "File " + n + " (" + String(x.name || "").slice(0, 60) + ") did not arrive. Upload it again." }, 409);
      if (size !== +x.size) return J({ error: "File " + n + " has the wrong size on the server. Upload it again." }, 409);
      total += size;
      files.push({ n, name: safeName(x.name, n), size, type: String(x.type || "application/octet-stream").slice(0, 100), crc: (+x.crc) >>> 0, w: Math.max(0, Math.floor(+x.w || 0)), h: Math.max(0, Math.floor(+x.h || 0)), dur: Math.max(0, Math.round(+x.dur || 0)), t: have.has(id + "/t/" + n), v: have.has(id + "/v/" + n) });
    }
    if (total > galleryMax(env)) return J({ error: "A gallery can hold at most " + Math.round(galleryMax(env) / 1048576) + " MB." }, 413);
    const u = await usage(env);
    if (u.used + u.reserved > u.cap) return J({ error: "The delivery space is full." }, 507);
    m.files = files; m.ready = true; m.planned = total;
    if (b.title) m.title = String(b.title).trim().slice(0, 120) || m.title;
    await writeManifest(env, m);
    // remove strays (uploads that are not in the final list)
    const keep = new Set(["manifest.json"]); files.forEach((f) => { keep.add("o/" + f.n); if (f.t) keep.add("t/" + f.n); if (f.v) keep.add("v/" + f.n); });
    const stray = [...have.keys()].filter((k) => !keep.has(k.slice(id.length + 1)));
    for (let i = 0; i < stray.length; i += 500) await env.DELIVERIES.delete(stray.slice(i, i + 500));
    return J({ ok: true, url: galleryBase(env) + "/" + id, total });
  }

  if (parts[2] === "update" && req.method === "POST") {
    const b = await body();
    if ("title" in b) m.title = String(b.title || "").trim().slice(0, 120) || m.title;
    if ("days" in b) {
      const d = b.days == null ? null : +b.days;
      if (d !== null && !DAYS_OK.includes(d)) return J({ error: "Choose 1, 3, 7 or 30 days, or no expiry." }, 400);
      m.days = d; m.expiresAt = expiryFromDays(d);
    }
    if ("password" in b) {
      if (b.password) { const hh = await hashPw(String(b.password)); m.pw = { ...hh, v: newId().slice(0, 8) }; } else delete m.pw;
    }
    await writeManifest(env, m);
    return J({ ok: true, expiresAt: m.expiresAt, locked: !!m.pw });
  }
  return J({ error: "Not found." }, 404);
}
const b0 = (url, k) => url.searchParams.get(k) === "1";

/* ---------- entry points ---------- */
// Returns a Response for delivery routes, or null so the caller continues with its own routes.
// authCheck() returns an error Response when the Bearer secret is wrong, otherwise null; h are the CORS headers.
export async function deliveryFetch(req, env, ctx, authCheck, h) {
  const url = new URL(req.url), path = url.pathname;
  if (!env.DELIVERIES) return null;
  if (path.startsWith("/dl/")) {
    const bad = authCheck(); if (bad) return bad;
    return adminRoute(req, env, url, path, h);
  }
  const host = url.hostname;
  const galleryHost = host === new URL(galleryBase(env)).hostname;
  if (galleryHost && (path === "/" || path === "/robots.txt")) {
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain", ...SEC } });
    return new Response("Private galleries. If you were sent a link, open it as it was sent to you.", { headers: { "Content-Type": "text/plain; charset=utf-8", ...SEC } });
  }
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return null;
  const r = await publicRoute(req, env, url, path, ctx);
  if (r) return r;
  return galleryHost ? jres({ error: "Not found." }, 404) : null;
}

// Hourly: delete expired galleries and uploads that were never finished.
export async function deliveryScheduled(env) {
  if (!env.DELIVERIES) return;
  const top = await env.DELIVERIES.list({ delimiter: "/", limit: 1000 });
  for (const p of top.delimitedPrefixes || []) {
    const id = p.replace(/\/$/, ""); if (!ID_RE.test(id)) continue;
    const m = await readManifest(env, id);
    if (!m) { // no manifest: leftovers from a crashed upload; remove once old enough
      const first = await env.DELIVERIES.list({ prefix: id + "/", limit: 1 });
      if (first.objects[0] && Date.now() - new Date(first.objects[0].uploaded).getTime() > DAY) await deletePrefix(env.DELIVERIES, id + "/");
      continue;
    }
    if (expired(m) || (!m.ready && Date.now() - m.createdAt > DAY)) await deletePrefix(env.DELIVERIES, id + "/");
  }
}
