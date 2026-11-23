// Photo pages: the photos are already in the page (good for search engines).
// This only adds the full-screen viewer when a photo is clicked.
(function () {
  var root = document.getElementById("gallery");
  if (!root) return;
  var links = Array.prototype.slice.call(root.querySelectorAll("a[href]"));
  if (!links.length) return;
  var current = 0, opener = null;

  /* Even columns for the automatic layout (masonry.js); without JavaScript the page falls back to plain CSS columns.
     The viewer keeps the original photo order. */
  if (window.sajgalMasonry) window.sajgalMasonry(root, links, { cols: +root.dataset.cols || 0, phone: +root.dataset.phone || 1, even: root.dataset.even !== "0", offs: (root.dataset.offs || "").split(",").filter(Boolean).map(Number) });

  var lb = document.createElement("div");
  lb.className = "lb"; lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Photo viewer");
  lb.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button>' +
    '<button class="prev" type="button" aria-label="Previous photo">&#8592;</button>' +
    '<button class="next" type="button" aria-label="Next photo">&#8594;</button>' +
    '<a class="goto" href="#" hidden>Go to show <span aria-hidden="true">\u2192</span></a>' +
    '<figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  var big = lb.querySelector("img"), cap = lb.querySelector("figcaption"), go = lb.querySelector(".goto");

  function data(i) {
    var a = links[i], im = a.querySelector("img");
    return { src: a.getAttribute("href"), caption: a.dataset.cap || "", alt: im ? im.alt : "", show: a.dataset.show || "" };
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
    if (p.show) { go.href = p.show; go.hidden = false; } else { go.hidden = true; }
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
