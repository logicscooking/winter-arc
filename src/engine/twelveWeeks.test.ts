import { describe, expect, it } from 'vitest'
import { computeState, type GameState } from './replay'
import { buildPublicStats } from './social'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { normalizeData } from './data'
import { at, makeData, nowAt } from './testkit'
import { addDays, gameDayOf, localAt } from './time'
import {
  BATTLE_END,
  arcGrid,
  arcPos,
  arcScores,
  arcTotals,
  arcWeekOf,
  materializeTactics,
  sanitizeArcGoal,
  tacticGoalId,
  tacticWeeks,
  weekScore,
  wonStreak,
  type WeekScore,
} from './twelveWeeks'
import type { AppData, ArcGoal, MarkStatus, WeekGoal } from './types'

type DayIn = { marks?: (MarkStatus | undefined)[]; frozen?: boolean; closed?: boolean }

/** A fake replay: each day has N main quests with the given marks */
function game(days: Record<string, DayIn>): Pick<GameState, 'days' | 'moneyKills'> {
  const out: Record<string, unknown> = {}
  for (const [d, x] of Object.entries(days)) {
    const marks = x.marks ?? []
    const plan = marks.map((_, i) => ({ id: `q${i}`, role: 'main', base: true, stat: 'will' }))
    const m = Object.fromEntries(marks.map((s, i) => [`q${i}`, s]))
    const missed = marks.map((s, i) => (s === 'done' || s === 'mini' ? null : `q${i}`)).filter(Boolean)
    out[d] = { day: d, plan, marks: m, frozen: !!x.frozen, closed: x.closed ?? true, perfect: marks.length > 0 && missed.length === 0, missedMain: missed }
  }
  return { days: out as GameState['days'], moneyKills: [] }
}

const goal = (over: Partial<WeekGoal>): WeekGoal => ({ id: Math.random().toString(36).slice(2), week: '2026-11-23', title: 'Цель', order: 0, createdAt: 1, updatedAt: 1, ...over })

describe('13 недель: calendar', () => {
  it('weeks follow the 04:00 game day: Monday 03:59 is still the previous week', () => {
    expect(arcWeekOf(gameDayOf(localAt('2026-11-30', 3, 59)))).toBe(1)
    expect(arcWeekOf(gameDayOf(localAt('2026-11-30', 4, 0)))).toBe(2)
    expect(arcWeekOf('2026-11-23')).toBe(1)
    expect(arcWeekOf('2026-11-22')).toBe(0)
  })

  it('week 13 ends on 21 Feb, week 14 is the final week, then after', () => {
    expect(BATTLE_END).toBe('2027-02-21')
    expect(arcWeekOf('2027-02-21')).toBe(13)
    expect(arcPos('2027-02-21')).toMatchObject({ phase: 'battle', week: 13, day: 91, daysLeft: 0 })
    expect(arcWeekOf('2027-02-22')).toBe(14)
    expect(arcPos('2027-02-28')).toMatchObject({ phase: 'final', week: 14 })
    expect(arcPos('2027-03-01')).toMatchObject({ phase: 'after', week: 15 })
    expect(arcPos('2026-11-20')).toMatchObject({ phase: 'warmup', untilStart: 3, day: 0 })
    expect(arcPos('2026-11-23')).toMatchObject({ phase: 'battle', week: 1, day: 1, daysLeft: 90 })
  })

  it('grid: 14 rows of 7, closed / frozen / missed / today / future', () => {
    const g = game({ '2026-11-23': { marks: ['done'] }, '2026-11-24': { marks: ['skip'], frozen: true }, '2026-11-25': { marks: ['skip'] }, '2026-11-26': { marks: [undefined], closed: false } })
    const grid = arcGrid(g, '2026-11-26')
    expect(grid).toHaveLength(14)
    expect(grid.every((w) => w.days.length === 7)).toBe(true)
    expect(grid[0].days.map((c) => c.state)).toEqual(['done', 'frozen', 'miss', 'open', 'future', 'future', 'future'])
    expect(grid[13].days[0].day).toBe('2027-02-22')
  })
})

