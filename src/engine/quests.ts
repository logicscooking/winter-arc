import { ARC_START, chapterOf, eveningMinutes, parseHM, wakeOnTarget, wakeTarget } from './time'
import { journalAnswered, journalStatus } from './journal'
import type { AppData, DayKey, DayLog, MarkStatus, PlannedQuest, Quest, Role } from './types'

export const MAX_MAIN = 5

export const XP = {
  main: 20,
  side: 10,
  mini: 5,
  subtask: 3,
  dealTask: 30,
  comeback: 5,
  craving: 10,
  confession: 5,
  pause: 5,
} as const

export const SHARDS = {
  main: 3,
  side: 2,
  confession: 1,
  comeback: 2,
  craving: 2,
  boss: 15,
  /** «Судьба дня» done before the focus timer ran out */
  destiny: 3,
} as const

/**
 * CRITICAL: ~15% of full completions give ×1.5 XP. The roll is a hash of day + quest,
 * so replaying the log (or syncing to another device) always gives the same result.
 * Mini versions never crit; boss damage uses the base XP.
 */
export const CRIT = { chance: 0.15, mult: 1.5 } as const

/** FNV-1a 32-bit */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function isCrit(day: DayKey, questId: string): boolean {
  return hash32(`crit|${day}|${questId}`) % 10000 < CRIT.chance * 10000
}

export interface QuestReward {
  xp: number
  baseXp: number
  crit: boolean
  shards: number
}

/** Everything a completion gives, crit included */
export function questReward(day: DayKey, p: Pick<PlannedQuest, 'id' | 'role' | 'base'>, status: MarkStatus | undefined): QuestReward {
  const baseXp = questXp(p.role, p.base, status)
  const crit = status === 'done' && baseXp > 0 && isCrit(day, p.id)
  return { xp: crit ? Math.round(baseXp * CRIT.mult) : baseXp, baseXp, crit, shards: questShards(p.role, status) }
}

export const HP = {
  start: 100,
  max: 100,
  miss: -10,
  missTwice: -20,
  noConfession: -10,
  slip: -10,
  comeback: 5,
  perfect: 5,
  recovered: 50,
  recoveryDays: 3,
} as const

export const FREEZE = { per: 7, max: 2 } as const
export const COMEBACK_WINDOW_MS = 60 * 60 * 1000
export const REELS_LIMIT = 20
export const REELS_PACK_MIN = 15

const M: Role = 'main'
const S: Role = 'side'

/** «Сферы»: the phone quest is now tied to the bedtime (BEDTIME_TARGET 23:30 − 30 min); the id stays, so history replays */
export const PHONE_TITLE = 'Телефон отложен за 30 мин до сна'
export const PHONE_IF_THEN = 'Когда до отбоя 30 минут → телефон на зарядку в коридоре'
/** what the phone quest said before «Сферы»: only an untouched default is retitled */
export const PHONE_OLD = { title: 'Телефон вне кровати к 22:15', ifThen: 'Когда выключил свет на кухне → телефон на зарядку в коридоре' }

/**
 * «Сферы»: quests that came with the life areas. Медитация and the diary («Разное») are for everyone; the two «Деньги»
 * quests are off by default (friends use the app too) and are switched on in «Квесты».
 */
export const AREA_QUESTS: Quest[] = [
  { id: 'meditation', title: 'Медитация 10 мин', stat: 'mind', kind: 'check', area: 'misc', ifThen: 'Когда умылся утром → 10 минут тишины с таймером', mini: '3 медленных вдоха', roles: [S, S, S, S], enabled: true, order: 12 },
  { id: 'journal', title: 'Вечерний дневник', stat: 'mind', kind: 'journal', area: 'misc', ifThen: 'Когда лёг в кровать → 5 вопросов дневника, потом книга', mini: '1–2 ответа', roles: [S, S, S, S], enabled: true, order: 13 },
  { id: 'twitter', title: 'Твиттер: посты', stat: 'deal', kind: 'number', area: 'money', unit: 'постов', min: 1, goal: 3, ifThen: 'Когда сел за стол → сначала пост, потом лента', mini: 'Черновик поста', roles: [S, S, S, S], enabled: false, order: 14 },
  { id: 'leads', title: 'Рассылка лидам', stat: 'deal', kind: 'number', area: 'money', unit: 'сообщений', min: 10, goal: 20, ifThen: 'Когда открыл ноутбук → 10 сообщений лидам до почты', mini: 'Хотя бы 1 сообщение', roles: [S, S, S, S], enabled: false, order: 15 },
]

