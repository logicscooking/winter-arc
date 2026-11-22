/**
 * v0.4 «Навыки и прогрессия»: pure rules for skills, nodes, practices, goals, flow, «Планка» and season themes.
 * Everything here derives from the stored log, so replay (replay.ts) stays deterministic.
 */
import { hash32 } from './quests'
import { ARC_START, CHAPTERS, addDays, chapterOf, diffDays, gameDayOf, weekday } from './time'
import type {
  AppData,
  ChapterId,
  ChestOpen,
  ChestType,
  DayKey,
  FlowSession,
  Goal,
  GoalType,
  Practice,
  Rarity,
  Reward,
  Skill,
  SkillNode,
  StatId,
  Trait,
  ValueKind,
} from './types'

// ---------- limits and prices ----------

export const MAX_ACTIVE_SKILLS = 3
export const MAX_TRAITS = 5
export const MAX_NODES = 8
export const PRACTICE_LIMIT = 3
/** practice XP: full with a feedback line, half without */
export const PRACTICE_XP = { full: 14, half: 7 } as const
export const THEME_MULT = 1.5
export const EXTRA_XP = 10

/**
 * Goal prices. RPGreal ratio 5 / 50 / 200 / 1000 (repeat / short / mid / long) scaled to our economy,
 * where a main quest is 20 XP: ×0.2, repeat raised to 2 so a tick is still felt.
 */
export const GOAL_XP: Record<GoalType, number> = { repeat: 2, short: 10, mid: 40, long: 200 }
export const GOAL_SHARDS: Record<GoalType, number> = { repeat: 0, short: 1, mid: 3, long: 15 }
/** a repeat goal fulfilled for the week */
export const REPEAT_WEEK = { xp: 5, shards: 1 } as const

export const GOAL_META: Record<GoalType, { name: string; time: string; hint: string }> = {
  short: { name: 'Краткая', time: 'до 15 мин', hint: 'Минимальный старт. Начал — самое трудное позади' },
  mid: { name: 'Средняя', time: '15 мин – 24 ч', hint: 'Шаг на день или неделю' },
  long: { name: 'Долгая', time: '1 мес – 1 год', hint: 'Направление. Можно шкалу и ожидаемый срок' },
  repeat: { name: 'Повторяющаяся', time: 'N раз в неделю', hint: 'Держит достигнутый уровень' },
}
export const GOAL_BALANCE = { short: 0.6, mid: 0.3, long: 0.1 } as const
export const SHORT_SPLIT_DAYS = 3
export const SHORT_RAISE_RUN = 7
export const MAX_MIDS = 3

export const FLOW = { maxMin: 90, breakMin: 10, perDay: 3, lastStartHour: 22, mult: 2, quickMin: 15 } as const

// ---------- node stages ----------

export const STAGE_AT = [0, 1, 3, 7, 15] as const
export const STAGE_NAMES = ['не начат', 'знакомство', 'практика', 'уверенно', 'мастер'] as const

export function stageForCount(n: number): number {
  let s = 0
  for (let i = 0; i < STAGE_AT.length; i++) if (n >= STAGE_AT[i]) s = i
  return s
}

export const hasFeedback = (p: Pick<Practice, 'note'>) => (p.note?.trim().length ?? 0) >= 3

const byAt = <T extends { at: number; id: string }>(a: T, b: T) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export interface NodeProgress {
  count: number
  feedback: number
  stage: number
  /** stage the count alone would give */
  potential: number
  /** count is enough for the next stage, feedback is not */
  needsFeedback: boolean
  /** practices to the next stage (0 at «мастер») */
  toNext: number
  /** last practices in a row marked «так же» / «хуже» */
  flatRun: number
  lastAt?: number
}

/**
 * Stage grows only while at least half of the practices carry feedback.
 * Walks practices in time order, so a stage once reached is kept.
 */
export function nodeProgress(practices: Practice[]): NodeProgress {
  const list = [...practices].sort(byAt)
  let fb = 0
  let stage = 0
  list.forEach((p, i) => {
    if (hasFeedback(p)) fb++
    const n = i + 1
    if (fb * 2 >= n) stage = Math.max(stage, stageForCount(n))
  })
  const count = list.length
  const potential = stageForCount(count)
  let flatRun = 0
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i].trend
    if (t === 'same' || t === 'worse') flatRun++
    else break
  }
  const next = STAGE_AT[stage + 1]
  return {
    count,
    feedback: fb,
    stage,
    potential,
    needsFeedback: potential > stage,
    toNext: next === undefined ? 0 : Math.max(0, next - count),
    flatRun,
    lastAt: list[list.length - 1]?.at,
  }
}

export const PIVOT_RUN = 3
/** «Привычка говорит „делай как всегда“…»: 3 flat practices in a row and no newer «что попробую иначе» */
export function needsPivot(node: SkillNode, prog: NodeProgress): boolean {
  return prog.flatRun >= PIVOT_RUN && !(node.pivotAt && prog.lastAt && node.pivotAt >= prog.lastAt)
}

