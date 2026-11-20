/**
 * «Судьба дня» v0.6: Плинко. A ball falls through a triangle of pegs and lands in a slot; the slot
 * picks a small useful task. No stakes, no money: the ball only chooses what to do, and the reward
 * comes only after «Сделал». The loop is «бросил → сделал полезное → получил ещё шар».
 *
 * The path (L/R per row) is a hash of day + throw number + seed + risk, like CRITICAL, so the same
 * throw lands in the same slot on any device and the replay can trust it. Slots are tiered
 * symmetrically from the centre (easy) to the edges (hard, casino multiplier up to ×10 on XP).
 */
import { hash32 } from './quests'
import type { AppData, DayKey, DayLog, PlinkoDrop, PlinkoRisk, StatId } from './types'

export type PlinkoTier = 1 | 2 | 3 | 4 | 5

/** free balls per game day */
export const PLINKO_FREE = 2
/** balls per day with every bonus */
export const PLINKO_MAX = 6
/** XP of a ×1 slot; the slot multiplier scales it */
export const PLINKO_BASE_XP = 3
/** «серия»: each task closed in time adds ×0.2 to the next throw, up to ×2 */
export const PLINKO_STREAK = { step: 0.2, max: 2 } as const

/** Reward and timer per tier. Compare: side quest 10 XP / 2 ❄, main quest 20 XP / 3 ❄. */
export const PLINKO_TIERS: Record<PlinkoTier, { mult: number; xp: number; shards: number; minutes: number }> = {
  1: { mult: 1, xp: PLINKO_BASE_XP * 1, shards: 1, minutes: 10 },
  2: { mult: 2, xp: PLINKO_BASE_XP * 2, shards: 1, minutes: 20 },
  3: { mult: 3, xp: PLINKO_BASE_XP * 3, shards: 2, minutes: 30 },
  4: { mult: 5, xp: PLINKO_BASE_XP * 5, shards: 4, minutes: 60 },
  5: { mult: 10, xp: PLINKO_BASE_XP * 10, shards: 6, minutes: 120 },
}

/**
 * Risk, as on a casino Plinko: rows and slot tiers.
 * Низкий: 6 rows, three easy slots in the middle → almost always tier 1.
 * Средний: 8 rows, tier 1 in the centre → tier 5 on the edges.
 * Высокий: 10 rows, no easy slot, hard tiers spread inwards → fatter XP on average.
 */
export const PLINKO_RISKS: Record<PlinkoRisk, { label: string; rows: number; tiers: PlinkoTier[] }> = {
  low: { label: 'Низкий', rows: 6, tiers: [3, 2, 1, 1, 1, 2, 3] },
  mid: { label: 'Средний', rows: 8, tiers: [5, 4, 3, 2, 1, 2, 3, 4, 5] },
  high: { label: 'Высокий', rows: 10, tiers: [5, 5, 4, 4, 3, 2, 3, 4, 4, 5, 5] },
}
export const PLINKO_RISK_IDS: PlinkoRisk[] = ['low', 'mid', 'high']

export const riskOf = (r: unknown): PlinkoRisk => (r === 'low' || r === 'high' ? r : 'mid')
export const slotsOf = (risk: PlinkoRisk = 'mid') => PLINKO_RISKS[risk].rows + 1

export interface PlinkoTask {
  id: string
  tier: PlinkoTier
  title: string
  /** one line: how exactly */
  hint: string
  stat: StatId
  /** pixel sprite name */
  icon: string
  /** clock hours when the task can drop: [from, to), the game day runs 04 → 28 (= 04 next morning) */
  hours?: [number, number]
}

/** not after 21:00: energizing (cold shower, workouts, long walks, loud chores) */
const DAY: [number, number] = [4, 21]
/** evening only */
const EVE: [number, number] = [18, 28]
const MORNING: [number, number] = [4, 13]
/** «вечер без экрана» makes sense only before it starts */
const PRE21: [number, number] = [17, 21]

