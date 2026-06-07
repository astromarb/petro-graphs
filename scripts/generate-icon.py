"""
Generates the Petro Graphs app icon (1024x1024 RGBA PNG).
Design: XPL thin-section viewport — four birefringence-color quadrants,
crossed-polarizer lines, dark center dot, white circular border.
"""
from PIL import Image, ImageDraw

SIZE = 1024
cx, cy = SIZE // 2, SIZE // 2
R = SIZE // 2 - 24      # outer radius
R_CENTER = 170          # center circle radius
LW = 20                 # cross-line width
BW = 22                 # outer border width

# Circular mask (clips all content to the circle)
mask = Image.new('L', (SIZE, SIZE), 0)
ImageDraw.Draw(mask).ellipse([cx-R, cy-R, cx+R, cy+R], fill=255)

# ── Draw content on an opaque RGB canvas ──────────────────────────────────
content = Image.new('RGB', (SIZE, SIZE), (18, 18, 38))
d = ImageDraw.Draw(content)

# Four quadrants — XPL interference colors
d.pieslice([cx-R, cy-R, cx+R, cy+R], 182, 268, fill=(52, 94, 185))   # cobalt blue
d.pieslice([cx-R, cy-R, cx+R, cy+R], 272, 358, fill=(205, 158, 34))  # amber gold
d.pieslice([cx-R, cy-R, cx+R, cy+R],   2,  88, fill=(168, 36, 54))   # crimson red
d.pieslice([cx-R, cy-R, cx+R, cy+R],  92, 178, fill=(34, 128, 104))  # teal green

# Crossed-polarizer lines (white)
d.rectangle([cx - LW//2, 0, cx + LW//2, SIZE], fill=(235, 235, 235))
d.rectangle([0, cy - LW//2, SIZE, cy + LW//2], fill=(235, 235, 235))

# Center dark circle (re-covers cross intersection)
d.ellipse([cx-R_CENTER, cy-R_CENTER, cx+R_CENTER, cy+R_CENTER],
          fill=(18, 18, 38))
d.ellipse([cx-R_CENTER, cy-R_CENTER, cx+R_CENTER, cy+R_CENTER],
          outline=(235, 235, 235), width=8)

# ── Composite with circular mask ──────────────────────────────────────────
content_rgba = content.convert('RGBA')
content_rgba.putalpha(mask)

final = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
final.paste(content_rgba, mask=content_rgba.split()[3])

# Outer border drawn on top
ImageDraw.Draw(final).ellipse(
    [cx-R, cy-R, cx+R, cy+R],
    outline=(235, 235, 235, 255), width=BW,
)

final.save('icon-source.png')
print("icon-source.png written — run: npx tauri icon icon-source.png")
