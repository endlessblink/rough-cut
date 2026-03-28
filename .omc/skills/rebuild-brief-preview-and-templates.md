---
id: rebuild-brief-preview-and-templates
name: REBUILD BRIEF — Preview + Templates
description: Actionable brief for rebuilding the broken Record tab preview and templates system from scratch with proper tests
source: conversation
triggers:
  - "rebuild preview"
  - "fix templates"
  - "templates broken"
  - "preview not working"
  - "nothing happens when clicking template"
quality: high
---

# REBUILD BRIEF: Record Tab Preview + Templates

## STATUS: BROKEN — Nothing works

**Current state (2026-03-28):**
- Template cards render visually but clicking them does NOTHING
- Background gradient/color/padding/shadow/inset controls have ZERO visible effect
- Camera shape/position controls have ZERO visible effect
- The preview area never changes shape, background, or content when controls are used
- Out of 17 inspector controls, only 2 produce visible changes (background color partially, resolution text partially)

## ROOT CAUSE

The UI panels update store values, but:
1. `PreviewCard` doesn't receive or apply background config props
2. Click handlers in `RecordTemplatesPanel` may not be firing (needs verification)
3. The `handleSelectTemplate` in `RecordRightPanel` calls `projectStore.getState().updateSettings({ resolution })` but nothing in the preview reacts
4. Multiple rounds of patching have left the code in an inconsistent state

## WHAT TO DO IN THE NEXT SESSION

### Step 0: Verify the click path
Before writing any code, verify in the real Electron app:
1. Add `console.log` to `handleSelectTemplate` in RecordRightPanel.tsx
2. Click a template card
3. Check if the log fires in DevTools console
4. If it doesn't fire → the button onClick isn't connected
5. If it fires → the store update works but nothing reads the result

### Step 1: Read the skill file first
Read `.omc/skills/record-tab-development.md` — it has the full architecture, canonical doc references, industry research, and the correct 3-layer preview rendering approach.

### Step 2: Rebuild PreviewCard with background props
The current `PreviewCard` at `apps/desktop/src/renderer/features/record/PreviewCard.tsx` needs these props passed and applied as CSS:
- `aspectRatio` — dynamic from resolution
- `bgColor`, `bgGradient` — background fill
- `bgPadding` — inset of the content frame
- `bgCornerRadius` — content frame corners
- `bgShadowEnabled`, `bgShadowBlur` — content shadow
- `bgInset`, `bgInsetColor` — content border

Architecture (from Recordly/Screen Studio research):
```
Outer div (aspectRatio, overflow:hidden, background: gradient or color)
  └── Content frame div (position:absolute, inset: padding, borderRadius, boxShadow, border)
        └── children (video/canvas, position:absolute, inset:0)
```

### Step 3: Wire RecordTab → PreviewCard
`RecordTab.tsx` has `background` state (type `BackgroundConfig`). Pass it to PreviewCard as individual props.

### Step 4: Write Playwright tests
Use `tests/electron/test-templates.mjs` pattern — launch real Electron, click template, verify:
1. Resolution label text changes
2. Preview card's computed `aspect-ratio` changes
3. Background div's `background` style changes when gradient is selected

### Step 5: Verify ALL controls end-to-end
Before claiming anything works, verify EACH control produces a VISIBLE change:
- [ ] Template click → aspect ratio changes
- [ ] Template click → resolution label changes
- [ ] Gradient click → background changes
- [ ] Padding slider → gap appears
- [ ] Corner radius → corners round
- [ ] Shadow toggle → shadow appears
- [ ] Inset slider → border appears

## KEY FILES
- `apps/desktop/src/renderer/features/record/PreviewCard.tsx` — REBUILD
- `apps/desktop/src/renderer/features/record/RecordTab.tsx` — wire props
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx` — verify handlers fire
- `apps/desktop/src/renderer/features/record/RecordTemplatesPanel.tsx` — verify button onClick
- `.omc/skills/record-tab-development.md` — full context

## CRITICAL RULES
1. **Do NOT claim something works without visually verifying in Electron**
2. **Add console.log FIRST to verify handlers fire before debugging CSS**
3. **If 3 fix attempts fail, stop and trace the full data flow**
4. **Test in real Electron, not Playwright browser — they render differently**
