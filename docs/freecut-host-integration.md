# FreeCut host integration contract

Rough Cut embeds the vendored FreeCut build as the only advanced Editor surface.
Recording Edit remains the canonical host compositor and project owner.

## Canonical data flow

- The host opens one project and passes its project ID plus version in the FreeCut URL.
- The host owns persistence and the canonical timeline document.
- FreeCut renders and edits the embedded project through the host bridge.
- FreeCut commands must identify the same project ID before the host applies them.
- The host must map accepted FreeCut edits back into the canonical project document.

## Readiness protocol

The child sends these messages to `window.parent`:

- `freecut-boot`: the application module loaded and initialized its host bridge.
- `freecut-ready`: the application is ready to render the validated project.
- `freecut-error`: the child failed during startup.
- `freecut:ready` with `probe: true`: an early, dependency-free bootstrap probe.

The host validates the embedded marker, project ID, and project version before setting
the surface ready. The host also sends `freecut:request-status` after mounting and
for a bounded retry window; this prevents one-shot boot messages from being lost
while the iframe listener is mounting.

## Packaging invariants

- The packaged FreeCut `index.html` entry script and its hashed application chunk must
  come from the same build.
- Packaging must reject stale or mismatched hashed output and rebuild the vendored
  distribution after clearing the old output.
- The packaged renderer report must identify the route, host bundle, one FreeCut
  surface, one iframe, readiness, marker, project identity, and visible loading/error
  state in one JSON record.

## Evidence learned during diagnosis

- The dock package and host renderer can launch successfully.
- FreeCut's inline bootstrap executes and its probe can cross the iframe boundary.
- The first report was misleading because it captured the host's initial loading state.
- A stale hashed FreeCut distribution was found: the HTML/bootstrap and application
  chunks were not guaranteed to be from one build.
- After clean packaging, the child module loaded and emitted valid boot/readiness
  payloads; the host received matching origin, marker, project ID, and version.
- The packaged smoke gate still fails later in the broader UI flow, so no working
  release claim is justified yet.

## Required future debugging loop

1. Build the vendored FreeCut output cleanly.
2. Run the packaged diagnostics test.
3. Trigger `smoke-package` through the host readiness runner.
4. Compare the fresh runtime report timestamp to the launch and package timestamps.
5. Only then inspect screenshots or change UI code.

Do not treat a passing source test, iframe existence, inline probe, or stale runtime
report as proof that the packaged editor is ready.
