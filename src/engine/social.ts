/**
 * What friends see. Pure builders for the public snapshot and the party feed.
 * Privacy rule: nothing here may read confession text, measurements, slip reasons or notes,
 * review answers, check-in ratings or screen-time numbers.
 */
import { questStreak } from './analysis'
import { wornOutfit } from './avatar'
import { levelOf } from './levels'
import { COMEBACK_WINDOW_MS, isCompleted } from './quests'
import { marksFor, planFor } from './replay'
import type { GameState } from './replay'
import { activeSkills, skillView } from './skills'
import { publicDuels } from './duels'
import type { DuelPub } from './duels'
import { ARC_START, chapterOf, gameDayOf, weekDays } from './time'
import type { AppData, DayKey, Outfit, SlipWhat } from './types'

export type ShareKey = 'slips' | 'perfect' | 'boss' | 'level' | 'book'
export const SHARE_KEYS: ShareKey[] = ['slips', 'perfect', 'boss', 'level', 'book']
export const SHARE_LABEL: Record<ShareKey, { title: string; hint: string }> = {
  slips: { title: 'Срывы и камбэки', hint: 'Только категория: «рилсы», «шоколад». Причина и заметка — никогда' },
  perfect: { title: 'Идеальные дни', hint: 'Все главные квесты закрыты' },
  boss: { title: 'Побеждённые боссы', hint: 'Итог недели' },
  level: { title: 'Новый уровень', hint: 'Общий уровень персонажа' },
  book: { title: 'Дочитанные книги', hint: 'Название книги' },
}

export function shareSettings(data: Pick<AppData, 'settings'>): Record<ShareKey, boolean> {
  const s = data.settings.share ?? {}
  return Object.fromEntries(SHARE_KEYS.map((k) => [k, s[k] ?? true])) as Record<ShareKey, boolean>
}

/** 2-minute swaps that may appear in the feed; a custom swap is the user's own text and stays private */
export const PRESET_SWAPS = ['10 отжиманий', '2 страницы', 'Стакан воды', 'Выйти на свет']

export type FeedKind = 'slip' | 'comeback' | 'perfect' | 'boss' | 'level' | 'book' | 'check' | 'join'

export interface FeedDraft {
  kind: FeedKind
  key: string
  payload: Record<string, unknown>
  at: number
}

// ---------- public snapshot ----------

export interface PublicStats {
  v: 1
  /** game day the snapshot describes */
  day: DayKey
  level: number
  xp: number
  hp: number
  fallen: boolean
  warmup: boolean
  chapter: number
  /** today's quests in plan order: M/m main lit/unlit, S/s side lit/unlit */
  bulbs: string
  mainDone: number
  mainTotal: number
  confessed: boolean
  /** «X из 7» per main quest */
  mains: { t: string; n: number }[]
  honesty: number
  freezes: number
  boss: { week: number; name: string; hp: number; damage: number; won: boolean } | null
  /** worn pixel-hero look (owned gear only). Missing in snapshots from older app versions */
  outfit?: Outfit
  /** v0.4: active skills, title and rank only. «Кайф», notes and feedback stay private */
  skills?: { t: string; r: string }[]
  /** v0.5 duels: ids, window and own closed-quests score per day. Friends validate it with safeDuels */
  duels?: DuelPub[]
  at: number
}

/** Frozen days of the replay: they never give strikes */
export function frozenDays(game: GameState): Set<DayKey> {
  return new Set(Object.values(game.days).filter((r) => r.frozen).map((r) => r.day))
}

export function publicSkills(data: AppData, game: GameState): { t: string; r: string }[] {
  const frozen = frozenDays(game)
  return activeSkills(data).map((s) => ({ t: s.title.slice(0, 40), r: skillView(data, s.id, game.today, frozen)?.rank ?? 'D' }))
}

export function buildPublicStats(data: AppData, game: GameState, now: Date): PublicStats {
  const today = game.today
  const plan = planFor(data, today)
  const marks = marksFor(data, today, plan)
  const mains = plan.filter((p) => p.role === 'main')
  const bulbs = plan.map((p) => {
    const on = isCompleted(marks[p.id]?.status)
    return p.role === 'main' ? (on ? 'M' : 'm') : on ? 'S' : 's'
  })
  const bossWeek = Object.values(game.bosses).sort((a, b) => b.week - a.week)[0]
  const level = levelOf(game.xp).level
  return {
    v: 1,
    day: today,
    level,
    xp: game.xp,
    hp: game.hp,
    fallen: game.fallen,
    warmup: today < ARC_START,
    chapter: chapterOf(today),
    bulbs: bulbs.join(''),
    mainDone: mains.filter((p) => isCompleted(marks[p.id]?.status)).length,
    mainTotal: mains.length,
    confessed: !!data.days[today]?.confession,
    mains: mains.map((p) => ({
      t: (data.quests.find((q) => q.id === p.id)?.title ?? p.id).slice(0, 40),
      n: questStreak(game, p.id, today).last7,
    })),
    honesty: game.honestyStreak,
    freezes: game.freezes,
    boss: bossWeek ? { week: bossWeek.week, name: bossWeek.name, hp: bossWeek.hp, damage: bossWeek.damage, won: bossWeek.won } : null,
    outfit: wornOutfit(data.profile?.outfit, level, data.purchases),
    ...(activeSkills(data).length ? { skills: publicSkills(data, game) } : {}),
    ...(() => {
      const duels = publicDuels(data, game, now.getTime())
      return duels.length ? { duels } : {}
    })(),
    at: now.getTime(),
  }
}

