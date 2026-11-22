/**
 * The whole game state is derived by replaying the stored log from the arc start.
 * Nothing derived is persisted, so editing the past or importing a backup is always consistent.
 */
import { LEVEL_UP_SHARDS, levelOf, levelTitle, sphereLevelOf } from './levels'
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
import { MAIN_BOSS_PRIZE, MAIN_MONEY_BOSS, moneyMonthEvents } from './moneyBosses'
import { morningDone, morningEvents } from './morning'
import { transitionEvents } from './plan'
import { dumpEvents } from './journal'
import { weekEvents } from './week'
import { questArea } from './areas'
import { SPHERE_PERKS, emptySpheres, hasPerk, sphereOfStat } from './spheres'
import { CONQUEROR, type ConquerorState } from './conqueror'
import { FLOW, barMult, flowAt, flowWindows, skillEvents } from './skills'
import {
  ARC_END,
  ARC_START,
  addDays,
  chapterOf,
  dayStart,
  gameDayOf,
  isPastDeadline,
} from './time'
import type { AppData, Area, ChapterId, DayKey, MarkStatus, PlannedQuest, StatId } from './types'

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
  /** quests that rolled CRITICAL ×1.5 */
  crits: string[]
  /** «Судьба дня» finished before the timer ran out */
  destinyWon: boolean
  /** «Утренняя инвестиция» finished */
  morning: boolean
}

/** Anti-farm caps per game day (v0.16) */
export const CAPS = { craving: 3, pause: 3, dailyTaskXp: 30 } as const

export interface LevelUp {
  level: number
  day: DayKey
  at: number
  shards: number
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
  falls: FallEvent[]
  honestyStreak: number
  bestHonesty: number
  freezesEarned: number
  freezesUsed: number
  /** v0.4: XP earned per skill */
  skillXp: Record<string, number>
  /** v0.4: what each flow session closed */
  flowStats: Record<string, { closed: number; xp: number }>
  /** v0.16 «Сферы»: XP per life area */
  xpBySphere: Record<Area, number>
  /** v0.16: every hero level reached in the replay (2…30), with its ❄ */
  levelUps: LevelUp[]
  /** v0.16: sphere perks reached, `${area}:${level}` */
  perks: string[]
  /** v0.16: freeze slots (2, 3 with «Здоровье 10») */
  freezeMax: number
  /** «Покоритель зимы»: perfect arc days towards the arc-end title (conqueror.ts) */
  conqueror: ConquerorState
  /** v0.17 «Боссы месяца»: every money boss kill (moneyBosses.ts MONEY_BOSSES id), per month */
  moneyKills: { month: string; id: string; day: DayKey; at: number }[]
}

interface Ev {
  day: DayKey
  at: number
  xp?: number
  stat?: StatId
  /** life area of the XP; missing = the area of the stat */
  sphere?: Area
  shards?: number
  hp?: number
  skill?: string
  flow?: string
  /** a money boss kill */
  mk?: { month: string; id: string }
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
    falls: [],
    honestyStreak: 0,
    bestHonesty: 0,
    freezesEarned: 0,
    freezesUsed: 0,
    skillXp: {},
    flowStats: {},
    xpBySphere: emptySpheres(),
    levelUps: [],
    perks: [],
    freezeMax: FREEZE.max,
    conqueror: { closed: 0, need: CONQUEROR.need, won: false },
    moneyKills: [],
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

