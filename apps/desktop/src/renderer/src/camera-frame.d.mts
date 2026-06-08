import type { CameraAspectRatio, CameraPosition, CameraShape, CropAspectRatio, NormalizedRect, ProjectAspectRatio } from '@rough-cut/project-model';

export function resizeFrameToAspect(frame: NormalizedRect, frameAspect: CameraAspectRatio, canvasAspectRatio: ProjectAspectRatio): NormalizedRect;
export function shouldCropAspectResizeFrame(input: { nextAspect: CropAspectRatio; cameraShape: CameraShape; frameAspect: 'free' | CameraAspectRatio }): boolean;
export function moveFrameToCameraPosition(frame: NormalizedRect, position: CameraPosition, canvasAspectRatio: ProjectAspectRatio): NormalizedRect;
export function resizeFrameToCameraSize(frame: NormalizedRect, previousSize: number, nextSize: number): NormalizedRect;
export function aspectRatioDims(aspectRatio: string): [number, number];
