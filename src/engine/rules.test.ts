import { describe, expect, it } from 'vitest'
import { levelOf, xpForLevel } from './levels'
import { DEFAULT_QUESTS, activeQuestsFor, isBase, questShards, questXp, reelsLimitFor, resolveMark } from './quests'
import { SHOP_ITEMS, canBuy, priceFor, priceMultiplier } from './shop'
import { carryOver, needsSplitHint, taskXp } from './tasks'
import { analyzeTriggers, redFlag } from './analysis'
import { createInitialData, normalizeData } from './data'
import { makeData } from './testkit'
import type { Quest, Slip, Task } from './types'

describe('уровни', () => {
  it('уровню n нужно 50·n·(n−1) XP', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000])
  })
  it('levelOf', () => {
    expect(levelOf(0).level).toBe(1)
    expect(levelOf(99).level).toBe(1)
    expect(levelOf(100).level).toBe(2)
    expect(levelOf(299).level).toBe(2)
    expect(levelOf(300).level).toBe(3)
    expect(levelOf(600).level).toBe(4)
    expect(levelOf(450)).toMatchObject({ level: 3, into: 150, span: 300, toNext: 150 })
    for (let xp = 0; xp < 20000; xp += 37) {
      const l = levelOf(xp)
      expect(xpForLevel(l.level)).toBeLessThanOrEqual(xp)
      expect(xpForLevel(l.level + 1)).toBeGreaterThan(xp)
    }
  })
})

describe('квесты по главам', () => {
  const mains = (day: string) => activeQuestsFor(DEFAULT_QUESTS, day).filter((p) => p.role === 'main').map((p) => p.id)
  it('main по таблице', () => {
    expect(mains('2026-11-23')).toEqual(['wake', 'phone'])
    expect(mains('2026-12-10')).toEqual(['wake', 'light', 'phone', 'reading', 'deal'])
    expect(mains('2027-01-10')).toEqual(['wake', 'reading', 'deal', 'workout', 'reels'])
    expect(mains('2027-02-10')).toEqual(['wake', 'reading', 'deal', 'workout', 'skill'])
  })
  it('неактивные квесты не попадают в день', () => {
    const ids = activeQuestsFor(DEFAULT_QUESTS, '2026-11-23').map((p) => p.id)
    expect(ids).not.toContain('workout')
    expect(ids).not.toContain('skill')
    expect(ids).toContain('water')
  })
  it('не больше 5 main — лишние становятся side', () => {
    const qs: Quest[] = DEFAULT_QUESTS.map((q) => ({ ...q, roles: ['main', 'main', 'main', 'main'] }))
    const plan = activeQuestsFor(qs, '2026-12-10')
    expect(plan.filter((p) => p.role === 'main')).toHaveLength(5)
    // «Сферы»: Твиттер и Рассылка лидам выключены по умолчанию
    expect(plan.filter((p) => p.role === 'side')).toHaveLength(qs.filter((q) => q.enabled).length - 5)
  })
  it('бывший main стал side → «база», XP ×0.5', () => {
    const light = DEFAULT_QUESTS.find((q) => q.id === 'light')!
    const reels = DEFAULT_QUESTS.find((q) => q.id === 'reels')!
    expect(isBase(light, 1)).toBe(false)
    expect(isBase(light, 2)).toBe(true)
    expect(isBase(reels, 3)).toBe(true)
    const p = activeQuestsFor(DEFAULT_QUESTS, '2027-01-10').find((x) => x.id === 'phone')!
    expect(p).toMatchObject({ role: 'side', base: true })
    expect(questXp('side', true, 'done')).toBe(5)
  })
  it('XP и осколки за квест', () => {
    expect(questXp('main', false, 'done')).toBe(20)
    expect(questXp('side', false, 'done')).toBe(10)
    expect(questXp('main', false, 'mini')).toBe(5)
    expect(questXp('main', false, 'skip')).toBe(0)
    expect(questShards('main', 'done')).toBe(3)
    expect(questShards('side', 'done')).toBe(2)
    expect(questShards('main', 'mini')).toBe(0)
  })
  it('новый квест не активен до даты создания', () => {
    const qs = [...DEFAULT_QUESTS, { ...DEFAULT_QUESTS[11], id: 'new', createdDay: '2026-12-05' }]
    expect(activeQuestsFor(qs, '2026-12-04').some((p) => p.id === 'new')).toBe(false)
    expect(activeQuestsFor(qs, '2026-12-05').some((p) => p.id === 'new')).toBe(true)
  })
})

