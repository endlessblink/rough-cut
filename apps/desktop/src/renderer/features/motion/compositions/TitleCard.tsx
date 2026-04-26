import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface TitleCardProps {
  title: string;
  subtitle: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title = 'My Video',
  subtitle = 'A Rough Cut Production',
  backgroundColor = '#0f0f0f',
  textColor = '#ffffff',
  accentColor = '#2563eb',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Spring/interpolate produce NaN when fps arrives as 0/undefined during
  // initial Player mount. Clamp every animated output so a transient invalid
  // fps doesn't leak NaN into CSS opacity/width/transform.
  const safe = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

  const titleProgress = safe(
    spring({ frame, fps, config: { damping: 12, stiffness: 100, mass: 0.5 } }),
  );
  const subtitleProgress = safe(
    spring({
      frame: Math.max(0, frame - 10),
      fps,
      config: { damping: 14, stiffness: 80, mass: 0.5 },
    }),
  );

  // Accent line
  const lineWidth = safe(interpolate(titleProgress, [0, 1], [0, 120]));

  // Fade out near end
  const fadeOutStart = durationInFrames - 20;
  const opacity = frame > fadeOutStart
    ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor,
      opacity,
      gap: 16,
    }}>
      {/* Accent line */}
      <div style={{
        width: lineWidth,
        height: 3,
        backgroundColor: accentColor,
        borderRadius: 2,
        marginBottom: 8,
      }} />

      {/* Title */}
      <div style={{
        color: textColor,
        fontSize: 72,
        fontWeight: 700,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '-0.02em',
        transform: `translateY(${interpolate(titleProgress, [0, 1], [30, 0])}px)`,
        opacity: titleProgress,
      }}>
        {title}
      </div>

      {/* Subtitle */}
      <div style={{
        color: textColor,
        fontSize: 24,
        fontWeight: 400,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '0.05em',
        opacity: subtitleProgress * 0.7,
        transform: `translateY(${interpolate(subtitleProgress, [0, 1], [20, 0])}px)`,
      }}>
        {subtitle}
      </div>
    </div>
  );
};
