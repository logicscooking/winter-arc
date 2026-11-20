import { describe, expect, it } from 'vitest'
import {
  BOARD_LEVELS,
  BOARD_SLOTS,
  BOARD_TIERS,
  PLINKO_BALLS,
  PLINKO_MAX,
  PLINKO_POOL,
  PLINKO_TIERS,
  ballsLeft,
  boardTier,
  dropJackpot,
  dropStreakMult,
  dropTier,
  isBoard,
  layoutBoard,
  levelOfSlot,
  nextStreak,
  nextThrow,
  plinkoDrops,
  plinkoPool,
  plinkoReward,
  plinkoStreaks,
  plinkoTaskById,
  refreshBoard,
  sanitizeDrop,
  streakMult,
  taskForSlot,
  type PlinkoTier,
} from './plinko'
import { SIM, SIM_SLOTS, SIM_WALLS, cryptoRand, pegX, pegY, randomDropParams, rollDrop, seededRand, simulateDrop, SIM_ROWS } from './plinkoSim'
import { computeState } from './replay'
import { SPRITES } from '../pixel/sprites'
import { normalizeData } from './data'
import { mergeDocs, stampChanges, toAtoms, type SyncMeta } from './sync'
import { addDays, localAt } from './time'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData, DayKey, PlinkoDrop } from './types'

const D1 = '2026-11-23'
const TIERS: PlinkoTier[] = [1, 2, 3, 4, 5]
/** slots per tier on the 16-slot board */
const NEED: Record<PlinkoTier, number> = { 1: 4, 2: 4, 3: 4, 4: 2, 5: 2 }

let seq = 1
/** a drop the way the screen records it: physics picks the slot, the day's board picks the task */
function throwAt(data: AppData, day: DayKey, n: number, h: number, m = 0, slot?: number): PlinkoDrop {
  const when = localAt(day, h, m)
  const l = log(data, day)
  l.plinkoBoard ??= layoutBoard(h, seededRand(seq++))
  const s = slot ?? rollDrop(seededRand(seq++)).slot
  const task = taskForSlot(l.plinkoBoard, s, h)
  const drop: PlinkoDrop = {
    n,
    at: when.getTime(),
    slot: s,
    taskId: task.id,
    v: 2,
  }
  ;(l.plinko ??= {})[String(n)] = drop
  return drop
}

/** many headless drops from a seeded PRNG */
function drops(total: number, seed = 7) {
  const rand = seededRand(seed)
  return Array.from({ length: total }, () => rollDrop(rand))
}

describe('Плинко v0.7: доска 16 лунок', () => {
  it('16 лунок, 8 уровней от центра: центр — тир 1, края — тир 5, симметрично', () => {
    expect(BOARD_SLOTS).toBe(16)
    expect(SIM_SLOTS).toBe(16)
    expect(BOARD_LEVELS).toHaveLength(8)
    expect(BOARD_TIERS).toHaveLength(16)
    expect([levelOfSlot(7), levelOfSlot(8), levelOfSlot(0), levelOfSlot(15)]).toEqual([0, 0, 7, 7])
    for (let k = 0; k < 16; k++) expect(boardTier(k)).toBe(boardTier(15 - k))
    expect(boardTier(7)).toBe(1)
    expect(boardTier(0)).toBe(5)
    for (let i = 1; i < 8; i++) expect(BOARD_LEVELS[i]).toBeGreaterThanOrEqual(BOARD_LEVELS[i - 1])
    for (const t of TIERS) expect(BOARD_TIERS.filter((x) => x === t)).toHaveLength(NEED[t])
  })

  it('тиры: ×1 в центре … ×10 на краях, таймеры и ❄ растут', () => {
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
    expect(PLINKO_TIERS[5].xp).toBeLessThanOrEqual(40)
  })
})

