/**
 * v0.5 heat map of XP over the arc: 98 cells, 14 weeks × 7 days, plus the warm-up days before the start.
 * Pure: takes XP per day from the replay and returns cells with a 0–4 level.
 */
import { ARC_START, ARC_WEEKS, addDays, weekday } from './time'
import type { DayKey } from './types'

export interface HeatCell {
  day: DayKey
  xp: number
  /** 0 = nothing, 1..4 = share of the best day */
  level: number
  future: boolean
  warmup: boolean
}

export function heatLevel(xp: number, max: number): number {
  if (xp <= 0 || max <= 0) return 0
  return Math.max(1, Math.min(4, Math.ceil((xp / max) * 4)))
}

/** `weeks[w][d]`: arc week w (0..13), weekday d (0 = Monday). Warm-up: onboarding day → day before the arc. */
export function heatmap(xpByDay: Record<DayKey, number>, today: DayKey, onboardDay?: DayKey): { weeks: HeatCell[][]; warmup: HeatCell[]; max: number; total: number } {
  const arcDays = Array.from({ length: ARC_WEEKS * 7 }, (_, i) => addDays(ARC_START, i))
  const warmDays: DayKey[] = []
  if (onboardDay && onboardDay < ARC_START) for (let d = onboardDay; d < ARC_START; d = addDays(d, 1)) warmDays.push(d)
  const all = [...warmDays, ...arcDays]
  const max = Math.max(0, ...all.filter((d) => d <= today).map((d) => xpByDay[d] ?? 0))
  const cell = (day: DayKey, warmup: boolean): HeatCell => {
    const xp = day > today ? 0 : (xpByDay[day] ?? 0)
    return { day, xp, level: heatLevel(xp, max), future: day > today, warmup }
  }
  const weeks: HeatCell[][] = []
  for (let w = 0; w < ARC_WEEKS; w++) weeks.push(Array.from({ length: 7 }, (_, d) => cell(arcDays[w * 7 + d], false)))
  const total = all.reduce((s, d) => s + (d > today ? 0 : (xpByDay[d] ?? 0)), 0)
  return { weeks, warmup: warmDays.map((d) => cell(d, true)), max, total }
}

/** ARC_START is a Monday, so arc weeks align with calendar weeks */
export const arcStartsMonday = () => weekday(ARC_START) === 0
