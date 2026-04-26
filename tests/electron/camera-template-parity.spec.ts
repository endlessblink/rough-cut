import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';
let recordedProjectPath = SOURCE_PROJECT_PATH;

const RECORD_CAMERA_VIDEO = '[data-testid="camera-playback-video"]';
const EDIT_CAMERA_VIDEO = '[data-testid="edit-camera-playback-video"]';
const RECORD_CAMERA_FRAME = '[data-testid="record-camera-frame"]';
const PREVIEW_CONTENT = '[data-testid="record-card-content"]';
const RECORD_ROOT = '[data-testid="record-tab-root"]';
const EDIT_ROOT = '[data-testid="edit-tab-root"]';
const EXPORT_ROOT = '[data-testid="export-tab-root"]';
const DEFAULT_PERSISTED_CAMERA_FRAME = { x: 0.02, y: 0.1, w: 0.34, h: 0.8 };

test.beforeEach(() => {
  recordedProjectPath = join(
    dirname(SOURCE_PROJECT_PATH),
    `rough-cut-camera-template-parity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.roughcut`,
  );
  copyFileSync(SOURCE_PROJECT_PATH, recordedProjectPath);
});

test.afterEach(() => {
  if (!recordedProjectPath || recordedProjectPath === SOURCE_PROJECT_PATH) return;
  if (!existsSync(recordedProjectPath)) return;
  try {
    unlinkSync(recordedProjectPath);
  } catch {
    // Best-effort cleanup only; failed deletion should not mask test results.
  }
});

test('persisted camera template/frame render the same in Record and Edit', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await applyRecordingPresentationPatch(appPage, {
    nextProject: project,
    projectPath: recordedProjectPath,
    activeAssetId: recording?.id ?? null,
    persistedFrame: DEFAULT_PERSISTED_CAMERA_FRAME,
    cameraVisible: true,
  });

  await appPage.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, RECORD_CAMERA_VIDEO);
  await appPage.waitForTimeout(400);

  const recordRect = await appPage.evaluate(
    ({ rootSelector, frameSelector, previewSelector }) => {
      const root = document.querySelector(rootSelector) as HTMLElement | null;
      const frame = root?.querySelector(frameSelector) as HTMLElement | null;
      const preview = root?.querySelector(previewSelector) as HTMLElement | null;
      const frameRect = frame?.getBoundingClientRect();
      const previewRect = preview?.getBoundingClientRect();
      if (!frameRect || !previewRect) return null;
      return {
        x: (frameRect.x - previewRect.x) / previewRect.width,
        y: (frameRect.y - previewRect.y) / previewRect.height,
        w: frameRect.width / previewRect.width,
        h: frameRect.height / previewRect.height,
        pixelWidth: frameRect.width,
        pixelHeight: frameRect.height,
      };
    },
    {
      rootSelector: RECORD_ROOT,
      frameSelector: RECORD_CAMERA_FRAME,
      previewSelector: PREVIEW_CONTENT,
    },
  );
  expect(recordRect).not.toBeNull();
  if (!recordRect) return;

  expect(recordRect.pixelWidth).toBeGreaterThanOrEqual(120);
  expect(recordRect.pixelHeight).toBeGreaterThanOrEqual(120);

  await navigateToTab(appPage, 'edit');
  await appPage.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, EDIT_CAMERA_VIDEO);

  const editRect = await appPage.evaluate(
    ({ rootSelector, videoSelector, previewSelector }) => {
      const root = document.querySelector(rootSelector) as HTMLElement | null;
      const video = root?.querySelector(videoSelector) as HTMLElement | null;
      const preview = root?.querySelector(previewSelector) as HTMLElement | null;
      const videoRect = video?.getBoundingClientRect();
      const previewRect = preview?.getBoundingClientRect();
      if (!videoRect || !previewRect) return null;
      return {
        x: (videoRect.x - previewRect.x) / previewRect.width,
        y: (videoRect.y - previewRect.y) / previewRect.height,
        w: videoRect.width / previewRect.width,
        h: videoRect.height / previewRect.height,
      };
    },
    {
      rootSelector: EDIT_ROOT,
      videoSelector: EDIT_CAMERA_VIDEO,
      previewSelector: PREVIEW_CONTENT,
    },
  );
  expect(editRect).not.toBeNull();
  if (!editRect) return;

  const diffs = {
    x: Math.abs(editRect.x - recordRect.x),
    y: Math.abs(editRect.y - recordRect.y),
    w: Math.abs(editRect.w - recordRect.w),
    h: Math.abs(editRect.h - recordRect.h),
  };

  expect(diffs.x).toBeLessThanOrEqual(0.01);
  expect(diffs.y).toBeLessThanOrEqual(0.01);
  expect(diffs.w).toBeLessThanOrEqual(0.01);
  expect(diffs.h).toBeLessThanOrEqual(0.01);
});

