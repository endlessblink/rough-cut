# CaptureBackend Interface — Spike-Validated Draft

> Updated 2026-03-26 based on Spike 2 Linux findings. macOS and Windows fields are TODOs.

## Interface

```typescript
/**
 * Shared, platform-agnostic config the Record tab cares about.
 * The UI constructs this; the backend maps to real device IDs.
 */
export interface CaptureConfig {
  projectId: string;              // for file paths
  frameRate: 30 | 60;
  resolution: { width: number; height: number };

  includeWebcam: boolean;
  includeMic: boolean;
  includeSystemAudio: boolean;

  // Logical IDs from the UI; backend maps to real device IDs
  screenSourceId?: string;        // from desktopCapturer.getSources()
  windowSourceId?: string;        // optional, for window capture
  webcamDeviceId?: string;        // from enumerateDevices()
  micDeviceId?: string;           // from enumerateDevices()

  // Optional crop region in capture coordinates (region recording via crop)
  region?: { x: number; y: number; width: number; height: number };
}

/**
 * Asset info returned after recording stops.
 * Maps directly to Asset entries in the project model.
 */
export interface CaptureAssetInfo {
  id: string;                     // Asset.id (UUID)
  type: 'screen' | 'webcam' | 'audio';
  filePath: string;
  durationFrames: number;
  resolution?: { width: number; height: number };
  audioSampleRate?: number;
  audioChannels?: number;
  codec?: string;
}

/**
 * Event callbacks from the capture session.
 */
export interface CaptureSessionEvents {
  onProgress?(secondsElapsed: number): void;
  onWarning?(message: string): void;             // device disconnect, etc.
  onError?(error: Error): void;
  onComplete?(assets: CaptureAssetInfo[]): void;  // assets to write into ProjectDocument
}

/**
 * Platform-agnostic capture backend.
 * One implementation per platform/mode.
 *
 * The Record tab and project model only talk to this interface.
 * Switching platforms means swapping which backend gets instantiated,
 * not changing higher layers.
 */
export interface CaptureBackend {
  /** Identifies the platform strategy */
  readonly platform: 'linux-x11' | 'linux-wayland' | 'macos' | 'windows';

  /** Feature detection — UI uses this to enable/disable toggles */
  getCapabilities(): Promise<CaptureCapabilities>;

  /** Start a recording session */
  start(config: CaptureConfig, events: CaptureSessionEvents): Promise<void>;

  /** Pause recording (no gap in resulting file) */
  pause(): Promise<void>;

  /** Resume after pause */
  resume(): Promise<void>;

  /** Stop and finalize all files; triggers onComplete */
  stop(): Promise<void>;

  /** Cleanup resources (streams, temp files) if session is abandoned */
  dispose(): Promise<void>;
}

export interface CaptureCapabilities {
  screenCapture: boolean;
  windowCapture: boolean;
  regionCapture: boolean;         // true = native, false = post-capture crop
  webcam: boolean;
  mic: boolean;
  systemAudio: boolean;
  maxFrameRate: 30 | 60;
}
```

## Platform Implementations

### Linux/X11 — Spike-Validated ✅

```typescript
class LinuxX11CaptureBackend implements CaptureBackend {
  platform = 'linux-x11' as const;

  async getCapabilities(): Promise<CaptureCapabilities> {
    return {
      screenCapture: true,          // desktopCapturer works programmatically
      windowCapture: true,          // desktopCapturer returns window sources
      regionCapture: false,         // post-capture crop only
      webcam: true,                 // V4L2 via getUserMedia
      mic: true,                    // PulseAudio/PipeWire via getUserMedia
      systemAudio: true,            // PipeWire monitor sources
      maxFrameRate: 60,             // needs verification at 60fps
    };
  }

  // Uses desktopCapturer.getSources() + programmatic sourceId
  // System audio via PipeWire/PulseAudio monitor source deviceId
  // MediaRecorder writes WebM chunks to disk
  // FFmpeg probe on stop for accurate metadata
}
```

### Linux/Wayland — Known Limitations

```typescript
class LinuxWaylandCaptureBackend implements CaptureBackend {
  platform = 'linux-wayland' as const;

  async getCapabilities(): Promise<CaptureCapabilities> {
    return {
      screenCapture: true,          // via portal picker (OS dialog)
      windowCapture: true,          // via portal picker (OS dialog)
      regionCapture: false,         // post-capture crop only
      webcam: true,
      mic: true,
      systemAudio: true,            // PipeWire monitor sources
      maxFrameRate: 60,
    };
  }

  // Ignores screenSourceId/windowSourceId — portal picker handles selection
  // User sees OS-level dialog every time they start capture
  // Same CaptureAssetInfo[] output as X11
}
```

### macOS — TODO (pending spike)

```typescript
class MacOSCaptureBackend implements CaptureBackend {
  platform = 'macos' as const;

  async getCapabilities(): Promise<CaptureCapabilities> {
    return {
      screenCapture: true,          // desktopCapturer, requires TCC permission
      windowCapture: true,          // desktopCapturer
      regionCapture: false,         // post-capture crop
      webcam: true,                 // AVFoundation via getUserMedia
      mic: true,                    // CoreAudio via getUserMedia
      systemAudio: false,           // NOT available via desktopCapturer
                                    // Requires BlackHole or ScreenCaptureKit
      maxFrameRate: 60,             // TODO: verify
    };
  }

  // TODO: TCC permission detection and request flow
  // TODO: System audio workaround (BlackHole virtual device or ScreenCaptureKit API)
  // TODO: Retina display handling (2x capture resolution)
}
```

### Windows — TODO (pending spike)

```typescript
class WindowsCaptureBackend implements CaptureBackend {
  platform = 'windows' as const;

  async getCapabilities(): Promise<CaptureCapabilities> {
    return {
      screenCapture: true,          // DXGI via desktopCapturer
      windowCapture: true,          // DXGI (issues with some HW-accelerated windows)
      regionCapture: false,         // post-capture crop
      webcam: true,                 // DirectShow/MediaFoundation via getUserMedia
      mic: true,                    // WASAPI via getUserMedia
      systemAudio: true,            // WASAPI loopback via desktopCapturer audio: true
      maxFrameRate: 60,             // TODO: verify
    };
  }

  // TODO: Verify WASAPI loopback works with desktopCapturer
  // TODO: Test with HW-accelerated windows (browsers, games)
  // TODO: Multi-monitor with different DPI scaling
}
```

## Backend Selection

```typescript
function createCaptureBackend(): CaptureBackend {
  if (process.platform === 'linux') {
    const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';
    return isWayland
      ? new LinuxWaylandCaptureBackend()
      : new LinuxX11CaptureBackend();
  }
  if (process.platform === 'darwin') {
    return new MacOSCaptureBackend();
  }
  if (process.platform === 'win32') {
    return new WindowsCaptureBackend();
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
```

## Key Design Decisions

1. **Recording produces assets + metadata, not clips.** `onComplete` returns `CaptureAssetInfo[]` — the caller (store action) creates `Asset` entries and optionally auto-places `Clip` entries on the timeline.

2. **Separate streams, separate files.** Screen, webcam, and audio are independent assets. Each gets its own file and `CaptureAssetInfo` entry.

3. **Region capture is always post-capture crop.** No platform supports native region capture via `desktopCapturer`. We capture the full screen and crop during preview/export.

4. **Platform detection is backend selection, not feature flags.** The UI queries `getCapabilities()` to show/hide controls. The backend handles all platform-specific logic internally.
