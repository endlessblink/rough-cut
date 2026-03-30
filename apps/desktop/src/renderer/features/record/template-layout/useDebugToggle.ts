import { useState, useEffect, useCallback } from 'react';

/**
 * Hook that manages debug overlay visibility.
 * Combines an external `visible` prop with a keyboard toggle (Ctrl+Shift+D / Cmd+Shift+D).
 * Returns [isVisible, toggle].
 */
export function useDebugToggle(initialVisible: boolean): [boolean, () => void] {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const toggle = useCallback(() => {
    setKeyboardVisible((prev) => {
      const next = !prev;
      console.log(`[DebugOverlay] Debug overlay ${next ? 'ON' : 'OFF'}`);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (isModifier && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const isVisible = initialVisible || keyboardVisible;

  return [isVisible, toggle];
}
