import { useState, useEffect, useRef, useCallback } from 'react';

interface PortalWindowOptions {
  width: number;
  height: number;
  title?: string;
}

/**
 * Opens a child BrowserWindow via window.open() that shares the same
 * renderer process. Returns the child window's document.body for use
 * with ReactDOM.createPortal().
 *
 * The child window's OS-level options (alwaysOnTop, transparent, frameless)
 * are configured by the main process via setWindowOpenHandler.
 */
export function usePortalWindow(
  isOpen: boolean,
  options: PortalWindowOptions,
) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);

  const closeWindow = useCallback(() => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close();
    }
    windowRef.current = null;
    setPortalContainer(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      closeWindow();
      return;
    }

    // Build window features string
    const features = [
      `width=${options.width}`,
      `height=${options.height}`,
    ].join(',');

    const childWindow = window.open('about:blank', '_blank', features);
    if (!childWindow) {
      console.error('[usePortalWindow] window.open returned null');
      return;
    }

    windowRef.current = childWindow;

    // Write base document structure with styles into child window
    childWindow.document.open();
    childWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${options.title ?? 'Rough Cut'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: transparent;
      overflow: hidden;
      height: 100%;
      font-family: system-ui, -apple-system, sans-serif;
      color: #e0e0e0;
      -webkit-app-region: drag;
    }
    button, input, select, [data-no-drag] {
      -webkit-app-region: no-drag;
    }
    #portal-root { height: 100%; }
  </style>
</head>
<body>
  <div id="portal-root"></div>
</body>
</html>`);
    childWindow.document.close();

    const container = childWindow.document.getElementById('portal-root');
    if (container) {
      setPortalContainer(container);
    }

    // Clean up if child window is closed externally (e.g., user clicks X)
    const checkClosed = setInterval(() => {
      if (childWindow.closed) {
        clearInterval(checkClosed);
        windowRef.current = null;
        setPortalContainer(null);
      }
    }, 500);

    return () => {
      clearInterval(checkClosed);
      closeWindow();
    };
  }, [isOpen, options.width, options.height, options.title, closeWindow]);

  return { portalContainer, closeWindow, childWindow: windowRef.current };
}
