---
id: inspector-shell-pattern
name: Inspector Shell with Icon Rail Pattern
description: How to build a category-switching inspector panel with icon rail for Rough Cut, following Focusee's UI pattern
source: conversation
triggers:
  - "inspector panel"
  - "icon rail"
  - "category switching"
  - "right panel"
  - "InspectorShell"
  - "add inspector category"
quality: high
---

# Inspector Shell with Icon Rail Pattern

## The Insight

Screen recording apps (Focusee, Screen Studio) don't stack all inspector controls vertically. They use an icon rail for category switching, showing one panel at a time. This scales to many categories without vertical overflow. The key design decision: each category panel is a standalone component with its own props — the shell only handles switching and the icon rail.

## Why This Matters

Stacking all controls vertically in a narrow sidebar (220-260px) creates excessive scrolling and makes the panel feel cramped. With 5+ categories, users can't find controls quickly. The icon rail provides instant visual navigation.

## Recognition Pattern

- Building or extending the right-side inspector in Record or Edit tabs
- Adding a new control category (e.g. "Background", "Watermark", "Audio")
- Needing to show different control sets based on context

## The Approach

### Adding a new inspector category:

1. **Create the panel component** as `Record[Name]Panel.tsx` (or `Edit[Name]Panel.tsx`):
   - Props: only the data and callbacks it needs
   - No wrapper/card — InspectorShell provides the container
   - Use shared controls: `ControlLabel`, `RcSlider`, `RcSelect`, `PillRadioRow`, `RcToggleButton`

2. **Add the category** to the categories array in `RecordRightPanel.tsx`:
   ```tsx
   {
     id: 'your-id',
     label: 'Your Label',
     icon: <YourIcon />,       // 16×16 SVG inline
     onReset: handleReset,     // optional
     panel: <YourPanel ... />,
   }
   ```

3. **Icons**: Simple 16×16 SVGs, single stroke color. Active = `rgba(255,255,255,0.80)`, inactive = `rgba(255,255,255,0.35)`.

4. **Template cards**: For visual selection grids (like Templates category), use compact cards in a 2-column grid, grouped by category headers. Each card shows a schematic whose shape reflects the content (e.g. aspect ratio shapes for layout templates).

### Key files:
- `apps/desktop/src/renderer/ui/InspectorShell.tsx` — the shell (don't modify)
- `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx` — Record categories
- `apps/desktop/src/renderer/features/edit/EditRightPanel.tsx` — Edit categories (not yet migrated to InspectorShell)
- `apps/desktop/src/renderer/ui/tokens.ts` — `RECORD_PANEL_WIDTH` (260), `EDIT_PANEL_WIDTH` (280)
