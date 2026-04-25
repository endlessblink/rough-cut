import { useEffect, useRef } from 'react';
import type { CursorEvent } from '@rough-cut/project-model';
import { transportStore } from './use-stores.js';

const CLICK_SOUND_ASSET_URL = new URL(
  '../../../../../aseets/mouse-click-1.wav',
  import.meta.url,
).href;

let clickBufferPromise: Promise<AudioBuffer | null> | null = null;

function isClickEvent(event: CursorEvent): boolean {
  return event.type === 'down';
}

export function buildClickFrameTimeline(
  events: readonly CursorEvent[] | null,
  cursorEventsFps: number,
  projectFps: number,
  clipTimelineIn: number,
): number[] {
  if (!events || events.length === 0 || cursorEventsFps <= 0 || projectFps <= 0) return [];

  const frames = events
    .filter(isClickEvent)
    .map((event) => clipTimelineIn + Math.round((event.frame / cursorEventsFps) * projectFps))
    .sort((a, b) => a - b);

  return frames;
}

function getClickFrameInRange(
  clickFrames: readonly number[],
  startFrame: number,
  endFrame: number,
): number | null {
  if (clickFrames.length === 0 || endFrame < startFrame) return null;
  for (const frame of clickFrames) {
    if (frame > endFrame) return null;
    if (frame >= startFrame) return frame;
  }
  return null;
}

async function loadClickAudioBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (!clickBufferPromise) {
    clickBufferPromise = fetch(CLICK_SOUND_ASSET_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch click sound asset: ${response.status}`);
        }
        const bytes = await response.arrayBuffer();
        return ctx.decodeAudioData(bytes.slice(0));
      })
      .catch((error) => {
        console.warn('[useClickSoundPlayback] Failed to load click sound asset:', error);
        return null;
      });
  }
  return clickBufferPromise;
}

function playClickBuffer(ctx: AudioContext, buffer: AudioBuffer) {
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.75, ctx.currentTime);
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function ensureAudioContext(existing: AudioContext | null): AudioContext | null {
  if (existing) return existing;
  if (typeof window === 'undefined') return null;

  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return null;
  return new AudioContextCtor();
}

interface UseClickSoundPlaybackOptions {
  enabled: boolean;
  clickFrames: readonly number[];
  isPlaying: boolean;
}

export function useClickSoundPlayback({
  enabled,
  clickFrames,
  isPlaying,
}: UseClickSoundPlaybackOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayheadFrameRef = useRef<number | null>(null);
  const lastSoundFrameRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const clickFramesRef = useRef(clickFrames);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    enabledRef.current = enabled;
    clickFramesRef.current = clickFrames;
    isPlayingRef.current = isPlaying;

    if (!enabled) {
      lastPlayheadFrameRef.current = transportStore.getState().playheadFrame;
      lastSoundFrameRef.current = null;
    }
  }, [clickFrames, enabled, isPlaying]);

  useEffect(() => {
    const handlePlayhead = (playheadFrame: number) => {
      if (!enabledRef.current) {
        lastPlayheadFrameRef.current = playheadFrame;
        lastSoundFrameRef.current = null;
        return;
      }

      const clickFrames = clickFramesRef.current;

      const previousFrame = lastPlayheadFrameRef.current;
      lastPlayheadFrameRef.current = playheadFrame;

      if (clickFrames.length === 0) {
        lastSoundFrameRef.current = null;
        return;
      }

      if (previousFrame !== null && playheadFrame < previousFrame) {
        lastSoundFrameRef.current = null;
        return;
      }

      const rangeStart =
        previousFrame === null || !isPlayingRef.current ? playheadFrame : previousFrame + 1;
      const matchedClickFrame = getClickFrameInRange(clickFrames, rangeStart, playheadFrame);
      if (matchedClickFrame === null || lastSoundFrameRef.current === matchedClickFrame) return;

      const ctx = ensureAudioContext(audioContextRef.current);
      if (!ctx) return;
      audioContextRef.current = ctx;

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      void loadClickAudioBuffer(ctx)
        .then((buffer) => {
          if (!buffer) return;
          playClickBuffer(ctx, buffer);
          lastSoundFrameRef.current = matchedClickFrame;
        })
        .catch((error) => {
          console.warn('[useClickSoundPlayback] Failed to play click sound:', error);
        });
    };

    handlePlayhead(transportStore.getState().playheadFrame);
    return transportStore.subscribe((state, previousState) => {
      if (
        state.playheadFrame === previousState.playheadFrame &&
        state.isPlaying === previousState.isPlaying
      ) {
        return;
      }
      isPlayingRef.current = state.isPlaying;
      handlePlayhead(state.playheadFrame);
    });
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        void ctx.close().catch(() => {});
      }
    };
  }, []);
}
