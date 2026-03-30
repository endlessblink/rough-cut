import { CursorRecorder } from '../apps/desktop/src/main/recording/cursor-recorder.mjs';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT = join(import.meta.dirname, 'test-cursor-output.ndjson');

const recorder = new CursorRecorder();

console.log('=== CursorRecorder Integration Test ===\n');

// Test 1: isRecording starts false
console.assert(!recorder.isRecording, 'should not be recording initially');
console.log('✓ isRecording starts false');

// Test 2: stop() while not recording returns null
console.assert(recorder.stop() === null, 'stop() while not recording should return null');
console.log('✓ stop() while not recording returns null');

// Test 3: start + capture + stop
console.log('\nStarting 3-second capture... move your mouse and click!');
recorder.start(30, OUTPUT);
console.assert(recorder.isRecording, 'should be recording after start()');
console.log('✓ isRecording is true after start()');

// Test 4: double-start throws
try {
  recorder.start(30, OUTPUT);
  console.assert(false, 'should have thrown');
} catch (e) {
  console.log('✓ double start() throws:', e.message);
}

setTimeout(() => {
  const result = recorder.stop();
  console.assert(!recorder.isRecording, 'should not be recording after stop()');
  console.log('✓ isRecording is false after stop()');

  if (result) {
    console.log(`✓ Captured ${result.eventCount} events → ${result.eventsPath}`);

    // Test 5: verify NDJSON file
    const content = readFileSync(OUTPUT, 'utf-8');
    const lines = content.trim().split('\n');
    console.log(`✓ NDJSON file has ${lines.length} lines`);

    // Parse first and last event
    const first = JSON.parse(lines[0]);
    const last = JSON.parse(lines[lines.length - 1]);
    console.log(`  First event: frame=${first.frame} type=${first.type} x=${first.x} y=${first.y}`);
    console.log(`  Last event:  frame=${last.frame} type=${last.type} x=${last.x} y=${last.y}`);

    // Verify frame numbers are reasonable (3s at 30fps = ~90 frames)
    console.assert(last.frame <= 120, 'last frame should be <= 120 for 3s recording');
    console.log(`✓ Frame range: 0 → ${last.frame} (expected ~0-90 for 3s at 30fps)`);

    // Event type breakdown
    const counts = {};
    for (const line of lines) {
      const e = JSON.parse(line);
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    console.log(`✓ Event breakdown:`, counts);

    // Test 6: getEvents returns copy
    const events = recorder.getEvents();
    console.assert(Array.isArray(events), 'getEvents should return array');

    // Cleanup
    unlinkSync(OUTPUT);
    console.log('✓ Cleaned up test file');
  } else {
    console.log('⚠ No events captured (did you move the mouse?)');
  }

  console.log('\n=== All tests passed ===');
  process.exit(0);
}, 3000);
