import React from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
};

// Portal-rendered context menu, fixed at the supplied cursor position.
// Closes on Esc, click outside, or any item click. z-index 60 so it sits
// above the delete-confirm modal (z-50). Items dispatch to handlers in the
// shell — the menu itself owns no business logic.
export function ContextMenu({ x, y, items, onClose }: {
  x: number;
  y: number;
  items: ReadonlyArray<ContextMenuItem>;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  // Clamp inside viewport so a right-click near the right/bottom edge doesn't
  // overflow off-screen. Measured after mount via layout effect.
  const [clamped, setClamped] = React.useState<{ left: number; top: number }>({ left: x, top: y });
  React.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    const maxTop = window.innerHeight - rect.height - 8;
    setClamped({
      left: Math.max(8, Math.min(x, maxLeft)),
      top: Math.max(8, Math.min(y, maxTop)),
    });
  }, [x, y]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    function onClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onContextOutside(event: MouseEvent) {
      // Right-click anywhere else dismisses (the next ContextMenu will mount
      // fresh after this onClose).
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('contextmenu', onContextOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('contextmenu', onContextOutside);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="contextMenu"
      role="menu"
      style={{ left: clamped.left, top: clamped.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`contextMenuItem ${item.danger ? 'isDanger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
