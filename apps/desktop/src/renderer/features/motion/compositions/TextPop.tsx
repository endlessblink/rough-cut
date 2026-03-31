import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface TextPopProps {
  text: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  bounce: boolean;
}

export const TextPop: React.FC<TextPopProps> = ({
  text = 'WOW!',
  fontSize = 96,
  color = '#ffffff',
  backgroundColor = '#0f0f0f',
  bounce = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: bounce ? 8 : 15, stiffness: 150, mass: 0.4 },
  });
  const scale = interpolate(scaleSpring, [0, 1], [0, 1]);
  const fadeOutStart = durationInFrames - 10;
  const opacity = frame > fadeOutStart
    ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : scaleSpring;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor,
    }}>
      <div style={{
        fontSize,
        fontWeight: 900,
        color,
        fontFamily: 'system-ui, sans-serif',
        transform: `scale(${scale})`,
        opacity,
        letterSpacing: '-0.02em',
      }}>
        {text}
      </div>
    </div>
  );
};
