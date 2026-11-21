import { describe, expect, it } from 'vitest'
import { normalizeData } from './data'
import {
  PLAN_TEMPLATES,
  TRANSITION,
  WORK_RULES,
  assignedBlock,
  blocksOverlap,
  gameMin,
  itemKey,
  lateWork,
  migrateDayPlan,
  parseItemKey,
  planBlocksOf,
  sanitizePlanBlock,
  templateBlocks,
  transitionDue,
  transitionEvents,
  transitionReps,
  workMinutes,
} from './plan'
import { computeState } from './replay'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData, PlanBlock } from './types'

const D = '2026-11-24'
const blk = (id: string, start: number, dur: number, over: Partial<PlanBlock> = {}): PlanBlock => ({ id, title: id.toUpperCase(), start, dur, ...over })

describe('План дня v0.9: блоки и дела', () => {
  it('блоки чистятся: id из ключа, время по 5 минут, неизвестные цвет и иконка отбрасываются', () => {
    expect(sanitizePlanBlock({ title: ' Утро ', start: 543, dur: 2000, color: 'pink', icon: 'nope', work: 'yes' }, 'a')).toEqual({ id: 'a', title: 'Утро', start: 545, dur: 720 })
    expect(sanitizePlanBlock({ title: 'x', start: 600, dur: 60, color: 'mind', icon: 'brain', work: true }, 'b')).toEqual({ id: 'b', title: 'x', start: 600, dur: 60, color: 'mind', icon: 'brain', work: true })
    expect(sanitizePlanBlock({ title: '', start: 'x', dur: 30 }, 'c')).toBeNull()
    expect(sanitizePlanBlock({ title: '', start: 60, dur: 30 }, 'c')?.title).toBe('Блок')
  })

  it('порядок игрового дня: блок после полуночи идёт после вечера', () => {
    const l = { dayBlocks: { a: blk('a', 30, 60), b: blk('b', 9 * 60, 60), c: blk('c', 20 * 60, 60) } }
    expect(planBlocksOf(l).map((b) => b.id)).toEqual(['b', 'c', 'a'])
    expect(gameMin(4 * 60)).toBe(0)
    expect(gameMin(3 * 60 + 59)).toBe(1439)
  })

  it('ключи дел и привязка к существующему блоку', () => {
    expect(parseItemKey(itemKey('quest', 'water'))).toEqual({ kind: 'quest', id: 'water' })
    expect(parseItemKey('goal:a:b')).toEqual({ kind: 'goal', id: 'a:b' })
    expect(parseItemKey('blah:x')).toBeNull()
    expect(parseItemKey('quest:')).toBeNull()
    const l = { dayBlocks: { a: blk('a', 600, 60) }, assign: { 'quest:water': 'a', 'quest:light': 'gone' } }
    expect(assignedBlock(l, 'quest:water')).toBe('a')
    expect(assignedBlock(l, 'quest:light')).toBeUndefined()
  })

  it('работа: часы и блоки после 17:00', () => {
    const bs = [blk('a', 9 * 60, 180, { work: true }), blk('b', 16 * 60, 90, { work: true }), blk('c', 18 * 60, 60)]
    expect(workMinutes(bs)).toBe(270)
    expect(lateWork(bs).map((b) => b.id)).toEqual(['b'])
  })
})

