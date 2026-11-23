/**
 * «13 недель» — the user's take on «The 12 Week Year». The arc (98 days, 23 Nov – 28 Feb) is 13 battle
 * weeks (91 days, to 21 Feb) and a 14th final week (review, final measurements, «Покоритель зимы»).
 * One week ≈ 8% of the arc: «неделя = месяц».
 *
 * A week is scored by execution: done target actions / planned target actions, where the target actions
 * are the main quests of each day (done 1, mini 0.5, skip/missed 0; only days up to today; frozen days
 * are left out) plus the week's goals (done 1, a numeric goal min(1, progress/target)). ≥ 85% = won.
 *
 * Arc goals («Цели на 13 недель») carry weekly tactics; every game week of the battle the tactics become
 * that week's goals once (`materializeTactics`). PRIVACY: arc goals never leave the device except the
 * own sync; nothing here is read by social.ts.
 * Pure functions only.
 */
import type { GameState } from './replay'
import { dayStreak } from './streak'
import { goalPct, goalsOfWeek, isGoalDone, sanitizeWeekGoal } from './week'
import { incomesOf } from './money'
import { CONQUEROR } from './conqueror'
import { ARC_END, ARC_START, addDays, diffDays } from './time'
import { weekStartOf } from './skills'
import type { AppData, ArcGoal, ArcTactic, DayKey, WeekGoal } from './types'

export const BATTLE_WEEKS = 13
export const BATTLE_DAYS = BATTLE_WEEKS * 7
/** the last battle day, Sunday of week 13 */
export const BATTLE_END: DayKey = addDays(ARC_START, BATTLE_DAYS - 1)
export const FINAL_WEEK = 14
/** a week is won at ≥ 85% */
export const WEEK_WIN = 0.85
/** share of the arc one week is: 7/91 ≈ 8% */
export const WEEK_SHARE = Math.round((7 / BATTLE_DAYS) * 100)

export const ARC_LIMITS = { goals: 3, tactics: 8, title: 80, unit: 16, target: 1_000_000 } as const

// ---------- the calendar ----------

/** 1..14 inside the arc, 0 before it, 15 after it */
export function arcWeekOf(day: DayKey): number {
  if (day < ARC_START) return 0
  if (day > ARC_END) return FINAL_WEEK + 1
  return Math.floor(diffDays(ARC_START, day) / 7) + 1
}

/** Monday of arc week `n` (1..14) */
export const arcWeekStart = (n: number): DayKey => addDays(ARC_START, (n - 1) * 7)
export const arcWeekDays = (n: number): DayKey[] => Array.from({ length: 7 }, (_, i) => addDays(arcWeekStart(n), i))

export type ArcPhase = 'warmup' | 'battle' | 'final' | 'after'

export interface ArcPos {
  phase: ArcPhase
  /** arc week 1..14 (0 before, 15 after) */
  week: number
  /** battle day 1..91 (clamped to 0..91) */
  day: number
  /** battle days after today (91 − day); 0 on the last battle day */
  daysLeft: number
  /** warm-up: days until 23 Nov */
  untilStart: number
  /** share of the battle passed, 0..1 (today counts as begun) */
  progress: number
}

export function arcPos(today: DayKey): ArcPos {
  const n = diffDays(ARC_START, today) + 1
  const week = arcWeekOf(today)
  const phase: ArcPhase = n < 1 ? 'warmup' : n <= BATTLE_DAYS ? 'battle' : today <= ARC_END ? 'final' : 'after'
  const day = Math.max(0, Math.min(BATTLE_DAYS, n))
  return { phase, week, day, daysLeft: BATTLE_DAYS - day, untilStart: Math.max(0, 1 - n), progress: day / BATTLE_DAYS }
}

/** Days left in the current battle week after today (Sunday → 0) */
export const weekDaysLeft = (today: DayKey) => 6 - diffDays(weekStartOf(today), today)

// ---------- the grid ----------

export type ArcCell = 'done' | 'frozen' | 'miss' | 'open' | 'future' | 'none'

/** green closed (perfect), blue frozen, red closed and not perfect, open = today not closed yet, grey future */
export function arcCell(game: Pick<GameState, 'days'>, day: DayKey, today: DayKey): ArcCell {
  if (day > today) return 'future'
  const r = game.days[day]
  if (!r) return 'none'
  if (r.perfect) return 'done'
  if (r.frozen) return 'frozen'
  if (r.closed) return 'miss'
  return day === today ? 'open' : 'none'
}

export function arcGrid(game: Pick<GameState, 'days'>, today: DayKey): { week: number; days: { day: DayKey; state: ArcCell }[] }[] {
  return Array.from({ length: FINAL_WEEK }, (_, i) => ({ week: i + 1, days: arcWeekDays(i + 1).map((day) => ({ day, state: arcCell(game, day, today) })) }))
}

