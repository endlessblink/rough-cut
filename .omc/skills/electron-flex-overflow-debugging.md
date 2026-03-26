---
id: electron-flex-overflow-debugging
name: Electron Flexbox Overflow Debugging
description: How to diagnose and fix flex items that overflow their container in Electron apps, where Playwright browser tests pass but Electron renders differently
source: conversation
triggers:
  - "sidebar clipped"
  - "flex item not shrinking"
  - "overflow hidden clips content"
  - "Playwright passes but Electron doesn't"
  - "scrollWidth larger than clientWidth"
  - "minWidth auto"
quality: high
---

# Electron Flexbox Overflow Debugging

## The Insight

In Electron apps, Playwright MCP browser tests and real Electron windows render flexbox layouts differently at the same viewport width. The root cause is usually `min-width: auto` (the browser default for flex items) propagating intrinsic content width up through nested flex containers. The fix requires `min-width: 0` AND `overflow: hidden` on every flex item in the horizontal shrinking chain — `min-width: 0` alone is often insufficient because nested content still establishes an intrinsic minimum.

## Why This Matters

You can spend hours tweaking CSS when Playwright reports "no overflow" but the real Electron window clearly clips content. The difference comes from:
1. Canvas elements with large intrinsic pixel dimensions (e.g. PixiJS canvas at 1920×1080)
2. Nested flex containers where `min-width: auto` at any level prevents shrinking
3. DevTools docked inside the Electron window stealing content area width
4. Elements with `width: 100%` inside flex columns creating circular sizing

## Recognition Pattern

- A sidebar or panel is clipped on its right edge in Electron
- `element.scrollWidth > element.clientWidth` on the containing row
- Playwright at the same viewport width shows no overflow
- The clipped amount is consistent (e.g. always 30px or 54px)
- Adding `min-width: 0` to the flex item doesn't fix it

## The Approach

1. **Don't guess — measure.** Write a Playwright script that launches the real Electron app (not a browser tab) and logs `scrollWidth`, `clientWidth`, `getBoundingClientRect()` for every element in the layout chain. Compare values between working tabs (e.g. Edit) and broken tabs (e.g. Record).

2. **Trace the width chain top-down.** For each element from root to the overflowing content:
   - Check `getComputedStyle(el).minWidth` — if it's `auto`, that element can't shrink below its content
   - Check `scrollWidth vs clientWidth` — the first element where they differ is the overflow source
   - Check for `width: '100%'` combined with `flexShrink: 0` — this creates an unshrinkable element

3. **Fix the chain, not individual elements.** Every flex container in the horizontal path needs:
   ```css
   min-width: 0;      /* allow shrinking below content width */
   overflow: hidden;   /* force the browser to clip instead of growing */
   ```

4. **Extract layout into a shared component.** If Tab A works and Tab B doesn't, create a shared layout component that both use. The bug is always in a structural difference between them.

5. **Check for external style injection.** If `element.getAttribute('style')` shows properties you didn't set (like `padding-right: 100px`), use a DOM breakpoint (right-click → Break on → Attribute modifications) to catch the injecting script.

## Example

The `WorkspaceRow` component that fixed the Record sidebar:

```tsx
// The main content column MUST have both min-width: 0 AND overflow: hidden
<div style={{ flex: '1 1 0%', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  {main}
</div>

// The sidebar wrapper MUST have flexShrink: 0 and an explicit width
<div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0, width: isCollapsed ? 12 : 12 + sidebarWidth }}>
  {toggle}
  {inspector}
</div>
```

Key: the sidebar wrapper has an **explicit pixel width**, not just `flex: 0 0 Xpx` on its children. This prevents the flex algorithm from giving the main column extra width.
