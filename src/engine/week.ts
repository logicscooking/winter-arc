/**
 * «Неделя»: goals of the week (Mon–Sun by game day), the Sunday «Итог недели» pitch deck and
 * «Скопировать для ИИ» (a ready prompt + a tolerant parser of the answer). Pure functions only.
 *
 * PRIVACY: goals and the finished итог are meant for the party, so `publicWeek` / `publicRecap`
 * publish them — except goals marked «только мне», an итог marked hidden and money without the
 * opt-in. Nothing here may read the diary, the dump, notes or confessions: diary lines appear as
 * suggestions only on the device (WeekReview), and only what the user types into an insight leaves it.
 */
import { gameDayOf, addDays, formatDayRu, parseDay, RU_MONTHS_GEN } from './time'
import { weekStartOf } from './skills'
import { moneyShareOn } from './money'
import type { AppData, DayKey, PlanDraft, StatId, WeekGoal, WeekFigures, WeekRecap } from './types'

export const WEEK_LIMITS = {
  title: 80,
  unit: 16,
  target: 1_000_000,
  insights: 3,
  insight: 280,
  fails: 5,
  failWhat: 160,
  failWhy: 280,
  plan: 12,
  summary: 800,
  /** a friend's payload beyond this is cut */
  pubGoals: 12,
} as const

/**
 * XP: a small reward for setting the week's goals and for finishing its итог, once per week each.
 * Only in time (goals: from the Sunday before to the week's Sunday; итог: from its Sunday to the
 * next Saturday), so past weeks can't be farmed.
 */
export const WEEK_XP = { goals: 10, goalsStat: 'will' as StatId, recap: 15, recapStat: 'mind' as StatId, recapShards: 3 } as const

// ---------- week math ----------

/** Monday of the game week a moment belongs to (Monday 03:59 is still the previous week) */
export const weekKeyOf = (now: Date): DayKey => weekStartOf(gameDayOf(now))
export const weekOfDay = (day: DayKey): DayKey => weekStartOf(day)
export const nextWeekKey = (monday: DayKey): DayKey => addDays(weekStartOf(monday), 7)
export const prevWeekKey = (monday: DayKey): DayKey => addDays(weekStartOf(monday), -7)
export const weekDaysOf = (monday: DayKey): DayKey[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

/** «16–22 ноября», «30 ноября – 6 декабря» */
export function weekLabel(monday: DayKey): string {
  const sun = addDays(monday, 6)
  const a = parseDay(monday)
  const b = parseDay(sun)
  return a.m === b.m ? `${a.d}–${b.d} ${RU_MONTHS_GEN[b.m - 1]}` : `${formatDayRu(monday)} – ${formatDayRu(sun)}`
}

/** The итог of a week opens on its Sunday and stays on «Сегодня» until the next Saturday */
export function recapWindow(monday: DayKey, today: DayKey): boolean {
  return today >= addDays(monday, 6) && today <= addDays(monday, 12)
}

/** The week whose итог «Сегодня» offers: this week on Sunday, else the past week */
export function recapWeekFor(today: DayKey): DayKey {
  const mon = weekStartOf(today)
  return today === addDays(mon, 6) ? mon : addDays(mon, -7)
}

// ---------- goals ----------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const num = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v * 100) / 100) : undefined)
const okTime = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function sanitizeWeekGoal(raw: unknown): WeekGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<WeekGoal>
  const title = str(x.title, WEEK_LIMITS.title)
  if (typeof x.id !== 'string' || !x.id || !title || typeof x.week !== 'string' || !DAY_RE.test(x.week)) return null
  const out: WeekGoal = { id: x.id, week: weekStartOf(x.week), title, order: Number.isFinite(x.order) ? Number(x.order) : 0, createdAt: okTime(x.createdAt), updatedAt: okTime(x.updatedAt) }
  const target = num(x.target, WEEK_LIMITS.target)
  if (target) {
    out.target = target
    const unit = str(x.unit, WEEK_LIMITS.unit)
    if (unit) out.unit = unit
  }
  const progress = num(x.progress, WEEK_LIMITS.target)
  if (progress) out.progress = progress
  if (x.done === true) out.done = true
  if (x.private === true) out.private = true
  if (typeof x.tacticId === 'string' && x.tacticId) out.tacticId = x.tacticId.slice(0, 64)
  return out
}

