import base64
import io
from PIL import Image

# ─── Restaurar/mejorar imagen con NAFNet ──────────────────────────────────────
def restore_image(image_b64: str, method: str = 'nafnet') -> dict:
    """
    Mejora la calidad de una imagen usando NAFNet o SCUNet
    method: 'nafnet' | 'scunet'
    """
    try:
        from imgutils.restore import restore_with_nafnet, restore_with_scunet

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')

        if method == 'scunet':
            result = restore_with_scunet(image)
        else:
            result = restore_with_nafnet(image)

        out_buf = io.BytesIO()
        result.save(out_buf, format='PNG')
        out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return { 'success': True, 'image': out_b64, 'format': 'png', 'method': method }

    except Exception as e:
        return { 'success': False, 'error': str(e) }

# ─── Eliminar ruido adversarial ───────────────────────────────────────────────
def remove_noise(image_b64: str) -> dict:
    try:
        from imgutils.restore import remove_adversarial_noise

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')
        result     = remove_adversarial_noise(image)

        out_buf = io.BytesIO()
        result.save(out_buf, format='PNG')
        out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return { 'success': True, 'image': out_b64, 'format': 'png' }

    except Exception as e:
        return { 'success': False, 'error': str(e) }

# ─── Obtener tags de imagen anime ─────────────────────────────────────────────
def get_anime_tags(image_b64: str) -> dict:
    try:
        from imgutils.tagging import get_wd14_tags

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')
        rating, features, chars = get_wd14_tags(image)

        return {
            'success':  True,
            'rating':   rating,
            'features': dict(list(features.items())[:10]),
            'chars':    chars,
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }

# ─── Detectar si imagen es anime ─────────────────────────────────────────────
def detect_anime(image_b64: str) -> dict:
    try:
        from imgutils.validate import anime_classify

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')
        result     = anime_classify(image)

        return {
            'success':  True,
            'is_anime': result.get('anime', 0) > 0.5,
            'scores':   result,
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }


# ─── Recortar personaje del fondo ─────────────────────────────────────────────
def remove_background(image_b64: str, bg_color: str = 'transparent') -> dict:
    try:
        from imgutils.segment import segment_rgba_with_isnetis

        image_data    = base64.b64decode(image_b64)
        image         = Image.open(io.BytesIO(image_data)).convert('RGBA')

        _, result = segment_rgba_with_isnetis(image)

        # si bg_color es white — pegar sobre fondo blanco
        if bg_color == 'white':
            background = Image.new('RGBA', result.size, (255, 255, 255, 255))
            background.paste(result, mask=result.split()[3])
            final = background.convert('RGB')
            fmt   = 'JPEG'
        else:
            final = result
            fmt   = 'PNG'

        out_buf = io.BytesIO()
        final.save(out_buf, format=fmt)
        out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return {
            'success': True,
            'image':   out_b64,
            'format':  fmt.lower(),
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }


# ─── Obtener tags de imagen anime ─────────────────────────────────────────────
def get_anime_tags(image_b64: str) -> dict:
    """
    Obtiene tags/caracteristicas de una imagen anime
    """
    try:
        from imgutils.tagging import get_wd14_tags

        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')

        rating, features, chars = get_wd14_tags(image)

        return {
            'success':  True,
            'rating':   rating,
            'features': dict(list(features.items())[:10]),
            'chars':    chars,
        }

    except ImportError as e:
        return { 'success': False, 'error': f'Modulo no disponible: {e}' }
    except Exception as e:
        return { 'success': False, 'error': str(e) }
    
    
# ─── Upscale con Anime4K ──────────────────────────────────────────────────────
def anime4k_upscale(image_b64: str, scale: int = 2) -> dict:
    """
    Upscalea imagen a estilo anime usando Anime4K
    scale: 2 o 4
    """
    try:
        import pyanime4k
        import numpy as np
        from PIL import Image
        import tempfile
        import os

        # decodificar imagen
        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')

        # guardar en tmp para que pyanime4k pueda leerla
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_in:
            image.save(tmp_in.name)
            tmp_in_path = tmp_in.name

        tmp_out_path = tmp_in_path.replace('.png', '_out.png')

        try:
            # upscale con anime4k
            pyanime4k.upscale(
                input_path  = tmp_in_path,
                output_path = tmp_out_path,
                scale       = scale,
            )

            # leer resultado
            result = Image.open(tmp_out_path)
            out_buf = io.BytesIO()
            result.save(out_buf, format='PNG')
            out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

            orig_w, orig_h   = image.size
            result_w, result_h = result.size

            return {
                'success':     True,
                'image':       out_b64,
                'format':      'png',
                'scale':       scale,
                'original':    { 'w': orig_w,   'h': orig_h },
                'result':      { 'w': result_w, 'h': result_h },
            }
        finally:
            # limpiar tmp
            if os.path.exists(tmp_in_path):  os.unlink(tmp_in_path)
            if os.path.exists(tmp_out_path): os.unlink(tmp_out_path)

    except Exception as e:
        return { 'success': False, 'error': str(e) }