// ---------- week score ----------

export interface WeekScore {
  week: number
  monday: DayKey
  /** target actions done (mini = 0.5, a numeric goal by its share) */
  done: number
  planned: number
  /** done / planned, null when nothing was planned yet */
  score: number | null
  mains: { done: number; planned: number }
  goals: { done: number; planned: number }
  /** the week's Sunday is behind */
  ended: boolean
  current: boolean
  /** ended with score ≥ 85% */
  won: boolean
  /** the score right now is ≥ 85% (for the current week) */
  onTrack: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function weekScore(data: Pick<AppData, 'weekGoals'>, game: Pick<GameState, 'days'>, week: number, today: DayKey): WeekScore {
  const monday = arcWeekStart(week)
  const mains = { done: 0, planned: 0 }
  for (const d of arcWeekDays(week)) {
    if (d > today) break
    const r = game.days[d]
    if (!r || r.frozen) continue
    for (const p of r.plan) {
      if (p.role !== 'main') continue
      mains.planned++
      const m = r.marks[p.id]
      mains.done += m === 'done' ? 1 : m === 'mini' ? 0.5 : 0
    }
  }
  const goals = { done: 0, planned: 0 }
  if (monday <= today) {
    for (const g of goalsOfWeek(data, monday)) {
      goals.planned++
      goals.done += goalPct(g)
    }
  }
  const done = round2(mains.done + goals.done)
  const planned = mains.planned + goals.planned
  const score = planned ? done / planned : null
  const ended = addDays(monday, 6) < today
  const onTrack = score !== null && score >= WEEK_WIN - 1e-9
  return { week, monday, done, planned, score, mains, goals: { done: round2(goals.done), planned: goals.planned }, ended, current: !ended && monday <= today, won: ended && onTrack, onTrack }
}

/** Weeks 1..14 (14 = the final week, outside the won-weeks count) */
export function arcScores(data: Pick<AppData, 'weekGoals'>, game: Pick<GameState, 'days'>, today: DayKey): WeekScore[] {
  return Array.from({ length: FINAL_WEEK }, (_, i) => weekScore(data, game, i + 1, today))
}

/**
 * Won battle weeks in a row: only ended weeks count; the current unfinished week never breaks the run
 * (and does not add to it until it ends).
 */
export function wonStreak(scores: WeekScore[]): { run: number; best: number; won: number; passed: number } {
  let run = 0
  let best = 0
  let won = 0
  let passed = 0
  for (const s of scores) {
    if (s.week > BATTLE_WEEKS || !s.ended) continue
    passed++
    if (s.won) {
      won++
      best = Math.max(best, ++run)
    } else run = 0
  }
  return { run, best, won, passed }
}

// ---------- totals ----------

export interface ArcTotals {
  /** target actions done / planned, the whole arc up to today */
  done: number
  planned: number
  /** «проёбано»: missed mains on closed (not frozen) days + week goals unfinished after their week */
  wasted: number
  closedDays: number
  bestDayStreak: number
  weeksWon: number
  weeksPassed: number
  /** only when money is logged in the arc */
  money?: { rub: number; kills: number }
  conqueror: { closed: number; need: number }
}

export function arcTotals(data: Pick<AppData, 'weekGoals' | 'incomes'>, game: Pick<GameState, 'days' | 'moneyKills'>, today: DayKey, scores = arcScores(data, game, today)): ArcTotals {
  let done = 0
  let planned = 0
  let wasted = 0
  for (const s of scores) {
    done += s.done
    planned += s.planned
    if (s.ended) wasted += goalsOfWeek(data, s.monday).filter((g) => !isGoalDone(g)).length
  }
  let closedDays = 0
  for (const [d, r] of Object.entries(game.days)) {
    if (d < ARC_START || d > ARC_END || d > today) continue
    if (r.perfect) closedDays++
    if (r.closed && !r.frozen) wasted += r.missedMain.length
  }
  const ws = wonStreak(scores)
  const incomes = incomesOf(data).filter((x) => x.day >= ARC_START && x.day <= ARC_END && x.day <= today)
  const kills = (game.moneyKills ?? []).filter((k) => k.day >= ARC_START && k.day <= ARC_END && k.day <= today).length
  return {
    done: round2(done),
    planned,
    wasted,
    closedDays,
    bestDayStreak: dayStreak(game, today).best,
    weeksWon: ws.won,
    weeksPassed: ws.passed,
    ...(incomes.length ? { money: { rub: incomes.reduce((a, x) => a + x.amount, 0), kills } } : {}),
    conqueror: { closed: closedDays, need: CONQUEROR.need },
  }
}

// ---------- arc goals ----------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(ARC_LIMITS.target, Math.round(v * 100) / 100) : undefined)
const okTime = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function sanitizeTactic(raw: unknown): ArcTactic | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<ArcTactic>
  const title = str(x.title, ARC_LIMITS.title)
  if (typeof x.id !== 'string' || !x.id || !title) return null
  const out: ArcTactic = { id: x.id.slice(0, 64), title, createdAt: okTime(x.createdAt) }
  const target = num(x.target)
  if (target) {
    out.target = target
    const unit = str(x.unit, ARC_LIMITS.unit)
    if (unit) out.unit = unit
  }
  const made = Array.isArray(x.made) ? [...new Set(x.made.filter((d): d is string => typeof d === 'string' && DAY_RE.test(d)).map(weekStartOf))].sort() : []
  if (made.length) out.made = made
  return out
}

