/**
 * The whole game state is derived by replaying the stored log from the arc start.
 * Nothing derived is persisted, so editing the past or importing a backup is always consistent.
 */
import { levelOf } from './levels'
import {
  COMEBACK_WINDOW_MS,
  FREEZE,
  HP,
  SHARDS,
  XP,
  activeQuestsFor,
  isCompleted,
  questReward,
  resolveCtx,
  resolveMark,
} from './quests'
import { taskXp } from './tasks'
import { duelEvents } from './duels'
import { plinkoEvents } from './plinko'
import { moneyEvents } from './money'
import { morningDone, morningEvents } from './morning'
import { transitionEvents } from './plan'
import { FLOW, barMult, flowAt, flowWindows, skillEvents } from './skills'
import {
  ARC_END,
  ARC_START,
  addDays,
  bossOf,
  chapterOf,
  dayStart,
  gameDayOf,
  isPastDeadline,
  weekDays,
  weekOf,
  weekday,
} from './time'
import type { AppData, ChapterId, DayKey, MarkStatus, PlannedQuest, StatId } from './types'

export interface DayResult {
  day: DayKey
  /** confession filed, or the late-confession deadline passed */
  closed: boolean
  confession: boolean
  /** closed by deadline without a confession (retroactive evaluation) */
  retro: boolean
  /** «Разминка»: a day before the arc start. XP and ❄ count, HP never changes. */
  warmup: boolean
  frozen: boolean
  perfect: boolean
  plan: PlannedQuest[]
  marks: Record<string, MarkStatus | undefined>
  missedMain: string[]
  /** HP change applied at day close (misses, confession, perfect day) */
  closeHpDelta: number
  hpEnd: number
  xp: number
  shards: number
  bossDamage: number
  /** quests that rolled CRITICAL ×1.5 */
  crits: string[]
  /** «Судьба дня» finished before the timer ran out */
  destinyWon: boolean
  /** «Утренняя инвестиция» finished */
  morning: boolean
}

export interface BossState {
  week: number
  name: string
  hp: number
  damage: number
  /** the week's Sunday is closed */
  done: boolean
  won: boolean
}

export interface FallEvent {
  day: DayKey
  at: number
  rankLost: number
  shardsLost: number
}

export interface GameState {
  today: DayKey
  hp: number
  fallen: boolean
  /** perfect days in a row during the fall */
  recovery: number
  freezes: number
  /** perfect days in a row towards the next freeze */
  perfectRun: number
  shards: number
  xp: number
  xpByStat: Record<StatId, number>
  chapterXp: Record<ChapterId, number>
  chapterPenalty: Record<ChapterId, number>
  days: Record<DayKey, DayResult>
  hpByDay: Record<DayKey, number>
  xpByDay: Record<DayKey, number>
  bosses: Record<number, BossState>
  trophies: number[]
  falls: FallEvent[]
  honestyStreak: number
  bestHonesty: number
  freezesEarned: number
  freezesUsed: number
  /** v0.4: XP earned per skill */
  skillXp: Record<string, number>
  /** v0.4: what each flow session closed */
  flowStats: Record<string, { closed: number; xp: number }>
}

interface Ev {
  day: DayKey
  at: number
  xp?: number
  stat?: StatId
  shards?: number
  hp?: number
  boss?: number
  skill?: string
  flow?: string
}

export const emptyStats = (): Record<StatId, number> => ({ energy: 0, body: 0, mind: 0, will: 0, deal: 0 })

export function planFor(data: AppData, day: DayKey): PlannedQuest[] {
  return data.days[day]?.plan ?? activeQuestsFor(data.quests, day)
}

/** First replayed day: the onboarding day if it is before the arc (warm-up), otherwise the arc start. */
export function replayStartOf(data: AppData): DayKey {
  const ob = data.profile?.onboardDay
  return ob && ob < ARC_START ? ob : ARC_START
}

export function evalStartOf(data: AppData): DayKey {
  const ob = data.profile?.onboardDay
  return ob && ob > ARC_START ? ob : ARC_START
}

export function isDayClosed(data: AppData, day: DayKey, now: Date): boolean {
  return !!data.days[day]?.confession || isPastDeadline(day, now)
}

