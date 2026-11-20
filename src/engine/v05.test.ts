import { describe, expect, it } from 'vitest'
import { CHANCE, balanceScore, chancePct, goalPace, pointsToNextRank, projectedGain, rankChance, weightedPace } from './chance'
import { DUEL, acceptedFrom, activeDuels, canChallenge, duelEnd, duelEvents, duelScores, duelStatus, incomingChallenges, newDuel, publicDuels, readyToSettle, safeDuels, settle } from './duels'
import type { DuelPub } from './duels'
import { heatLevel, heatmap } from './heatmap'
import { computeState } from './replay'
import { repeatStreak, skillView } from './skills'
import { buildPublicStats } from './social'
import { fromAtoms, mergeDocs, toAtoms } from './sync'
import { addDays, ARC_START } from './time'
import { at, makeData, mark, nowAt } from './testkit'
import type { AppData, Duel, Goal, Practice } from './types'

// ---------- fixtures ----------

function skillData(): AppData {
  const d = makeData()
  d.skills = [{ id: 'sk', title: 'Бег', stat: 'body', value: 'Бегу по набережной ранним утром, дыхание ровное', status: 'active', createdAt: at('2026-11-20', 9), order: 0 }]
  d.traits = [
    { id: 't1', skillId: 'sk', title: 'База', order: 0 },
    { id: 't2', skillId: 'sk', title: 'Техника', order: 1 },
  ]
  d.nodes = ['n1', 'n2', 'n3', 'n4'].map((id, i) => ({ id, skillId: 'sk', traitId: i < 2 ? 't1' : 't2', title: id, order: i % 2, createdAt: at('2026-11-20', 9) }))
  d.goals = []
  d.practices = []
  return d
}

const practice = (id: string, nodeId: string, day: string, note?: string): Practice => ({ id, skillId: 'sk', nodeId, day, at: at(day, 12) + Number(id.replace(/\D/g, '') || 0), ...(note ? { note } : {}) })

function withPractices(n: number, fb: boolean, today: string): AppData {
  const d = skillData()
  for (let i = 0; i < n; i++) d.practices!.push(practice(`p${i}`, ['n1', 'n2', 'n3', 'n4'][i % 4], addDays(today, -(i % 14)), fb ? 'лучше дыхание' : undefined))
  return d
}

// ---------- B1 rank chance ----------

