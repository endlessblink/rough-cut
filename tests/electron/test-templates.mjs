/**
 * Test: clicking a template should visibly change the preview card aspect ratio
 * and update the resolution label in the bottom bar.
 */
import { _electron as electron } from 'playwright';

async function main() {
  console.log('Launching Electron...');
  const app = await electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
  });

  let page;
  const windows = await app.windows();
  for (const w of windows) {
    if (w.url().includes('127.0.0.1:7544')) { page = w; break; }
  }
  if (!page) {
    page = await app.waitForEvent('window', {
      predicate: (w) => w.url().includes('127.0.0.1:7544'),
      timeout: 10000,
    });
  }

  console.log('Window:', page.url());
  await page.waitForTimeout(3000);

  // Step 1: Get the preview card's aspect ratio and resolution label BEFORE
  const before = await page.evaluate(() => {
    // Find preview card (the div with aspectRatio style)
    const allDivs = document.querySelectorAll('div');
    let previewCard = null;
    for (const d of allDivs) {
      const ar = d.style.aspectRatio;
      if (ar && (ar.includes('/') || ar.includes(':'))) {
        const rect = d.getBoundingClientRect();
        if (rect.width > 200) { // Only the main preview card, not thumbnails
          previewCard = { aspectRatio: ar, width: Math.round(rect.width), height: Math.round(rect.height) };
          break;
        }
      }
    }

    // Find resolution text anywhere in the page
    const allText = document.body.innerText;
    const resMatch = allText.match(/(\d{3,4})×(\d{3,4})/);
    const resolutionText = resMatch ? resMatch[0] : null;

    return { previewCard, resolutionText };
  });
  console.log('BEFORE:', JSON.stringify(before));

  // Step 2: Click "Social Vertical" (9:16) template
  // Templates are buttons with title attributes containing the description
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button[title]');
    for (const btn of buttons) {
      if (btn.title.includes('Vertical') || btn.title.includes('vertical')) {
        btn.click();
        return btn.title;
      }
    }
    // Try by text content
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = btn.textContent?.trim();
      if (text === 'Social Vertical' || text?.includes('Social')) {
        btn.click();
        return text;
      }
    }
    return null;
  });
  console.log('Clicked:', clicked);
  await page.waitForTimeout(1000);

  // Step 3: Get AFTER state
  const after = await page.evaluate(() => {
    const allDivs = document.querySelectorAll('div');
    let previewCard = null;
    for (const d of allDivs) {
      const ar = d.style.aspectRatio;
      if (ar && (ar.includes('/') || ar.includes(':'))) {
        const rect = d.getBoundingClientRect();
        if (rect.width > 200) {
          previewCard = { aspectRatio: ar, width: Math.round(rect.width), height: Math.round(rect.height) };
          break;
        }
      }
    }

    const allText = document.body.innerText;
    const resMatch = allText.match(/(\d{3,4})×(\d{3,4})/);
    const resolutionText = resMatch ? resMatch[0] : null;

    return { previewCard, resolutionText };
  });
  console.log('AFTER:', JSON.stringify(after));

  // Verify
  if (before.previewCard?.aspectRatio !== after.previewCard?.aspectRatio) {
    console.log('✅ Preview card aspect ratio CHANGED:', before.previewCard?.aspectRatio, '→', after.previewCard?.aspectRatio);
  } else {
    console.log('❌ Preview card aspect ratio did NOT change');
  }

  if (before.resolutionText !== after.resolutionText) {
    console.log('✅ Resolution label CHANGED:', before.resolutionText, '→', after.resolutionText);
  } else {
    console.log('❌ Resolution label did NOT change');
  }

  await app.close();
}

main().catch(err => { console.error(err); process.exit(1); });
