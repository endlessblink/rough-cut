import { test, expect, navigateToTab } from './fixtures/electron-app.js';

interface RectMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

function slider(appPage: import('@playwright/test').Page, label: string) {
  return appPage.locator(`input[type="range"][aria-label="${label}"]`);
}

async function openInspectorCategory(
  appPage: import('@playwright/test').Page,
  category: 'background' | 'camera',
) {
  const railItem = appPage.locator(
    `[data-testid="inspector-rail-item"][data-category="${category}"]`,
  );
  await railItem.click();

  await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
    'data-category',
    category,
  );

  if (category === 'background') {
    await expect(slider(appPage, 'Padding')).toBeVisible();
    return;
  }

  const showCameraButton = appPage.getByRole('button', { name: /Show camera/i });
  if ((await showCameraButton.textContent())?.includes('Off')) {
    await showCameraButton.click();
  }
  await expect(slider(appPage, 'Camera padding')).toBeVisible();
}

async function setSlider(sliderLocator: import('@playwright/test').Locator, value: number) {
  await sliderLocator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function readRect(
  appPage: import('@playwright/test').Page,
  testId: string,
): Promise<RectMetrics> {
  return appPage.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!element) {
      throw new Error(`Element not found: ${id}`);
    }

    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, testId);
}

async function readBorderTopWidth(
  appPage: import('@playwright/test').Page,
  testId: string,
): Promise<string> {
  return appPage.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!element) {
      throw new Error(`Element not found: ${id}`);
    }

    return window.getComputedStyle(element).borderTopWidth;
  }, testId);
}

async function readBoxShadow(
  appPage: import('@playwright/test').Page,
  testId: string,
): Promise<string> {
  return appPage.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!element) {
      throw new Error(`Element not found: ${id}`);
    }

    return window.getComputedStyle(element).boxShadow;
  }, testId);
}

async function ensureRecordPreviewReady(appPage: import('@playwright/test').Page) {
  await navigateToTab(appPage, 'record');

  const screenFrame = appPage.locator('[data-testid="record-screen-frame"]');
  const cameraFrame = appPage.locator('[data-testid="record-camera-frame"]');

  try {
    await expect(screenFrame).toBeVisible({ timeout: 5000 });
    await expect(cameraFrame).toBeVisible({ timeout: 5000 });
    return;
  } catch {
    const reloadButton = appPage.getByRole('button', { name: 'DEBUG: Reload Last' });
    if (await reloadButton.isVisible().catch(() => false)) {
      await reloadButton.click();
    }
  }

  await expect(screenFrame).toBeVisible({ timeout: 15000 });
  await expect(cameraFrame).toBeVisible({ timeout: 15000 });
  await appPage.waitForTimeout(350);
}

