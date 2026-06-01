import base64
import io
import re
import random
import requests
from PIL import Image

# ─── Headers realistas ────────────────────────────────────────────────────────
HEADERS_BING = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/120.0.0.0 Safari/537.36',
    'Referer':    'https://www.bing.com/',
    'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

HEADERS_IMG = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/120.0.0.0 Safari/537.36',
    'Referer':    'https://www.bing.com/',
    'Accept':     'image/webp,image/apng,image/*,*/*;q=0.8',
}

# ─── Buscar imagenes ──────────────────────────────────────────────────────────
def search_images(query: str, max_results: int = 15) -> dict:
    # intentar con ddgs primero
    try:
        from ddgs import DDGS
        import time
        time.sleep(random.uniform(1, 2))

        with DDGS() as ddgs:
            results = list(ddgs.images(
                keywords   = query,
                max_results = max_results,
                safesearch  = 'moderate',
            ))

        if results:
            urls = [r['image'] for r in results if r.get('image')]
            if urls:
                return { 'success': True, 'urls': urls, 'total': len(urls), 'query': query }
    except Exception:
        pass

    # fallback — Bing scraping
    try:
        url = f'https://www.bing.com/images/search?q={requests.utils.quote(query)}&form=HDRSC2&first=1'
        res = requests.get(url, headers=HEADERS_BING, timeout=10)
        res.raise_for_status()

        urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+)&quot;', res.text)
        urls = list(dict.fromkeys(urls))[:max_results]

        if urls:
            return { 'success': True, 'urls': urls, 'total': len(urls), 'query': query }

    except Exception as e:
        return { 'success': False, 'error': str(e) }

    return { 'success': False, 'error': 'No se encontraron imagenes' }


# ─── Descargar imagen desde URL ───────────────────────────────────────────────
def download_image(url: str) -> dict:
    try:
        res = requests.get(url, headers=HEADERS_IMG, timeout=10, stream=True)
        res.raise_for_status()

        content_type = res.headers.get('content-type', '')
        if 'image' not in content_type:
            return { 'success': False, 'error': f'No es imagen: {content_type}' }

        img     = Image.open(io.BytesIO(res.content)).convert('RGB')
        out_buf = io.BytesIO()
        img.save(out_buf, format='JPEG', quality=85)
        b64     = base64.b64encode(out_buf.getvalue()).decode('utf-8')

        return {
            'success': True,
            'image':   b64,
            'format':  'jpeg',
            'width':   img.width,
            'height':  img.height,
        }

    except Exception as e:
        return { 'success': False, 'error': str(e) }


# ─── Buscar y descargar en uno ────────────────────────────────────────────────
def search_and_download(query: str) -> dict:
    search = search_images(query, max_results=15)
    if not search['success']:
        return search

    urls = search['urls']
    random.shuffle(urls)

    errors = []
    for url in urls[:5]:
        result = download_image(url)
        if result['success']:
            result['query'] = query
            result['total'] = search['total']
            return result
        errors.append(result.get('error', ''))

    return {
        'success': False,
        'error':   f'No se pudo descargar. Ultimo error: {errors[-1] if errors else "desconocido"}'
    }