export const compareWeekGoals = (a: WeekGoal, b: WeekGoal) =>
  (a.week < b.week ? -1 : a.week > b.week ? 1 : 0) || a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function goalsOfWeek(data: Pick<AppData, 'weekGoals'>, monday: DayKey, { withPrivate = true } = {}): WeekGoal[] {
  const key = weekStartOf(monday)
  return (data.weekGoals ?? []).filter((g) => g && g.week === key && (withPrivate || !g.private)).sort(compareWeekGoals)
}

export const isGoalDone = (g: Pick<WeekGoal, 'done' | 'target' | 'progress'>) => !!g.done || (!!g.target && (g.progress ?? 0) >= g.target)

export type GoalFact = 'done' | 'partial' | 'none'
export function goalFact(g: Pick<WeekGoal, 'done' | 'target' | 'progress'>): GoalFact {
  if (isGoalDone(g)) return 'done'
  return (g.progress ?? 0) > 0 ? 'partial' : 'none'
}

/** 0..1 for the bar: a numeric goal by progress, a plain one 0 or 1 */
export function goalPct(g: Pick<WeekGoal, 'done' | 'target' | 'progress'>): number {
  if (isGoalDone(g)) return 1
  return g.target ? Math.max(0, Math.min(1, (g.progress ?? 0) / g.target)) : 0
}

/** +/− on a numeric goal: never below 0; reaching the target marks it done, going back unmarks */
export function bumpProgress(g: WeekGoal, delta: number, now: number): WeekGoal {
  const progress = Math.max(0, Math.min(WEEK_LIMITS.target, Math.round(((g.progress ?? 0) + delta) * 100) / 100))
  const next: WeekGoal = { ...g, progress, updatedAt: now }
  if (!progress) delete next.progress
  if (g.target) {
    if (progress >= g.target) next.done = true
    else delete next.done
  }
  return next
}

/** «3 из 5 · 1 частично» */
export function goalsTally(goals: Pick<WeekGoal, 'done' | 'target' | 'progress'>[]): { done: number; partial: number; total: number } {
  let done = 0
  let partial = 0
  for (const g of goals) {
    const f = goalFact(g)
    if (f === 'done') done++
    else if (f === 'partial') partial++
  }
  return { done, partial, total: goals.length }
}

/** «20 постов», «100 сообщений лидам»: a number with an optional unit at the start or the end */
export function parseGoalText(raw: string): PlanDraft {
  const t = raw.replace(/\s+/g, ' ').trim()
  const pipe = t.split('|')
  if (pipe.length > 1) {
    const title = pipe[0].trim()
    const m = pipe.slice(1).join(' ').trim().match(/^(\d[\d\s]*(?:[.,]\d+)?)\s*(.*)$/)
    const target = m ? Number(m[1].replace(/\s/g, '').replace(',', '.')) : NaN
    return Number.isFinite(target) && target > 0 ? { title: title.slice(0, WEEK_LIMITS.title), target: Math.min(WEEK_LIMITS.target, target), ...(m![2] ? { unit: m![2].slice(0, WEEK_LIMITS.unit) } : {}) } : { title: t.replace(/\|/g, ' ').slice(0, WEEK_LIMITS.title) }
  }
  return { title: t.slice(0, WEEK_LIMITS.title) }
}

// ---------- recap ----------

export function emptyRecap(monday: DayKey, now = 0): WeekRecap {
  return { id: weekStartOf(monday), insights: [], fails: [], nextPlan: [], updatedAt: now }
}

function sanitizeDraft(raw: unknown): PlanDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<PlanDraft>
  const title = str(x.title, WEEK_LIMITS.title)
  if (!title) return null
  const target = num(x.target, WEEK_LIMITS.target)
  const unit = target ? str(x.unit, WEEK_LIMITS.unit) : ''
  return { title, ...(target ? { target } : {}), ...(unit ? { unit } : {}) }
}