export const DEFAULT_QUESTS: Quest[] = [
  { id: 'wake', title: 'Подъём в целевое время', stat: 'energy', kind: 'wake', ifThen: 'Когда звенит будильник → сразу встаю и иду к окну', mini: 'Встал не позже часа от цели', roles: [M, M, M, M], enabled: true, order: 0 },
  { id: 'light', title: 'Свет 10 мин в первый час', stat: 'energy', kind: 'check', ifThen: 'Когда встал → стакан воды и 10 минут у окна или на улице', mini: '2 минуты у окна', roles: [S, M, S, S], enabled: true, order: 1 },
  { id: 'phone', title: PHONE_TITLE, stat: 'will', kind: 'check', ifThen: PHONE_IF_THEN, mini: 'Телефон хотя бы на другом конце комнаты', roles: [M, M, S, S], enabled: true, order: 2 },
  { id: 'reading', title: 'Чтение', stat: 'mind', kind: 'reading', unit: 'стр', min: 10, goal: 25, ifThen: 'Когда лёг в кровать → книга вместо телефона', mini: '1 страница', roles: [S, M, M, M], enabled: true, order: 3 },
  { id: 'deal', title: 'Дело дня', stat: 'deal', kind: 'deal', ifThen: 'Когда сел за стол → 45 минут над Делом дня', mini: '10 минут над Делом дня', roles: [S, M, M, M], enabled: true, order: 4 },
  { id: 'workout', title: 'Тренировка дома 20 мин', stat: 'body', kind: 'check', ifThen: 'Когда пришёл домой → коврик и 20 минут', mini: '10 отжиманий', roles: [null, S, M, M], enabled: true, order: 5 },
  { id: 'reels', title: 'Рилсы в лимите', stat: 'will', kind: 'reels', ifThen: 'Когда тянет открыть рилсы → сначала кнопка «Тяга»', mini: 'Не больше лимита +5 мин', roles: [null, S, M, S], enabled: true, order: 6 },
  { id: 'skill', title: 'Навык/учёба 30 мин', stat: 'mind', kind: 'check', ifThen: 'Когда допил утренний чай → 30 минут навыка', mini: '5 минут навыка', roles: [null, null, S, M], enabled: true, order: 7 },
  { id: 'caffeine', title: 'Кофеин до 14:00', stat: 'energy', kind: 'caffeine', ifThen: 'Когда после обеда тянет на кофе → вода и 5 минут на улице', mini: 'Только половина чашки до 16:00', roles: [S, S, S, S], enabled: true, order: 8 },
  { id: 'bedtime', title: 'Отбой до 23:30', stat: 'energy', kind: 'bedtime', ifThen: 'Когда 23:00 → свет выключен, книга', mini: 'Лёг до полуночи', roles: [S, S, S, S], enabled: true, order: 9 },
  { id: 'steps', title: 'Шаги 7000', stat: 'body', kind: 'number', unit: 'шагов', min: 7000, goal: 7000, ifThen: 'Когда звонок или подкаст → хожу, а не сижу', mini: '2000 шагов', roles: [null, S, S, S], enabled: true, order: 10 },
  { id: 'water', title: 'Вода 2 л', stat: 'body', kind: 'check', ifThen: 'Когда сел работать → бутылка воды на столе', mini: 'Стакан воды сейчас', roles: [S, S, S, S], enabled: true, order: 11 },
  ...AREA_QUESTS,
]

export function roleIn(q: Quest, chapter: number): Role | null {
  if (chapter < 0 || chapter > 3) return null
  return q.roles[chapter]
}

/** A habit that was main in the previous chapter and is side now: «база», XP ×0.5 */
export function isBase(q: Quest, chapter: number): boolean {
  return chapter > 0 && roleIn(q, chapter) === 'side' && roleIn(q, chapter - 1) === 'main'
}

/** Quests active on a day, main first, at most MAX_MAIN mains (extra mains become side). */
export function activeQuestsFor(quests: Quest[], day: DayKey): PlannedQuest[] {
  const ch = chapterOf(day)
  const list = quests
    .filter((q) => q.enabled && roleIn(q, ch) && (!q.createdDay || q.createdDay <= day))
    .sort((a, b) => a.order - b.order)
  let mains = 0
  const out: PlannedQuest[] = []
  for (const q of list) {
    let role = roleIn(q, ch) as Role
    if (role === 'main') {
      if (mains >= MAX_MAIN) role = 'side'
      else mains++
    }
    out.push({ id: q.id, role, base: role === 'side' && isBase(q, ch), stat: q.stat })
  }
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === 'main' ? -1 : 1))
}

