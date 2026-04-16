import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastTone = 'info' | 'warning' | 'error';

interface ToastItem {
  id: number;
  title: string;
  message: string;
  tone: ToastTone;
}

interface ToastInput {
  title: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { border: string; title: string }> = {
  info: { border: '#38bdf8', title: '#e0f2fe' },
  warning: { border: '#f59e0b', title: '#fef3c7' },
  error: { border: '#ef4444', title: '#fecaca' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timeoutsRef = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, tone = 'info', durationMs = 5000 }: ToastInput) => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, title, message, tone }]);

      const timeout = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timeoutsRef.current.set(id, timeout);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        data-testid="toast-container"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: 'min(360px, calc(100vw - 32px))',
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const toneStyle = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className="toast"
              role="alert"
              style={{
                pointerEvents: 'auto',
                background: 'rgba(16, 16, 18, 0.96)',
                border: `1px solid ${toneStyle.border}`,
                borderRadius: 12,
                boxShadow: '0 14px 32px rgba(0,0,0,0.35)',
                padding: '12px 14px',
                color: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: toneStyle.title }}>
                    {toast.title}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45 }}>
                    {toast.message}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toast.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 16,
                  }}
                >
                  x
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
