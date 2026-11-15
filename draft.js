// Only added to draft builds (never the public site): marks the page as a draft and refreshes it when a newer draft is built.
(function () {
  var REPO = "__REPO__", BRANCH = "__BRANCH__", mine = "";
  var bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:.8rem 1rem calc(.8rem + env(safe-area-inset-bottom,0px));font:600 16px/1.3 system-ui,sans-serif;letter-spacing:.01em;text-align:center;color:#fff;background:#b86e00;box-shadow:0 -2px 12px rgba(0,0,0,.25);transition:background .3s";
  var msg = document.createElement("span"), back = document.createElement("a");
  msg.style.cssText = "flex:1;min-width:0";
  back.textContent = "\u2190 Back to admin"; back.href = "https://" + location.hostname.replace(/^[^.]+\./, "") + "/admin";
  back.style.cssText = "flex:none;padding:.5rem .9rem;border-radius:999px;background:rgba(255,255,255,.95);color:#111;text-decoration:none;font:600 14px/1 system-ui,sans-serif;white-space:nowrap";
  back.onclick = function (e) {
    try { if (window.opener && !window.opener.closed) { e.preventDefault(); window.opener.focus(); window.close(); setTimeout(function () { location.href = back.href; }, 400); } } catch (x) {}
  };
  bar.style.display = "flex"; bar.style.alignItems = "center"; bar.style.gap = ".8rem"; bar.style.paddingLeft = ".7rem"; bar.style.paddingRight = ".7rem";
  bar.appendChild(back); bar.appendChild(msg);
  function say(text, kind) { msg.textContent = text; bar.style.background = kind === "busy" ? "#1565c0" : "#b86e00"; }
  say("DRAFT PREVIEW  ·  not public yet", "draft");
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(bar); });
  function build() { return fetch("/_build.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }); }
  function head() { return fetch("https://api.github.com/repos/" + REPO + "/git/ref/heads/" + BRANCH, { headers: { Accept: "application/vnd.github+json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.object && j.object.sha; }).catch(function () { return null; }); }
  build().then(function (j) { mine = (j && j.sha) || ""; if (!mine) return; check(); });
  var waiting = false;
  function check() {
    if (document.hidden) return;
    head().then(function (sha) {
      if (!sha || sha === mine) { if (waiting) { waiting = false; say("DRAFT PREVIEW  ·  not public yet", "draft"); } return; }
      waiting = true; say("NEW DRAFT BUILDING  ·  this page will refresh by itself", "busy");
      build().then(function (j) { if (j && j.sha === sha) location.reload(); });
    });
  }
  setInterval(check, 20000);
  document.addEventListener("visibilitychange", check);
})();
