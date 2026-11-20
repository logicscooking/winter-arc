import { describe, expect, it } from 'vitest'
import {
  PLINKO_FREE,
  PLINKO_MAX,
  PLINKO_POOL,
  PLINKO_RISKS,
  PLINKO_RISK_IDS,
  PLINKO_TIERS,
  ballsFor,
  ballsLeft,
  dropStreakMult,
  nextStreak,
  nextThrow,
  plinkoDrops,
  plinkoPath,
  plinkoPool,
  plinkoReward,
  plinkoSeed,
  plinkoStreaks,
  rollPlinko,
  sanitizeDrop,
  slotOfPath,
  slotsOf,
  streakMult,
  tierOfSlot,
  type PlinkoTier,
} from './plinko'
import { computeState } from './replay'
import { SPRITES } from '../pixel/sprites'
import { normalizeData } from './data'
import { mergeDocs, stampChanges, toAtoms, type SyncMeta } from './sync'
import { addDays, localAt } from './time'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData, DayKey, PlinkoDrop, PlinkoRisk } from './types'

const D1 = '2026-11-23'
const TIERS: PlinkoTier[] = [1, 2, 3, 4, 5]

/** a drop the way the screen records it */
function throwAt(data: AppData, day: DayKey, n: number, h: number, m = 0, risk: PlinkoRisk = 'mid'): PlinkoDrop {
  const when = localAt(day, h, m)
  const r = rollPlinko(day, n, plinkoSeed(data), when, risk)
  const drop: PlinkoDrop = { n, at: when.getTime(), slot: r.slot, taskId: r.task.id, risk }
  ;(log(data, day).plinko ??= {})[String(n)] = drop
  return drop
}

/** tier frequencies over many throws */
function tierFreq(risk: PlinkoRisk, total = 20000) {
  const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const slots = new Array(slotsOf(risk)).fill(0)
  for (let i = 0; i < total; i++) {
    const s = slotOfPath(plinkoPath(addDays(D1, i % 1000), Math.floor(i / 1000) % PLINKO_MAX, `seed${Math.floor(i / 6000)}`, risk))
    slots[s]++
    tiers[tierOfSlot(s, risk)]++
  }
  for (const t of TIERS) tiers[t] /= total
  return { tiers, slots }
}
const meanXp = (f: Record<number, number>) => TIERS.reduce((a, t) => a + f[t] * PLINKO_TIERS[t].xp, 0)

