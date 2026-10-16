"""Steam Workshop preview images: dist/workshop_square.jpg (main thumbnail) and dist/workshop_wide.jpg (gallery).

usage: workshop_art.py <addon_out>   (needs the sky from the build)
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import title

OUT = sys.argv[1]
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
SKY = os.path.join(OUT, 'materials/fdm/sky/sky_color.png')

def shade(img, top, top_h, bottom, bottom_h, vignette=0.35):
    a = np.array(img.convert('RGB')).astype(np.float32)
    H, W = a.shape[:2]
    y = np.arange(H)[:, None]
    k = np.ones((H, 1), np.float32)
    k -= top * np.clip(1 - y / (H * top_h), 0, 1)
    k -= bottom * np.clip((y - H * (1 - bottom_h)) / (H * bottom_h), 0, 1)
    yy, xx = np.mgrid[0:H, 0:W]
    v = 1 - vignette * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 2
    a *= np.clip(k, 0, 1)[..., None] * v[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert('RGBA')

def centred(base, im, y):
    base.alpha_composite(im, ((base.width - im.width) // 2, y))

def save(img, name):
    os.makedirs(DIST, exist_ok=True)
    p = os.path.join(DIST, name)
    for q in (92, 88, 84, 80):
        img.convert('RGB').save(p, quality=q, optimize=True)
        if os.path.getsize(p) < 1000000: break
    print(name, img.size, '%d KB' % (os.path.getsize(p) // 1024))

# square thumbnail
sq = shade(title.scene('square', SKY), 0.55, 0.45, 0.55, 0.25)
lg = title.logo(900)
centred(sq, lg, 40)
centred(sq, title.styled('DEATHMATCH FOR COUNTER-STRIKE 2', 46, 2, stops=title.WHITE), 40 + lg.height + 4)
centred(sq, title.styled('32 LEVELS  -  UP TO 64 PLAYERS', 40, 3, stops=title.WHITE), sq.height - 110)
save(sq, 'workshop_square.jpg')

# wide gallery image
wd = shade(title.scene('wide', SKY), 0.55, 0.45, 0.6, 0.22)
lg = title.logo(980)
centred(wd, lg, 34)
centred(wd, title.styled('DEATHMATCH FOR COUNTER-STRIKE 2', 52, 2, stops=title.WHITE), 34 + lg.height + 4)
centred(wd, title.styled('32 LEVELS  -  4 MODES  -  UP TO 64 PLAYERS', 42, 3, stops=title.WHITE), wd.height - 150)
centred(wd, title.styled('UNOFFICIAL. USES FREEDOOM CONTENT UNDER ITS BSD LICENCE; NOT ENDORSED BY THE FREEDOOM PROJECT.', 20, 1, stops=title.WHITE, shadow=2), wd.height - 58)
save(wd, 'workshop_wide.jpg')
