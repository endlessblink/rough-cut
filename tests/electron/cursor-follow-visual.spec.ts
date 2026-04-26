import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import {
  readCursorOverlayDebugState,
  readCursorOverlayPixelStats,
  waitForCursorOverlayVisible,
} from './fixtures/cursor-overlay.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Cursor-follow zoom', () => {
  test('changes the framed area when cursor follow is enabled', async ({ appPage }) => {
    test.setTimeout(90_000);

    await appPage.waitForSelector('[data-testid="tab-record"]', { timeout: 60_000 });
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage, { preserveCursorEvents: true });

    const targetFrame = await appPage.evaluate(async () => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const state = stores?.project.getState();
      const recording = state?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      const clip = state?.project.composition.tracks
        .flatMap((track: any) => track.clips)
        .find((entry: any) => entry.assetId === recording?.id);
      const cursorEventsPath = recording?.metadata?.cursorEventsPath as string | null;
      if (!recording?.id || !cursorEventsPath) return 5;

      const content = await (window as unknown as any).roughcut.readTextFile(cursorEventsPath);
      const events = String(content)
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { frame: number; x: number; y: number });
      if (events.length === 0) return 5;

      const sourceWidth = Number(recording?.metadata?.width) || 1920;
      const sourceHeight = Number(recording?.metadata?.height) || 1080;
      const firstFrame = events[0]?.frame ?? 0;
      const lastFrame = events[Math.min(events.length - 1, 40)]?.frame ?? firstFrame + 45;
      const marker = {
        id: 'test-auto-follow-marker',
        startFrame: Math.max(0, firstFrame - 6),
        endFrame: Math.max(firstFrame + 24, lastFrame + 12),
        kind: 'auto',
        strength: 1,
        focalPoint: { x: 0.5, y: 0.5 },
        zoomInDuration: 6,
        zoomOutDuration: 6,
      };

      state.setRecordingAutoZoomIntensity(recording.id, 0.9);
      state.updateRecordingZoomSettings(recording.id, {
        followCursor: true,
        followAnimation: 'focused',
        followPadding: 0,
      });
      state.replaceAutoZoomMarkers(recording.id, [marker]);

      let bestFrame = marker.startFrame;
      let bestDistance = -1;

      for (const event of events) {
        if (event.frame < marker.startFrame || event.frame >= marker.endFrame) continue;
        const nx = event.x / sourceWidth;
        const ny = event.y / sourceHeight;
        const dx = nx - marker.focalPoint.x;
        const dy = ny - marker.focalPoint.y;
        const distance = dx * dx + dy * dy;
        if (distance > bestDistance) {
          bestDistance = distance;
          bestFrame = event.frame;
        }
      }

      const sourceFrame = Math.max(
        marker.startFrame + marker.zoomInDuration + 2,
        Math.min(bestFrame, marker.endFrame - marker.zoomOutDuration - 2),
      );

      return (clip?.timelineIn ?? 0) + sourceFrame - (clip?.sourceIn ?? 0);
    });

    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="auto"]'),
    ).toHaveCount(1, { timeout: 10_000 });

    const captureState = async () => {
      await appPage.waitForTimeout(250);
      const recordRoot = appPage.locator('[data-testid="record-tab-root"]');
      const zoomSurface = recordRoot.locator('[data-testid="recording-playback-canvas"]').first();
      await waitForCursorOverlayVisible(appPage);
      const [transform, cursorPixels, cursorState, playheadFrame] = await Promise.all([
        zoomSurface.evaluate((el) => getComputedStyle(el as HTMLElement).transform),
        readCursorOverlayPixelStats(appPage),
        readCursorOverlayDebugState(appPage),
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          const playheadFrame = stores?.transport.getState().playheadFrame ?? -1;
          const projectState = stores?.project.getState();
          const recording = projectState?.project.assets.find(
            (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
          );
          const marker = recording?.presentation?.zoom?.markers?.find((entry: any) => entry.kind === 'auto');
          return {
            playheadFrame,
            markerStart: marker?.startFrame ?? -1,
            markerEnd: marker?.endFrame ?? -1,
          };
        }),
      ]);
      return {
        transform,
        hash: cursorPixels.hash,
        zoomScale: cursorState.zoomScale,
        zoomTranslateX: cursorState.zoomTranslateX,
        zoomTranslateY: cursorState.zoomTranslateY,
        playheadFrame: playheadFrame.playheadFrame,
        markerStart: playheadFrame.markerStart,
        markerEnd: playheadFrame.markerEnd,
      };
    };

    await appPage.evaluate((frame) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.setState({ playheadFrame: frame });
      const projectState = stores?.project.getState();
      const recording = projectState?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      if (!recording?.id) return;
      projectState.updateRecordingZoomSettings(recording.id, { followCursor: false });
    }, targetFrame);
    const withoutFollow = await captureState();

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectState = stores?.project.getState();
      const recording = projectState?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      if (!recording?.id) return;
      projectState.updateRecordingZoomSettings(recording.id, {
        followCursor: true,
        followAnimation: 'focused',
        followPadding: 0,
      });
    });
    const withFollow = await captureState();

    expect(withoutFollow.playheadFrame).toBe(targetFrame);
    expect(withFollow.playheadFrame).toBe(targetFrame);
    expect(withFollow.hash).toBeGreaterThan(0);
    expect(withFollow.markerStart).toBeLessThanOrEqual(targetFrame);
    expect(withFollow.markerEnd).toBeGreaterThan(targetFrame);
  });
});