export function sanitizeArcGoal(raw: unknown): ArcGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<ArcGoal>
  const title = str(x.title, ARC_LIMITS.title)
  if (typeof x.id !== 'string' || !x.id || !title) return null
  const seen = new Set<string>()
  const tactics = (Array.isArray(x.tactics) ? x.tactics : [])
    .map(sanitizeTactic)
    .filter((t): t is ArcTactic => !!t && !seen.has(t.id) && !!seen.add(t.id))
    .slice(0, ARC_LIMITS.tactics)
  return {
    id: x.id.slice(0, 64),
    title,
    tactics,
    ...(x.private === true ? { private: true } : {}),
    order: Number.isFinite(x.order) ? Number(x.order) : 0,
    createdAt: okTime(x.createdAt),
    updatedAt: okTime(x.updatedAt),
  }
}

export const compareArcGoals = (a: ArcGoal, b: ArcGoal) => a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const arcGoalsOf = (data: Pick<AppData, 'arcGoals'>): ArcGoal[] => [...(data.arcGoals ?? [])].filter(Boolean).sort(compareArcGoals)

/** The week goal id of a tactic's copy: the same on every device, so two devices converge on one atom */
export const tacticGoalId = (tacticId: string, monday: DayKey) => `tac-${tacticId}-${monday}`

/**
 * Turns every tactic into this week's goal once (battle weeks 1..13, from the Monday 04:00 game day).
 * Idempotent: a tactic whose `made` has the week, or that already has a copy, is skipped; a deleted
 * copy is never recreated. Returns null when nothing changes, else a new data object.
 */
export function materializeTactics<T extends Pick<AppData, 'arcGoals' | 'weekGoals'>>(data: T, today: DayKey, now: number): T | null {
  if (today < ARC_START || today > BATTLE_END || !(data.arcGoals ?? []).length) return null
  const monday = weekStartOf(today)
  const weekGoals = [...(data.weekGoals ?? [])]
  let order = weekGoals.filter((g) => g.week === monday).reduce((m, g) => Math.max(m, g.order + 1), 0)
  let changed = false
  const arcGoals = arcGoalsOf(data).map((ag) => {
    let touched = false
    const tactics = ag.tactics.map((t) => {
      if (t.made?.includes(monday)) return t
      touched = true
      if (!weekGoals.some((g) => g.week === monday && g.tacticId === t.id)) {
        const g = sanitizeWeekGoal({ id: tacticGoalId(t.id, monday), week: monday, title: t.title, target: t.target, unit: t.unit, private: ag.private, tacticId: t.id, order: order++, createdAt: now, updatedAt: now })
        if (g) weekGoals.push(g)
      }
      return { ...t, made: [...(t.made ?? []), monday].sort() }
    })
    if (!touched) return ag
    changed = true
    return { ...ag, tactics }
  })
  return changed ? { ...data, arcGoals, weekGoals } : null
}

/** «Тактики выполнены N из M недель»: weeks where the goal's tactic copies were all done (current week included once all done) */
export function tacticWeeks(data: Pick<AppData, 'weekGoals'>, goal: ArcGoal, today: DayKey): { done: number; total: number } {
  const ids = new Set(goal.tactics.map((t) => t.id))
  const byWeek = new Map<DayKey, WeekGoal[]>()
  for (const g of data.weekGoals ?? []) {
    if (!g?.tacticId || !ids.has(g.tacticId) || g.week > today) continue
    const list = byWeek.get(g.week) ?? []
    list.push(g)
    byWeek.set(g.week, list)
  }
  let done = 0
  let total = 0
  for (const [monday, list] of byWeek) {
    const allDone = list.every(isGoalDone)
    const ended = addDays(monday, 6) < today
    if (ended || allDone) total++
    if (allDone) done++
  }
  return { done, total }
}
