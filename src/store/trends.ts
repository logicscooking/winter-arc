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

/** the last 14 days (or from the first replayed day) */
export function window14(data: AppData, today: DayKey): DayKey[] {
  const first = replayStartOf(data)
  const start = addDays(today, -13) < first ? first : addDays(today, -13)
  return daysRange(start, addDays(start, 13))
}

/** «Как прошёл день»: the evening dayScore 1–10 */
export function dayScoreValues(data: AppData, days: DayKey[], today: DayKey) {
  return days.map((d) => (future(d, today) ? null : (data.days[d]?.confession?.dayScore ?? null)))
}

/** «Восстановление после сна»: morning check-in sleep 1–5 + energy 1–5 → 2–10 */
export function recoveryValues(data: AppData, days: DayKey[], today: DayKey) {
  return days.map((d) => {
    const c = data.days[d]?.checkin
    return future(d, today) || !c ? null : c.sleep + c.energy
  })
}

/** Эло at the end of each day (the open day too) */
export function eloValues(game: GameState, days: DayKey[], today: DayKey) {
  return days.map((d) => (future(d, today) ? null : (game.eloByDay[d] ?? null)))
}

export const WAKE_GOAL = WAKE_GOAL_MIN
