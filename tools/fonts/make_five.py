#!/usr/bin/env python3
# Usage (needs fonttools and brotli: pip install fonttools brotli):
#   python3 tools/fonts/make_five.py 400 500 700
# Run from the repo root after npm install (it reads the @fontsource files in node_modules).
# Rebuild Pixelify Sans's "5" so it no longer reads as "S": keep the S-shaped lower half (which is a
# proper 5's lower half), and give it a flat full-width top bar and a straight left stroke down to the
# middle bar. Writes a one-glyph woff2 per weight for a unicode-range override.
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset

SRC = '/home/user/Office/node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-{w}-normal.woff2'
OUT = '/home/user/Office/src/renderer/src/assets/fonts/pixelify-five-{w}.woff2'

for w in sys.argv[1:]:
    f = TTFont(SRC.format(w=w))
    glyf = f['glyf']
    S = list(glyf['S'].getCoordinates(glyf)[0])
    assert len(S) == 28, (w, len(S))
    # Structural checks: these indices are the corners the new 5 is built from.
    assert S[7][0] == S[6][0] and S[10][0] == S[2][0] and S[13][1] == S[14][1] and S[16][0] == S[17][0]
    assert S[19][1] == S[20][1] and S[21][1] == S[22][1]
    left, top, right = S[10][0], S[13][1], S[16][0]
    pts = S[0:8] + [(left, S[7][1]), (left, top), (right, top), (right, S[19][1])] + S[20:28]
    pen = TTGlyphPen(None)
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()
    g = pen.glyph()
    g.recalcBounds(glyf)
    glyf['five'] = g
    # keep the advance width; left side bearing follows the new bounds
    adv, _ = f['hmtx']['five']
    f['hmtx']['five'] = (adv, g.xMin)
    print(w, 'five pts', pts)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[0x35])
    sub.subset(f)
    f.flavor = 'woff2'
    f.save(OUT.format(w=w))
