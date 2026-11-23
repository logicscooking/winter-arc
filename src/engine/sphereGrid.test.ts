import { describe, expect, it } from 'vitest'
import { sphereWeekGrid } from './spheres'

const day = (ids: string[], marks: Record<string, 'done' | 'mini' | 'skip'> = {}) => ({ plan: ids.map((id) => ({ id })), marks })

describe('sphereWeekGrid', () => {
  // 2026-11-25 is Wednesday; week = 23..29 Nov, last week = 16..22 Nov
  const game = {
    days: {
      '2026-11-17': day(['water', 'deal'], { water: 'done', deal: 'done' }),
      '2026-11-23': day(['water', 'steps', 'deal'], { water: 'done', steps: 'mini' }),
      '2026-11-24': day(['water', 'deal', 'meditation'], { water: 'done', meditation: 'done' }),
      '2026-11-25': day(['water', 'own1'], {}),
      '2026-11-27': day(['water'], { water: 'done' }), // future: ignored
    },
  }
  const g = sphereWeekGrid(game, [{ id: 'own1', area: 'growth' }], '2026-11-25')

  it('lays out Mon..Sun and counts per sphere per day', () => {
    expect(g.days[0]).toBe('2026-11-23')
    expect(g.days[6]).toBe('2026-11-29')
    expect(g.cells.health[0]).toEqual({ total: 2, done: 2, score: 1.5 })
    expect(g.cells.money[1]).toEqual({ total: 1, done: 0, score: 0 })
    expect(g.cells.growth[2].total).toBe(1) // own quest uses its area
    expect(g.cells.health[4]).toEqual({ total: 0, done: 0, score: 0 }) // future day stays empty
  })

  it('weekly completion: mini = half, null when nothing planned', () => {
    expect(g.thisWeek.health).toBeCloseTo(2.5 / 4)
    expect(g.thisWeek.money).toBe(0)
    expect(g.thisWeek.misc).toBe(1)
    expect(g.thisWeek.growth).toBe(0)
  })

  it('last week is whole and independent', () => {
    expect(g.lastWeek.health).toBe(1)
    expect(g.lastWeek.money).toBe(1)
    expect(g.lastWeek.misc).toBeNull()
  })
})
