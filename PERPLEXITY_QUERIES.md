# Rough Cut / FreeCut research queries

Use these queries to challenge the current integration assumptions.

## Editor architecture

1. In an Electron desktop video editor, what is the safest architecture for keeping the host shell (recording, projects, media, transcript, AI) in one window while embedding a vendored advanced editor in one view, rather than opening a second BrowserWindow?

2. What are the failure modes when an Electron app supports both an embedded iframe editor and a standalone editor window, especially around project identity, command history, focus, save routing, and stale state?

3. How should a host application expose one canonical project document to an embedded editor so edits, undo/redo, media assets, transitions, keyframes, effects, and transcript changes remain bidirectionally synchronized?

## Shared state and synchronization

4. Compare polling, push events, and an in-process command bus for synchronizing a canonical video project between a React host shell and a vendored editor; which design preserves ordering, conflict handling, and undo history?

5. What invariants should prove that two editor surfaces share the same project, asset graph, timeline, compositor metadata, and command history instead of merely loading matching snapshots?

6. How should a media bridge represent compositor output so it is preview-only and cannot become synthetic editable timeline media, while preserving effects, transitions, keyframes, crop, zoom, cursor, censor, and aspect-ratio state?

## Linux dock and packaged runtime

7. On KDE Plasma, how do pinned icon applets resolve `localPath` versus `url` desktop entries, and how can packaging reliably update every pinned copy without leaving a development launcher behind?

8. What machine-verifiable evidence distinguishes a process launched by the installed Plasma pinned entry from the same packaged binary launched directly from a terminal or stale desktop cache?

9. How should an Electron app handle single-instance relaunches from multiple Plasma launchers while preserving the original launch provenance and focusing the correct window?

## Visual proof

10. What evidence is required for a fail-closed visual test of a Linux dock-launched Electron app: launcher provenance, package/source identity, foreground window identity, window bounds, screenshot freshness, and independent visual review?

11. How can a screenshot proof distinguish live application chrome from recorded desktop video rendered inside a video editor preview, without falsely treating valid media content as foreign windows or overlap?

12. What regression test prevents a visual proof gate from accepting a catalog desktop entry while the user’s pinned Plasma copy still launches a development build?

## Acceptance criteria

13. Given a Rough Cut shell with Recording, Projects, Recording edit, Editor, and AI views, what acceptance test proves that only the Editor view is FreeCut while all other views remain host-owned and use the same active project?

14. What end-to-end test sequence best proves: dock click → one packaged process → Rough Cut shell → active project loaded → embedded FreeCut Editor view → edit round trip → shared state visible in another host view?

## Discrepancy diagnosis

15. How can an Electron host prove that the visible Editor viewport is rendering the vendored FreeCut DOM rather than a legacy host preview behind an iframe, including a runtime origin marker and DOM boundary check?

16. What is the correct startup sequence when a host URL contains a project path: hydrate the host project first, select the Editor view, mount FreeCut, and block legacy editor rendering until FreeCut acknowledges readiness?

17. How should a host prevent a saved recording status, default view, or stale renderer state from switching the dock-launched project back to Recording or the legacy Recording edit view?

18. What test detects a screenshot that visually resembles the old editor even though an iframe exists, by asserting FreeCut-specific controls and rejecting host-only preview controls?

19. How should a single-window host expose FreeCut’s command bus through a same-origin iframe so all project edits enter the host’s canonical undo stack instead of FreeCut’s private local storage?

20. What exact evidence distinguishes “FreeCut is embedded” from “FreeCut loaded separately and the host window is merely visible behind it” in a full-desktop screenshot?

21. How should the host handle FreeCut readiness failure: keep Rough Cut shell visible with an explicit blocking error, or show a read-only project view, without silently falling back to the legacy editor?

22. What migration strategy removes the rejected hybrid Program/Source editor without removing Rough Cut’s recording, projects, transcript, media, AI, and navigation shell?

## Remaining implementation and proof gaps

23. In Electron, what is the most reliable same-origin or preload-safe way to expose a runtime identity marker from a vendored iframe so the host can prove the iframe is the intended FreeCut build and not a stale or substituted document?

24. How should an embedded editor readiness handshake be designed so the host validates build identity, embedded status, project ID, schema version, and capabilities before enabling editing, while preventing a flash of legacy UI during startup?

25. What is the smallest command protocol for a single-user video editor where FreeCut emits asset, clip, trim, transition, keyframe, effect, transcript, and viewport operations and the Rough Cut host authoritatively applies, persists, acknowledges, broadcasts, and undoes them?

26. How can automated tests prove that an edit made inside an embedded editor changes the host canonical project and is visible in the media browser, timeline, compositor, transcript, and export paths without relying on polling or matching snapshots?

27. What checks detect a split-brain project when the editor, host renderer, and main process disagree on project ID, revision, asset hashes, timeline checksum, or latest command ID, and when should the system force a full re-sync?

28. How should an Electron host prevent the legacy Program/Source renderer from mounting at all in the advanced Editor route, including code-splitting, stale React state, cached renderer bundles, and packaged-build differences?

