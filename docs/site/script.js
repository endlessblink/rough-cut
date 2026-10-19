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
  const he = document.documentElement.lang === "he";
  const t = (en, hebrew) => (he ? hebrew : en);
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
      t("Download for Linux", "הורדה ל-Linux");
    document.querySelector("[data-release-status]").textContent =
      t("Free and open source · Linux beta", "חינמי וקוד פתוח · גרסת בטא ל-Linux");
    document.querySelector("[data-linux-summary]").textContent =
      t("Verified Linux beta available", "גרסת בטא מאומתת ל-Linux זמינה");
    document.querySelector("[data-linux-copy]").textContent =
      t("The verified Linux beta is available through GitHub Releases. Linux x86_64 with X11 is required; Wayland is unsupported.", "גרסת הבטא המאומתת ל-Linux זמינה דרך GitHub Releases. נדרש Linux x86_64 עם X11; Wayland אינו נתמך.");
  }
  // Windows appears only once a real installer is on GitHub Releases; until then it stays on the waitlist.
  const windowsAsset = official(config.windowsUrl);
  if (config.published === true && windowsAsset) {
    const cta = document.querySelector("[data-windows-cta]");
    cta.href = windowsAsset;
    cta.hidden = false;
    document.querySelector("[data-windows-status]").hidden = false;
    const windowsHint = document.querySelector("[data-windows-hint]");
    if (windowsHint) {
      windowsHint.hidden = false;
      windowsHint.querySelector("a")?.addEventListener("click", () => { document.querySelector("#windows-status").open = true; });
    }
    // After a Windows download starts, show the two clicks for the SmartScreen warning right under the button.
    cta.addEventListener("click", () => {
      const howto = document.querySelector("[data-windows-howto]");
      const steps = document.querySelector("#windows-status .smartscreen");
      if (!howto || !steps) return;
      if (!howto.querySelector(".smartscreen")) howto.append(steps.cloneNode(true));
      const clip = document.querySelector("#windows-status .install-video");
      if (clip && !howto.querySelector(".install-video")) howto.append(clip.cloneNode(true));
      howto.hidden = false;
      if (windowsHint) windowsHint.hidden = true;
    });
    document.querySelector("[data-release-status]").textContent =
      t("Free and open source · Linux and Windows beta", "חינמי וקוד פתוח · גרסת בטא ל-Linux ול-Windows");
    document.querySelector(".lead").textContent =
      t("Screen recording and editing, together on Linux and Windows.", "הקלטה ועריכת מסך, ביחד ב-Linux וב-Windows.");
    document.querySelector("[data-waitlist-title]").textContent = "Mac";
    document.querySelector("[data-waitlist-link]").textContent = t("Mac waitlist", "רשימת המתנה ל-Mac");
    document.querySelector("[data-waitlist-copy]").textContent =
      t("No Mac build or date yet. It gets built once enough people ask for it. Leave your email and we will write once, when it is ready.", "אין עדיין גרסה ל-Mac ואין תאריך. היא תיבנה כשמספיק אנשים יבקשו. השאירו אימייל ונכתוב פעם אחת, כשהיא מוכנה.");
    const windowsChoice = document.querySelector("input[name='platform'][value='Windows']");
    windowsChoice?.closest("label")?.remove();
    const macChoice = document.querySelector("input[name='platform'][value='Mac']");
    if (macChoice) macChoice.checked = true;
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
      if (!platforms.length) return say(t("Pick Mac, Windows, or both.", "בחרו Mac, Windows, או שניהם."), "error");
      if (!email.checkValidity()) {
        email.setAttribute("aria-invalid", "true");
        email.focus();
        return say(t("That email doesn't look right. Check it and try again.", "האימייל לא נראה תקין. בדקו ונסו שוב."), "error");
      }
      if (!formUrl || !wl.emailEntry || !wl.platformEntry)
        return say(t("Sign-ups open in a few days. Follow on GitHub until then.", "ההרשמה נפתחת בעוד כמה ימים. עד אז עקבו ב-GitHub."), "error");
      const body = new URLSearchParams();
      body.append(wl.emailEntry, email.value.trim());
      platforms.forEach((p) => body.append(wl.platformEntry, p));
      button.disabled = true;
      say(t("Adding you…", "מוסיפים אתכם…"));
      try {
        // Google Forms sends no CORS headers; an opaque response means it was accepted.
        await fetch(formUrl, { method: "POST", mode: "no-cors", body });
        waitlist.dataset.done = "";
        say(t(`You're on the ${platforms.join(" and ")} list. One email when it's ready, nothing else.`, `נרשמתם לרשימה (${platforms.join(", ")}). אימייל אחד כשזה מוכן, ותו לא.`), "done");
      } catch {
        button.disabled = false;
        say(t("Couldn't reach the waitlist. Check your connection and try again.", "לא הצלחנו להגיע לרשימה. בדקו את החיבור ונסו שוב."), "error");
      }
    });
  }
})();
