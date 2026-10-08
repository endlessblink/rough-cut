/* The URL guard in script.js only accepts official GitHub release download links. */
window.ROUGH_CUT_RELEASE = Object.freeze({
  published: true,
  version: "0.1.0-beta",
  tarballUrl: "https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta/rough-cut-0.1.0-linux-x64.tar.gz",
  appImageUrl: null,
  debUrl: null,
});

/* Google Form behind the Mac/Windows waitlist. Entry ids come from the form's questions. */
window.ROUGH_CUT_WAITLIST = Object.freeze({
  formResponseUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSc9LY7ixr82Hgpn_6ACstpYF5pRGWGY0UkBGjqeKnEU6tzVXQ/formResponse",
  emailEntry: "entry.1385153765",
  platformEntry: "entry.1692496502",
});
