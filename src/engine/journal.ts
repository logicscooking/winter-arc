/**
 * «Вечерний дневник» and «Выброс мыслей»: private text of the day.
 * PRIVACY: the answers and the dump stay in the day log; nothing in social.ts / share.ts / ai may read them.
 * The diary quest closes by itself from the answers (quests.ts resolveMark): ≥3 → done, 1–2 → mini.
 */
import type { AppData, DayKey, DayLog, MarkStatus, StatId } from './types'

export const JOURNAL_PROMPTS = [
  { id: 'win', text: 'Что сегодня получилось?' },
  { id: 'stress', text: 'Что меня напрягло?' },
  { id: 'self', text: 'Что я понял о себе?' },
  { id: 'thanks', text: 'За что благодарен?' },
  { id: 'tomorrow', text: 'Что главное на завтра?' },
] as const

export type JournalPromptId = (typeof JOURNAL_PROMPTS)[number]['id']
export const JOURNAL_DONE = 3
export const JOURNAL_TEXT_MAX = 2000
export const DUMP_TEXT_MAX = 5000

/** «Выброс мыслей» is a bonus row: it never counts in the ring, +2 XP Разума once a day */
export const DUMP = { xp: 2, stat: 'mind' as StatId } as const

const isPrompt = (id: string) => JOURNAL_PROMPTS.some((p) => p.id === id)

/** Answered prompts of a day (blank text does not count) */
export function journalAnswered(log: Pick<DayLog, 'journal'> | undefined): number {
  const j = log?.journal
  if (!j) return 0
  return JOURNAL_PROMPTS.filter((p) => !!j[p.id]?.text?.trim()).length
}

export function journalStatus(answered: number): MarkStatus | undefined {
  return answered >= JOURNAL_DONE ? 'done' : answered > 0 ? 'mini' : undefined
}

/** Days with a diary or a dump, newest first: the «Прошлые записи» list */
export function journalDays(data: Pick<AppData, 'days'>, before?: DayKey): DayKey[] {
  return Object.entries(data.days ?? {})
    .filter(([day, log]) => (!before || day < before) && !!log && (journalAnswered(log) > 0 || !!log.dump?.text?.trim()))
    .map(([day]) => day)
    .sort()
    .reverse()
}

/** Clean stored answers (backups and other devices may hold anything); undefined when nothing is left */
export function sanitizeJournal(raw: unknown): Record<string, { text: string; at: number }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, { text: string; at: number }> = {}
  for (const [id, a] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPrompt(id) || !a || typeof a !== 'object') continue
    const { text, at } = a as { text?: unknown; at?: unknown }
    if (typeof text !== 'string' || !text.trim() || typeof at !== 'number' || !Number.isFinite(at)) continue
    out[id] = { text: text.slice(0, JOURNAL_TEXT_MAX), at }
  }
  return Object.keys(out).length ? out : undefined
}

export function sanitizeDump(raw: unknown): { text: string; at: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const { text, at } = raw as { text?: unknown; at?: unknown }
  if (typeof text !== 'string' || !text.trim() || typeof at !== 'number' || !Number.isFinite(at)) return undefined
  return { text: text.slice(0, DUMP_TEXT_MAX), at }
}

export interface DumpEvent {
  day: DayKey
  at: number
  xp: number
  stat: StatId
}

/** One small XP event per day with a non-empty dump (the replay pays it) */
export function dumpEvents(data: Pick<AppData, 'days'>): DumpEvent[] {
  const out: DumpEvent[] = []
  for (const [day, log] of Object.entries(data.days ?? {})) {
    const d = log?.dump
    if (d && typeof d.text === 'string' && d.text.trim() && Number.isFinite(d.at)) out.push({ day, at: d.at, xp: DUMP.xp, stat: DUMP.stat })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}
