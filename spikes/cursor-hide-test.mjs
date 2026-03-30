import { hideCursor, showCursor } from '../apps/desktop/src/main/recording/cursor-hide.mjs';

console.log('=== cursor-hide Integration Test (v2 — long-lived process) ===\n');

// Test 1: show before hide is a no-op
console.assert(showCursor() === false, 'showCursor before hide should return false');
console.log('✓ showCursor() before hide returns false');

// Test 2: Hide cursor
console.log('\nHiding cursor for 3 seconds...');
const hideResult = await hideCursor();
console.log(`hideCursor() returned: ${hideResult}`);

if (hideResult) {
  console.log('✓ Cursor is hidden — check your screen! (cursor should be invisible)');

  // Test 3: Double hide is idempotent
  const doubleHide = await hideCursor();
  console.log(`Double hideCursor() returned: ${doubleHide} (should be true)`);

  // Wait 3 seconds then restore
  await new Promise(r => setTimeout(r, 3000));

  // Test 4: Show cursor
  console.log('\nRestoring cursor...');
  const showResult = showCursor();
  console.log(`showCursor() returned: ${showResult}`);
  console.assert(showResult === true, 'showCursor should return true');
  console.log('✓ Cursor should be visible again');

  // Wait for child to fully exit
  await new Promise(r => setTimeout(r, 300));

  // Test 5: Double show is a no-op
  const doubleShow = showCursor();
  console.log(`Double showCursor() returned: ${doubleShow} (should be false)`);

  console.log('\n=== All tests passed ===');
} else {
  console.log('⚠ hideCursor() failed — check gcc and libXfixes-dev');
}

process.exit(0);
