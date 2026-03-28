interface CountdownOverlayProps {
  secondsRemaining: number;
  visible: boolean;
}

export function CountdownOverlay({ secondsRemaining, visible }: CountdownOverlayProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{`
        @keyframes countdown-pulse {
          0% {
            transform: scale(1.5);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.0);
            opacity: 1;
          }
        }
        .countdown-number {
          animation: countdown-pulse 300ms ease-out forwards;
        }
      `}</style>
      <span
        key={secondsRemaining}
        className="countdown-number"
        style={{
          fontSize: 120,
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1,
          userSelect: 'none',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {secondsRemaining}
      </span>
    </div>
  );
}