describe('Плинко v0.7: физика', () => {
  const N = 4000
  const all = drops(N)
  const hist = new Array(16).fill(0)
  for (const d of all) hist[d.slot]++
  const share = (ks: number[]) => ks.reduce((a, k) => a + hist[k], 0) / N

  it('тысячи бросков: колокол по 16 лункам, не вырожденный, симметричный', () => {
    // every slot gets balls, none takes them all
    for (let k = 0; k < 16; k++) expect(hist[k]).toBeGreaterThan(0)
    expect(Math.max(...hist) / N).toBeLessThan(0.2)
    // bell: the centre is the fattest, the edges the thinnest, monotone by pairs
    const pair = (lv: number) => share([7 - lv, 8 + lv])
    for (let lv = 0; lv < 7; lv++) expect(pair(lv) + 0.012).toBeGreaterThan(pair(lv + 1))
    expect(pair(0)).toBeGreaterThan(pair(3))
    expect(pair(3)).toBeGreaterThan(pair(6))
    expect(share([6, 7, 8, 9])).toBeGreaterThan(0.3)
    expect(share([0, 1, 14, 15])).toBeLessThan(0.12)
    expect(share([0, 15])).toBeGreaterThan(0.002) // jackpots happen
    expect(Math.abs(share([0, 1, 2, 3, 4, 5, 6, 7]) - share([8, 9, 10, 11, 12, 13, 14, 15]))).toBeLessThan(0.05)
    const mean = all.reduce((a, d) => a + d.slot, 0) / N
    expect(Math.abs(mean - 7.5)).toBeLessThan(0.3)
  })

  it('траектории разные: последовательности касаний почти не повторяются', () => {
    const keys = new Set(all.slice(0, 500).map((d) => d.hits.map((h) => `${h.row}:${h.j}`).join(',')))
    expect(keys.size).toBeGreaterThanOrEqual(495)
    // even the first few bounces branch out
    const first4 = new Set(
      all.map((d) =>
        d.hits
          .slice(0, 4)
          .map((h) => `${h.row}:${h.j}`)
          .join(','),
      ),
    )
    expect(first4.size).toBeGreaterThan(20)
  })

  it('чистая функция: те же начальные условия — та же траектория', () => {
    const p = randomDropParams(seededRand(99))
    const a = simulateDrop(p)
    const b = simulateDrop({ ...p })
    expect(b.slot).toBe(a.slot)
    expect(Array.from(b.xs)).toEqual(Array.from(a.xs))
    // a hair of difference at the start → another path (chaos)
    let differ = 0
    for (let i = 0; i < 50; i++) {
      const q = randomDropParams(seededRand(1000 + i))
      const r1 = simulateDrop(q)
      const r2 = simulateDrop({ ...q, x0: q.x0 + 0.05 })
      if (r1.hits.map((h) => h.j).join() !== r2.hits.map((h) => h.j).join()) differ++
    }
    expect(differ).toBeGreaterThan(35)
  })

  it('физично: шар отскакивает вверх, не проходит сквозь штырьки и стенки, падает 0,5–14 с', () => {
    let bounced = 0
    let secs = 0
    for (const d of all.slice(0, 400)) {
      secs += d.seconds
      expect(d.seconds).toBeGreaterThan(0.4)
      expect(d.seconds).toBeLessThan(14)
      expect(d.hits.length).toBeGreaterThan(2)
      let up = false
      for (let f = 1; f < d.frames; f++) {
        const x = d.xs[f]
        const y = d.ys[f]
        if (d.ys[f] < d.ys[f - 1] - 0.3) up = true
        expect(x).toBeGreaterThan(SIM.M - 0.5)
        expect(x).toBeLessThan(SIM.W - SIM.M + 0.5)
        // never inside a peg
        const r = Math.round((y - SIM.Y0) / SIM.DY)
        if (r >= 0 && r < SIM_ROWS) {
          const j = Math.round((x - SIM.CX) / SIM.S + (r + 2) / 2)
          if (j >= 0 && j <= r + 2) expect(Math.hypot(x - pegX(r, j), y - pegY(r))).toBeGreaterThan(SIM.pegR + SIM.ballR - 0.6)
        }
      }
      if (up) bounced++
      // landed where it stands
      expect(d.ys[d.frames - 1]).toBeGreaterThanOrEqual(SIM.landY)
    }
    expect(bounced / 400).toBeGreaterThan(0.6)
    expect(secs / 400).toBeGreaterThan(1.5)
    expect(secs / 400).toBeLessThan(5)
    expect(SIM_WALLS.length).toBe(4 + 15)
  })

  it('рандом из crypto: [0, 1), броски расходятся по лункам', () => {
    const xs = Array.from({ length: 200 }, () => cryptoRand())
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(new Set(xs).size).toBe(200)
    const slots = new Set(Array.from({ length: 200 }, () => rollDrop().slot))
    expect(slots.size).toBeGreaterThanOrEqual(8)
  })
})

