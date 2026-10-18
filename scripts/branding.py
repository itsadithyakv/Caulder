"""Writes branding/: the logo, icons and Store pictures, for use outside the app.

Run by hand:  python scripts/branding.py   (needs Pillow: pip install pillow)

Everything comes from assets/caulderLogo.png, like the app's own copies
(scripts/logo.py, which writes those). The word is set in Gilroy Bold, the
app's face, in capitals with a little tracking, as the title bar sets it. The
pictures for Partner Center are on the notebook's paper - its off-white, the
faint blue ruling and the rose margin (src/styles/tokens.css, the notebook
face) - so the Store listing looks like the app it leads to.

Writes:
  branding/mark/      the mark alone, transparent: as drawn, and for dark grounds
  branding/icon/      the app icon at every size, and caulder.ico
  branding/lockup/    the mark and the word side by side, light and dark
  branding/store/     Partner Center's Store logos (300, 150 and 71 square),
                      box art, poster art and hero art
  branding/social/    a link preview and GitHub's social preview
"""

from PIL import Image, ImageDraw, ImageFont
import os

SRC = "assets/caulderLogo.png"
FONT = "resources/fonts/Gilroy-Bold.woff2"
OUT = "branding"

# The notebook face, light and dark (tokens.css).
PAPER, PAPER_DARK = (248, 245, 238), (26, 22, 18)
INK, INK_DARK = (31, 25, 20), (242, 233, 222)
RULE = (96, 140, 190, 28)          # --rule-line, 0.11 alpha
MARGIN = (233, 170, 161, 255)      # --margin-rule

im = Image.open(SRC).convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())

# The same projection scripts/logo.py uses: each pixel placed on the line from
# the cauldron's black to the flame's orange, then rebuilt against a new ink,
# so the anti-aliasing along the flame never fringes.
K = (20.0, 21.0, 25.0)
O = (251.0, 131.0, 0.0)
d = tuple(O[i] - K[i] for i in range(3))
dd = sum(c * c for c in d)


def recolour(ink):
    cache, out = {}, []
    for r, g, b, a in getattr(im, "get_flattened_data", im.getdata)():
        hit = cache.get((r, g, b))
        if hit is None:
            t = min(1.0, max(0.0, ((r - K[0]) * d[0] + (g - K[1]) * d[1] + (b - K[2]) * d[2]) / dd))
            hit = tuple(round(ink[i] + t * (O[i] - ink[i])) for i in range(3))
            cache[(r, g, b)] = hit
        out.append(hit + (a,))
    img = Image.new("RGBA", im.size)
    img.putdata(out)
    return img


MARK = recolour(K)
MARK_DARK = recolour((241.0, 241.0, 242.0))


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(f"{path}  {img.width}x{img.height}  {os.path.getsize(path) // 1024} KB")


def sized(mark, height):
    return mark.resize((max(1, round(mark.width * height / mark.height)), height), Image.LANCZOS)


def square(mark, size, fill, ground=None):
    out = Image.new("RGBA", (size, size), ground + (255,) if ground else (0, 0, 0, 0))
    m = sized(mark, max(1, round(size * fill)))
    out.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return out


