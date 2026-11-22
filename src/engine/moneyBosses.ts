/**
 * v0.17 «Боссы месяца»: five money bosses respawn every calendar month (of game days, 04:00 boundary).
 * HP is in $, damage is the month's logged income at the user's «Курс $». Each kill pays every month;
 * the first-ever kill of the main one ($10k) also gives the gold suit and the title «Десятка в месяц».
 * Money XP is 1 per $10 of the month: per entry it is the step of floor(monthUsd / 10), so the month's
 * XP is exactly floor(total / 10) whatever the order, and an undone entry takes its XP back.
 * Pure and deterministic: computeState replays these events.
 */
import { ARC_END, addDays, diffDays } from './time'
import { incomesOf, usdRateOf } from './money'
import type { AppData, DayKey, Income } from './types'

export interface MoneyBoss {
  id: string
  name: string
  /** HP, $ of one calendar month */
  usd: number
  xp: number
  shards: number
  main?: boolean
}

/** The user's own names, verbatim */
export const MONEY_BOSSES: MoneyBoss[] = [
  { id: 'mb1', name: 'Босс отсос', usd: 500, xp: 100, shards: 10 },
  { id: 'mb2', name: 'Босс говна насос', usd: 1000, xp: 200, shards: 20 },
  { id: 'mb3', name: 'Босс посёлка городского типа', usd: 2500, xp: 400, shards: 40 },
  { id: 'mb4', name: 'Босс езжу только на бизнес такси', usd: 5000, xp: 700, shards: 60 },
  { id: 'mb5', name: 'Босс смерть в нищете пока шлюха', usd: 10000, xp: 1500, shards: 150, main: true },
]
export const MAIN_MONEY_BOSS = MONEY_BOSSES[MONEY_BOSSES.length - 1]
/** First-ever kill of the main boss: avatar.ts GEAR `moneyBoss` + the hero title */
export const MAIN_BOSS_PRIZE = { item: 'goldsuit', title: 'Десятка в месяц' } as const

/** Money XP: one per this many $ of a month */
export const MONEY_XP_USD = 10

export const moneyBossById = (id: string) => MONEY_BOSSES.find((b) => b.id === id)

/** YYYY-MM of a game day */
export const monthOf = (day: DayKey) => day.slice(0, 7)