function sanitizeNumbers(raw: unknown): WeekFigures | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const x = raw as Partial<WeekFigures>
  const n = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : 0)
  return {
    pct: n(x.pct, 100),
    days: n(x.days, 7),
    perfect: n(x.perfect, 7),
    xp: n(x.xp, 100_000),
    streak: n(x.streak, 10_000),
    quests: (Array.isArray(x.quests) ? x.quests : [])
      .slice(0, 6)
      .filter((q) => q && str(q.t, 40))
      .map((q) => ({ t: str(q.t, 40), n: n(q.n, 7), ...(typeof q.s === 'number' && q.s > 0 ? { s: n(q.s) } : {}), ...(str(q.u, WEEK_LIMITS.unit) ? { u: str(q.u, WEEK_LIMITS.unit) } : {}) })),
    ...(typeof x.money === 'number' && Number.isFinite(x.money) && x.money >= 0 ? { money: Math.min(1e9, Math.round(x.money)) } : {}),
  }
}

/** Keeps half-typed text (spaces inside) — only cuts lengths and drops broken entries */
export function sanitizeRecap(raw: unknown): WeekRecap | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Partial<WeekRecap>
  if (typeof x.id !== 'string' || !DAY_RE.test(x.id)) return null
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const out: WeekRecap = {
    id: weekStartOf(x.id),
    insights: (Array.isArray(x.insights) ? x.insights : []).slice(0, WEEK_LIMITS.insights).map((s) => text(s, WEEK_LIMITS.insight)),
    fails: (Array.isArray(x.fails) ? x.fails : [])
      .slice(0, WEEK_LIMITS.fails)
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({ what: text(f.what, WEEK_LIMITS.failWhat), why: text(f.why, WEEK_LIMITS.failWhy) })),
    nextPlan: (Array.isArray(x.nextPlan) ? x.nextPlan : []).slice(0, WEEK_LIMITS.plan).map(sanitizeDraft).filter((d): d is PlanDraft => !!d),
    updatedAt: okTime(x.updatedAt),
  }
  const ai = str(x.aiSummary, WEEK_LIMITS.summary)
  if (ai) out.aiSummary = ai
  const nums = sanitizeNumbers(x.numbers)
  if (nums) out.numbers = nums
  if (typeof x.doneAt === 'number' && Number.isFinite(x.doneAt) && x.doneAt > 0) out.doneAt = x.doneAt
  if (typeof x.appliedAt === 'number' && Number.isFinite(x.appliedAt) && x.appliedAt > 0) out.appliedAt = x.appliedAt
  if (x.private === true) out.private = true
  return out
}

export function recapOf(data: Pick<AppData, 'weekRecaps'>, monday: DayKey): WeekRecap | undefined {
  const key = weekStartOf(monday)
  return (data.weekRecaps ?? []).find((r) => r && r.id === key)
}

/** Non-blank lines only: what the deck, the share and the prompt show */
export function recapContent(r: Pick<WeekRecap, 'insights' | 'fails' | 'nextPlan'> | undefined) {
  return {
    insights: (r?.insights ?? []).map((s) => s.trim()).filter(Boolean),
    fails: (r?.fails ?? []).map((f) => ({ what: f.what.trim(), why: f.why.trim() })).filter((f) => f.what || f.why),
    nextPlan: (r?.nextPlan ?? []).filter((p) => p.title.trim()),
  }
}

// ---------- XP ----------

export interface WeekXpEvent {
  day: DayKey
  at: number
  xp: number
  stat: StatId
  shards?: number
  kind: 'goals' | 'recap'
  week: DayKey
}