describe('План дня v0.9: миграция', () => {
  const legacy = () => {
    const d = makeData()
    log(d, D).blocks = [
      { id: 'o1', start: 600, dur: 60, title: 'Тренировка', stat: 'body', ref: { kind: 'quest', id: 'workout' } },
      { id: 'o2', start: 22 * 60, dur: 30, title: 'Чтение', stat: 'mind', ref: { kind: 'quest', id: 'reading' } },
      { id: 'o3', start: 13 * 60, dur: 45, title: 'Звонок маме' },
    ]
    return d
  }

  it('старые блоки становятся блоками дня с делом внутри, ничего не теряется', () => {
    const back = normalizeData(JSON.parse(JSON.stringify(legacy())))
    const l = back.days[D]
    expect(l.blocks).toBeUndefined()
    expect(l.planV).toBe(2)
    expect(l.dayBlocks).toEqual({
      o1: { id: 'o1', title: 'Тренировка', start: 600, dur: 60, color: 'body' },
      o2: { id: 'o2', title: 'Чтение', start: 1320, dur: 30, color: 'mind' },
      o3: { id: 'o3', title: 'Звонок маме', start: 780, dur: 45 },
    })
    expect(l.assign).toEqual({ 'quest:workout': 'o1', 'quest:reading': 'o2' })
  })

  it('идемпотентна; поздняя копия старых блоков со старого устройства не воскрешает удалённое', () => {
    const once = normalizeData(JSON.parse(JSON.stringify(legacy())))
    expect(normalizeData(JSON.parse(JSON.stringify(once)))).toEqual(once)
    // the user deleted o1 and then an old device sent its legacy list again
    const edited = structuredClone(once)
    delete edited.days[D].dayBlocks!.o1
    delete edited.days[D].assign!['quest:workout']
    edited.days[D].blocks = legacy().days[D].blocks
    const again = normalizeData(edited)
    expect(Object.keys(again.days[D].dayBlocks!)).toEqual(['o2', 'o3'])
    expect(again.days[D].blocks).toBeUndefined()
  })

  it('мусор чистится: битые блоки, привязки и переходы к пропавшим блокам', () => {
    const l = migrateDayPlan({
      quests: {},
      dayBlocks: { a: blk('a', 600, 60), bad: { title: 'x' } as unknown as PlanBlock },
      assign: { 'quest:water': 'a', 'quest:light': 'bad', 'zzz:1': 'a', 'task:t': 5 as unknown as string },
      transitions: { a: 123, bad: 5, x: 7 },
    })
    expect(l.dayBlocks).toEqual({ a: blk('a', 600, 60, { title: 'A' }) })
    expect(l.assign).toEqual({ 'quest:water': 'a' })
    expect(l.transitions).toEqual({ a: 123 })
    const empty = migrateDayPlan({ quests: {}, dayBlocks: 'x' as unknown as Record<string, PlanBlock>, assign: {}, blocks: 'x' as unknown as [] })
    expect(empty).toEqual({ quests: {}, planV: 2 })
    // a day without plan fields is returned as is
    const plain = { quests: {} }
    expect(migrateDayPlan(plain)).toBe(plain)
  })

  it('настройки перехода: не меньше 10 и не больше 100', () => {
    expect(transitionReps(undefined)).toEqual({ push: 10, squat: 10 })
    expect(transitionReps({ push: 3, squat: 25.4 })).toEqual({ push: 10, squat: 25 })
    expect(transitionReps({ push: 1e6, squat: 'x' })).toEqual({ push: 100, squat: 10 })
    const d = makeData()
    d.settings.transition = { push: 2, squat: 15 }
    expect(normalizeData(JSON.parse(JSON.stringify(d))).settings.transition).toEqual({ push: 10, squat: 15 })
  })
})

describe('План дня v0.9: шаблоны', () => {
  const noOverlaps = (bs: { start: number; dur: number }[]) => bs.every((a, i) => bs.every((b, j) => i === j || !blocksOverlap(a, b)))

  it('все шаблоны без пересечений', () => {
    for (const t of PLAN_TEMPLATES) {
      const bs = templateBlocks(t.id, { wake: 8 * 60, sleep: 23 * 60 + 30 })
      expect(bs.length).toBeGreaterThanOrEqual(3)
      expect(noOverlaps(bs)).toBe(true)
    }
  })

  it('«По правилам»: работа ≤ 6 ч и заканчивается к 17:00 при любом подъёме, вечер за 2 ч до сна', () => {
    for (const wake of [5 * 60, 7 * 60, 8 * 60, 10 * 60 + 30, 13 * 60, 16 * 60]) {
      const bs = templateBlocks('rules', { wake, sleep: 23 * 60 + 30 }).map((b, i) => ({ ...b, id: String(i) }))
      expect(workMinutes(bs)).toBeLessThanOrEqual(WORK_RULES.maxMin)
      expect(lateWork(bs)).toEqual([])
      expect(noOverlaps(bs)).toBe(true)
      expect(bs.some((b) => /Прогулка/.test(b.title))).toBe(true)
    }
    const day = templateBlocks('rules', { wake: 8 * 60, sleep: 23 * 60 + 30 })
    expect(day.find((b) => b.title === 'Тихий вечер')).toMatchObject({ start: 21 * 60 + 30, dur: 120 })
    expect(day.filter((b) => b.work).every((b) => b.dur <= 120)).toBe(true)
  })
})

