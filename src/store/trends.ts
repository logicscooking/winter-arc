import { ARC_END, WAKE_GOAL_MIN, addDays, daysRange, parseHM, replayStartOf } from '../engine'
import type { AppData, DayKey, GameState } from '../engine'

export const PAGES_GOAL = 25
export const PAGES_MIN = 10

/**
 * The 7-day window: starts on the first replayed day until a week has passed, then rolls.
 * So on day one the axis already shows where the next six points will land.
 */
export function window7(data: AppData, today: DayKey): DayKey[] {
  const first = replayStartOf(data)
  const start = addDays(today, -6) < first ? first : addDays(today, -6)
  return daysRange(start, addDays(start, 6))
}

export function allDays(data: AppData, today: DayKey): DayKey[] {
  const last = today > ARC_END ? ARC_END : today
  return daysRange(replayStartOf(data), last)
}

const future = (d: DayKey, today: DayKey) => d > today

export function wakeValues(data: AppData, days: DayKey[], today: DayKey) {
  return days.map((d) => (future(d, today) || !data.days[d]?.checkin ? null : parseHM(data.days[d].checkin!.wake)))
}

export function pagesValues(data: AppData, days: DayKey[], today: DayKey) {
  return days.map((d) => {
    if (future(d, today)) return null
    const v = data.days[d]?.quests.reading?.value
    if (v !== undefined) return v
    return data.days[d]?.confession ? 0 : null
  })
}

export function xpValues(game: GameState, days: DayKey[], today: DayKey) {
  return days.map((d) => (future(d, today) || !game.days[d] ? null : (game.xpByDay[d] ?? 0)))
}

export function hpValues(game: GameState, days: DayKey[], today: DayKey) {
  return days.map((d) => (future(d, today) ? null : (game.hpByDay[d] ?? null)))
}

/** XP per day only counts when something happened, so an empty week reads as empty */
export function anyXp(values: (number | null)[]) {
  return values.some((v) => v !== null && v > 0)
}

export const WAKE_GOAL = WAKE_GOAL_MIN
