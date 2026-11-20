/**
 * v0.5 «Шанс ранга»: a deterministic estimate of taking the next skill rank in 30 days.
 * No AI, a formula from the stored log:
 *   - practice pace of the last 14 days (a practice with feedback weighs 1, without — 0.5),
 *     projected over 30 days onto the tree (each practice goes to the node closest to its next stage);
 *   - goal pace of the last 14 days (short ticks, closed mids and longs) and the 60/30/10 balance;
 *   - strikes of the repeat goals.
 * Result is clamped to 1–99%: nothing is certain, nothing is hopeless.
 */
import { GOAL_BALANCE, LEVEL_AT, RANKS, hasFeedback, nodeProgress, rankIndexOfLevel, skillLevelOf } from './skills'
import type { Rank, SkillView } from './skills'
import { addDays } from './time'
import type { AppData, DayKey, Goal, Practice, SkillNode } from './types'

export const CHANCE = { window: 14, horizon: 30, maxSim: 240, min: 1, max: 99 } as const

export interface ChanceInput {
  /** weighted practices of the last 14 days */
  pace: number
  /** short ticks + 2 × mids + 4 × longs closed in the last 14 days */
  goalPace: number
  /** 0..1, how close the open goals are to 60/30/10 (0.5 = no data) */
  balance: number
  strikes: number
  /** points the projected practices would add */
  gain: number
  /** points still needed for the next rank */
  need: number
  /** points between the start of the current rank and the next one */
  span: number
}

