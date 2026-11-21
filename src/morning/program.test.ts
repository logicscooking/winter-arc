import { describe, expect, it } from 'vitest'
import { CLIPS, GET_SEC, REP_SEC, SWITCH_SEC, blocksOf, buildProgram, finalSteps, parseClips, programSeconds, sanitizeClip } from './program'

describe('программа «Утренней инвестиции»', () => {
  it('клипы из clips.json валидны и идут блоками v1 → v4', () => {
    expect(CLIPS.length).toBeGreaterThan(0)
    const order = blocksOf(CLIPS).map((b) => b.id)
    expect(order).toEqual(['v1', 'v2', 'v3', 'v4'])
  })

  it('финал: мужчины 20 + 20, женщины 20 + 5', () => {
    expect(finalSteps('m').map((c) => c.reps)).toEqual([20, 20])
    expect(finalSteps('f').map((c) => c.reps)).toEqual([20, 5])
    const p = buildProgram('f')
    expect(p.slice(-2).every((c) => c.block === 'fin')).toBe(true)
    expect(p.length).toBe(CLIPS.length + 2)
  })

  it('оценка времени: секунды, повторы, 3-2-1 и переходы', () => {
    const list = parseClips([
      { id: 'a', block: 'v1', title: 'A', mode: 'time', seconds: 30, hint: '' },
      { id: 'b', block: 'v2', title: 'B', mode: 'reps', reps: 10, hint: '' },
    ])
    expect(programSeconds(list)).toBe(30 + GET_SEC + 10 * REP_SEC + 2 * SWITCH_SEC)
  })

  it('битые записи отбрасываются, дубли id тоже', () => {
    expect(sanitizeClip({ id: 'x', block: 'v9', title: 'X', mode: 'time', seconds: 5 })).toBeNull()
    expect(sanitizeClip({ id: 'x', block: 'v1', title: 'X', mode: 'time' })).toBeNull()
    expect(sanitizeClip({ id: 'x', block: 'v1', title: 'X', mode: 'reps', reps: -1 })).toBeNull()
    expect(parseClips([{ id: 'x', block: 'v1', title: 'X', mode: 'reps', reps: 3 }, { id: 'x', block: 'v1', title: 'Y', mode: 'reps', reps: 3 }])).toHaveLength(1)
    expect(parseClips('nope')).toEqual([])
  })
})