describe('rank chance', () => {
  const today = '2026-12-10'
  const chanceOf = (d: AppData) => rankChance(d, skillView(d, 'sk', today)!, today)!

  it('stays within 1–99%', () => {
    expect(chancePct({ goalPace: 0, balance: 0, strikes: 10, gain: 0, need: 5, span: 5 })).toBe(CHANCE.min)
    expect(chancePct({ goalPace: 100, balance: 1, strikes: 0, gain: 1000, need: 1, span: 5 })).toBe(CHANCE.max)
    expect(chancePct({ goalPace: 0, balance: 0.5, strikes: 0, gain: 0, need: Infinity, span: Infinity })).toBe(CHANCE.min)
    for (let n = 0; n <= 60; n += 6) {
      const p = chanceOf(withPractices(n, true, today)).pct
      expect(p).toBeGreaterThanOrEqual(1)
      expect(p).toBeLessThanOrEqual(99)
    }
  })

  it('is monotone in practice pace, feedback, goals and strikes', () => {
    // while the target rank stays the same, more practices never lower the chance
    let prev = { pct: 0, target: 'C' }
    for (let n = 0; n <= 40; n++) {
      const c = chanceOf(withPractices(n, true, today))
      if (c.target === prev.target) expect(c.pct).toBeGreaterThanOrEqual(prev.pct)
      prev = c
    }
    for (let n = 1; n <= 28; n++) {
      const fb = chanceOf(withPractices(n, true, today))
      const no = chanceOf(withPractices(n, false, today))
      if (fb.target === no.target) expect(fb.pct).toBeGreaterThanOrEqual(no.pct)
    }
    const base = { balance: 0.5, gain: 4, need: 6, span: 7 }
    let last = 0
    for (let g = 0; g <= 10; g++) {
      const p = chancePct({ ...base, goalPace: g, strikes: 0 })
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
    let hi = 100
    for (let s = 0; s <= 3; s++) {
      const p = chancePct({ ...base, goalPace: 2, strikes: s })
      expect(p).toBeLessThanOrEqual(hi)
      hi = p
    }
    for (let gain = 0; gain <= 12; gain++) expect(chancePct({ ...base, goalPace: 0, strikes: 0, gain })).toBeGreaterThanOrEqual(chancePct({ ...base, goalPace: 0, strikes: 0, gain: Math.max(0, gain - 1) }))
  })

  it('weights feedback, counts only the last 14 days', () => {
    const list = [practice('p1', 'n1', today, 'хорошо пошло'), practice('p2', 'n1', today), practice('p3', 'n1', addDays(today, -14), 'старое')]
    expect(weightedPace(list, today)).toBe(1.5)
  })

  it('goal pace and the 60/30/10 balance', () => {
    const g = (id: string, type: Goal['type'], extra: Partial<Goal> = {}): Goal => ({ id, skillId: 'sk', type, title: id, createdAt: at('2026-11-20', 9), order: 0, ...extra })
    expect(goalPace([g('s', 'short', { checks: [{ day: today, at: 1 }, { day: addDays(today, -1), at: 2 }] }), g('m', 'mid', { doneDay: today, doneAt: 3 })], today)).toBe(4)
    const ideal = [...Array.from({ length: 6 }, (_, i) => g(`s${i}`, 'short')), ...Array.from({ length: 3 }, (_, i) => g(`m${i}`, 'mid')), g('l', 'long')]
    expect(balanceScore(ideal)).toBeCloseTo(1)
    expect(balanceScore([g('l1', 'long'), g('l2', 'long')])).toBeLessThan(0.5)
    expect(balanceScore([])).toBe(0.5)
  })

  it('needs points for the next rank and projects them onto the tree', () => {
    const d = skillData()
    const v = skillView(d, 'sk', today)!
    expect(pointsToNextRank(v)).toEqual({ target: 'C', need: 5, threshold: 5, floor: 0 })
    expect(projectedGain(d.nodes!, [], 0, today)).toBe(0)
    expect(projectedGain(d.nodes!, [], 4, today)).toBe(4)
    expect(projectedGain(d.nodes!, [], 12, today)).toBeGreaterThanOrEqual(8)
  })

  it('gives 2–3 «+N%» hints with positive deltas', () => {
    const d = withPractices(1, true, today)
    d.goals = [{ id: 's', skillId: 'sk', type: 'short', title: 'Выйти на 1 км', createdAt: at('2026-11-20', 9), order: 0, checks: [] }]
    const c = chanceOf(d)
    expect(c.target).toBe('C')
    expect(c.hints.length).toBeGreaterThanOrEqual(2)
    expect(c.hints.length).toBeLessThanOrEqual(3)
    expect(c.hints.every((h) => h.delta >= 1)).toBe(true)
    expect(c.hints.map((h) => h.text)).toContain('3 практики с отзывом')
  })

  it('returns null at rank S', () => {
    const d = skillData()
    const v = { ...skillView(d, 'sk', today)!, rank: 'S' as const }
    expect(rankChance(d, v, today)).toBeNull()
  })
})

// ---------- B2 repeat streak ----------

describe('repeat streak', () => {
  const goal = (checks: string[], since = '2026-11-23'): Goal => ({ id: 'r', skillId: 'sk', type: 'repeat', title: 'Бег 2 раза', perWeek: 2, since, createdAt: at(since, 9), order: 0, checks: checks.map((day, i) => ({ day, at: at(day, 10) + i })) })
  const wk = (w: number, d: number) => addDays(ARC_START, w * 7 + d)

  it('counts fulfilled weeks in a row, the current week once fulfilled', () => {
    const g = goal([wk(0, 0), wk(0, 2), wk(1, 1), wk(1, 3), wk(2, 0)])
    expect(repeatStreak(g, wk(2, 1))).toEqual({ current: 2, best: 2, thisWeek: false })
    g.checks!.push({ day: wk(2, 2), at: 1 })
    expect(repeatStreak(g, wk(2, 3))).toEqual({ current: 3, best: 3, thisWeek: true })
  })

  it('a missed week burns it, a frozen week does not, the best is kept', () => {
    const g = goal([wk(0, 0), wk(0, 1), wk(1, 0), wk(1, 1), wk(3, 0), wk(3, 1)])
    expect(repeatStreak(g, wk(3, 4))).toMatchObject({ current: 1, best: 2 })
    expect(repeatStreak(g, wk(3, 4), new Set([wk(2, 3)]))).toMatchObject({ current: 3, best: 3 })
    expect(repeatStreak({ ...g, bestStreak: 7 }, wk(3, 4)).best).toBe(7)
  })

  it('warm-up weeks are neutral', () => {
    const g = goal([wk(0, 0), wk(0, 1)], '2026-11-09')
    expect(repeatStreak(g, wk(0, 3)).current).toBe(1)
  })
})

// ---------- B3 heat map ----------

describe('heat map', () => {
  it('98 cells in 14 weeks, warm-up separate, levels by share of the best day', () => {
    const xp = { [ARC_START]: 100, [addDays(ARC_START, 1)]: 30, '2026-11-21': 50, [addDays(ARC_START, 5)]: 999 }
    const h = heatmap(xp, addDays(ARC_START, 2), '2026-11-20')
    expect(h.weeks).toHaveLength(14)
    expect(h.weeks.flat()).toHaveLength(98)
    expect(h.weeks[0][0]).toMatchObject({ day: ARC_START, xp: 100, level: 4 })
    expect(h.weeks[0][1].level).toBe(2)
    expect(h.weeks[0][5]).toMatchObject({ future: true, xp: 0, level: 0 })
    expect(h.warmup.map((c) => c.day)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(h.warmup[1]).toMatchObject({ warmup: true, level: 2 })
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 1000)).toBe(1)
  })
})

