"""Our own title art for the loading screens and the Workshop images: "FREEDM ARENA" in Russo One (SIL Open Font
Licence, tools/fonts) with a fire gradient, outline and shadow, and the level renders in ref/art (made with
preview/view.html) with Freedoom's sky behind them. Freedoom's own FreeDM logo is not used anywhere."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts/RussoOne-Regular.ttf')
ART = os.path.join(HERE, '..', 'ref/art')
FIRE = ((255, 250, 210), (255, 196, 60), (230, 90, 20), (140, 20, 8))
WHITE = ((255, 255, 255), (225, 225, 225), (190, 190, 195))

def text_mask(text, size, tracking=0):
    f = ImageFont.truetype(FONT, size)
    W = int(sum(f.getlength(c) for c in text) + tracking * (len(text) - 1) + size)
    im = Image.new('L', (W, size * 2), 0)
    d = ImageDraw.Draw(im); x = size // 2
    for c in text:
        d.text((x, size // 4), c, font=f, fill=255); x += f.getlength(c) + tracking
    return im.crop(im.getbbox())

def styled(text, size, tracking=0, stops=FIRE, outline=None, shadow=None):
    outline = outline if outline is not None else max(2, size // 18)
    shadow = shadow if shadow is not None else max(2, size // 14)
    pad = outline + shadow * 2 + 4
    mi = Image.fromarray(np.pad(np.array(text_mask(text, size, tracking)), pad))
    m = np.array(mi).astype(np.float32) / 255
    H, W = m.shape
    ys = np.where(m.max(1) > 0.5)[0]; y0, y1 = ys[0], ys[-1]
    t = np.clip((np.arange(H) - y0) / max(1, y1 - y0), 0, 1) * (len(stops) - 1)
    i = np.minimum(t.astype(int), len(stops) - 2); fr = (t - i)[:, None]
    c = np.array(stops, np.float32); row = c[i] * (1 - fr) + c[i + 1] * fr
    fill = np.repeat(row[:, None, :], W, 1)
    blur = np.array(mi.filter(ImageFilter.GaussianBlur(max(1, outline * 0.35)))).astype(np.float32) / 255
    fill = np.clip(fill * (1 + np.clip(-np.gradient(blur, axis=0) * 6, -0.45, 0.6))[..., None], 0, 255)   # bevel
    ol = np.array(mi.filter(ImageFilter.MaxFilter(outline * 2 + 1))).astype(np.float32) / 255
    rgba = np.zeros((H, W, 4), np.float32)
    rgba[..., :3] = fill * m[..., None] + np.array((18, 6, 4), np.float32) * (1 - m[..., None])
    rgba[..., 3] = np.maximum(m, ol) * 255
    out = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    sh = Image.new('RGBA', out.size, (0, 0, 0, 0))
    sh.putalpha(out.getchannel('A').filter(ImageFilter.GaussianBlur(shadow * 0.5)).point(lambda v: int(v * 0.8)))
    canvas = Image.new('RGBA', out.size, (0, 0, 0, 0))
    canvas.alpha_composite(sh); canvas.alpha_composite(sh, (shadow // 2, shadow // 2)); canvas.alpha_composite(out)
    return canvas

def logo(width):
    """FREEDM over a tracked-out ARENA, scaled to the given width."""
    a = styled('FREEDM', 200, 6)
    b = styled('ARENA', 96, 34)
    im = Image.new('RGBA', (max(a.width, b.width), a.height + b.height - 40), (0, 0, 0, 0))
    im.alpha_composite(a, ((im.width - a.width) // 2, 0))
    im.alpha_composite(b, ((im.width - b.width) // 2, a.height - 40))
    return im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)

def scene(name, sky_path):
    """A level render (ref/art/render_<name>.png, sky drawn as magenta) with Freedoom's sky put in."""
    r = np.array(Image.open(os.path.join(ART, 'render_%s.png' % name)).convert('RGB')).astype(np.int32)
    H, W = r.shape[:2]
    sky = Image.open(sky_path).convert('RGB')
    band = sky.crop((0, int(sky.height * 0.22), sky.width // 2, sky.height // 2)).resize((W, H // 2 + 1), Image.LANCZOS)
    band = np.array(band)
    mask = (r[..., 0] > 200) & (r[..., 1] < 60) & (r[..., 2] > 200)
    out = r.copy()
    yy, xx = np.nonzero(mask)
    out[yy, xx] = band[np.minimum(yy, band.shape[0] - 1), xx]
    return Image.fromarray(out.astype(np.uint8))