// ---------- skill level and rank ----------

/** skill points = sum of node stages → level 1..10 */
export const LEVEL_AT = [0, 2, 5, 9, 14, 20, 27, 35, 44, 54] as const

export function skillLevelOf(points: number): number {
  let l = 1
  for (let i = 0; i < LEVEL_AT.length; i++) if (points >= LEVEL_AT[i]) l = i + 1
  return l
}

export const RANKS = ['D', 'C', 'B', 'A', 'S'] as const
export type Rank = (typeof RANKS)[number]
export const RANK_COLOR: Record<Rank, string> = { D: 'var(--mist)', C: 'var(--frost)', B: 'var(--pine)', A: 'var(--st-mind)', S: 'var(--gold-mark)' }

/** level 1–2 D, 3–4 C, 5–6 B, 7–8 A, 9–10 S */
export function rankIndexOfLevel(level: number): number {
  return Math.min(4, Math.max(0, Math.floor((level - 1) / 2)))
}

export function rankOf(level: number, drops = 0): Rank {
  return RANKS[Math.max(0, rankIndexOfLevel(level) - drops)]
}

// ---------- rank decay: strikes ----------

export const STRIKES = { max: 3, cleanDays: 14 } as const

export interface StrikeState {
  strikes: number
  /** rank steps lost */
  drops: number
  /** Mondays of weeks that gave a strike */
  missedWeeks: DayKey[]
}

export const weekStartOf = (d: DayKey) => addDays(d, -weekday(d))
const dayOfMs = (ms: number) => gameDayOf(new Date(ms))

/**
 * A finished week where some repeat goal of the skill got fewer ticks than planned → strike.
 * 3 strikes → the rank drops one step. 14 clean days remove a strike; with no strikes left they
 * return a lost step. The week a goal was set up never counts; warm-up weeks and weeks with a
 * frozen day are neutral.
 */