test('saved project preserves camera template/frame parity after reopen', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  const savedPath = `/tmp/rough-cut-camera-parity-${Date.now()}.roughcut`;

  await applyRecordingPresentationPatch(appPage, {
    nextProject: project,
    projectPath: savedPath,
    activeAssetId: recording?.id ?? null,
    persistedFrame: DEFAULT_PERSISTED_CAMERA_FRAME,
    cameraVisible: true,
  });

  const saved = await appPage.evaluate(async (filePath) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const projectState = stores?.project.getState();
    if (!projectState?.project) return false;
    return (
      window as unknown as {
        roughcut: { projectSave: (project: unknown, path: string) => Promise<boolean> };
      }
    ).roughcut.projectSave(projectState.project, filePath);
  }, savedPath);

  expect(saved).toBe(true);

  const reopenedProject = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    savedPath,
  )) as Record<string, any>;

  const reopenedRecording = reopenedProject.assets.find((asset: any) => asset.type === 'recording');
  expect(reopenedRecording?.presentation?.templateId).toBe('presentation-16x9');
  expect(reopenedRecording?.presentation?.cameraFrame).toEqual(DEFAULT_PERSISTED_CAMERA_FRAME);

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: reopenedProject,
      projectPath: savedPath,
      activeAssetId: reopenedRecording?.id ?? null,
    },
  );

  const recordRect = await captureNormalizedRect(appPage, {
    rootSelector: RECORD_ROOT,
    mediaSelector: RECORD_CAMERA_FRAME,
    previewSelector: PREVIEW_CONTENT,
    settleSelector: RECORD_CAMERA_VIDEO,
    waitForReadyAttribute: true,
  });

  await navigateToTab(appPage, 'edit');

  const editRect = await captureNormalizedRect(appPage, {
    rootSelector: EDIT_ROOT,
    mediaSelector: EDIT_CAMERA_VIDEO,
    previewSelector: PREVIEW_CONTENT,
    settleSelector: EDIT_CAMERA_VIDEO,
  });

  const diffs = {
    x: Math.abs(editRect.x - recordRect.x),
    y: Math.abs(editRect.y - recordRect.y),
    w: Math.abs(editRect.w - recordRect.w),
    h: Math.abs(editRect.h - recordRect.h),
  };

  expect(diffs.x).toBeLessThanOrEqual(0.01);
  expect(diffs.y).toBeLessThanOrEqual(0.01);
  expect(diffs.w).toBeLessThanOrEqual(0.01);
  expect(diffs.h).toBeLessThanOrEqual(0.01);
});

test('persisted camera template/frame render the same in Record and Export', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await applyRecordingPresentationPatch(appPage, {
    nextProject: project,
    projectPath: recordedProjectPath,
    activeAssetId: recording?.id ?? null,
    persistedFrame: DEFAULT_PERSISTED_CAMERA_FRAME,
    cameraVisible: true,
  });

  const recordRect = await captureNormalizedRect(appPage, {
    rootSelector: RECORD_ROOT,
    mediaSelector: RECORD_CAMERA_FRAME,
    previewSelector: PREVIEW_CONTENT,
    settleSelector: RECORD_CAMERA_VIDEO,
  });

  await navigateToTab(appPage, 'export');

  const exportRect = await captureNormalizedRect(appPage, {
    rootSelector: EXPORT_ROOT,
    mediaSelector: RECORD_CAMERA_FRAME,
    previewSelector: PREVIEW_CONTENT,
    settleSelector: RECORD_CAMERA_FRAME,
    waitForReadyAttribute: false,
  });

  const diffs = {
    x: Math.abs(exportRect.x - recordRect.x),
    y: Math.abs(exportRect.y - recordRect.y),
    w: Math.abs(exportRect.w - recordRect.w),
    h: Math.abs(exportRect.h - recordRect.h),
  };

  expect(diffs.x).toBeLessThanOrEqual(0.02);
  expect(diffs.y).toBeLessThanOrEqual(0.02);
  expect(diffs.w).toBeLessThanOrEqual(0.02);
  expect(diffs.h).toBeLessThanOrEqual(0.02);
});

