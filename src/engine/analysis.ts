import { isCompleted } from './quests'
import type { GameState } from './replay'
import { addDays, weekday } from './time'
import type { AppData, DayKey, Slip, SlipWhat, SlipWhy } from './types'

export interface QuestStreak {
  current: number
  best: number
  /** completions in the last 7 days (including today) */
  last7: number
  /** days in the last 7 when the quest was active */
  active7: number
}

/** Streak per quest. Frozen days, inactive days and today (until it closes) never break it. */
export function questStreak(st: GameState, questId: string, today: DayKey = st.today): QuestStreak {
  const days = Object.keys(st.days).sort()
  let run = 0
  let best = 0
  for (const d of days) {
    const r = st.days[d]
    if (!r.plan.some((p) => p.id === questId)) continue
    const done = isCompleted(r.marks[questId])
    if (done) {
      run++
      best = Math.max(best, run)
    } else if (r.frozen) continue
    else if (r.closed) run = 0
  }
  let last7 = 0
  let active7 = 0
  for (let i = 0; i < 7; i++) {
    const r = st.days[addDays(today, -i)]
    if (!r || !r.plan.some((p) => p.id === questId)) continue
    active7++
    if (isCompleted(r.marks[questId])) last7++
  }
  return { current: run, best, last7, active7 }
}

export const WHAT_LABEL: Record<SlipWhat, string> = {
  reels: 'Рилсы',
  chocolate: 'Шоколад',
  cola: 'Кола',
  sleep: 'Сон',
  skip: 'Пропуск',
  other: 'Другое',
}

export const WHY_LABEL: Record<SlipWhy, string> = {
  boredom: 'Скука',
  tired: 'Усталость',
  stress: 'Стресс',
  company: 'Компания',
  auto: 'На автомате',
  other: 'Другое',
}

export const TIME_BUCKETS = [
  { id: 'morning', label: 'Утро', from: 4, to: 12 },
  { id: 'day', label: 'День', from: 12, to: 17 },
  { id: 'evening', label: 'Вечер', from: 17, to: 22 },
  { id: 'night', label: 'Ночь', from: 22, to: 28 },
] as const

export const TRIGGERS_MIN = 5

export interface TriggerReport {
  enough: boolean
  total: number
  comebacks: number
  why: { key: SlipWhy; label: string; count: number }[]
  what: { key: SlipWhat; label: string; count: number }[]
  time: { key: string; label: string; count: number }[]
  weekday: number[]
  /** «срываешься вечером от усталости» */
  headline?: string
}

function count<K extends string>(items: K[]): Map<K, number> {
  const m = new Map<K, number>()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return m
}

export function bucketOf(hour: number): (typeof TIME_BUCKETS)[number] {
  const h = hour < 4 ? hour + 24 : hour
  return TIME_BUCKETS.find((b) => h >= b.from && h < b.to) ?? TIME_BUCKETS[3]
}

export function analyzeTriggers(slips: Slip[]): TriggerReport {
  const live = slips
  const why = [...count(live.map((s) => s.why))].map(([key, c]) => ({ key, label: WHY_LABEL[key], count: c })).sort((a, b) => b.count - a.count)
  const what = [...count(live.map((s) => s.what))].map(([key, c]) => ({ key, label: WHAT_LABEL[key], count: c })).sort((a, b) => b.count - a.count)
  const timed = live.filter((s) => !s.retro)
  const tm = count(timed.map((s) => bucketOf(new Date(s.at).getHours()).id as string))
  const time = TIME_BUCKETS.map((b) => ({ key: b.id as string, label: b.label, count: tm.get(b.id) ?? 0 }))
  const wd = [0, 0, 0, 0, 0, 0, 0]
  for (const s of live) wd[weekday(s.day)]++
  const enough = live.length >= TRIGGERS_MIN
  let headline: string | undefined
  if (enough && why[0]) {
    const topTime = [...time].sort((a, b) => b.count - a.count)[0]
    const when = topTime && topTime.count > 0 ? { morning: 'утром', day: 'днём', evening: 'вечером', night: 'ночью' }[topTime.key] : ''
    const reason = { boredom: 'от скуки', tired: 'от усталости', stress: 'от стресса', company: 'за компанию', auto: 'на автомате', other: 'по разным причинам' }[why[0].key]
    headline = `Чаще всего срываешься ${when} ${reason}`.replace(/\s+/g, ' ')
  }
  return { enough, total: live.length, comebacks: live.filter((s) => s.comebackAt).length, why, what, time, weekday: wd, headline }
}

/** Energy ≤ 2 in at least 10 of the last 14 check-ins */
export function redFlag(data: AppData): boolean {
  const checkins = Object.entries(data.days)
    .filter(([, l]) => l.checkin)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-14)
  if (checkins.length < 10) return false
  return checkins.filter(([, l]) => l.checkin!.energy <= 2).length >= 10
}

export function booksFinishedInArc(data: AppData, from: DayKey): number {
  return data.books.filter((b) => b.finishedDay && b.finishedDay >= from).length
}
