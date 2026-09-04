"""Derives every logo file in the repo from assets/caulderLogo.png.

Run by hand after replacing that file:  python scripts/logo.py

The mark is two flat colours on transparency - a near-black cauldron and an
orange flame. On the dark canvas the cauldron all but disappears and only the
flame survives, so dark mode needs its own copy with the ink lifted. That copy
is generated rather than hand-drawn, so the two can never drift apart.

Writes:
  src/assets/logo-light.png   the mark as drawn        (--logo-mark, light)
  src/assets/logo-dark.png    the mark, ink lifted     (--logo-mark, dark)
  resources/icon.png          the app icon             (electron-builder)

Needs Pillow, which is not a project dependency:  pip install pillow
"""

from PIL import Image, ImageDraw
import os

SRC, OUT_SRC, OUT_RES = "assets/caulderLogo.png", "src/assets", "resources"

im = Image.open(SRC).convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())  # trim the transparent margin, so
                                            # CSS sizing is the mark itself

# Every pixel that is neither black nor orange is anti-aliasing between the
# two, so a threshold recolour would leave an orange fringe along the flame.
# Project each pixel onto the black->orange line instead, then rebuild it from
# the same position against a new ink.
K = (20.0, 21.0, 25.0)   # the cauldron
O = (251.0, 131.0, 0.0)  # the flame
d = tuple(O[i] - K[i] for i in range(3))
dd = sum(c * c for c in d)

pixels = list(im.getdata())


def recolour(ink):
    cache, out = {}, []
    for r, g, b, a in pixels:
        hit = cache.get((r, g, b))
        if hit is None:
            t = ((r - K[0]) * d[0] + (g - K[1]) * d[1] + (b - K[2]) * d[2]) / dd
            t = min(1.0, max(0.0, t))
            hit = tuple(round(ink[i] + t * (O[i] - ink[i])) for i in range(3))
            cache[(r, g, b)] = hit
        out.append(hit + (a,))
    img = Image.new("RGBA", im.size)
    img.putdata(out)
    return img


light = recolour(K)                     # unchanged, but down the same path
dark = recolour((241.0, 241.0, 242.0))  # --ink in the dark theme

os.makedirs(OUT_SRC, exist_ok=True)
HEIGHT = 256  # comfortably above the largest on-screen use at 2x
width = round(im.width * HEIGHT / im.height)
for name, img in (("light", light), ("dark", dark)):
    path = f"{OUT_SRC}/logo-{name}.png"
    img.resize((width, HEIGHT), Image.LANCZOS).save(path, optimize=True)
    print(f"{path}  {width}x{HEIGHT}  {os.path.getsize(path)} bytes")

# The app icon. A black-on-transparent mark is invisible on a dark Windows
# taskbar, so it sits on a tile in the app's own --surface colour, which reads
# on a taskbar of either polarity.
SIZE = 1024
tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
corners = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(corners).rounded_rectangle(
    [0, 0, SIZE - 1, SIZE - 1], radius=round(SIZE * 0.176), fill=255
)
tile.paste(Image.new("RGBA", (SIZE, SIZE), (238, 241, 247, 255)), (0, 0), corners)

mark_h = round(SIZE * 0.66)
mark_w = round(im.width * mark_h / im.height)
tile.alpha_composite(
    light.resize((mark_w, mark_h), Image.LANCZOS),
    ((SIZE - mark_w) // 2, (SIZE - mark_h) // 2),
)
tile.save(f"{OUT_RES}/icon.png", optimize=True)
print(f"{OUT_RES}/icon.png  {SIZE}x{SIZE}  {os.path.getsize(f'{OUT_RES}/icon.png')} bytes")
