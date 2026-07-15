import base64
import io
from PIL import Image

# ─── Convertir foto a estilo anime (AnimeGANv2) ───────────────────────────────
# Distinto de anime4k_upscale() — eso solo mejora resolución, esto sí cambia el
# estilo del dibujo. Modelo cacheado en memoria tras la primera carga (~1s con
# los pesos ya descargados, evita recargarlo en cada pedido).
_anime_model = None

def _get_anime_model():
    global _anime_model
    if _anime_model is None:
        import torch
        _anime_model = torch.hub.load(
            'bryandlee/animegan2-pytorch', 'generator',
            pretrained='face_paint_512_v2', device='cpu', trust_repo=True,
        )
        _anime_model.eval()
    return _anime_model

def image_to_anime(image_b64: str) -> dict:
    """Convierte una foto real a estilo anime (AnimeGANv2, CPU)."""
    try:
        import torch
        import numpy as np

        model      = _get_anime_model()
        image_data = base64.b64decode(image_b64)
        image      = Image.open(io.BytesIO(image_data)).convert('RGB')
        orig_w, orig_h = image.size

        with torch.no_grad():
            arr = np.array(image).astype('float32') / 255.0
            x   = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0) * 2 - 1
            out = model(x)[0]
            out = (out * 0.5 + 0.5).clamp(0, 1)
            out_arr = (out.permute(1, 2, 0).numpy() * 255).astype('uint8')
            result  = Image.fromarray(out_arr)

        out_buf = io.BytesIO()
        result.save(out_buf, format='PNG')
        out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return {
            'success':  True,
            'image':    out_b64,
            'format':   'png',
            'original': { 'w': orig_w, 'h': orig_h },
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }

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
            # upscale con anime4k — la API real es upscale_images() con listas
            # de rutas (pyanime4k.upscale es un submódulo, no una función)
            pyanime4k.upscale_images(
                inputs         = [tmp_in_path],
                outputs        = [tmp_out_path],
                factor         = float(scale),
                processor_type = 'cpu',   # sin GPU dedicada disponible
            )

            # leer resultado — cerrar el archivo explícitamente antes del
            # finally, si no Windows lo sigue bloqueando y el unlink falla
            with Image.open(tmp_out_path) as result:
                result.load()
                result_w, result_h = result.size
                out_buf = io.BytesIO()
                result.save(out_buf, format='PNG')

            out_b64        = base64.b64encode(out_buf.getvalue()).decode('utf-8')
            orig_w, orig_h = image.size

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