/** Deterministic from the log: the first goal of a week (in time) and a finished итог (in time) */
export function weekEvents(data: Pick<AppData, 'weekGoals' | 'weekRecaps'>): WeekXpEvent[] {
  const out: WeekXpEvent[] = []
  const first = new Map<DayKey, number>()
  for (const g of data.weekGoals ?? []) {
    if (!g || typeof g.week !== 'string' || !(g.createdAt > 0)) continue
    const day = gameDayOf(new Date(g.createdAt))
    if (day < addDays(g.week, -1) || day > addDays(g.week, 6)) continue
    const cur = first.get(g.week)
    if (cur === undefined || g.createdAt < cur) first.set(g.week, g.createdAt)
  }
  for (const [week, at] of first) out.push({ day: gameDayOf(new Date(at)), at, xp: WEEK_XP.goals, stat: WEEK_XP.goalsStat, kind: 'goals', week })
  for (const r of data.weekRecaps ?? []) {
    if (!r?.doneAt || typeof r.id !== 'string') continue
    const day = gameDayOf(new Date(r.doneAt))
    if (!recapWindow(r.id, day)) continue
    out.push({ day, at: r.doneAt, xp: WEEK_XP.recap, stat: WEEK_XP.recapStat, shards: WEEK_XP.recapShards, kind: 'recap', week: r.id })
  }
  return out.sort((a, b) => a.at - b.at || (a.kind < b.kind ? -1 : 1))
}

// ---------- public (party) ----------

export interface PubGoal {
  t: string
  /** target */
  n?: number
  u?: string
  /** progress */
  p?: number
  /** done */
  d?: 1
}

export interface PubRecap {
  /** Monday of the week */
  key: DayKey
  goals: PubGoal[]
  num?: WeekFigures
  ins: string[]
  fails: { w: string; y: string }[]
  next: { t: string; n?: number; u?: string }[]
  ai?: string
}

export const pubGoal = (g: Pick<WeekGoal, 'title' | 'target' | 'unit' | 'progress' | 'done'>): PubGoal => ({
  t: g.title.slice(0, WEEK_LIMITS.title),
  ...(g.target ? { n: g.target } : {}),
  ...(g.target && g.unit ? { u: g.unit } : {}),
  ...(g.progress ? { p: g.progress } : {}),
  ...(isGoalDone(g) ? { d: 1 as const } : {}),
})

/** This week's goals for the party: without «только мне» */
export function publicWeek(data: Pick<AppData, 'weekGoals'>, today: DayKey): { key: DayKey; goals: PubGoal[] } | undefined {
  const key = weekStartOf(today)
  const goals = goalsOfWeek(data, key, { withPrivate: false }).slice(0, WEEK_LIMITS.pubGoals).map(pubGoal)
  return goals.length ? { key, goals } : undefined
}

/** The latest finished, not hidden итог of the last two weeks; money only with the opt-in */
export function publicRecap(data: Pick<AppData, 'weekGoals' | 'weekRecaps' | 'settings'>, today: DayKey): PubRecap | undefined {
  const from = addDays(weekStartOf(today), -7)
  const r = [...(data.weekRecaps ?? [])].filter((x) => x?.doneAt && !x.private && x.id >= from && x.id <= today).sort((a, b) => (a.id < b.id ? 1 : -1))[0]
  if (!r) return undefined
  const c = recapContent(r)
  let num: WeekFigures | undefined
  if (r.numbers) {
    const { money, ...rest } = r.numbers
    num = moneyShareOn(data) && money !== undefined ? { ...rest, money } : rest
  }
  return {
    key: r.id,
    goals: goalsOfWeek(data, r.id, { withPrivate: false }).slice(0, WEEK_LIMITS.pubGoals).map(pubGoal),
    ...(num ? { num } : {}),
    ins: c.insights,
    fails: c.fails.map((f) => ({ w: f.what, y: f.why })),
    next: c.nextPlan.map((p) => ({ t: p.title, ...(p.target ? { n: p.target } : {}), ...(p.target && p.unit ? { u: p.unit } : {}) })),
    ...(r.aiSummary ? { ai: r.aiSummary } : {}),
  }
}

function safeGoal(raw: unknown): PubGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  const t = str(x.t, WEEK_LIMITS.title)
  if (!t) return null
  const n = num(x.n, WEEK_LIMITS.target)
  const p = num(x.p, WEEK_LIMITS.target)
  const u = n ? str(x.u, WEEK_LIMITS.unit) : ''
  return { t, ...(n ? { n } : {}), ...(u ? { u } : {}), ...(p ? { p } : {}), ...(x.d === 1 || x.d === true ? { d: 1 as const } : {}) }
}