export interface RankChance {
  target: Rank
  pct: number
  input: ChanceInput
  hints: { text: string; delta: number }[]
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** The core formula. Monotone: more pace, goal pace, balance or gain never lowers it; more strikes never raise it. */
export function chancePct(i: Pick<ChanceInput, 'goalPace' | 'balance' | 'strikes' | 'gain' | 'need' | 'span'>): number {
  if (i.need <= 0) return CHANCE.max
  if (!Number.isFinite(i.need) || !Number.isFinite(i.span) || i.span <= 0) return CHANCE.min
  // where the projection lands inside the current rank: 0 = its start, 1 = the next rank
  const x = (Math.max(0, i.span - i.need) + Math.max(0, i.gain)) / i.span
  let logit = 4 * (Math.min(x, 3) - 1)
  logit += 0.9 * (Math.min(1, Math.max(0, i.goalPace) / 6) - 0.3)
  logit += 0.6 * (Math.min(1, Math.max(0, i.balance)) - 0.5)
  logit -= 0.6 * Math.max(0, i.strikes)
  const p = Math.round(100 * sigmoid(logit))
  return Math.max(CHANCE.min, Math.min(CHANCE.max, p))
}

export function weightedPace(practices: Practice[], today: DayKey): number {
  const from = addDays(today, -(CHANCE.window - 1))
  return practices.filter((p) => p.day >= from && p.day <= today).reduce((s, p) => s + (hasFeedback(p) ? 1 : 0.5), 0)
}

export function goalPace(goals: Goal[], today: DayKey): number {
  const from = addDays(today, -(CHANCE.window - 1))
  let n = 0
  for (const g of goals) {
    if (g.type === 'short') n += new Set((g.checks ?? []).filter((c) => c.day >= from && c.day <= today).map((c) => c.day)).size
    else if (g.type === 'mid' && g.doneDay && g.doneDay >= from && g.doneDay <= today) n += 2
    else if (g.type === 'long' && g.doneDay && g.doneDay >= from && g.doneDay <= today) n += 4
  }
  return n
}

/** 1 = exactly 60/30/10 among open short/mid/long goals, 0 = as far as it gets; 0.5 without goals */
export function balanceScore(goals: Goal[]): number {
  const open = goals.filter((g) => !g.archived && !g.doneAt && g.type !== 'repeat')
  if (!open.length) return 0.5
  const share = (t: 'short' | 'mid' | 'long') => open.filter((g) => g.type === t).length / open.length
  const dist = Math.abs(share('short') - GOAL_BALANCE.short) + Math.abs(share('mid') - GOAL_BALANCE.mid) + Math.abs(share('long') - GOAL_BALANCE.long)
  return Math.max(0, 1 - dist / 1.8)
}

/** Points the tree gains from `k` more practices with feedback, each on the node closest to its next stage */
export function projectedGain(nodes: Pick<SkillNode, 'id' | 'order'>[], practices: Practice[], k: number, today: DayKey): number {
  if (!nodes.length || k <= 0) return 0
  const lists = new Map<string, Practice[]>(nodes.map((n) => [n.id, practices.filter((p) => p.nodeId === n.id)]))
  const prog = new Map(nodes.map((n) => [n.id, nodeProgress(lists.get(n.id)!)]))
  const before = [...prog.values()].reduce((s, p) => s + p.stage, 0)
  let at = practices.reduce((m, p) => Math.max(m, p.at), 0)
  const n = Math.min(CHANCE.maxSim, Math.round(k))
  for (let i = 0; i < n; i++) {
    let best: { id: string; dist: number; order: number } | undefined
    for (const node of nodes) {
      const pr = prog.get(node.id)!
      if (pr.stage >= 4) continue
      // feedback debt counts as distance too: it must be paid before the stage can grow
      const dist = Math.max(1, pr.toNext) + Math.max(0, pr.count - 2 * pr.feedback)
      if (!best || dist < best.dist || (dist === best.dist && node.order < best.order)) best = { id: node.id, dist, order: node.order }
    }
    if (!best) break
    const list = lists.get(best.id)!
    list.push({ id: `~proj${i}`, skillId: '', nodeId: best.id, day: today, at: ++at, note: 'proj' })
    prog.set(best.id, nodeProgress(list))
  }
  return [...prog.values()].reduce((s, p) => s + p.stage, 0) - before
}

/** Points of the next displayed rank and of the current one (rank drops from strikes count) */
export function pointsToNextRank(view: Pick<SkillView, 'points' | 'rank' | 'strikes'>): { target: Rank; need: number; threshold: number; floor: number } | null {
  const idx = RANKS.indexOf(view.rank)
  if (idx >= RANKS.length - 1) return null
  const target = RANKS[idx + 1]
  const baseIdx = idx + 1 + view.strikes.drops
  if (baseIdx > 4) return { target, need: Infinity, threshold: Infinity, floor: 0 }
  // the lowest level whose rank index is `ri`
  const minLevel = (ri: number) => {
    let level = 1
    while (level < 10 && rankIndexOfLevel(level) < ri) level++
    return level
  }
  const threshold = LEVEL_AT[minLevel(baseIdx) - 1]
  const floor = Math.min(view.points, LEVEL_AT[minLevel(baseIdx - 1) - 1])
  return { target, need: Math.max(0, threshold - view.points), threshold, floor }
}

const treePoints = (nodes: Pick<SkillNode, 'id'>[], practices: Practice[]) => nodes.reduce((s, n) => s + nodeProgress(practices.filter((p) => p.nodeId === n.id)).stage, 0)

/** Everything for the card: the % and 2–3 «+N%» hints, each a concrete next action */
export function rankChance(data: AppData, view: SkillView, today: DayKey): RankChance | null {
  const next = pointsToNextRank(view)
  if (!next) return null
  const skillId = view.skill.id
  const practices = (data.practices ?? []).filter((p) => p.skillId === skillId)
  const goals = (data.goals ?? []).filter((g) => g.skillId === skillId && !g.archived)
  const nodes = (data.nodes ?? []).filter((n) => n.skillId === skillId)
  const scale = CHANCE.horizon / CHANCE.window

  const build = (extraPractices: Practice[], extraGoalPace: number, strikes: number): ChanceInput => {
    const list = [...practices, ...extraPractices]
    const pace = weightedPace(list, today)
    const pts = extraPractices.length ? treePoints(nodes, list) : view.points
    return {
      pace,
      goalPace: goalPace(goals, today) + extraGoalPace,
      balance: balanceScore(goals),
      strikes,
      gain: projectedGain(nodes, list, pace * scale, today),
      need: Math.max(0, next.threshold - pts),
      span: next.threshold - next.floor,
    }
  }
  const input = build([], 0, view.strikes.strikes)
  const pct = chancePct(input)

  const lastAt = practices.reduce((m, p) => Math.max(m, p.at), 0)
  const fake = (n: number, note?: string): Practice[] =>
    Array.from({ length: n }, (_, i) => ({ id: `~hint${i}`, skillId, nodeId: nodes[i % Math.max(1, nodes.length)]?.id ?? '', day: today, at: lastAt + i + 1, ...(note ? { note } : {}) }))
  const hints: { text: string; delta: number }[] = []
  const add = (text: string, i: ChanceInput) => {
    const d = chancePct(i) - pct
    if (d >= 1) hints.push({ text, delta: d })
  }
  if (nodes.length) add('3 практики с отзывом', build(fake(3, 'hint'), 0, view.strikes.strikes))
  if (goals.some((g) => g.type === 'short')) add('закрой 2 кратких цели', build([], 2, view.strikes.strikes))
  if (goals.some((g) => g.type === 'mid' && !g.doneAt)) add('закрой среднюю цель', build([], 2, view.strikes.strikes))
  if (view.strikes.strikes > 0) add('закрой неделю повторяющейся цели без пропуска', build([], 0, view.strikes.strikes - 1))
  const noFb = practices.filter((p) => !hasFeedback(p) && p.day >= addDays(today, -(CHANCE.window - 1))).length
  if (noFb >= 2) {
    // the same pace, every practice weighing 1: more projected practices with feedback
    const pace = weightedPace(practices.map((p) => (hasFeedback(p) ? p : { ...p, note: 'отзыв' })), today)
    add('пиши отзыв к каждой практике', { ...input, pace, gain: projectedGain(nodes, practices, pace * scale, today) })
  }
  hints.sort((a, b) => b.delta - a.delta || (a.text < b.text ? -1 : 1))
  return { target: next.target, pct, input, hints: hints.slice(0, 3) }
}

/** level the projection lands on, for tests and the tooltip */
export const projectedLevel = (points: number, gain: number) => skillLevelOf(points + gain)
