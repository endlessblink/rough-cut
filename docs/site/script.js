(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const play = document.querySelector("[data-demo-play]"),
    stage = document.querySelector(".output-stage"),
    video = stage.querySelector("video"),
    error = document.querySelector("[data-video-error]");
  play.hidden = false;
  play.addEventListener("click", async () => {
    play.disabled = true;
    play.textContent = "Loading the cut…";
    error.hidden = true;
    const source = video.querySelector("source");
    let failPlayback;
    const failed = new Promise((_, reject) => {
      failPlayback = () => reject(new Error("Media unavailable"));
    });
    video.addEventListener("error", failPlayback);
    source.addEventListener("error", failPlayback);
    const timeout = setTimeout(failPlayback, 15000);
    try {
      video.load();
      await Promise.race([video.play(), failed]);
      stage.classList.add("is-playing");
      video.focus({ preventScroll: true });
    } catch {
      video.pause();
      error.hidden = false;
      play.textContent = "Try playback again";
    } finally {
      clearTimeout(timeout);
      video.removeEventListener("error", failPlayback);
      source.removeEventListener("error", failPlayback);
      play.disabled = false;
    }
  });
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
  const asset = official(config.appImageUrl) || official(config.debUrl);
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
