import { describe, expect, it } from 'vitest'
import { ELO, eloGain, eloLevel, eloShare } from './elo'
import { computeState } from './replay'
import { questArea } from './areas'
import { ARC_START, addDays } from './time'
import { at, confess, doMains, log, makeData, mark, nowAt, perfectDays } from './testkit'
import type { Area } from './types'

const D1 = ARC_START
const areaOf = (id: string): Area => questArea({ id })

describe('Эло: формула дня', () => {
  const plan = [{ id: 'wake' }, { id: 'water' }, { id: 'reading' }, { id: 'meditation' }, { id: 'deal' }, { id: 'twitter' }]
  it('доля квестов вне «Денег»: done = 1, mini = ½, остальное 0', () => {
    expect(eloShare(plan, { wake: 'done', water: 'done', reading: 'done', meditation: 'done' }, areaOf)).toBe(1)
    expect(eloGain(plan, { wake: 'done', water: 'mini', reading: 'skip', meditation: undefined }, areaOf)).toBe(Math.round(15 * 0.375))
    expect(eloGain(plan, {}, areaOf)).toBe(0)
  })
  it('квесты «Денег» не считаются ни в долю, ни в знаменатель', () => {
    expect(eloGain(plan, { deal: 'done', twitter: 'done' }, areaOf)).toBe(0)
    expect(eloGain(plan, { wake: 'done', water: 'done', reading: 'done', meditation: 'done', deal: 'skip' }, areaOf)).toBe(15)
  })
  it('замороженный день даёт 0', () => {
    expect(eloGain(plan, { wake: 'done', water: 'done', reading: 'done', meditation: 'done' }, areaOf, true)).toBe(0)
  })
})

describe('Эло: уровни FACEIT', () => {
  it('границы уровней 1…10', () => {
    const cases: [number, number][] = [[0, 1], [500, 1], [501, 2], [750, 2], [751, 3], [900, 3], [901, 4], [1000, 4], [1050, 4], [1051, 5], [1200, 5], [1201, 6], [1350, 6], [1351, 7], [1530, 7], [1531, 8], [1750, 8], [1751, 9], [2000, 9], [2001, 10], [3000, 10]]
    for (const [elo, lvl] of cases) expect(eloLevel(elo).level, `Эло ${elo}`).toBe(lvl)
  })
  it('до следующего уровня и вершина', () => {
    const l = eloLevel(1135)
    expect(l.level).toBe(5)
    expect(l.from).toBe(1051)
    expect(l.to).toBe(1200)
    expect(l.toNext).toBe(66)
    expect(eloLevel(2300).max).toBe(true)
    expect(ELO.start).toBe(1000)
  })
})

describe('Эло: реплей', () => {
  it('старт 1000, разминка ничего не даёт, закрытый день добавляет, открытый — нет', () => {
    const data = makeData()
    data.profile!.onboardDay = addDays(D1, -2)
    doMains(data, addDays(D1, -1))
    confess(data, addDays(D1, -1))
    const st0 = computeState(data, nowAt(D1, 10))
    expect(st0.elo).toBe(1000)
    expect(st0.eloLevel).toBe(4)
    for (const id of ['wake', 'water', 'reading', 'meditation']) mark(data, D1, id)
    confess(data, D1)
    const st = computeState(data, nowAt(addDays(D1, 1), 8))
    expect(st.days[D1].eloGain).toBeGreaterThan(0)
    expect(st.elo).toBe(1000 + st.days[D1].eloGain)
    expect(st.eloByDay[D1]).toBe(st.elo)
    // the day is not closed yet: the projection shows, the Эло does not move
    mark(data, addDays(D1, 1), 'wake')
    const open = computeState(data, nowAt(addDays(D1, 1), 12))
    expect(open.days[addDays(D1, 1)].eloGain).toBeGreaterThan(0)
    expect(open.elo).toBe(st.elo)
  })

  it('«Деньги» не двигают Эло', () => {
    const data = makeData()
    for (const id of ['deal', 'twitter', 'leads']) mark(data, D1, id)
    confess(data, D1)
    expect(computeState(data, nowAt(addDays(D1, 1), 8)).elo).toBe(1000)
  })

  it('идеальная арка ≈ 98 × 15 → уровень 10', () => {
    const data = makeData()
    let d = D1
    for (let i = 0; i < 98; i++, d = addDays(d, 1)) {
      const day = (data.days[d] ??= { quests: {} })
      for (const p of computeState(makeData(), nowAt(D1, 10)).days[D1]?.plan ?? []) day.quests[p.id] = { status: 'done', at: Date.now() }
      confess(data, d)
    }
    const st = computeState(data, nowAt(addDays(D1, 99), 12))
    expect(st.eloLevel).toBe(10)
    expect(st.elo).toBeGreaterThan(2001)
    expect(st.levelUps.map((l) => l.level)).toEqual([5, 6, 7, 8, 9, 10])
  })
})

describe('Эло: штрафы вместо HP', () => {
  it('день без исповеди после дедлайна −10, до дедлайна ничего', () => {
    const data = makeData()
    expect(computeState(data, nowAt(addDays(D1, 1), 15)).elo).toBe(1000)
    const st = computeState(data, nowAt(addDays(D1, 1), 16, 1))
    expect(st.days[D1]).toMatchObject({ retro: true, eloGain: 0, eloLoss: ELO.noConfession })
    expect(st.elo).toBe(990)
  })

  it('«Слился» −5 сразу, каждый; камбэк в окне отменяет', () => {
    const data = makeData()
    data.slips.push({ id: 'a', at: at(D1, 10), day: D1, what: 'reels', why: 'auto' })
    data.slips.push({ id: 'b', at: at(D1, 12), day: D1, what: 'cola', why: 'auto' })
    expect(computeState(data, nowAt(D1, 13)).elo).toBe(990)
    data.slips[0].comebackAt = at(D1, 10, 30)
    const st = computeState(data, nowAt(D1, 13))
    expect(st.elo).toBe(995)
    expect(st.days[D1].eloLoss).toBe(ELO.slip)
  })

  it('Эло не падает ниже 100', () => {
    const data = makeData()
    for (let i = 0; i < 200; i++) data.slips.push({ id: `s${i}`, at: at(D1, 9, 0, i), day: D1, what: 'reels', why: 'auto' })
    const st = computeState(data, nowAt(D1, 20))
    expect(st.elo).toBe(ELO.floor)
    expect(eloLevel(st.elo).level).toBe(1)
    // the peak level stays for rewards and gear
    expect(st.eloLevel).toBe(4)
  })

  it('заморозка: ни плюса, ни минуса (и срывы дня тоже не считаются)', () => {
    const data = makeData()
    perfectDays(data, D1, 7)
    const f = addDays(D1, 7)
    mark(data, f, 'water')
    confess(data, f)
    log(data, f).freeze = true
    data.slips.push({ id: 's', at: at(f, 11), day: f, what: 'reels', why: 'auto' })
    const before = computeState(data, nowAt(addDays(D1, 6), 22))
    const st = computeState(data, nowAt(f, 22))
    expect(st.days[f]).toMatchObject({ frozen: true, eloGain: 0, eloLoss: 0 })
    expect(st.elo).toBe(before.elo)
  })

  it('разминка: срывы и молчание Эло не трогают', () => {
    const data = makeData()
    const w = addDays(D1, -2)
    data.slips.push({ id: 's', at: at(w, 11), day: w, what: 'reels', why: 'auto' })
    const st = computeState(data, nowAt(D1, 10))
    expect(st.elo).toBe(1000)
    expect(st.days[w].eloLoss).toBe(0)
  })
})