export function questXp(role: Role, base: boolean, status: MarkStatus | undefined): number {
  if (status === 'mini') return XP.mini
  if (status !== 'done') return 0
  const xp = role === 'main' ? XP.main : XP.side
  return base ? Math.round(xp * 0.5) : xp
}

export function questShards(role: Role, status: MarkStatus | undefined): number {
  if (status !== 'done') return 0
  return role === 'main' ? SHARDS.main : SHARDS.side
}

export const isCompleted = (s: MarkStatus | undefined) => s === 'done' || s === 'mini'

/** Status from a numeric value: ≥ min → done, >0 → mini */
export function statusFromValue(q: Quest, value: number | undefined, minOverride?: number): MarkStatus | undefined {
  if (value === undefined || value <= 0) return undefined
  const min = minOverride ?? q.min ?? 1
  return value >= min ? 'done' : 'mini'
}

export interface ResolveCtx {
  wakeTarget?: number
  reelsLimit: number
  dealDoneOnDay: boolean
}

export interface ResolvedMark {
  status?: MarkStatus
  at?: number
  auto: boolean
}

/** Effective status of a quest on a day: manual mark wins, otherwise auto rules. */
export function resolveMark(q: Quest | undefined, log: DayLog | undefined, ctx: ResolveCtx): ResolvedMark {
  if (!q) return { auto: false }
  const manual = log?.quests[q.id]
  if (manual) return { status: manual.status, at: manual.at, auto: false }
  if (!log) return { auto: true }
  switch (q.kind) {
    case 'wake': {
      if (!log.checkin || ctx.wakeTarget === undefined) return { auto: true }
      const diff = parseHM(log.checkin.wake) - ctx.wakeTarget
      const status: MarkStatus = wakeOnTarget(log.checkin.wake, ctx.wakeTarget) ? 'done' : diff <= 60 ? 'mini' : 'skip'
      return { status, at: log.checkin.at, auto: true }
    }
    case 'deal':
      return ctx.dealDoneOnDay ? { status: 'done', at: undefined, auto: true } : { auto: true }
    case 'reels':
      if (!log.confession) return { auto: true }
      return { status: log.confession.reelsMin <= ctx.reelsLimit ? 'done' : 'skip', at: log.confession.at, auto: true }
    case 'bedtime':
      if (!log.confession) return { auto: true }
      return { status: eveningMinutes(log.confession.bedtime) <= eveningMinutes('23:30') ? 'done' : 'skip', at: log.confession.at, auto: true }
    case 'caffeine':
      if (log.confession?.colaAfter14) return { status: 'skip', at: log.confession.at, auto: true }
      return { auto: true }
    case 'journal': {
      // «Вечерний дневник»: ≥3 answers → done, 1–2 → mini (areas.ts)
      const n = journalAnswered(log)
      if (!n) return { auto: true }
      const at = Math.max(...Object.values(log.journal ?? {}).map((a) => a.at))
      return { status: journalStatus(n), at, auto: true }
    }
    default:
      return { auto: true }
  }
}

export function reelsLimitFor(data: Pick<AppData, 'purchases' | 'settings'>, day: DayKey): number {
  const base = data.settings.reelsLimit ?? REELS_LIMIT
  return base + data.purchases.filter((p) => p.day === day && p.kind === 'reels').length * REELS_PACK_MIN
}

export function wakeTargetFor(data: Pick<AppData, 'profile'>, day: DayKey): number | undefined {
  const p = data.profile
  if (!p) return undefined
  const start = p.onboardDay > ARC_START ? p.onboardDay : ARC_START
  return wakeTarget(p.usualWake, start, day)
}

export function resolveCtx(data: AppData, day: DayKey): ResolveCtx {
  const dealId = data.days[day]?.dealTaskId
  const task = dealId ? data.tasks.find((t) => t.id === dealId) : undefined
  // v0.4: «Сегодня качаю: навык → узел» — a practice on that node closes the Deal of the day
  const node = data.days[day]?.dealNodeId
  const practiced = !!node && (data.practices ?? []).some((p) => p.nodeId === node && p.day === day)
  return {
    wakeTarget: wakeTargetFor(data, day),
    reelsLimit: reelsLimitFor(data, day),
    dealDoneOnDay: task?.doneDay === day || practiced,
  }
}
