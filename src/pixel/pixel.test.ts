import { describe, expect, it } from 'vitest'
import { SPRITES } from './sprites'
import { AV_BASE, AV_H, AV_LAYERS, AV_W } from './avatar-layers'
import { PAL } from './palette'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_OUTFIT, GEAR, OUTFIT_SLOTS, buildPublicStats, computeState, ownsGear, wornOutfit } from '../engine'
import { makeData, nowAt } from '../engine/testkit'
import { PixelAvatar } from './Pixel'
import { safeOutfit } from './outfit'

const LAYER_KEYS = new Set(['X', 'Y', 'Z', 'H', 'J', '.'])

describe('pixel art', () => {
  it('every sprite is a clean 16×16 grid of palette keys', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      expect(rows.length, name).toBe(16)
      rows.forEach((r, i) => {
        expect(r.length, `${name} row ${i}`).toBe(16)
        for (const ch of r) expect(ch === '.' || ch in PAL, `${name} row ${i} char ${ch}`).toBe(true)
      })
    }
  })
  it('avatar layers fit the 20×24 hero', () => {
    expect(AV_BASE.length).toBe(AV_H)
    for (const [name, rows] of Object.entries({ base: AV_BASE, ...AV_LAYERS })) {
      expect(rows.length, name).toBeLessThanOrEqual(AV_H)
      rows.forEach((r, i) => {
        expect(r.length, `${name} row ${i}`).toBe(AV_W)
        for (const ch of r) expect(LAYER_KEYS.has(ch) || ch in PAL, `${name} row ${i} char ${ch}`).toBe(true)
      })
    }
  })
})

describe('gear catalog', () => {
  it('every GEAR id has a pixel layer and a known slot, ids are unique', () => {
    const slots = new Set(OUTFIT_SLOTS.map((s) => s.id))
    expect(new Set(GEAR.map((g) => g.id)).size).toBe(GEAR.length)
    for (const g of GEAR) {
      expect(AV_LAYERS[g.id], `layer for ${g.id}`).toBeTruthy()
      expect(slots.has(g.slot), `slot of ${g.id}`).toBe(true)
    }
    for (const id of Object.keys(AV_LAYERS)) expect(GEAR.some((g) => g.id === id), `GEAR entry for layer ${id}`).toBe(true)
  })

  it('v8 gear: 20+ free items from level 1, at least two per slot', () => {
    const NEW = ['pompom', 'bear', 'hood', 'headband', 'antlers', 'stripescarf', 'snood', 'buff', 'hoodie', 'vest', 'skisuit', 'xmas', 'tulup', 'furmitts', 'paws', 'warmers', 'hearts', 'stars', 'monocle', 'thermos', 'tangerine', 'snowfall', 'lantern']
    expect(NEW.length).toBeGreaterThanOrEqual(16)
    for (const id of NEW) {
      const g = GEAR.find((x) => x.id === id)!
      expect(g, id).toBeTruthy()
      expect(g.level, id).toBe(1)
      expect(g.price, id).toBeUndefined()
      expect(ownsGear(g, 1, []), id).toBe(true)
    }
    for (const s of OUTFIT_SLOTS) expect(NEW.filter((id) => GEAR.find((g) => g.id === id)!.slot === s.id).length, s.id).toBeGreaterThanOrEqual(2)
  })

  it('every new item renders and survives the friend-outfit filter', () => {
    for (const g of GEAR) {
      const o = safeOutfit({ [g.slot]: g.id, colors: { [g.slot]: 'blue' } })
      expect(o[g.slot], g.id).toBe(g.id)
      expect(renderToStaticMarkup(createElement(PixelAvatar, { outfit: o, size: 48 }))).toMatch(/^<svg/)
    }
  })
})

describe('friend outfit from public stats', () => {
  it('missing outfit (old app) → default hero', () => {
    expect(safeOutfit(undefined)).toEqual(DEFAULT_OUTFIT)
    expect(safeOutfit(null)).toEqual(DEFAULT_OUTFIT)
    expect(safeOutfit('🐺')).toEqual(DEFAULT_OUTFIT)
    expect(safeOutfit([1, 2])).toEqual(DEFAULT_OUTFIT)
  })

  it('keeps a valid look as is', () => {
    const o = { hat: 'ushanka', coat: 'puffer', glasses: 'shades', colors: { hat: 'blue', coat: 'purple', glasses: 'black' }, hair: 'ginger', skin: 'deep' }
    expect(safeOutfit(o)).toEqual(o)
    // an empty slot stays empty
    expect(safeOutfit({ hair: 'black', skin: 'mid', colors: {} })).toEqual({ hair: 'black', skin: 'mid', colors: {} })
  })

  it('unknown ids and colors fall back to defaults', () => {
    const o = safeOutfit({
      hat: 'jetpack',
      scarf: 'puffer', // wrong slot
      coat: '__proto__',
      mitts: { evil: true },
      extra: 'constructor',
      colors: { hat: 'neon', scarf: 'toString', coat: 42 },
      hair: 'rainbow',
      skin: 'hasOwnProperty',
    })
    expect(o).toEqual({ hat: 'beanie', scarf: 'scarf', colors: { hat: 'red', scarf: 'gold' }, hair: 'brown', skin: 'light' })
    expect(safeOutfit({ hat: 'beanie', colors: 'red' }).colors).toEqual({ hat: 'red' })
  })

  it('renders any garbage without throwing', () => {
    for (const raw of [undefined, {}, { hat: '__proto__', colors: { hat: '__proto__' }, hair: '__proto__' }, { coat: 'sweater', colors: null }]) {
      const html = renderToStaticMarkup(createElement(PixelAvatar, { outfit: safeOutfit(raw), size: 48 }))
      expect(html).toMatch(/^<svg/)
    }
  })

  it('my public stats carry the worn outfit', () => {
    const d = makeData()
    const now = nowAt('2026-11-25', 10)
    const s = buildPublicStats(d, computeState(d, now), now)
    expect(s.outfit).toEqual(wornOutfit(d.profile?.outfit, s.level, d.purchases))
    expect(safeOutfit(JSON.parse(JSON.stringify(s)).outfit)).toEqual(s.outfit)
  })
})
