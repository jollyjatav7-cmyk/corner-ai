"""Draw the app icons: a corner arc and flag on night-pitch green, with a small rising bar chart.
Usage: python3 -I make_icons.py <out_dir>
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
GRASS, GRASS2, CHALK, FLAG = (16, 44, 33), (21, 56, 42), (236, 242, 237), (242, 182, 50)


def icon(size):
    S = 4 * size
    im = Image.new('RGB', (S, S), GRASS)
    d = ImageDraw.Draw(im)
    # mowing stripes
    for k in range(0, 6, 2):
        d.rectangle([0, int(S * k / 6), S, int(S * (k + 1) / 6)], fill=GRASS2)
    w = max(6, S // 40)
    # touchline + goal line meeting at the bottom-left corner, and the corner arc
    m = int(S * 0.14)
    d.line([(m, int(S * 0.30)), (m, S - m)], fill=CHALK, width=w)
    d.line([(m, S - m), (int(S * 0.70), S - m)], fill=CHALK, width=w)
    r = int(S * 0.13)
    d.arc([m - r, S - m - r, m + r, S - m + r], start=270, end=360, fill=CHALK, width=w)
    # corner flag
    fx, fy = m, int(S * 0.36)
    d.line([(fx, fy), (fx, S - m)], fill=CHALK, width=w)
    fw, fh = int(S * 0.20), int(S * 0.13)
    d.polygon([(fx + w // 2, fy), (fx + w // 2 + fw, fy + fh // 2), (fx + w // 2, fy + fh)], fill=FLAG)
    # rising bars (the prediction)
    bw, gap = int(S * 0.085), int(S * 0.04)
    x0 = int(S * 0.47)
    base = S - m - int(S * 0.07)
    for k, h in enumerate([0.16, 0.27, 0.40]):
        x = x0 + k * (bw + gap)
        d.rounded_rectangle([x, base - int(S * h), x + bw, base], radius=int(S * 0.02), fill=FLAG if k == 2 else CHALK)
    return im.resize((size, size), Image.LANCZOS)


for n in (180, 192, 512):
    icon(n).save(f'{OUT}/icon-{n}.png', optimize=True)
print('ok')
