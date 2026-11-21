import { DEFAULT_QUESTS, REELS_LIMIT } from './quests'
import { migrateDayPlan, transitionReps } from './plan'
import { isBoard, sanitizeDrop } from './plinko'
import { validMorningAt } from './morning'
import type { AppData, DayLog, PlinkoDrop } from './types'

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
    ack: { reviewedWeeks: [], hints: [], celebrated: [] },
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
  }
}

export const V04_COLLECTIONS = ['skills', 'traits', 'nodes', 'practices', 'goals', 'flows', 'bars', 'themes', 'extras', 'chests', 'duels', 'incomes'] as const

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
  // v0.9 «Переход»: reps stay within 10..100
  if (settings.transition !== undefined) settings.transition = transitionReps(settings.transition)
  return migrateV03({
    ...base,
    ...r,
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
    if (plan === log && log.destiny === undefined && log.plinko === undefined && log.plinkoBoard === undefined && log.morningAt === undefined) continue
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
    if (days === d.days) days = { ...d.days }
    days[day] = next
  }
  return days === d.days ? d : { ...d, days }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
