"""Derives every logo file in the repo from assets/caulderLogo.png.

Run by hand after replacing that file:  python scripts/logo.py

The mark is two flat colours on transparency - a near-black cauldron and an
orange flame - and every copy of it stays on transparency: no tile, no
square behind it. On anything dark the cauldron all but disappears and only
the flame survives, so there is a second copy with the ink lifted. It is
generated rather than hand-drawn, so the two can never drift apart; the
window picks between them by theme, and the tray and notifications by
whether Windows itself is dark.

Writes:
  src/assets/logo-light.png          the mark as drawn        (--logo-mark, light)
  src/assets/logo-dark.png           the mark, ink lifted     (--logo-mark, dark)
  resources/icon.png                 the app icon             (electron-builder)
  resources/tray/tray*.png           the tray, every scale    (light taskbar)
  resources/tray/tray-light*.png     the same, ink lifted     (dark taskbar)
  resources/tray/notify.png          a notification's mark    (light Windows)
  resources/tray/notify-light.png    the same, ink lifted     (dark Windows)
  resources/appx/*.png               the Microsoft Store package's tiles and
                                     icons, every scale        (package:store)

Needs Pillow, which is not a project dependency:  pip install pillow
"""

from PIL import Image
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

# The app icon, and every smaller copy: the mark on transparency, centred in
# a square with a little air so the flame does not touch the edge. Windows
# cannot swap an executable's icon by theme, so the app icon is the mark as
# drawn; the tray and notifications can, and get the lifted copy on dark.


def square(mark, size, fill):
    """The mark in a transparent square, its height `fill` of the side."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    h = max(1, round(size * fill))
    w = max(1, round(mark.width * h / mark.height))
    out.alpha_composite(mark.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return out


def save(img, path):
    img.save(path, optimize=True)
    print(f"{path}  {img.width}x{img.height}  {os.path.getsize(path)} bytes")


save(square(light, 1024, 0.90), f"{OUT_RES}/icon.png")

# The tray asks for sixteen pixels at 100% and more at each display scale;
# Electron loads the @Nx siblings of a file by itself. At that size every
# pixel of height is the mark, so it fills the square.
TRAY = {"": 16, "@1.25x": 20, "@1.5x": 24, "@2x": 32, "@3x": 48}
os.makedirs(f"{OUT_RES}/tray", exist_ok=True)
for scale, size in TRAY.items():
    save(square(light, size, 1.0), f"{OUT_RES}/tray/tray{scale}.png")
    save(square(dark, size, 1.0), f"{OUT_RES}/tray/tray-light{scale}.png")

# A notification's mark: the one Windows shows beside the words, and the one
# registered against Caulder's app ID.
save(square(light, 128, 0.92), f"{OUT_RES}/tray/notify.png")
save(square(dark, 128, 0.92), f"{OUT_RES}/tray/notify-light.png")

# The Microsoft Store package (npm run package:store): the tiles and icons its
# manifest names, at every scale Windows asks for. electron-builder puts in
# its own sample pictures for any it cannot find, so all four it knows are
# here, and the two larger tiles too.
#
# The small icon is what the taskbar, Start and Settings show, sized by pixel
# rather than scale. Unplated, it sits straight on the taskbar, so like the
# tray it has two: the ink lifted on a dark one ("altform-unplated") and the
# mark as drawn on a light one ("altform-lightunplated"). The tiles are
# transparent (backgroundColor in electron-builder.yml) and carry the mark
# as drawn, a little smaller, the way Windows draws a tile's picture.
APPX = f"{OUT_RES}/appx"
os.makedirs(APPX, exist_ok=True)
for old in os.listdir(APPX):
    if old.endswith(".png"):
        os.remove(f"{APPX}/{old}")


def wide(mark, width, height, fill):
    """The mark centred in a transparent rectangle, its height `fill` of it."""
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    h = max(1, round(height * fill))
    w = max(1, round(mark.width * h / mark.height))
    out.alpha_composite(mark.resize((w, h), Image.LANCZOS), ((width - w) // 2, (height - h) // 2))
    return out


SCALES = {100: 1.0, 125: 1.25, 150: 1.5, 200: 2.0, 400: 4.0}
for scale, k in SCALES.items():
    save(square(light, round(50 * k), 0.9), f"{APPX}/StoreLogo.scale-{scale}.png")
    save(square(light, round(44 * k), 0.9), f"{APPX}/Square44x44Logo.scale-{scale}.png")
    save(square(light, round(71 * k), 0.6), f"{APPX}/SmallTile.scale-{scale}.png")
    save(square(light, round(150 * k), 0.6), f"{APPX}/Square150x150Logo.scale-{scale}.png")
    save(wide(light, round(310 * k), round(150 * k), 0.6), f"{APPX}/Wide310x150Logo.scale-{scale}.png")
    save(square(light, round(310 * k), 0.5), f"{APPX}/LargeTile.scale-{scale}.png")

for size in (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256):
    fill = 1.0 if size <= 24 else 0.92
    save(square(light, size, fill), f"{APPX}/Square44x44Logo.targetsize-{size}.png")
    save(square(dark, size, fill), f"{APPX}/Square44x44Logo.targetsize-{size}_altform-unplated.png")
    save(square(light, size, fill), f"{APPX}/Square44x44Logo.targetsize-{size}_altform-lightunplated.png")
