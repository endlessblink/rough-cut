/**
 * Benchmark selectActiveClipsAtFrame with varying clip counts.
 *
 * Usage: npm run bench:selector
 */

function generateClips(count) {
  const tracks = ['v1', 'v2', 'a1', 'a2'];
  const clips = [];
  for (let i = 0; i < count; i++) {
    clips.push({
      id: `clip-${i}`,
      trackId: tracks[i % 4],
      position: Math.floor(Math.random() * 3000),
      duration: 30 + Math.floor(Math.random() * 270),
    });
  }
  return clips;
}

function selectActiveClipsAtFrame(clips, frame) {
  return clips.filter(c => frame >= c.position && frame < c.position + c.duration);
}

function benchmarkSelector(clipCount, iterations = 10000) {
  const clips = generateClips(clipCount);
  const frame = 1500; // middle of range
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    selectActiveClipsAtFrame(clips, frame);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  return {
    clipCount,
    p50: times[Math.floor(times.length * 0.5)].toFixed(4),
    p95: times[Math.floor(times.length * 0.95)].toFixed(4),
    p99: times[Math.floor(times.length * 0.99)].toFixed(4),
    max: times[times.length - 1].toFixed(4),
  };
}

console.log('selectActiveClipsAtFrame benchmark (ms)\n');
console.log('Clips\tp50\tp95\tp99\tmax');
for (const count of [100, 500, 1000, 5000]) {
  const r = benchmarkSelector(count);
  console.log(`${r.clipCount}\t${r.p50}\t${r.p95}\t${r.p99}\t${r.max}`);
}
