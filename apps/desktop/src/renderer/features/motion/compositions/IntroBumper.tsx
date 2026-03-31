import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface IntroBumperProps {
  projectName: string;
  tagline: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

export const IntroBumper: React.FC<IntroBumperProps> = ({
  projectName = 'Rough Cut',
  tagline = 'Screen Recording Studio',
  accentColor = '#2563eb',
  backgroundColor = '#0a0a0a',
  textColor = '#ffffff',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const nameIn = spring({ frame, fps, config: { damping: 10, stiffness: 80, mass: 0.6 } });
  const taglineIn = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 14, stiffness: 70, mass: 0.5 } });
  const lineWidth = interpolate(nameIn, [0, 1], [0, 200]);
  const fadeOutStart = durationInFrames - 20;
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
      gap: 16,
    }}>
      <div style={{
        fontSize: 64,
        fontWeight: 800,
        color: textColor,
        fontFamily: 'system-ui, sans-serif',
        transform: `translateY(${interpolate(nameIn, [0, 1], [40, 0])}px)`,
        opacity: nameIn,
        letterSpacing: '-0.02em',
      }}>
        {projectName}
      </div>
      <div style={{
        height: 3,
        width: lineWidth,
        backgroundColor: accentColor,
        borderRadius: 2,
      }} />
      <div style={{
        fontSize: 20,
        fontWeight: 400,
        color: textColor,
        fontFamily: 'system-ui, sans-serif',
        opacity: taglineIn * 0.6,
        transform: `translateY(${interpolate(taglineIn, [0, 1], [20, 0])}px)`,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {tagline}
      </div>
    </div>
  );
};
