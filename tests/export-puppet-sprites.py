#!/usr/bin/env python3
"""Export 2D puppet sprites from Character Animator PSDs for the WebXR greybox.

READ-ONLY on the PSDs: exports PNGs + a manifest JSON. Re-run any time the
PSD art changes.

Output layout (under OUT_DIR):
  gary/body.png            full-body composite, Neutral mouth, <=1024px long side
  gary/mouth-atlas.png     all 14 mouths in ONE 2048x1024 atlas (4x4 grid)
  gary/manifest.json       body size + per-mouth display anchor + atlas UV rect
  marlow/...

QUEST SPEC DISCIPLINE: one atlas per character for mouths (UV-swapped per
viseme — never 14 separate textures, no per-frame texture uploads).
Manifest mouth entry: { cx, cy, w, h, uv } — cx/cy = mouth CENTER in
normalized body-image coords (0..1, top-left origin); w/h = mouth size as
fraction of body image size; uv = [u0,v0,u1,v1] atlas rect (three.js
bottom-left origin, 1px inset). three.js: mouth plane pos =
((cx-.5)*W, (.5-cy)*H), size (w*W, h*H), geometry UVs = uv rect.
"""
import json, os, sys
from psd_tools import PSDImage
from PIL import Image

PUPPETS = os.path.expanduser('~/workspace/satisfictionlabs/character-animator/puppets')
OUT_DIR = os.path.expanduser('~/workspace/goals/meta-vr-start-developer-competition-prize/hidden_files/hq-v5-greybox/public/sprites')
MAX_SIDE = 1024
PAD = 6

MOUTHS = ['Neutral', 'Ah', 'D', 'Ee', 'F', 'L', 'M', 'Oh', 'R', 'S', 'Uh', 'W-Oo', 'Smile', 'Surprised']

JOBS = [
    # (out id, psd file, photoshop-rendered preview used as alpha ground truth)
    ('gary', 'Gary-puppet.psd', 'Gary-preview.png'),
    ('marlow', 'Marlow-puppet-R8-fixed.psd', 'Marlow-preview.png'),
]

def find_mouth_group(psd):
    stack = list(psd)
    while stack:
        l = stack.pop(0)
        if l.is_group():
            if l.name == 'Mouth':
                return l
            stack = list(l) + stack
    return None

