import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pixi.js before importing the compositor
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = { width: 0, height: 0 } as unknown as HTMLCanvasElement;
    stage = {
      addChild: vi.fn(),
      removeChildren: vi.fn(),
      children: [] as unknown[],
    };
    renderer = { resize: vi.fn() };
    ticker = { stop: vi.fn() };
    async init(_opts?: unknown): Promise<void> {}
    render(): void {}
    destroy(): void {}
  },
  Container: class {
    children: unknown[] = [];
    position = { set: vi.fn() };
    scale = { set: vi.fn() };
    pivot = { set: vi.fn() };
    rotation = 0;
    alpha = 1;
    zIndex = 0;
    sortableChildren = false;
    addChild(...args: unknown[]): void {
      this.children.push(...args);
    }
    removeChild(_child: unknown): void {}
    destroy(_opts?: unknown): void {}
  },
  Graphics: class {
    clear(): this {
      return this;
    }
    rect(): this {
      return this;
    }
    fill(): this {
      return this;
    }
    stroke(): this {
      return this;
    }
    destroy(): void {}
  },
  Text: class {
    text = '';
    style = {};
    anchor = { set: vi.fn() };
    position = { set: vi.fn() };
    constructor(opts?: { text?: string; style?: unknown }) {
      if (opts?.text) this.text = opts.text;
    }
    destroy(): void {}
  },
  TextStyle: class {
    constructor(_opts?: unknown) {}
  },
  Sprite: class {},
  Texture: class {
    static from(): object {
      return {};
    }
  },
  VideoSource: class {
    resource: HTMLVideoElement;
    options: { preload?: boolean; preloadTimeoutMs?: number };
    _load: Promise<unknown> | null = null;
    isValid = false;
    _resolve: ((value: unknown) => void) | null = null;
    _reject: ((reason?: unknown) => void) | null = null;
    _preloadTimeout?: ReturnType<typeof setTimeout>;
    autoUpdate = false;
    alphaMode: string;
    _onPlayStart = vi.fn();
    _onPlayStop = vi.fn();
    _onSeeked = vi.fn();
    _onCanPlay = vi.fn();
    _onCanPlayThrough = vi.fn();
    _onError = vi.fn();
    _isSourceReady = vi.fn(() => false);
    _mediaReady = vi.fn();
    update = vi.fn();
    constructor(opts?: {
      resource?: HTMLVideoElement;
      preload?: boolean;
      preloadTimeoutMs?: number;
      alphaMode?: string;
    }) {
      this.resource = opts?.resource as HTMLVideoElement;
      this.options = {
        preload: opts?.preload,
        preloadTimeoutMs: opts?.preloadTimeoutMs,
      };
      this.alphaMode = opts?.alphaMode ?? 'premultiply-alpha-on-upload';
    }
  },
  CanvasSource: class {},
  BlurFilter: class {},
  Filter: class {},
}));

// Also mock effect-registry to avoid side effects from registerBuiltinEffects
vi.mock('@rough-cut/effect-registry', () => ({
  registerBuiltinEffects: vi.fn(),
  getDefaultParams: vi.fn(() => ({})),
}));

// Mock frame-resolver to return a minimal RenderFrame
vi.mock('@rough-cut/frame-resolver', () => ({
  resolveFrame: vi.fn(() => ({
    frame: 0,
    width: 1920,
    height: 1080,
    backgroundColor: '#000000',
    layers: [],
    transitions: [],
  })),
}));

import { PreviewCompositor } from './preview-compositor.js';
import type { ProjectDocument } from '@rough-cut/project-model';

function makeProject(overrides: Partial<ProjectDocument['settings']> = {}): ProjectDocument {
  return {
    version: 1,
    id: 'proj-1' as ProjectDocument['id'],
    name: 'Test Project',
    createdAt: '2025-01-01T00:00:00Z',
    modifiedAt: '2025-01-01T00:00:00Z',
    settings: {
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      backgroundColor: '#000000',
      sampleRate: 48000,
      ...overrides,
    },
    assets: [],
    composition: {
      duration: 300,
      tracks: [],
      transitions: [],
    },
    motionPresets: [],
    exportSettings: {
      format: 'mp4',
      codec: 'h264',
      bitrate: 8000000,
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
    },
  } as unknown as ProjectDocument;
}