describe('План дня v0.9: «Переход»', () => {
  const withBlocks = () => {
    const d = makeData()
    log(d, D).dayBlocks = { a: blk('a', 9 * 60, 90), b: blk('b', 11 * 60, 90), c: blk('c', 14 * 60, 60) }
    return d
  }

  it('+2 XP в Тело за переход, один раз на блок; ничего больше не меняется', () => {
    const now = nowAt(D, 20)
    const d0 = withBlocks()
    const base = computeState(d0, now)
    const d = structuredClone(d0)
    log(d, D).transitions = { a: at(D, 8, 50), b: at(D, 10, 55) }
    const st = computeState(d, now)
    expect(st.xpByStat.body - base.xpByStat.body).toBe(2 * TRANSITION.xp)
    expect(st.xp - base.xp).toBe(2 * TRANSITION.xp)
    expect(st.shards).toBe(base.shards)
    expect(st.hp).toBe(base.hp)
    for (const s of ['energy', 'mind', 'will', 'deal'] as const) expect(st.xpByStat[s]).toBe(base.xpByStat[s])
    // a transition of a removed block pays nothing
    delete log(d, D).dayBlocks!.b
    expect(computeState(d, now).xp - base.xp).toBe(TRANSITION.xp)
  })

  it('детерминирован и ограничен в день', () => {
    const d = makeData()
    const l = log(d, D)
    l.dayBlocks = {}
    l.transitions = {}
    for (let i = 0; i < 12; i++) {
      l.dayBlocks[`b${i}`] = blk(`b${i}`, 5 * 60 + i * 60, 30)
      l.transitions[`b${i}`] = at(D, 5 + i)
    }
    const ev = transitionEvents(d)
    expect(ev).toHaveLength(TRANSITION.perDay)
    expect(ev.map((e) => e.blockId)).toEqual(Array.from({ length: TRANSITION.perDay }, (_, i) => `b${i}`))
    expect(transitionEvents(structuredClone(d))).toEqual(ev)
  })

  it('карточка на «Сегодня»: за 15 минут до блока и 15 минут после начала, пока не сделан', () => {
    const l = withBlocks().days[D]
    expect(transitionDue(l, 8 * 60 + 40)).toBeUndefined()
    expect(transitionDue(l, 8 * 60 + 45)?.block.id).toBe('a')
    expect(transitionDue(l, 8 * 60 + 50)?.inMin).toBe(10)
    expect(transitionDue(l, 9 * 60 + 15)?.inMin).toBe(-15)
    expect(transitionDue(l, 9 * 60 + 16)).toBeUndefined()
    expect(transitionDue({ ...l, transitions: { a: 1 } }, 8 * 60 + 50)).toBeUndefined()
  })
})

/** A simulated device (see sync.test.ts) */
class Device {
  data: AppData
  meta: SyncMeta = { stamps: {}, tombs: {} }
  constructor(data: AppData) {
    this.data = structuredClone(data)
  }
  edit(now: number, fn: (d: AppData) => void) {
    const next = structuredClone(this.data)
    fn(next)
    this.meta = stampChanges(toAtoms(this.data), toAtoms(next), this.meta, now)
    this.data = next
  }
  sync(server: { doc: SyncDoc | null }) {
    const r = mergeDocs(this.data, this.meta, server.doc)
    this.data = r.data
    this.meta = r.meta
    if (r.remoteChanged || !server.doc) server.doc = { v: 1, data: structuredClone(this.data), ...structuredClone(this.meta) }
    return r
  }
}