/** Snapshot without the timestamp: used to skip pushes when nothing visible changed */
export function statsSignature(s: PublicStats): string {
  const { at: _at, ...rest } = s
  void _at
  return JSON.stringify(rest)
}

// ---------- feed ----------

export interface FeedContext {
  /** only things that happened after this moment are posted (login / joining the party) */
  since: number
  /** overall level at `since`: only higher levels are announced */
  levelAtSince: number
  share: Record<ShareKey, boolean>
}

export function detectFeedEvents(data: AppData, game: GameState, ctx: FeedContext): FeedDraft[] {
  const out: FeedDraft[] = []
  const sinceDay = gameDayOf(new Date(ctx.since))
  const { share } = ctx

  if (share.slips) {
    for (const s of data.slips) {
      if (s.at >= ctx.since) out.push({ kind: 'slip', key: `slip:${s.id}`, payload: { what: s.what, ...(s.retro ? { retro: true } : {}) }, at: s.at })
      if (s.comebackAt && s.comebackAt >= ctx.since && s.comebackAt >= s.at && s.comebackAt - s.at <= COMEBACK_WINDOW_MS) {
        out.push({
          kind: 'comeback',
          key: `comeback:${s.id}`,
          payload: { what: s.what, slip: `slip:${s.id}`, ...(s.swap && PRESET_SWAPS.includes(s.swap) ? { swap: s.swap } : {}) },
          at: s.comebackAt,
        })
      }
    }
  }

  if (share.perfect) {
    for (const r of Object.values(game.days)) {
      if (!r.closed || !r.perfect || r.day < sinceDay) continue
      out.push({ kind: 'perfect', key: `perfect:${r.day}`, payload: { day: r.day }, at: data.days[r.day]?.confession?.at ?? ctx.since })
    }
  }

  if (share.boss) {
    for (const b of Object.values(game.bosses)) {
      if (!b.done || !b.won || weekDays(b.week)[6] < sinceDay) continue
      out.push({ kind: 'boss', key: `boss:${b.week}`, payload: { week: b.week, name: b.name }, at: data.days[weekDays(b.week)[6]]?.confession?.at ?? ctx.since })
    }
  }

  if (share.level) {
    const lvl = levelOf(game.xp).level
    if (lvl > ctx.levelAtSince) out.push({ kind: 'level', key: `level:${lvl}`, payload: { level: lvl }, at: Date.now() })
  }

  if (share.book) {
    for (const b of data.books) {
      if (b.finishedDay && b.finishedDay >= sinceDay) out.push({ kind: 'book', key: `book:${b.id}`, payload: { title: b.title.slice(0, 60) }, at: ctx.since })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

// ---------- feed text ----------

const WHAT_FEED: Record<SlipWhat, string> = {
  reels: 'на рилсах',
  chocolate: 'на шоколаде',
  cola: 'на коле',
  sleep: 'со сном',
  skip: 'на пропуске',
  other: '',
}

export const NUDGES = [
  { kind: 'wake', text: 'Эй, подъём!' },
  { kind: 'confess', text: 'Где исповедь?' },
  { kind: 'read', text: 'Читаем?' },
  { kind: 'hold', text: 'Не сливайся' },
] as const
export type NudgeKind = (typeof NUDGES)[number]['kind']
export const nudgeText = (k: string) => NUDGES.find((n) => n.kind === k)?.text ?? 'Пнул тебя'

export const REACTIONS = ['🫡', '🔥', '❄️', '💪'] as const

/** One line for a feed event. `comeback` is the comeback joined to a slip, if any. */
export function feedText(kind: string, payload: Record<string, unknown>, comeback?: Record<string, unknown>): string {
  const what = WHAT_FEED[(payload.what as SlipWhat) ?? 'other'] ?? ''
  switch (kind) {
    case 'slip': {
      const base = `Слился ${what}`.trim() + (payload.retro ? ' (из исповеди)' : '')
      if (!comeback) return base
      return `${base} → камбэк${comeback.swap ? `: ${String(comeback.swap).toLowerCase()}` : ''} ✅`
    }
    case 'comeback':
      return `Камбэк после срыва ${what}${payload.swap ? `: ${String(payload.swap).toLowerCase()}` : ''} ✅`.replace(/\s+/g, ' ')
    case 'perfect':
      return 'Идеальный день: все главные квесты закрыты'
    case 'boss':
      return `Победил босса недели ${payload.week}: ${payload.name}`
    case 'level':
      return `Новый уровень: ${payload.level}`
    case 'book':
      return `Дочитал книгу «${payload.title}»`
    case 'check':
      return `Воскресная сверка, неделя ${payload.week}`
    case 'join':
      return 'Вступил в пати'
    default:
      return 'Событие'
  }
}
