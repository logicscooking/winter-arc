/**
 * v0.7 «Заработано»: own money as part of the fight with «отложенная жизнь».
 * Pure rules: validation, week / arc totals, the daily XP reward and the party leaderboard.
 * Privacy: only `publicMoney` may build what leaves the device, and only when the user opted in.
 */
import { weekStartOf } from './skills'
import { ARC_END } from './time'
import type { AppData, DayKey, Income } from './types'

/** one entry: whole rubles, 1 … 10 млн */
export const MONEY_MAX = 10_000_000
/** a friend's published total above this is not believable → ignored */
export const MONEY_PUB_MAX = 1_000_000_000
/**
 * Reward: once per game day into «Дело», by the order of the day's total:
 * 100 ₽ → 5, 1 000 → 10, 10 000 → 15, 100 000+ → 20 XP. Can't be farmed: more entries on a day
 * only raise that day's total, and the log keeps the growth slow.
 */
export const MONEY_XP = { base: 5, perOrder: 5, max: 20, min: 3 } as const
export const MONEY_NOTE_MAX = 200
export const MONEY_SOURCE_MAX = 40

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseAmount(raw: string): number | null {
  const t = raw.replace(/[\s ₽]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Math.round(Number(t))
  return Number.isFinite(n) && n > 0 && n <= MONEY_MAX ? n : null
}

export const validIncome = (x: Income | undefined): x is Income =>
  !!x && typeof x.id === 'string' && typeof x.day === 'string' && DAY_RE.test(x.day) && Number.isInteger(x.amount) && x.amount > 0 && x.amount <= MONEY_MAX && Number.isFinite(x.at)

export function incomesOf(data: Pick<AppData, 'incomes'>): Income[] {
  return (data.incomes ?? []).filter(validIncome)
}

/** «1 234 567 ₽» with thin non-breaking separators */
export function formatRub(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

export interface MoneyTotals {
  /** Monday of the current week */
  weekKey: DayKey
  week: number
  /** the whole arc, warm-up included, up to today */
  arc: number
}

export function moneyTotals(data: Pick<AppData, 'incomes'>, today: DayKey): MoneyTotals {
  const weekKey = weekStartOf(today)
  let week = 0
  let arc = 0
  for (const x of incomesOf(data)) {
    if (x.day > today) continue
    if (x.day >= weekKey) week += x.amount
    if (x.day <= ARC_END) arc += x.amount
  }
  return { weekKey, week, arc }
}

// ---------- reward ----------

export function moneyXpFor(dayTotal: number): number {
  if (!(dayTotal > 0)) return 0
  const xp = MONEY_XP.base + MONEY_XP.perOrder * Math.floor(Math.log10(Math.max(1, dayTotal)) - 2)
  return Math.max(MONEY_XP.min, Math.min(MONEY_XP.max, xp))
}

export interface MoneyEvent {
  day: DayKey
  at: number
  xp: number
}

/** One event per game day with income: at the first entry of the day, XP from the day's total */
export function moneyEvents(data: Pick<AppData, 'incomes'>): MoneyEvent[] {
  const byDay = new Map<DayKey, { at: number; total: number }>()
  for (const x of incomesOf(data)) {
    const cur = byDay.get(x.day)
    if (cur) {
      cur.total += x.amount
      cur.at = Math.min(cur.at, x.at)
    } else byDay.set(x.day, { at: x.at, total: x.amount })
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, v]) => ({ day, at: v.at, xp: moneyXpFor(v.total) }))
}

/** XP the day already gives and would give with `extra` more rubles: for the «+N XP» hint */
export function moneyXpDelta(data: Pick<AppData, 'incomes'>, day: DayKey, extra: number): number {
  const total = incomesOf(data).filter((x) => x.day === day).reduce((s, x) => s + x.amount, 0)
  return moneyXpFor(total + extra) - moneyXpFor(total)
}

// ---------- party ----------

export const moneyShareOn = (data: Pick<AppData, 'settings'>) => data.settings.moneyShare === true

/** What goes to public_stats.payload.money: totals only, and only when the user opted in */
export function publicMoney(data: Pick<AppData, 'incomes' | 'settings'>, today: DayKey): MoneyTotals | undefined {
  if (!moneyShareOn(data)) return undefined
  return moneyTotals(data, today)
}

const okSum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MONEY_PUB_MAX

/**
 * A friend's published totals. Anything malformed → null (not shown). A week total from another week
 * counts as 0 for this week: the friend simply has not opened the app since Monday.
 */
export function safeMoney(raw: unknown, today: DayKey): { week: number; arc: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!okSum(r.week) || !okSum(r.arc) || typeof r.weekKey !== 'string' || !DAY_RE.test(r.weekKey)) return null
  return { week: r.weekKey === weekStartOf(today) ? Math.round(r.week) : 0, arc: Math.round(r.arc) }
}

