/**
 * v0.16 bosses: a weakness per weekly boss, the cap on task damage, rewards and «Весенний босс».
 * Pure tables and helpers; the replay (replay.ts) applies them.
 *
 * Damage: main quests and «Дело дня» hit for their base XP; a quest of the boss's weakness hits ×2
 * whatever its role (a side quest too). Deal-tree tasks hit for their XP, but tasks deal at most a third
 * of the boss HP a week. Some weaknesses are not quests: a confession without sugar or without cola
 * after 14:00, «Переход», «Утренняя инвестиция», a won «Тяга», a week goal done.
 * A boss that survives its week «уходит к финальному»: half of its HP left joins «Весенний босс».
 */
import { ARC_WEEKS, BOSSES } from './time'

export type WeakSource = 'tasks' | 'sugar' | 'cola' | 'transition' | 'morning' | 'craving' | 'goals'

export interface Weakness {
  /** quest ids that hit ×2 */
  quests: string[]
  /** other sources that hit (×2 of their XP, or a fixed hit) */
  extra?: WeakSource[]
  /** «Слабость: …» on the boss card */
  label: string
}

/** by arc week, 1-based */
export const BOSS_WEAKNESS: Record<number, Weakness> = {
  1: { quests: ['deal'], extra: ['transition'], label: 'Дело дня и переходы плана' },
  2: { quests: ['wake', 'bedtime'], label: 'подъём и отбой вовремя' },
  3: { quests: ['phone', 'reels'], label: 'телефон до сна и рилсы в лимите' },
  4: { quests: ['caffeine', 'bedtime'], label: 'кофеин до 14:00 и отбой' },
  5: { quests: ['deal'], extra: ['tasks'], label: 'Дело дня и задачи' },
  6: { quests: ['reels'], extra: ['craving'], label: 'рилсы в лимите и побеждённая тяга' },
  7: { quests: [], extra: ['sugar'], label: 'исповедь «сахара не было»' },
  8: { quests: ['workout', 'steps'], extra: ['transition'], label: 'тренировка, шаги и переходы' },
  9: { quests: ['caffeine'], extra: ['cola'], label: 'кофеин до 14:00 и «колы после 14 нет»' },
  10: { quests: ['deal'], extra: ['goals'], label: 'Дело дня и цели недели' },
  11: { quests: ['light', 'meditation'], extra: ['morning'], label: 'свет, медитация и утренняя зарядка' },
  12: { quests: ['deal'], extra: ['tasks'], label: 'Дело дня и задачи' },
  13: { quests: ['deal'], extra: ['goals', 'tasks'], label: 'Дело дня, задачи и цели недели' },
  14: { quests: [], label: 'нет — бьёт всё, что бьёт всегда' },
}

export const FINAL_WEEK = ARC_WEEKS

export const BOSS_RULES = {
  /** a quest of the weakness hits this many times its base XP */
  weakMult: 2,
  /** tasks deal at most this share of the boss HP a week */
  taskShare: 1 / 3,
  /** fixed hit of a confession answer weakness (sugar / cola) */
  answerHit: 40,
  /** fixed hit of a done week goal */
  goalHit: 40,
  /** share of a surviving boss's HP left that joins the final boss */
  carry: 0.5,
} as const

export const BOSS_WIN = { xp: 100, shards: 15 } as const
export const FINAL_WIN = { xp: 300, shards: 50, title: 'Покоритель зимы' } as const

export const weaknessOf = (week: number): Weakness => BOSS_WEAKNESS[week] ?? { quests: [], label: '' }

export const isWeakQuest = (week: number, questId: string) => weaknessOf(week).quests.includes(questId)

export const hasWeak = (week: number, src: WeakSource) => !!weaknessOf(week).extra?.includes(src)

/** Task damage cap of a week */
export const taskCap = (hp: number) => Math.floor(hp * BOSS_RULES.taskShare)

/** HP a lost boss passes to the final one */
export const carryOf = (hp: number, damage: number) => Math.round(Math.max(0, hp - damage) * BOSS_RULES.carry)

export const FINAL_BOSS = BOSSES[ARC_WEEKS - 1]
