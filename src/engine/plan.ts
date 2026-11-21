/**
 * «План дня»: the day in a few time blocks on a 24h ring. Pure helpers; the only reward is the
 * «Переход» before a block (transitionEvents, paid by the replay).
 */
import { DAY_START_HOUR, eveningMinutes, parseHM } from './time'
import { wakeTargetFor } from './quests'
import type { AppData, BlockColor, DayKey, DayLog, PlanBlock, PlanItemKind, StatId, TimeBlock } from './types'

export const DAY_MIN = 24 * 60
export const BLOCK_MIN = 5
export const BLOCK_MAX = 12 * 60
/** «Отбой до 23:30» is the bedtime quest; the ring shows sleep from here to the wake target */
export const BEDTIME_TARGET = '23:30'

const mod = (m: number) => ((Math.round(m) % DAY_MIN) + DAY_MIN) % DAY_MIN

/** Clean a stored block (backups and other devices may hold anything) */
export function sanitizeBlock(b: unknown): TimeBlock | null {
  if (!b || typeof b !== 'object') return null
  const x = b as Partial<TimeBlock>
  if (typeof x.id !== 'string' || typeof x.title !== 'string') return null
  const start = Number(x.start)
  const dur = Number(x.dur)
  if (!Number.isFinite(start) || !Number.isFinite(dur)) return null
  const out: TimeBlock = {
    id: x.id,
    start: mod(start),
    dur: Math.max(BLOCK_MIN, Math.min(BLOCK_MAX, Math.round(dur))),
    title: x.title.slice(0, 80),
  }
  if (x.stat) out.stat = x.stat
  if (x.ref && (x.ref.kind === 'quest' || x.ref.kind === 'task') && typeof x.ref.id === 'string') out.ref = { kind: x.ref.kind, id: x.ref.id }
  return out
}

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
  return [...blocks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
}

/** Do two blocks share any minute (blocks may wrap past midnight)? */
export function blocksOverlap(a: Pick<TimeBlock, 'start' | 'dur'>, b: Pick<TimeBlock, 'start' | 'dur'>): boolean {
  const segs = (x: Pick<TimeBlock, 'start' | 'dur'>): [number, number][] => {
    const s = mod(x.start)
    const e = s + x.dur
    return e <= DAY_MIN ? [[s, e]] : [[s, DAY_MIN], [0, e - DAY_MIN]]
  }
  for (const [s1, e1] of segs(a)) for (const [s2, e2] of segs(b)) if (s1 < e2 && s2 < e1) return true
  return false
}

/** The block that is running at minute `m` */
export function blockAt(blocks: TimeBlock[], m: number): TimeBlock | undefined {
  return blocks.find((b) => blocksOverlap(b, { start: m, dur: 1 }))
}

/** First free start ≥ `from` (step 5 min) where a block of `dur` fits without overlaps */
export function nextFreeStart(blocks: TimeBlock[], from: number, dur: number): number {
  const start = Math.ceil(mod(from) / BLOCK_MIN) * BLOCK_MIN
  for (let i = 0; i < DAY_MIN; i += BLOCK_MIN) {
    const s = mod(start + i)
    if (!blocks.some((b) => blocksOverlap(b, { start: s, dur }))) return s
  }
  return mod(start)
}

/** Sleep arc for the ring: from the bedtime target to the wake target (minutes from 00:00) */
export function sleepWindow(data: Pick<AppData, 'profile'>, day: DayKey): { sleep: number; wake: number; dur: number } {
  const wake = wakeTargetFor(data, day) ?? parseHM(data.profile?.usualWake ?? '07:00')
  const sleep = mod(eveningMinutes(BEDTIME_TARGET))
  return { sleep, wake: mod(wake), dur: mod(wake - sleep) || DAY_MIN }
}

/** Planned minutes in total (no double counting of overlaps is needed: the UI prevents them) */
export function plannedMinutes(blocks: TimeBlock[]): number {
  return blocks.reduce((s, b) => s + b.dur, 0)
}

// ---------- v0.9: the day in a few blocks ----------
//
// A day log keeps its blocks by id (DayLog.dayBlocks), what goes into each block (DayLog.assign:
// plan item key → block id) and the «Переход» done before a block (DayLog.transitions: block id →
// ms). All three are keyed maps, so sync merges them per entry (engine/sync.ts) and a removed entry
// leaves a tombstone. Quests, tasks, goals and nodes keep their own done state: the plan only
// points at them, nothing is checked twice.