describe('авто-отметки', () => {
  const q = (id: string) => DEFAULT_QUESTS.find((x) => x.id === id)!
  const ctx = { wakeTarget: 7 * 60, reelsLimit: 20, dealDoneOnDay: false }
  it('подъём: ±30 мин = выполнено, до +60 = мини, позже = пропуск', () => {
    const l = (wake: string) => ({ quests: {}, checkin: { wake, sleep: 3, energy: 3, at: 1 } })
    expect(resolveMark(q('wake'), l('07:25'), ctx).status).toBe('done')
    expect(resolveMark(q('wake'), l('06:31'), ctx).status).toBe('done')
    expect(resolveMark(q('wake'), l('07:50'), ctx).status).toBe('mini')
    expect(resolveMark(q('wake'), l('08:30'), ctx).status).toBe('skip')
    expect(resolveMark(q('wake'), { quests: {} }, ctx).status).toBeUndefined()
  })
  it('рилсы в лимите: ≤ 20 + купленные минуты', () => {
    const l = (reelsMin: number) => ({ quests: {}, confession: { reelsMin, sugar: 'none' as const, colaAfter14: false, bedtime: '23:00', main: '', at: 1 } })
    expect(resolveMark(q('reels'), l(20), ctx).status).toBe('done')
    expect(resolveMark(q('reels'), l(21), ctx).status).toBe('skip')
    expect(resolveMark(q('reels'), l(35), { ...ctx, reelsLimit: 35 }).status).toBe('done')
    const data = makeData()
    data.purchases.push({ id: 'p', at: 1, day: '2026-12-01', itemId: 'reels', title: '', price: 10, kind: 'reels' })
    expect(reelsLimitFor(data, '2026-12-01')).toBe(35)
    expect(reelsLimitFor(data, '2026-12-02')).toBe(20)
  })
  it('отбой до 23:30 из исповеди, кола после 14:00 = пропуск кофеина', () => {
    const l = (bedtime: string, colaAfter14 = false) => ({ quests: {}, confession: { reelsMin: 0, sugar: 'none' as const, colaAfter14, bedtime, main: '', at: 1 } })
    expect(resolveMark(q('bedtime'), l('23:30'), ctx).status).toBe('done')
    expect(resolveMark(q('bedtime'), l('00:15'), ctx).status).toBe('skip')
    expect(resolveMark(q('caffeine'), l('23:00', true), ctx).status).toBe('skip')
    expect(resolveMark(q('caffeine'), l('23:00', false), ctx).status).toBeUndefined()
  })
  it('ручная отметка важнее авто', () => {
    const l = { quests: { wake: { status: 'mini' as const, at: 1 } }, checkin: { wake: '07:00', sleep: 3, energy: 3, at: 1 } }
    expect(resolveMark(q('wake'), l, ctx).status).toBe('mini')
  })
})

describe('магазин', () => {
  it('множители цен по главам', () => {
    expect([0, 1, 2, 3].map((c) => priceMultiplier(c as 0))).toEqual([1, 1, 1.5, 2])
  })
  it('цены', () => {
    const prices = (ch: 0 | 1 | 2 | 3) => SHOP_ITEMS.map((i) => priceFor(i.basePrice, ch))
    expect(prices(0)).toEqual([15, 12, 10])
    expect(prices(1)).toEqual([15, 12, 10])
    expect(prices(2)).toEqual([23, 18, 15])
    expect(prices(3)).toEqual([30, 24, 20])
  })
  it('во время падения покупать нельзя', () => {
    expect(canBuy(100, 15, true).ok).toBe(false)
    expect(canBuy(10, 15, false).ok).toBe(false)
    expect(canBuy(15, 15, false).ok).toBe(true)
  })
})

