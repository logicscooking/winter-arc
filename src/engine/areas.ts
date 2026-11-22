/**
 * «Сферы»: every row of «Сегодня» belongs to one of five life areas. Pure helpers: the area of a
 * quest, the natural time of a row (for sorting inside an area), one-off events of «Разное» and the
 * one-time migration of existing data.
 */
import { AREA_QUESTS, PHONE_IF_THEN, PHONE_OLD, PHONE_TITLE } from './quests'
import { BEDTIME_TARGET } from './plan'
import { RU_WEEKDAYS, addDays, eveningMinutes, parseDay, weekday } from './time'
import type { AppData, Area, CalEvent, DayKey, Quest } from './types'

/** Screen order; «Разное» is always last (events at its top, then the head habits: todayItems.ts) */
export const AREAS: { id: Area; title: string; short: string }[] = [
  { id: 'health', title: 'Здоровье', short: 'Здоровье' },
  { id: 'money', title: 'Деньги', short: 'Деньги' },
  { id: 'growth', title: 'Развитие', short: 'Развитие' },
  { id: 'misc', title: 'Разное', short: 'Разное' },
]
export const AREA_IDS: Area[] = AREAS.map((a) => a.id)
export const isArea = (v: unknown): v is Area => typeof v === 'string' && (AREA_IDS as string[]).includes(v)

/** Built-in quests by id; anything else (own quests) is «Разное» until the player picks an area */
export const QUEST_AREA: Record<string, Area> = {
  wake: 'health',
  light: 'health',
  water: 'health',
  steps: 'health',
  workout: 'health',
  caffeine: 'health',
  bedtime: 'health',
  deal: 'money',
  twitter: 'money',
  leads: 'money',
  reading: 'growth',
  skill: 'growth',
  // «Разное» also holds the head habits: медитация, телефон, дневник, рилсы
  meditation: 'misc',
  phone: 'misc',
  journal: 'misc',
  reels: 'misc',
}

export function questArea(q: Pick<Quest, 'id' | 'area'>): Area {
  return isArea(q.area) ? q.area : QUEST_AREA[q.id] ?? 'misc'
}

// ---------- natural time of a row ----------

/** «Телефон отложен за 30 мин до сна»: bedtime target − 30 min */
export const PHONE_AT = eveningMinutes(BEDTIME_TARGET) - 30

/**
 * When a quest naturally happens, minutes from 00:00 (wake = the wake target of the day).
 * Only for sorting rows inside an area; nothing is checked against it.
 */
export function questTime(q: Pick<Quest, 'id' | 'kind'>, wake: number, part: 'morning' | 'day' | 'evening'): number {
  switch (q.id) {
    case 'wake':
      return wake
    case 'light':
      return wake + 15
    case 'meditation':
      return wake + 25
    case 'water':
      return wake + 30
    case 'skill':
      return 10 * 60
    case 'deal':
      return 11 * 60
    case 'twitter':
      return 13 * 60
    case 'caffeine':
      return 13 * 60 + 59
    case 'leads':
      return 14 * 60 + 30
    case 'steps':
      return 16 * 60
    case 'workout':
      return 17 * 60
    case 'reels':
      return 21 * 60
    case 'journal':
      return 22 * 60
    case 'reading':
      return 22 * 60 + 30
    case 'phone':
      return PHONE_AT
    case 'bedtime':
      return eveningMinutes(BEDTIME_TARGET)
  }
  return part === 'morning' ? wake + 45 : part === 'evening' ? 21 * 60 : 12 * 60
}

// ---------- «Разное»: one-off events ----------

export const EVENT_TITLE_MAX = 60
export const EVENT_NOTE_MAX = 300
/** «Разное» shows today and the next 14 days */
export const EVENT_AHEAD_DAYS = 14
const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Clean a stored event; null drops it */
export function sanitizeEvent(raw: unknown): CalEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<CalEvent>
  if (typeof x.id !== 'string' || !x.id || typeof x.title !== 'string' || !x.title.trim() || typeof x.date !== 'string' || !DAY.test(x.date)) return null
  const out: CalEvent = { id: x.id, title: x.title.trim().slice(0, EVENT_TITLE_MAX), date: x.date, updatedAt: Number.isFinite(x.updatedAt) ? Number(x.updatedAt) : 0 }
  if (typeof x.time === 'string' && HM.test(x.time)) out.time = x.time
  if (typeof x.note === 'string' && x.note.trim()) out.note = x.note.trim().slice(0, EVENT_NOTE_MAX)
  if (typeof x.doneAt === 'number' && Number.isFinite(x.doneAt) && x.doneAt > 0) out.doneAt = x.doneAt
  return out
}

/** Earliest first: date, then time; an event without a time goes after the timed ones of its day */
export function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (!!a.time !== !!b.time) return a.time ? -1 : 1
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
  return a.title.localeCompare(b.title, 'ru') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Events of «Разное»: today's (they count in the ring) and the upcoming ones of the next 14 days
 * (shown, not counted). A past event is gone after its day, done or not.
 */
export function eventsView(events: CalEvent[] | undefined, today: DayKey): { today: CalEvent[]; upcoming: CalEvent[] } {
  const last = addDays(today, EVENT_AHEAD_DAYS)
  const list = [...(events ?? [])].sort(compareEvents)
  return { today: list.filter((e) => e.date === today), upcoming: list.filter((e) => e.date > today && e.date <= last) }
}

/** «сегодня», «завтра», «пт 27 ноя» */
export function eventDayLabel(date: DayKey, today: DayKey): string {
  if (date === today) return 'сегодня'
  if (date === addDays(today, 1)) return 'завтра'
  const { m, d } = parseDay(date)
  return `${RU_WEEKDAYS[weekday(date)]} ${d} ${RU_MONTHS_SHORT[m - 1]}`
}

// ---------- migration ----------

export const AREAS_V = 1

/**
 * One-time «Сферы» migration of existing data: the new quests join from `today` on (createdDay,
 * so past days replay exactly as before), the untouched phone quest gets its new title.
 * A game day that already has a plan snapshot (confession filed) keeps it, so nothing changes there either.
 * Areas themselves need nothing: a quest without `area` uses the default of its id.
 * Fresh data already has the new quests (createInitialData) and only gets the mark.
 */
export function migrateAreas(d: AppData, today: DayKey): AppData {
  if ((d.ack?.areasV ?? 0) >= AREAS_V) return d
  const ids = new Set(d.quests.map((q) => q.id))
  let order = Math.max(-1, ...d.quests.map((q) => q.order))
  const added = AREA_QUESTS.filter((q) => !ids.has(q.id)).map((q) => ({ ...q, roles: [...q.roles] as Quest['roles'], order: ++order, createdDay: today }))
  return { ...d, quests: [...retitlePhone(d.quests), ...added], ack: { ...d.ack, areasV: AREAS_V } }
}

/**
 * The untouched phone quest gets its «Сферы» title. Pure and idempotent, so normalizeData runs it on
 * every load and merge: an old title that comes back from a not-yet-updated device is fixed again.
 */
export function retitlePhone(quests: Quest[]): Quest[] {
  const i = quests.findIndex((q) => q.id === 'phone' && (q.title === PHONE_OLD.title || q.ifThen === PHONE_OLD.ifThen))
  if (i < 0) return quests
  const q = quests[i]
  const next = { ...q, title: q.title === PHONE_OLD.title ? PHONE_TITLE : q.title, ifThen: q.ifThen === PHONE_OLD.ifThen ? PHONE_IF_THEN : q.ifThen }
  return quests.map((x, j) => (j === i ? next : x))
}
