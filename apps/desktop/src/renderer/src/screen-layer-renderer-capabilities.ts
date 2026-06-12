export type PreviewRendererTier =
  | 'webgpu-external-texture'
  | 'webgl2-videoframe'
  | 'webgl'
  | 'canvas2d';

export type WebGpuCapabilityProbe = {
  supported?: boolean;
  reason?: string | null;
  steps?: {
    navigatorGpu?: { ok?: boolean };
    requestAdapter?: { ok?: boolean };
    requestDevice?: { ok?: boolean };
    importExternalTextureVideo?: { ok?: boolean };
    importExternalTextureVideoFrame?: { ok?: boolean };
  };
  device?: {
    importExternalTexture?: string;
  } | null;
};

export type PreviewRendererCapabilityInput = {
  webgpu?: WebGpuCapabilityProbe | null;
  webgl2?: boolean;
  webgl?: boolean;
};

export const PREVIEW_RENDERER_LADDER: readonly PreviewRendererTier[] = [
  'webgpu-external-texture',
  'webgl2-videoframe',
  'webgl',
  'canvas2d',
];

export function selectPreviewRendererTier(input: PreviewRendererCapabilityInput): PreviewRendererTier {
  if (webGpuExternalTextureReady(input.webgpu)) return 'webgpu-external-texture';
  if (input.webgl2) return 'webgl2-videoframe';
  if (input.webgl) return 'webgl';
  return 'canvas2d';
}

export function webGpuExternalTextureReady(probe: WebGpuCapabilityProbe | null | undefined): boolean {
  if (!probe?.supported) return false;
  if (probe.device?.importExternalTexture !== 'function') return false;
  const steps = probe.steps ?? {};
  return Boolean(
    steps.navigatorGpu?.ok &&
    steps.requestAdapter?.ok &&
    steps.requestDevice?.ok &&
    (steps.importExternalTextureVideo?.ok || steps.importExternalTextureVideoFrame?.ok),
  );
}
