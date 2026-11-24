// Upload gate for large videos (Cloudflare Worker + R2).
// The bucket is public for READING only (custom domain). Nothing can be written except through this Worker,
// and this Worker refuses any upload that would take the bucket past HARD_CAP_BYTES.
//
// Bindings / variables (see worker/README.md):
//   BUCKET           R2 bucket binding
//   UPLOAD_SECRET    secret text (Bearer token used by the admin)
//   ALLOW_ORIGINS    comma separated, e.g. https://sajgal.cz,https://sajgal-cz.pages.dev,https://draft.sajgal-cz.pages.dev
//   PUBLIC_BASE      e.g. https://media.sajgal.cz
//   HARD_CAP_GB      optional, default 9 (the free tier is 10 GB; the rest is a safety margin)
//   MAX_FILE_MB      optional, default 150

const PART = 10 * 1024 * 1024;           // the admin sends 10 MB pieces
const PART_MAX = 16 * 1024 * 1024;       // never accept a bigger piece
const PREFIX = "video/";
const STATE = "_uploads/";               // bookkeeping for uploads in progress
const OK_TYPES = { "video/mp4": ".mp4", "video/webm": ".webm" };
// Site photos and short clips ("assets"): small single-request uploads under these prefixes.
const ASSET_PREFIXES = ["images/", "videos/"];
const ASSET_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", mp4: "video/mp4", webm: "video/webm" };
const ASSET_MAX = 26 * 1024 * 1024;      // one request; bigger videos use the multipart route
const IMPORT_MAX = 40 * 1024 * 1024;     // a file pulled from GitHub must fit in memory
const assetKeyOk = (k) => /^[a-z0-9][a-z0-9._\/-]*$/i.test(k) && !k.includes("..") && !k.includes("//") && ASSET_PREFIXES.some((p) => k.startsWith(p)) && !!ASSET_TYPES[(k.split(".").pop() || "").toLowerCase()];
const assetType = (k) => ASSET_TYPES[(k.split(".").pop() || "").toLowerCase()];
const ASSET_CACHE = "public, max-age=2592000";

const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const cap = (env) => Math.floor(num(env.HARD_CAP_GB, 9) * 1024 * 1024 * 1024);
const maxFile = (env) => Math.floor(num(env.MAX_FILE_MB, 150) * 1024 * 1024);

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const ok = String(env.ALLOW_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { Vary: "Origin", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Max-Age": "86400" };
  if (ok.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...h } });