describe('Плинко: доска, тиры, риски', () => {
  it('средний риск: 9 лунок, тир симметричен — центр 1, края 5', () => {
    expect(slotsOf('mid')).toBe(9)
    expect(PLINKO_RISKS.mid.tiers).toEqual([5, 4, 3, 2, 1, 2, 3, 4, 5])
    for (const risk of PLINKO_RISK_IDS) {
      const n = slotsOf(risk)
      expect(PLINKO_RISKS[risk].tiers).toHaveLength(n)
      for (let s = 0; s < n; s++) expect(tierOfSlot(s, risk)).toBe(tierOfSlot(n - 1 - s, risk))
    }
    expect(slotsOf('low')).toBeLessThan(slotsOf('mid'))
    expect(slotsOf('high')).toBeGreaterThan(slotsOf('mid'))
  })

  it('множители лунок ×1 в центре … ×10 на краях = множитель XP задания', () => {
    expect(PLINKO_TIERS[1].mult).toBe(1)
    expect(PLINKO_TIERS[5].mult).toBe(10)
    for (const t of TIERS) expect(PLINKO_TIERS[t].xp).toBe(PLINKO_TIERS[1].xp * PLINKO_TIERS[t].mult)
    for (let i = 1; i < TIERS.length; i++) {
      const a = PLINKO_TIERS[TIERS[i - 1]]
      const b = PLINKO_TIERS[TIERS[i]]
      expect(b.xp).toBeGreaterThan(a.xp)
      expect(b.shards).toBeGreaterThanOrEqual(a.shards)
      expect(b.minutes).toBeGreaterThan(a.minutes)
    }
    // в масштабе экономики: край не дороже пары главных квестов
    expect(PLINKO_TIERS[5].xp).toBeLessThanOrEqual(40)
  })

  it('средний риск: частоты биномиальные — лёгкие часто, тяжёлые редко', () => {
    const { tiers, slots } = tierFreq('mid')
    const expected = { 1: 70 / 256, 2: 112 / 256, 3: 56 / 256, 4: 16 / 256, 5: 2 / 256 }
    for (const t of TIERS) expect(Math.abs(tiers[t] - expected[t as PlinkoTier])).toBeLessThan(0.02)
    expect(slots[4]).toBeGreaterThan(slots[2])
    expect(slots[2]).toBeGreaterThan(slots[0])
    const left = slots.slice(0, 4).reduce((a, b) => a + b, 0)
    const right = slots.slice(5).reduce((a, b) => a + b, 0)
    expect(Math.abs(left - right) / 20000).toBeLessThan(0.03)
  })

  it('низкий риск: шар почти всегда в центре, лёгкие задания', () => {
    const { tiers } = tierFreq('low')
    expect(tiers[1]).toBeGreaterThan(0.72) // 50/64
    expect(tiers[4] + tiers[5]).toBe(0)
  })

  it('высокий риск: жирнее по XP, края чаще, лёгких нет', () => {
    const low = tierFreq('low').tiers
    const mid = tierFreq('mid').tiers
    const high = tierFreq('high').tiers
    expect(high[1]).toBe(0)
    expect(high[5]).toBeGreaterThan(mid[5])
    expect(high[4] + high[5]).toBeGreaterThan(mid[4] + mid[5])
    expect(meanXp(low)).toBeLessThan(meanXp(mid))
    expect(meanXp(mid)).toBeLessThan(meanXp(high))
  })
})

describe('Плинко: детерминизм', () => {
  it('путь — хэш дня, номера броска, seed и риска: тот же вход → тот же путь', () => {
    for (const risk of PLINKO_RISK_IDS) {
      const a = plinkoPath(D1, 0, '2026-11-20', risk)
      expect(a).toHaveLength(PLINKO_RISKS[risk].rows)
      expect(plinkoPath(D1, 0, '2026-11-20', risk)).toEqual(a)
      expect(rollPlinko(D1, 0, 's', nowAt(D1, 12), risk)).toEqual(rollPlinko(D1, 0, 's', nowAt(D1, 12), risk))
      const r = rollPlinko(D1, 1, 's', nowAt(D1, 12), risk)
      expect(r.slot).toBe(r.path.filter((x) => x === 'R').length)
      expect(r.tier).toBe(tierOfSlot(r.slot, risk))
      expect(r.task.tier).toBe(r.tier)
    }
  })

  it('другой бросок, день, игрок или риск — другой путь (хотя бы иногда)', () => {
    const key = (p: string[]) => p.join('')
    const set = new Set<string>()
    for (let i = 0; i < 30; i++) set.add(key(plinkoPath(addDays(D1, i), 0, 'x')))
    expect(set.size).toBeGreaterThan(20)
    let diffN = 0
    let diffSeed = 0
    let diffRisk = 0
    for (let i = 0; i < 30; i++) {
      const d = addDays(D1, i)
      if (key(plinkoPath(d, 0, 'x')) !== key(plinkoPath(d, 1, 'x'))) diffN++
      if (key(plinkoPath(d, 0, 'x')) !== key(plinkoPath(d, 0, 'y'))) diffSeed++
      if (key(plinkoPath(d, 0, 'x', 'low')) !== key(plinkoPath(d, 0, 'x', 'mid').slice(0, 6))) diffRisk++
    }
    expect(diffN).toBeGreaterThan(20)
    expect(diffSeed).toBeGreaterThan(20)
    expect(diffRisk).toBeGreaterThan(20)
  })
})