/** Effective quest statuses for a day */
export function marksFor(data: AppData, day: DayKey, plan = planFor(data, day)) {
  const log = data.days[day]
  const ctx = resolveCtx(data, day)
  const out: Record<string, { status?: MarkStatus; at?: number; auto: boolean }> = {}
  for (const p of plan) {
    const q = data.quests.find((x) => x.id === p.id)
    if (q) out[p.id] = resolveMark(q, log, ctx)
    else {
      const m = log?.quests[p.id]
      out[p.id] = m ? { status: m.status, at: m.at, auto: false } : { auto: false }
    }
  }
  return out
}

export function bossHpFor(data: AppData, week: number): number {
  return weekDays(week).reduce((s, d) => s + planFor(data, d).filter((p) => p.role === 'main').length * XP.main, 0)
}

export function computeState(data: AppData, now: Date): GameState {
  const today = gameDayOf(now)
  const st: GameState = {
    today,
    hp: HP.start,
    fallen: false,
    recovery: 0,
    freezes: 0,
    perfectRun: 0,
    shards: 0,
    xp: 0,
    xpByStat: emptyStats(),
    chapterXp: { 0: 0, 1: 0, 2: 0, 3: 0 },
    chapterPenalty: { 0: 0, 1: 0, 2: 0, 3: 0 },
    days: {},
    hpByDay: {},
    xpByDay: {},
    bosses: {},
    trophies: [],
    falls: [],
    honestyStreak: 0,
    bestHonesty: 0,
    freezesEarned: 0,
    freezesUsed: 0,
    skillXp: {},
    flowStats: {},
  }
  const start = replayStartOf(data)
  if (!data.profile || today < start) return st

  const evalStart = evalStartOf(data)
  const events = new Map<DayKey, Ev[]>()
  const push = (e: Ev) => {
    if (e.day < start || e.day > today) return
    // warm-up: HP is never lost (or gained) before the arc
    if (e.day < ARC_START && e.hp) e = { ...e, hp: undefined }
    const list = events.get(e.day)
    if (list) list.push(e)
    else events.set(e.day, [e])
  }

  const dayInfo = new Map<DayKey, { plan: PlannedQuest[]; marks: Record<string, MarkStatus | undefined>; xp: number; shards: number; boss: number; crits: string[]; destinyWon: boolean }>()

  // quest completions
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const plan = planFor(data, d)
    const marks = marksFor(data, d, plan)
    const log = data.days[d]
    const flat: Record<string, MarkStatus | undefined> = {}
    const crits: string[] = []
    let destinyWon = false
    const dz = log?.destiny
    const inDestiny = (t: number | undefined) => !!dz && t !== undefined && t >= dz.startedAt && t <= dz.startedAt + dz.minutes * 60_000
    for (const p of plan) {
      const m = marks[p.id]
      flat[p.id] = m.status
      if (!isCompleted(m.status)) continue
      const q = data.quests.find((x) => x.id === p.id)
      const r = questReward(d, p, m.status)
      if (r.crit) crits.push(p.id)
      const dealTask = q?.kind === 'deal' ? data.tasks.find((t) => t.id === log?.dealTaskId) : undefined
      const dealPractice = q?.kind === 'deal' && log?.dealNodeId && !(dealTask?.doneDay === d) ? (data.practices ?? []).filter((x) => x.nodeId === log.dealNodeId && x.day === d).sort((a, b) => a.at - b.at)[0] : undefined
      const at = m.at ?? (dealTask?.doneDay === d ? dealTask.doneAt : undefined) ?? dealPractice?.at ?? dealTask?.doneAt ?? log?.confession?.at ?? dayStart(d).getTime()
      // «Планка»: +10% XP per step on a full completion
      const xp = m.status === 'done' ? Math.round(r.xp * barMult(data, p.id, d)) : r.xp
      push({
        day: d,
        at,
        xp,
        stat: p.stat,
        shards: r.shards,
        boss: p.role === 'main' || q?.kind === 'deal' ? r.baseXp : 0,
      })
      if (dz?.ref === 'quest' && dz.id === p.id && !m.auto && inDestiny(m.at)) {
        destinyWon = true
        push({ day: d, at: m.at!, shards: SHARDS.destiny })
      }
    }
    if (dz?.ref === 'task') {
      const t = data.tasks.find((x) => x.id === dz.id)
      if (t?.doneDay === d && inDestiny(t.doneAt)) {
        destinyWon = true
        push({ day: d, at: t.doneAt!, shards: SHARDS.destiny })
      }
    }
    dayInfo.set(d, { plan, marks: flat, xp: 0, shards: 0, boss: 0, crits, destinyWon })
    if (log?.confession) push({ day: d, at: log.confession.at, xp: XP.confession, stat: 'will', shards: SHARDS.confession })
  }

  // v0.4 «Поток»: tasks closed inside a valid flow give ×2 XP (boss damage stays base)
  const windows = flowWindows(data.flows)
  for (const t of data.tasks) {
    if (!t.doneAt || !t.doneDay) continue
    const xp = taskXp(data.tasks, t)
    const flow = xp ? flowAt(windows, t.doneAt) : undefined
    if (xp) push({ day: t.doneDay, at: t.doneAt, xp: flow ? xp * FLOW.mult : xp, stat: t.stat, boss: t.scope === 'deal' ? xp : 0, flow: flow?.id })
  }
  // v0.4 skills: practices, goals, «Сделал больше плана»
  for (const e of skillEvents(data, windows)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards, skill: e.skillId, flow: e.flowId })
  // v0.5 duel wins: once per settled duel, on the settlement day
  for (const e of duelEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: 'will', shards: e.shards })
  // v0.6 «Судьба дня» Плинко: full reward in time, half after the timer
  for (const e of plinkoEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards })
  // v0.7 «Заработано»: once a day into «Дело», by the order of the day's total
  for (const e of moneyEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: 'deal' })
  // «Утренняя инвестиция»: once per game day, when the program was finished
  for (const e of morningEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards })
  // v0.9 «Переход» before a plan block: once per block, at most TRANSITION.perDay a day
  for (const e of transitionEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat })
  for (const s of data.slips) {
    push({ day: s.day, at: s.at, hp: HP.slip })
    if (s.comebackAt && s.comebackAt >= s.at && s.comebackAt - s.at <= COMEBACK_WINDOW_MS) {
      push({ day: s.day, at: s.comebackAt, hp: HP.comeback, xp: XP.comeback, stat: 'will', shards: SHARDS.comeback })
    }
  }
  for (const c of data.cravings) {
    if (c.result === 'won') push({ day: c.day, at: c.at, xp: XP.craving, stat: 'will', shards: SHARDS.craving })
  }
  for (const p of data.pauses) {
    if (p.result === 'resisted') push({ day: p.day, at: p.at, xp: XP.pause, stat: 'will' })
  }
  for (const p of data.purchases) push({ day: p.day, at: p.at, shards: -p.price })

  const applyHp = (delta: number, day: DayKey, at: number) => {
    if (st.fallen || !delta) return
    st.hp = Math.max(0, Math.min(HP.max, st.hp + delta))
    if (st.hp === 0) {
      const ch = chapterOf(day)
      const rank = st.chapterXp[ch] - st.chapterPenalty[ch]
      const rankLost = Math.round(rank * 0.2)
      const shardsLost = st.shards - Math.floor(st.shards / 2)
      st.chapterPenalty[ch] += rankLost
      st.shards -= shardsLost
      st.fallen = true
      st.recovery = 0
      st.falls.push({ day, at, rankLost, shardsLost })
    }
  }

  let prevMissed = new Set<string>()
  const lastDay = today

  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    const info = dayInfo.get(d)!
    const evs = (events.get(d) ?? []).sort((a, b) => a.at - b.at)
    for (const e of evs) {
      if (e.xp) {
        st.xp += e.xp
        if (e.stat) st.xpByStat[e.stat] += e.xp
        st.chapterXp[chapterOf(d)] += e.xp
        st.xpByDay[d] = (st.xpByDay[d] ?? 0) + e.xp
        info.xp += e.xp
        if (e.skill) st.skillXp[e.skill] = (st.skillXp[e.skill] ?? 0) + e.xp
        if (e.flow) {
          const f = (st.flowStats[e.flow] ??= { closed: 0, xp: 0 })
          f.closed++
          f.xp += e.xp
        }
      }
      if (e.boss) info.boss += e.boss
      if (e.shards) {
        st.shards = Math.max(0, st.shards + e.shards)
        info.shards += e.shards
      }
      if (e.hp) applyHp(e.hp, d, e.at)
    }

    const log = data.days[d]
    const warmup = d < ARC_START
    const inEval = d >= evalStart && d <= ARC_END
    const closed = (warmup || inEval) && isDayClosed(data, d, now)
    const mains = info.plan.filter((p) => p.role === 'main')
    const missed = mains.filter((p) => !isCompleted(info.marks[p.id])).map((p) => p.id)
    const perfect = mains.length > 0 && missed.length === 0
    const res: DayResult = {
      day: d,
      closed,
      confession: !!log?.confession,
      retro: closed && !warmup && !log?.confession,
      warmup,
      frozen: false,
      perfect,
      plan: info.plan,
      marks: info.marks,
      missedMain: missed,
      closeHpDelta: 0,
      hpEnd: st.hp,
      xp: info.xp,
      shards: info.shards,
      bossDamage: info.boss,
      crits: info.crits,
      destinyWon: info.destinyWon,
      morning: morningDone(log),
    }

    if (closed && warmup) {
      // «Разминка»: the day closes for streaks and charts, nothing else changes
      prevMissed = new Set()
    } else if (closed) {
      const frozen = !!log?.freeze && missed.length > 0 && st.freezes > 0
      res.frozen = frozen
      let delta = 0
      if (frozen) {
        st.freezes--
        st.freezesUsed++
      } else {
        for (const id of missed) delta += prevMissed.has(id) ? HP.missTwice : HP.miss
        if (!log?.confession) delta += HP.noConfession
        if (perfect) delta += HP.perfect
      }
      res.closeHpDelta = delta
      const endAt = dayStart(addDays(d, 1)).getTime() - 1
      if (st.fallen) {
        if (!frozen) {
          st.recovery = perfect ? st.recovery + 1 : 0
          if (st.recovery >= HP.recoveryDays) {
            st.fallen = false
            st.hp = HP.recovered
            st.recovery = 0
          }
        }
        res.closeHpDelta = 0
      } else {
        applyHp(delta, d, endAt)
      }
      if (!frozen) {
        st.perfectRun = perfect ? st.perfectRun + 1 : 0
        if (st.perfectRun >= FREEZE.per) {
          st.perfectRun = 0
          if (st.freezes < FREEZE.max) {
            st.freezes++
            st.freezesEarned++
          }
        }
      }
      prevMissed = frozen ? new Set() : new Set(missed)

      if (weekday(d) === 6 && d <= ARC_END) {
        const w = weekOf(d)
        const hp = bossHpFor(data, w)
        const damage = weekDays(w).reduce((s, x) => s + (st.days[x]?.bossDamage ?? (x === d ? info.boss : 0)), 0)
        const won = hp > 0 && damage >= hp
        st.bosses[w] = { week: w, name: bossOf(w), hp, damage, done: true, won }
        if (won) {
          st.shards += SHARDS.boss
          res.shards += SHARDS.boss
          st.trophies.push(w)
        }
      }
    }
    res.hpEnd = st.hp
    st.days[d] = res
    st.hpByDay[d] = st.hp
  }

  // live boss for the current week
  if (today <= ARC_END) {
    const w = weekOf(today)
    if (!st.bosses[w]) {
      const damage = weekDays(w).reduce((s, x) => s + (st.days[x]?.bossDamage ?? 0), 0)
      const hp = bossHpFor(data, w)
      st.bosses[w] = { week: w, name: bossOf(w), hp, damage, done: false, won: damage >= hp && hp > 0 }
    }
  }

  // honesty streak: days in a row with a confession; open days don't break it
  let run = 0
  let best = 0
  for (let d = start; d <= today && d <= ARC_END; d = addDays(d, 1)) {
    const r = st.days[d]
    if (!r) continue
    if (r.confession) {
      run++
      best = Math.max(best, run)
    } else if (r.closed) run = 0
  }
  st.honestyStreak = run
  st.bestHonesty = best
  return st
}

export function chapterRank(st: GameState, ch: ChapterId): number {
  return Math.max(0, st.chapterXp[ch] - st.chapterPenalty[ch])
}

export function overallLevel(st: GameState) {
  return levelOf(st.xp)
}

/** Days that closed without a confession after the last acknowledgement */
export function unacknowledgedMissed(st: GameState, missedThrough?: DayKey): DayKey[] {
  return Object.values(st.days)
    .filter((r) => r.retro && (!missedThrough || r.day > missedThrough))
    .map((r) => r.day)
    .sort()
}

/** Closed days without a plan snapshot: the store freezes their quest list */
export function daysNeedingSnapshot(data: AppData, now: Date): DayKey[] {
  const today = gameDayOf(now)
  const out: DayKey[] = []
  if (!data.profile) return out
  for (let d = replayStartOf(data); d <= today && d <= ARC_END; d = addDays(d, 1)) {
    if (!data.days[d]?.plan && isDayClosed(data, d, now)) out.push(d)
  }
  return out
}
