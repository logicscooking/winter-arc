/**
 * v0.5 «Дуэли в пати» without a schema change: the challenge, the acceptance and each side's score
 * travel inside public_stats.payload. Pure rules only; the winner is computed on the client from both
 * payloads and stored once in the local duel record, so the replay gives the win reward deterministically.
 */
import { isCompleted } from './quests'
import type { GameState } from './replay'
import { addDays } from './time'
import type { AppData, DayKey, Duel, DuelResult } from './types'

export const DUEL = {
  days: 3,
  acceptMs: 24 * 3600_000,
  /** active duels a person can have at once */
  maxActive: 2,
  /** published scores are kept a few days after the end so the other side can settle */
  keepDays: 3,
  xp: 30,
  shards: 5,
} as const

/** What goes to public_stats.payload.duels: ids, the window and the own score per day. Nothing private. */
export interface DuelPub {
  id: string
  by: string
  with: string
  start: DayKey
  days: number
  metric: 'quests'
  /** challenge time, ms */
  at: number
  /** closed quests per window day, own statistics, only days that already started */
  sc: number[]
}

export type DuelStatus = 'pending' | 'expired' | 'declined' | 'soon' | 'running' | 'ended' | 'done'

export const duelEnd = (d: Pick<Duel, 'start' | 'days'>): DayKey => addDays(d.start, d.days - 1)
export const opponentOf = (d: Pick<Duel, 'by' | 'with'>, meId: string) => (d.by === meId ? d.with : d.by)
const windowDays = (d: Pick<Duel, 'start' | 'days'>) => Array.from({ length: d.days }, (_, i) => addDays(d.start, i))

// ---------- validation of someone else's data ----------

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A friend's duels from their public stats: anything malformed is dropped, numbers are clamped. */
export function safeDuels(raw: unknown): DuelPub[] {
  if (!Array.isArray(raw)) return []
  const out: DuelPub[] = []
  for (const r of raw.slice(0, 6)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const x = r as Record<string, unknown>
    if (typeof x.id !== 'string' || !ID_RE.test(x.id)) continue
    if (typeof x.by !== 'string' || !ID_RE.test(x.by) || typeof x.with !== 'string' || !ID_RE.test(x.with) || x.by === x.with) continue
    if (typeof x.start !== 'string' || !DAY_RE.test(x.start)) continue
    if (x.metric !== 'quests') continue
    const days = Number(x.days)
    if (!Number.isInteger(days) || days < 1 || days > 7) continue
    const at = Number(x.at)
    if (!Number.isFinite(at) || at <= 0) continue
    const sc = (Array.isArray(x.sc) ? x.sc : []).slice(0, days).map((v) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(0, Math.min(30, Math.round(n))) : 0
    })
    if (out.some((o) => o.id === x.id)) continue
    out.push({ id: x.id, by: x.by, with: x.with, start: x.start, days, metric: 'quests', at, sc })
  }
  return out
}

// ---------- own score ----------