describe('13 недель: week score', () => {
  it('mains: done 1, mini 0.5, skip 0, only days up to today, frozen days left out', () => {
    const g = game({
      '2026-11-23': { marks: ['done', 'mini'] },
      '2026-11-24': { marks: ['skip', 'done'], frozen: true },
      '2026-11-25': { marks: ['done', undefined] },
      '2026-11-27': { marks: ['done', 'done'] },
    })
    const s = weekScore({ weekGoals: [] }, g, 1, '2026-11-25')
    expect(s.mains).toEqual({ done: 2.5, planned: 4 })
    expect(s.score).toBeCloseTo(0.625)
    expect(s.current).toBe(true)
    expect(s.ended).toBe(false)
  })

  it('week goals: done 1, numeric = min(1, progress/target)', () => {
    const weekGoals = [goal({ done: true }), goal({ target: 100, progress: 40 }), goal({ target: 10, progress: 15 }), goal({}), goal({ week: '2026-11-30' })]
    const s = weekScore({ weekGoals }, game({}), 1, '2026-11-29')
    expect(s.goals).toEqual({ done: 2.4, planned: 4 })
  })

  it('a week is won at ≥ 85% once it ended', () => {
    const days: Record<string, DayIn> = {}
    // 7 days × 2 mains, 12 of 14 done = 85.7%
    for (let i = 0; i < 7; i++) days[addDays('2026-11-23', i)] = { marks: i < 2 ? ['done', 'skip'] : ['done', 'done'] }
    const g = game(days)
    expect(weekScore({}, g, 1, '2026-11-29')).toMatchObject({ won: false, onTrack: true, ended: false })
    expect(weekScore({}, g, 1, '2026-11-30')).toMatchObject({ won: true, ended: true })
    // 11 of 14 = 78.6% → lost
    const lost = game({ ...days, '2026-11-25': { marks: ['done', 'skip'] } })
    expect(weekScore({}, lost, 1, '2026-11-30').won).toBe(false)
    // exactly 85%: 17 of 20
    const exact = weekScore({ weekGoals: Array.from({ length: 20 }, (_, i) => goal({ done: i < 17 })) }, game({}), 1, '2026-11-30')
    expect(exact.score).toBeCloseTo(0.85)
    expect(exact.won).toBe(true)
  })

  it('the won-weeks streak: lost weeks reset, the current week never breaks it', () => {
    const s = (week: number, won: boolean, ended = true) => ({ week, won, ended }) as WeekScore
    expect(wonStreak([s(1, true), s(2, false), s(3, true), s(4, true), s(5, false, false)])).toEqual({ run: 2, best: 2, won: 3, passed: 4 })
    expect(wonStreak([s(1, true), s(2, true), s(3, true), s(4, false)])).toEqual({ run: 0, best: 3, won: 3, passed: 4 })
    // week 14 is outside the battle count
    expect(wonStreak([s(13, true), s(14, false)]).run).toBe(1)
  })
})

describe('13 недель: totals', () => {
  it('sums actions, counts the wasted ones, closed days, weeks and money', () => {
    const g = game({
      '2026-11-23': { marks: ['done', 'done'] },
      '2026-11-24': { marks: ['done', 'skip'] },
      '2026-11-25': { marks: ['skip', 'skip'], frozen: true },
      '2026-11-30': { marks: ['mini', undefined], closed: false },
    })
    g.moneyKills = [{ month: '2026-11', id: 'b500', day: '2026-11-24', at: 1 }]
    const weekGoals = [goal({ done: true }), goal({ target: 10, progress: 5 }), goal({ week: '2026-11-30' })]
    const t = arcTotals({ weekGoals, incomes: [{ id: 'i', day: '2026-11-24', at: 1, amount: 5000 }] }, g, '2026-11-30')
    // mains 3 + 0.5, goals 1 + 0.5 + 0
    expect(t.done).toBe(5)
    expect(t.planned).toBe(9)
    // 1 missed main on a closed day + 1 unfinished goal of the ended week 1 (week 2's goal is still open)
    expect(t.wasted).toBe(2)
    expect(t.closedDays).toBe(1)
    expect(t.weeksPassed).toBe(1)
    expect(t.money).toEqual({ rub: 5000, kills: 1 })
    expect(t.conqueror).toEqual({ closed: 1, need: 70 })
    expect(arcTotals({ weekGoals }, g, '2026-11-30').money).toBeUndefined()
  })

  it('works on a real replay', () => {
    const d = makeData()
    d.profile!.onboardDay = '2026-11-23'
    const now = nowAt('2026-11-25', 12)
    const st = computeState(d, now)
    const scores = arcScores(d, st, '2026-11-25')
    expect(scores).toHaveLength(14)
    expect(scores[0].mains.planned).toBeGreaterThan(0)
    expect(scores[1].planned).toBe(0)
  })
})