function same(a, b) { // constant-time string compare
  a = String(a); b = String(b); let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

async function listAll(bucket, prefix) {
  const out = []; let cursor;
  do {
    const r = await bucket.list({ prefix, cursor, limit: 1000 });
    out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

// Bytes in the bucket + bytes promised to uploads that are still running.
async function usage(env) {
  const all = await listAll(env.BUCKET, "");
  let used = 0, reserved = 0, files = 0;
  for (const o of all) {
    if (o.key.startsWith(STATE)) continue;
    used += o.size; files++;
  }
  const now = Date.now();
  for (const o of all.filter((x) => x.key.startsWith(STATE))) {
    const s = await env.BUCKET.get(o.key); if (!s) continue;
    let st; try { st = await s.json(); } catch { continue; }
    if (now - st.t > 24 * 3600 * 1000) { // stale (abandoned) upload: clean it up
      try { await env.BUCKET.resumeMultipartUpload(st.key, st.id).abort(); } catch {}
      await env.BUCKET.delete(o.key); continue;
    }
    reserved += st.size;
  }
  return { used, reserved, files, cap: cap(env) };
}

const cleanName = (n) => String(n || "video").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "video";

export default {
  async fetch(req, env) {
    const h = cors(req, env), url = new URL(req.url), path = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.UPLOAD_SECRET || !same(auth, env.UPLOAD_SECRET)) return json({ error: "Wrong or missing secret." }, 401, h);
    try {
      if (path === "/status" && req.method === "GET") {
        const u = await usage(env);
        return json({ ...u, free: Math.max(0, u.cap - u.used - u.reserved), maxFile: maxFile(env), base: env.PUBLIC_BASE || "" }, 200, h);
      }
      if (path === "/files" && req.method === "GET") {
        const all = (await listAll(env.BUCKET, url.searchParams.get("prefix") === "all" ? "" : PREFIX)).filter((o) => !o.key.startsWith(STATE)).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded }));
        return json({ files: all }, 200, h);
      }
      if (path === "/upload/start" && req.method === "POST") {
        const b = await req.json(); const size = Math.floor(+b.size), type = String(b.type || "");
        if (!OK_TYPES[type]) return json({ error: "Only MP4 and WebM files are accepted." }, 415, h);
        if (!(size > 0)) return json({ error: "Missing file size." }, 400, h);
        if (size > maxFile(env)) return json({ error: `File is too large (limit ${Math.round(maxFile(env) / 1048576)} MB).` }, 413, h);
        const u = await usage(env);
        if (u.used + u.reserved + size > u.cap) return json({ error: `Upload refused: it would take the storage past the ${(u.cap / 1073741824).toFixed(1)} GB limit. Free space: ${Math.max(0, (u.cap - u.used - u.reserved) / 1048576).toFixed(0)} MB. Delete old videos first.` }, 507, h);
        const key = PREFIX + cleanName(b.name) + "-" + Date.now().toString(36) + OK_TYPES[type];
        const mp = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
        const maxParts = Math.ceil(size / PART) + 1;
        await env.BUCKET.put(STATE + mp.uploadId + ".json", JSON.stringify({ key, id: mp.uploadId, size, maxParts, t: Date.now() }));
        return json({ key, uploadId: mp.uploadId, partSize: PART, url: (env.PUBLIC_BASE || "") + "/" + key }, 200, h);
      }
      if (path === "/upload/part" && req.method === "PUT") {
        const id = url.searchParams.get("uploadId") || "", n = Math.floor(+url.searchParams.get("n"));
        const s = await env.BUCKET.get(STATE + id + ".json"); if (!s) return json({ error: "Unknown upload." }, 404, h);
        const st = await s.json();
        if (!(n >= 1 && n <= st.maxParts)) return json({ error: "Too many parts." }, 400, h);
        const len = +req.headers.get("Content-Length");
        if (!(len > 0) || len > PART_MAX) return json({ error: "Piece too large." }, 413, h);
        const up = env.BUCKET.resumeMultipartUpload(st.key, id);
        const part = await up.uploadPart(n, req.body);
        return json({ partNumber: part.partNumber, etag: part.etag }, 200, h);
      }
      if (path === "/upload/complete" && req.method === "POST") {
        const b = await req.json(); const id = String(b.uploadId || "");
        const s = await env.BUCKET.get(STATE + id + ".json"); if (!s) return json({ error: "Unknown upload." }, 404, h);
        const st = await s.json();
        const up = env.BUCKET.resumeMultipartUpload(st.key, id);
        const obj = await up.complete((b.parts || []).map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
        await env.BUCKET.delete(STATE + id + ".json");
        const u = await usage(env);
        if (obj.size > st.size || u.used > u.cap) { // final check on the real size
          await env.BUCKET.delete(st.key);
          return json({ error: "Upload refused: the file was bigger than announced or would pass the storage limit. It was removed." }, 413, h);
        }
        return json({ key: st.key, size: obj.size, url: (env.PUBLIC_BASE || "") + "/" + st.key, used: u.used, cap: u.cap }, 200, h);
      }
      if (path === "/upload/abort" && req.method === "POST") {
        const b = await req.json(); const id = String(b.uploadId || "");
        const s = await env.BUCKET.get(STATE + id + ".json");
        if (s) { const st = await s.json(); try { await env.BUCKET.resumeMultipartUpload(st.key, id).abort(); } catch {} await env.BUCKET.delete(STATE + id + ".json"); }
        return json({ ok: true }, 200, h);
      }
      if (path === "/asset" && req.method === "PUT") {
        const key = url.searchParams.get("key") || "";
        if (!assetKeyOk(key)) return json({ error: "That file name or type is not accepted." }, 400, h);
        const len = +req.headers.get("Content-Length");
        if (!(len > 0) || len > ASSET_MAX) return json({ error: "File too large for this route (limit 26 MB)." }, 413, h);
        const u = await usage(env);
        if (u.used + u.reserved + len > u.cap) return json({ error: "Upload refused: the storage limit would be passed." }, 507, h);
        const obj = await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: assetType(key), cacheControl: ASSET_CACHE } });
        return json({ key, size: obj.size, url: (env.PUBLIC_BASE || "") + "/" + key }, 200, h);
      }
      if (path === "/import" && req.method === "POST") {
        // Copies files from the site's own GitHub repository into the bucket (one-off move of the photos).
        const b = await req.json(), repo = String(env.GITHUB_REPO || ""), ref = String(b.ref || "main");
        if (!repo || !/^[\w.-]+$/.test(ref)) return json({ error: "Import is not set up." }, 400, h);
        const paths = (Array.isArray(b.paths) ? b.paths : []).slice(0, 8);
        const u = await usage(env); let used = u.used + u.reserved;
        const done = [], failed = [];
        for (const p of paths) {
          const key = String(p || "").replace(/^\//, "");
          if (!assetKeyOk(key)) { failed.push({ key, why: "not accepted" }); continue; }
          try {
            const r = await fetch("https://raw.githubusercontent.com/" + repo + "/" + ref + "/" + key.split("/").map(encodeURIComponent).join("/"));
            if (!r.ok) { failed.push({ key, why: "GitHub " + r.status }); continue; }
            const buf = await r.arrayBuffer();
            if (buf.byteLength > IMPORT_MAX) { failed.push({ key, why: "too large to import (" + Math.round(buf.byteLength / 1048576) + " MB)" }); continue; }
            if (used + buf.byteLength > u.cap) { failed.push({ key, why: "storage limit" }); continue; }
            await env.BUCKET.put(key, buf, { httpMetadata: { contentType: assetType(key), cacheControl: ASSET_CACHE } });
            used += buf.byteLength; done.push(key);
          } catch (e) { failed.push({ key, why: String(e && e.message || e) }); }
        }
        return json({ done, failed }, 200, h);
      }
      if (path === "/file" && req.method === "DELETE") {
        const key = url.searchParams.get("key") || "";
        if (!(key.startsWith(PREFIX) || assetKeyOk(key)) || key.includes("..")) return json({ error: "Not a media file." }, 400, h);
        await env.BUCKET.delete(key);
        return json({ ok: true }, 200, h);
      }
      return json({ error: "Not found." }, 404, h);
    } catch (e) {
      return json({ error: "Server error: " + (e && e.message ? e.message : e) }, 500, h);
    }
  }
};
