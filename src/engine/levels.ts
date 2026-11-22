import type { StatId } from './types'

/**
 * v0.16 «Прогрессия»: hero levels 1…30. Total XP to reach level n: 26·m² + 100·m, m = n − 1
 * → 2: 126, 5: 816, 10: 3 006, 15: 6 496, 20: 11 286, 25: 17 376, 30: 24 766.
 * A solid player (~250 XP a day) reaches 30 around day 98, a mediocre one (~110) ends near 19–20.
 */
export const LEVEL_CAP = 30

export function xpForLevel(n: number): number {
  const m = Math.max(0, Math.min(LEVEL_CAP, n) - 1)
  return 26 * m * m + 100 * m
}

/** ❄ for reaching level n (once, in the replay): 3 per level → 6 at level 2 … 90 at 30, 1 392 in all */
export const LEVEL_UP_SHARDS = (n: number) => 3 * n

export interface LevelInfo {
  level: number
  /** XP earned inside the current level */
  into: number
  /** XP size of the current level */
  span: number
  /** XP left to the next level */
  toNext: number
  progress: number
  /** the cap is reached: the bar stays full */
  max?: boolean
  /** XP earned past the cap («сверх») */
  over?: number
}

/** Level on any curve `total(n)` (total(1) = 0, growing), optionally capped */
function curveLevel(xp: number, total: (n: number) => number, cap = Infinity): LevelInfo {
  const t = Math.max(0, xp)
  let n = 1
  while (n < cap && total(n + 1) <= t) n++
  if (n >= cap) {
    const lo = total(cap)
    const span = lo - total(cap - 1)
    return { level: cap, into: span, span, toNext: 0, progress: 1, max: true, over: t - lo }
  }
  const lo = total(n)
  const hi = total(n + 1)
  return { level: n, into: t - lo, span: hi - lo, toNext: hi - t, progress: (t - lo) / (hi - lo) }
}

export function levelOf(xp: number): LevelInfo {
  return curveLevel(xp, xpForLevel, LEVEL_CAP)
}

/** Titles every 5 levels (cosmetic, shown on «Герой», the HUD and in the party) */
export const LEVEL_TITLES: [number, string][] = [
  [1, 'Путник'],
  [5, 'Снежинка'],
  [10, 'Морозный'],
  [15, 'Ледокол'],
  [20, 'Буран'],
  [25, 'Хозяин зимы'],
  [30, 'Легенда арки'],
]

export function levelTitle(level: number): string {
  let t = LEVEL_TITLES[0][1]
  for (const [min, name] of LEVEL_TITLES) if (level >= min) t = name
  return t
}

/** The next title and the level it comes at, or null at the top */
export function nextTitle(level: number): { level: number; title: string } | null {
  const n = LEVEL_TITLES.find(([min]) => min > level)
  return n ? { level: n[0], title: n[1] } : null
}

/**
 * «Сферы» levels: their own, flatter curve, 50·m² + 50·m → 5: 1 000, 10: 4 500, 15: 10 500.
 * An active sphere ends the arc around 10–15.
 */
export function sphereXpFor(n: number): number {
  const m = Math.max(0, n - 1)
  return 50 * m * m + 50 * m
}

export function sphereLevelOf(xp: number): LevelInfo {
  return curveLevel(xp, sphereXpFor)
}

export const STATS: { id: StatId; name: string; short: string }[] = [
  { id: 'energy', name: 'Энергия', short: 'ЭНР' },
  { id: 'body', name: 'Тело', short: 'ТЕЛ' },
  { id: 'mind', name: 'Разум', short: 'РАЗ' },
  { id: 'will', name: 'Воля', short: 'ВОЛ' },
  { id: 'deal', name: 'Дело', short: 'ДЕЛ' },
]

export function statName(id: StatId): string {
  return STATS.find((s) => s.id === id)?.name ?? id
}

/** Chapter rank titles by chapter XP (cosmetic) */
const RANKS: [number, string][] = [
  [0, 'Новичок'],
  [100, 'Заиндевевший'],
  [300, 'Стойкий'],
  [600, 'Ледокол'],
  [1000, 'Северный'],
  [1500, 'Буран'],
  [2200, 'Полярная ночь'],
  [3000, 'Вечная мерзлота'],
]

export function rankTitle(rankXp: number): string {
  let t = RANKS[0][1]
  for (const [min, name] of RANKS) if (rankXp >= min) t = name
  return t
}