export function skillStrikes(data: Pick<AppData, 'goals'>, skillId: string, today: DayKey, frozen: Set<DayKey> = new Set()): StrikeState {
  const repeats = (data.goals ?? []).filter((g) => g.skillId === skillId && g.type === 'repeat' && !g.archived && (g.perWeek ?? 0) > 0)
  const st: StrikeState = { strikes: 0, drops: 0, missedWeeks: [] }
  if (!repeats.length) return st
  const firstWeek = (g: Goal) => addDays(weekStartOf(g.since ?? dayOfMs(g.createdAt)), 7)
  const starts = repeats.map(firstWeek).sort()
  let clean = 0
  for (let ws = starts[0]; addDays(ws, 6) < today; ws = addDays(ws, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    if (days[0] < ARC_START || days.some((d) => frozen.has(d))) continue
    const live = repeats.filter((g) => firstWeek(g) <= ws)
    if (!live.length) continue
    const missed = live.some((g) => new Set((g.checks ?? []).filter((c) => c.day >= days[0] && c.day <= days[6]).map((c) => c.day)).size < (g.perWeek ?? 0))
    if (missed) {
      st.strikes++
      st.missedWeeks.push(ws)
      clean = 0
      if (st.strikes >= STRIKES.max) {
        st.drops++
        st.strikes = 0
      }
    } else {
      clean += 7
      if (clean >= STRIKES.cleanDays) {
        clean = 0
        if (st.strikes > 0) st.strikes--
        else if (st.drops > 0) st.drops--
      }
    }
  }
  return st
}

// ---------- skill view ----------

export interface TraitView {
  trait: Trait
  level: number
  nodes: { node: SkillNode; prog: NodeProgress }[]
}

export interface SkillView {
  skill: Skill
  traits: TraitView[]
  points: number
  level: number
  rank: Rank
  baseRank: Rank
  strikes: StrikeState
  practices: number
}

export function skillPoints(nodes: SkillNode[], practices: Practice[]): number {
  return nodes.reduce((s, n) => s + nodeProgress(practices.filter((p) => p.nodeId === n.id)).stage, 0)
}

const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || (a.id < b.id ? -1 : 1)

export function traitsOf(data: Pick<AppData, 'traits'>, skillId: string): Trait[] {
  return (data.traits ?? []).filter((t) => t.skillId === skillId).sort(byOrder)
}

export function nodesOf(data: Pick<AppData, 'nodes'>, traitId: string): SkillNode[] {
  return (data.nodes ?? []).filter((n) => n.traitId === traitId).sort(byOrder)
}

export function skillView(data: AppData, skillId: string, today: DayKey, frozen?: Set<DayKey>): SkillView | null {
  const skill = (data.skills ?? []).find((s) => s.id === skillId)
  if (!skill) return null
  const practices = (data.practices ?? []).filter((p) => p.skillId === skillId)
  let points = 0
  const traits = traitsOf(data, skillId).map((trait) => {
    const nodes = nodesOf(data, trait.id).map((node) => ({ node, prog: nodeProgress(practices.filter((p) => p.nodeId === node.id)) }))
    const sum = nodes.reduce((s, n) => s + n.prog.stage, 0)
    points += sum
    return { trait, nodes, level: nodes.length ? Math.round((sum / nodes.length) * 10) / 10 : 0 }
  })
  const level = skillLevelOf(points)
  const strikes = skillStrikes(data, skillId, today, frozen)
  return { skill, traits, points, level, rank: rankOf(level, strikes.drops), baseRank: rankOf(level), strikes, practices: practices.length }
}

export function activeSkills(data: Pick<AppData, 'skills'>): Skill[] {
  return (data.skills ?? []).filter((s) => s.status === 'active').sort(byOrder)
}

export function practicesToday(data: Pick<AppData, 'practices'>, nodeId: string, day: DayKey): number {
  return (data.practices ?? []).filter((p) => p.nodeId === nodeId && p.day === day).length
}

// ---------- impact ----------

export interface Impact {
  nodeTitle: string
  skillTitle: string
  stage: number
  stageUp: boolean
  level: number
  levelUp: boolean
  /** practices with feedback on this node to the next skill level, null if far or capped */
  toLevel: number | null
  text: string
}

/** What one practice changed, measured on the store right after it was added */
export function practiceImpact(data: AppData, practiceId: string): Impact | null {
  const p = (data.practices ?? []).find((x) => x.id === practiceId)
  const node = p && (data.nodes ?? []).find((n) => n.id === p.nodeId)
  const skill = p && (data.skills ?? []).find((s) => s.id === p.skillId)
  if (!p || !node || !skill) return null
  const nodes = (data.nodes ?? []).filter((n) => n.skillId === skill.id)
  const all = (data.practices ?? []).filter((x) => x.skillId === skill.id)
  const before = all.filter((x) => x.id !== p.id)
  const stageOf = (list: Practice[]) => nodeProgress(list.filter((x) => x.nodeId === node.id)).stage
  const stage = stageOf(all)
  const stageUp = stage > stageOf(before)
  const level = skillLevelOf(skillPoints(nodes, all))
  const levelUp = level > skillLevelOf(skillPoints(nodes, before))
  let toLevel: number | null = null
  if (level < LEVEL_AT.length) {
    const sim = [...all]
    for (let k = 1; k <= 30; k++) {
      sim.push({ id: `~sim${k}`, skillId: skill.id, nodeId: node.id, day: p.day, at: p.at + k, note: 'sim' })
      if (skillLevelOf(skillPoints(nodes, sim)) > level) {
        toLevel = k
        break
      }
    }
  }
  const tail = levelUp
    ? `новый уровень ${level}!`
    : toLevel
      ? `ещё ${toLevel} ${toLevel === 1 ? 'практика' : toLevel < 5 ? 'практики' : 'практик'} до ур. ${level + 1}`
      : `ур. ${level}`
  const text = `+1 к «${node.title}» → ${skill.title} ур. ${level} (${tail})`
  return { nodeTitle: node.title, skillTitle: skill.title, stage, stageUp, level, levelUp, toLevel, text }
}

// ---------- «Кайф» / «Боль» check ----------

export const VALUE_MIN = 20
export const VALUE_MAX = 200

const CLICHES = [
  'для здоровья',
  'для себя',
  'для свободы',
  'для развития',
  'чтобы было',
  'полезно',
  'надо',
  'нужно',
  'саморазвитие',
  'стать лучше',
  'быть лучше',
  'лучшей версией',
  'для успеха',
  'успешным',
  'для мотивации',
  'для души',
  'важно',
  'просто хочу',
  'всегда хотел',
]
const STOP = new Set(
  'я и в во на для чтобы что это мне меня мой моя мои быть был буду будет с со к ко по не ни как а но же бы то всё все очень просто хочу хочется стать лучше свой своя свои свою себя себе жизнь жизни у о об от из за до так уже ещё еще или ли тоже там тут этот эта эти том тем чем когда где ну да вот'.split(' '),
)

export type ValueCheck = { ok: true } | { ok: false; reason: string; hint: string }

export const VALUE_HINT: Record<ValueKind, string> = {
  joy: 'Что почувствуешь, когда навык есть? Где ты, что видишь?',
  pain: 'Какая боль уже есть? Когда она приходит и как ощущается?',
}

/** Free, local check: too short, too long, or only clichés without a concrete feeling or scene. */
export function checkValue(text: string, kind: ValueKind = 'joy'): ValueCheck {
  const t = text.trim().replace(/\s+/g, ' ')
  const hint = VALUE_HINT[kind]
  if (t.length < VALUE_MIN) return { ok: false, reason: `Коротко: нужно хотя бы ${VALUE_MIN} символов.`, hint }
  if (t.length > VALUE_MAX) return { ok: false, reason: `Длинно: уложись в ${VALUE_MAX} символов.`, hint: 'Одна сцена, одно ощущение.' }
  let rest = t.toLowerCase().replace(/ё/g, 'е')
  for (const c of CLICHES) rest = rest.split(c.replace(/ё/g, 'е')).join(' ')
  const words = new Set(
    rest
      .split(/[^a-zа-я0-9]+/i)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  )
  if (words.size < 3) return { ok: false, reason: 'Пока это общие слова. Такая ценность выдуманная и сдувается через неделю.', hint }
  return { ok: true }
}

// ---------- goals ----------

const W = '(?<![а-яёa-z])'
const E = '(?![а-яёa-z])'
const METRIC = new RegExp(`(₽|\\$|€|${W}руб|${W}долл|${W}(кг|км|тыс|млн)${E}|\\d\\s?к${E}|подписчик|заработ|похуд|сбросить|доход|выручк|\\d[\\d\\s]*000${E})`, 'iu')

/** «Похудеть до 85 кг» — шкала, «3 дня считать калории» — цель */
export function isMetric(title: string): boolean {
  return METRIC.test(title)
}

export const METRIC_EXAMPLES = ['50 первых сообщений', '3 пробежки с новым ритмом дыхания', '3 дня считать калории']

export function goalsOf(data: Pick<AppData, 'goals'>, skillId: string, withArchived = false): Goal[] {
  return (data.goals ?? []).filter((g) => g.skillId === skillId && (withArchived || !g.archived)).sort(byOrder)
}

export const childGoals = (goals: Goal[], parentId: string) => goals.filter((g) => g.parentId === parentId && !g.archived)

/** «как в Марио»: a long goal has 1–3 mids, every mid at least one short */
export function goalIssues(goals: Goal[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const g of goals) {
    if (g.archived) continue
    if (g.type === 'long' && !g.doneAt) {
      const mids = childGoals(goals, g.id).filter((c) => c.type === 'mid')
      if (mids.length === 0) out[g.id] = 'Добавь 1–3 средних шага'
      else if (mids.length > MAX_MIDS) out[g.id] = `Больше ${MAX_MIDS} средних — фокус расплывается`
    }
    if (g.type === 'mid' && !g.doneAt && !childGoals(goals, g.id).some((c) => c.type === 'short')) out[g.id] = 'Нужна краткая: минимальный старт'
  }
  return out
}

export function canAddGoal(goals: Goal[], parent: Goal | undefined, type: GoalType): boolean {
  if (!parent) return true
  if (parent.type === 'long') return type === 'mid' && childGoals(goals, parent.id).filter((c) => c.type === 'mid').length < MAX_MIDS
  if (parent.type === 'mid') return type === 'short'
  return false
}

export const PARENT_TYPE: Partial<Record<GoalType, GoalType>> = { short: 'mid', mid: 'long' }

export const checkedOn = (g: Goal, day: DayKey) => !!g.checks?.some((c) => c.day === day)

export interface ShortRuns {
  /** days in a row closed, up to today (or yesterday if today is still open) */
  doneRun: number
  /** days in a row missed, ending yesterday; 0 if done today */
  missRun: number
  doneToday: boolean
}

export function shortRuns(g: Goal, today: DayKey): ShortRuns {
  const start = g.since ?? dayOfMs(g.createdAt)
  const days = new Set((g.checks ?? []).map((c) => c.day))
  const doneToday = days.has(today)
  let doneRun = 0
  for (let d = doneToday ? today : addDays(today, -1); d >= start && days.has(d); d = addDays(d, -1)) doneRun++
  let missRun = 0
  if (!doneToday) for (let d = addDays(today, -1); d >= start && !days.has(d); d = addDays(d, -1)) missRun++
  return { doneRun, missRun, doneToday }
}

/** «Слишком крупно. Разбить?» */
export const needsSplit = (g: Goal, today: DayKey) => g.type === 'short' && !g.archived && shortRuns(g, today).missRun >= SHORT_SPLIT_DAYS
/** «Поднять?» — the start has become a habit */
export const canRaise = (g: Goal, today: DayKey) => g.type === 'short' && !g.archived && shortRuns(g, today).doneRun >= SHORT_RAISE_RUN

export function weekTicks(g: Goal, today: DayKey): number {
  const ws = weekStartOf(today)
  return new Set((g.checks ?? []).filter((c) => c.day >= ws && c.day <= addDays(ws, 6)).map((c) => c.day)).size
}

/** Share of open short / mid / long goals against 60 / 30 / 10 */
export function goalBalance(goals: Goal[]): { short: number; mid: number; long: number; total: number; hint?: string } {
  const open = goals.filter((g) => !g.archived && !g.doneAt && g.type !== 'repeat')
  const n = (t: GoalType) => open.filter((g) => g.type === t).length
  const total = open.length
  const r = { short: n('short'), mid: n('mid'), long: n('long'), total }
  if (total < 3) return r
  const s = r.short / total
  const l = r.long / total
  let hint: string | undefined
  if (s < 0.45) hint = 'Мало кратких. Держи примерно 60% кратких, 30% средних, 10% долгих.'
  else if (l > 0.25) hint = 'Много долгих: направление есть, шагов мало. Разбей на средние и краткие.'
  return { ...r, hint }
}

export interface Eta {
  current: number
  /** units per day */
  pace: number
  base: number
  good: number
  ideal: number
}

/** Expected time for a long goal with a scale: base pace, good ×1.5, ideal ×2. No AI, a formula. */
export function expectedTime(g: Goal): Eta | { reason: string } {
  const sc = g.scale
  if (!sc) return { reason: 'Нет шкалы' }
  const pts = [...sc.points].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at)).slice(-5)
  const last = pts[pts.length - 1]
  const current = last?.value ?? sc.from
  const remaining = sc.to - current
  if (remaining === 0 || Math.sign(remaining) !== Math.sign(sc.to - sc.from)) return { reason: 'Шкала пройдена' }
  if (pts.length < 2) return { reason: 'Нужно хотя бы 2 замера в разные дни' }
  const span = diffDays(pts[0].day, last.day)
  if (span < 1) return { reason: 'Нужно хотя бы 2 замера в разные дни' }
  const pace = (last.value - pts[0].value) / span
  if (pace === 0 || Math.sign(pace) !== Math.sign(remaining)) return { reason: 'Темп пока не туда. Это не провал: что мешает?' }
  const days = remaining / pace
  return { current, pace, base: Math.ceil(days), good: Math.ceil(days / 1.5), ideal: Math.ceil(days / 2) }
}