describe('Плинко: пул заданий', () => {
  it('6–10 заданий на тир, id уникальны, у всех подсказка и пиксельная иконка', () => {
    for (const t of TIERS) {
      const n = PLINKO_POOL.filter((x) => x.tier === t).length
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(10)
    }
    expect(new Set(PLINKO_POOL.map((x) => x.id)).size).toBe(PLINKO_POOL.length)
    for (const x of PLINKO_POOL) expect(x.hint.length).toBeGreaterThan(5)
    for (const x of PLINKO_POOL) expect(Object.keys(SPRITES)).toContain(x.icon)
  })

  it('в любой час в каждом тире есть из чего выбрать', () => {
    for (let h = 0; h < 24; h++) for (const t of TIERS) expect(plinkoPool(t, h).length).toBeGreaterThanOrEqual(2)
  })

  it('после 21:00 нет бодрящего: холодного душа, тренировок, долгих прогулок', () => {
    const energizing = ['cold', 'workout30', 'squats100', 'walk30', 'walk60', 'focus60', 'stairs', 'light10']
    for (const h of [21, 22, 23, 0, 1, 2, 3]) {
      const ids = TIERS.flatMap((t) => plinkoPool(t, h).map((x) => x.id))
      for (const id of energizing) expect(ids).not.toContain(id)
      expect(ids).not.toContain('noscreen')
    }
  })

  it('утром нет вечерних заданий, вечером нет утренних', () => {
    const evening = ['journal', 'plan3', 'early', 'noscreen']
    for (const h of [5, 7, 9, 11]) {
      const ids = TIERS.flatMap((t) => plinkoPool(t, h).map((x) => x.id))
      for (const id of evening) expect(ids).not.toContain(id)
      expect(ids).toContain('bed')
    }
    const night = TIERS.flatMap((t) => plinkoPool(t, 22).map((x) => x.id))
    expect(night).not.toContain('bed')
    expect(night).toContain('journal')
  })

  it('выпавшее задание всегда подходит под час броска', () => {
    for (let i = 0; i < 200; i++) {
      const h = i % 24
      const risk = PLINKO_RISK_IDS[i % 3]
      const r = rollPlinko(addDays(D1, i), i % 2, 'z', localAt(addDays(D1, i), h), risk)
      expect(plinkoPool(r.tier, h).map((x) => x.id)).toContain(r.task.id)
    }
  })
})

describe('Плинко: награда только после «Сделал», через replay', () => {
  it('в срок — полная награда, после таймера — половина', () => {
    const drop = { at: at(D1, 10), slot: 0 } // mid edge → tier 5
    const t5 = PLINKO_TIERS[5]
    expect(plinkoReward(drop, at(D1, 10, 30))).toEqual({ xp: t5.xp, shards: t5.shards, inTime: true })
    expect(plinkoReward(drop, at(D1, 10) + t5.minutes * 60_000)).toMatchObject({ inTime: true })
    expect(plinkoReward(drop, at(D1, 14))).toEqual({ xp: Math.floor(t5.xp / 2), shards: Math.floor(t5.shards / 2), inTime: false })
    // the streak multiplies XP only
    expect(plinkoReward(drop, at(D1, 10, 30), 1.2)).toEqual({ xp: Math.round(t5.xp * 1.2), shards: t5.shards, inTime: true })
  })

  it('бросок сам по себе ничего не даёт; «Сделал» — XP в стат задания и ❄', () => {
    const data = makeData()
    const base = computeState(data, nowAt(D1, 20))
    const drop = throwAt(data, D1, 0, 10)
    expect(computeState(data, nowAt(D1, 20)).xp).toBe(base.xp)
    expect(computeState(data, nowAt(D1, 20)).shards).toBe(base.shards)
    const tier = tierOfSlot(drop.slot)
    const task = PLINKO_POOL.find((x) => x.id === drop.taskId)!
    drop.doneAt = drop.at + 60_000
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xp - base.xp).toBe(PLINKO_TIERS[tier].xp)
    expect(st.xpByStat[task.stat] - base.xpByStat[task.stat]).toBe(PLINKO_TIERS[tier].xp)
    expect(st.shards - base.shards).toBe(PLINKO_TIERS[tier].shards)
    drop.doneAt = drop.at + (PLINKO_TIERS[tier].minutes + 1) * 60_000
    expect(computeState(data, nowAt(D1, 20)).xp - base.xp).toBe(Math.floor(PLINKO_TIERS[tier].xp / 2))
  })
})

