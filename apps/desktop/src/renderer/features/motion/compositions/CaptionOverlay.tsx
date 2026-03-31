import { useCurrentFrame, interpolate, spring, useVideoConfig } from '@remotion/core';

interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

interface CaptionOverlayProps {
  words: CaptionWord[];
  style: 'modern' | 'classic';
  fontSize: number;
  color: string;
  highlightColor: string;
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  words = [],
  fontSize = 48,
  color = '#ffffff',
  highlightColor = '#2563eb',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Container entrance
  const containerProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 120, mass: 0.3 },
  });

  // Fade out near end
  const fadeOutStart = durationInFrames - 15;
  const containerOpacity = frame > fadeOutStart
    ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : containerProgress;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: '10%',
      opacity: containerOpacity,
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.3em',
        maxWidth: '80%',
        transform: `translateY(${interpolate(containerProgress, [0, 1], [20, 0])}px)`,
      }}>
        {words.map((word, i) => {
          const isActive = frame >= word.startFrame && frame < word.endFrame;
          const isPast = frame >= word.endFrame;
          const wordEntrance = spring({
            frame: Math.max(0, frame - word.startFrame),
            fps,
            config: { damping: 10, stiffness: 200, mass: 0.3 },
          });

          const scale = isActive ? interpolate(wordEntrance, [0, 1], [1.1, 1.15]) : 1;
          const wordOpacity = frame < word.startFrame ? 0.4 : isPast ? 0.7 : 1;
          const wordColor = isActive ? highlightColor : color;
          const shadowBlur = isActive ? 20 : 0;

          return (
            <span
              key={i}
              style={{
                fontSize,
                fontWeight: isActive ? 800 : 600,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: wordColor,
                opacity: wordOpacity,
                transform: `scale(${scale})`,
                transition: 'color 80ms ease, font-weight 80ms ease',
                textShadow: isActive ? `0 0 ${shadowBlur}px ${highlightColor}40` : 'none',
                display: 'inline-block',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
