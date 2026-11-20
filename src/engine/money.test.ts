import { describe, expect, it } from 'vitest'
import { MONEY_MAX, MONEY_XP, formatRub, moneyBoard, moneyEvents, moneyTotals, moneyXpFor, parseAmount, publicMoney, safeMoney } from './money'
import { computeState } from './replay'
import { buildPublicStats } from './social'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncMeta } from './sync'
import { at, makeData, nowAt } from './testkit'
import type { AppData, Income } from './types'

const inc = (id: string, day: string, amount: number, h = 12, over: Partial<Income> = {}): Income => ({ id, day, at: at(day, h), amount, ...over })

describe('money: input', () => {
  it('parses whole rubles with spaces, rejects zero, junk and absurd sums', () => {
    expect(parseAmount('12 500')).toBe(12500)
    expect(parseAmount('1500₽')).toBe(1500)
    expect(parseAmount('99,6')).toBe(100)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount(String(MONEY_MAX + 1))).toBeNull()
    expect(formatRub(1234567)).toBe('1 234 567 ₽')
  })
})

describe('money: totals', () => {
  it('week counts from Monday, arc counts warm-up and arc, never the future', () => {
    const d = makeData()
    d.incomes = [
      inc('a', '2026-11-20', 1000), // warm-up Friday, previous week
      inc('b', '2026-11-23', 2000), // arc start, Monday
      inc('c', '2026-11-25', 500),
      inc('d', '2026-11-27', 700), // future for today = 26th
      inc('bad', '2026-11-25', -3),
    ]
    const t = moneyTotals(d, '2026-11-26')
    expect(t).toEqual({ weekKey: '2026-11-23', week: 2500, arc: 3500 })
    expect(moneyTotals(d, '2026-11-30').week).toBe(0)
    expect(moneyTotals(d, '2026-11-30').arc).toBe(4200)
  })
})

describe('money: reward', () => {
  it('grows by the order of the day total and is capped', () => {
    expect(moneyXpFor(0)).toBe(0)
    expect(moneyXpFor(50)).toBe(MONEY_XP.min)
    expect(moneyXpFor(100)).toBe(5)
    expect(moneyXpFor(1000)).toBe(10)
    expect(moneyXpFor(15000)).toBe(15)
    expect(moneyXpFor(9_000_000)).toBe(MONEY_XP.max)
  })

  it('can not be farmed: many entries on a day give one reward, into «Дело», via replay', () => {
    const d = makeData()
    d.profile!.onboardDay = '2026-11-23'
    const day = '2026-11-24'
    d.incomes = Array.from({ length: 20 }, (_, i) => inc(`x${i}`, day, 100, 10 + (i % 8)))
    expect(moneyEvents(d)).toEqual([{ day, at: at(day, 10), xp: moneyXpFor(2000) }])
    const one = makeData()
    one.profile!.onboardDay = '2026-11-23'
    one.incomes = [inc('y', day, 2000)]
    const a = computeState(d, nowAt(day, 20))
    const b = computeState(one, nowAt(day, 20))
    expect(a.xpByStat.deal).toBe(b.xpByStat.deal)
    expect(a.xpByStat.deal).toBe(10)
    // deterministic: same log → same state
    expect(computeState(d, nowAt(day, 20)).xp).toBe(a.xp)
  })
})

