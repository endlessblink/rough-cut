import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface LowerThirdProps {
  name: string;
  role: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  position: 'left' | 'center' | 'right';
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  name = 'John Doe',
  role = 'Software Engineer',
  accentColor = '#2563eb',
  textColor = '#ffffff',
  backgroundColor = 'rgba(0,0,0,0.75)',
  position = 'left',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const slideIn = spring({ frame, fps, config: { damping: 15, stiffness: 100, mass: 0.5 } });
  const fadeOutStart = durationInFrames - 15;
  const opacity = frame > fadeOutStart
    ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  const justify = position === 'center' ? 'center' : position === 'right' ? 'flex-end' : 'flex-start';
  const translateX = position === 'right'
    ? interpolate(slideIn, [0, 1], [100, 0])
    : interpolate(slideIn, [0, 1], [-100, 0]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: justify,
      padding: '0 60px 80px',
      opacity,
    }}>
      <div style={{
        transform: `translateX(${translateX}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{
          height: 3,
          width: interpolate(slideIn, [0, 1], [0, 80]),
          backgroundColor: accentColor,
          borderRadius: 2,
        }} />
        <div style={{
          padding: '12px 24px',
          backgroundColor,
          borderRadius: 8,
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: textColor,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {name}
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 400,
            color: textColor,
            opacity: 0.7,
            fontFamily: 'system-ui, sans-serif',
            marginTop: 2,
          }}>
            {role}
          </div>
        </div>
      </div>
    </div>
  );
};