29. What is a robust Linux/KDE method for repairing a pinned desktop entry in place, refreshing Plasma’s desktop cache, and proving the user’s existing pin now resolves to the current packaged executable rather than merely proving that a catalog entry is correct?

30. How can a dock-launch proof capture the complete provenance chain from the clicked pinned desktop file to the final Electron PID, executable, environment marker, WM_CLASS, foreground window, and screenshot timestamp in a way that a review JSON cannot simply claim?

31. What visual-review protocol best distinguishes FreeCut-specific chrome from a recorded desktop image that happens to contain an editor-like UI, using runtime DOM evidence plus full-window screenshot review and explicit rejection markers?

32. How should packaged Electron builds expose a deterministic build hash in both the desktop launcher and the embedded FreeCut runtime so source, artifact, process, iframe, and screenshot evidence can be joined into one immutable proof record?

33. What failure-safe UX should appear when FreeCut does not acknowledge readiness or reports an incompatible project, and how can tests prove that no editable legacy fallback is reachable through navigation, reload, or project switching?

34. What end-to-end test can launch only through the existing Plasma pin, open the active project, verify Rough Cut shell ownership of non-editor views, verify embedded FreeCut ownership of Editor, perform one edit, undo it, and fail if any second window or second project store appears?

35. Which Electron/WebContentsView or iframe lifecycle events must be cleaned up on route changes, project switches, reloads, and app relaunches to prevent an old FreeCut instance from continuing to receive commands or rendering over the new Editor surface?

## Final safety and recovery questions

36. What validation and authorization rules should a host command bus enforce for embedded-editor operations so malformed, stale, cross-project, or path-traversal payloads cannot mutate the canonical project or read arbitrary media?

37. How should large media imports and preview URLs be represented over an Electron host/editor bridge so binary data never travels through JSON commands, asset UUIDs remain stable, and cancellation or partial import recovery is deterministic?

38. What capability-negotiation handshake should FreeCut and the host use when the vendored editor supports a different schema or feature set than the Rough Cut project, including graceful disabling of unsupported effects, transitions, keyframes, and export settings?

39. When should the host persist an accepted command—before acknowledgment, after durable write, or through a journal—and how should it recover and replay commands after a crash without duplicating an operation?

40. How can a single Electron renderer safely transfer a MessagePort to an iframe, detect disconnects, close old ports on navigation, and guarantee that commands from a previous project cannot reach the current project?

41. What end-to-end recovery test proves that reloading FreeCut, switching projects, or restarting the packaged dock app hydrates the same canonical document and command history rather than restoring FreeCut-local stale state?

42. How should read-only fallback rendering be implemented so it reuses the canonical compositor/timeline data but exposes no mutation controls, no editable timeline, no hidden legacy Program/Source surface, and no alternate save path?

43. What release checklist joins source commit, packaged artifact hash, desktop-entry hash, pinned-entry hash, process executable, FreeCut runtime marker, project revision, and screenshot timestamp into one tamper-evident visual-proof record?
44. KDE Plasma desktop icon versus taskbar pin precedence: How can an application
    prove which `.desktop` entry was actually activated when the desktop icon,
    pinned taskbar icon, and user-local application entry have different `Exec`
    targets? Include cache refresh requirements, runtime process evidence, and a
    fail-closed verification script that rejects any development launcher.

45. KDE Plasma clicked-entry provenance: How can a desktop application determine
    whether activation came from a desktop icon, taskbar pin, application menu,
    or stale cached `.desktop` metadata, and what runtime evidence proves the
    exact entry that was clicked?

46. Electron Linux packaged app exits after dock launch: What are the common
    causes when the packaged Electron process appears briefly, writes startup
    evidence, then exits without a visible window? Include single-instance locks,
    renderer load failures, sandbox permissions, uncaught startup promises, and
    how to capture the real exit reason.

47. Electron window not foreground after Plasma activation: What is the reliable
    Linux/X11 and Wayland-safe sequence for showing, focusing, and activating the
    BrowserWindow opened by a `.desktop` launch, and how can tests prove that the
    screenshot belongs to that window rather than the previously focused app?

48. One packaged Electron binary with multiple stale installs: How should a
    desktop app detect and reject stale or duplicate installations when Plasma
    pins, desktop icons, and application-menu entries point to different builds?
    Include executable hash, app path, build hash, WM_CLASS, PID lifetime, and
    single-instance evidence.

49. Fail-closed visual proof for dock-launched Electron apps: What minimum
    machine-verifiable evidence is required before accepting a screenshot—live
    PID, executable path, desktop-entry hash, window ID/class, active-window
    timestamp, DOM marker, and screenshot hash—and which evidence must invalidate
    the proof when any link is missing?

50. Electron startup project hydration and editor routing: How should a packaged
    app guarantee that a dock launch loads the active project before rendering
    the advanced editor, while preventing a legacy editor route or stale view
    preference from appearing during startup or after a single-instance handoff?

