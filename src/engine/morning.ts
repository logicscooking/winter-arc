/**
 * «Утренняя инвестиция»: a guided 10–15 minute morning warm-up, a daily task with a reward.
 *
 * The log keeps one field per game day, DayLog.morningAt: the moment the program was finished.
 * A partial run writes nothing, so it gives nothing. One field per day = once per game day by
 * construction; the replay pays it like a main quest (no boss damage, no crit). Sync merges it as
 * a day atom; when two devices both finished, the earliest finish wins (engine/sync.ts).
 */
import type { AppData, DayKey, DayLog, StatId } from './types'

/** Compare: main quest 20 XP / 3 ❄, side 10 XP / 2 ❄ */
export const MORNING = {
  xp: 20,
  shards: 3,
  stat: 'energy' as StatId,
  /** share of the exercises that must be done (not skipped) for the run to count */
  minShare: 0.7,
} as const

export const validMorningAt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export function morningDone(log: DayLog | undefined): boolean {
  return validMorningAt(log?.morningAt)
}

/** A run counts when enough exercises were done, not skipped */
export function morningCounts(done: number, total: number): boolean {
  return total > 0 && done >= Math.ceil(total * MORNING.minShare)
}

export interface MorningEvent {
  day: DayKey
  at: number
  xp: number
  shards: number
  stat: StatId
}

/** One event per game day with a finished program */
export function morningEvents(data: Pick<AppData, 'days'>): MorningEvent[] {
  const out: MorningEvent[] = []
  for (const [day, log] of Object.entries(data.days ?? {})) {
    if (!log || !validMorningAt(log.morningAt)) continue
    out.push({ day, at: log.morningAt, xp: MORNING.xp, shards: MORNING.shards, stat: MORNING.stat })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}