describe('Плинко v0.7: раскладка заданий дня', () => {
  it('16 разных заданий, каждое под тир своей лунки и под час', () => {
    for (let h = 0; h < 24; h++) {
      for (let s = 0; s < 6; s++) {
        const b = layoutBoard(h, seededRand(h * 100 + s))
        expect(isBoard(b)).toBe(true)
        for (let k = 0; k < 16; k++) {
          const t = plinkoTaskById(b[k])!
          expect(t.tier).toBe(BOARD_TIERS[k])
          expect(plinkoPool(t.tier, h).map((x) => x.id)).toContain(t.id)
        }
      }
    }
  })

  it('раскладка случайна: разные броски кубика — разные доски', () => {
    const set = new Set(Array.from({ length: 40 }, (_, i) => layoutBoard(12, seededRand(i)).join()))
    expect(set.size).toBeGreaterThan(38)
    expect(layoutBoard(12, seededRand(5))).toEqual(layoutBoard(12, seededRand(5)))
  })

  it('перезаход не меняет доску; меняются только выпавшие и просроченные лунки', () => {
    const b = layoutBoard(10, seededRand(3))
    expect(refreshBoard(b, 10, [], seededRand(4))).toBeNull()
    // the task in slot 7 dropped: only slot 7 gets a new task of the same tier
    const r = refreshBoard(b, 10, [b[7]], seededRand(4))!
    expect(r).not.toBeNull()
    expect(isBoard(r)).toBe(true)
    for (let k = 0; k < 16; k++) if (k !== 7) expect(r[k]).toBe(b[k])
    expect(r[7]).not.toBe(b[7])
    expect(plinkoTaskById(r[7])!.tier).toBe(BOARD_TIERS[7])
    // a morning board in the evening: morning-only tasks are swapped out
    const morning = layoutBoard(7, seededRand(8))
    const eve = refreshBoard(morning, 22, [], seededRand(9)) ?? morning
    for (let k = 0; k < 16; k++) expect(plinkoPool(BOARD_TIERS[k], 22).map((x) => x.id)).toContain(eve[k])
    // broken → a fresh one
    expect(isBoard(refreshBoard(['water'], 12))).toBe(true)
  })

  it('задание лунки берётся из доски дня', () => {
    const b = layoutBoard(12, seededRand(11))
    for (let k = 0; k < 16; k++) expect(taskForSlot(b, k, 12).id).toBe(b[k])
    expect(taskForSlot(undefined, 0, 12).tier).toBe(5)
  })

  it('пул: в любой час хватает на 16 разных заданий; id уникальны, иконки есть, подпись короткая', () => {
    for (const t of TIERS) {
      const n = PLINKO_POOL.filter((x) => x.tier === t).length
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(12)
    }
    for (let h = 0; h < 24; h++) for (const t of TIERS) expect(plinkoPool(t, h).length).toBeGreaterThanOrEqual(NEED[t])
    expect(new Set(PLINKO_POOL.map((x) => x.id)).size).toBe(PLINKO_POOL.length)
    for (const x of PLINKO_POOL) {
      expect(x.hint.length).toBeGreaterThan(5)
      expect(Object.keys(SPRITES)).toContain(x.icon)
      expect(x.short.length).toBeGreaterThan(1)
      expect(x.short.length).toBeLessThanOrEqual(12)
    }
  })

  it('после 21:00 нет бодрящего, утром нет вечернего', () => {
    const energizing = ['cold', 'workout30', 'squats100', 'walk30', 'walk60', 'focus60', 'stairs', 'light10', 'noscreen']
    for (const h of [21, 22, 23, 0, 1, 2, 3]) {
      const ids = TIERS.flatMap((t) => plinkoPool(t, h).map((x) => x.id))
      for (const id of energizing) expect(ids).not.toContain(id)
    }
    const evening = ['journal', 'plan3', 'early', 'noscreen', 'phonebed']
    for (const h of [5, 7, 9, 11]) {
      const ids = TIERS.flatMap((t) => plinkoPool(t, h).map((x) => x.id))
      for (const id of evening) expect(ids).not.toContain(id)
      expect(ids).toContain('bed')
    }
  })
})