/** A friend's week goals: only the current week counts (older ones are simply stale) */
export function safeWeek(raw: unknown, today: DayKey): PubGoal[] | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.key !== 'string' || r.key !== weekStartOf(today) || !Array.isArray(r.goals)) return null
  const goals = r.goals.slice(0, WEEK_LIMITS.pubGoals).map(safeGoal).filter((g): g is PubGoal => !!g)
  return goals.length ? goals : null
}

/** A friend's итог: validated and cut; older than two weeks → null */
export function safeRecap(raw: unknown, today: DayKey): PubRecap | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.key !== 'string' || !DAY_RE.test(r.key) || r.key < addDays(weekStartOf(today), -7) || r.key > today) return null
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
  const num_ = sanitizeNumbers(r.num)
  const out: PubRecap = {
    key: r.key,
    goals: arr(r.goals, WEEK_LIMITS.pubGoals).map(safeGoal).filter((g): g is PubGoal => !!g),
    ...(num_ ? { num: num_ } : {}),
    ins: arr(r.ins, WEEK_LIMITS.insights).map((s) => str(s, WEEK_LIMITS.insight)).filter(Boolean),
    fails: arr(r.fails, WEEK_LIMITS.fails)
      .map((f) => (f && typeof f === 'object' ? { w: str((f as Record<string, unknown>).w, WEEK_LIMITS.failWhat), y: str((f as Record<string, unknown>).y, WEEK_LIMITS.failWhy) } : null))
      .filter((f): f is { w: string; y: string } => !!f && !!(f.w || f.y)),
    next: arr(r.next, WEEK_LIMITS.plan)
      .map((p) => sanitizeDraft(p && typeof p === 'object' ? { title: (p as Record<string, unknown>).t, target: (p as Record<string, unknown>).n, unit: (p as Record<string, unknown>).u } : null))
      .filter((p): p is PlanDraft => !!p)
      .map((p) => ({ t: p.title, ...(p.target ? { n: p.target } : {}), ...(p.unit ? { u: p.unit } : {}) })),
  }
  const ai = str(r.ai, WEEK_LIMITS.summary)
  if (ai) out.ai = ai
  return out
}

// ---------- the deck as text / as a prompt ----------

/** What one person's итог is made of: the same for own deck, a friend's sheet, the share and the prompt */
export interface RecapView {
  name?: string
  week: DayKey
  goals: PubGoal[]
  num?: WeekFigures
  insights: string[]
  fails: { what: string; why: string }[]
  next: PlanDraft[]
  ai?: string
}

export function viewFromPub(p: PubRecap, name?: string): RecapView {
  return { name, week: p.key, goals: p.goals, num: p.num, insights: p.ins, fails: p.fails.map((f) => ({ what: f.w, why: f.y })), next: p.next.map((x) => ({ title: x.t, target: x.n, unit: x.u })), ai: p.ai }
}

const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','))
export const goalAmount = (n?: number, u?: string) => (n ? `${fmtN(n)}${u ? ` ${u}` : ''}` : '')

export function goalLine(g: PubGoal): string {
  const mark = g.d ? '✅' : g.p ? '◐' : '✗'
  const amount = g.n ? ` — ${fmtN(g.p ?? 0)}/${goalAmount(g.n, g.u)}` : ''
  return `${mark} ${g.t}${amount}`
}

export function numbersLines(n: WeekFigures): string[] {
  const out = [`Дни выполнены на ${n.pct}%${n.perfect ? ` · идеальных ${n.perfect}` : ''}`, `XP за неделю: ${n.xp} · серия честности ${n.streak}`]
  for (const q of n.quests) out.push(`${q.t}: ${q.s ? `${fmtN(q.s)}${q.u ? ` ${q.u}` : ''} · ` : ''}${q.n} из 7 дн`)
  if (n.money !== undefined) out.push(`Заработано: ${Math.round(n.money).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`)
  return out
}

