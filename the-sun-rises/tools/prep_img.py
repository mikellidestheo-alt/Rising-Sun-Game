# Resize/crop artwork for the game: portraits -> 400x480 (5:6), backgrounds -> 1280x720 (16:9). JPEG, under the size budget.
import sys
from PIL import Image
kind, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
w, h = im.size
if kind == 'portrait':
    tw, th, budget = 400, 480, 150_000
    ch = min(h, int(w * 6 / 5)); cw = int(ch * 5 / 6)
    top = int(max(0, min(h - ch, h * 0.40 - ch / 2)))  # keep the head and shoulders
    left = (w - cw) // 2
else:
    tw, th, budget = 1280, 720, 260_000
    ch = min(h, int(w * 9 / 16)); cw = int(ch * 16 / 9)
    top, left = (h - ch) // 2, (w - cw) // 2
im = im.crop((left, top, left + cw, top + ch)).resize((tw, th), Image.LANCZOS)
q = 84
while True:
    im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
    import os
    if os.path.getsize(dst) <= budget or q <= 50: break
    q -= 4
print(dst, os.path.getsize(dst), 'q', q)
