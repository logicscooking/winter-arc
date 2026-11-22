/**
 * v0.7 «Заработано»: own money as part of the fight with «отложенная жизнь».
 * Pure rules: validation, week / arc totals and the party leaderboard (XP and bosses: moneyBosses.ts).
 * Privacy: only `publicMoney` may build what leaves the device, and only when the user opted in.
 */
import { weekStartOf } from './skills'
import { ARC_END } from './time'
import type { AppData, DayKey, Income } from './types'

/** one entry: whole rubles, 1 … 10 млн */
export const MONEY_MAX = 10_000_000
/** a friend's published total above this is not believable → ignored */
export const MONEY_PUB_MAX = 1_000_000_000
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

// ---------- party ----------

export const moneyShareOn = (data: Pick<AppData, 'settings'>) => data.settings.moneyShare === true

/** What goes to public_stats.payload.money: totals and the month's boss kills, only when the user opted in */
export function publicMoney(data: Pick<AppData, 'incomes' | 'settings'>, today: DayKey): (MoneyTotals & { bosses: { month: string; killed: number } }) | undefined {
  if (!moneyShareOn(data)) return undefined
  const rate = usdRateOf(data)
  const month = today.slice(0, 7)
  const usd = incomesOf(data).filter((x) => x.day.slice(0, 7) === month && x.day <= today).reduce((s, x) => s + x.amount, 0) / rate
  return { ...moneyTotals(data, today), bosses: { month, killed: MONEY_BOSS_HP.filter((hp) => usd >= hp).length } }
}

/** HP of the five money bosses, $ (the bosses themselves: moneyBosses.ts MONEY_BOSSES) */
export const MONEY_BOSS_HP = [500, 1000, 2500, 5000, 10000] as const

const okSum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MONEY_PUB_MAX

/**
 * A friend's published totals. Anything malformed → null (not shown). A week total from another week
 * counts as 0 for this week: the friend simply has not opened the app since Monday.
 */
export function safeMoney(raw: unknown, today: DayKey): FriendMoney | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!okSum(r.week) || !okSum(r.arc) || typeof r.weekKey !== 'string' || !DAY_RE.test(r.weekKey)) return null
  const out: FriendMoney = { week: r.weekKey === weekStartOf(today) ? Math.round(r.week) : 0, arc: Math.round(r.arc) }
  // v0.17 «Боссы месяца»: kills of this month (another month → 0); old clients send none
  const b = r.bosses as Record<string, unknown> | undefined
  if (b && typeof b === 'object' && typeof b.month === 'string' && Number.isInteger(b.killed) && (b.killed as number) >= 0 && (b.killed as number) <= 5)
    out.bosses = b.month === today.slice(0, 7) ? (b.killed as number) : 0
  return out
}

export interface FriendMoney {
  week: number
  arc: number
  /** money bosses killed this month (0…5), missing: not published */
  bosses?: number
}

export type MoneyPeriod = 'week' | 'arc'

export interface BoardEntry {
  id: string
  name: string
  me?: boolean
  /** null: hidden (not shared or not valid) */
  money: FriendMoney | null
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

// ---------- $ (v0.16, v0.17 «Боссы месяца» in moneyBosses.ts) ----------

/** ₽ per $: for the money bosses and money XP; the user sets it in «Ещё» */
export const USD_RATE_DEFAULT = 80
export const USD_RATE_MIN = 1
export const USD_RATE_MAX = 1000

export function usdRateOf(data: Pick<AppData, 'settings'>): number {
  const r = Number(data.settings.usdRate)
  return Number.isFinite(r) && r >= USD_RATE_MIN && r <= USD_RATE_MAX ? r : USD_RATE_DEFAULT
}

export const formatUsd = (n: number) => `$${Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