export type MoneyPeriod = 'week' | 'arc'

export interface BoardEntry {
  id: string
  name: string
  me?: boolean
  /** null: hidden (not shared or not valid) */
  money: { week: number; arc: number } | null
}

export interface BoardRow extends BoardEntry {
  /** 1-based place among the shown; undefined for hidden rows */
  place?: number
  value?: number
}

/** Shown first by amount (ties share a place), hidden ones last */
export function moneyBoard(entries: BoardEntry[], period: MoneyPeriod): BoardRow[] {
  const shown = entries
    .filter((e) => e.money)
    .map((e) => ({ ...e, value: e.money![period] }))
    .sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
  let place = 0
  let prev: number | undefined
  const rows: BoardRow[] = shown.map((e, i) => {
    if (e.value !== prev) place = i + 1
    prev = e.value
    return { ...e, place }
  })
  const hidden = entries.filter((e) => !e.money).sort((a, b) => (a.me ? -1 : b.me ? 1 : a.name < b.name ? -1 : 1))
  return [...rows, ...hidden]
}

// ---------- v0.16 «Путь к $10k» ----------

/** ₽ per $: only for the milestones; the user sets it in «Ещё» */
export const USD_RATE_DEFAULT = 80
export const USD_RATE_MIN = 1
export const USD_RATE_MAX = 1000

export function usdRateOf(data: Pick<AppData, 'settings'>): number {
  const r = Number(data.settings.usdRate)
  return Number.isFinite(r) && r >= USD_RATE_MIN && r <= USD_RATE_MAX ? r : USD_RATE_DEFAULT
}

export interface Milestone {
  id: string
  /** income of one calendar month, $ */
  usd: number
  xp: number
  shards: number
  /** avatar.ts GEAR `milestone` */
  item?: string
  title?: string
}

/** First time a calendar month reaches the amount: once each, in the arc */
export const MILESTONES: Milestone[] = [
  { id: 'usd1k', usd: 1000, xp: 150, shards: 20 },
  { id: 'usd2500', usd: 2500, xp: 300, shards: 40 },
  { id: 'usd5k', usd: 5000, xp: 500, shards: 60 },
  { id: 'usd10k', usd: 10000, xp: 1000, shards: 100, item: 'goldsuit', title: 'Десятка в месяц' },
]

export const formatUsd = (n: number) => `$${Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`

const monthOf = (day: DayKey) => day.slice(0, 7)

export interface MilestoneEvent {
  id: string
  usd: number
  day: DayKey
  at: number
  xp: number
  shards: number
}

/**
 * Walk the incomes month by month in (day, at) order: the entry that lifts a month over a milestone
 * gives it, on its day. A milestone already reached in an earlier month never comes again.
 * Only days of the arc (warm-up included) count.
 */
export function milestoneEvents(data: Pick<AppData, 'incomes' | 'settings'>): MilestoneEvent[] {
  const rate = usdRateOf(data)
  const list = incomesOf(data)
    .filter((x) => x.day <= ARC_END)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at || (a.id < b.id ? -1 : 1)))
  const got = new Set<string>()
  const out: MilestoneEvent[] = []
  let month = ''
  let sum = 0
  for (const x of list) {
    if (monthOf(x.day) !== month) {
      month = monthOf(x.day)
      sum = 0
    }
    sum += x.amount
    for (const m of MILESTONES) {
      if (got.has(m.id) || sum / rate < m.usd) continue
      got.add(m.id)
      out.push({ id: m.id, usd: m.usd, day: x.day, at: x.at, xp: m.xp, shards: m.shards })
    }
  }
  return out
}

export interface MoneyPath {
  /** YYYY-MM of today */
  month: string
  rub: number
  usd: number
  rate: number
  /** the next milestone of this month (null: this month is past $10k) */
  next: Milestone | null
  /** the milestone below `next` (its start on the bar), 0 for the first */
  from: number
  progress: number
  /** milestones reached at least once */
  reached: string[]
}

/** «Путь к $10k»: the current calendar month toward its next milestone */
export function moneyPath(data: Pick<AppData, 'incomes' | 'settings'>, today: DayKey): MoneyPath {
  const rate = usdRateOf(data)
  const month = monthOf(today)
  const rub = incomesOf(data)
    .filter((x) => monthOf(x.day) === month && x.day <= today)
    .reduce((s, x) => s + x.amount, 0)
  const usd = rub / rate
  const next = MILESTONES.find((m) => usd < m.usd) ?? null
  const i = next ? MILESTONES.indexOf(next) : MILESTONES.length
  const from = i > 0 ? MILESTONES[i - 1].usd : 0
  const progress = next ? Math.max(0, Math.min(1, (usd - from) / (next.usd - from))) : 1
  return { month, rub, usd, rate, next, from, progress, reached: milestoneEvents(data).map((e) => e.id) }
}