describe('задачи', () => {
  const t = (id: string, parentId: string | null, over: Partial<Task> = {}): Task => ({
    id, parentId, title: id, stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0, ...over,
  })
  it('XP: задача Дела 30, подзадача 3, проект 0', () => {
    const tasks = [t('p', null), t('a', 'p'), t('b', 'a'), t('c', 'b')]
    expect(taskXp(tasks, tasks[0])).toBe(0)
    expect(taskXp(tasks, tasks[1])).toBe(30)
    expect(taskXp(tasks, tasks[2])).toBe(3)
    expect(taskXp(tasks, tasks[3])).toBe(3)
  })
  it('невыполненные задачи дня переносятся с счётчиком', () => {
    const tasks = [
      t('a', null, { scope: 'daily', day: '2026-11-24' }),
      t('a1', 'a', { scope: 'daily', day: '2026-11-24' }),
      t('b', null, { scope: 'daily', day: '2026-11-24', doneAt: 5, doneDay: '2026-11-24' }),
      t('c', null, { scope: 'daily', day: '2026-11-26', postponed: 2 }),
    ]
    const r = carryOver(tasks, '2026-11-26')
    expect(r.moved).toBe(1)
    const a = r.tasks.find((x) => x.id === 'a')!
    expect(a).toMatchObject({ day: '2026-11-26', postponed: 2 })
    expect(r.tasks.find((x) => x.id === 'a1')!.day).toBe('2026-11-26')
    expect(r.tasks.find((x) => x.id === 'b')!.day).toBe('2026-11-24')
    expect(needsSplitHint({ ...a, postponed: 3 })).toBe(true)
  })
})

describe('триггеры и красный флаг', () => {
  const slip = (i: number, why: Slip['why'], hour: number): Slip => ({
    id: String(i), at: new Date(2026, 11, 1 + i, hour).getTime(), day: `2026-12-${String(1 + i).padStart(2, '0')}`, what: 'reels', why,
  })
  it('экран триггеров — после 5 записей', () => {
    const four = [0, 1, 2, 3].map((i) => slip(i, 'tired', 23))
    expect(analyzeTriggers(four).enough).toBe(false)
    const r = analyzeTriggers([...four, slip(4, 'stress', 13)])
    expect(r.enough).toBe(true)
    expect(r.why[0]).toMatchObject({ key: 'tired', count: 4 })
    expect(r.time.find((x) => x.key === 'night')!.count).toBe(4)
    expect(r.headline).toBe('Чаще всего срываешься ночью от усталости')
  })
  it('энергия ≤ 2 в 10 из последних 14 чек-инов', () => {
    const data = makeData()
    for (let i = 0; i < 14; i++) {
      data.days[`2026-12-${String(i + 1).padStart(2, '0')}`] = { quests: {}, checkin: { wake: '07:00', sleep: 3, energy: i < 9 ? 2 : 4, at: 1 } }
    }
    expect(redFlag(data)).toBe(false)
    data.days['2026-12-10'].checkin!.energy = 1
    expect(redFlag(data)).toBe(true)
  })
})

describe('бэкап', () => {
  it('импорт проверяет формат и дополняет поля', () => {
    expect(() => normalizeData({ foo: 1 })).toThrow()
    const d = createInitialData()
    const { settings: _s, ...rest } = d
    const n = normalizeData(JSON.parse(JSON.stringify(rest)))
    expect(n.settings.reelsLimit).toBe(20)
    expect(n.quests).toHaveLength(16)
  })
})

describe('совместимость данных v0.1', () => {
  it('старые данные без темы, снега и подсказок получают значения по умолчанию и ничего не теряют', () => {
    const old = createInitialData() as unknown as Record<string, unknown>
    old.settings = { debugOffsetDays: 0, reelsLimit: 25, defaultSwap: 'вода' }
    old.ack = { reviewedWeeks: [1], missedThrough: '2026-11-25' }
    old.days = { '2026-11-23': { quests: { wake: { status: 'done', at: 1 } } } }
    const d = normalizeData(old)
    expect(d.settings).toMatchObject({ reelsLimit: 25, defaultSwap: 'вода', theme: 'auto', snow: true })
    expect(d.ack).toMatchObject({ reviewedWeeks: [1], missedThrough: '2026-11-25', hints: [] })
    expect(d.days['2026-11-23'].quests.wake.status).toBe('done')
  })
})
