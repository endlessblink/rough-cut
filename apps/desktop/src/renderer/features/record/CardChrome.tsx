import React, { useRef, useState, useEffect } from 'react';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CardChromeProps {
  /** Template aspect ratio string like '16:9', '9:16', '1:1' */
  aspectRatio: string;
  /** Background color (hex) */
  bgColor?: string;
  /** Background CSS gradient (takes priority over bgColor) */
  bgGradient?: string | null;
  /** Padding between background edge and content area (px) */
  bgPadding?: number;
  /** Corner radius on the content frame (px) */
  bgCornerRadius?: number;
  /** Whether to show drop shadow on the content frame */
  bgShadowEnabled?: boolean;
  /** Shadow blur radius (px) */
  bgShadowBlur?: number;
  /** Inset border width (px) */
  bgInset?: number;
  /** Inset border color (hex) */
  bgInsetColor?: string;
  /** Content to render inside the chrome */
  children: React.ReactNode;
  /** Ref to the inner content area (for coordinate conversion) */
  innerRef?: React.Ref<HTMLDivElement>;
}

// ─── CardChrome ───────────────────────────────────────────────────────────────
//
// Pure presentation shell — the "floating premium card" look.
//
// Measures its parent container and computes the largest card that fits
// while maintaining the template aspect ratio. This avoids the CSS
// aspect-ratio limitation where width:100% prevents height-constrained
// shrinking for portrait/square ratios.

export function CardChrome({
  aspectRatio,
  bgColor = '#4a1942',
  bgGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  children,
  innerRef,
}: CardChromeProps) {
  // Parse aspect ratio
  const parts = aspectRatio.split(':').map(Number);
  const cardAspect = (parts[0] ?? 16) / (parts[1] ?? 9);

  // ── Measure parent to compute card size ─────────────────────────────────
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const parentW = el.clientWidth;
      const parentH = el.clientHeight;
      if (parentW === 0 || parentH === 0) return;

      // Fit the card with the given aspect ratio inside the parent
      const parentAspect = parentW / parentH;
      let w: number;
      let h: number;
      if (cardAspect > parentAspect) {
        // Card is wider than parent → constrained by width
        w = parentW;
        h = parentW / cardAspect;
      } else {
        // Card is taller than parent → constrained by height
        h = parentH;
        w = parentH * cardAspect;
      }
      setCardSize({ width: Math.round(w), height: Math.round(h) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardAspect]);

  // Background: gradient takes priority over solid color
  const background = bgGradient ?? bgColor;

  return (
    /* Invisible wrapper — fills the parent, used for measurement */
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Layer 1 — Background canvas (sized by JS, not CSS aspect-ratio) */}
      {cardSize && (
        <div
          data-testid="record-card-chrome"
          style={{
            position: 'relative',
            width: cardSize.width,
            height: cardSize.height,
            borderRadius: 18,
            overflow: 'hidden',
            background,
            boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
            transition: 'background 200ms ease',
          }}
        >
          {/* Layer 2 — Full-size content area. Screen-specific framing is handled downstream. */}
          <div
            ref={innerRef}
            data-testid="record-card-content"
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