describe('13 недель: tactics → week goals', () => {
  const T = at('2026-11-30', 9)
  const arc = (): ArcGoal => ({
    id: 'a1',
    title: '$10k в месяц',
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    tactics: [
      { id: 't1', title: 'Сообщения лидам', target: 100, unit: 'сообщ.', createdAt: 1 },
      { id: 't2', title: 'Созвон с ментором', createdAt: 1 },
    ],
  })

  it('creates this week’s copies once, idempotent', () => {
    const d = { arcGoals: [arc()], weekGoals: [] as WeekGoal[] }
    const a = materializeTactics(d, '2026-11-30', T)!
    expect(a.weekGoals.map((g) => [g.id, g.week, g.title, g.target, g.tacticId])).toEqual([
      [tacticGoalId('t1', '2026-11-30'), '2026-11-30', 'Сообщения лидам', 100, 't1'],
      [tacticGoalId('t2', '2026-11-30'), '2026-11-30', 'Созвон с ментором', undefined, 't2'],
    ])
    expect(a.arcGoals![0].tactics[0].made).toEqual(['2026-11-30'])
    expect(materializeTactics(a, '2026-12-03', T)).toBeNull()
    // next Monday: new copies
    const b = materializeTactics(a, '2026-12-07', T)!
    expect(b.weekGoals).toHaveLength(4)
  })

  it('a deleted or edited copy is never recreated', () => {
    const a = materializeTactics({ arcGoals: [arc()], weekGoals: [] as WeekGoal[] }, '2026-11-30', T)!
    const deleted = { ...a, weekGoals: a.weekGoals.filter((g) => g.tacticId !== 't1').map((g) => ({ ...g, title: 'Свой созвон' })) }
    expect(materializeTactics(deleted, '2026-12-01', T)).toBeNull()
  })

  it('a tactic added mid-week joins this week; an existing copy is not duplicated', () => {
    const a = materializeTactics({ arcGoals: [arc()], weekGoals: [] as WeekGoal[] }, '2026-11-30', T)!
    const g = a.arcGoals![0]
    const withNew = { ...a, arcGoals: [{ ...g, tactics: [...g.tactics, { id: 't3', title: 'Посты', target: 15, createdAt: 2 }, { id: 't4', title: 'Старая', createdAt: 2 }] }], weekGoals: [...a.weekGoals, goal({ id: 'x', week: '2026-11-30', tacticId: 't4' })] }
    const b = materializeTactics(withNew, '2026-12-02', T)!
    expect(b.weekGoals.filter((x) => x.tacticId === 't3')).toHaveLength(1)
    expect(b.weekGoals.filter((x) => x.tacticId === 't4')).toHaveLength(1)
    expect(b.arcGoals![0].tactics.every((t) => t.made?.includes('2026-11-30'))).toBe(true)
  })

  it('only during the battle weeks; private goals make private copies', () => {
    expect(materializeTactics({ arcGoals: [arc()], weekGoals: [] }, '2026-11-22', T)).toBeNull()
    expect(materializeTactics({ arcGoals: [arc()], weekGoals: [] }, '2027-02-22', T)).toBeNull()
    const p = materializeTactics({ arcGoals: [{ ...arc(), private: true }], weekGoals: [] as WeekGoal[] }, '2027-02-21', T)!
    expect(p.weekGoals.every((g) => g.private && g.week === '2027-02-15')).toBe(true)
  })

  it('counts weeks whose tactics were all done', () => {
    const g = arc()
    const weekGoals = [
      goal({ week: '2026-11-23', tacticId: 't1', done: true }),
      goal({ week: '2026-11-23', tacticId: 't2', done: true }),
      goal({ week: '2026-11-30', tacticId: 't1', target: 100, progress: 50 }),
      goal({ week: '2026-12-07', tacticId: 't2', done: true }),
      goal({ week: '2026-12-07', title: 'не тактика' }),
    ]
    expect(tacticWeeks({ weekGoals }, g, '2026-12-08')).toEqual({ done: 2, total: 3 })
  })

  it('sanitizes: bad tactics dropped, duplicates and limits cut', () => {
    const x = sanitizeArcGoal({ id: 'a', title: '  Цель  ', order: 1, tactics: [{ id: 't', title: 'Ок', target: -1, unit: 'u', made: ['2026-12-02', 'bad'] }, { id: 't', title: 'дубль' }, { title: 'без id' }] })!
    expect(x.title).toBe('Цель')
    expect(x.tactics).toEqual([{ id: 't', title: 'Ок', createdAt: 0, made: ['2026-11-30'] }])
    expect(sanitizeArcGoal({ id: 'b', title: '' })).toBeNull()
  })
})