/** Plain text of the deck for the Telegram group: exactly the slides */
export function recapText(v: RecapView): string {
  const t = v.goals.length ? goalsTally(v.goals.map((g) => ({ done: !!g.d, target: g.n, progress: g.p }))) : undefined
  const lines: string[] = [`❄ Итог недели${v.name ? ` · ${v.name}` : ''} · ${weekLabel(v.week)}`, '']
  if (v.ai) lines.push(`Вывод: ${v.ai}`, '')
  lines.push(`🎯 Цели: ${t ? `${t.done} из ${t.total}` : 'не ставил'}`)
  for (const g of v.goals) lines.push(goalLine(g))
  if (v.num) lines.push('', '📊 Цифры', ...numbersLines(v.num))
  if (v.insights.length) lines.push('', '💡 Лучшие инсайты', ...v.insights.map((s, i) => `${i + 1}. ${s}`))
  if (v.fails.length) lines.push('', '🧊 Провал и почему', ...v.fails.map((f) => `— ${f.what || 'Провал'}${f.why ? ` → ${f.why}` : ''}`))
  if (v.next.length) lines.push('', '➡ План на следующую неделю', ...v.next.map((p) => `• ${p.title}${p.target ? ` — ${goalAmount(p.target, p.unit)}` : ''}`))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const FORMAT = ['ВЫВОД: <2–3 предложения: главное о неделе>', 'ЦЕЛЬ: <действие> | <число> <единица>', 'ЦЕЛЬ: <действие без числа>']

/** A ready Russian prompt: own week or the whole party. Only what the decks show */
export function recapPrompt(views: RecapView[], o: { party?: string } = {}): string {
  const party = !!o.party
  const blocks = views.map((v) => {
    const head = party ? `### ${v.name ?? 'Участник'}` : `### Моя неделя · ${weekLabel(v.week)}`
    return [head, recapText({ ...v, name: undefined }).split('\n').slice(1).join('\n').trim()].join('\n')
  })
  const intro = party
    ? `Ты — тренер нашей пати «${o.party}» в Winter Arc (зимний челлендж привычек и дел). Ниже итоги недели участников: цели (план/факт), цифры, инсайты, провалы и черновики планов.`
    : 'Ты — мой тренер в Winter Arc (зимний челлендж привычек и дел). Ниже итог моей недели: цели (план/факт), цифры, инсайты, провалы и черновик плана.'
  const ask = party
    ? [
        'Сделай короткий общий вывод недели пати и предложи каждому 2–4 конкретные цели на следующую неделю.',
        'Цели — действия, а не метрики результата: «20 постов», «100 сообщений лидам», а не «+1000 подписчиков». Учитывай провалы и причины, не завышай.',
        'Ответь строго в формате, без вступлений. Перед каждой целью — ник в квадратных скобках:',
        'ВЫВОД: <2–3 предложения>',
        'ЦЕЛЬ: [Ник] <действие> | <число> <единица>',
        'ЦЕЛЬ: [Ник] <действие без числа>',
      ]
    : [
        'Сделай короткий вывод недели и предложи 3–5 конкретных целей на следующую неделю.',
        'Цели — действия, а не метрики результата: «20 постов», «100 сообщений лидам», а не «+1000 подписчиков». Учитывай провалы и причины, не завышай: лучше реалистично, чем красиво.',
        'Ответь строго в формате, без вступлений и пояснений:',
        ...FORMAT,
      ]
  return [intro, '', ...blocks.flatMap((b) => [b, '']), ...ask].join('\n').trim()
}

// ---------- the AI answer ----------

export interface ParsedGoal extends PlanDraft {
  /** «[Ник]» before a goal in a party answer */
  who?: string
}

export interface ParsedAnswer {
  summary?: string
  goals: ParsedGoal[]
}

const SUMMARY_RE = /^(?:вывод(?:\s+недели)?|итог(?:\s+недели)?|резюме|summary|conclusion|takeaway)\s*[:：—–-]\s*(.*)$/i
const GOAL_RE = /^(?:цель|goal|задача)(?:\s*\d+)?(?:\s*\(([^)]{1,40})\))?\s*[:：—–-]\s*(.+)$/i
const GOALS_HEAD_RE = /^(?:цели(?:\s+на\s+(?:следующую|новую)\s+неделю)?|goals?(?:\s+for\s+next\s+week)?|план(?:\s+на\s+(?:следующую|новую)\s+неделю)?|next\s+week)\s*[:：]?\s*$/i
const SUMMARY_HEAD_RE = /^(?:вывод(?:\s+недели)?|итог(?:\s+недели)?|summary|conclusion)\s*[:：]?\s*$/i

