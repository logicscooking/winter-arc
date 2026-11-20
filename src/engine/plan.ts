/**
 * «План дня»: time blocks on a 24h ring. Pure helpers, no game rules depend on them.
 */
import { eveningMinutes, parseHM } from './time'
import { wakeTargetFor } from './quests'
import type { AppData, DayKey, TimeBlock } from './types'

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
