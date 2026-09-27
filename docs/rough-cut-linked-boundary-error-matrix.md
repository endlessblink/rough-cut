# Rough Cut linked-boundary error matrix

Updated: 2026-09-01

This matrix defines the failure, the evidence that catches it, and the state that
is allowed to be reported. A source test or DOM check never replaces the packaged
runtime screenshot gate.

| Failure or symptom | Root cause to investigate | Required regression gate | Fail-closed evidence / repair |
| --- | --- | --- | --- |
| A tiny cut near the start paints as a wide block or overlaps its neighbor | A minimum visual width or a second frame-to-pixel mapping distorts short ranges | `frameRangeToPlacement` with `[0,3)` in a long recording; repeated cuts at frames 3 and 6 | Width is proportional to frames and the model remains half-open; use the shared frame placement for both lanes |
| SCREEN and AUDIO have different timeline ranges after a cut | Split updated only the selected lane, used different rounding, or paired by index | Linked model mismatch test plus the real `S` and scissors paths | Every linked pair has equal `timelineIn`/`timelineOut` and a stable linked identity |
| Audio waveform preview is squeezed, repeated, or otherwise distorted after a cut | Each split audio child scales the entire waveform to its local clip width | Cut-path waveform geometry test plus the fresh packaged SCREEN/AUDIO review | Render one full-timeline waveform and offset each clipped child by its canonical start frame; do not modify audio data or playback |
| Normal click on a clip mutates its timing | Incidental pointer drift commits a move even though no edit tool is active | One-pixel click-drift preserves the complete clip structure | Require a visible movement threshold before committing a clip move |
| Playback hitches at an adjacent cut | A point-cut boundary re-seeks a decoder even though its next source frame is already contiguous | A source-contiguous adjacent-cut fixture crosses the boundary with no boundary seek while frame cadence is measured | Advance the active segment without seeking for source-contiguous cuts; only non-contiguous edits may initiate a new decode seek |
| AUDIO boundary follows the wrong SCREEN clip after reorder/split | Audio is matched by array position instead of linked clip identity | Keyed pairing test with reversed audio order | Pair by the `audio:<screenId>` identity and verify the complete set |
| DOM rectangles look aligned but the screenshot is visibly split | Waveform or lane paint uses stale `left`/`width`, a different scale, or different box math | Independent SCREEN/AUDIO pixel scan on the fresh packaged screenshot | Every expected boundary is present in both lanes at the same pixel; any missing or extra boundary fails |
| One repeated cut is aligned but another is not | The gate checks only the selected boundary or only the first split | Repeated cuts at 3 and 6, with the full boundary union checked | The complete repeated boundary set matches, not just the selected clip |
| Painted evidence says both lanes have signal but the x positions differ | Evidence records scores without proving the same boundary coordinates | Known mismatched painted-boundary fixture | Validator rejects a SCREEN-only x and an AUDIO-only x even when both individual scores are high |
| Tests pass against a dev renderer while the dock shows the old app | Stale package, stale Electron process, or a development desktop entry | Package identity, installed desktop-entry, PID, and dock provenance tests | Rebuild and relaunch the current package; stale identity or launcher binding is a hard failure |
| The screenshot uses a synthetic or different project | The persisted user project was not loaded | Exact real-project path and runtime project identity checks | Run the gate against the persisted 33-minute recording and bind the report to that project |
| The screenshot is cropped, stale, or missing the complete editor | Review artifact is not the final dock-launched surface | Fresh screenshot hash, complete checklist, and independent visual review | Mark `READY_FOR_USER_VISUAL_CONFIRMATION`; do not report fixed or complete |
| Automated proof passes but the user has not inspected the exact screenshot | Human visual confirmation is still the final acceptance boundary | `pnpm completion:gate` and `pnpm user:confirm-visual` | Remain `manual_action_required` until the user records the exact visual confirmation |

## Required verification order

1. Run the focused model, renderer-contract, and proof-validator tests.
2. Build a fresh Linux package and verify the installed desktop entry points to its dock launcher.
3. Load the persisted real project, perform the repeated near-start cuts, and capture the complete boundary close-up.
4. Have an independent reviewer inspect the fresh screenshot and record the complete checklist.
5. Run `pnpm visual-proof:verify` and `pnpm completion:gate`.
6. Stop at `READY_FOR_USER_VISUAL_CONFIRMATION` until the user visually confirms the exact screenshot.

## Non-negotiable negative fixtures

- `[0,3)` in a 2001-second recording must not receive a minimum half-percent width.
- Reversed audio ordering must still pair correctly by identity.
- A split waveform must display its own source interval, never the full recording squeezed into every audio clip.
- A one-pixel drift during an ordinary clip click must not alter any clip timing.
- A source-contiguous adjacent cut must advance without a decoder re-seek and preserve frame cadence.
- A painted boundary present at different SCREEN/AUDIO x positions must fail.
- A stale package identity, development dock entry, missing persisted project, missing close-up, or incomplete boundary set must fail.
