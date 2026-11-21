// Preview sheet generator (opt-in): GEAR_SHEET=1 npx vitest run src/pixel/gear-sheet.test.ts
import { it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GEAR } from '../engine'
import { PixelAvatar } from './Pixel'

const OUT = '/Users/admin/Desktop/Claude/winter-arc/screenshots/gear-v8'
const NEW = new Set(process.env.GEAR_IDS ? process.env.GEAR_IDS.split(',') : GEAR.filter((g) => g.level === 1 && g.id !== 'beanie' && g.id !== 'scarf' && g.id !== 'breath').map((g) => g.id))

it.skipIf(!process.env.GEAR_SHEET)('writes preview sheets', async () => {
  const sharp = (await import('sharp')).default
  const items = GEAR.filter((g) => NEW.has(g.id))
  const colors = ['red', 'blue']
  const bgs = [['#eaf2f8', '#10171f']]
  for (const bg of bgs[0]) {
    const K = Number(process.env.GEAR_K ?? 10), cw = 21 * K, ch = 28 * K, cols = Number(process.env.GEAR_COLS ?? 6)
    const rows = Math.ceil(items.length / cols)
    let body = ''
    items.forEach((g, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch
      const col = colors[i % 2]
      const outfit: any = { hair: 'brown', skin: 'light', colors: { [g.slot]: col }, [g.slot]: g.id }
      if (g.slot === 'coat' || g.slot === 'scarf') outfit.hat = undefined
      const svg = renderToStaticMarkup(createElement(PixelAvatar, { outfit, size: 24 * K }))
      body += `<g transform="translate(${x + K},${y + K / 2})">${svg.replace('<svg ', '<svg x="0" y="0" ')}</g>`
      body += `<text x="${x + cw / 2}" y="${y + 26.7 * K}" font-size="15" text-anchor="middle" fill="${bg === '#10171f' ? '#fff' : '#111'}" font-family="Helvetica">${g.id} (${g.slot})</text>`
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`
    await sharp(Buffer.from(svg)).png().toFile(`${OUT}/sheet-${bg === '#10171f' ? 'dark' : 'light'}${process.env.GEAR_TAG ?? ''}.png`)
  }
  // real size (58px tiles as in the wardrobe), upscaled 3x nearest
  {
    const cols = 8, cw = 60, ch = 62
    const rows = Math.ceil(items.length / cols)
    let body = ''
    items.forEach((g, i) => {
      const outfit: any = { hair: 'brown', skin: 'light', colors: { [g.slot]: 'red' }, [g.slot]: g.id }
      const svg = renderToStaticMarkup(createElement(PixelAvatar, { outfit, size: 58 }))
      body += `<g transform="translate(${(i % cols) * cw + 6},${Math.floor(i / cols) * ch + 2})">${svg}</g>`
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="#eaf2f8"/>${body}</svg>`
    const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer()
    await sharp(png).resize(cols * cw * 3, rows * ch * 3, { kernel: 'nearest' }).toFile(`${OUT}/sheet-realsize-x3.png`)
  }
})
