"""Typesets the game's title as a glossy wordmark in the trailer style (trailers/tools/make_logo.py's look:
gradient fill, dark outline, gloss on the top half, soft shadow, a slight tilt).

    python logo.py <font.ttf> <out.png> <title>
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT, OUT, TITLE = sys.argv[1], sys.argv[2], " ".join(sys.argv[3:]).upper().strip() or "KART RACER"
DARK = (34, 8, 52, 255)


def word(text, size, top, bot, stroke):
    f = ImageFont.truetype(FONT, size)
    l, t, r, b = f.getbbox(text, stroke_width=stroke)
    w, h = r - l + 20, b - t + 20
    m = Image.new("L", (w, h)); ImageDraw.Draw(m).text((10 - l, 10 - t), text, font=f, fill=255)
    ms = Image.new("L", (w, h)); ImageDraw.Draw(ms).text((10 - l, 10 - t), text, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    y = np.linspace(0, 1, h)[:, None, None]
    grad = np.repeat((np.array(top)[None, None] * (1 - y) + np.array(bot)[None, None] * y), w, 1).astype(np.uint8)
    fill = Image.fromarray(grad, "RGB").convert("RGBA"); fill.putalpha(m)
    hl = np.zeros((h, w), np.uint8); hl[: int(h * 0.45)] = 70
    white = Image.new("RGBA", (w, h), (255, 255, 255, 0)); white.putalpha(Image.fromarray(np.minimum(np.array(m), hl), "L"))
    out = Image.new("RGBA", (w, h)); st = Image.new("RGBA", (w, h), DARK); st.putalpha(ms)
    out.alpha_composite(st); out.alpha_composite(fill); out.alpha_composite(white)
    return out


words = TITLE.split()
# the last word big and hot, the rest above it cool and smaller; long single lines shrink to fit
head = " ".join(words[:-1])
last = words[-1]
rows = []
if head:
    rows.append(word(head, max(120, min(230, int(230 * 9 / max(9, len(head))))), (255, 255, 255), (205, 225, 255), 18))
rows.append(word(last, max(160, min(330, int(330 * 6 / max(6, len(last))))), (255, 236, 90), (255, 150, 20), 22))
W = max(r.width for r in rows) + 40
H = sum(r.height for r in rows) + 40
L = Image.new("RGBA", (W, H))
y = 20
for r in rows:
    L.alpha_composite(r, ((W - r.width) // 2, y))
    y += r.height - 40
L = L.crop(L.getbbox())
al = L.split()[3]
sh = Image.new("RGBA", L.size, (20, 0, 35, 0)); sh.putalpha(al.point(lambda v: int(v * 0.65)).filter(ImageFilter.GaussianBlur(6)))
pad = 40
F2 = Image.new("RGBA", (L.width + 2 * pad, L.height + 2 * pad))
F2.alpha_composite(sh, (pad + 10, pad + 16)); F2.alpha_composite(L, (pad, pad))
F2 = F2.rotate(4, expand=True, resample=Image.BICUBIC)
F2 = F2.crop(F2.getbbox())
F2.save(OUT)
print(F2.size)