export const BLOCK_COLORS: BlockColor[] = ['mind', 'deal', 'body', 'energy', 'will', 'frost', 'gold']
export const PLAN_ICONS = ['brain', 'hammer', 'book', 'code', 'pen', 'dumbbell', 'run', 'sun', 'coffee', 'campfire', 'moon', 'star'] as const
export const PLAN_TITLE_MAX = 40
/** «не работать больше 5–6 часов», «не работать после 17:00» */
export const WORK_RULES = { maxMin: 6 * 60, endBy: 17 * 60 } as const

const GAME_DAY_START = DAY_START_HOUR * 60

/** Minutes since the game day start (04:00): blocks after midnight sort after the evening */
export const gameMin = (m: number) => (mod(m) - GAME_DAY_START + DAY_MIN) % DAY_MIN

export const blockEnd = (b: Pick<PlanBlock, 'start' | 'dur'>) => mod(b.start + b.dur)

export const itemKey = (kind: PlanItemKind, id: string) => `${kind}:${id}`

const ITEM_KINDS: PlanItemKind[] = ['quest', 'task', 'node', 'goal']
export function parseItemKey(key: string): { kind: PlanItemKind; id: string } | null {
  const i = key.indexOf(':')
  if (i <= 0 || i === key.length - 1) return null
  const kind = key.slice(0, i) as PlanItemKind
  return ITEM_KINDS.includes(kind) ? { kind, id: key.slice(i + 1) } : null
}

/** Clean a stored plan block; `id` is the map key it is stored under */
export function sanitizePlanBlock(b: unknown, id?: string): PlanBlock | null {
  if (!b || typeof b !== 'object') return null
  const x = b as Partial<PlanBlock>
  const bid = id ?? x.id
  if (typeof bid !== 'string' || !bid) return null
  const start = Number(x.start)
  const dur = Number(x.dur)
  if (!Number.isFinite(start) || !Number.isFinite(dur)) return null
  const title = typeof x.title === 'string' ? x.title.trim().slice(0, PLAN_TITLE_MAX) : ''
  const out: PlanBlock = { id: bid, title: title || 'Блок', start: mod(Math.round(start / BLOCK_MIN) * BLOCK_MIN), dur: Math.max(BLOCK_MIN, Math.min(BLOCK_MAX, Math.round(dur / BLOCK_MIN) * BLOCK_MIN)) }
  if (x.color && BLOCK_COLORS.includes(x.color)) out.color = x.color
  if (typeof x.icon === 'string' && (PLAN_ICONS as readonly string[]).includes(x.icon)) out.icon = x.icon
  if (x.work === true) out.work = true
  return out
}

