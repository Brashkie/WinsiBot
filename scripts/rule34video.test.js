// El parseo de rule34video (src/lib/rule34video.ts), sin red: el HTML imita la
// estructura que lee el scraper. Hasta la 9.0 lo leía cheerio; la salida
// tiene que ser la misma que daba él con este HTML.
import { describe, expect, it, vi } from 'vitest'

// rule34video.ts solo toma de @config el User-Agent, y vitest no resuelve los
// alias del tsconfig.
vi.mock('@config', () => ({ USER_AGENT: 'test' }))

import { parseDetails, parseSearch } from '../src/lib/rule34video.ts'

const BUSQUEDA = `
<div class="thumbs">
  <a class="th js-open-popup" href="https://rule34video.com/video/1/uno/" title="  Uno &amp; dos  ">
    <div class="img"><img class="thumb lazy" data-original="https://img/1.jpg" src="data:,"></div>
  </a>
  <a class="th js-open-popup" href="https://rule34video.com/video/2/sin-titulo/">
    <img class="thumb" data-original="https://img/2.jpg">
  </a>
  <a class="th js-open-popup other" href="https://rule34video.com/video/3/tres/" title="Tres">
    <span>sin miniatura</span>
  </a>
  <a class="th" href="https://rule34video.com/video/4/no-es-popup/" title="Cuatro"></a>
  <p>sin cerrar
</div>`

const VIDEO = `<!doctype html><html><head><title>  Título de la pestaña </title></head><body>
<h1 class="title_video">
  El título &quot;real&quot;
</h1>
<div class="info row">
  <div class="item_info"><svg><use href="#cal"></use></svg><span>2 days ago</span></div>
  <div class="item_info"><svg><use href="#eye"></use></svg><span> 1.2K </span></div>
  <div class="item_info"><svg><use href="#clock"></use></svg><span>12:34</span></div>
</div>
<div class="row">
  <div class="col" data-suggest-type="model">
    <div class="label">Artist</div>
    <a class="video_meta_pill" href="#"><img src="a.jpg"><span class="name">La Artista</span></a>
    <a class="video_meta_pill" href="#"><span class="name">Otra</span></a>
  </div>
  <div class="col">
    <div class="label"> Uploaded by </div>
    <a class="video_meta_pill" href="#"> <span>quien_sube</span> </a>
  </div>
  <div class="col" data-suggest-type="category">
    <div class="label">Categories</div>
    <a class="video_meta_pill" href="#"><span>Uno</span></a>
    <a class="video_meta_pill" href="#"><span>  </span></a>
    <a class="video_meta_pill" href="#"><span>Dos <b>y medio</b></span></a>
  </div>
</div>
<script>var flashvars = {
  video_url: 'https://cdn/v_720.mp4', video_url_text: '720p',
  video_alt_url: 'https://cdn/v_480.mp4', video_alt_url_text: '480p',
};</script>
</body></html>`

describe('rule34video', () => {
  it('la búsqueda: solo los popups con título, miniatura si la hay', async () => {
    expect(await parseSearch(BUSQUEDA)).toEqual([
      {
        title: 'Uno & dos',
        pageUrl: 'https://rule34video.com/video/1/uno/',
        thumbnail: 'https://img/1.jpg',
      },
      { title: 'Tres', pageUrl: 'https://rule34video.com/video/3/tres/', thumbnail: undefined },
    ])
  })

  it('la página del video: metadata y la URL en la calidad preferida', async () => {
    expect(await parseDetails(VIDEO, 'https://x/v/')).toEqual({
      title: 'El título "real"',
      pageUrl: 'https://x/v/',
      videoUrl: 'https://cdn/v_480.mp4',
      uploadedAt: '2 days ago',
      views: '1.2K',
      duration: '12:34',
      artist: 'La Artista',
      uploader: 'quien_sube',
      categories: ['Uno', 'Dos y medio'],
    })
  })

  it('sin h1 usa el <title>; sin ninguno, null', async () => {
    const d = await parseDetails(
      '<html><head><title> Solo pestaña </title></head><body></body></html>',
      'u',
    )
    expect(d?.title).toBe('Solo pestaña')
    expect(d?.categories).toEqual([])
    expect(d?.videoUrl).toBeNull()
    expect(await parseDetails('<html><body><p>nada</p></body></html>', 'u')).toBeNull()
  })
})
