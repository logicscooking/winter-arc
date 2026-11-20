import { DEFAULT_QUESTS, REELS_LIMIT } from './quests'
import type { AppData } from './types'

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
    settings: { debugOffsetDays: 0, reelsLimit: REELS_LIMIT, defaultSwap: '10 отжиманий', theme: 'auto', snow: true },
    ack: { reviewedWeeks: [], hints: [], celebrated: [] },
  }
}

/** Accepts an exported backup (or persisted state) and fills any missing fields. */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на бэкап Winter Arc')
  const r = raw as Partial<AppData> & { data?: unknown }
  if (r.data && typeof r.data === 'object' && !('quests' in r)) return normalizeData(r.data)
  if (!Array.isArray(r.quests) || typeof r.days !== 'object') throw new Error('В файле нет квестов или дней — это не бэкап Winter Arc')
  const base = createInitialData()
  return {
    ...base,
    ...r,
    schemaVersion: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    ack: { ...base.ack, ...(r.ack ?? {}) },
  } as AppData
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
