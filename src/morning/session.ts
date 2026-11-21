/**
 * «Утренняя инвестиция»: the live session. Kept in memory only (a reload starts over), outside the
 * screen, so stepping away to «Сегодня» and back keeps the place. Timers are deadlines on the wall
 * clock (`endsAt`), not counters, so a throttled background tab or a pause never drifts.
 *
 * Nothing starts by itself: a timed exercise waits for «Старт», then a short 3-2-1 «Приготовься»,
 * then its countdown; at 0 the next exercise opens and waits again. Reps wait for «Готово».
 * Nothing here is logged: only a finished program writes DayLog.morningAt (see screens/Morning.tsx).
 */
import { create } from 'zustand'
import type { DayKey } from '../engine'
import { GET_SEC, type Clip } from './program'

export type Phase = 'intro' | 'work' | 'done'
/** a timed exercise: waiting for «Старт» → 3-2-1 → the countdown */
export type Stage = 'idle' | 'get' | 'run'
export type StepMark = 'done' | 'skip'

export interface Session {
  phase: Phase
  day: DayKey
  list: Clip[]
  i: number
  stage: Stage
  /** the countdown ticks (3-2-1 or the exercise) */
  running: boolean
  /** running: wall ms when it reaches 0 */
  endsAt: number
  /** not running: ms left of the current stage */
  left: number
  /** paused by the app going to the background */
  auto: boolean
  marks: (StepMark | undefined)[]
  startedAt: number
  /** ms spent paused, subtracted from «time spent» */
  pausedMs: number
  pausedAt?: number
  finishedAt?: number
  /** the run counted and was logged now (false: too many skips, or already done today) */
  rewarded?: boolean
}

interface Store extends Session {
  start: (day: DayKey, list: Clip[], now: number) => void
  reset: (day: DayKey) => void
  /** the countdown reached 0 */
  expire: (now: number) => void
  /** «Старт» (begins the 3-2-1) or resume after a pause */
  play: (now: number) => void
  pause: (now: number, auto?: boolean) => void
  /** «Готово» (reps) */
  complete: (now: number) => void
  skip: (now: number) => void
  prev: (now: number) => void
  setRewarded: (v: boolean) => void
}

export const clipMs = (c: Clip | undefined) => (c?.mode === 'time' ? (c.seconds ?? 0) * 1000 : 0)

const idle = (day: DayKey): Session => ({
  phase: 'intro',
  day,
  list: [],
  i: 0,
  stage: 'idle',
  running: false,
  endsAt: 0,
  left: 0,
  auto: false,
  marks: [],
  startedAt: 0,
  pausedMs: 0,
  // explicit undefined: set() merges, so a new run must clear what the last one left
  pausedAt: undefined,
  finishedAt: undefined,
  rewarded: undefined,
})

export const useMorning = create<Store>((set, get) => {
  const unpause = (s: Session, now: number) => (s.pausedAt ? { pausedAt: undefined, pausedMs: s.pausedMs + (now - s.pausedAt) } : {})
  /** open exercise `i`, waiting for the user */
  const open = (s: Session, i: number) => ({ phase: 'work' as const, i, stage: 'idle' as const, running: false, endsAt: 0, left: clipMs(s.list[i]), auto: false })
  /** after the current exercise: the next one (waiting for «Старт» / «Готово»), or the end */
  const advance = (now: number, mark: StepMark) => {
    const s = get()
    const marks = s.marks.slice()
    marks[s.i] = mark
    if (s.i + 1 >= s.list.length) set({ marks, phase: 'done', stage: 'idle', running: false, finishedAt: now, auto: false, ...unpause(s, now) })
    else set({ marks, ...open(s, s.i + 1), ...unpause(s, now) })
  }
  return {
    ...idle(''),
    start: (day, list, now) => {
      const base = { ...idle(day), list, startedAt: now }
      set({ ...base, ...open(base, 0) })
    },
    reset: (day) => set(idle(day)),
    expire: (now) => {
      const s = get()
      if (!s.running || s.phase !== 'work') return
      if (s.stage === 'get') {
        const t = clipMs(s.list[s.i])
        set({ stage: 'run', endsAt: now + t, left: t })
      } else if (s.stage === 'run') advance(now, 'done')
    },
    play: (now) => {
      const s = get()
      if (s.phase !== 'work' || s.running || s.list[s.i]?.mode !== 'time') return
      if (s.stage === 'idle') set({ stage: 'get', running: true, endsAt: now + GET_SEC * 1000, left: GET_SEC * 1000, auto: false })
      else set({ running: true, endsAt: now + s.left, auto: false, ...unpause(s, now) })
    },
    pause: (now, auto = false) => {
      const s = get()
      if (s.phase !== 'work' || !s.running) return
      set({ running: false, left: Math.max(0, s.endsAt - now), auto, pausedAt: now })
    },
    complete: (now) => {
      if (get().phase === 'work') advance(now, 'done')
    },
    skip: (now) => {
      if (get().phase === 'work') advance(now, 'skip')
    },
    prev: (now) => {
      const s = get()
      if (s.phase !== 'work' || s.i === 0) return
      const marks = s.marks.slice()
      marks[s.i - 1] = undefined
      set({ marks, ...open(s, s.i - 1), ...unpause(s, now) })
    },
    setRewarded: (v) => set({ rewarded: v }),
  }
})

export const doneCount = (s: Pick<Session, 'marks'>) => s.marks.filter((m) => m === 'done').length

/** active time: wall time minus pauses */
export function spentMs(s: Session, now: number): number {
  const end = s.finishedAt ?? now
  const paused = s.pausedMs + (s.pausedAt && !s.finishedAt ? now - s.pausedAt : 0)
  return Math.max(0, end - s.startedAt - paused)
}

// dev only: lets a screenshot script jump the session (stripped from production builds)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __morning?: typeof useMorning }).__morning = useMorning
