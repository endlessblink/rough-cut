import { getRecordingBackgroundPreset } from './background-presets.js';
import type {
  CameraAspectRatio,
  CameraPosition,
  CameraPresentation,
  CameraShape,
  CropAspectRatio,
  NormalizedRect,
  ProjectAspectRatio,
  RecordingBackgroundStyle,
} from './types.js';

export interface RecordingTemplateCameraPatch {
  readonly position: CameraPosition;
  readonly shape: CameraShape;
  readonly aspectRatio: CameraAspectRatio;
  readonly size: number;
  readonly roundness: number;
  readonly visible: boolean;
}

export interface RecordingTemplatePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly layoutLabel: string;
  readonly aspectRatio: ProjectAspectRatio;
  readonly backgroundPresetId: string;
  readonly camera: RecordingTemplateCameraPatch;
  readonly screenFrame: NormalizedRect;
  readonly cameraFrame: NormalizedRect;
  /** Crop the screen recording to this shape so it fills a full-bleed frame. */
  readonly screenCropAspect?: CropAspectRatio;
  /** Background fields the layout depends on (e.g. no padding for full-bleed). */
  readonly backgroundOverrides?: Partial<RecordingBackgroundStyle>;
}

export const RECORDING_TEMPLATE_PRESETS: readonly RecordingTemplatePreset[] = [
  {
    id: 'tutorial-16-9',
    label: 'Side-by-side · 16:9',
    description: '16:9 side-by-side layout with your vertical camera panel beside the horizontal screen recording.',
    layoutLabel: 'Vertical camera + horizontal screen',
    aspectRatio: '16:9',
    backgroundPresetId: 'graphite-contours',
    camera: { position: 'center', shape: 'rounded', aspectRatio: '9:16', size: 100, roundness: 32, visible: true },
    cameraFrame: { x: 0.105, y: 0.17, w: 0.245, h: 0.66 },
    screenFrame: { x: 0.385, y: 0.30, w: 0.53, h: 0.40 },
  },
  {
    id: 'youtube-16-9',
    label: 'Screen + camera bubble · 16:9',
    description: 'FocuSee-style YouTube layout with wide screen recording and circular camera bubble over the lower-left.',
    layoutLabel: 'Screen + bubble',
    aspectRatio: '16:9',
    backgroundPresetId: 'aqua-haze',
    camera: { position: 'corner-bl', shape: 'circle', aspectRatio: '1:1', size: 112, roundness: 100, visible: true },
    screenFrame: { x: 0.09, y: 0.09, w: 0.82, h: 0.82 },
    cameraFrame: { x: 0.105, y: 0.53, w: 0.205, h: 0.365 },
  },
  {
    id: 'mobile-9-16',
    label: 'Portrait stack · 9:16',
    description: 'FocuSee-style portrait stack with screen and camera arranged as separate layout panels.',
    layoutLabel: 'Portrait stack',
    aspectRatio: '9:16',
    backgroundPresetId: 'violet-dusk',
    camera: { position: 'center', shape: 'rounded', aspectRatio: '16:9', size: 96, roundness: 42, visible: true },
    screenFrame: { x: 0.08, y: 0.075, w: 0.84, h: 0.53 },
    cameraFrame: { x: 0.08, y: 0.68, w: 0.84, h: 0.266 },
  },
  {
    id: 'story-9-16',
    label: 'Story · 9:16',
    description: 'Full-screen vertical story: a 9:16 slice of the screen fills the whole frame, with a camera bubble in the lower third.',
    layoutLabel: 'Full-screen story',
    aspectRatio: '9:16',
    backgroundPresetId: 'black-sand',
    backgroundOverrides: { bgPadding: 0, bgCornerRadius: 0, bgShadowEnabled: false },
    camera: { position: 'center', shape: 'circle', aspectRatio: '1:1', size: 100, roundness: 100, visible: true },
    screenFrame: { x: 0, y: 0, w: 1, h: 1 },
    // Circle on a 9:16 canvas: height = width * 9/16.
    cameraFrame: { x: 0.32, y: 0.74, w: 0.36, h: 0.2025 },
    screenCropAspect: '9:16',
  },
  {
    id: 'square-1-1',
    label: 'Square + camera bubble · 1:1',
    description: 'Recordly-style dynamic webcam bubble over a square demo canvas.',
    layoutLabel: 'Smart bubble',
    aspectRatio: '1:1',
    backgroundPresetId: 'soft-blur',
    camera: { position: 'corner-br', shape: 'rounded', aspectRatio: '1:1', size: 78, roundness: 100, visible: true },
    screenFrame: { x: 0.075, y: 0.075, w: 0.85, h: 0.85 },
    cameraFrame: { x: 0.675, y: 0.675, w: 0.2, h: 0.2 },
  },
  {
    id: 'reel-4-5',
    label: 'Screen dominant · 4:5',
    description: 'Tella-style screen-dominant feed layout with the camera kept below the content.',
    layoutLabel: 'Screen dominant',
    aspectRatio: '4:5',
    backgroundPresetId: 'pink-folds',
    camera: { position: 'center', shape: 'rounded', aspectRatio: '16:9', size: 92, roundness: 42, visible: true },
    screenFrame: { x: 0.07, y: 0.07, w: 0.86, h: 0.58 },
    cameraFrame: { x: 0.14, y: 0.705, w: 0.72, h: 0.288 },
  },
  {
    id: 'portrait-3-4',
    label: 'Vertical split · 3:4',
    description: 'FocuSee-style vertical layout with separated screen and camera regions.',
    layoutLabel: 'Vertical split',
    aspectRatio: '3:4',
    backgroundPresetId: 'mint-depth',
    camera: { position: 'center', shape: 'rounded', aspectRatio: '16:9', size: 94, roundness: 42, visible: true },
    screenFrame: { x: 0.075, y: 0.075, w: 0.85, h: 0.565 },
    cameraFrame: { x: 0.12, y: 0.695, w: 0.76, h: 0.321 },
  },
  {
    id: 'classic-4-3',
    label: 'Half split · 4:3',
    description: 'Tella-style 50/50 split for demos where the presenter should not cover screen content.',
    layoutLabel: '50/50 split',
    aspectRatio: '4:3',
    backgroundPresetId: 'aqua-haze',
    camera: { position: 'center', shape: 'rounded', aspectRatio: '16:9', size: 100, roundness: 32, visible: true },
    screenFrame: { x: 0.055, y: 0.11, w: 0.43, h: 0.78 },
    cameraFrame: { x: 0.515, y: 0.11, w: 0.43, h: 0.322 },
  },
  {
    id: 'native-auto',
    label: 'Native canvas · Auto',
    description: 'Screen Studio-style native canvas with screen focus and a compact camera bubble.',
    layoutLabel: 'Native bubble',
    aspectRatio: 'auto',
    backgroundPresetId: 'black-sand',
    camera: { position: 'corner-br', shape: 'rounded', aspectRatio: '1:1', size: 76, roundness: 100, visible: true },
    screenFrame: { x: 0.065, y: 0.085, w: 0.87, h: 0.83 },
    cameraFrame: { x: 0.75, y: 0.645, w: 0.145, h: 0.258 },
  },
];