// ---------- flow ----------

export interface FlowWindow {
  id: string
  day: DayKey
  from: number
  to: number
  skillId?: string
}

const flowCap = (f: FlowSession) => Math.min(f.minutes ?? FLOW.maxMin, FLOW.maxMin) * 60_000
const lateHour = (ms: number) => {
  const h = new Date(ms).getHours()
  return h >= FLOW.lastStartHour || h < 4
}

/** Valid flow windows: at most 3 a day, none started after 22:00, a 10-min break after a full 90. */
export function flowWindows(flows: FlowSession[] | undefined): FlowWindow[] {
  const out: FlowWindow[] = []
  const byDay = new Map<DayKey, FlowSession[]>()
  for (const f of flows ?? []) {
    if (!Number.isFinite(f.startedAt)) continue
    const l = byDay.get(f.day)
    if (l) l.push(f)
    else byDay.set(f.day, [f])
  }
  for (const [day, list] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1))
    let n = 0
    let prev: FlowWindow | undefined
    for (const f of list) {
      if (n >= FLOW.perDay || lateHour(f.startedAt)) continue
      if (prev && f.startedAt < prev.to) continue
      if (prev && prev.to - prev.from >= FLOW.maxMin * 60_000 && f.startedAt < prev.to + FLOW.breakMin * 60_000) continue
      const to = Math.min(f.endedAt ?? Infinity, f.startedAt + flowCap(f))
      if (to <= f.startedAt) continue
      const w = { id: f.id, day, from: f.startedAt, to, skillId: f.skillId }
      out.push(w)
      prev = w
      n++
    }
  }
  return out
}

