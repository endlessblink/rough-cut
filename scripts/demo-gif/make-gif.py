#!/usr/bin/env python3
"""Assemble the README demo GIF from captured frames (Pillow, no video encoder).

    python3 scripts/demo-gif/make-gif.py <frames-dir> <out.gif> [width=1000] [fps=8]
"""
import glob
import os
import sys

from PIL import Image

frames_dir, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
fps = int(sys.argv[4]) if len(sys.argv) > 4 else 8

paths = sorted(glob.glob(os.path.join(frames_dir, 'frame-*.png')))
if not paths:
    sys.exit('no frames found')
frames = []
for path in paths:
    image = Image.open(path).convert('RGB')
    height = round(image.height * width / image.width)
    frames.append(image.resize((width, height), Image.LANCZOS).quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, optimize=True, disposal=1)
print(f'{out}: {len(frames)} frames, {os.path.getsize(out) / 1e6:.1f} MB')
