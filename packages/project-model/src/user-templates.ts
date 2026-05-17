import { z } from 'zod';
import {
  NormalizedRectSchema,
  ProjectAspectRatioSchema,
  RecordingBackgroundStyleSchema,
} from './schemas.js';
import type {
  CameraPresentation,
  NormalizedRect,
  ProjectAspectRatio,
  RecordingBackgroundStyle,
  RecordingPresentation,
} from './types.js';

export interface UserTemplateCameraPatch {
  readonly position: CameraPresentation['position'];
  readonly shape: CameraPresentation['shape'];
  readonly aspectRatio: CameraPresentation['aspectRatio'];
  readonly size: number;
  readonly roundness: number;
  readonly visible: boolean;
}

export interface UserRecordingTemplate {
  readonly id: string;
  readonly label: string;
  readonly aspectRatio: ProjectAspectRatio;
  readonly background: RecordingBackgroundStyle;
  readonly camera: UserTemplateCameraPatch;
  readonly screenFrame: NormalizedRect | null;
  readonly cameraFrame: NormalizedRect | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const CameraPositionSchema = z.enum(['corner-br', 'corner-bl', 'corner-tr', 'corner-tl', 'center']);
const CameraShapeSchema = z.enum(['circle', 'rounded', 'square']);
const CameraAspectRatioSchema = z.enum(['16:9', '1:1', '9:16', '4:3']);

const UserTemplateCameraPatchSchema = z.object({
  position: CameraPositionSchema,
  shape: CameraShapeSchema,
  aspectRatio: CameraAspectRatioSchema,
  size: z.number().int().positive(),
  roundness: z.number().int().min(0).max(50),
  visible: z.boolean(),
});

export const UserRecordingTemplateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  aspectRatio: ProjectAspectRatioSchema,
  background: RecordingBackgroundStyleSchema,
  camera: UserTemplateCameraPatchSchema,
  screenFrame: NormalizedRectSchema.nullable(),
  cameraFrame: NormalizedRectSchema.nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const UserRecordingTemplatesFileSchema = z.object({
  version: z.literal(1),
  templates: z.array(UserRecordingTemplateSchema),
});

export type UserRecordingTemplatesFile = z.infer<typeof UserRecordingTemplatesFileSchema>;

export interface CaptureUserTemplateInput {
  readonly id: string;
  readonly label: string;
  readonly aspectRatio: ProjectAspectRatio;
  readonly background: RecordingBackgroundStyle;
  readonly camera: CameraPresentation;
  readonly presentation?: Pick<RecordingPresentation, 'screenFrame' | 'cameraFrame'>;
  readonly now: number;
}

export function captureUserTemplate(input: CaptureUserTemplateInput): UserRecordingTemplate {
  return {
    id: input.id,
    label: input.label.trim(),
    aspectRatio: input.aspectRatio,
    background: input.background,
    camera: {
      position: input.camera.position,
      shape: input.camera.shape,
      aspectRatio: input.camera.aspectRatio,
      size: input.camera.size,
      roundness: input.camera.roundness,
      visible: input.camera.visible,
    },
    screenFrame: input.presentation?.screenFrame ?? null,
    cameraFrame: input.presentation?.cameraFrame ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface AppliedUserTemplate {
  readonly aspectRatio: ProjectAspectRatio;
  readonly background: RecordingBackgroundStyle;
  readonly camera: UserTemplateCameraPatch;
  readonly screenFrame: NormalizedRect | null;
  readonly cameraFrame: NormalizedRect | null;
}

export function applyUserTemplate(template: UserRecordingTemplate): AppliedUserTemplate {
  return {
    aspectRatio: template.aspectRatio,
    background: template.background,
    camera: template.camera,
    screenFrame: template.screenFrame,
    cameraFrame: template.cameraFrame,
  };
}

export function findUserTemplateById(
  templates: readonly UserRecordingTemplate[],
  id: string,
): UserRecordingTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function renameUserTemplate(
  template: UserRecordingTemplate,
  label: string,
  now: number,
): UserRecordingTemplate {
  return { ...template, label: label.trim(), updatedAt: now };
}
