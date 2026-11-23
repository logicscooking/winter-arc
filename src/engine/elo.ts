import type { Area, MarkStatus, PlannedQuest } from './types'

/**
 * v0.22 «Эло как на FACEIT»: the hero's headline progress. Everyone starts at 1000 on the arc start
 * (warm-up gives nothing). Every closed arc day adds 0…15 Эло by the share of the day's quests
 * outside «Деньги» that were completed (done = 1, mini = ½). No losses. Money has its own bosses.
 */
export const ELO = { start: 1000, maxGain: 15 } as const

/** Lowest Эло of each FACEIT level 1…10 (level 1 has no floor, 10 no ceiling) */
export const ELO_FLOORS = [0, 501, 751, 901, 1051, 1201, 1351, 1531, 1751, 2001] as const
export const ELO_MAX_LEVEL = ELO_FLOORS.length

export interface EloLevelInfo {
  level: number
  /** lowest Эло of this level */
  from: number
  /** highest Эло of this level (Infinity at level 10) */
  to: number
  /** Эло left to the next level (0 at the top) */
  toNext: number
  /** 0…1 inside the level (1 at the top) */
  progress: number
  max?: boolean
}

export function eloLevel(elo: number): EloLevelInfo {
  const e = Math.max(0, Math.floor(elo))
  let level = 1
  while (level < ELO_MAX_LEVEL && e >= ELO_FLOORS[level]) level++
  const from = ELO_FLOORS[level - 1]
  if (level >= ELO_MAX_LEVEL) return { level, from, to: Infinity, toNext: 0, progress: 1, max: true }
  const next = ELO_FLOORS[level]
  return { level, from, to: next - 1, toNext: next - e, progress: (e - from) / (next - from) }
}

/** Share (0…1) of the non-money quests of a day that count as done (done 1, mini ½) */
export function eloShare(plan: Pick<PlannedQuest, 'id'>[], marks: Record<string, MarkStatus | undefined>, areaOf: (id: string) => Area): number {
  let n = 0
  let sum = 0
  for (const p of plan) {
    if (areaOf(p.id) === 'money') continue
    n++
    const m = marks[p.id]
    sum += m === 'done' ? 1 : m === 'mini' ? 0.5 : 0
  }
  return n ? sum / n : 0
}

/** Эло of one day: 0…15, 0 for a frozen day */
export function eloGain(plan: Pick<PlannedQuest, 'id'>[], marks: Record<string, MarkStatus | undefined>, areaOf: (id: string) => Area, frozen = false): number {
  if (frozen) return 0
  return Math.round(ELO.maxGain * eloShare(plan, marks, areaOf))
}

/** Hero level rewards (once per Эло level reached): ❄ 30 at level 5 … 80 at level 10 */
export const ELO_LEVEL_SHARDS = (level: number) => Math.max(0, 10 * level - 20)

/** Titles at the Эло levels 5…10 (cosmetic, same names as the old milestone titles) */
export const ELO_TITLES: [number, string][] = [
  [1, 'Путник'],
  [5, 'Снежинка'],
  [6, 'Морозный'],
  [7, 'Ледокол'],
  [8, 'Буран'],
  [9, 'Хозяин зимы'],
  [10, 'Легенда арки'],
]

export function eloTitle(level: number): string {
  let t = ELO_TITLES[0][1]
  for (const [min, name] of ELO_TITLES) if (level >= min) t = name
  return t
}

export function nextEloTitle(level: number): { level: number; title: string } | null {
  const n = ELO_TITLES.find(([min]) => min > level)
  return n ? { level: n[0], title: n[1] } : null
}

/** FACEIT-style badge color per level: 1 grey, 2–3 green, 4–7 yellow/orange, 8–9 orange, 10 red */
export function eloColor(level: number): string {
  if (level <= 1) return '#9aa0a6'
  if (level <= 3) return '#3fbf5a'
  if (level <= 5) return '#f2c230'
  if (level <= 7) return '#f5a623'
  if (level <= 9) return '#ff7a1a'
  return '#ff2d2d'
}
