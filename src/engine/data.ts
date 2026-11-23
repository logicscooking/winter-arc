import { DEFAULT_QUESTS, REELS_LIMIT } from './quests'
import { migrateDayPlan, transitionReps } from './plan'
import { isBoard, sanitizeDrop } from './plinko'
import { validMorningAt } from './morning'
import { sanitizeDump, sanitizeJournal } from './journal'
import { retitlePhone, sanitizeEvent } from './areas'
import { sanitizeRecap, sanitizeWeekGoal } from './week'
import { sanitizeArcGoal } from './twelveWeeks'
import type { AppData, ArcGoal, CalEvent, DayLog, PlinkoDrop, WeekGoal, WeekRecap } from './types'

export const SCHEMA_VERSION = 1
export const STORAGE_KEY = 'winter-arc-v1'

export function createInitialData(): AppData {
  return {
    schemaVersion: 1,
    quests: DEFAULT_QUESTS.map((q) => ({ ...q, roles: [...q.roles] as typeof q.roles })),
    days: {},
    tasks: [],
    slips: [],
    cravings: [],
    purchases: [],
    rewards: [],
    pauses: [],
    books: [],
    baseline: {},
    final: {},
    reviews: {},
    settings: { debugOffsetDays: 0, reelsLimit: REELS_LIMIT, defaultSwap: '10 отжиманий', theme: 'dark', snow: true },
    ack: { reviewedWeeks: [], hints: [], celebrated: [], moments: [] },
    skills: [],
    traits: [],
    nodes: [],
    practices: [],
    goals: [],
    flows: [],
    bars: [],
    themes: [],
    extras: [],
    chests: [],
    duels: [],
    incomes: [],
    events: [],
    weekGoals: [],
    weekRecaps: [],
    arcGoals: [],
  }
}

export const V04_COLLECTIONS = ['skills', 'traits', 'nodes', 'practices', 'goals', 'flows', 'bars', 'themes', 'extras', 'chests', 'duels', 'incomes', 'events', 'weekGoals', 'weekRecaps', 'arcGoals'] as const

/** Accepts an exported backup (or persisted state) and fills any missing fields. */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на бэкап Winter Arc')
  const r = raw as Partial<AppData> & { data?: unknown }
  if (r.data && typeof r.data === 'object' && !('quests' in r)) return normalizeData(r.data)
  if (!Array.isArray(r.quests) || typeof r.days !== 'object') throw new Error('В файле нет квестов или дней — это не бэкап Winter Arc')
  const base = createInitialData()
  // v0.4 collections: anything that is not an array (corrupt or from a future shape) becomes empty
  for (const k of V04_COLLECTIONS) if (k in r && !Array.isArray(r[k])) delete (r as Record<string, unknown>)[k]
  const settings = { ...base.settings, theme: 'auto' as const, ...(r.settings ?? {}) }
  // v0.18: the weekly bosses are gone, so is their feed toggle (an old `final` moment ack is simply never read)
  if (settings.share && 'boss' in settings.share) {
    const { boss: _boss, ...share } = settings.share as Record<string, boolean>
    void _boss
    settings.share = share
  }
  // v0.9 «Переход»: reps stay between the minimum for the sex (old 10 + 10 moves up) and 100
  if (settings.transition !== undefined) settings.transition = transitionReps(settings.transition, settings.morningFinal)
  // «Сферы»: broken events are dropped
  if (Array.isArray(r.events)) r.events = r.events.map(sanitizeEvent).filter((e): e is CalEvent => !!e)
  // «Неделя»: broken goals and итоги are dropped, one итог per week
  if (Array.isArray(r.weekGoals)) r.weekGoals = r.weekGoals.map(sanitizeWeekGoal).filter((g): g is WeekGoal => !!g)
  // «13 недель»: broken arc goals and tactics are dropped
  if (Array.isArray(r.arcGoals)) r.arcGoals = r.arcGoals.map(sanitizeArcGoal).filter((g): g is ArcGoal => !!g)
  if (Array.isArray(r.weekRecaps)) {
    const byWeek = new Map<string, WeekRecap>()
    for (const x of r.weekRecaps.map(sanitizeRecap)) if (x && (byWeek.get(x.id)?.updatedAt ?? -1) <= x.updatedAt) byWeek.set(x.id, x)
    r.weekRecaps = [...byWeek.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  }
  return migrateV03({
    ...base,
    ...r,
    quests: retitlePhone(r.quests),
    schemaVersion: 1,
    // a backup without a theme was made before v0.3: keep it following the system, as it did
    settings,
    ack: { ...base.ack, ...(r.ack ?? {}) },
  } as AppData)
}

/**
 * v0.3+ fields are optional additions (day blocks, destiny, outfit, reward icon), so old data stays
 * valid as is and schemaVersion stays 1. Here they are only sanitized; nothing is ever dropped
 * except a malformed v0.3 field.
 */
function migrateV03(d: AppData): AppData {
  let days = d.days
  for (const [day, log] of Object.entries(d.days ?? {})) {
    if (!log) continue
    const plan = migrateDayPlan(log)
    if (plan === log && log.destiny === undefined && log.plinko === undefined && log.plinkoBoard === undefined && log.morningAt === undefined && log.picks === undefined && log.journal === undefined && log.dump === undefined) continue
    // v0.9 «План дня»: legacy blocks become day blocks with their quest inside (engine/plan.ts)
    const next: DayLog = plan === log ? { ...log } : plan
    const z = log.destiny
    if (z !== undefined && !(z && (z.ref === 'quest' || z.ref === 'task') && typeof z.id === 'string' && Number.isFinite(z.startedAt) && Number.isFinite(z.minutes))) delete next.destiny
    if (log.plinko !== undefined) {
      const drops: Record<string, PlinkoDrop> = {}
      if (log.plinko && typeof log.plinko === 'object') for (const raw of Object.values(log.plinko)) {
        const dr = sanitizeDrop(raw)
        if (dr) drops[String(dr.n)] = dr
      }
      if (Object.keys(drops).length) next.plinko = drops
      else delete next.plinko
    }
    if (log.plinkoBoard !== undefined && !isBoard(log.plinkoBoard)) delete next.plinkoBoard
    if (log.morningAt !== undefined && !validMorningAt(log.morningAt)) delete next.morningAt
    if (log.picks !== undefined) {
      const picks: Record<string, number> = {}
      if (log.picks && typeof log.picks === 'object' && !Array.isArray(log.picks)) for (const [id, t] of Object.entries(log.picks)) if (typeof t === 'number' && Number.isFinite(t) && t > 0) picks[id] = t
      if (Object.keys(picks).length) next.picks = picks
      else delete next.picks
    }
    // «Сферы»: the diary and the dump are plain text, kept only when well-formed
    if (log.journal !== undefined) {
      const j = sanitizeJournal(log.journal)
      if (j) next.journal = j
      else delete next.journal
    }
    if (log.dump !== undefined) {
      const x = sanitizeDump(log.dump)
      if (x) next.dump = x
      else delete next.dump
    }
    if (days === d.days) days = { ...d.days }
    days[day] = next
  }
  return days === d.days ? d : { ...d, days }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
