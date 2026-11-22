import { describe, expect, it } from 'vitest'
import { dayStreak, monthClosed } from './streak'
import type { GameState } from './replay'

const g = (map: Record<string, { perfect?: boolean; frozen?: boolean }>) =>
  ({ days: Object.fromEntries(Object.entries(map).map(([d, r]) => [d, { perfect: false, frozen: false, ...r }])) }) as unknown as Pick<GameState, 'days'>

describe('day streak', () => {
  it('counts closed days in a row, freezes keep it, an open today does not break it', () => {
    const game = g({ '2026-11-20': { perfect: true }, '2026-11-21': { frozen: true }, '2026-11-22': { perfect: true }, '2026-11-23': {} })
    expect(dayStreak(game, '2026-11-23')).toEqual({ run: 2, best: 2, todayDone: false })
  })
  it('a missed day resets the run but keeps the best', () => {
    const game = g({ '2026-11-19': { perfect: true }, '2026-11-20': { perfect: true }, '2026-11-21': {}, '2026-11-22': { perfect: true } })
    expect(dayStreak(game, '2026-11-22')).toEqual({ run: 1, best: 2, todayDone: true })
  })
})

describe('month closed', () => {
  it('fills the month with states and counts closed days', () => {
    const game = g({ '2026-11-21': {}, '2026-11-22': { perfect: true }, '2026-11-23': {} })
    const m = monthClosed(game, '2026-11-23')
    expect(m.title).toBe('в ноябре')
    expect(m.cells).toHaveLength(30)
    expect(m.lead).toBe(6)
    expect(m.closed).toBe(1)
    expect(m.past).toBe(2)
    expect(m.cells[20].state).toBe('miss')
    expect(m.cells[22].state).toBe('open')
    expect(m.cells[29].state).toBe('future')
  })
})
