// Helpers for engine tests (not used by the app)
import { createInitialData } from './data'
import { planFor } from './replay'
import { addDays, localAt } from './time'
import type { AppData, Confession, DayKey, DayLog, MarkStatus } from './types'

export function makeData(over: Partial<AppData> = {}): AppData {
  const d = createInitialData()
  d.profile = { nick: 'Тест', avatar: '🐺', usualWake: '07:00', onboardDay: '2026-11-20' }
  return { ...d, ...over }
}

export const at = (day: DayKey, h: number, m = 0, plusDays = 0) => localAt(day, h, m, plusDays).getTime()
export const nowAt = (day: DayKey, h: number, m = 0) => localAt(day, h, m)

export function log(data: AppData, day: DayKey): DayLog {
  return (data.days[day] ??= { quests: {} })
}

export function mark(data: AppData, day: DayKey, id: string, status: MarkStatus = 'done', h = 12) {
  log(data, day).quests[id] = { status, at: at(day, h) }
}

/** Mark all main quests of the day (optionally except some) */
export function doMains(data: AppData, day: DayKey, status: MarkStatus = 'done', except: string[] = []) {
  for (const p of planFor(data, day)) if (p.role === 'main' && !except.includes(p.id)) mark(data, day, p.id, status)
}

/** Neutral confession by default: reels over the limit and bedtime late, so no auto quests fire */
export function confess(data: AppData, day: DayKey, over: Partial<Confession> = {}) {
  log(data, day).confession = { reelsMin: 30, sugar: 'none', colaAfter14: false, bedtime: '23:45', main: 'ok', at: at(day, 21), ...over }
}

/** Perfect, confessed days in a row starting at `from` */
export function perfectDays(data: AppData, from: DayKey, n: number) {
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i)
    doMains(data, d)
    confess(data, d)
  }
}