export function flowAt(windows: FlowWindow[], t: number | undefined): FlowWindow | undefined {
  if (t === undefined) return undefined
  return windows.find((w) => t >= w.from && t <= w.to)
}

/** The running flow, if any */
export function liveFlow(data: Pick<AppData, 'flows'>, now: Date): FlowSession | undefined {
  const t = now.getTime()
  // no lower bound: a clock a few seconds stale must still see a flow that was just started
  return (data.flows ?? []).find((f) => !f.endedAt && t >= f.startedAt - 60_000 && t < f.startedAt + flowCap(f))
}

export type FlowBlock = { ok: true } | { ok: false; reason: string }

export function canStartFlow(data: Pick<AppData, 'flows'>, now: Date): FlowBlock {
  const t = now.getTime()
  if (lateHour(t)) return { ok: false, reason: 'После 22:00 поток не стартует: он ломает сон, а сон — главный квест арки.' }
  if (liveFlow(data, now)) return { ok: false, reason: 'Поток уже идёт.' }
  const day = gameDayOf(now)
  const today = flowWindows(data.flows).filter((w) => w.day === day)
  if (today.length >= FLOW.perDay) return { ok: false, reason: `Потолок: ${FLOW.perDay} потока в день. Жёстко, но с умом.` }
  const last = today[today.length - 1]
  if (last && t < last.to) return { ok: false, reason: 'Поток уже идёт.' }
  if (last && last.to - last.from >= FLOW.maxMin * 60_000 && t < last.to + FLOW.breakMin * 60_000) {
    const m = Math.ceil((last.to + FLOW.breakMin * 60_000 - t) / 60_000)
    return { ok: false, reason: `Перерыв 10 мин после 90 минут. Ещё ${m} мин.` }
  }
  return { ok: true }
}