describe('Плинко: награда только после «Сделал», через replay', () => {
  it('в срок — полная награда, после таймера — половина', () => {
    const drop = { at: at(D1, 10), slot: 0, v: 2 as const } // edge → tier 5
    const t5 = PLINKO_TIERS[5]
    expect(plinkoReward(drop, at(D1, 10, 30))).toEqual({
      xp: t5.xp,
      shards: t5.shards,
      inTime: true,
    })
    expect(plinkoReward(drop, at(D1, 10) + t5.minutes * 60_000)).toMatchObject({
      inTime: true,
    })
    expect(plinkoReward(drop, at(D1, 14))).toEqual({
      xp: Math.floor(t5.xp / 2),
      shards: Math.floor(t5.shards / 2),
      inTime: false,
    })
    expect(plinkoReward(drop, at(D1, 10, 30), 1.2)).toEqual({
      xp: Math.round(t5.xp * 1.2),
      shards: t5.shards,
      inTime: true,
    })
    expect(dropJackpot(drop)).toBe(true)
    expect(dropJackpot({ slot: 8, v: 2 })).toBe(false)
  })

  it('бросок сам по себе ничего не даёт; «Сделал» — XP в стат задания и ❄ по сохранённой лунке', () => {
    const data = makeData()
    const base = computeState(data, nowAt(D1, 20))
    const drop = throwAt(data, D1, 0, 10)
    expect(computeState(data, nowAt(D1, 20)).xp).toBe(base.xp)
    const tier = dropTier(drop)
    expect(tier).toBe(BOARD_TIERS[drop.slot])
    const task = PLINKO_POOL.find((x) => x.id === drop.taskId)!
    drop.doneAt = drop.at + 60_000
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xp - base.xp).toBe(PLINKO_TIERS[tier].xp)
    expect(st.xpByStat[task.stat] - base.xpByStat[task.stat]).toBe(PLINKO_TIERS[tier].xp)
    expect(st.shards - base.shards).toBe(PLINKO_TIERS[tier].shards)
    drop.doneAt = drop.at + (PLINKO_TIERS[tier].minutes + 1) * 60_000
    expect(computeState(data, nowAt(D1, 20)).xp - base.xp).toBe(Math.floor(PLINKO_TIERS[tier].xp / 2))
    // the board can change later: the replay pays the stored drop
    log(data, D1).plinkoBoard = layoutBoard(10, seededRand(12345))
    expect(computeState(data, nowAt(D1, 20)).xp - base.xp).toBe(Math.floor(PLINKO_TIERS[tier].xp / 2))
  })

  it('миграция: броски v0.6 (риск, 7/9/11 лунок) засчитываются как раньше', () => {
    const data = makeData()
    const old: PlinkoDrop[] = [
      { n: 0, at: at(D1, 9), slot: 0, taskId: 'focus60' }, // mid edge → tier 5
      { n: 1, at: at(D1, 10), slot: 3, taskId: 'water', risk: 'low' }, // low centre → tier 1
      { n: 2, at: at(D1, 11), slot: 10, taskId: 'read50', risk: 'high' }, // high edge → tier 5
      { n: 3, at: at(D1, 12), slot: 4, taskId: 'push20', risk: 'high' }, // high → tier 3
    ]
    expect(old.map(dropTier)).toEqual([5, 1, 5, 3])
    expect(dropJackpot(old[0])).toBe(true)
    expect(dropJackpot(old[3])).toBe(false)
    log(data, D1).plinko = Object.fromEntries(old.map((d) => [String(d.n), { ...d }]))
    const base = computeState(data, nowAt(D1, 22)).xp
    for (const d of Object.values(log(data, D1).plinko!)) d.laterAt = d.at + 500
    for (const d of Object.values(log(data, D1).plinko!)) d.doneAt = d.at + 60_000
    const back = normalizeData(JSON.parse(JSON.stringify(data)))
    expect(Object.values(back.days[D1].plinko!).map((d) => d.v)).toEqual([undefined, undefined, undefined, undefined])
    expect(computeState(back, nowAt(D1, 22)).xp - base).toBe(30 + 3 + 30 + 9)
  })
})

