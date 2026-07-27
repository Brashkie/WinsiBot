// stickerVault.ts — Favoritos personales de stickers (#savesticker / #stickers / #delsticker)
//
// Los .webp se guardan en disco (data/stickers/<sender>/<id>.webp), NO en
// UserData — ese objeto se serializa entero a users.json cada 30s
// (persistence.ts), y meter binarios ahí lo haría cada vez más pesado de
// leer/escribir con cada usuario que guarde stickers. UserData solo guarda
// metadata liviana (id, nombre, fecha) — ver SavedSticker en events/index.ts.

import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const VAULT_DIR = join(process.cwd(), 'data', 'stickers')

// El jid puede traer @s.whatsapp.net/@lid — se sanitiza para que sirva como
// nombre de carpeta válido en cualquier sistema de archivos.
function userDir(sender: string): string {
  return join(VAULT_DIR, sender.replace(/[^a-zA-Z0-9]/g, '_'))
}

export async function saveStickerFile(sender: string, buffer: Buffer): Promise<{ id: string; path: string }> {
  const dir = userDir(sender)
  await mkdir(dir, { recursive: true })
  const id   = randomUUID()
  const path = join(dir, `${id}.webp`)
  await writeFile(path, buffer)
  return { id, path }
}

export async function readStickerFile(path: string): Promise<Buffer | null> {
  if (!existsSync(path)) return null
  return readFile(path)
}

export async function deleteStickerFile(path: string): Promise<void> {
  if (existsSync(path)) await unlink(path).catch(() => {})
}
