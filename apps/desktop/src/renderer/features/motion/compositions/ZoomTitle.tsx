import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface ZoomTitleProps {
  title: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  zoomSpeed: number;
}

export const ZoomTitle: React.FC<ZoomTitleProps> = ({
  title = 'Chapter One',
  fontSize = 80,
  color = '#ffffff',
  backgroundColor = '#0f0f0f',
  zoomSpeed = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const zoomIn = spring({
    frame,
    fps,
    config: { damping: 12 * zoomSpeed, stiffness: 60, mass: 0.8 },
  });
  const scale = interpolate(zoomIn, [0, 1], [8, 1]);
  const fadeOutStart = durationInFrames - 15;
  const opacity = frame > fadeOutStart
    ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : interpolate(zoomIn, [0, 0.3, 1], [0, 1, 1]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize,
        fontWeight: 800,
        color,
        fontFamily: 'system-ui, sans-serif',
        transform: `scale(${scale})`,
        opacity,
        letterSpacing: '-0.03em',
      }}>
        {title}
      </div>
    </div>
  );
};
