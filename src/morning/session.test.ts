import { describe, expect, it } from 'vitest'
import { GET_SEC, parseClips } from './program'
import { doneCount, spentMs, useMorning } from './session'

const list = parseClips([
  { id: 'a', block: 'v1', title: 'A', mode: 'time', seconds: 30, hint: '' },
  { id: 'b', block: 'v2', title: 'B', mode: 'reps', reps: 10, hint: '' },
  { id: 'c', block: 'v4', title: 'C', mode: 'time', seconds: 20, hint: '' },
])
const S = () => useMorning.getState()
const GET = GET_SEC * 1000

describe('сессия зарядки', () => {
  it('ничего не стартует само: упражнение ждёт «Старт», даже если время идёт', () => {
    S().start('2026-11-24', list, 0)
    expect(S()).toMatchObject({ phase: 'work', i: 0, stage: 'idle', running: false, left: 30_000 })
    S().expire(60_000)
    expect(S()).toMatchObject({ i: 0, stage: 'idle', running: false })
  })

  it('«Старт» → 3-2-1 → отсчёт → следующее упражнение снова ждёт', () => {
    S().start('2026-11-24', list, 0)
    S().play(1000)
    expect(S()).toMatchObject({ stage: 'get', running: true, endsAt: 1000 + GET })
    S().expire(1000 + GET)
    expect(S()).toMatchObject({ stage: 'run', running: true, endsAt: 1000 + GET + 30_000 })
    S().expire(1000 + GET + 30_000)
    expect(S()).toMatchObject({ phase: 'work', i: 1, stage: 'idle', running: false })
    expect(S().marks[0]).toBe('done')
  })

  it('повторы ждут «Готово», «Старт» на них не действует, после последнего — финиш', () => {
    S().start('2026-11-24', list, 0)
    S().skip(1000)
    S().play(2000)
    expect(S()).toMatchObject({ i: 1, running: false })
    S().complete(40_000)
    expect(S()).toMatchObject({ i: 2, stage: 'idle', running: false, left: 20_000 })
    S().skip(42_000)
    expect(S().phase).toBe('done')
    expect(doneCount(S())).toBe(1)
    expect(S().marks).toEqual(['skip', 'done', 'skip'])
  })

  it('пауза держит остаток и не идёт в зачёт времени; «Назад» открывает прошлое без старта', () => {
    S().start('2026-11-24', list, 0)
    S().play(0)
    S().expire(GET)
    S().pause(GET + 10_000, true)
    expect(S()).toMatchObject({ stage: 'run', running: false, left: 20_000, auto: true })
    S().play(GET + 70_000)
    expect(S().endsAt).toBe(GET + 90_000)
    expect(spentMs(S(), GET + 80_000)).toBe(GET + 20_000)
    S().expire(GET + 90_000)
    S().prev(GET + 91_000)
    expect(S()).toMatchObject({ phase: 'work', i: 0, stage: 'idle', running: false, left: 30_000 })
    expect(S().marks[0]).toBeUndefined()
  })
})
