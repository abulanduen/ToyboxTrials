"""Turn the captures from thumbs.cjs into game-card thumbnails: 480x270 WebP, under ~40 KB each.

    python3 tests/e2e/thumbs.py

Reads tests/e2e/output/thumb-src-<id>.png, writes public/assets/thumbs/<id>.webp, prints sizes.
"""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'thumbs')
os.makedirs(OUT, exist_ok=True)

for src in sorted(glob.glob(os.path.join(HERE, 'output', 'thumb-src-*.png'))):
    game = os.path.basename(src)[len('thumb-src-'):-len('.png')]
    img = Image.open(src).convert('RGB')
    # Centre-crop to 16:9, then scale down.
    w, h = img.size
    tw = min(w, round(h * 16 / 9))
    th = min(h, round(w * 9 / 16))
    left, top = (w - tw) // 2, (h - th) // 2
    img = img.crop((left, top, left + tw, top + th)).resize((480, 270), Image.LANCZOS)
    dest = os.path.join(OUT, f'{game}.webp')
    for quality in (72, 62, 52, 42):
        img.save(dest, 'WEBP', quality=quality, method=6)
        if os.path.getsize(dest) <= 40 * 1024:
            break
    print(f'{game}: {os.path.getsize(dest) // 1024} KB (q{quality})')