export const PLINKO_POOL: PlinkoTask[] = [
  // ---- tier 1: under 5 minutes ----
  { id: 'water', tier: 1, title: 'Стакан воды', hint: 'Налей и выпей прямо сейчас, до дна', stat: 'body', icon: 'water' },
  { id: 'breath', tier: 1, title: '10 глубоких вдохов', hint: 'Вдох на 4 счёта, выдох на 6. Глаза закрыты', stat: 'energy', icon: 'heart' },
  { id: 'air', tier: 1, title: 'Проветрить комнату', hint: 'Окно настежь на 5 минут, сам постой рядом', stat: 'energy', icon: 'snowflake' },
  { id: 'bed', tier: 1, title: 'Заправить кровать', hint: 'Одеяло ровно, подушка на месте. Первая победа дня', stat: 'deal', icon: 'star', hours: MORNING },
  { id: 'stretch2', tier: 1, title: '2 минуты растяжки', hint: 'Шея, плечи, наклоны. Без телефона в руке', stat: 'body', icon: 'run' },
  { id: 'thanks3', tier: 1, title: '3 «спасибо» за день', hint: 'Запиши три вещи, за которые сегодня благодарен', stat: 'mind', icon: 'pen' },
  { id: 'desk5', tier: 1, title: 'Убрать 5 вещей со стола', hint: 'Пять лишних предметов на свои места', stat: 'deal', icon: 'hammer' },
  { id: 'notif', tier: 1, title: 'Выключить одно уведомление', hint: 'Найди самое назойливое приложение и заглуши его', stat: 'will', icon: 'phone' },
  { id: 'posture', tier: 1, title: 'Минута осанки', hint: 'Спина у стены, плечи вниз, подбородок назад. 60 секунд', stat: 'body', icon: 'shield' },
  { id: 'far', tier: 1, title: 'Взгляд вдаль', hint: '2 минуты смотри в окно на самую дальнюю точку, без экрана', stat: 'will', icon: 'sun', hours: DAY },

  // ---- tier 2: 5–15 minutes ----
  { id: 'squats20', tier: 2, title: '20 приседаний', hint: 'Медленно, пятки на полу, спина прямая', stat: 'body', icon: 'dumbbell' },
  { id: 'read10', tier: 2, title: '10 страниц книги', hint: 'Бумажная или читалка, не телефон', stat: 'mind', icon: 'book' },
  { id: 'walk10', tier: 2, title: '10 минут прогулки', hint: 'До ближайшего угла и обратно, можно вокруг дома', stat: 'body', icon: 'boot', hours: DAY },
  { id: 'friend', tier: 2, title: 'Написать другу', hint: 'Просто так: как дела, вспомнил тебя', stat: 'mind', icon: 'speech' },
  { id: 'shelf', tier: 2, title: 'Разобрать одну полку', hint: 'Или один ящик. Лишнее в пакет на выброс', stat: 'deal', icon: 'hammer' },
  { id: 'dishes', tier: 2, title: 'Помыть всю посуду', hint: 'Раковина пустая, сушилка полная', stat: 'deal', icon: 'water' },
  { id: 'words5', tier: 2, title: '5 новых слов', hint: 'На языке, который учишь. Выпиши и проговори вслух', stat: 'mind', icon: 'brain' },
  { id: 'tea', tier: 2, title: 'Чай без телефона', hint: '10 минут: чашка, окно, свои мысли. Без кофеина после 16', stat: 'will', icon: 'coffee' },
  { id: 'light10', tier: 2, title: '10 минут дневного света', hint: 'На улице или у самого окна, лицом к небу', stat: 'energy', icon: 'sun', hours: [4, 16] },
  { id: 'plan3', tier: 2, title: '3 дела на завтра', hint: 'Запиши три главных дела, первое — самое важное', stat: 'deal', icon: 'pen', hours: EVE },

  // ---- tier 3: 15–30 minutes ----
  { id: 'push20', tier: 3, title: '20 отжиманий', hint: 'Можно с колен и подходами по 5–10', stat: 'body', icon: 'dumbbell' },
  { id: 'meditate10', tier: 3, title: '10 минут медитации', hint: 'Телефон в другой комнате. Таймер на кухне, внимание на дыхании', stat: 'will', icon: 'snowflake' },
  { id: 'clean15', tier: 3, title: '15 минут уборки', hint: 'Таймер и одна зона: пол, кухня или ванная', stat: 'deal', icon: 'hammer', hours: [4, 22] },
  { id: 'plank', tier: 3, title: 'Планка 2 × 1 мин', hint: 'Две минуты в планке с отдыхом 30 секунд', stat: 'body', icon: 'shield' },
  { id: 'journal', tier: 3, title: 'Страница дневника', hint: 'Что сегодня было, что понял, что завтра сделаю иначе', stat: 'mind', icon: 'pen', hours: EVE },
  { id: 'call', tier: 3, title: 'Позвонить родным', hint: 'Не писать, а позвонить. Хотя бы 10 минут разговора', stat: 'mind', icon: 'speech', hours: [9, 22] },
  { id: 'nosocial1h', tier: 3, title: 'Час без соцсетей', hint: 'Ни рилсов, ни ленты, ни мессенджеров ради скролла', stat: 'will', icon: 'phone' },
  { id: 'stairs', tier: 3, title: 'Лестница 10 минут', hint: 'Вверх-вниз по подъезду или быстрым шагом на улице', stat: 'body', icon: 'run', hours: DAY },
  { id: 'declutter', tier: 3, title: 'Цифровая чистка', hint: 'Удали 30 старых фото или 5 приложений, которыми не пользуешься', stat: 'will', icon: 'phone' },
  { id: 'debt', tier: 3, title: 'Одно отложенное дело', hint: 'Письмо, звонок или оплата, которые висят неделю. Сделай сейчас', stat: 'deal', icon: 'clock', hours: [9, 20] },

  // ---- tier 4: 30–60 minutes ----
  { id: 'walk30', tier: 4, title: '30 минут прогулки', hint: 'Без наушников: только улица, шаги и мысли', stat: 'body', icon: 'boot', hours: DAY },
  { id: 'cold', tier: 4, title: 'Холодный душ 1 мин', hint: 'В конце обычного душа. Дыши ровно, не задерживай', stat: 'energy', icon: 'water', hours: [5, 20] },
  { id: 'skill30', tier: 4, title: '30 минут навыка', hint: 'То, что качаешь: курс, практика, конспект. Таймер и без вкладок', stat: 'mind', icon: 'brain', hours: [4, 23] },
  { id: 'cook', tier: 4, title: 'Домашняя еда', hint: 'Приготовь нормальный ужин или обед вместо доставки', stat: 'body', icon: 'campfire', hours: [10, 21] },
  { id: 'read30', tier: 4, title: '30 страниц книги', hint: 'В тишине, телефон экраном вниз в другой комнате', stat: 'mind', icon: 'book' },
  { id: 'zone', tier: 4, title: 'Генеральная одной зоны', hint: 'Кухня, ванная или шкаф. До состояния «как въехал»', stat: 'deal', icon: 'hammer', hours: DAY },
  { id: 'yoga20', tier: 4, title: '20 минут растяжки', hint: 'Видео-разминка или своя: всё тело, медленно', stat: 'body', icon: 'run' },
  { id: 'thankyou', tier: 4, title: 'Длинное «спасибо»', hint: 'Напиши человеку, которому давно хотел сказать, что он для тебя сделал', stat: 'mind', icon: 'speech' },
  { id: 'early', tier: 4, title: 'Отбой до 23:00', hint: 'Телефон на зарядке вне кровати, свет выключен до 23:00', stat: 'energy', icon: 'moon', hours: [18, 23] },

  // ---- tier 5: about an hour and more ----
  { id: 'focus60', tier: 5, title: '60 минут фокуса', hint: 'Над Делом дня. Телефон в другой комнате, одна вкладка', stat: 'deal', icon: 'clock', hours: DAY },
  { id: 'workout30', tier: 5, title: 'Тренировка 30 минут', hint: 'Приседания, отжимания, выпады, планка — по кругу без пауз', stat: 'body', icon: 'dumbbell', hours: [5, 21] },
  { id: 'squats100', tier: 5, title: '100 приседаний', hint: 'Пять подходов по 20 в течение двух часов', stat: 'body', icon: 'dumbbell', hours: DAY },
  { id: 'noscreen', tier: 5, title: 'Вечер без экрана', hint: 'После 21:00 никаких экранов до сна: книга, разговор, душ', stat: 'will', icon: 'moon', hours: PRE21 },
  { id: 'walk60', tier: 5, title: 'Час пешком', hint: 'Новый маршрут, без наушников. Тысяч шесть шагов', stat: 'body', icon: 'boot', hours: [6, 20] },
  { id: 'detox3h', tier: 5, title: '3 часа без дофамина', hint: 'Ни рилсов, ни сладкого, ни игр. Только живые дела', stat: 'will', icon: 'shield', hours: DAY },
  { id: 'read50', tier: 5, title: '50 страниц книги', hint: 'Глава за главой, с закладкой и без телефона рядом', stat: 'mind', icon: 'book' },
  { id: 'mealprep', tier: 5, title: 'Еда на два дня', hint: 'Приготовь и разложи по контейнерам обеды на завтра и послезавтра', stat: 'body', icon: 'campfire', hours: [9, 21] },
  { id: 'weekplan', tier: 5, title: 'Разбор недели', hint: 'Все заметки и напоминалки в один список, план на 7 дней, лишнее вычеркнуть', stat: 'deal', icon: 'pen' },
]