describe('Плинко: 5 шаров в день', () => {
  it('ровно 5 шаров, бонусов нет; завтра снова 5', () => {
    const data = makeData()
    expect(PLINKO_BALLS).toBe(5)
    expect(ballsLeft(data.days[D1])).toBe(5)
    expect(nextThrow(data.days[D1])).toBe(0)
    for (let n = 0; n < 4; n++) {
      const d = throwAt(data, D1, n, 9 + n)
      d.doneAt = d.at + 60_000 // done in time: no bonus ball any more
    }
    expect(ballsLeft(data.days[D1])).toBe(1)
    expect(nextThrow(data.days[D1])).toBe(4)
    throwAt(data, D1, 4, 14)
    expect(ballsLeft(data.days[D1])).toBe(0)
    expect(nextThrow(data.days[D1])).toBeNull()
    expect(ballsLeft(data.days[addDays(D1, 1)])).toBe(5)
  })

  it('старый день с 6 бросками остаётся целым; седьмой выбрасывается', () => {
    const data = makeData()
    for (let n = 0; n < PLINKO_MAX; n++)
      log(data, D1).plinko = {
        ...log(data, D1).plinko,
        [n]: { n, at: at(D1, 9 + n), slot: 4, taskId: 'water' },
      }
    log(data, D1).plinko!['6'] = {
      n: 6,
      at: at(D1, 20),
      slot: 0,
      taskId: 'focus60',
    }
    expect(plinkoDrops(data.days[D1])).toHaveLength(PLINKO_MAX)
    expect(ballsLeft(data.days[D1])).toBe(0)
    expect(normalizeData(data).days[D1].plinko?.['6']).toBeUndefined()
  })
})

