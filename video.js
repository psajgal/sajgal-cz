// Video page: a click on a tile opens Instagram's own player on top of the page.
// Nothing from Instagram is loaded until then. Without JavaScript the tile is a plain link to the post.
(function () {
  var vo = document.getElementById("vo"), box = document.getElementById("vbox"), x = document.getElementById("vx");
  if (!vo) return;
  var last = null, loading = false;
  function process() { if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process(); }
  function ensureScript() {
    if (window.instgrm) { process(); return; }
    if (loading) return; loading = true;
    var s = document.createElement("script"); s.async = true; s.src = "https://www.instagram.com/embed.js"; s.onload = process;
    document.body.appendChild(s);
  }
  function open(link, from) {
    last = from; box.innerHTML = "";
    var bq = document.createElement("blockquote");
    bq.className = "instagram-media"; bq.setAttribute("data-instgrm-permalink", link); bq.setAttribute("data-instgrm-version", "14");
    bq.style.cssText = "max-width:540px;min-width:326px;width:100%;margin:0;background:#fff;border:0";
    var a = document.createElement("a"); a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = "View this post on Instagram"; bq.appendChild(a);
    box.appendChild(bq);
    vo.hidden = false; document.body.classList.add("noscroll"); x.focus();
    ensureScript();
  }
  function close() { vo.hidden = true; box.innerHTML = ""; document.body.classList.remove("noscroll"); if (last) last.focus(); }
  Array.prototype.forEach.call(document.querySelectorAll("a.vt"), function (el) {
    el.addEventListener("click", function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); open(el.getAttribute("data-ig"), el); });
  });
  x.addEventListener("click", close);
  vo.addEventListener("click", function (e) { if (e.target === vo) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !vo.hidden) close(); });
})();
