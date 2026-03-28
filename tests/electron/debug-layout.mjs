/**
 * Debug script: launches Electron app via Playwright and inspects
 * the actual renderer DOM to find layout overflow issues.
 *
 * Usage: node tests/electron/debug-layout.mjs
 * Requires: pnpm dev to be running (Vite at http://127.0.0.1:7544)
 */
import { _electron as electron } from 'playwright';

async function main() {
  console.log('Launching Electron...');
  const app = await electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
  });

  // Wait for main window (skip DevTools windows)
  let page;
  const windows = await app.windows();
  for (const w of windows) {
    const url = w.url();
    if (url.includes('127.0.0.1:7544')) {
      page = w;
      break;
    }
  }
  if (!page) {
    // Wait for it to appear
    page = await app.waitForEvent('window', {
      predicate: (w) => w.url().includes('127.0.0.1:7544'),
      timeout: 10000,
    });
  }
  console.log('Window opened:', page.url());
  await page.waitForTimeout(3000);

  // Click Record tab to make sure we're on it
  // Navigate to Edit tab to compare
  const editBtn = page.getByRole('button', { name: 'Edit' });
  if (await editBtn.count() > 0) {
    await editBtn.click();
    await page.waitForTimeout(1000);
  }

  const editInfo = await page.evaluate(() => {
    const mainRow = document.querySelector('div[style*="flex: 1 1 auto"][style*="flex-direction: row"]');
    const aside = document.querySelector('aside');
    const leftCol = mainRow?.children[0];
    return {
      tab: 'Edit',
      vw: window.innerWidth,
      mainRow: mainRow ? { w: Math.round(mainRow.getBoundingClientRect().width), scrollW: mainRow.scrollWidth } : null,
      leftCol: leftCol ? { w: Math.round(leftCol.getBoundingClientRect().width) } : null,
      aside: aside ? { l: Math.round(aside.getBoundingClientRect().left), r: Math.round(aside.getBoundingClientRect().right), w: Math.round(aside.getBoundingClientRect().width) } : null,
    };
  });
  console.log('\n=== EDIT TAB ===');
  console.log(JSON.stringify(editInfo, null, 2));

  // Go back to Record
  const recordBtn = page.getByRole('button', { name: 'Record' }).first();
  await recordBtn.click();
  await page.waitForTimeout(1000);

  // Extra check: ModeSelectorRow and BottomBar widths
  const extraInfo = await page.evaluate(() => {
    const root = document.querySelector('div[style*="100vh"]');
    if (!root) return null;
    return Array.from(root.children).map((c, i) => ({
      index: i,
      tag: c.tagName,
      width: Math.round(c.getBoundingClientRect().width),
      scrollWidth: c.scrollWidth,
      style: (c.getAttribute('style') || '').substring(0, 80),
    }));
  });
  console.log('\n=== ROOT CHILDREN ===');
  console.log(JSON.stringify(extraInfo, null, 2));

  const results = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = window.devicePixelRatio;

    // Root layout
    const root = document.querySelector('div[style*="100vh"]');
    const rootInfo = root ? {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflow: root.scrollWidth - root.clientWidth,
    } : null;

    // Canvas element
    const canvas = document.querySelector('canvas');
    const canvasInfo = canvas ? {
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.style.width,
      cssMaxWidth: canvas.style.maxWidth,
      cssHeight: canvas.style.height,
      boundingWidth: Math.round(canvas.getBoundingClientRect().width),
      boundingRight: Math.round(canvas.getBoundingClientRect().right),
      parentWidth: canvas.parentElement ? Math.round(canvas.parentElement.getBoundingClientRect().width) : null,
    } : null;

    // Aside (right panel)
    const aside = document.querySelector('aside');
    const asideInfo = aside ? {
      left: Math.round(aside.getBoundingClientRect().left),
      right: Math.round(aside.getBoundingClientRect().right),
      width: Math.round(aside.getBoundingClientRect().width),
      overflow: Math.round(aside.getBoundingClientRect().right - vw),
    } : null;

    // Main flex row
    const mainRow = document.querySelector('div[style*="flex: 1 1 auto"][style*="flex-direction: row"]');
    const mainRowInfo = mainRow ? {
      width: Math.round(mainRow.getBoundingClientRect().width),
      scrollWidth: mainRow.scrollWidth,
      childCount: mainRow.children.length,
    } : null;

    // Left column
    const leftCol = mainRow?.children[0];
    const leftColInfo = leftCol ? {
      width: Math.round(leftCol.getBoundingClientRect().width),
      scrollWidth: leftCol.scrollWidth,
      right: Math.round(leftCol.getBoundingClientRect().right),
    } : null;

    // Find ALL elements overflowing viewport
    const overflowers = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 && rect.width > 0) {
        overflowers.push({
          tag: el.tagName.toLowerCase(),
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          overflow: Math.round(rect.right - vw),
          style: (el.getAttribute('style') || '').substring(0, 100),
        });
      }
    });

    // Find elements with scrollWidth > clientWidth in the left column
    const scrollOverflows = [];
    if (leftCol) {
      leftCol.querySelectorAll('*').forEach(el => {
        if (el.scrollWidth > el.clientWidth + 2) {
          scrollOverflows.push({
            tag: el.tagName.toLowerCase(),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            diff: el.scrollWidth - el.clientWidth,
            style: (el.getAttribute('style') || '').substring(0, 100),
          });
        }
      });
    }

    // Deep trace: walk left column children tree (first 3 levels)
    function traceEl(el, depth) {
      if (depth > 4) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        w: Math.round(r.width),
        minW: getComputedStyle(el).minWidth,
        style: (el.getAttribute('style') || '').substring(0, 80),
        children: Array.from(el.children).slice(0, 5).map(c => traceEl(c, depth + 1)),
      };
    }
    const leftColTree = leftCol ? traceEl(leftCol, 0) : null;

    // Check sidebar wrapper for injected padding
    const sidebarWrapper = mainRow?.children[1];
    const sidebarWrapperInfo = sidebarWrapper ? {
      computedPaddingRight: getComputedStyle(sidebarWrapper).paddingRight,
      inlineStyle: sidebarWrapper.getAttribute('style'),
      offsetWidth: sidebarWrapper.offsetWidth,
      clientWidth: sidebarWrapper.clientWidth,
    } : null;

    // Check main row computed styles
    const mainRowComputed = mainRow ? {
      boxSizing: getComputedStyle(mainRow).boxSizing,
      width: getComputedStyle(mainRow).width,
      paddingLeft: getComputedStyle(mainRow).paddingLeft,
      paddingRight: getComputedStyle(mainRow).paddingRight,
      contentBoxWidth: mainRow.clientWidth,
      borderBoxWidth: mainRow.offsetWidth,
    } : null;

    return {
      viewport: { width: vw, height: vh, dpr },
      root: rootInfo,
      canvas: canvasInfo,
      aside: asideInfo,
      mainRow: mainRowInfo,
      leftCol: leftColInfo,
      leftColTree,
      mainRowComputed,
      sidebarWrapperInfo,
      overflowers: overflowers.sort((a, b) => b.overflow - a.overflow).slice(0, 15),
      scrollOverflows: scrollOverflows.sort((a, b) => b.diff - a.diff).slice(0, 10),
    };
  });

  console.log('\n=== LAYOUT DEBUG RESULTS ===\n');
  console.log(JSON.stringify(results, null, 2));

  if (results.root?.overflow > 0) {
    console.log(`\n❌ ROOT OVERFLOWS by ${results.root.overflow}px`);
  } else {
    console.log('\n✅ Root does not overflow');
  }

  if (results.aside?.overflow > 0) {
    console.log(`❌ ASIDE overflows viewport by ${results.aside.overflow}px`);
  } else {
    console.log('✅ Aside fits within viewport');
  }

  if (results.canvas) {
    console.log(`\n📐 Canvas: ${results.canvas.width}x${results.canvas.height} intrinsic, ${results.canvas.boundingWidth}px rendered, parent: ${results.canvas.parentWidth}px`);
  }

  await app.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
