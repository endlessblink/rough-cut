#!/usr/bin/env node
// Stand-in for the Claude CLI in UI tests: answers like `claude -p --output-format json`
// with a fixed graphic. No network. Records the args it was called with.
const fs = require('fs');
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const record = process.env.ROUGH_CUT_FAKE_CLAUDE_RECORD;
  if (record) fs.writeFileSync(record, JSON.stringify({ argv: process.argv.slice(2), prompt: input }, null, 2));
  const graphic = {
    title: 'Title card',
    durationSec: 3,
    startSec: 6,
    html: `<style>
.card{position:absolute;right:120px;top:120px;padding:26px 38px;border-radius:16px;background:var(--rc-bg,#111827);
color:var(--rc-ink,#fff);font:700 64px Heebo,sans-serif;box-shadow:0 18px 40px rgb(0 0 0/.35);animation:pop .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes pop{from{opacity:0;transform:translateY(-24px)}}
</style><div class="card" data-rc-field="headline">Fixing the compressor</div>`,
    fields: [
      { key: 'headline', label: 'Headline', type: 'text', value: 'Fixing the compressor' },
      { key: 'bg', label: 'Background', type: 'color', value: '#111827' },
    ],
  };
  setTimeout(() => {
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: graphic }));
  }, 800);
});
