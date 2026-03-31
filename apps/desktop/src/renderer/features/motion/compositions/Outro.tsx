import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface OutroProps {
  heading: string;
  subtext: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

export const Outro: React.FC<OutroProps> = ({
  heading = 'Thanks for watching!',
  subtext = 'Like & Subscribe',
  accentColor = '#2563eb',
  backgroundColor = '#0a0a0a',
  textColor = '#ffffff',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const headingIn = spring({ frame, fps, config: { damping: 15, stiffness: 80, mass: 0.5 } });
  const subtextIn = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 14, stiffness: 70, mass: 0.5 } });
  const fadeOutStart = durationInFrames - 25;
  const fadeOut = frame > fadeOutStart
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
      opacity: fadeOut,
      gap: 24,
    }}>
      <div style={{
        fontSize: 52,
        fontWeight: 700,
        color: textColor,
        fontFamily: 'system-ui, sans-serif',
        transform: `translateY(${interpolate(headingIn, [0, 1], [30, 0])}px)`,
        opacity: headingIn,
      }}>
        {heading}
      </div>
      <div style={{
        padding: '12px 32px',
        borderRadius: 999,
        border: `2px solid ${accentColor}`,
        fontSize: 18,
        fontWeight: 600,
        color: accentColor,
        fontFamily: 'system-ui, sans-serif',
        opacity: subtextIn,
        transform: `scale(${interpolate(subtextIn, [0, 1], [0.8, 1])})`,
        letterSpacing: '0.05em',
      }}>
        {subtext}
      </div>
    </div>
  );
};
