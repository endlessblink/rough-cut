/* Release links must point at real GitHub release assets; deploy this commit only after its assets are verified. */
window.ROUGH_CUT_RELEASE = Object.freeze({
  published: true,
  version: "0.1.0-beta.9",
  appImageUrl: "https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.9/Rough-Cut-0.1.0-beta.9-x86_64.AppImage",
  debUrl: "https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.9/Rough-Cut-0.1.0-beta.9-amd64.deb",
  tarballUrl: "https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.9/rough-cut-0.1.0-beta.9-linux-x64.tar.gz",
});

/* Google Form behind the Mac/Windows waitlist. Entry ids come from the form's questions. */
window.ROUGH_CUT_WAITLIST = Object.freeze({
  formResponseUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSc9LY7ixr82Hgpn_6ACstpYF5pRGWGY0UkBGjqeKnEU6tzVXQ/formResponse",
  emailEntry: "entry.1385153765",
  platformEntry: "entry.1692496502",
});
