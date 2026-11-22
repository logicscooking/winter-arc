/**
 * v0.16 «Сферы» on «Герой»: the five stats fold into the four life areas of «Сегодня».
 * Quests count by their area (areas.ts questArea), every other XP source by its stat.
 * Each sphere has its own level (levels.ts sphereLevelOf) and a small perk at 5 / 10 / 15.
 * Perks are cosmetic or tiny and replay deterministically: ❄ once, a frame, at most one rule per sphere.
 */
import { AREAS } from './areas'
import { sphereLevelOf } from './levels'
import type { Area, StatId } from './types'

export const SPHERES = AREAS

export const STAT_SPHERE: Record<StatId, Area> = { energy: 'health', body: 'health', deal: 'money', mind: 'growth', will: 'misc' }

export const sphereOfStat = (stat: StatId | undefined): Area | undefined => (stat ? STAT_SPHERE[stat] : undefined)

export const sphereTitle = (a: Area) => AREAS.find((x) => x.id === a)?.title ?? a

/** The stat a skill / task of a sphere gets when picked by sphere in the UI */
export const SPHERE_STAT: Record<Area, StatId> = { health: 'body', money: 'deal', growth: 'mind', misc: 'will' }

export const emptySpheres = (): Record<Area, number> => ({ health: 0, money: 0, growth: 0, misc: 0 })

export type SpherePerkKind = 'shards' | 'freeze' | 'dopamine' | 'chest' | 'frame'

export interface SpherePerk {
  level: 5 | 10 | 15
  kind: SpherePerkKind
  /** ❄ given once, when the level is reached */
  shards?: number
  title: string
}

/** L5: +25 ❄; L10: one small rule (or ❄ for «Разное»); L15: +100 ❄ and the gold frame of the sphere */
export const SPHERE_PERKS: Record<Area, SpherePerk[]> = {
  health: [
    { level: 5, kind: 'shards', shards: 25, title: '+25 ❄' },
    { level: 10, kind: 'freeze', title: '+1 заморозка в запас (до 3)' },
    { level: 15, kind: 'frame', shards: 100, title: 'Золотая рамка и +100 ❄' },
  ],
  money: [
    { level: 5, kind: 'shards', shards: 25, title: '+25 ❄' },
    { level: 10, kind: 'dopamine', title: 'Дофамин в магазине −10%' },
    { level: 15, kind: 'frame', shards: 100, title: 'Золотая рамка и +100 ❄' },
  ],
  growth: [
    { level: 5, kind: 'shards', shards: 25, title: '+25 ❄' },
    { level: 10, kind: 'chest', title: 'Сундук за ❄ дешевле на 20' },
    { level: 15, kind: 'frame', shards: 100, title: 'Золотая рамка и +100 ❄' },
  ],
  misc: [
    { level: 5, kind: 'shards', shards: 25, title: '+25 ❄' },
    { level: 10, kind: 'shards', shards: 50, title: '+50 ❄' },
    { level: 15, kind: 'frame', shards: 100, title: 'Золотая рамка и +100 ❄' },
  ],
}

export function sphereLevels(xp: Record<Area, number>): Record<Area, number> {
  return { health: sphereLevelOf(xp.health).level, money: sphereLevelOf(xp.money).level, growth: sphereLevelOf(xp.growth).level, misc: sphereLevelOf(xp.misc).level }
}

export function hasPerk(xp: Record<Area, number> | undefined, area: Area, kind: SpherePerkKind): boolean {
  if (!xp) return false
  const lvl = sphereLevelOf(xp[area] ?? 0).level
  return SPHERE_PERKS[area].some((p) => p.kind === kind && lvl >= p.level)
}

/** The sphere that lags: the lowest XP, only when it is clearly behind the best one (under half) */
export function laggingSphere(xp: Record<Area, number>): Area | null {
  const list = SPHERES.map((s) => s.id)
  const best = Math.max(...list.map((a) => xp[a]))
  if (best < 200) return null
  const low = list.reduce((m, a) => (xp[a] < xp[m] ? a : m), list[0])
  return xp[low] < best / 2 ? low : null
}