describe('Плинко: шары', () => {
  it('2 бесплатных в день, потом шары кончаются', () => {
    const data = makeData()
    expect(PLINKO_FREE).toBe(2)
    expect(ballsLeft(data.days[D1], false)).toBe(2)
    expect(nextThrow(data.days[D1], false)).toBe(0)
    throwAt(data, D1, 0, 9)
    throwAt(data, D1, 1, 9, 30)
    expect(ballsLeft(data.days[D1], false)).toBe(0)
    expect(nextThrow(data.days[D1], false)).toBeNull()
    expect(ballsLeft(data.days[addDays(D1, 1)], false)).toBe(2)
  })

  it('+1 шар за задание в срок, +1 за все главные квесты; просрочка и «Позже» шар не дают', () => {
    const data = makeData()
    const a = throwAt(data, D1, 0, 9)
    const b = throwAt(data, D1, 1, 9, 5)
    a.doneAt = a.at + 60_000
    expect(ballsFor(data.days[D1], false)).toBe(3)
    expect(ballsLeft(data.days[D1], false)).toBe(1)
    expect(ballsFor(data.days[D1], true)).toBe(4)
    // b closed late: no ball
    b.doneAt = b.at + 5 * 3600_000
    expect(ballsFor(data.days[D1], false)).toBe(3)
    // «Позже» then done in time: no ball either
    const c = throwAt(data, D1, 2, 11)
    c.laterAt = c.at + 1000
    c.doneAt = c.at + 60_000
    expect(ballsFor(data.days[D1], false)).toBe(3)
  })

  it('максимум 6 шаров в день; лишние броски выбрасываются', () => {
    const data = makeData()
    for (let n = 0; n < PLINKO_MAX; n++) {
      const d = throwAt(data, D1, n, 9 + n)
      d.doneAt = d.at + 60_000
    }
    expect(ballsFor(data.days[D1], true)).toBe(PLINKO_MAX)
    expect(ballsLeft(data.days[D1], true)).toBe(0)
    expect(nextThrow(data.days[D1], true)).toBeNull()
    log(data, D1).plinko!['6'] = { n: 6, at: at(D1, 20), slot: 0, taskId: 'focus60', doneAt: at(D1, 20, 5) }
    expect(plinkoDrops(data.days[D1])).toHaveLength(PLINKO_MAX)
    expect(normalizeData(data).days[D1].plinko?.['6']).toBeUndefined()
  })
})

describe('Плинко: серия ×1,2 … ×2', () => {
  it('множитель растёт на 0,2 за каждое задание в срок и упирается в ×2', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(streakMult)).toEqual([1, 1.2, 1.4, 1.6, 1.8, 2, 2])
  })

  it('в срок → следующий бросок ×1,2; «Позже» или просрочка сбрасывают', () => {
    const data = makeData()
    const a = throwAt(data, D1, 0, 9)
    a.doneAt = a.at + 60_000
    expect(nextStreak(data.days, at(D1, 10))).toBe(1)
    const b = throwAt(data, D1, 1, 10)
    expect(dropStreakMult(data.days, D1, 1)).toBe(1.2)
    b.doneAt = b.at + 60_000
    const c = throwAt(data, D1, 2, 11)
    expect(dropStreakMult(data.days, D1, 2)).toBe(1.4)
    // replay pays the streak: c in time = tier XP × 1.4
    const before = computeState(data, nowAt(D1, 22)).xp
    c.doneAt = c.at + 60_000
    expect(computeState(data, nowAt(D1, 22)).xp - before).toBe(Math.round(PLINKO_TIERS[tierOfSlot(c.slot)].xp * 1.4))
    // «Позже» on c (before it was done) → the next throw starts from ×1
    c.laterAt = c.at + 1000
    expect(nextStreak(data.days, at(D1, 12))).toBe(0)
    delete c.laterAt
    // expired → reset as well
    c.doneAt = c.at + 5 * 3600_000
    expect(nextStreak(data.days, at(D1, 22))).toBe(0)
    // a still open task does not carry the streak into a throw made meanwhile
    delete c.doneAt
    expect(nextStreak(data.days, at(D1, 11, 5))).toBe(0)
  })

  it('серия идёт через дни и детерминирована', () => {
    const data = makeData()
    for (let i = 0; i < 7; i++) {
      const d = throwAt(data, addDays(D1, i), 0, 10)
      d.doneAt = d.at + 60_000
    }
    const s = plinkoStreaks(data.days)
    expect(s.get(`${addDays(D1, 6)}:0`)).toBe(6)
    expect(dropStreakMult(data.days, addDays(D1, 6), 0)).toBe(2)
    expect(plinkoStreaks(structuredClone(data.days))).toEqual(s)
  })
})