/** Last game day of the month of `day` */
export function monthEnd(day: DayKey): DayKey {
  const [y, m] = day.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${day.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
export const monthTitle = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month

const byTime = (a: Income, b: Income) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at || (a.id < b.id ? -1 : 1))

export interface MoneyXpEvent {
  day: DayKey
  at: number
  xp: number
}

export interface MoneyKillEvent {
  month: string
  id: string
  day: DayKey
  at: number
  xp: number
  shards: number
}

/**
 * Walk the incomes month by month in (day, at) order. Every entry gives the XP step it makes,
 * the entry that lifts a month over a boss's HP kills it on its day. Kills count in the arc only.
 */
export function moneyMonthEvents(data: Pick<AppData, 'incomes' | 'settings'>): { xp: MoneyXpEvent[]; kills: MoneyKillEvent[] } {
  const rate = usdRateOf(data)
  const xp: MoneyXpEvent[] = []
  const kills: MoneyKillEvent[] = []
  let month = ''
  let sum = 0
  for (const x of [...incomesOf(data)].sort(byTime)) {
    if (monthOf(x.day) !== month) {
      month = monthOf(x.day)
      sum = 0
    }
    const before = sum / rate
    sum += x.amount
    const after = sum / rate
    const step = Math.floor(after / MONEY_XP_USD) - Math.floor(before / MONEY_XP_USD)
    if (step > 0) xp.push({ day: x.day, at: x.at, xp: step })
    if (x.day > ARC_END) continue
    for (const b of MONEY_BOSSES) if (before < b.usd && after >= b.usd) kills.push({ month, id: b.id, day: x.day, at: x.at, xp: b.xp, shards: b.shards })
  }
  return { xp, kills }
}

/** Income of the month of `day`, up to `day`, in ₽ */
export function monthRub(data: Pick<AppData, 'incomes'>, day: DayKey): number {
  const m = monthOf(day)
  return incomesOf(data)
    .filter((x) => monthOf(x.day) === m && x.day <= day)
    .reduce((s, x) => s + x.amount, 0)
}

/** XP a new entry of `extra` ₽ on `day` would add: the month's floor($ / 10) step */
export function moneyXpDelta(data: Pick<AppData, 'incomes' | 'settings'>, day: DayKey, extra: number): number {
  const rate = usdRateOf(data)
  const m = monthOf(day)
  const t = incomesOf(data)
    .filter((x) => monthOf(x.day) === m)
    .reduce((s, x) => s + x.amount, 0)
  return Math.floor((t + extra) / rate / MONEY_XP_USD) - Math.floor(t / rate / MONEY_XP_USD)
}

/** Bosses a new entry would kill (for the sheet hint) */
export function moneyKillsBy(data: Pick<AppData, 'incomes' | 'settings'>, day: DayKey, extra: number): MoneyBoss[] {
  const rate = usdRateOf(data)
  const m = monthOf(day)
  const t = incomesOf(data)
    .filter((x) => monthOf(x.day) === m)
    .reduce((s, x) => s + x.amount, 0)
  return MONEY_BOSSES.filter((b) => t / rate < b.usd && (t + extra) / rate >= b.usd)
}

export type LadderStep = 'dead' | 'cur' | 'next'

export interface MoneyLadder {
  /** YYYY-MM of today (game day) */
  month: string
  rub: number
  usd: number
  rate: number
  steps: { boss: MoneyBoss; state: LadderStep }[]
  /** the lowest boss still alive this month (null: all five dead) */
  target: MoneyBoss | null
  /** the target's HP bar: month $ vs its HP */
  progress: number
  killed: number
  /** the main boss of the month */
  main: { dead: boolean; left: number; daysLeft: number; perDay: number }
}

/** The ladder of this game month: computed straight from the incomes */
export function moneyLadder(data: Pick<AppData, 'incomes' | 'settings'>, today: DayKey): MoneyLadder {
  const rate = usdRateOf(data)
  const rub = monthRub(data, today)
  const usd = rub / rate
  const target = MONEY_BOSSES.find((b) => usd < b.usd) ?? null
  const steps = MONEY_BOSSES.map((boss) => ({ boss, state: (usd >= boss.usd ? 'dead' : boss === target ? 'cur' : 'next') as LadderStep }))
  const left = Math.max(0, MAIN_MONEY_BOSS.usd - usd)
  const daysLeft = diffDays(today, monthEnd(today)) + 1
  return {
    month: monthOf(today),
    rub,
    usd,
    rate,
    steps,
    target,
    progress: target ? Math.max(0, Math.min(1, usd / target.usd)) : 1,
    killed: steps.filter((s) => s.state === 'dead').length,
    main: { dead: left === 0, left, daysLeft, perDay: left / daysLeft },
  }
}

export interface MoneyMonth {
  month: string
  usd: number
  killed: number
  main: boolean
  /** the current month: still going */
  live: boolean
}

/** One row per month from `from` (warm-up included) to today, inside the arc; newest first */
export function moneyMonths(data: Pick<AppData, 'incomes' | 'settings'>, from: DayKey, today: DayKey): MoneyMonth[] {
  const rate = usdRateOf(data)
  const last = today < ARC_END ? today : ARC_END
  const out: MoneyMonth[] = []
  for (let d = `${monthOf(from)}-01`; d <= last; d = addDays(monthEnd(d), 1)) {
    const usd = monthRub(data, d === `${monthOf(last)}-01` ? last : monthEnd(d)) / rate
    const killed = MONEY_BOSSES.filter((b) => usd >= b.usd).length
    out.push({ month: monthOf(d), usd, killed, main: usd >= MAIN_MONEY_BOSS.usd, live: monthOf(d) === monthOf(today) })
  }
  return out.reverse()
}