describe('money: privacy', () => {
  const sample = (): AppData => {
    const d = makeData()
    d.profile!.onboardDay = '2026-11-23'
    d.tasks.push({ id: 'p1', parentId: null, title: 'СЕКРЕТ-ПРОЕКТ', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0 })
    d.incomes = [inc('m1', '2026-11-24', 4321, 12, { projectId: 'p1', note: 'СЕКРЕТ-ЗАМЕТКА' }), inc('m2', '2026-11-24', 1000, 13, { source: 'СЕКРЕТ-КЛИЕНТ' })]
    return d
  }

  it('off by default: nothing about money in the payload', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const s = buildPublicStats(d, computeState(d, now), now)
    expect('money' in s).toBe(false)
    expect(JSON.stringify(s)).not.toMatch(/4321|5321|СЕКРЕТ|money/)
    expect(publicMoney(d, '2026-11-25')).toBeUndefined()
  })

  it('on: only the totals and the week key', () => {
    const d = sample()
    d.settings.moneyShare = true
    const now = nowAt('2026-11-25', 10)
    const s = buildPublicStats(d, computeState(d, now), now)
    expect(s.money).toEqual({ week: 5321, arc: 5321, weekKey: '2026-11-23' })
    expect(Object.keys(s.money!).sort()).toEqual(['arc', 'week', 'weekKey'])
    expect(JSON.stringify(s)).not.toMatch(/СЕКРЕТ|4321|m1|m2/)
  })

  it('validates friends: bad shapes are ignored, a stale week is 0', () => {
    const today = '2026-11-26'
    expect(safeMoney({ week: 100, arc: 900, weekKey: '2026-11-23' }, today)).toEqual({ week: 100, arc: 900 })
    expect(safeMoney({ week: 100, arc: 900, weekKey: '2026-11-16' }, today)).toEqual({ week: 0, arc: 900 })
    expect(safeMoney({ week: -1, arc: 900, weekKey: '2026-11-23' }, today)).toBeNull()
    expect(safeMoney({ week: '100', arc: 900, weekKey: '2026-11-23' }, today)).toBeNull()
    expect(safeMoney({ week: 1, arc: 1e12, weekKey: '2026-11-23' }, today)).toBeNull()
    expect(safeMoney({ week: NaN, arc: 1, weekKey: '2026-11-23' }, today)).toBeNull()
    expect(safeMoney({ week: 1, arc: 1, weekKey: '<script>' }, today)).toBeNull()
    expect(safeMoney(null, today)).toBeNull()
    expect(safeMoney('5000', today)).toBeNull()
  })

  it('board: by amount, ties share a place, hidden last with me first', () => {
    const rows = moneyBoard(
      [
        { id: 'a', name: 'Аня', money: { week: 100, arc: 5000 } },
        { id: 'b', name: 'Боря', money: { week: 300, arc: 1000 } },
        { id: 'c', name: 'Вика', money: { week: 100, arc: 0 } },
        { id: 'z', name: 'Зоя', money: null },
        { id: 'me', name: 'Я', me: true, money: null },
      ],
      'week',
    )
    expect(rows.map((r) => [r.id, r.place])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['me', undefined],
      ['z', undefined],
    ])
    expect(moneyBoard([{ id: 'a', name: 'А', money: { week: 1, arc: 9 } }, { id: 'b', name: 'Б', money: { week: 5, arc: 2 } }], 'arc')[0].id).toBe('a')
  })
})

describe('money: sync', () => {
  class Dev {
    data: AppData
    meta: SyncMeta = { stamps: {}, tombs: {} }
    constructor(d: AppData) {
      this.data = structuredClone(d)
    }
    edit(now: number, fn: (d: AppData) => void) {
      const next = structuredClone(this.data)
      fn(next)
      this.meta = stampChanges(toAtoms(this.data), toAtoms(next), this.meta, now)
      this.data = next
    }
  }

  it('merges entries per item; a delete travels as a tombstone', () => {
    const start = makeData()
    start.incomes = [inc('old', '2026-11-24', 900)]
    const phone = new Dev(start)
    const mac = new Dev(start)
    phone.edit(1000, (d) => d.incomes!.push(inc('p', '2026-11-25', 1500)))
    mac.edit(1100, (d) => {
      d.incomes!.push(inc('m', '2026-11-25', 700, 9))
      d.incomes = d.incomes!.filter((x) => x.id !== 'old')
    })
    const r = mergeDocs(phone.data, phone.meta, { v: 1, data: mac.data, ...mac.meta })
    expect(r.data.incomes!.map((x) => x.id)).toEqual(['m', 'p'])
    expect(r.meta.tombs['incomes/old']).toBe(1100)
    // and back: the mac learns the phone entry, the deleted one stays deleted
    const back = mergeDocs(mac.data, mac.meta, { v: 1, data: r.data, ...r.meta })
    expect(back.data.incomes!.map((x) => x.id).sort()).toEqual(['m', 'p'])
  })

  it('an edit on one device beats an older value on the other', () => {
    const start = makeData()
    start.incomes = [inc('x', '2026-11-24', 900)]
    const a = new Dev(start)
    const b = new Dev(start)
    a.edit(2000, (d) => void (d.incomes![0].amount = 1900))
    b.edit(1500, (d) => void (d.incomes![0].note = 'b'))
    const r = mergeDocs(b.data, b.meta, { v: 1, data: a.data, ...a.meta })
    expect(r.data.incomes![0].amount).toBe(1900)
  })
})
