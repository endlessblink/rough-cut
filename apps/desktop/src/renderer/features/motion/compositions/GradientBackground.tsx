import { useCurrentFrame, interpolate, useVideoConfig } from '@remotion/core';

interface GradientBackgroundProps {
  colorA: string;
  colorB: string;
  colorC: string;
  speed: number;
  angle: number;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  colorA = '#1a1a2e',
  colorB = '#16213e',
  colorC = '#0f3460',
  speed = 1,
  angle = 135,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = (frame / fps) * speed;
  const shift = interpolate(Math.sin(progress * Math.PI * 2), [-1, 1], [0, 100]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: `linear-gradient(${angle}deg, ${colorA} ${shift - 20}%, ${colorB} ${shift + 20}%, ${colorC} ${shift + 60}%)`,
    }} />
  );
};