export const flowEnd = (f: FlowSession) => Math.min(f.endedAt ?? Infinity, f.startedAt + flowCap(f))

// ---------- season theme ----------

export const CHAPTER_BOSS: Record<ChapterId, string> = { 0: 'Хаос', 1: 'Зомби', 2: 'Рилс-демон', 3: 'Потом' }

export function themeOf(data: Pick<AppData, 'themes'>, chapter: ChapterId): string | undefined {
  return (data.themes ?? []).find((t) => t.chapter === chapter)?.skillId
}

/** «Завязка перед развязкой»: 3 days before a chapter ends, show the next boss and ask for the next theme */
export function setupDue(today: DayKey): { next: ChapterId; boss: string; daysLeft: number } | null {
  const ch = chapterOf(today)
  if (ch >= 3 || today < CHAPTERS[0].start) return null
  const left = diffDays(today, CHAPTERS[ch].end)
  if (left < 0 || left > 3) return null
  const next = (ch + 1) as ChapterId
  return { next, boss: CHAPTER_BOSS[next], daysLeft: left }
}

// ---------- XP events for replay ----------

export interface SkillEvent {
  day: DayKey
  at: number
  xp: number
  stat: StatId
  shards?: number
  skillId: string
  flowId?: string
  kind: 'practice' | 'goal' | 'week' | 'extra'
}

/** Every XP the skill layer gives, in a stable order. `flowXp` is the flow multiplier hook. */
export function skillEvents(data: AppData, windows: FlowWindow[]): SkillEvent[] {
  const skills = new Map((data.skills ?? []).map((s) => [s.id, s]))
  const out: SkillEvent[] = []
  // practices: first 3 per node a day count
  const perNodeDay = new Map<string, number>()
  for (const p of [...(data.practices ?? [])].sort(byAt)) {
    const sk = skills.get(p.skillId)
    if (!sk) continue
    const k = `${p.nodeId}|${p.day}`
    const n = (perNodeDay.get(k) ?? 0) + 1
    perNodeDay.set(k, n)
    if (n > PRACTICE_LIMIT) continue
    const flow = flowAt(windows, p.at)
    const theme = themeOf(data, chapterOf(p.day)) === sk.id
    const xp = Math.round((hasFeedback(p) ? PRACTICE_XP.full : PRACTICE_XP.half) * (flow ? FLOW.mult : 1) * (theme ? THEME_MULT : 1))
    out.push({ day: p.day, at: p.at, xp, stat: sk.stat, skillId: sk.id, flowId: flow?.id, kind: 'practice' })
  }
  // goals
  for (const g of [...(data.goals ?? [])].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))) {
    const sk = skills.get(g.skillId)
    if (!sk) continue
    if (g.type === 'short' || g.type === 'repeat') {
      const seen = new Set<DayKey>()
      const perWeek = new Map<DayKey, number>()
      for (const c of [...(g.checks ?? [])].sort((a, b) => a.at - b.at)) {
        if (seen.has(c.day)) continue
        seen.add(c.day)
        const flow = g.type === 'short' ? flowAt(windows, c.at) : undefined
        out.push({ day: c.day, at: c.at, xp: GOAL_XP[g.type] * (flow ? FLOW.mult : 1), shards: GOAL_SHARDS[g.type] || undefined, stat: sk.stat, skillId: sk.id, flowId: flow?.id, kind: 'goal' })
        if (g.type === 'repeat') {
          const ws = weekStartOf(c.day)
          const n = (perWeek.get(ws) ?? 0) + 1
          perWeek.set(ws, n)
          if (n === g.perWeek) out.push({ day: c.day, at: c.at, xp: REPEAT_WEEK.xp, shards: REPEAT_WEEK.shards, stat: sk.stat, skillId: sk.id, kind: 'week' })
        }
      }
    } else if (g.doneAt && g.doneDay) {
      const flow = g.type === 'mid' ? flowAt(windows, g.doneAt) : undefined
      out.push({ day: g.doneDay, at: g.doneAt, xp: GOAL_XP[g.type] * (flow ? FLOW.mult : 1), shards: GOAL_SHARDS[g.type], stat: sk.stat, skillId: sk.id, flowId: flow?.id, kind: 'goal' })
    }
  }
  // «Сделал больше плана»: once a day per skill
  const extraSeen = new Set<string>()
  for (const e of [...(data.extras ?? [])].sort(byAt)) {
    const sk = skills.get(e.skillId)
    const k = `${e.skillId}|${e.day}`
    if (!sk || extraSeen.has(k)) continue
    extraSeen.add(k)
    out.push({ day: e.day, at: e.at, xp: EXTRA_XP, stat: sk.stat, skillId: sk.id, kind: 'extra' })
  }
  return out
}

export const extraUsed = (data: Pick<AppData, 'extras'>, skillId: string, day: DayKey) => (data.extras ?? []).some((e) => e.skillId === skillId && e.day === day)

