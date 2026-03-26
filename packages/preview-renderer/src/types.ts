/** Compositor configuration */
export interface CompositorConfig {
  /** Target canvas element or container to mount into */
  canvas?: HTMLCanvasElement;
  /** Initial width (will be overridden by project settings) */
  width?: number;
  /** Initial height */
  height?: number;
  /** Background color override */
  backgroundColor?: string;
}

/** Compositor state */
export type CompositorState = 'idle' | 'playing' | 'paused' | 'disposed';

/** Playback event callbacks */
export interface CompositorEvents {
  onFrameRendered?: (frame: number) => void;
  onStateChange?: (state: CompositorState) => void;
}
