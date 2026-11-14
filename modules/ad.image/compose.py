"""One ad at an exact platform size: the picture cropped to fill, a dark band with the headline at the top and a
call-to-action button at the bottom. python compose.py <picture> <out.png> <width> <height> <headline> <cta>"""
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, out, W, H, headline, cta = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6]


def font(size, bold=True):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


img = Image.open(src).convert("RGB")
scale = max(W / img.width, H / img.height)
img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
left, top = (img.width - W) // 2, (img.height - H) // 2
img = img.crop((left, top, left + W, top + H))

# a soft dark gradient behind the headline so it reads on any picture
band = int(H * (0.34 if H > W else 0.4))
shade = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(shade)
for y in range(band):
    d.line([(0, y), (W, y)], fill=int(200 * (1 - y / band) ** 1.4))
img = Image.composite(Image.new("RGB", (W, H), (8, 12, 22)), img, shade)

draw = ImageDraw.Draw(img)
M = int(W * 0.07)
size = int(W * (0.095 if H > W else 0.085))
f = font(size)
chars = max(10, int((W - 2 * M) / (size * 0.52)))
lines = textwrap.wrap(headline, chars)[:3]
y = int(H * (0.07 if H > W else 0.06))
for line in lines:
    draw.text((M + 3, y + 4), line, font=f, fill=(0, 0, 0))
    draw.text((M, y), line, font=f, fill=(255, 255, 255))
    y += int(size * 1.12)

# call to action: an amber pill near the bottom
cf = font(int(size * 0.5))
tw = draw.textlength(cta, font=cf)
ph, pw = int(size * 0.95), int(tw + size * 1.1)
px, py = (W - pw) // 2, H - int(H * 0.08) - ph
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).rounded_rectangle([px - 6, py + 8, px + pw + 6, py + ph + 14], radius=ph // 2, fill=(0, 0, 0, 140))
img = Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(10))).convert("RGB")
draw = ImageDraw.Draw(img)
draw.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=(255, 184, 28))
bb = draw.textbbox((0, 0), cta, font=cf)
draw.text((px + (pw - (bb[2] - bb[0])) / 2 - bb[0], py + (ph - (bb[3] - bb[1])) / 2 - bb[1]), cta, font=cf, fill=(16, 20, 30))
img.save(out)
