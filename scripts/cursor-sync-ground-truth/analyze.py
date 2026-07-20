#!/usr/bin/env python3
"""Compare video color-flip frames vs telemetry mouse-jump frames."""
import json, subprocess, re, statistics, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
result = json.load(open(os.path.join(HERE, 'result.json')))
raw_path = result['rawPath']
fps = result['fps']

# Per-frame luma average of the chromium page area.
proc = subprocess.run([
    'ffprobe', '-v', 'error', '-f', 'lavfi',
    f"movie={raw_path},crop=600:300:930:440,signalstats",
    '-show_entries', 'frame=pts_time:frame_tags=lavfi.signalstats.YAVG',
    '-of', 'csv=p=0',
], capture_output=True, text=True)
frames = []
for line in proc.stdout.splitlines():
    parts = line.strip().split(',')
    if len(parts) >= 2 and parts[0] and parts[1]:
        try:
            frames.append((float(parts[0]), float(parts[1])))
        except ValueError:
            pass

# Flip = luma crossing the midpoint between observed dark/bright levels.
lumas = [y for _, y in frames]
lo, hi = min(lumas), max(lumas)
mid = (lo + hi) / 2
flips = []  # (frame_index, direction)
prev_bright = lumas[0] > mid
for idx, (_t, y) in enumerate(frames):
    bright = y > mid
    if bright != prev_bright:
        flips.append((idx, 'white' if bright else 'black'))
        prev_bright = bright

def jumps(events):
    out = []
    prev_region = None
    for ev in events:
        if ev.get('type') != 'move':
            continue
        region = 'B' if ev['x'] > 1200 else 'A'
        if prev_region is not None and region != prev_region:
            out.append((ev['frame'], ev['timeMs'], region))
        prev_region = region
    return out

aligned_jumps = jumps(result['alignedEvents'])
raw_jumps = jumps(result['rawEvents'])

print(f"video luma range {lo:.1f}..{hi:.1f}; {len(flips)} flips at frames: {[f for f, _ in flips]}")
print(f"aligned telemetry jumps: {[(f, r) for f, _, r in aligned_jumps]}")
print(f"raw     telemetry jumps: {[(f, r) for f, _, r in raw_jumps]}")
print(f"anchors: {result['cursorAnchors']}")

def pair(flips, jumps):
    """Pair each jump with the nearest flip (region-blind flips, so use proximity)."""
    out = []
    for jf, _t, _r in jumps:
        best = min(flips, key=lambda f: abs(f[0] - jf))
        if abs(best[0] - jf) <= 15:
            out.append(jf - best[0])
    return out

resid_aligned = pair(flips, aligned_jumps)
resid_raw = pair(flips, raw_jumps)
if not resid_aligned:
    sys.exit('no matched flip/jump pairs')
ms = 1000 / fps
print(f"\nresidual per cycle ALIGNED (telemetry frame - video frame): {resid_aligned}")
print(f"  mean {statistics.mean(resid_aligned):+.2f} frames ({statistics.mean(resid_aligned)*ms:+.0f} ms), stdev {statistics.pstdev(resid_aligned):.2f}")
print(f"residual per cycle RAW: {resid_raw}")
print(f"  mean {statistics.mean(resid_raw):+.2f} frames ({statistics.mean(resid_raw)*ms:+.0f} ms)")

# True first-frame wall clock inferred from each flip: t_flip - video_time.
truth = result['truth']
n = min(len(truth), len(flips))
inferred_F = [truth[i]['t'] - flips[i][0] * ms for i in range(n)]
seg_start = None
if result['cursorAnchors']:
    # anchorOffsetMs = firstFrameMs(measured) - segmentStartMs
    print(f"\ninferred TRUE first-frame wall-clock spread: {max(inferred_F)-min(inferred_F):.0f} ms")
    print(f"mean inferred F: {statistics.mean(inferred_F):.0f}")