test('dragging the Record camera frame persists after save and reopen', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await applyRecordingPresentationPatch(appPage, {
    nextProject: project,
    projectPath: recordedProjectPath,
    activeAssetId: recording?.id ?? null,
    persistedFrame: DEFAULT_PERSISTED_CAMERA_FRAME,
    cameraVisible: true,
  });

  await appPage.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, RECORD_CAMERA_VIDEO);
  await appPage.waitForTimeout(400);

  const before = await readTemplateCameraFrame(appPage);
  const box = await appPage.locator(RECORD_CAMERA_FRAME).boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await appPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await appPage.mouse.down();
  await appPage.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 45, { steps: 12 });
  await appPage.mouse.up();

  await expect
    .poll(async () => {
      const frame = await readTemplateCameraFrame(appPage);
      return Math.abs(frame.x - before.x) + Math.abs(frame.y - before.y);
    })
    .toBeGreaterThan(0.05);

  const afterDrag = await readTemplateCameraFrame(appPage);
  const savedPath = `/tmp/rough-cut-camera-frame-authoring-${Date.now()}.roughcut`;

  const saved = await appPage.evaluate(async (filePath) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const projectState = stores?.project.getState();
    if (!projectState?.project) return false;
    return (
      window as unknown as {
        roughcut: { projectSave: (project: unknown, path: string) => Promise<boolean> };
      }
    ).roughcut.projectSave(projectState.project, filePath);
  }, savedPath);

  expect(saved).toBe(true);

  const reopenedProject = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    savedPath,
  )) as Record<string, any>;

  const reopenedRecording = reopenedProject.assets.find((asset: any) => asset.type === 'recording');
  expect(reopenedRecording?.presentation?.templateId).toBe('presentation-16x9');
  expect(reopenedRecording?.presentation?.cameraFrame?.x).toBeCloseTo(afterDrag.x, 2);
  expect(reopenedRecording?.presentation?.cameraFrame?.y).toBeCloseTo(afterDrag.y, 2);
  expect(reopenedRecording?.presentation?.cameraFrame?.w).toBeCloseTo(afterDrag.w, 2);
  expect(reopenedRecording?.presentation?.cameraFrame?.h).toBeCloseTo(afterDrag.h, 2);

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: reopenedProject,
      projectPath: savedPath,
      activeAssetId: reopenedRecording?.id ?? null,
    },
  );

  await expect
    .poll(async () => {
      const frame = await readTemplateCameraFrame(appPage);
      return {
        x: Number(frame.x.toFixed(2)),
        y: Number(frame.y.toFixed(2)),
        w: Number(frame.w.toFixed(2)),
        h: Number(frame.h.toFixed(2)),
      };
    })
    .toEqual({
      x: Number(afterDrag.x.toFixed(2)),
      y: Number(afterDrag.y.toFixed(2)),
      w: Number(afterDrag.w.toFixed(2)),
      h: Number(afterDrag.h.toFixed(2)),
    });
});

test('camera visibility toggle hides camera video in both Record and Edit', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const patchedProject = {
        ...nextProject,
        assets: nextProject.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  templateId: 'presentation-16x9',
                  camera: {
                    ...(asset.presentation?.camera ?? {}),
                    visible: false,
                  },
                },
              }
            : asset,
        ),
      };

      stores?.project.getState().setProject(patchedProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: recordedProjectPath,
      activeAssetId: recording?.id ?? null,
    },
  );

  await appPage.waitForTimeout(400);
  await expect(appPage.locator(`${RECORD_ROOT} ${RECORD_CAMERA_VIDEO}`)).toHaveCount(0);

  await navigateToTab(appPage, 'edit');
  await appPage.waitForTimeout(400);
  await expect(appPage.locator(`${EDIT_ROOT} ${EDIT_CAMERA_VIDEO}`)).toHaveCount(0);
});