/** Closed quests (done or mini) per window day, up to today. Own statistics from the replay. */
export function duelScores(game: Pick<GameState, 'days' | 'today'>, d: Pick<Duel, 'start' | 'days'>): number[] {
  const out: number[] = []
  for (const day of windowDays(d)) {
    if (day > game.today) break
    const r = game.days[day]
    out.push(r ? r.plan.filter((p) => isCompleted(r.marks[p.id])).length : 0)
  }
  return out
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

// ---------- status ----------

export function isAccepted(d: Duel, theirs: DuelPub[] | undefined): boolean {
  return !!d.acceptedAt || !!theirs?.some((p) => p.id === d.id)
}

export function duelStatus(d: Duel, theirs: DuelPub[] | undefined, now: number, today: DayKey): DuelStatus {
  if (d.result) return 'done'
  if (d.declined) return 'declined'
  if (!isAccepted(d, theirs)) return now - d.createdAt > DUEL.acceptMs ? 'expired' : 'pending'
  if (today < d.start) return 'soon'
  if (today <= duelEnd(d)) return 'running'
  return 'ended'
}

const LIVE: DuelStatus[] = ['pending', 'soon', 'running', 'ended']

/** Duels that still occupy a slot: waiting for an answer, about to start, running or not settled yet */
export function activeDuels(duels: Duel[] | undefined, theirsOf: (otherId: string) => DuelPub[] | undefined, meId: string, now: number, today: DayKey): Duel[] {
  return (duels ?? []).filter((d) => LIVE.includes(duelStatus(d, theirsOf(opponentOf(d, meId)), now, today)))
}

/** A friend's own published duels that are still live from their side */
export function liveDuelsOf(pubs: DuelPub[], today: DayKey): DuelPub[] {
  return pubs.filter((p) => today <= addDays(p.start, p.days - 1))
}

export type ChallengeCheck = { ok: true } | { ok: false; reason: string }

/** 1 active duel per pair, 2 per person: checked on both sides (my local duels, their published ones) */
export function canChallenge(mine: Duel[] | undefined, meId: string, otherId: string, theirs: DuelPub[], theirsOf: (otherId: string) => DuelPub[] | undefined, now: number, today: DayKey): ChallengeCheck {
  if (!otherId || otherId === meId) return { ok: false, reason: 'С собой не дерутся' }
  const active = activeDuels(mine, theirsOf, meId, now, today)
  if (active.some((d) => opponentOf(d, meId) === otherId)) return { ok: false, reason: 'С этим другом уже идёт дуэль' }
  const answered = (id: string) => (mine ?? []).some((d) => d.id === id && (d.result || d.declined))
  if (liveDuelsOf(theirs, today).some((p) => (p.by === meId || p.with === meId) && !answered(p.id) && (p.by !== meId || now - p.at <= DUEL.acceptMs || (mine ?? []).some((d) => d.id === p.id))))
    return { ok: false, reason: 'С этим другом уже идёт дуэль' }
  if (active.length >= DUEL.maxActive) return { ok: false, reason: `У тебя уже ${DUEL.maxActive} дуэли. Доиграй одну` }
  if (liveDuelsOf(theirs, today).length >= DUEL.maxActive) return { ok: false, reason: `У друга уже ${DUEL.maxActive} дуэли` }
  return { ok: true }
}

/** New challenge: the window starts on the next game day, so both sides get full days */
export function newDuel(id: string, meId: string, otherId: string, today: DayKey, now: number): Duel {
  return { id, by: meId, with: otherId, start: addDays(today, 1), days: DUEL.days, metric: 'quests', createdAt: now }
}

/** Challenges a friend published to me that I have not answered yet and that did not expire */
export function incomingChallenges(friendId: string, pubs: DuelPub[], mine: Duel[] | undefined, meId: string, now: number): DuelPub[] {
  return pubs.filter((p) => p.by === friendId && p.with === meId && now - p.at <= DUEL.acceptMs && !(mine ?? []).some((d) => d.id === p.id))
}

/** Accepting copies the challenge; only the acceptance moment is mine */
export function acceptedFrom(p: DuelPub, now: number): Duel {
  return { id: p.id, by: p.by, with: p.with, start: p.start, days: p.days, metric: 'quests', createdAt: p.at, acceptedAt: now }
}

/**
 * Ready to settle once my last day is closed and the other side has published a snapshot made after
 * the window (or two days passed, then their last known score counts).
 */
export function readyToSettle(d: Duel, myEndClosed: boolean, theirDay: DayKey | undefined, today: DayKey): boolean {
  const end = duelEnd(d)
  if (today <= end || !myEndClosed) return false
  return (!!theirDay && theirDay > end) || today >= addDays(end, 2)
}

export function settle(mine: number[], theirs: number[], day: DayKey, at: number): DuelResult {
  const me = sum(mine)
  const them = sum(theirs)
  return { me, them, outcome: me > them ? 'win' : me < them ? 'loss' : 'draw', day, at }
}

/** Published part: live and recently finished duels with my score, never declined or expired ones */
export function publicDuels(data: Pick<AppData, 'duels'>, game: Pick<GameState, 'days' | 'today'>, now: number): DuelPub[] {
  const today = game.today
  return (data.duels ?? [])
    .filter((d) => !d.declined && !(d.result && addDays(duelEnd(d), DUEL.keepDays) < today))
    // a challenge nobody accepted in 24 h is gone
    .filter((d) => d.acceptedAt || d.result || now - d.createdAt <= DUEL.acceptMs)
    .slice(-4)
    .map((d) => ({ id: d.id, by: d.by, with: d.with, start: d.start, days: d.days, metric: 'quests' as const, at: d.createdAt, sc: duelScores(game, d) }))
}

export interface DuelEvent {
  id: string
  day: DayKey
  at: number
  xp: number
  shards: number
}

/** Win rewards for the replay: one per settled duel id */
export function duelEvents(data: Pick<AppData, 'duels'>): DuelEvent[] {
  const seen = new Set<string>()
  const out: DuelEvent[] = []
  for (const d of data.duels ?? []) {
    if (seen.has(d.id) || d.result?.outcome !== 'win') continue
    seen.add(d.id)
    out.push({ id: d.id, day: d.result.day, at: d.result.at, xp: DUEL.xp, shards: DUEL.shards })
  }
  return out
}