describe('Плинко: данные и синк', () => {
  it('битые броски чистятся, старые данные без plinko не меняются', () => {
    expect(sanitizeDrop({ n: 0, at: 1, slot: 9, taskId: 'x' })).toBeNull()
    expect(sanitizeDrop({ n: 0, at: 1, slot: 10, taskId: 'x', risk: 'high' })).toEqual({ n: 0, at: 1, slot: 10, taskId: 'x', risk: 'high' })
    expect(sanitizeDrop({ n: 0, at: 1, slot: 4, taskId: 'water', doneAt: 'x' })).toEqual({ n: 0, at: 1, slot: 4, taskId: 'water' })
    const old = makeData()
    log(old, D1).destiny = { ref: 'quest', id: 'water', startedAt: at(D1, 10), minutes: 25 }
    const back = normalizeData(JSON.parse(JSON.stringify(old)))
    expect(back.days[D1].plinko).toBeUndefined()
    expect(back.days[D1].destiny).toEqual(old.days[D1].destiny)
  })

  it('броски двух устройств сливаются по одному, «Сделал» не теряется', () => {
    const start = makeData()
    const devA = { data: structuredClone(start), meta: { stamps: {}, tombs: {} } as SyncMeta }
    const devB = { data: structuredClone(start), meta: { stamps: {}, tombs: {} } as SyncMeta }
    const edit = (dev: typeof devA, now: number, fn: (d: AppData) => void) => {
      const next = structuredClone(dev.data)
      fn(next)
      dev.meta = stampChanges(toAtoms(dev.data), toAtoms(next), dev.meta, now)
      dev.data = next
    }
    edit(devA, at(D1, 9), (d) => void throwAt(d, D1, 0, 9))
    edit(devA, at(D1, 9, 5), (d) => void (d.days[D1].plinko!['0'].doneAt = at(D1, 9, 5)))
    edit(devB, at(D1, 10), (d) => void throwAt(d, D1, 1, 10, 0, 'high'))
    expect(Object.keys(toAtoms(devA.data)).filter((k) => k.includes('plinko'))).toEqual([`days/${D1}/plinko/0`])

    const merged = mergeDocs(devB.data, devB.meta, { v: 1, data: devA.data, ...devA.meta })
    const p = merged.data.days[D1].plinko!
    expect(Object.keys(p).sort()).toEqual(['0', '1'])
    expect(p['0'].doneAt).toBe(at(D1, 9, 5))
    expect(p['1'].risk).toBe('high')
    const back = mergeDocs(devA.data, devA.meta, { v: 1, data: devB.data, ...devB.meta })
    expect(back.data.days[D1].plinko).toEqual(p)
  })

  it('звук — настройка устройства, риск синкается', () => {
    const d = makeData()
    d.settings.sound = false
    d.settings.plinkoRisk = 'high'
    const atoms = toAtoms(d)
    expect(atoms['settings/sound']).toBeUndefined()
    expect(atoms['settings/plinkoRisk']).toBe('high')
  })
})