export function getRecordingTemplatePreset(presetId: string): RecordingTemplatePreset | undefined {
  return RECORDING_TEMPLATE_PRESETS.find((preset) => preset.id === presetId);
}

export interface AppliedRecordingTemplate {
  readonly aspectRatio: ProjectAspectRatio;
  readonly background: RecordingBackgroundStyle;
  readonly camera: Partial<CameraPresentation>;
  readonly screenFrame: NormalizedRect;
  readonly cameraFrame: NormalizedRect;
  readonly screenCropAspect?: CropAspectRatio;
}

export function applyRecordingTemplatePreset(
  _current: Partial<RecordingBackgroundStyle> | undefined,
  presetId: string,
): AppliedRecordingTemplate | undefined {
  const template = getRecordingTemplatePreset(presetId);
  if (!template) return undefined;
  const backgroundPreset = getRecordingBackgroundPreset(template.backgroundPresetId);
  if (!backgroundPreset) return undefined;
  return {
    aspectRatio: template.aspectRatio,
    background: { ...backgroundPreset.style, ...(template.backgroundOverrides ?? {}) },
    camera: { ...template.camera },
    screenFrame: { ...template.screenFrame },
    cameraFrame: { ...template.cameraFrame },
    ...(template.screenCropAspect ? { screenCropAspect: template.screenCropAspect } : {}),
  };
}

/**
 * Returns the built-in template id whose aspect ratio matches `aspectRatio`.
 * Background is ignored (it's user-owned), so the tile stays highlighted
 * even after the user picks a different background preset on top.
 */
export function findRecordingTemplatePresetId(
  aspectRatio: ProjectAspectRatio | undefined,
  _background?: Partial<RecordingBackgroundStyle>,
): string | undefined {
  if (!aspectRatio) return undefined;
  return RECORDING_TEMPLATE_PRESETS.find((template) => template.aspectRatio === aspectRatio)?.id;
}