  const dayInfo = new Map<DayKey, { plan: PlannedQuest[]; marks: Record<string, MarkStatus | undefined>; xp: number; shards: number; crits: string[]; destinyWon: boolean }>()

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
      push({ day: d, at, xp, stat: p.stat, sphere: q ? questArea(q) : undefined, shards: r.shards })
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
    dayInfo.set(d, { plan, marks: flat, xp: 0, shards: 0, crits, destinyWon })
    if (log?.confession) {
      push({ day: d, at: log.confession.at, xp: XP.confession, stat: 'will', shards: SHARDS.confession })
    }
  }

  // v0.4 «Поток»: tasks closed inside a valid flow give ×2 XP
  // v0.16: own («daily») tasks give at most CAPS.dailyTaskXp a day
  const windows = flowWindows(data.flows)
  const dailyUsed = new Map<DayKey, number>()
  for (const t of [...data.tasks].sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0) || (a.id < b.id ? -1 : 1))) {
    if (!t.doneAt || !t.doneDay) continue
    const base = taskXp(data.tasks, t)
    const flow = base ? flowAt(windows, t.doneAt) : undefined
    let xp = flow ? base * FLOW.mult : base
    if (t.scope === 'daily') {
      const used = dailyUsed.get(t.doneDay) ?? 0
      xp = Math.max(0, Math.min(xp, CAPS.dailyTaskXp - used))
      dailyUsed.set(t.doneDay, used + xp)
    }
    if (xp) push({ day: t.doneDay, at: t.doneAt, xp, stat: t.stat, flow: flow?.id })
  }
  // v0.4 skills: practices, goals, «Сделал больше плана»
  for (const e of skillEvents(data, windows)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards, skill: e.skillId, flow: e.flowId })
  // v0.5 duel wins: once per settled duel, on the settlement day
  for (const e of duelEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: 'will', shards: e.shards })
  // v0.6 «Судьба дня» Плинко: full reward in time, half after the timer
  for (const e of plinkoEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards })
  // v0.17 «Деньги»: 1 XP per $10 of the month, and the five «Боссы месяца» (every month again)
  {
    const m = moneyMonthEvents(data)
    for (const e of m.xp) push({ day: e.day, at: e.at, xp: e.xp, stat: 'deal' })
    for (const e of m.kills) push({ day: e.day, at: e.at, xp: e.xp, stat: 'deal', shards: e.shards, mk: { month: e.month, id: e.id } })
  }
  // «Утренняя инвестиция»: once per game day, when the program was finished
  for (const e of morningEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards })
  // v0.9 «Переход» before a plan block: once per block, at most TRANSITION.perDay a day
  for (const e of transitionEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat })
  // «Сферы» «Выброс мыслей»: a small bonus once a day, it never counts in the ring
  for (const e of dumpEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat })
  // «Неделя»: goals set for the week, a finished «Итог недели» (once per week each, in time)
  for (const e of weekEvents(data)) push({ day: e.day, at: e.at, xp: e.xp, stat: e.stat, shards: e.shards })
  for (const s of data.slips) {
    push({ day: s.day, at: s.at, hp: HP.slip })
    if (s.comebackAt && s.comebackAt >= s.at && s.comebackAt - s.at <= COMEBACK_WINDOW_MS) {
      push({ day: s.day, at: s.comebackAt, hp: HP.comeback, xp: XP.comeback, stat: 'will', shards: SHARDS.comeback })
    }
  }
  // v0.16 caps: self-reported wins pay at most CAPS.craving / CAPS.pause times a day
  const perDay = new Map<string, number>()
  const capped = (k: string, max: number) => {
    const n = (perDay.get(k) ?? 0) + 1
    perDay.set(k, n)
    return n <= max
  }
  for (const c of [...data.cravings].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))) {
    if (c.result !== 'won' || !capped(`c|${c.day}`, CAPS.craving)) continue
    push({ day: c.day, at: c.at, xp: XP.craving, stat: 'will', shards: SHARDS.craving })
  }
  for (const p of [...data.pauses].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))) {
    if (p.result === 'resisted' && capped(`p|${p.day}`, CAPS.pause)) push({ day: p.day, at: p.at, xp: XP.pause, stat: 'will' })
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
  let perfectArcDays = 0
  let level = 1
  const perkSeen = new Set<string>()

  const addShards = (n: number, info: { shards: number }) => {
    if (!n) return
    st.shards = Math.max(0, st.shards + n)
    info.shards += n
  }
  /** every XP goes through here: totals, spheres, hero level-ups (❄ once per level) and sphere perks */
  const gainXp = (d: DayKey, at: number, xp: number, info: { xp: number; shards: number }, stat?: StatId, sphere?: Area) => {
    st.xp += xp
    if (stat) st.xpByStat[stat] += xp
    st.chapterXp[chapterOf(d)] += xp
    st.xpByDay[d] = (st.xpByDay[d] ?? 0) + xp
    info.xp += xp
    const lvl = levelOf(st.xp).level
    while (level < lvl) {
      level++
      const sh = LEVEL_UP_SHARDS(level)
      addShards(sh, info)
      st.levelUps.push({ level, day: d, at, shards: sh })
    }
    const area = sphere ?? sphereOfStat(stat)
    if (!area) return
    st.xpBySphere[area] += xp
    const sl = sphereLevelOf(st.xpBySphere[area]).level
    for (const perk of SPHERE_PERKS[area]) {
      const key = `${area}:${perk.level}`
      if (sl < perk.level || perkSeen.has(key)) continue
      perkSeen.add(key)
      st.perks.push(key)
      addShards(perk.shards ?? 0, info)
    }
    st.freezeMax = FREEZE.max + (hasPerk(st.xpBySphere, 'health', 'freeze') ? 1 : 0)
  }

  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    const info = dayInfo.get(d)!
    const evs = (events.get(d) ?? []).sort((a, b) => a.at - b.at)
    for (const e of evs) {
      if (e.xp) {
        gainXp(d, e.at, e.xp, info, e.stat, e.sphere)
        if (e.skill) st.skillXp[e.skill] = (st.skillXp[e.skill] ?? 0) + e.xp
        if (e.flow) {
          const f = (st.flowStats[e.flow] ??= { closed: 0, xp: 0 })
          f.closed++
          f.xp += e.xp
        }
      }
      if (e.mk) st.moneyKills.push({ ...e.mk, day: d, at: e.at })
      if (e.shards) addShards(e.shards, info)
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
          if (st.freezes < st.freezeMax) {
            st.freezes++
            st.freezesEarned++
          }
        }
      }
      prevMissed = frozen ? new Set() : new Set(missed)

      if (d === ARC_END) {
        // «Покоритель зимы»: the arc closed with ≥ CONQUEROR.need perfect days
        st.conqueror.won = perfectArcDays + (perfect ? 1 : 0) >= CONQUEROR.need
        if (st.conqueror.won) {
          addShards(CONQUEROR.shards, info)
          gainXp(d, endAt, CONQUEROR.xp, info)
        }
        res.xp = info.xp
        res.shards = info.shards
      }
    }
    res.hpEnd = st.hp
    if (perfect && d >= ARC_START && d <= ARC_END) perfectArcDays++
    st.days[d] = res
    st.hpByDay[d] = st.hp
  }

  st.conqueror.closed = perfectArcDays

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

/** Hero titles, the most prestigious first: «Покоритель зимы», the $10k one, then the level title */
export function heroTitles(st: Pick<GameState, 'xp' | 'conqueror' | 'moneyKills'>): string[] {
  const out: string[] = []
  if (st.conqueror?.won) out.push(CONQUEROR.title)
  if (st.moneyKills.some((k) => k.id === MAIN_MONEY_BOSS.id)) out.push(MAIN_BOSS_PRIZE.title)
  out.push(levelTitle(levelOf(st.xp).level))
  return out
}

export const heroTitle = (st: Pick<GameState, 'xp' | 'conqueror' | 'moneyKills'>) => heroTitles(st)[0]

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