describe('13 недель: sync and privacy', () => {
  class Device {
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
    sync(server: { doc: SyncDoc | null }) {
      const r = mergeDocs(this.data, this.meta, server.doc)
      this.data = r.data
      this.meta = r.meta
      if (r.remoteChanged || !server.doc) server.doc = { v: 1, data: structuredClone(this.data), ...structuredClone(this.meta) }
    }
  }
  const ag = (id: string, title: string, order = 0): ArcGoal => ({ id, title, tactics: [{ id: `${id}t`, title: 'Тактика', createdAt: 1 }], order, createdAt: 1, updatedAt: 1 })

  it('arc goals merge per goal: both devices’ goals survive, a later edit wins, deletes travel', () => {
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(makeData())
    const mac = new Device(makeData())
    phone.edit(10, (d) => void (d.arcGoals = [ag('g1', 'Деньги')]))
    phone.sync(server)
    mac.sync(server)
    mac.edit(20, (d) => void d.arcGoals!.push(ag('g2', 'Тело', 1)))
    phone.edit(30, (d) => void (d.arcGoals![0] = { ...d.arcGoals![0], title: 'Деньги $10k', updatedAt: 30 }))
    mac.sync(server)
    phone.sync(server)
    mac.sync(server)
    expect(phone.data.arcGoals!.map((g) => g.title)).toEqual(['Деньги $10k', 'Тело'])
    expect(mac.data.arcGoals).toEqual(phone.data.arcGoals)
    mac.edit(40, (d) => void (d.arcGoals = d.arcGoals!.filter((g) => g.id !== 'g2')))
    mac.sync(server)
    phone.sync(server)
    expect(phone.data.arcGoals!.map((g) => g.id)).toEqual(['g1'])
  })

  it('two devices materializing the same week converge on one copy', () => {
    const base = makeData()
    base.arcGoals = [ag('g1', 'Деньги')]
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(base)
    const mac = new Device(base)
    phone.sync(server)
    mac.sync(server)
    phone.edit(50, (d) => Object.assign(d, materializeTactics(d, '2026-11-30', 50)))
    mac.edit(60, (d) => Object.assign(d, materializeTactics(d, '2026-11-30', 60)))
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)
    expect(phone.data.weekGoals!.filter((g) => g.tacticId === 'g1t')).toHaveLength(1)
    expect(normalizeData(phone.data).arcGoals![0].tactics[0].made).toEqual(['2026-11-30'])
  })

  it('public stats never carry arc goals', () => {
    const d = makeData()
    d.profile!.onboardDay = '2026-11-23'
    d.arcGoals = [{ ...ag('g1', 'СЕКРЕТ-АРКИ'), tactics: [{ id: 'x', title: 'СЕКРЕТ-ТАКТИКИ', createdAt: 1 }] }]
    const now = nowAt('2026-11-25', 10)
    const json = JSON.stringify(buildPublicStats(d, computeState(d, now), now))
    expect(json).not.toMatch(/СЕКРЕТ|arcGoals|tactic/)
  })
})
