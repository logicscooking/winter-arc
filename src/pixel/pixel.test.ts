import { describe, expect, it } from 'vitest'
import { SPRITES } from './sprites'
import { AV_BASE, AV_H, AV_LAYERS, AV_W } from './avatar-layers'
import { PAL } from './palette'

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
