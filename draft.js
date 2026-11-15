// Only added to draft builds (never the public site): marks the page as a draft and refreshes it when a newer draft is built.
(function () {
  var REPO = "__REPO__", BRANCH = "__BRANCH__", mine = "";
  var bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:.8rem 1rem calc(.8rem + env(safe-area-inset-bottom,0px));font:600 16px/1.3 system-ui,sans-serif;letter-spacing:.01em;text-align:center;color:#fff;background:#b86e00;box-shadow:0 -2px 12px rgba(0,0,0,.25);transition:background .3s";
  function say(text, kind) { bar.textContent = text; bar.style.background = kind === "busy" ? "#1565c0" : "#b86e00"; }
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
