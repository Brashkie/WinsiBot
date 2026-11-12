// Baja el modelo de imágenes de #imagine: SD-Turbo y TAESD, a la carpeta de
// modelos de Cosxamix (data/cosxamix/modelos). ~2,6 GB, una sola vez.
//
//   npm run modelo:imagen
//
// SD-Turbo es de Stability AI, bajo su Community License: gratis para uso no
// comercial; pide mostrar "Powered by Stability AI" (#imagine lo pone en cada
// imagen), seguir su política de uso y no usar lo que genera para entrenar
// otro modelo generativo. La licencia se baja junto al modelo (LICENSE.md).
// TAESD es MIT.
//
// Cada archivo va a un .parcial y se renombra al terminar: uno cortado no queda
// pasando por bueno. Lo que ya está entero no se vuelve a bajar.

import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const DESTINO = join(process.cwd(), 'data', 'cosxamix', 'modelos')
const SD = 'https://huggingface.co/stabilityai/sd-turbo/resolve/main'
const TAESD = 'https://huggingface.co/madebyollin/taesd/resolve/main'

const ARCHIVOS = [
  [`${SD}/LICENSE.md`, 'sd-turbo/LICENSE.md'],
  [`${SD}/tokenizer/vocab.json`, 'sd-turbo/tokenizer/vocab.json'],
  [`${SD}/tokenizer/merges.txt`, 'sd-turbo/tokenizer/merges.txt'],
  [`${SD}/text_encoder/model.fp16.safetensors`, 'sd-turbo/text_encoder/model.fp16.safetensors'],
  [`${SD}/unet/diffusion_pytorch_model.fp16.safetensors`, 'sd-turbo/unet/diffusion_pytorch_model.fp16.safetensors'],
  [`${TAESD}/taesd_decoder.safetensors`, 'taesd/taesd_decoder.safetensors'],
]

async function bajar(url, ruta) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} al bajar ${url}`)
  const total = Number(r.headers.get('content-length') ?? 0)
  if (existsSync(ruta) && total && statSync(ruta).size === total) {
    await r.body.cancel()
    console.log(`  ya está  ${ruta}`)
    return
  }
  mkdirSync(dirname(ruta), { recursive: true })
  const parcial = `${ruta}.parcial`
  await pipeline(Readable.fromWeb(r.body), createWriteStream(parcial))
  if (total && statSync(parcial).size !== total) throw new Error(`${ruta}: llegó cortado`)
  renameSync(parcial, ruta)
  console.log(`  listo    ${ruta} (${(statSync(ruta).size / 1e6).toFixed(0)} MB)`)
}

console.log('SD-Turbo (Stability AI Community License: uso no comercial gratis, "Powered by Stability AI")')
console.log('y TAESD (MIT), ~2,6 GB, en', DESTINO)
for (const [url, rel] of ARCHIVOS) await bajar(url, join(DESTINO, rel))
console.log('Listo: #imagine crea imágenes en esta máquina cuando Cosxamix tenga /api/image (0.10.0 o más).')
