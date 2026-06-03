# Direction — Rough Cut as a One-Stop AI Creative Hub

> Status: **direction / not yet scheduled.** This is a forward-looking vision doc, not a task list. Nothing here ships until it is decomposed into discrete `MASTER_PLAN.md` tasks under the existing one-task-at-a-time rule. The current product (Screen Studio-style Linux recorder + editor, per `PRODUCT.md`) remains the load-bearing core; everything below is **additive**.

## Why this exists

The owner wants Rough Cut to become their single personal home for *anything AI-creative*: record → generate → edit → assemble, in one window. Today Rough Cut already owns the hardest, most reusable piece of any creative studio — a real timeline (`timeline-engine`: `clip-operations`, `overlap`, `snap`, `select-clips`, `auto-zoom`) plus a versioned project model with migrations, an effect registry, a frame resolver, preview/export, and an Electron shell with a tested visual harness.

That foundation makes Rough Cut a better host for an AI creative studio than adopting a third-party app (e.g. ArtCraft, which is **Fair Source** — fine to use, not legally ours to sell). Building here = we own it end-to-end and can sell a focused slice later.

This is deliberately **wider than `PRODUCT.md`'s current positioning.** That is accepted: it's a personal one-stop tool. The risk is product incoherence for a public audience — mitigated by the split strategy below.

## Non-negotiables carried over from the existing product

- **One task at a time, every task verified.** No batching this in as a mega-feature. Decompose into MASTER_PLAN tasks.
- **The design anti-references still apply.** No gradient orbs, particle backgrounds, neon-on-dark "AI tool" aesthetic. The AI surfaces must read like Linear/Resolve chrome — *precise, calm, load-bearing* — not a consumer AI playground.
- **The preview is the product.** Generation and gallery panels exist to feed the timeline/preview, not to become a separate toy app.
- **Boringly reliable foundations first.** Provider calls cost real money; correctness and cost-visibility before polish.

## Architecture — additive modules, reuse the engine

Add new workspace packages; do **not** mutate the recorder. Reuse what exists:

| Reuse (exists today) | New (to build) |
|---|---|
| `timeline-engine` — clip ops, overlap, snap, selection | `gen-providers` — connectors to Higgsfield (CLI + MCP) and Magnific/Freepik (MCP/REST). OAuth, **per-batch cost gate**, `generate cost` preview before spend. |
| `project-model` — versioned schema **+ migrations** | Schema extension via a migration: `shots`, `characters`, `prompts`, `genJobs`, `assets` (multi-provider), linked to existing project/timeline entities. |
| `effect-registry`, `frame-resolver` | `asset-library` — gallery/showcase of generated stills + clips, organized by shot/character; drag onto the timeline. |
| `desktop` Electron shell + Playwright visual tests | `shot-board` — script → shots breakdown; `prompt-authoring` panel driven by Claude. |

- **The "brain" is the show-runner skills**, not new prose baked into this repo. Point at: `gen-platforms` (which platform hosts which model, Soul ID vs Spaces LoRA, CLI/MCP, **credits draw from the same subscription as the web UI**), and the per-model prompting skills (`seedance-2-prompting` hub + `veo`/`kling`/`nano-banana-pro`/`gpt-image-2`). Canonical location: `<show-runner>/.agents/skills/`.
- **Electron fit:** the main process shells out to the `higgsfield` CLI and/or calls the two remote MCP servers (`mcp.higgsfield.ai`, `mcp.magnific.com`); the renderer hosts the gallery + boards. No new backend service required.
- **Assembly already exists.** Generated clips land on `timeline-engine` like any clip — that's the payoff of hosting here instead of rebuilding a timeline.

## Cost & safety (hard rule for this module)

Every generation spends the owner's paid credits, and **CLI/MCP draw from the same subscription pool as the platforms' web UI** — no separate billing. The module must: estimate cost before firing, surface a running credit tally, and never auto-generate without explicit confirmation. Mirror the gate documented in the `gen-platforms` skill.

## Public-split strategy (so "too wide" stays optional)

Keep each capability a clean module behind a stable interface so a focused vertical can be peeled off and sold without the rest:

- **Slice A — Rough Cut (recorder/editor):** today's product, unchanged, sellable as-is.
- **Slice B — AI Film Studio:** `shot-board` + `gen-providers` + `asset-library` + `timeline-engine`, minus the screen-recording capture path.
- **Shared core:** `timeline-engine`, `project-model`, `effect-registry`, `frame-resolver`, `desktop` shell.

If the modules stay decoupled, "split it later" is a packaging decision, not a rewrite.

## Open questions to resolve before scheduling

1. Does `timeline-engine` support multiple tracks (overlays/audio), or single-track only? AI assembly likely needs multi-track — scope that first if missing.
2. Provider auth in Electron: device-code OAuth (Higgsfield CLI) vs remote MCP connector — pick one path per platform.
3. Where Claude prompt-authoring runs: in-app via Anthropic, or hand-off to the show-runner Claude Code session that already has the skills loaded.

## First concrete step when this is greenlit

Not a build — a **spike**: read `timeline-engine` + `project-model` end to end, answer the three open questions, and draft the schema-migration shape for `shots/characters/assets`. Then decompose into MASTER_PLAN tasks, one at a time.

---

_Related: `PRODUCT.md` (core positioning), `shared-timeline-architecture.md` (timeline contract), `MASTER_PLAN.md` (task ledger). Brain/prompting lives in show-runner `.agents/skills/{gen-platforms,seedance-2-prompting,...}`._