// ---------- B4 duels ----------

const A = 'aaaaaaaa-1111'
const B = 'bbbbbbbb-2222'
const C = 'cccccccc-3333'

describe('duels: validation', () => {
  it('safeDuels drops malformed entries and clamps scores', () => {
    const good = { id: 'duel-1', by: A, with: B, start: '2026-11-24', days: 3, metric: 'quests', at: 1, sc: [3, 99, -2, 5] }
    const out = safeDuels([good, { ...good, id: 'x' }, { ...good, id: 'd2', metric: 'xp' }, { ...good, id: 'd3', days: 30 }, { ...good, id: 'd4', start: 'вчера' }, { ...good, id: 'd5', by: B }, null, 'duel', { ...good }])
    expect(out).toEqual([{ ...good, sc: [3, 30, 0] }])
    expect(safeDuels('nope')).toEqual([])
    expect(safeDuels({ id: 1 })).toEqual([])
  })
})

describe('duels: lifecycle', () => {
  const today = '2026-11-23'
  const now = at(today, 12)
  const d = newDuel('duel-ab', A, B, today, now)
  const pub = (x: Duel, sc: number[] = []): DuelPub => ({ id: x.id, by: x.by, with: x.with, start: x.start, days: x.days, metric: 'quests', at: x.createdAt, sc })

  it('starts tomorrow, 3 days, expires in 24 h without an answer', () => {
    expect(d.start).toBe('2026-11-24')
    expect(duelEnd(d)).toBe('2026-11-26')
    expect(duelStatus(d, [], now + 3600_000, today)).toBe('pending')
    expect(duelStatus(d, [], now + DUEL.acceptMs + 1, '2026-11-24')).toBe('expired')
    expect(duelStatus(d, [pub(d)], now + 3600_000, today)).toBe('soon')
    expect(duelStatus(d, [pub(d)], now, '2026-11-25')).toBe('running')
    expect(duelStatus(d, [pub(d)], now, '2026-11-27')).toBe('ended')
    expect(duelStatus({ ...d, result: settle([1], [0], '2026-11-27', now) }, [], now, '2026-11-27')).toBe('done')
  })

  it('B sees the challenge in A’s card and accepts it', () => {
    const inc = incomingChallenges(A, [pub(d)], [], B, now + 1000)
    expect(inc).toHaveLength(1)
    const mine = acceptedFrom(inc[0], now + 2000)
    expect(mine).toMatchObject({ id: d.id, by: A, with: B, start: d.start, acceptedAt: now + 2000 })
    expect(incomingChallenges(A, [pub(d)], [mine], B, now + 3000)).toHaveLength(0)
    expect(incomingChallenges(A, [pub(d)], [], B, now + DUEL.acceptMs + 1)).toHaveLength(0)
    // not for someone else
    expect(incomingChallenges(A, [pub(d)], [], C, now)).toHaveLength(0)
  })

  it('max 1 active duel per pair and 2 per person', () => {
    const none = () => undefined
    expect(canChallenge([], A, B, [], none, now, today).ok).toBe(true)
    expect(canChallenge([d], A, B, [], none, now, today)).toMatchObject({ ok: false })
    const d2 = newDuel('duel-ac', A, C, today, now)
    expect(canChallenge([d, d2], A, 'dddddddd-4444', [], none, now, today)).toMatchObject({ ok: false })
    // the friend is busy with two others
    const theirs = [pub(newDuel('duel-b1', B, C, today, now)), pub(newDuel('duel-b2', B, 'eeeeeeee-5555', today, now))]
    expect(canChallenge([], A, B, theirs, none, now, today)).toMatchObject({ ok: false })
    // expired and declined ones free the slot
    expect(canChallenge([d], A, B, [], none, now + DUEL.acceptMs + 1, '2026-11-24').ok).toBe(true)
    expect(activeDuels([{ ...d, declined: true }], none, A, now, today)).toHaveLength(0)
  })

  it('scores are own closed quests per window day; the winner is computed from both sides', () => {
    const data = makeData()
    data.profile!.onboardDay = '2026-11-20'
    for (const q of data.quests.slice(0, 3)) mark(data, '2026-11-24', q.id)
    mark(data, '2026-11-25', data.quests[0].id)
    const game = computeState(data, nowAt('2026-11-25', 20))
    expect(duelScores(game, d)).toEqual([3, 1])
    expect(settle([3, 1, 2], [2, 2, 1], '2026-11-27', 5)).toMatchObject({ me: 6, them: 5, outcome: 'win' })
    expect(settle([1, 1], [2], '2026-11-27', 5).outcome).toBe('draw')
    expect(settle([0], [4], '2026-11-27', 5).outcome).toBe('loss')
  })

  it('settles only after the last day is closed and the other side has a later snapshot (or 2 days passed)', () => {
    expect(readyToSettle(d, true, '2026-11-26', '2026-11-26')).toBe(false)
    expect(readyToSettle(d, false, '2026-11-27', '2026-11-27')).toBe(false)
    expect(readyToSettle(d, true, '2026-11-26', '2026-11-27')).toBe(false)
    expect(readyToSettle(d, true, '2026-11-27', '2026-11-27')).toBe(true)
    expect(readyToSettle(d, true, undefined, '2026-11-28')).toBe(true)
  })

  it('a win gives +XP and ❄ once, deterministically through the replay', () => {
    const data = makeData()
    data.profile!.onboardDay = '2026-11-20'
    const base = computeState(data, nowAt('2026-11-28', 12))
    const won: Duel = { ...d, acceptedAt: now, result: settle([5], [3], '2026-11-27', at('2026-11-27', 18)) }
    data.duels = [won, { ...won }]
    expect(duelEvents(data)).toHaveLength(1)
    const s1 = computeState(data, nowAt('2026-11-28', 12))
    const s2 = computeState(structuredClone(data), nowAt('2026-11-28', 12))
    expect(s1.xp - base.xp).toBe(DUEL.xp)
    expect(s1.xpByStat.will - base.xpByStat.will).toBe(DUEL.xp)
    expect(s1.shards - base.shards).toBe(DUEL.shards)
    expect(s2.xp).toBe(s1.xp)
    data.duels = [{ ...won, result: { ...won.result!, outcome: 'loss' } }]
    expect(computeState(data, nowAt('2026-11-28', 12)).xp).toBe(base.xp)
  })

  it('public stats carry the duel with the own score, never declined or expired ones', () => {
    const data = makeData()
    data.profile!.onboardDay = '2026-11-20'
    mark(data, '2026-11-24', data.quests[0].id)
    data.duels = [
      { ...d, acceptedAt: now },
      { ...newDuel('duel-old', A, C, '2026-11-20', at('2026-11-20', 9)) },
      { ...newDuel('duel-no', B, A, today, now), acceptedAt: now, declined: true },
    ]
    const n = nowAt('2026-11-24', 20)
    const stats = buildPublicStats(data, computeState(data, n), n)
    expect(stats.duels).toEqual([{ id: 'duel-ab', by: A, with: B, start: '2026-11-24', days: 3, metric: 'quests', at: now, sc: [1] }])
    const game = computeState(data, n)
    expect(publicDuels({ duels: [] }, game, n.getTime())).toEqual([])
  })

  it('duels sync per item like the other collections', () => {
    const a = makeData()
    a.duels = [{ ...d }]
    const b = makeData()
    b.duels = [{ ...newDuel('duel-zz', A, C, today, now + 5) }]
    const merged = mergeDocs(a, { stamps: {}, tombs: {} }, { v: 1, data: b, stamps: {}, tombs: {} })
    expect(merged.data.duels?.map((x) => x.id).sort()).toEqual(['duel-ab', 'duel-zz'])
    expect(fromAtoms(toAtoms(a), a).duels).toEqual(a.duels)
  })
})
