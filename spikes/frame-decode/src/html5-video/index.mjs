/**
 * Spike 1 - Step 2: HTML5 <video> element baseline
 *
 * Tests frame-accurate seeking using video.currentTime + drawImage.
 * Runs in Electron renderer process.
 *
 * Usage: npm run bench:html5
 */

// TODO: Implement Electron app that:
// 1. Creates a BrowserWindow
// 2. Loads test videos into <video> elements
// 3. For each test scenario (random seek, sequential, long seek):
//    a. Set video.currentTime to target frame's timestamp
//    b. Wait for 'seeked' event
//    c. drawImage to canvas
//    d. Read burned-in frame number from pixels
//    e. Compare to requested frame
//    f. Record latency
// 4. Output results as JSON to stdout

console.log('HTML5 video benchmark - not yet implemented');
console.log('Run this via: npm run bench:html5');