describe('PreviewCompositor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is idle', () => {
    const compositor = new PreviewCompositor();
    expect(compositor.getState()).toBe('idle');
  });

  it('initial frame is 0', () => {
    const compositor = new PreviewCompositor();
    expect(compositor.getCurrentFrame()).toBe(0);
  });

  it('calls registerBuiltinEffects on construction', async () => {
    const { registerBuiltinEffects } = await import('@rough-cut/effect-registry');
    new PreviewCompositor();
    expect(registerBuiltinEffects).toHaveBeenCalled();
  });

  it('init() transitions state and returns a canvas', async () => {
    const onStateChange = vi.fn();
    const compositor = new PreviewCompositor({}, { onStateChange });
    const canvas = await compositor.init();
    // PixiJS mock returns an object with width/height
    expect(canvas).toBeDefined();
    // state callback fired
    expect(onStateChange).toHaveBeenCalledWith('idle');
  });

  it('getCanvas() returns null before init', () => {
    const compositor = new PreviewCompositor();
    expect(compositor.getCanvas()).toBeNull();
  });

  it('getCanvas() returns canvas after init', async () => {
    const compositor = new PreviewCompositor();
    await compositor.init();
    expect(compositor.getCanvas()).not.toBeNull();
  });

  it('seekTo updates the current frame', async () => {
    const compositor = new PreviewCompositor();
    await compositor.init();
    compositor.setProject(makeProject());

    compositor.seekTo(42);
    expect(compositor.getCurrentFrame()).toBe(42);
  });

  it('seekTo fires onFrameRendered callback', async () => {
    const onFrameRendered = vi.fn();
    const compositor = new PreviewCompositor({}, { onFrameRendered });
    await compositor.init();
    compositor.setProject(makeProject());

    compositor.seekTo(10);
    expect(onFrameRendered).toHaveBeenCalledWith(10);
  });

  it('dispose() sets state to disposed', async () => {
    const onStateChange = vi.fn();
    const compositor = new PreviewCompositor({}, { onStateChange });
    await compositor.init();

    compositor.dispose();
    expect(compositor.getState()).toBe('disposed');
    expect(onStateChange).toHaveBeenCalledWith('disposed');
  });

  it('dispose() makes getCanvas() return null', async () => {
    const compositor = new PreviewCompositor();
    await compositor.init();
    compositor.dispose();
    expect(compositor.getCanvas()).toBeNull();
  });

  it('setProject stores project and calls resolveFrame', async () => {
    const { resolveFrame } = await import('@rough-cut/frame-resolver');
    const compositor = new PreviewCompositor();
    await compositor.init();

    const project = makeProject();
    compositor.setProject(project);

    expect(resolveFrame).toHaveBeenCalledWith(project, 0, expect.any(Object));
  });

  it('accepts custom width and height config', () => {
    const compositor = new PreviewCompositor({ width: 1280, height: 720 });
    // The config is stored internally; we verify it doesn't throw
    expect(compositor.getState()).toBe('idle');
  });

  it('onFrameRendered not called when project is unset', async () => {
    const onFrameRendered = vi.fn();
    const compositor = new PreviewCompositor({}, { onFrameRendered });
    await compositor.init();
    // seekTo without setProject — no project, renderCurrentFrame should no-op
    compositor.seekTo(5);
    expect(onFrameRendered).not.toHaveBeenCalled();
  });

  it('resize does not throw', async () => {
    const compositor = new PreviewCompositor();
    await compositor.init();
    expect(() => compositor.resize(1280, 720)).not.toThrow();
  });

  it('patches VideoSource.load to avoid Pixi alpha probe path', async () => {
    const sourceLoad = vi.fn();
    const addEventListener = vi.fn();
    const videoEl = {
      readyState: 0,
      HAVE_ENOUGH_DATA: 4,
      HAVE_FUTURE_DATA: 3,
      width: 0,
      height: 0,
      addEventListener,
      load: sourceLoad,
    } as unknown as HTMLVideoElement;

    const { VideoSource } = await import('pixi.js');
    const videoSource = new VideoSource({
      resource: videoEl,
      alphaMode: 'premultiply-alpha-on-upload',
    }) as unknown as {
      load: () => Promise<unknown>;
      alphaMode: string;
      _load: Promise<unknown> | null;
    };

    void videoSource.load();
    void videoSource.load();

    expect(videoSource.alphaMode).toBe('premultiply-alpha-on-upload');
    expect(videoSource._load).toBeTruthy();
    expect(addEventListener).toHaveBeenCalledWith('play', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('pause', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('canplaythrough', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
    expect(sourceLoad).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(6);
  });
});