describe('План дня v0.9: синхронизация', () => {
  const T = at(D, 7)

  it('блоки, привязки и переходы сливаются по одному, удаление блока доходит до другого устройства', () => {
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(makeData())
    phone.sync(server)
    const mac = new Device(phone.data)
    mac.sync(server)

    phone.edit(T + 1, (d) => {
      log(d, D).dayBlocks = { a: blk('a', 9 * 60, 90) }
      log(d, D).assign = { 'quest:water': 'a' }
    })
    mac.edit(T + 2, (d) => {
      log(d, D).dayBlocks = { b: blk('b', 14 * 60, 60) }
      log(d, D).assign = { 'quest:light': 'b' }
    })
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)
    expect(Object.keys(phone.data.days[D].dayBlocks!).sort()).toEqual(['a', 'b'])
    expect(phone.data.days[D].assign).toEqual({ 'quest:light': 'b', 'quest:water': 'a' })
    expect(mac.data.days[D]).toEqual(phone.data.days[D])

    // a transition done on both devices keeps the earliest moment
    phone.edit(T + 10, (d) => void (log(d, D).transitions = { a: at(D, 8, 55) }))
    mac.edit(T + 11, (d) => void (log(d, D).transitions = { a: at(D, 8, 50) }))
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)
    expect(phone.data.days[D].transitions).toEqual({ a: at(D, 8, 50) })
    expect(mac.data.days[D].transitions).toEqual({ a: at(D, 8, 50) })

    // the mac deletes block a: its assignment and transition go with it, everywhere
    mac.edit(T + 20, (d) => {
      const l = log(d, D)
      delete l.dayBlocks!.a
      delete l.assign!['quest:water']
      delete l.transitions
    })
    mac.sync(server)
    phone.sync(server)
    expect(Object.keys(phone.data.days[D].dayBlocks!)).toEqual(['b'])
    expect(phone.data.days[D].assign).toEqual({ 'quest:light': 'b' })
    expect(phone.data.days[D].transitions).toBeUndefined()
    expect(mac.meta.tombs[`days/${D}/dayBlocks/a`]).toBe(T + 20)
  })

  it('правка блока на одном устройстве и привязка на другом не мешают друг другу', () => {
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(makeData())
    phone.edit(T, (d) => void (log(d, D).dayBlocks = { a: blk('a', 9 * 60, 90) }))
    phone.sync(server)
    const mac = new Device(makeData())
    mac.sync(server)
    phone.edit(T + 5, (d) => void (log(d, D).dayBlocks!.a = blk('a', 10 * 60, 60, { title: 'Фокус' })))
    mac.edit(T + 6, (d) => void (log(d, D).assign = { 'task:t1': 'a' }))
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)
    expect(phone.data.days[D].dayBlocks!.a).toEqual(blk('a', 10 * 60, 60, { title: 'Фокус' }))
    expect(phone.data.days[D].assign).toEqual({ 'task:t1': 'a' })
    expect(mac.data.days[D]).toEqual(phone.data.days[D])
  })

  it('атомы: каждый блок — отдельный путь', () => {
    const d = makeData()
    log(d, D).dayBlocks = { a: blk('a', 600, 60) }
    log(d, D).assign = { 'quest:water': 'a' }
    log(d, D).transitions = { a: 5 }
    const a = toAtoms(d)
    expect(a[`days/${D}/dayBlocks/a`]).toEqual(blk('a', 600, 60))
    expect(a[`days/${D}/assign/quest:water`]).toBe('a')
    expect(a[`days/${D}/transitions/a`]).toBe(5)
    expect(a[`days/${D}/dayBlocks`]).toBeUndefined()
  })
})
