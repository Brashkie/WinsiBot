import base64
import io
from PIL import Image, ImageDraw

# ─── Efectos de imagen genéricos basados en Pillow puro ───────────────────────
# Reimplementado en vez de usar el paquete `legofy` (PyPI): abandonado desde
# 2015, usa Image.ANTIALIAS que Pillow eliminó en la 10.x — crashea con
# cualquier instalación moderna. El efecto en sí (achicar → cuantizar a paleta
# fija → escalar en bloques → "studs") es simple de reproducir directo.

# Paleta aproximada de colores clásicos de fichas LEGO (RGB)
_LEGO_PALETTE = [
    (196,  40,  27),   # rojo brillante
    (245, 205,  47),   # amarillo brillante
    ( 13, 105, 171),   # azul brillante
    ( 75, 151,  74),   # verde brillante
    ( 35, 120,  65),   # verde oscuro
    (  5,   5,   5),   # negro
    (244, 244, 244),   # blanco
    (218, 133,  65),   # naranja medio
    (105,  64,  39),   # marrón rojizo
    (156, 156, 156),   # gris piedra medio
    ( 99,  95,  82),   # gris piedra oscuro
    (144,  31, 118),   # púrpura brillante
    (216, 191, 145),   # arena/tan
    (105, 191, 233),   # azul cielo
]

_MAX_INPUT_SIDE  = 1024   # redimensiona la entrada si es más grande (performance + tamaño de salida)
_MIN_BRICK       = 8
_MAX_BRICK       = 48
_DEFAULT_BRICK   = 20

def _shade(color: tuple, factor: float) -> tuple:
    """factor > 0 aclara hacia blanco, factor < 0 oscurece hacia negro."""
    r, g, b = color
    if factor >= 0:
        r = r + (255 - r) * factor
        g = g + (255 - g) * factor
        b = b + (255 - b) * factor
    else:
        r = r * (1 + factor)
        g = g * (1 + factor)
        b = b * (1 + factor)
    return (
        max(0, min(255, int(r))),
        max(0, min(255, int(g))),
        max(0, min(255, int(b))),
    )

def legofy_image(image_b64: str, brick_size: int = _DEFAULT_BRICK) -> dict:
    """Convierte una imagen en un mosaico estilo LEGO."""
    try:
        import numpy as np

        brick_size = max(_MIN_BRICK, min(_MAX_BRICK, int(brick_size)))

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')
        orig_w, orig_h = image.size

        # limitar tamaño de entrada — más rápido y salida más liviana
        if max(orig_w, orig_h) > _MAX_INPUT_SIDE:
            ratio = _MAX_INPUT_SIDE / max(orig_w, orig_h)
            image = image.resize((max(1, int(orig_w * ratio)), max(1, int(orig_h * ratio))), Image.LANCZOS)

        w, h = image.size
        bricks_w = max(1, w // brick_size)
        bricks_h = max(1, h // brick_size)

        # un color promedio por "ficha" — reducir a la grilla de bricks
        small = image.resize((bricks_w, bricks_h), Image.BOX)

        # cuantizar cada celda al color más cercano de la paleta LEGO (vectorizado)
        arr     = np.array(small).astype(np.int16)                    # (bricks_h, bricks_w, 3)
        palette = np.array(_LEGO_PALETTE, dtype=np.int16)             # (k, 3)
        diffs   = arr[:, :, None, :] - palette[None, None, :, :]
        dists   = np.sum(diffs * diffs, axis=-1)
        idx     = np.argmin(dists, axis=-1)                           # (bricks_h, bricks_w)
        quantized = palette[idx].astype(np.uint8)

        # escalar en bloques (NEAREST — sin suavizado, look pixelado)
        out_w, out_h = bricks_w * brick_size, bricks_h * brick_size
        mosaic = Image.fromarray(quantized, 'RGB').resize((out_w, out_h), Image.NEAREST)

        # dibujar "studs" — un círculo por ficha para vender el efecto LEGO
        draw   = ImageDraw.Draw(mosaic)
        radius = max(2, int(brick_size * 0.32))
        for by in range(bricks_h):
            for bx in range(bricks_w):
                color = tuple(int(c) for c in quantized[by, bx])
                cx = bx * brick_size + brick_size // 2
                cy = by * brick_size + brick_size // 2
                draw.ellipse(
                    [cx - radius, cy - radius, cx + radius, cy + radius],
                    fill=_shade(color, 0.25),
                    outline=_shade(color, -0.25),
                )

        out_buf = io.BytesIO()
        mosaic.save(out_buf, format='PNG')
        out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return {
            'success':    True,
            'image':      out_b64,
            'format':     'png',
            'brick_size': brick_size,
            'original':   { 'w': orig_w, 'h': orig_h },
            'bricks':     { 'w': bricks_w, 'h': bricks_h },
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }
