/**
 * Headless desktopCapturer test
 * Runs via: xvfb-run electron --no-sandbox this-file.cjs
 */
const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const result = {
      success: true,
      count: sources.length,
      sources: sources.map(s => ({ id: s.id, name: s.name, displayId: s.display_id })),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    const result = { success: false, error: err.message };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
  app.quit();
});

app.on('window-all-closed', () => app.quit());
