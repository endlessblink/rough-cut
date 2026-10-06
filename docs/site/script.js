(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const loops = document.querySelectorAll("video[autoplay]");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    loops.forEach((v) => {
      v.removeAttribute("autoplay");
      v.pause();
      v.controls = true;
    });
  } else if ("IntersectionObserver" in window) {
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.play().catch(() => {});
        else e.target.pause();
      });
    });
    loops.forEach((v) => watcher.observe(v));
  }
  const reveal = () => {
    const el = document.getElementById(location.hash.slice(1));
    if (el?.tagName === "DETAILS") el.open = true;
  };
  document.querySelectorAll("a[href^='#']").forEach((link) => {
    link.addEventListener("click", () => {
      const el = document.getElementById(link.getAttribute("href").slice(1));
      if (el?.tagName === "DETAILS") el.open = true;
    });
  });
  window.addEventListener("hashchange", reveal);
  reveal();
  const config = window.ROUGH_CUT_RELEASE || {};
  const official = (value) => {
    try {
      if (typeof value !== "string") return null;
      const u = new URL(value);
      return u.protocol === "https:" &&
        u.hostname === "github.com" &&
        (!u.port || u.port === "443") &&
        !u.username &&
        !u.password &&
        u.pathname.startsWith("/endlessblink/rough-cut/releases/download/")
        ? u.href
        : null;
    } catch {
      return null;
    }
  };
  const asset =
    official(config.tarballUrl) ||
    official(config.appImageUrl) ||
    official(config.debUrl);
  if (config.published === true && asset) {
    document.querySelector("[data-linux-cta]").href = asset;
    document.querySelector("[data-linux-label]").textContent =
      "Download for Linux";
    document.querySelector("[data-release-status]").textContent =
      `Linux beta${config.version ? ` · ${String(config.version)}` : ""} · Mac coming soon`;
    document.querySelector("[data-linux-summary]").textContent =
      "Verified Linux beta available";
    document.querySelector("[data-linux-copy]").textContent =
      "The verified Linux beta is available through GitHub Releases. Linux x86_64 with X11 is required; Wayland is unsupported.";
  }
})();