// ---------- «Планка» ----------

export interface BarLadder {
  unit?: string
  steps: { name: string; norm: string; value?: number }[]
}

export const BAR_LADDERS: Record<string, BarLadder> = {
  reading: {
    unit: 'стр',
    steps: [
      { name: 'База', norm: '10 стр', value: 10 },
      { name: 'Ступень 1', norm: '20 стр', value: 20 },
      { name: 'Ступень 2', norm: '25 стр', value: 25 },
      { name: 'Ступень 3', norm: '30 стр', value: 30 },
      { name: 'Ступень 4', norm: '40 стр', value: 40 },
    ],
  },
  workout: {
    steps: [
      { name: 'Ступень 1', norm: '20 мин: 3×8 отжиманий, 3×15 приседаний, планка 30 с' },
      { name: 'Ступень 2', norm: '3×12 отжиманий, 3×20 приседаний, планка 45 с' },
      { name: 'Ступень 3', norm: '4×12 отжиманий, 3×10 выпадов на ногу, планка 60 с, 3 подтягивания' },
      { name: 'Ступень 4', norm: 'Отжимания узким хватом 4×10, болгарские выпады 3×8, 3×5 подтягиваний' },
      { name: 'Ступень 5', norm: 'Отжимания с ногами на стуле 4×12, пистолет с опорой 3×5, 4×6 подтягиваний' },
      { name: 'Ступень 6', norm: 'Алмазные 4×15, пистолет 3×5, 5×8 подтягиваний, планка 2 мин' },
    ],
  },
}

export const BAR_STEP_BONUS = 0.1
export const BAR_UP_RUN = 5
export const BAR_DOWN_DAYS = 14

export function barRecord(data: Pick<AppData, 'bars'>, questId: string, day: DayKey) {
  let best: NonNullable<AppData['bars']>[number] | undefined
  for (const b of data.bars ?? []) {
    if (b.questId !== questId || b.from > day) continue
    if (!best || b.from > best.from || (b.from === best.from && b.id > best.id)) best = b
  }
  return best
}

export function barStep(data: Pick<AppData, 'bars'>, questId: string, day: DayKey): number {
  const ladder = BAR_LADDERS[questId]
  if (!ladder) return 0
  return Math.max(0, Math.min(ladder.steps.length - 1, barRecord(data, questId, day)?.step ?? 0))
}

/** XP multiplier of a quest on a day: +10% per step */
export const barMult = (data: Pick<AppData, 'bars'>, questId: string, day: DayKey) => 1 + BAR_STEP_BONUS * barStep(data, questId, day)

/** Done threshold for numeric quests on a bar step (reading pages) */
export function barMin(data: Pick<AppData, 'bars'>, questId: string, day: DayKey): number | undefined {
  const step = barStep(data, questId, day)
  return step > 0 ? BAR_LADDERS[questId]?.steps[step]?.value : undefined
}

/**
 * «Поднять планку?» after 5 done in a row on the current step;
 * «Опустить без штрафа» after two weeks of only mini / skip.
 * `status(day)` gives the effective mark; `after` skips days up to a dismissal.
 */
export function barSuggestion(
  data: Pick<AppData, 'bars'>,
  questId: string,
  today: DayKey,
  status: (d: DayKey) => string | undefined,
  start: DayKey,
  after?: DayKey,
): 'up' | 'down' | null {
  const ladder = BAR_LADDERS[questId]
  if (!ladder) return null
  const step = barStep(data, questId, today)
  const entry = barRecord(data, questId, today)?.from ?? start
  const floor = after && after >= entry ? addDays(after, 1) : entry
  if (step < ladder.steps.length - 1) {
    let run = 0
    for (let d = status(today) === 'done' ? today : addDays(today, -1); d >= floor && status(d) === 'done'; d = addDays(d, -1)) run++
    if (run >= BAR_UP_RUN) return 'up'
  }
  if (step > 0) {
    const from = addDays(today, -BAR_DOWN_DAYS)
    if (from >= floor) {
      let any = false
      for (let d = from; d < today; d = addDays(d, 1)) if (status(d) === 'done') any = true
      if (!any) return 'down'
    }
  }
  return null
}

// ---------- «Не могу начать» ----------

export function cantStartPick(data: AppData, skillId: string, today: DayKey, fallback?: string): { title: string; goalId?: string } | null {
  const shorts = goalsOf(data, skillId).filter((g) => g.type === 'short')
  const open = shorts.find((g) => !checkedOn(g, today))
  if (open) return { title: open.title, goalId: open.id }
  if (fallback) return { title: fallback }
  const node = (data.nodes ?? []).find((n) => n.skillId === skillId)
  return node ? { title: `15 минут: ${node.title}` } : null
}

// ---------- chests ----------

export const CHEST = { need: 3, rare: 0.12, legendary: 0.03, pityRare: 0.1, pityLegendary: 0.03 } as const
export const CHEST_TYPES: ChestType[] = ['repeat', 'short', 'mid']

