import type { StatId } from './types'

/** Total XP needed to reach level n: 50·n·(n−1) → 1:0, 2:100, 3:300, 4:600 … */
export function xpForLevel(n: number): number {
  return 50 * n * (n - 1)
}

export interface LevelInfo {
  level: number
  /** XP earned inside the current level */
  into: number
  /** XP size of the current level */
  span: number
  /** XP left to the next level */
  toNext: number
  progress: number
}

export function levelOf(xp: number): LevelInfo {
  const total = Math.max(0, xp)
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * total)) / 2))
  while (xpForLevel(n + 1) <= total) n++
  while (n > 1 && xpForLevel(n) > total) n--
  const lo = xpForLevel(n)
  const hi = xpForLevel(n + 1)
  return { level: n, into: total - lo, span: hi - lo, toNext: hi - total, progress: (total - lo) / (hi - lo) }
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
