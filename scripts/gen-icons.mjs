// Renders the app icon SVG into the PNG sizes the PWA manifest and iOS need.
import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public', 'icons')
await mkdir(out, { recursive: true })
const svg = await readFile(join(here, 'icon.svg'))

// maskable: shrink the artwork into the 80% safe zone on the same background
const inner = await sharp(svg).resize(410, 410).png().toBuffer()
const maskable = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#060a13' } })
  .composite([{ input: inner, left: 51, top: 51 }])
  .png()
  .toBuffer()

await Promise.all([
  sharp(svg).resize(192, 192).png().toFile(join(out, 'icon-192.png')),
  sharp(svg).resize(512, 512).png().toFile(join(out, 'icon-512.png')),
  sharp(svg).resize(180, 180).flatten({ background: '#060a13' }).png().toFile(join(out, 'apple-touch-icon.png')),
  writeFile(join(out, 'icon-maskable-512.png'), maskable),
  writeFile(join(out, 'favicon.svg'), svg),
])
console.log('icons written to', out)
