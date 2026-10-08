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
  const asset = official(config.appImageUrl) || official(config.debUrl) || official(config.tarballUrl);
  if (config.published === true && asset) {
    document.querySelector("[data-linux-cta]").href = asset;
    document.querySelector("[data-linux-label]").textContent =
      "Download for Linux";
    document.querySelector("[data-release-status]").textContent =
      "Free and open source · Linux beta";
    document.querySelector("[data-linux-summary]").textContent =
      "Verified Linux beta available";
    document.querySelector("[data-linux-copy]").textContent =
      "The verified Linux beta is available through GitHub Releases. Linux x86_64 with X11 is required; Wayland is unsupported.";
  }

  // Waitlist posts straight into a Google Form (responses land in a Sheet).
  const waitlist = document.querySelector("[data-waitlist]");
  const wl = window.ROUGH_CUT_WAITLIST || {};
  const formUrl =
    typeof wl.formResponseUrl === "string" &&
    /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/.test(wl.formResponseUrl)
      ? wl.formResponseUrl
      : null;
  if (waitlist) {
    const status = waitlist.querySelector("[data-waitlist-status]");
    const email = waitlist.querySelector("input[type='email']");
    const button = waitlist.querySelector("button");
    const say = (text, tone) => {
      status.textContent = text;
      status.dataset.tone = tone || "";
    };
    waitlist.addEventListener("submit", async (event) => {
      event.preventDefault();
      const platforms = [...waitlist.querySelectorAll("input[name='platform']:checked")].map((i) => i.value);
      email.removeAttribute("aria-invalid");
      if (!platforms.length) return say("Pick Mac, Windows, or both.", "error");
      if (!email.checkValidity()) {
        email.setAttribute("aria-invalid", "true");
        email.focus();
        return say("That email doesn't look right. Check it and try again.", "error");
      }
      if (!formUrl || !wl.emailEntry || !wl.platformEntry)
        return say("Sign-ups open in a few days. Follow on GitHub until then.", "error");
      const body = new URLSearchParams();
      body.append(wl.emailEntry, email.value.trim());
      platforms.forEach((p) => body.append(wl.platformEntry, p));
      button.disabled = true;
      say("Adding you…");
      try {
        // Google Forms sends no CORS headers; an opaque response means it was accepted.
        await fetch(formUrl, { method: "POST", mode: "no-cors", body });
        waitlist.dataset.done = "";
        say(`You're on the ${platforms.join(" and ")} list. One email when it's ready, nothing else.`, "done");
      } catch {
        button.disabled = false;
        say("Couldn't reach the waitlist. Check your connection and try again.", "error");
      }
    });
  }
})();
