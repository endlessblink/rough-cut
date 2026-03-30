import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
let app: ElectronApplication;
let page: Page;
test.beforeAll(async () => {
  app = await electron.launch({ args: ['--no-sandbox', 'apps/desktop'], cwd: process.cwd() });
  page = await app.waitForEvent('window', { predicate: (w) => w.url().includes('127.0.0.1:7544'), timeout: 15_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
  await page.click('text=Record');
  await page.waitForTimeout(1_000);
});
test.afterAll(async () => { await app?.close(); });
test('measure stage and card', async () => {
  const data = await page.evaluate(() => {
    // Find PreviewStage section (the flex container for the card)
    const sections = Array.from(document.querySelectorAll('section'));
    const stage = sections.find(s => {
      const cs = getComputedStyle(s);
      return cs.display === 'flex' && cs.alignItems === 'center' && cs.justifyContent === 'center';
    });
    if (!stage) return { error: 'stage not found' };
    // The card is the first child div inside the stage
    const card = stage.children[0] as HTMLElement | null;
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      stage: { w: stage.clientWidth, h: stage.clientHeight, pad: getComputedStyle(stage).padding },
      card: card ? {
        w: card.clientWidth, h: card.clientHeight,
        computedW: getComputedStyle(card).width,
        computedH: getComputedStyle(card).height,
        ar: getComputedStyle(card).aspectRatio,
        maxW: getComputedStyle(card).maxWidth,
        maxH: getComputedStyle(card).maxHeight,
        flex: getComputedStyle(card).flex,
      } : null,
    };
  });
  console.log('MEASUREMENTS:', JSON.stringify(data, null, 2));
});