/** Chest sources: «Квесты» = quests of the day (done or mini), «Задачи» = any closed task (project steps,
 * Дело дня, own tasks), «Навыки» = practices; skill goals of the matching type count too */
export type ChestData = Pick<AppData, 'goals' | 'chests'> & Partial<Pick<AppData, 'days' | 'tasks' | 'practices'>>

/** what moves a chest of a type on a day */
export function closuresOn(data: ChestData, type: ChestType, day: DayKey): number {
  let n = 0
  for (const g of data.goals ?? []) {
    if (g.type !== type) continue
    if (type === 'mid') n += g.doneDay === day ? 1 : 0
    else n += g.checks?.some((c) => c.day === day) ? 1 : 0
  }
  if (type === 'repeat') n += Object.values(data.days?.[day]?.quests ?? {}).filter((m) => m.status !== 'skip').length
  if (type === 'short') n += (data.tasks ?? []).filter((t) => t.doneAt && gameDayOf(new Date(t.doneAt)) === day).length
  if (type === 'mid') n += (data.practices ?? []).filter((p) => p.day === day).length
  return n
}

/** chests opened in a row without a rare or legendary prize */
export function pityCount(chests: ChestOpen[] | undefined): number {
  let n = 0
  for (const c of [...(chests ?? [])].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))) {
    if (c.rarity === 'rare' || c.rarity === 'legendary') break
    n++
  }
  return n
}

export function chestOdds(pity: number): { rare: number; legendary: number } {
  return { legendary: Math.min(1, CHEST.legendary + pity * CHEST.pityLegendary), rare: Math.min(1, CHEST.rare + pity * CHEST.pityRare) }
}

/** Deterministic roll: hash of day + chest, pity raises the odds. Picks only among existing tiers. */
export function rollChest(day: DayKey, type: ChestType, pity: number, rewards: Reward[]): { reward?: Reward; rarity?: Rarity } {
  const pool = rewards.filter((r) => r.rarity)
  if (!pool.length) return {}
  const tier = (rr: Rarity) => pool.filter((r) => r.rarity === rr)
  const roll = (hash32(`chest|${day}|${type}`) % 10000) / 10000
  const odds = chestOdds(pity)
  let rarity: Rarity = roll < odds.legendary ? 'legendary' : roll < odds.legendary + odds.rare ? 'rare' : 'common'
  const order: Rarity[] = rarity === 'legendary' ? ['legendary', 'rare', 'common'] : rarity === 'rare' ? ['rare', 'common', 'legendary'] : ['common', 'rare', 'legendary']
  for (const rr of order) {
    const list = tier(rr)
    if (list.length) {
      rarity = rr
      const reward = list[hash32(`chest-item|${day}|${type}`) % list.length]
      return { reward, rarity }
    }
  }
  return {}
}

export interface ChestStatus {
  type: ChestType
  count: number
  ready: boolean
  opened?: ChestOpen
}

export function chestsFor(data: ChestData, day: DayKey): ChestStatus[] {
  return CHEST_TYPES.map((type) => {
    const opened = (data.chests ?? []).find((c) => c.id === `${day}:${type}`)
    const count = closuresOn(data, type, day)
    return { type, count, ready: !opened && count >= CHEST.need, opened }
  })
}

// ---------- v0.5 «Огонёк»: streak of a repeat goal ----------

export interface RepeatStreak {
  /** fulfilled weeks in a row, the current week counts once it is fulfilled */
  current: number
  /** best ever: computed from history and the stored record, whichever is higher */
  best: number
  /** this week already counts */
  thisWeek: boolean
}

/**
 * Periods are weeks. An unfulfilled week burns the streak, except: the week the goal was set up,
 * the week still in progress, warm-up weeks (before the arc) and weeks with a frozen day — those are neutral.
 */
export function repeatStreak(g: Goal, today: DayKey, frozen: Set<DayKey> = new Set()): RepeatStreak {
  const per = g.perWeek ?? 0
  const stored = g.bestStreak ?? 0
  if (g.type !== 'repeat' || per <= 0) return { current: 0, best: stored, thisWeek: false }
  const days = new Set((g.checks ?? []).map((c) => c.day))
  const first = weekStartOf(g.since ?? dayOfMs(g.createdAt))
  const current = weekStartOf(today)
  let run = 0
  let best = 0
  let thisWeek = false
  for (let ws = first; ws <= current; ws = addDays(ws, 7)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    const ticks = week.filter((d) => days.has(d)).length
    if (ticks >= per) {
      run++
      best = Math.max(best, run)
      if (ws === current) thisWeek = true
      continue
    }
    const neutral = ws === current || ws === first || week[0] < ARC_START || week.some((d) => frozen.has(d))
    if (!neutral) run = 0
  }
  return { current: run, best: Math.max(best, stored), thisWeek }
}