export const plinkoTaskById = (id: string) => PLINKO_POOL.find((t) => t.id === id)

/** 0..23 clock hour → game hour 4..27 */
const gameHour = (hour: number) => (hour < 4 ? hour + 24 : hour)

export function plinkoPool(tier: PlinkoTier, hour: number): PlinkoTask[] {
  const h = gameHour(hour)
  return PLINKO_POOL.filter((t) => t.tier === tier && (!t.hours || (h >= t.hours[0] && h < t.hours[1])))
}

/** murmur3 finalizer: FNV-1a alone has weak low bits */
function mix(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

const roll = (s: string) => mix(hash32(s))

export type PlinkoDir = 'L' | 'R'

/** Seed of the player: the onboarding day travels with the profile */
export function plinkoSeed(data: Pick<AppData, 'profile'>): string {
  return data.profile?.onboardDay ?? ''
}

/** Deterministic path: one L/R bounce per peg row. The medium risk keeps the v0.6.0 key. */
export function plinkoPath(day: DayKey, n: number, seed: string, risk: PlinkoRisk = 'mid'): PlinkoDir[] {
  const salt = risk === 'mid' ? '' : `|${risk}`
  return Array.from({ length: PLINKO_RISKS[risk].rows }, (_, r) => (roll(`plinko|${day}|${n}|${seed}${salt}|${r}`) & 1 ? 'R' : 'L'))
}

export const slotOfPath = (path: PlinkoDir[]) => path.filter((d) => d === 'R').length

export function tierOfSlot(slot: number, risk: PlinkoRisk = 'mid'): PlinkoTier {
  const tiers = PLINKO_RISKS[risk].tiers
  return tiers[Math.max(0, Math.min(tiers.length - 1, slot))]
}

export const isEdgeSlot = (slot: number, risk: PlinkoRisk = 'mid') => slot === 0 || slot === slotsOf(risk) - 1

export const dropRisk = (d: Pick<PlinkoDrop, 'risk'>) => riskOf(d.risk)
export const dropTier = (d: Pick<PlinkoDrop, 'slot' | 'risk'>) => tierOfSlot(d.slot, dropRisk(d))

export interface PlinkoRoll {
  path: PlinkoDir[]
  slot: number
  tier: PlinkoTier
  task: PlinkoTask
}

/** The whole outcome of throw `n` of `day`, made at local time `at` (the hour filters the pool) */
export function rollPlinko(day: DayKey, n: number, seed: string, at: Date, risk: PlinkoRisk = 'mid'): PlinkoRoll {
  const path = plinkoPath(day, n, seed, risk)
  const slot = slotOfPath(path)
  const tier = tierOfSlot(slot, risk)
  let list = plinkoPool(tier, at.getHours())
  if (!list.length) list = PLINKO_POOL.filter((t) => t.tier === tier && !t.hours)
  const task = list[roll(`plinko-task|${day}|${n}|${seed}`) % list.length]
  return { path, slot, tier, task }
}

export function dropDeadline(drop: Pick<PlinkoDrop, 'at' | 'slot' | 'risk'>): number {
  return drop.at + PLINKO_TIERS[dropTier(drop)].minutes * 60_000
}

/** closed before its timer ran out and never put off with «Позже» */
export function doneInTime(d: PlinkoDrop): boolean {
  return d.doneAt !== undefined && d.doneAt >= d.at && d.doneAt <= dropDeadline(d) && !(d.laterAt !== undefined && d.laterAt <= d.doneAt)
}

/** Full reward (× the streak) before the timer runs out, half after it */
export function plinkoReward(drop: Pick<PlinkoDrop, 'at' | 'slot' | 'risk'>, doneAt: number, streakMult = 1): { xp: number; shards: number; inTime: boolean } {
  const r = PLINKO_TIERS[dropTier(drop)]
  const xp = Math.round(r.xp * streakMult)
  const inTime = doneAt <= dropDeadline(drop)
  return inTime ? { xp, shards: r.shards, inTime } : { xp: Math.floor(xp / 2), shards: Math.floor(r.shards / 2), inTime }
}

/** Valid drops of a day in throw order */
export function plinkoDrops(log: DayLog | undefined): PlinkoDrop[] {
  return Object.values(log?.plinko ?? {})
    .filter((d) => d && d.n >= 0 && d.n < PLINKO_MAX)
    .sort((a, b) => a.n - b.n)
}

/** Balls of the day: 2 free + 1 per Plinko task closed in time + 1 for all main quests, at most 6 */
export function ballsFor(log: DayLog | undefined, allMains: boolean): number {
  const earned = plinkoDrops(log).filter(doneInTime).length + (allMains ? 1 : 0)
  return Math.min(PLINKO_MAX, PLINKO_FREE + earned)
}

export function ballsLeft(log: DayLog | undefined, allMains: boolean): number {
  return Math.max(0, ballsFor(log, allMains) - plinkoDrops(log).length)
}

/** Next throw number of the day, or null when no balls are left */
export function nextThrow(log: DayLog | undefined, allMains: boolean): number | null {
  if (ballsLeft(log, allMains) <= 0) return null
  const used = new Set(plinkoDrops(log).map((d) => d.n))
  for (let n = 0; n < PLINKO_MAX; n++) if (!used.has(n)) return n
  return null
}

export const streakMult = (k: number) => Math.min(PLINKO_STREAK.max, Math.round((1 + PLINKO_STREAK.step * k) * 10) / 10)

const dropKey = (day: DayKey, n: number) => `${day}:${n}`

interface Ordered {
  day: DayKey
  drop: PlinkoDrop
}

function orderedDrops(days: AppData['days']): Ordered[] {
  const all: Ordered[] = []
  for (const [day, log] of Object.entries(days ?? {})) for (const drop of plinkoDrops(log)) all.push({ day, drop })
  return all.sort((a, b) => a.drop.at - b.drop.at || (a.day < b.day ? -1 : a.day > b.day ? 1 : a.drop.n - b.drop.n))
}

/** the previous throw keeps the streak going for a throw made at `at` */
const carries = (prev: PlinkoDrop, at: number) => doneInTime(prev) && prev.doneAt! <= at

/**
 * «Серия» per throw: how many throws in a row before it were closed in time (before it was thrown).
 * «Позже», an expired timer or a still open task resets it.
 */
export function plinkoStreaks(days: AppData['days']): Map<string, number> {
  const out = new Map<string, number>()
  let prev: Ordered | undefined
  for (const cur of orderedDrops(days)) {
    const k = prev && carries(prev.drop, cur.drop.at) ? out.get(dropKey(prev.day, prev.drop.n))! + 1 : 0
    out.set(dropKey(cur.day, cur.drop.n), k)
    prev = cur
  }
  return out
}

export function dropStreakMult(days: AppData['days'], day: DayKey, n: number): number {
  return streakMult(plinkoStreaks(days).get(dropKey(day, n)) ?? 0)
}

/** Streak the next throw would get if made at `now` */
export function nextStreak(days: AppData['days'], now: number): number {
  const all = orderedDrops(days)
  const last = all[all.length - 1]
  if (!last || !carries(last.drop, now)) return 0
  return (plinkoStreaks(days).get(dropKey(last.day, last.drop.n)) ?? 0) + 1
}

export interface PlinkoEvent {
  day: DayKey
  at: number
  xp: number
  shards: number
  stat: StatId
}

/** Replay input: one reward per closed drop, on the drop's day */
export function plinkoEvents(data: Pick<AppData, 'days'>): PlinkoEvent[] {
  const out: PlinkoEvent[] = []
  const streaks = plinkoStreaks(data.days)
  for (const { day, drop: d } of orderedDrops(data.days)) {
    if (d.doneAt === undefined || d.doneAt < d.at) continue
    const r = plinkoReward(d, d.doneAt, streakMult(streaks.get(dropKey(day, d.n)) ?? 0))
    out.push({ day, at: d.doneAt, xp: r.xp, shards: r.shards, stat: plinkoTaskById(d.taskId)?.stat ?? 'will' })
  }
  return out
}

/** Keeps a well-formed drop, drops anything else */
export function sanitizeDrop(raw: unknown): PlinkoDrop | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const n = d.n
  const slot = d.slot
  const risk = d.risk === undefined ? undefined : riskOf(d.risk)
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= PLINKO_MAX) return null
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= slotsOf(risk)) return null
  if (typeof d.at !== 'number' || !Number.isFinite(d.at) || typeof d.taskId !== 'string') return null
  const out: PlinkoDrop = { n, at: d.at, slot, taskId: d.taskId }
  if (risk) out.risk = risk
  if (typeof d.doneAt === 'number' && Number.isFinite(d.doneAt)) out.doneAt = d.doneAt
  if (typeof d.laterAt === 'number' && Number.isFinite(d.laterAt)) out.laterAt = d.laterAt
  return out
}
