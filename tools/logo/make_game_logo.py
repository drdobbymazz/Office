#!/usr/bin/env python3
"""The game's title logo: the Munder Difflin plate from docs/logo.png as pixel art.

The lettering is the original's, reduced to 128 px wide and snapped to two colours; the old
"MULTI-AGENT HARNESS" tagline is gone, "INC." and the comma are redrawn by hand so they stay
crisp, and "THE LIVING OFFICE" is set in a 3x5 pixel font underneath. Shown at an integer scale
with image-rendering: pixelated.

    python3 tools/logo/make_game_logo.py   (writes src/renderer/src/assets/logo/game-logo.png)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs' / 'logo.png'
OUT = ROOT / 'src' / 'renderer' / 'src' / 'assets' / 'logo' / 'game-logo.png'

MAROON = (110, 20, 35)
CREAM = (244, 241, 234)
DARK = (74, 13, 23)

W = 128          # lettering width in art pixels
BORDER = 2       # dark frame around the plate

# 3x5 pixel font for the tagline (N is 4 wide so it does not read as H).
FONT = {
    'T': ['###', '.#.', '.#.', '.#.', '.#.'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'E': ['###', '#..', '##.', '#..', '###'],
    'L': ['#..', '#..', '#..', '#..', '###'],
    'I': ['###', '.#.', '.#.', '.#.', '###'],
    'V': ['#.#', '#.#', '#.#', '#.#', '.#.'],
    'N': ['#..#', '##.#', '#.##', '#..#', '#..#'],
    'G': ['.##', '#..', '#.#', '#.#', '.##'],
    'O': ['.#.', '#.#', '#.#', '#.#', '.#.'],
    'F': ['###', '#..', '##.', '#..', '#..'],
    'C': ['.##', '#..', '#..', '#..', '.##'],
    '.': ['.', '.', '.', '.', '#'],
}


def text_bitmap(text: str, track: int, word: int) -> list[str]:
    rows = [''] * 5
    for i, ch in enumerate(text):
        if ch == ' ':
            for r in range(5):
                rows[r] += '.' * word
            continue
        g = FONT[ch]
        for r in range(5):
            rows[r] += g[r]
        nxt = text[i + 1] if i + 1 < len(text) else ' '
        if nxt != ' ':
            for r in range(5):
                rows[r] += '.' * track
    return rows


def main() -> None:
    src = Image.open(SRC).convert('L')
    sw, sh = src.size
    # The lettering only: inside the frame and above the old tagline.
    letters = src.crop((10, 10, sw - 10, 660))
    lh = round(letters.size[1] * W / letters.size[0])
    small = letters.resize((W, lh), Image.BOX)
    mask = [[small.getpixel((x, y)) > 128 for x in range(W)] for y in range(lh)]

    # Clear the blurry comma and INC., then redraw them.
    for y in range(40, lh):
        for x in range(101, W):
            mask[y][x] = False
    comma = [(r, c) for r in range(54, 61) for c in range(103, 109)]
    comma += [(61, c) for c in range(104, 109)] + [(62, c) for c in range(104, 108)] + [(63, c) for c in range(103, 106)]
    for r, c in comma:
        mask[r][c] = True
    inc = text_bitmap('INC.', 1, 0)          # 5 rows x 14 columns, reading left to right
    iw = len(inc[0])
    for y in range(5):
        for x in range(iw):
            if inc[y][x] == '#':
                # Turned a quarter left, so it reads upwards beside the comma, as on the real plate.
                mask[60 - x][111 + y] = True

    tag = text_bitmap('THE LIVING OFFICE', 2, 5)
    tw = len(tag[0])
    tag_top = lh + 4
    height = tag_top + 5 + 7

    img = Image.new('RGB', (W + BORDER * 2, height + BORDER * 2), DARK)
    inner = Image.new('RGB', (W, height), MAROON)
    for y in range(lh):
        for x in range(W):
            if mask[y][x]:
                inner.putpixel((x, y), CREAM)
    x0 = (W - tw) // 2
    for y in range(5):
        for x in range(tw):
            if tag[y][x] == '#':
                inner.putpixel((x0 + x, tag_top + y), CREAM)
    img.paste(inner, (BORDER, BORDER))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f'wrote {OUT} {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