// BUG-005: Camera PiP renders as circle (not ellipse) when shape === 'circle'
test('circle-shape camera PiP frame is square (width === height)', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  // Patch with a non-square cameraFrame and shape === 'circle' — the renderer must square it
  const nonSquareFrame = { x: 0.05, y: 0.1, w: 0.25, h: 0.6 };

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId, persistedFrame }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const patchedProject = {
        ...nextProject,
        assets: nextProject.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  templateId: 'presentation-16x9',
                  cameraFrame: persistedFrame,
                  camera: {
                    ...(asset.presentation?.camera ?? {}),
                    visible: true,
                    shape: 'circle',
                  },
                },
              }
            : asset,
        ),
      };

      stores?.project.getState().setProject(patchedProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: recordedProjectPath,
      activeAssetId: recording?.id ?? null,
      persistedFrame: nonSquareFrame,
    },
  );

  await appPage.waitForTimeout(300);

  // The camera frame must be square: width === height (within 2px tolerance)
  const cameraFrameBox = await appPage.locator(RECORD_CAMERA_FRAME).boundingBox();
  expect(cameraFrameBox).not.toBeNull();
  if (!cameraFrameBox) return;

  const widthHeightDiff = Math.abs(cameraFrameBox.width - cameraFrameBox.height);
  expect(widthHeightDiff).toBeLessThanOrEqual(2);

  // Also verify the data-camera-shape attribute is set
  const shape = await appPage.locator('[data-testid="template-preview-root"]').getAttribute('data-camera-shape');
  expect(shape).toBe('circle');
});

async function applyRecordingPresentationPatch(
  page: import('@playwright/test').Page,
  params: {
    nextProject: Record<string, any>;
    projectPath: string;
    activeAssetId: string | null;
    persistedFrame: { x: number; y: number; w: number; h: number };
    cameraVisible: boolean;
  },
) {
  await page.evaluate(
    ({ nextProject, projectPath, activeAssetId, persistedFrame, cameraVisible }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const patchedProject = {
        ...nextProject,
        assets: nextProject.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  templateId: 'presentation-16x9',
                  cameraFrame: persistedFrame,
                  camera: {
                    ...(asset.presentation?.camera ?? {}),
                    visible: cameraVisible,
                  },
                },
              }
            : asset,
        ),
      };

      stores?.project.getState().setProject(patchedProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    params,
  );
}

async function captureNormalizedRect(
  page: import('@playwright/test').Page,
  params: {
    rootSelector: string;
    mediaSelector: string;
    previewSelector: string;
    settleSelector: string;
    waitForReadyAttribute?: boolean;
  },
) {
  if (params.waitForReadyAttribute === false) {
    await page.waitForSelector(params.settleSelector, { timeout: 30_000 });
  } else {
    await page.waitForFunction((selector) => {
      const video = document.querySelector(selector) as HTMLVideoElement | null;
      return video?.getAttribute('data-ready') === 'true';
    }, params.settleSelector);
  }
  await page.waitForTimeout(400);

  const rect = await page.evaluate(({ rootSelector, mediaSelector, previewSelector }) => {
    const root = document.querySelector(rootSelector) as HTMLElement | null;
    const media = root?.querySelector(mediaSelector) as HTMLElement | null;
    const preview = root?.querySelector(previewSelector) as HTMLElement | null;
    const mediaRect = media?.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect();
    if (!mediaRect || !previewRect) return null;
    return {
      x: (mediaRect.x - previewRect.x) / previewRect.width,
      y: (mediaRect.y - previewRect.y) / previewRect.height,
      w: mediaRect.width / previewRect.width,
      h: mediaRect.height / previewRect.height,
      pixelWidth: mediaRect.width,
      pixelHeight: mediaRect.height,
    };
  }, params);

  expect(rect).not.toBeNull();
  if (!rect) throw new Error('Expected measurable camera rect');
  expect(rect.pixelWidth).toBeGreaterThanOrEqual(120);
  expect(rect.pixelHeight).toBeGreaterThanOrEqual(120);
  return rect;
}

async function readTemplateCameraFrame(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="template-preview-root"]') as HTMLElement | null;
    if (!root) {
      throw new Error('template-preview-root not found');
    }
    return {
      x: Number(root.getAttribute('data-camera-frame-x') ?? '0'),
      y: Number(root.getAttribute('data-camera-frame-y') ?? '0'),
      w: Number(root.getAttribute('data-camera-frame-w') ?? '0'),
      h: Number(root.getAttribute('data-camera-frame-h') ?? '0'),
    };
  });
}