test.describe('Record framing controls', () => {
  test.beforeEach(async ({ appPage }) => {
    await ensureRecordPreviewReady(appPage);
  });

  test('background padding affects only the screen frame', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'background');

    const initialScreen = await readRect(appPage, 'record-screen-frame');
    const initialCamera = await readRect(appPage, 'record-camera-frame');

    await setSlider(slider(appPage, 'Padding'), 120);

    await expect
      .poll(async () => (await readRect(appPage, 'record-screen-frame')).width)
      .toBeLessThan(initialScreen.width);

    const nextScreen = await readRect(appPage, 'record-screen-frame');
    const nextCamera = await readRect(appPage, 'record-camera-frame');

    expect(nextScreen.width).toBeLessThan(initialScreen.width);
    expect(nextScreen.height).toBeLessThan(initialScreen.height);
    expect(nextCamera.x).toBeCloseTo(initialCamera.x, 0);
    expect(nextCamera.y).toBeCloseTo(initialCamera.y, 0);
    expect(nextCamera.width).toBeCloseTo(initialCamera.width, 0);
    expect(nextCamera.height).toBeCloseTo(initialCamera.height, 0);
  });

  test('background inset affects only the screen border', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'background');

    const initialCamera = await readRect(appPage, 'record-camera-frame');
    const initialBorder = await readBorderTopWidth(appPage, 'record-screen-frame');

    await setSlider(slider(appPage, 'Inset'), 10);

    await expect
      .poll(async () => Number.parseFloat(await readBorderTopWidth(appPage, 'record-screen-frame')))
      .toBeGreaterThan(Number.parseFloat(initialBorder));

    await appPage.waitForTimeout(350);

    const nextCamera = await readRect(appPage, 'record-camera-frame');
    expect(nextCamera.x).toBeCloseTo(initialCamera.x, 0);
    expect(nextCamera.y).toBeCloseTo(initialCamera.y, 0);
    expect(nextCamera.width).toBeCloseTo(initialCamera.width, 0);
    expect(nextCamera.height).toBeCloseTo(initialCamera.height, 0);
  });

  test('camera padding affects only the camera frame', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'camera');

    const initialScreen = await readRect(appPage, 'record-screen-frame');
    const initialCamera = await readRect(appPage, 'record-camera-frame');
    const initialCameraContent = await readRect(appPage, 'record-camera-frame-content');

    await setSlider(slider(appPage, 'Camera padding'), 40);

    await expect
      .poll(async () => (await readRect(appPage, 'record-camera-frame-content')).width)
      .toBeLessThan(initialCameraContent.width);

    await appPage.waitForTimeout(350);

    const nextScreen = await readRect(appPage, 'record-screen-frame');
    const nextCamera = await readRect(appPage, 'record-camera-frame');
    const nextCameraContent = await readRect(appPage, 'record-camera-frame-content');

    expect(nextCamera.width).toBeCloseTo(initialCamera.width, 0);
    expect(nextCamera.height).toBeCloseTo(initialCamera.height, 0);
    expect(nextCameraContent.width).toBeLessThan(initialCameraContent.width);
    expect(nextCameraContent.height).toBeLessThan(initialCameraContent.height);
    expect(nextScreen.x).toBeCloseTo(initialScreen.x, 0);
    expect(nextScreen.y).toBeCloseTo(initialScreen.y, 0);
    expect(nextScreen.width).toBeCloseTo(initialScreen.width, 0);
    expect(nextScreen.height).toBeCloseTo(initialScreen.height, 0);
  });

  test('camera size affects the camera frame before padding', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'camera');

    const initialScreen = await readRect(appPage, 'record-screen-frame');
    const initialCamera = await readRect(appPage, 'record-camera-frame');

    await setSlider(slider(appPage, 'Size'), 140);

    await expect
      .poll(async () => (await readRect(appPage, 'record-camera-frame')).width)
      .toBeGreaterThan(initialCamera.width);

    await appPage.waitForTimeout(350);

    const nextScreen = await readRect(appPage, 'record-screen-frame');
    const nextCamera = await readRect(appPage, 'record-camera-frame');

    expect(nextCamera.width).toBeGreaterThan(initialCamera.width);
    expect(nextCamera.height).toBeGreaterThan(initialCamera.height);
    expect(nextScreen.x).toBeCloseTo(initialScreen.x, 0);
    expect(nextScreen.y).toBeCloseTo(initialScreen.y, 0);
    expect(nextScreen.width).toBeCloseTo(initialScreen.width, 0);
    expect(nextScreen.height).toBeCloseTo(initialScreen.height, 0);
  });

  test('camera inset affects only the camera border', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'camera');

    const initialScreen = await readRect(appPage, 'record-screen-frame');
    const initialBorder = await readBorderTopWidth(appPage, 'record-camera-frame');

    await setSlider(slider(appPage, 'Camera inset'), 10);

    await expect
      .poll(async () => Number.parseFloat(await readBorderTopWidth(appPage, 'record-camera-frame')))
      .toBeGreaterThan(Number.parseFloat(initialBorder));

    await appPage.waitForTimeout(350);

    const nextScreen = await readRect(appPage, 'record-screen-frame');
    expect(nextScreen.x).toBeCloseTo(initialScreen.x, 0);
    expect(nextScreen.y).toBeCloseTo(initialScreen.y, 0);
    expect(nextScreen.width).toBeCloseTo(initialScreen.width, 0);
    expect(nextScreen.height).toBeCloseTo(initialScreen.height, 0);
  });

  test('camera shadow affects only the camera frame styling', async ({ appPage }) => {
    await openInspectorCategory(appPage, 'camera');

    const shadowToggle = appPage.getByRole('button', { name: /Shadow/i });
    if ((await shadowToggle.textContent())?.includes('Off')) {
      await shadowToggle.click();
    }

    const initialScreen = await readRect(appPage, 'record-screen-frame');
    const initialShadow = await readBoxShadow(appPage, 'record-camera-frame');

    await setSlider(slider(appPage, 'Camera shadow blur'), 40);

    await expect
      .poll(async () => readBoxShadow(appPage, 'record-camera-frame'))
      .not.toBe(initialShadow);

    const nextScreen = await readRect(appPage, 'record-screen-frame');
    expect(nextScreen.x).toBeCloseTo(initialScreen.x, 0);
    expect(nextScreen.y).toBeCloseTo(initialScreen.y, 0);
    expect(nextScreen.width).toBeCloseTo(initialScreen.width, 0);
    expect(nextScreen.height).toBeCloseTo(initialScreen.height, 0);
  });
});
