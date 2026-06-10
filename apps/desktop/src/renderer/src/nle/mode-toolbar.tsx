// Resolve-style edit mode toolbar: Selection (A), Trim edit (T), Blade (B),
// Dynamic trim (W, not yet implemented). Mode switching happens dozens of
// times per session — the active-state swap is deliberately instant (no
// transition); only the press feedback animates.
import { ArrowsHorizontal, Cursor, Scissors, Timer } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

export type NleEditMode = 'select' | 'trim' | 'blade';

const MODES: ReadonlyArray<{ id: NleEditMode; Glyph: Icon; label: string; shortcut: string }> = [
  { id: 'select', Glyph: Cursor, label: 'Selection', shortcut: 'A' },
  { id: 'trim', Glyph: ArrowsHorizontal, label: 'Trim edit', shortcut: 'T' },
  { id: 'blade', Glyph: Scissors, label: 'Blade', shortcut: 'B' },
];

export function NleModeToolbar({
  mode,
  onModeChange,
}: {
  mode: NleEditMode;
  onModeChange: (mode: NleEditMode) => void;
}) {
  return (
    <div className="nleModeToolbar" role="toolbar" aria-label="Edit modes">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="nleModeButton"
          aria-pressed={mode === item.id}
          aria-label={`${item.label} mode`}
          title={`${item.label} (${item.shortcut})`}
          onClick={() => onModeChange(item.id)}
        >
          <item.Glyph aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        className="nleModeButton"
        disabled
        aria-label="Dynamic trim mode (coming soon)"
        title="Dynamic trim (W) — coming soon"
      >
        <Timer aria-hidden="true" />
      </button>
    </div>
  );
}