describe('Плинко: серия ×1,2 … ×2 — множитель XP', () => {
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
    const before = computeState(data, nowAt(D1, 22)).xp
    c.doneAt = c.at + 60_000
    expect(computeState(data, nowAt(D1, 22)).xp - before).toBe(Math.round(PLINKO_TIERS[dropTier(c)].xp * 1.4))
    c.laterAt = c.at + 1000
    expect(nextStreak(data.days, at(D1, 12))).toBe(0)
    delete c.laterAt
    c.doneAt = c.at + 5 * 3600_000
    expect(nextStreak(data.days, at(D1, 22))).toBe(0)
    delete c.doneAt
    expect(nextStreak(data.days, at(D1, 11, 5))).toBe(0)
  })

  it('серия идёт через дни, в том числе через старые броски', () => {
    const data = makeData()
    log(data, D1).plinko = {
      0: {
        n: 0,
        at: at(D1, 10),
        slot: 4,
        taskId: 'water',
        doneAt: at(D1, 10, 1),
      },
    }
    for (let i = 1; i < 7; i++) {
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
  it('битые броски и доски чистятся, старые данные без plinko не меняются', () => {
    expect(sanitizeDrop({ n: 0, at: 1, slot: 9, taskId: 'x' })).toBeNull()
    expect(sanitizeDrop({ n: 0, at: 1, slot: 10, taskId: 'x', risk: 'high' })).toEqual({ n: 0, at: 1, slot: 10, taskId: 'x', risk: 'high' })
    expect(sanitizeDrop({ n: 0, at: 1, slot: 15, taskId: 'x', v: 2 })).toEqual({
      n: 0,
      at: 1,
      slot: 15,
      taskId: 'x',
      v: 2,
    })
    expect(sanitizeDrop({ n: 0, at: 1, slot: 16, taskId: 'x', v: 2 })).toBeNull()
    expect(sanitizeDrop({ n: 0, at: 1, slot: 4, taskId: 'water', doneAt: 'x' })).toEqual({ n: 0, at: 1, slot: 4, taskId: 'water' })
    const d = makeData()
    log(d, D1).plinkoBoard = ['water', 'water']
    log(d, addDays(D1, 1)).plinkoBoard = layoutBoard(12, seededRand(1))
    const n = normalizeData(JSON.parse(JSON.stringify(d)))
    expect(n.days[D1].plinkoBoard).toBeUndefined()
    expect(n.days[addDays(D1, 1)].plinkoBoard).toEqual(d.days[addDays(D1, 1)].plinkoBoard)
    const old = makeData()
    log(old, D1).destiny = {
      ref: 'quest',
      id: 'water',
      startedAt: at(D1, 10),
      minutes: 25,
    }
    const back = normalizeData(JSON.parse(JSON.stringify(old)))
    expect(back.days[D1].plinko).toBeUndefined()
    expect(back.days[D1].destiny).toEqual(old.days[D1].destiny)
  })

  it('броски двух устройств сливаются по одному, доска дня — одна', () => {
    const start = makeData()
    const devA = {
      data: structuredClone(start),
      meta: { stamps: {}, tombs: {} } as SyncMeta,
    }
    const devB = {
      data: structuredClone(start),
      meta: { stamps: {}, tombs: {} } as SyncMeta,
    }
    const edit = (dev: typeof devA, now: number, fn: (d: AppData) => void) => {
      const next = structuredClone(dev.data)
      fn(next)
      dev.meta = stampChanges(toAtoms(dev.data), toAtoms(next), dev.meta, now)
      dev.data = next
    }
    edit(devA, at(D1, 9), (d) => void throwAt(d, D1, 0, 9))
    edit(devA, at(D1, 9, 5), (d) => void (d.days[D1].plinko!['0'].doneAt = at(D1, 9, 5)))
    edit(devB, at(D1, 10), (d) => void throwAt(d, D1, 1, 10))
    expect(Object.keys(toAtoms(devA.data)).filter((k) => k.includes('plinko'))).toEqual([`days/${D1}/plinko/0`, `days/${D1}/plinkoBoard`])

    const merged = mergeDocs(devB.data, devB.meta, {
      v: 1,
      data: devA.data,
      ...devA.meta,
    })
    const p = merged.data.days[D1].plinko!
    expect(Object.keys(p).sort()).toEqual(['0', '1'])
    expect(p['0'].doneAt).toBe(at(D1, 9, 5))
    expect(p['1'].v).toBe(2)
    expect(merged.data.days[D1].plinkoBoard).toEqual(devB.data.days[D1].plinkoBoard) // later write wins
    const back = mergeDocs(devA.data, devA.meta, {
      v: 1,
      data: devB.data,
      ...devB.meta,
    })
    expect(back.data.days[D1].plinko).toEqual(p)
    expect(back.data.days[D1].plinkoBoard).toEqual(merged.data.days[D1].plinkoBoard)
  })

  it('звук — настройка устройства', () => {
    const d = makeData()
    d.settings.sound = false
    expect(toAtoms(d)['settings/sound']).toBeUndefined()
  })
})