def export_char(cid, psd_file, preview_file):
    psd = PSDImage.open(os.path.join(PUPPETS, psd_file))
    mouth_group = find_mouth_group(psd)
    assert mouth_group is not None, f'no Mouth group in {psd_file}'
    mouth_layers = {l.name: l for l in mouth_group if not l.is_group()}

    out = os.path.join(OUT_DIR, cid)
    os.makedirs(out, exist_ok=True)

    # Reset mouth visibility: Neutral showing (body base state)
    for ln, l in mouth_layers.items():
        l.visible = (ln == 'Neutral')

    # 1) Body: psd-tools' own compositor for COLOR (it matches Photoshop incl.
    #    masks/blend modes; the preview PNGs confirm), then rebuild ALPHA from
    #    the white matte + the Photoshop-rendered preview (black matte).
    #    Rationale: manual per-layer stamping can't reproduce the file's
    #    masking faithfully (white wedge artifact on Marlow's arm).
    import numpy as np
    flat = psd.composite().convert('RGB')
    prev = Image.open(os.path.join(PUPPETS, preview_file)).convert('RGB').resize(flat.size, Image.LANCZOS)
    f = np.array(flat).astype(np.int16)
    p = np.array(prev).astype(np.int16)
    fmin = f.min(axis=2)
    pmax = p.max(axis=2)
    bg = (fmin > 240) & (pmax < 40)          # white matte + black preview = background
    fringe = (~bg) & (fmin > 150) & (pmax < 80)  # anti-aliased edge: recover partial alpha
    alpha = np.full(f.shape[:2], 255, dtype=np.uint8)
    alpha[bg] = 0
    alpha[fringe] = (255 - fmin[fringe]).astype(np.uint8)  # white->0, darker->more opaque
    body = flat.copy()
    body.putalpha(Image.fromarray(alpha, 'L'))
    scale = min(1.0, MAX_SIDE / max(body.width, body.height))
    if scale < 1.0:
        body = body.resize((round(body.width * scale), round(body.height * scale)), Image.LANCZOS)
    body.save(os.path.join(out, 'body.png'))
    bw, bh = body.size
    print(f'{cid}: body {bw}x{bh} (scale {scale:.3f})')

    manifest = {'body': {'file': 'body.png', 'w': bw, 'h': bh}, 'mouths': {}}

    # 2) Mouth ATLAS: all 14 mouths packed into ONE texture (Quest spec:
    #    atlas + UV swap per viseme, never 14 separate textures). 4x4 grid,
    #    cells = max mouth size (identical bounds per character), padded out
    #    to 2048x1024 POT. UV rects stored three.js-style (bottom-left origin)
    #    with a 1px inset against mip bleeding.
    # NOTE: psd-tools composites hidden layers as EMPTY — toggle visibility.
    arts = {}
    for name in MOUTHS:
        for ln, l in mouth_layers.items():
            l.visible = (ln == name)
        layer = mouth_layers.get(name)
        assert layer is not None, f'{cid}: missing mouth layer {name}'
        img = layer.composite()  # cropped to layer content
        assert img is not None and img.width > 0, f'{cid}: mouth {name} empty'
        arts[name] = (img.convert('RGBA'), layer.offset[0], layer.offset[1])
        print(f'{cid}: mouth {name:9s} {img.width}x{img.height} @({layer.offset[0]},{layer.offset[1]})')
    # restore body state
    for ln, l in mouth_layers.items():
        l.visible = (ln == 'Neutral')

    cell_w = max(a[0].width for a in arts.values())
    cell_h = max(a[0].height for a in arts.values())
    COLS, ROWS = 4, 4
    AW, AH = 2048, 1024
    assert COLS * cell_w <= AW and ROWS * cell_h <= AH, f'{cid}: mouths do not fit atlas'
    atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
    for i, name in enumerate(MOUTHS):
        img, left, top = arts[name]
        col, row = i % COLS, i // COLS
        ax, ay = col * cell_w, row * cell_h
        atlas.paste(img, (ax, ay), img)
        # display anchor (unchanged geometry math): normalized body coords
        cx_full = left + img.width / 2
        cy_full = top + img.height / 2
        canvas_w, canvas_h = psd.width, psd.height
        # UV rect, three.js bottom-left origin, 1px inset
        u0 = (ax + 1) / AW
        u1 = (ax + cell_w - 1) / AW
        v1 = 1 - (ay + 1) / AH
        v0 = 1 - (ay + cell_h - 1) / AH
        manifest['mouths'][name] = {
            'cx': round(cx_full / canvas_w, 5),
            'cy': round(cy_full / canvas_h, 5),
            'w': round(img.width / canvas_w, 5),
            'h': round(img.height / canvas_h, 5),
            'uv': [round(u0, 6), round(v0, 6), round(u1, 6), round(v1, 6)],
        }
    atlas.save(os.path.join(out, 'mouth-atlas.png'))
    manifest['mouthAtlas'] = {'file': 'mouth-atlas.png', 'w': AW, 'h': AH,
                              'cols': COLS, 'rows': ROWS, 'cellW': cell_w, 'cellH': cell_h}
    print(f'{cid}: mouth atlas {AW}x{AH}, cells {cell_w}x{cell_h} ({COLS}x{ROWS})')

    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'{cid}: manifest written, {len(manifest["mouths"])} mouths')

def main():
    for cid, psd_file, preview_file in JOBS:
        export_char(cid, psd_file, preview_file)
    print('DONE ->', OUT_DIR)

if __name__ == '__main__':
    main()
