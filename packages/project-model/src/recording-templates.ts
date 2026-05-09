import { applyRecordingBackgroundPreset, getRecordingBackgroundPreset } from './background-presets.js';
import type {
  CameraAspectRatio,
  CameraPosition,
  CameraPresentation,
  CameraShape,
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
  readonly aspectRatio: ProjectAspectRatio;
  readonly backgroundPresetId: string;
  readonly camera: RecordingTemplateCameraPatch;
}

export const RECORDING_TEMPLATE_PRESETS: readonly RecordingTemplatePreset[] = [
  {
    id: 'tutorial-16-9',
    label: 'Tutorial 16:9',
    description: 'Wide canvas, graphite background, small circular PiP in the bottom right.',
    aspectRatio: '16:9',
    backgroundPresetId: 'graphite-contours',
    camera: { position: 'corner-br', shape: 'circle', aspectRatio: '1:1', size: 110, roundness: 50, visible: true },
  },
  {
    id: 'mobile-9-16',
    label: 'Mobile 9:16',
    description: 'Vertical canvas, violet dusk background, larger rounded PiP for short-form clips.',
    aspectRatio: '9:16',
    backgroundPresetId: 'violet-dusk',
    camera: { position: 'corner-bl', shape: 'rounded', aspectRatio: '1:1', size: 150, roundness: 40, visible: true },
  },
  {
    id: 'square-1-1',
    label: 'Square 1:1',
    description: 'Square canvas, soft blur background, compact circular PiP in the top right.',
    aspectRatio: '1:1',
    backgroundPresetId: 'soft-blur',
    camera: { position: 'corner-tr', shape: 'circle', aspectRatio: '1:1', size: 100, roundness: 50, visible: true },
  },
];

export function getRecordingTemplatePreset(presetId: string): RecordingTemplatePreset | undefined {
  return RECORDING_TEMPLATE_PRESETS.find((preset) => preset.id === presetId);
}

export interface AppliedRecordingTemplate {
  readonly aspectRatio: ProjectAspectRatio;
  readonly background: RecordingBackgroundStyle;
  readonly camera: Partial<CameraPresentation>;
}

export function applyRecordingTemplatePreset(
  current: Partial<RecordingBackgroundStyle> | undefined,
  presetId: string,
): AppliedRecordingTemplate | undefined {
  const template = getRecordingTemplatePreset(presetId);
  if (!template) return undefined;
  if (!getRecordingBackgroundPreset(template.backgroundPresetId)) return undefined;
  return {
    aspectRatio: template.aspectRatio,
    background: applyRecordingBackgroundPreset(current, template.backgroundPresetId),
    camera: { ...template.camera },
  };
}

export function findRecordingTemplatePresetId(
  aspectRatio: ProjectAspectRatio | undefined,
  background: Partial<RecordingBackgroundStyle> | undefined,
): string | undefined {
  if (!aspectRatio) return undefined;
  return RECORDING_TEMPLATE_PRESETS.find((template) => {
    if (template.aspectRatio !== aspectRatio) return false;
    const expected = getRecordingBackgroundPreset(template.backgroundPresetId);
    if (!expected) return false;
    if (background?.bgImage) return background.bgImage === expected.style.bgImage;
    return background?.bgColor === expected.style.bgColor && background?.bgGradient === expected.style.bgGradient;
  })?.id;
}
