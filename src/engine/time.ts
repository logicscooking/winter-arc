import type { ChapterId, DayKey } from './types'

export const DAY_START_HOUR = 4
export const ARC_START: DayKey = '2026-11-23'
export const ARC_END: DayKey = '2027-02-28'
export const ARC_DAYS = 98
export const ARC_WEEKS = 14
/** Late confession allowed until 04:00 + 12h of the next game day */
export const LATE_CONFESSION_HOURS = 12
export const CONFESSION_OPENS_HOUR = 20
export const FINAL_MEASURE_FROM: DayKey = '2027-02-22'

const pad = (n: number) => String(n).padStart(2, '0')

export function parseDay(day: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = day.split('-').map(Number)
  return { y, m, d }
}

function fromUtc(ms: number): DayKey {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function toUtc(day: DayKey): number {
  const { y, m, d } = parseDay(day)
  return Date.UTC(y, m - 1, d)
}

export function addDays(day: DayKey, n: number): DayKey {
  return fromUtc(toUtc(day) + n * 86400000)
}

/** b - a in days */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000)
}

export function compareDay(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 0 = Monday … 6 = Sunday */
export function weekday(day: DayKey): number {
  const w = new Date(toUtc(day)).getUTCDay()
  return (w + 6) % 7
}

/** The game day a moment belongs to: anything before 04:00 is still the previous day. */
export function gameDayOf(now: Date): DayKey {
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return now.getHours() < DAY_START_HOUR ? addDays(local, -1) : local
}

/** Local Date at hh:00 of the calendar date `day` (+ extra days) */
export function localAt(day: DayKey, hour: number, minute = 0, plusDays = 0): Date {
  const { y, m, d } = parseDay(day)
  return new Date(y, m - 1, d + plusDays, hour, minute, 0, 0)
}

export function dayStart(day: DayKey): Date {
  return localAt(day, DAY_START_HOUR)
}

/** Confession of `day` can be filed until this moment (next day 16:00). */
export function confessionDeadline(day: DayKey): Date {
  return localAt(day, DAY_START_HOUR + LATE_CONFESSION_HOURS, 0, 1)
}

export function confessionOpensAt(day: DayKey): Date {
  return localAt(day, CONFESSION_OPENS_HOUR)
}

export function isConfessionOpen(day: DayKey, now: Date): boolean {
  return now >= confessionOpensAt(day) && now < confessionDeadline(day)
}

export function isPastDeadline(day: DayKey, now: Date): boolean {
  return now >= confessionDeadline(day)
}

export function shiftNow(real: Date, offsetDays: number): Date {
  if (!offsetDays) return real
  return new Date(real.getTime() + offsetDays * 86400000)
}

// ---------- arc, chapters, weeks ----------

export interface Chapter {
  id: ChapterId
  roman: string
  name: string
  start: DayKey
  end: DayKey
  focus: string
}

export const CHAPTERS: Chapter[] = [
  { id: 0, roman: '0', name: 'Пролог', start: '2026-11-23', end: '2026-11-29', focus: 'Замеры, сдвиг подъёма, правила' },
  { id: 1, roman: 'I', name: 'Режим', start: '2026-11-30', end: '2027-01-03', focus: 'Сон, подъём в 7:00, свет, кофеин' },
  { id: 2, roman: 'II', name: 'Тело и Воля', start: '2027-01-04', end: '2027-01-31', focus: 'Тренировки, шаги, сахар в слотах, лимит рилсов' },
  { id: 3, roman: 'III', name: 'Разум и Дело', start: '2027-02-01', end: '2027-02-28', focus: 'Книги, свой проект, навык' },
]

export function chapterOf(day: DayKey): ChapterId {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (day >= CHAPTERS[i].start) return CHAPTERS[i].id
  }
  return 0
}

export const BOSSES = [
  'Хаос',
  'Зомби',
  'Ночной скролл',
  'Кофеиновый призрак',
  'Снежный ком',
  'Рилс-демон',
  'Сахарный голем',
  'Диванный тролль',
  'Кола-слизень',
  'Потом',
  'Туман',
  'Прокрастинатор',
  'Страх начать',
  'Весенний босс',
]

export function isInArc(day: DayKey): boolean {
  return day >= ARC_START && day <= ARC_END
}

/** 1..98 (can be <1 before the arc and >98 after) */
export function arcDayNumber(day: DayKey): number {
  return diffDays(ARC_START, day) + 1
}

/** 1..14, clamped */
export function weekOf(day: DayKey): number {
  const w = Math.floor(diffDays(ARC_START, day) / 7) + 1
  return Math.min(ARC_WEEKS, Math.max(1, w))
}

export function weekDays(week: number): DayKey[] {
  const start = addDays(ARC_START, (week - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function bossOf(week: number): string {
  return BOSSES[Math.min(ARC_WEEKS, Math.max(1, week)) - 1]
}

export function daysRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// ---------- clock times ----------

export function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function formatHM(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`
}

export function nowHM(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** Evening times after midnight count as later in the same evening (00:30 → 24:30). */
export function eveningMinutes(hm: string): number {
  const m = parseHM(hm)
  return m < 12 * 60 ? m + 1440 : m
}

export const WAKE_GOAL_MIN = 7 * 60

/**
 * Wake target for a day: start from the usual wake time and go 30 min earlier
 * every 2 days until 07:00. The shift starts on the first day of the plan.
 */
export function wakeTarget(usualWake: string, planStart: DayKey, day: DayKey): number {
  const usual = parseHM(usualWake)
  if (usual <= WAKE_GOAL_MIN) return WAKE_GOAL_MIN
  const k = Math.max(0, diffDays(planStart, day))
  return Math.max(WAKE_GOAL_MIN, usual - 30 * (Math.floor(k / 2) + 1))
}

/** Up to `tolerance` min late counts; waking earlier than the target always counts. */
export function wakeOnTarget(actual: string, target: number, tolerance = 30): boolean {
  return parseHM(actual) - target <= tolerance
}

export const RU_WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
export const RU_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export function formatDayRu(day: DayKey): string {
  const { m, d } = parseDay(day)
  return `${d} ${RU_MONTHS_GEN[m - 1]}`
}

export function formatDayShort(day: DayKey): string {
  const { m, d } = parseDay(day)
  return `${d}.${pad(m)}`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}