def word(height, ink):
    """CAULDER in Gilroy Bold, its capitals `height` tall, tracked 0.04em."""
    font = ImageFont.truetype(FONT, 100)
    cap = font.getbbox("H")[3] - font.getbbox("H")[1]
    font = ImageFont.truetype(FONT, round(100 * height / cap))
    text, track = "CAULDER", font.size * 0.04
    left, top, _, bottom = font.getbbox(text)
    width = round(font.getlength(text) + track * (len(text) - 1))
    out = Image.new("RGBA", (width + 4, bottom - top + 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    for i, ch in enumerate(text):
        # Where the letter falls in the word as set, so kerning stays; then the tracking.
        draw.text((font.getlength(text[:i]) + track * i - left + 2, -top + 2), ch, font=font, fill=ink + (255,))
    return out.crop(out.getchannel("A").getbbox())


def lockup(mark, ink, height):
    """The mark, and the word beside it at about half its height."""
    m = sized(mark, height)
    w = word(round(height * 0.42), ink)
    gap = round(height * 0.28)
    out = Image.new("RGBA", (m.width + gap + w.width, height), (0, 0, 0, 0))
    out.alpha_composite(m, (0, 0))
    out.alpha_composite(w, (m.width + gap, (height - w.height) // 2))
    return out


def paper(width, height, margin_at=None):
    """The notebook's page: the paper, faint ruling, and the rose margin when asked."""
    page = Image.new("RGBA", (width, height), PAPER + (255,))
    lines = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(lines)
    gap = max(12, round(min(width, height) / 30))
    stroke = max(1, round(gap / 32))
    for y in range(gap, height, gap):
        draw.rectangle((0, y - stroke, width, y - 1), fill=RULE)
    if margin_at is not None:
        x, w = round(width * margin_at), max(1, round(gap / 24))
        draw.rectangle((x, 0, x + w - 1, height), fill=MARGIN)
        draw.rectangle((x + 2 * w, 0, x + 3 * w - 1, height), fill=MARGIN)
    page.alpha_composite(lines)
    return page


def centred(page, piece, cy=None):
    cy = page.height // 2 if cy is None else cy
    page.alpha_composite(piece, ((page.width - piece.width) // 2, cy - piece.height // 2))
    return page


def stacked(width, height, mark_share):
    """Box and poster art: the mark, the word under it, on the page."""
    page = paper(width, height, margin_at=0.1)
    m = sized(MARK, round(min(width, height) * mark_share))
    w = word(round(m.height * 0.16), INK)
    gap = round(m.height * 0.2)
    top = (height - (m.height + gap + w.height)) // 2
    page.alpha_composite(m, ((width - m.width) // 2, top))
    page.alpha_composite(w, ((width - w.width) // 2, top + m.height + gap))
    return page.convert("RGB")


# What this wrote last time, so a renamed file does not linger; README.md stays.
for folder, _, files in os.walk(OUT):
    for name in files:
        if name.endswith((".png", ".ico")):
            os.remove(os.path.join(folder, name))

# The mark alone.
save(square(MARK, 1024, 0.9), f"{OUT}/mark/caulder-mark.png")
save(square(MARK_DARK, 1024, 0.9), f"{OUT}/mark/caulder-mark-for-dark.png")

# The app icon: every size, and one .ico holding the small ones. At 24 pixels
# and under every pixel of height is the mark, as in the tray.
icons = {size: square(MARK, size, 1.0 if size <= 24 else 0.9) for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024)}
for size, img in icons.items():
    save(img, f"{OUT}/icon/icon-{size}.png")
ico = [icons[s] for s in (16, 24, 32, 48, 64, 128)]
icons[256].save(f"{OUT}/icon/caulder.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)], append_images=ico)
print(f"{OUT}/icon/caulder.ico")

# The mark and the word.
save(lockup(MARK, INK, 400), f"{OUT}/lockup/caulder-lockup.png")
save(lockup(MARK_DARK, INK_DARK, 400), f"{OUT}/lockup/caulder-lockup-for-dark.png")

# Partner Center > Store listing > Store logos. The three squares on
# transparency, and the same on the paper for anywhere that wants a ground.
for size in (300, 150, 71):
    fill = 0.86 if size == 71 else 0.8
    save(square(MARK, size, fill), f"{OUT}/store/store-logo-{size}x{size}.png")
    save(square(MARK, size, fill, PAPER).convert("RGB"), f"{OUT}/store/store-logo-{size}x{size}-paper.png")

# Box art (1:1) and poster art (9:16): the mark and the name on the page.
for size in (1080, 2160):
    save(stacked(size, size, 0.42), f"{OUT}/store/box-art-{size}x{size}.png")
for w, h in ((720, 1080), (1440, 2160)):
    save(stacked(w, h, 0.5), f"{OUT}/store/poster-art-{w}x{h}.png")

# Hero art (16:9): no words - the Store sets the name over it - and the mark
# kept out of the lower third, where it does.
for w, h in ((1920, 1080), (3840, 2160)):
    page = paper(w, h, margin_at=0.08)
    save(centred(page, sized(MARK, round(h * 0.4)), round(h * 0.4)).convert("RGB"), f"{OUT}/store/hero-art-{w}x{h}.png")

# Link previews: README and GitHub (Settings > Social preview).
for w, h, name in ((1200, 630, "link-preview-1200x630"), (1280, 640, "github-social-1280x640")):
    page = paper(w, h, margin_at=0.07)
    save(centred(page, lockup(MARK, INK, round(h * 0.3))).convert("RGB"), f"{OUT}/social/{name}.png")