51. KDE Plasma desktop icon activation with multiple monitors: How can automated
    tests identify the exact screen, icon cell, and `.desktop` file activated when
    the root screenshot spans multiple displays and coordinate mapping is not
    one-to-one with the visible panel?

52. Proving a clicked desktop entry actually opened a window: What Linux evidence
    links one click event to one child process, one WM_CLASS/app_id, one window ID,
    and one screenshot timestamp, including failure handling when the process exits
    before the first frame?

53. Electron packaged process starts then exits silently from a Plasma launcher:
    What logging and crash-diagnostic hooks should be installed in the main process
    and wrapper so stdout, stderr, uncaught exceptions, rejected startup promises,
    renderer-gone events, and exit codes are retained after the window disappears?

54. Electron single-instance handoff with stale development process: How can the
    packaged launcher detect that an existing process belongs to a different build,
    refuse to hand off to it, and safely terminate or isolate the stale instance?

55. Foreground screenshot proof for Electron on X11 and Wayland: Which APIs and
    window properties reliably prove the target window is active and unobscured,
    and how should a proof fail when another application is in front?

56. Canonical project round-trip test for embedded editors: What deterministic
    fixture and sequence proves host composition, FreeCut edit, host persistence,
    Recording edit refresh, FreeCut rehydration, and global undo all reference one
    project UUID, version, asset graph, and command history?

57. Detecting stale FreeCut hydration after host composition: How can the editor
    expose a visible project version/hash and track summary so tests reject a view
    that loaded only raw camera or screen assets instead of the host-composed state?

58. Fail-closed visual gate design: How should a gate distinguish “package built”
    from “the exact dock click rendered the current UI,” and which missing runtime
    facts must prevent any completion claim even when source tests and screenshots
    individually pass?

59. Packaged Electron artifact still shows old UI after rebuild: What can cause a
    dock-launched application to render an older renderer bundle even when the
    inspected package contains the new build hash and source markers? Cover stale
    app.asar/resources copies, service workers, Chromium cache, duplicate package
    roots, single-instance handoff, and launch arguments.

60. Runtime source-to-screenshot identity proof: How can an Electron app expose a
    cryptographically linked build identity from the main process, renderer bundle,
    embedded editor DOM, desktop entry, live PID, and screenshot metadata so a
    visually stale UI cannot pass after source changes?

61. Plasma launcher cache versus actual Exec target: How can tests read the
    effective command Plasma uses at click time rather than trusting the edited
    `.desktop` file, including taskbar pin metadata, desktop icon metadata, KSycoca,
    symlinks, and application-menu caches?

62. Electron service-worker/cache invalidation in packaged local editor assets:
    How should a vendored editor disable or version service-worker and browser
    caches so a dock relaunch cannot display an earlier UI bundle after packaging?

63. Detecting duplicate Rough Cut installations at runtime: What complete scan of
    desktop entries, Plasma pins, process command lines, app paths, resource roots,
    and build hashes reliably finds every installed copy before visual verification?

64. Reproducing a stale dock UI deterministically: What diagnostic harness should
    record the exact click target, effective Exec, PID ancestry, app path, renderer
    asset hash, window identity, DOM marker, and screenshot so the mismatch can be
    replayed without relying on visual guesses?

65. Fail-closed acceptance when dock and terminal differ: Which exact runtime facts
    must match before accepting a dock result as equivalent to a terminal-launched
    packaged result, and how should the gate report the first mismatch clearly?

66. Electron same-executable stale renderer after rebuild: How can one packaged
    Electron process show an old host compositor beneath a new embedded-editor
    loading panel even when the executable path is current? Cover renderer process
    reuse, BrowserWindow navigation history, service-worker/cache state, iframe
    document reuse, single-instance handoff, and runtime techniques to read and
    compare the actually loaded host and iframe bundle hashes.

67. Electron/React route shows legacy compositor beneath embedded-editor loading
    state: How can an active advanced-editor tab render a new FreeCut loading panel
    while the old host compositor, media panel, and timeline remain visible? Cover
    conditional-render fall-through, duplicated layout shells, stale React roots,
    CSS positioning/overflow, iframe sizing, mixed renderer bundles, and runtime
    DOM assertions that prove the Editor viewport contains no legacy controls.

68. Electron packaged artifact appears unchanged after a clean rebuild: How can
    a release prove, with a single reproducible command, that the dock-launched
    process loaded the current renderer bundle and the expected React route rather
    than an older asar, duplicate install, stale taskbar process, or cached iframe?
    Require a machine-readable chain from desktop entry and effective Exec to PID,
    executable/resource hashes, host DOM route marker, embedded-editor marker, and
    screenshot, with fail-closed mismatch reporting.

69. How should a desktop Electron app expose a trustworthy known-good baseline
    surface for debugging an advanced-editor migration? Compare a canonical host
    Recording Edit route against the embedded FreeCut route, and define a safe
    diagnostic launch mode that proves which surface is visible without weakening
    the real dock acceptance path or allowing a legacy fallback to pass.
