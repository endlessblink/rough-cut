# Product

## Register

product

## Users

Solo content creators and developer-educators recording screen tutorials, demos, and product walkthroughs on Linux desktops. They use the app on a single workstation, often multi-monitor, in dark-room editing sessions. The job-to-be-done is: capture a screen take (sometimes with camera + mic), trim and zoom it, export a polished MP4 — without context-switching out of a focused editing flow.

## Product Purpose

Rough Cut Studio is a desktop screen recorder + editor with an editor-first feel. It exists because Screen Studio is macOS-only and DaVinci Resolve is overkill for short demos. Success looks like: the user records, picks the take from a visual library, makes a few cuts/zooms, and exports — all in one window, all in muscle memory, without the editor ever feeling like a toy.

## Brand Personality

Quiet, deliberate, infrastructure-grade. Reads like a professional editing tool — DaVinci Resolve's confidence at Linear's restraint. Dark editorial dev-tool, not consumer-app delight. Voice in copy is direct and competent, never cute.

Three-word personality: **precise, calm, load-bearing**.

## Anti-references

- Theatrical motion: hover bounces, elastic curves, scale-up-on-tap, anything that draws the eye to chrome instead of content.
- Consumer-app delight: emojis in UI, gradient hero buttons, hand-drawn illustrations, "you got this!" empty states.
- Glassmorphism, neumorphism, decorative blur stacks.
- The hero-metric SaaS template (big number + small label + supporting stats).
- Identical card grids of icon + heading + paragraph.
- Side-stripe colored borders on cards or rows.
- Generic "AI tool" aesthetic (gradient orbs, particle backgrounds, neon-on-dark).

Reference apps the brand should sit next to: Linear, Vercel, DaVinci Resolve, Screen Studio. Not: Notion (too soft), Figma (too playful), most YC SaaS dashboards.

## Design Principles

1. **The preview is the product.** Every control exists to modify the current preview. Chrome shrinks to leave space for the work.
2. **Stable layout over animated reveals.** Sections that show/hide based on selection cause flicker; prefer disabled controls over disappearing ones.
3. **Boringly reliable.** Record → preview → edit → export must feel inevitable. No features ship until the foundation under them is solid.
4. **Pro chrome, not consumer chrome.** App-level navigation reads like a tool (DaVinci page tabs), not like a website (sticky marketing nav).
5. **Tokens before one-offs.** Repeated visual values become CSS custom properties before they multiply.

## Accessibility & Inclusion

Standard product-grade accessibility:
- Keyboard navigation across all views and within each view (Tab order respects visual order; visible focus rings on all interactives).
- `prefers-reduced-motion: reduce` collapses hover transitions and view-change motion to instant state swaps.
- WCAG AA contrast on chrome (text on chrome ≥ 4.5:1, icons ≥ 3:1).
- No color-only state signals (active tab needs both color and an underline indicator; camera badge needs both icon and label).
- No known user accommodations beyond the above; revisit if multi-user / shared editing arrives.