/** Bullets, numbering, markdown and quotes off one line */
function bare(line: string): string {
  return line
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:#{1,6}\s*)?/, '')
    .replace(/^\s*(?:[-*•·—–>]+|\d{1,2}[.)]|\[[ x✓]\])\s*/i, '')
    .replace(/^\s*(?:[-*•·—–]+|\d{1,2}[.)])\s*/, '')
    .trim()
}

function goalFromText(text: string, who?: string): ParsedGoal | null {
  let t = text.trim().replace(/^[«"“]|[»"”]$/g, '').trim()
  let name = who?.trim()
  const tag = t.match(/^\[([^\]]{1,40})\]\s*[:—–-]?\s*(.+)$/)
  if (tag) {
    name = tag[1].trim()
    t = tag[2].trim()
  }
  t = t.replace(/[.;]+$/, '').trim()
  if (!t) return null
  let g: PlanDraft
  if (t.includes('|')) g = parseGoalText(t)
  else {
    // «20 постов в Твиттер» stays a title; «Посты в Твиттер — 20 постов» gets the number out
    const m = t.match(/^(.+?)\s+[—–-]\s+(\d[\d\s]*(?:[.,]\d+)?)\s*([\p{L} ]{0,16})$/u)
    g = m ? parseGoalText(`${m[1]} | ${m[2]} ${m[3]}`) : parseGoalText(t)
  }
  if (!g.title) return null
  return name ? { ...g, who: name } : g
}

/**
 * Reads «ВЫВОД: …» and «ЦЕЛЬ: … | 20 постов» lines out of whatever the AI answered: bullets,
 * numbering, markdown, English labels, a «Цели:» header with a plain list below, a multi-line вывод.
 */
export function parseAiAnswer(text: string): ParsedAnswer {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
  let summary: string[] = []
  const goals: ParsedGoal[] = []
  let mode: 'none' | 'summary' | 'goals' = 'none'
  for (const raw of lines) {
    const line = bare(raw)
    if (!line) {
      if (mode === 'summary' && summary.length) mode = 'none'
      continue
    }
    let m = line.match(SUMMARY_RE)
    if (m) {
      summary = m[1] ? [m[1].trim()] : []
      mode = 'summary'
      continue
    }
    if (SUMMARY_HEAD_RE.test(line)) {
      summary = []
      mode = 'summary'
      continue
    }
    m = line.match(GOAL_RE)
    if (m) {
      const g = goalFromText(m[2], m[1])
      if (g) goals.push(g)
      mode = 'goals'
      continue
    }
    if (GOALS_HEAD_RE.test(line)) {
      mode = 'goals'
      continue
    }
    if (mode === 'summary') summary.push(line)
    else if (mode === 'goals' && /^\s*(?:[-*•·—–]|\d{1,2}[.)]|\[)/.test(raw)) {
      const g = goalFromText(line)
      if (g) goals.push(g)
    } else if (mode === 'goals') mode = 'none'
  }
  const seen = new Set<string>()
  const unique = goals.filter((g) => {
    const k = `${g.who ?? ''}|${g.title.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const s = summary.join(' ').replace(/\s+/g, ' ').trim().slice(0, WEEK_LIMITS.summary)
  return { ...(s ? { summary: s } : {}), goals: unique.slice(0, WEEK_LIMITS.plan * 3) }
}

/** Goals of a party answer meant for `nick` (or for nobody in particular) */
export function goalsFor(parsed: ParsedAnswer, nick?: string): PlanDraft[] {
  const me = nick?.trim().toLowerCase()
  return parsed.goals
    .filter((g) => !g.who || (me && g.who.toLowerCase() === me))
    .slice(0, WEEK_LIMITS.plan)
    .map(({ who: _w, ...g }) => (void _w, g))
}