/** The day's blocks in game-day order (04:00 → 04:00) */
export function planBlocksOf(log: Pick<DayLog, 'dayBlocks'> | undefined): PlanBlock[] {
  return Object.values(log?.dayBlocks ?? {}).sort((a, b) => gameMin(a.start) - gameMin(b.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Block id an item sits in, only if that block still exists */
export function assignedBlock(log: Pick<DayLog, 'dayBlocks' | 'assign'> | undefined, key: string): string | undefined {
  const id = log?.assign?.[key]
  return id && log?.dayBlocks?.[id] ? id : undefined
}

export function workMinutes(blocks: Pick<PlanBlock, 'dur' | 'work'>[]): number {
  return blocks.reduce((s, b) => s + (b.work ? b.dur : 0), 0)
}

/** Work blocks that run past 17:00 (in game-day terms, so a block after midnight counts too) */
export function lateWork(blocks: PlanBlock[]): PlanBlock[] {
  return blocks.filter((b) => b.work && gameMin(b.start) + b.dur > gameMin(WORK_RULES.endBy))
}

/**
 * v0.3 → v0.9: each legacy block (one quest per time slot) becomes a block of the same time and
 * name, its quest goes inside. Ids are kept, so two devices migrating the same day agree. The day
 * is marked planV = 2: a legacy copy that comes back from an old device later is dropped unread.
 * Then the maps are cleaned: bad blocks, assignments and transitions to missing blocks go away.
 */
export function migrateDayPlan(log: DayLog): DayLog {
  if (log.blocks === undefined && log.dayBlocks === undefined && log.assign === undefined && log.transitions === undefined && log.planV === undefined) return log
  const next: DayLog = { ...log }
  const blocks: Record<string, PlanBlock> = {}
  if (log.dayBlocks && typeof log.dayBlocks === 'object' && !Array.isArray(log.dayBlocks)) {
    for (const [id, raw] of Object.entries(log.dayBlocks)) {
      const b = sanitizePlanBlock(raw, id)
      if (b) blocks[id] = b
    }
  }
  const assign: Record<string, string> = {}
  if (log.assign && typeof log.assign === 'object' && !Array.isArray(log.assign)) {
    for (const [k, v] of Object.entries(log.assign)) if (parseItemKey(k) && typeof v === 'string') assign[k] = v
  }
  if (log.blocks !== undefined) {
    if (log.planV !== 2 && Array.isArray(log.blocks)) {
      for (const old of log.blocks.map(sanitizeBlock)) {
        if (!old) continue
        if (!blocks[old.id]) blocks[old.id] = { id: old.id, title: old.title.slice(0, PLAN_TITLE_MAX) || 'Блок', start: old.start, dur: old.dur, ...(old.stat ? { color: old.stat } : {}) }
        if (old.ref) {
          const key = itemKey(old.ref.kind, old.ref.id)
          if (!assign[key]) assign[key] = old.id
        }
      }
    }
    delete next.blocks
    next.planV = 2
  } else if (log.planV !== undefined && log.planV !== 2) delete next.planV
  for (const [k, v] of Object.entries(assign)) if (!blocks[v]) delete assign[k]
  const transitions: Record<string, number> = {}
  if (log.transitions && typeof log.transitions === 'object' && !Array.isArray(log.transitions)) {
    for (const [id, t] of Object.entries(log.transitions)) if (blocks[id] && typeof t === 'number' && Number.isFinite(t) && t > 0) transitions[id] = t
  }
  if (Object.keys(blocks).length) next.dayBlocks = blocks
  else delete next.dayBlocks
  if (Object.keys(assign).length) next.assign = assign
  else delete next.assign
  if (Object.keys(transitions).length) next.transitions = transitions
  else delete next.transitions
  return next
}

// ---------- templates ----------

export type TemplateBlock = Omit<PlanBlock, 'id'>

export interface PlanTemplate {
  id: 'classic' | 'deep' | 'rules'
  title: string
  sub: string
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  { id: 'classic', title: 'Классика: 3 блока', sub: 'фокус утром, дела днём, спокойный вечер' },
  { id: 'deep', title: 'Глубокая работа: 2 × 90 мин', sub: 'два длинных блока, между ними перерыв' },
  { id: 'rules', title: 'По правилам', sub: 'работа до 17:00 и не больше 5 ч, прогулка, тихий вечер' },
]

const up15 = (m: number) => Math.ceil(m / 15) * 15

/**
 * Blocks of a template for a day with this wake and bedtime (minutes from 00:00).
 * «По правилам» starts from the wake time and keeps the work rules: every work block ends by 17:00,
 * work is ≤ 6 h in total, a walk after work and a dim, phone-free evening 2 h before sleep.
 */
export function templateBlocks(id: PlanTemplate['id'], ctx: { wake: number; sleep: number }): TemplateBlock[] {
  const hm = (h: number, m = 0) => h * 60 + m
  if (id === 'classic')
    return [
      { title: 'Утро · фокус', start: hm(9), dur: 150, color: 'mind', icon: 'brain', work: true },
      { title: 'Дела', start: hm(12, 30), dur: 150, color: 'deal', icon: 'hammer', work: true },
      { title: 'Вечер', start: hm(18, 30), dur: 150, color: 'frost', icon: 'campfire' },
    ]
  if (id === 'deep')
    return [
      { title: 'Глубокая работа', start: hm(9, 30), dur: 90, color: 'mind', icon: 'brain', work: true },
      { title: 'Глубокая работа', start: hm(11, 15), dur: 90, color: 'mind', icon: 'code', work: true },
      { title: 'Прогулка', start: hm(13, 15), dur: 45, color: 'body', icon: 'run' },
    ]
  // «По правилам»: game-day minutes so a late wake (after midnight) still orders right
  const wake = gameMin(ctx.wake)
  const endBy = gameMin(WORK_RULES.endBy)
  const out: TemplateBlock[] = []
  const lightAt = up15(wake + 15)
  out.push({ title: 'Свет и вода', start: lightAt, dur: 30, color: 'energy', icon: 'sun' })
  let t = Math.max(up15(lightAt + 30 + 15), gameMin(hm(9)))
  let work = 0
  const plan: [string, string, number, number][] = [
    ['Фокус · самое трудное', 'brain', 90, 15],
    ['Фокус', 'brain', 90, 45],
    ['Дела', 'hammer', 120, 0],
  ]
  for (const [title, icon, dur, pause] of plan) {
    const len = Math.min(dur, endBy - t, WORK_RULES.maxMin - 60 - work)
    if (len < 30) break
    out.push({ title, start: t, dur: len, color: title === 'Дела' ? 'deal' : 'mind', icon, work: true })
    work += len
    t += len + pause
  }
  const lastWork = out[out.length - 1]
  const walkAt = up15(lastWork.start + lastWork.dur + 15)
  out.push({ title: 'Прогулка · 2 000+ шагов', start: walkAt, dur: 45, color: 'body', icon: 'run' })
  const quiet = gameMin(ctx.sleep) - 120
  if (quiet > walkAt + 45) out.push({ title: 'Тихий вечер', start: quiet, dur: 120, color: 'frost', icon: 'moon' })
  return out.map((b) => ({ ...b, start: mod(b.start + GAME_DAY_START) }))
}

// ---------- «Переход» between blocks ----------

/** push-ups + squats («по Неумывакину») before a block: a small body reward, once per block per day */
export const TRANSITION = {
  xp: 2,
  stat: 'body' as StatId,
  maxReps: 100,
  /** at most this many paid transitions a day */
  perDay: 8,
  /** the «Сегодня» card shows up this long before a block … */
  leadMin: 15,
  /** … and stays this long after it started */
  lagMin: 15,
} as const

export type Sex = 'm' | 'f'

/** Minimum reps by sex (the setting is Settings.morningFinal, shared with the warm-up final; missing = М) */
export const TRANSITION_MIN: Record<Sex, { push: number; squat: number }> = {
  m: { push: 20, squat: 20 },
  f: { push: 5, squat: 20 },
}

/** Reps of a transition: the stored numbers, never below the minimum for the sex, never above 100 */
export function transitionReps(s?: { push?: unknown; squat?: unknown }, sex?: Sex): { push: number; squat: number } {
  const min = TRANSITION_MIN[sex === 'f' ? 'f' : 'm']
  const clamp = (v: unknown, lo: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(TRANSITION.maxReps, Math.round(v))) : lo)
  return { push: clamp(s?.push, min.push), squat: clamp(s?.squat, min.squat) }
}

const ru = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100
  const b = a % 10
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many
}

/** «20 отжиманий + 20 приседаний по Неумывакину» (М) / «20 приседаний по Неумывакину + 5 отжиманий» (Ж) */
export function transitionText(r: { push: number; squat: number }, sex?: Sex): string {
  const push = `${r.push} ${ru(r.push, 'отжимание', 'отжимания', 'отжиманий')}`
  const squat = `${r.squat} ${ru(r.squat, 'приседание', 'приседания', 'приседаний')} по Неумывакину`
  return sex === 'f' ? `${squat} + ${push}` : `${push} + ${squat}`
}

export interface TransitionEvent {
  day: DayKey
  at: number
  blockId: string
  xp: number
  stat: StatId
}

/** One event per existing block with a done transition, the earliest `perDay` of each day */
export function transitionEvents(data: Pick<AppData, 'days'>): TransitionEvent[] {
  const out: TransitionEvent[] = []
  for (const [day, log] of Object.entries(data.days ?? {})) {
    if (!log?.transitions) continue
    const done = Object.entries(log.transitions)
      .filter(([id, t]) => !!log.dayBlocks?.[id] && typeof t === 'number' && Number.isFinite(t) && t > 0)
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, TRANSITION.perDay)
    for (const [blockId, at] of done) out.push({ day, at, blockId, xp: TRANSITION.xp, stat: TRANSITION.stat })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.at - b.at))
}

/** The block that starts within the next 15 min or started in the last 15, with its transition still open */
export function transitionDue(log: Pick<DayLog, 'dayBlocks' | 'transitions'> | undefined, nowMin: number): { block: PlanBlock; inMin: number } | undefined {
  const now = gameMin(nowMin)
  for (const b of planBlocksOf(log)) {
    if (log?.transitions?.[b.id]) continue
    const inMin = gameMin(b.start) - now
    if (inMin <= TRANSITION.leadMin && inMin >= -TRANSITION.lagMin) return { block: b, inMin }
  }
  return undefined
}
