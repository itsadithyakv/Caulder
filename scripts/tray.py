"""Derives the tray icons from resources/icon.png.

Run by hand after the app icon changes:  python scripts/tray.py

The app icon is a light tile with the mark in its middle half - right for a
taskbar button, and far too much tile for a notification area slot sixteen
pixels wide, where the cauldron would shrink to a smudge. So the tile is cut
in close around the mark, the corners are rounded again, and each size the
tray asks for at each display scale is written as its own file. Electron
loads the @Nx siblings of tray.png by itself.

The tile stays: the mark is near-black, and most Windows taskbars are dark.

Writes resources/tray/tray.png and tray@1.25x, @1.5x, @2x, @3x beside it,
and notify.png - the same cut, larger - which is the mark a Windows
notification shows, and the icon registered against Caulder's app ID.
Needs Pillow, which is not a project dependency:  pip install pillow
"""

from PIL import Image, ImageChops, ImageDraw
import os

SRC, OUT = "resources/icon.png", "resources/tray"
SIZES = {
    "tray.png": 16, "tray@1.25x.png": 20, "tray@1.5x.png": 24, "tray@2x.png": 32, "tray@3x.png": 48,
    "notify.png": 128,
}

icon = Image.open(SRC).convert("RGBA")
tile = icon.getpixel((icon.width // 2, icon.height // 10))  # plain tile, above the flame

# Everything that is not the tile colour is the mark.
flat = Image.new("RGBA", icon.size, tile)
diff = ImageChops.difference(icon, flat).convert("L").point(lambda v: 255 if v > 24 else 0)
left, top, right, bottom = diff.getbbox()

# A square round the mark with a little air, so the flame does not touch the
# rounded corner at sixteen pixels.
side = int(max(right - left, bottom - top) * 1.14)
cx, cy = (left + right) // 2, (top + bottom) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
square = icon.crop(box)

mask = Image.new("L", square.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=int(side * 0.22), fill=255)
square.putalpha(mask)

os.makedirs(OUT, exist_ok=True)
for name, size in SIZES.items():
    square.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
    print(f"{OUT}/{name}  {size}x{size}")
