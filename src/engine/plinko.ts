/**
 * «Судьба дня»: Плинко. A ball falls through a triangle of pegs and lands in one of 16 slots; every
 * slot shows its own small useful task. No stakes, no money: the ball only chooses what to do, and
 * the reward comes only after «Сделал».
 *
 * v0.7: the fall is real physics (engine/plinkoSim.ts) from crypto-random initial conditions, so the
 * slot is decided by the simulation, not by a hash. The slot, the task id and the time go to the drop
 * log (`v: 2`) and the replay trusts that record. The 16 tasks are laid out on the board at random
 * once per day (DayLog.plinkoBoard), by the tier of each position: centre easy, edges hard.
 *
 * v0.6 drops (risk boards of 7/9/11 slots, no `v`) keep their stored slot and are scored as before.
 */
import { cryptoRand, type Rand } from './plinkoSim'
import type { AppData, DayKey, DayLog, PlinkoDrop, PlinkoRisk, StatId } from './types'

export type PlinkoTier = 1 | 2 | 3 | 4 | 5

/** balls per game day, fixed */
export const PLINKO_BALLS = 5
/** highest throw count ever stored (v0.6 allowed up to 6 a day): older drops stay valid */
export const PLINKO_MAX = 6
/** slots on the v0.7 board */
export const BOARD_SLOTS = 16
/** tier by distance from the centre: 8 levels, centre pair = 0, edge pair = 7 */
export const BOARD_LEVELS: PlinkoTier[] = [1, 1, 2, 2, 3, 3, 4, 5]
/** 0 (centre) … 7 (edge) */
export const levelOfSlot = (k: number) => (k < BOARD_SLOTS / 2 ? BOARD_SLOTS / 2 - 1 - k : k - BOARD_SLOTS / 2)
export const boardTier = (k: number): PlinkoTier => BOARD_LEVELS[Math.max(0, Math.min(7, levelOfSlot(k)))]
export const BOARD_TIERS: PlinkoTier[] = Array.from({ length: BOARD_SLOTS }, (_, k) => boardTier(k))
/** the two edge slots: «ДЖЕКПОТ» */
export const isJackpotSlot = (k: number) => k === 0 || k === BOARD_SLOTS - 1
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
 * v0.6 risk boards, kept only to score old drops: rows and slot tiers.
 * Низкий: 6 rows, three easy slots in the middle → almost always tier 1.
 * Средний: 8 rows, tier 1 in the centre → tier 5 on the edges.
 * Высокий: 10 rows, no easy slot, hard tiers spread inwards → fatter XP on average.
 */
export const PLINKO_RISKS: Record<PlinkoRisk, { label: string; rows: number; tiers: PlinkoTier[] }> = {
  low: { label: 'Низкий', rows: 6, tiers: [3, 2, 1, 1, 1, 2, 3] },
  mid: { label: 'Средний', rows: 8, tiers: [5, 4, 3, 2, 1, 2, 3, 4, 5] },
  high: {
    label: 'Высокий',
    rows: 10,
    tiers: [5, 5, 4, 4, 3, 2, 3, 4, 4, 5, 5],
  },
}
export const riskOf = (r: unknown): PlinkoRisk => (r === 'low' || r === 'high' ? r : 'mid')
export const slotsOf = (risk: PlinkoRisk = 'mid') => PLINKO_RISKS[risk].rows + 1

/** tier of a slot on a v0.6 risk board */
export function tierOfSlot(slot: number, risk: PlinkoRisk = 'mid'): PlinkoTier {
  const tiers = PLINKO_RISKS[risk].tiers
  return tiers[Math.max(0, Math.min(tiers.length - 1, slot))]
}

export interface PlinkoTask {
  id: string
  tier: PlinkoTier
  title: string
  /** 1–2 words for the narrow slot label */
  short: string
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
  {
    id: 'water',
    tier: 1,
    title: 'Стакан воды',
    short: 'Вода',
    hint: 'Налей и выпей прямо сейчас, до дна',
    stat: 'body',
    icon: 'water',
  },
  {
    id: 'breath',
    tier: 1,
    title: '10 глубоких вдохов',
    short: '10 вдохов',
    hint: 'Вдох на 4 счёта, выдох на 6. Глаза закрыты',
    stat: 'energy',
    icon: 'heart',
  },
  {
    id: 'air',
    tier: 1,
    title: 'Проветрить комнату',
    short: 'Проветрить',
    hint: 'Окно настежь на 5 минут, сам постой рядом',
    stat: 'energy',
    icon: 'snowflake',
  },
  {
    id: 'bed',
    tier: 1,
    title: 'Заправить кровать',
    short: 'Кровать',
    hint: 'Одеяло ровно, подушка на месте. Первая победа дня',
    stat: 'deal',
    icon: 'star',
    hours: MORNING,
  },
  {
    id: 'stretch2',
    tier: 1,
    title: '2 минуты растяжки',
    short: 'Растяжка',
    hint: 'Шея, плечи, наклоны. Без телефона в руке',
    stat: 'body',
    icon: 'run',
  },
  {
    id: 'thanks3',
    tier: 1,
    title: '3 «спасибо» за день',
    short: '3 спасибо',
    hint: 'Запиши три вещи, за которые сегодня благодарен',
    stat: 'mind',
    icon: 'pen',
  },
  {
    id: 'desk5',
    tier: 1,
    title: 'Убрать 5 вещей со стола',
    short: 'Стол',
    hint: 'Пять лишних предметов на свои места',
    stat: 'deal',
    icon: 'hammer',
  },
  {
    id: 'notif',
    tier: 1,
    title: 'Выключить одно уведомление',
    short: 'Без пушей',
    hint: 'Найди самое назойливое приложение и заглуши его',
    stat: 'will',
    icon: 'phone',
  },
  {
    id: 'posture',
    tier: 1,
    title: 'Минута осанки',
    short: 'Осанка',
    hint: 'Спина у стены, плечи вниз, подбородок назад. 60 секунд',
    stat: 'body',
    icon: 'shield',
  },
  {
    id: 'far',
    tier: 1,
    title: 'Взгляд вдаль',
    short: 'Вдаль',
    hint: '2 минуты смотри в окно на самую дальнюю точку, без экрана',
    stat: 'will',
    icon: 'sun',
    hours: DAY,
  },

  // ---- tier 2: 5–15 minutes ----
  {
    id: 'squats20',
    tier: 2,
    title: '20 приседаний',
    short: 'Присед ×20',
    hint: 'Медленно, пятки на полу, спина прямая',
    stat: 'body',
    icon: 'dumbbell',
  },
  {
    id: 'read10',
    tier: 2,
    title: '10 страниц книги',
    short: '10 страниц',
    hint: 'Бумажная или читалка, не телефон',
    stat: 'mind',
    icon: 'book',
  },
  {
    id: 'walk10',
    tier: 2,
    title: '10 минут прогулки',
    short: 'Прогулка',
    hint: 'До ближайшего угла и обратно, можно вокруг дома',
    stat: 'body',
    icon: 'boot',
    hours: DAY,
  },
  {
    id: 'friend',
    tier: 2,
    title: 'Написать другу',
    short: 'Другу',
    hint: 'Просто так: как дела, вспомнил тебя',
    stat: 'mind',
    icon: 'speech',
  },
  {
    id: 'shelf',
    tier: 2,
    title: 'Разобрать одну полку',
    short: 'Полка',
    hint: 'Или один ящик. Лишнее в пакет на выброс',
    stat: 'deal',
    icon: 'hammer',
  },
  {
    id: 'dishes',
    tier: 2,
    title: 'Помыть всю посуду',
    short: 'Посуда',
    hint: 'Раковина пустая, сушилка полная',
    stat: 'deal',
    icon: 'water',
  },
  {
    id: 'words5',
    tier: 2,
    title: '5 новых слов',
    short: '5 слов',
    hint: 'На языке, который учишь. Выпиши и проговори вслух',
    stat: 'mind',
    icon: 'brain',
  },
  {
    id: 'tea',
    tier: 2,
    title: 'Чай без телефона',
    short: 'Чай',
    hint: '10 минут: чашка, окно, свои мысли. Без кофеина после 16',
    stat: 'will',
    icon: 'coffee',
  },
  {
    id: 'light10',
    tier: 2,
    title: '10 минут дневного света',
    short: 'Свет',
    hint: 'На улице или у самого окна, лицом к небу',
    stat: 'energy',
    icon: 'sun',
    hours: [4, 16],
  },
  {
    id: 'plan3',
    tier: 2,
    title: '3 дела на завтра',
    short: 'План',
    hint: 'Запиши три главных дела, первое — самое важное',
    stat: 'deal',
    icon: 'pen',
    hours: EVE,
  },

  // ---- tier 3: 15–30 minutes ----
  {
    id: 'push20',
    tier: 3,
    title: '20 отжиманий',
    short: 'Отжим ×20',
    hint: 'Можно с колен и подходами по 5–10',
    stat: 'body',
    icon: 'dumbbell',
  },
  {
    id: 'meditate10',
    tier: 3,
    title: '10 минут медитации',
    short: 'Медитация',
    hint: 'Телефон в другой комнате. Таймер на кухне, внимание на дыхании',
    stat: 'will',
    icon: 'snowflake',
  },
  {
    id: 'clean15',
    tier: 3,
    title: '15 минут уборки',
    short: 'Уборка',
    hint: 'Таймер и одна зона: пол, кухня или ванная',
    stat: 'deal',
    icon: 'hammer',
    hours: [4, 22],
  },
  {
    id: 'plank',
    tier: 3,
    title: 'Планка 2 × 1 мин',
    short: 'Планка',
    hint: 'Две минуты в планке с отдыхом 30 секунд',
    stat: 'body',
    icon: 'shield',
  },
  {
    id: 'journal',
    tier: 3,
    title: 'Страница дневника',
    short: 'Дневник',
    hint: 'Что сегодня было, что понял, что завтра сделаю иначе',
    stat: 'mind',
    icon: 'pen',
    hours: EVE,
  },
  {
    id: 'call',
    tier: 3,
    title: 'Позвонить родным',
    short: 'Родным',
    hint: 'Не писать, а позвонить. Хотя бы 10 минут разговора',
    stat: 'mind',
    icon: 'speech',
    hours: [9, 22],
  },
  {
    id: 'nosocial1h',
    tier: 3,
    title: 'Час без соцсетей',
    short: 'Без соцсетей',
    hint: 'Ни рилсов, ни ленты, ни мессенджеров ради скролла',
    stat: 'will',
    icon: 'phone',
  },
  {
    id: 'stairs',
    tier: 3,
    title: 'Лестница 10 минут',
    short: 'Лестница',
    hint: 'Вверх-вниз по подъезду или быстрым шагом на улице',
    stat: 'body',
    icon: 'run',
    hours: DAY,
  },
  {
    id: 'declutter',
    tier: 3,
    title: 'Цифровая чистка',
    short: 'Чистка',
    hint: 'Удали 30 старых фото или 5 приложений, которыми не пользуешься',
    stat: 'will',
    icon: 'phone',
  },
  {
    id: 'abs',
    tier: 3,
    title: 'Пресс 3 × 15',
    short: 'Пресс',
    hint: 'Скручивания: три подхода по 15, минута отдыха',
    stat: 'body',
    icon: 'dumbbell',
    hours: [4, 23],
  },
  {
    id: 'debt',
    tier: 3,
    title: 'Одно отложенное дело',
    short: 'Должок',
    hint: 'Письмо, звонок или оплата, которые висят неделю. Сделай сейчас',
    stat: 'deal',
    icon: 'clock',
    hours: [9, 20],
  },

  // ---- tier 4: 30–60 minutes ----
  {
    id: 'walk30',
    tier: 4,
    title: '30 минут прогулки',
    short: 'Прогулка 30',
    hint: 'Без наушников: только улица, шаги и мысли',
    stat: 'body',
    icon: 'boot',
    hours: DAY,
  },
  {
    id: 'cold',
    tier: 4,
    title: 'Холодный душ 1 мин',
    short: 'Холодный душ',
    hint: 'В конце обычного душа. Дыши ровно, не задерживай',
    stat: 'energy',
    icon: 'water',
    hours: [5, 20],
  },
  {
    id: 'skill30',
    tier: 4,
    title: '30 минут навыка',
    short: 'Навык',
    hint: 'То, что качаешь: курс, практика, конспект. Таймер и без вкладок',
    stat: 'mind',
    icon: 'brain',
    hours: [4, 23],
  },
  {
    id: 'cook',
    tier: 4,
    title: 'Домашняя еда',
    short: 'Готовка',
    hint: 'Приготовь нормальный ужин или обед вместо доставки',
    stat: 'body',
    icon: 'campfire',
    hours: [10, 21],
  },
  {
    id: 'read30',
    tier: 4,
    title: '30 страниц книги',
    short: '30 страниц',
    hint: 'В тишине, телефон экраном вниз в другой комнате',
    stat: 'mind',
    icon: 'book',
  },
  {
    id: 'zone',
    tier: 4,
    title: 'Генеральная одной зоны',
    short: 'Генеральная',
    hint: 'Кухня, ванная или шкаф. До состояния «как въехал»',
    stat: 'deal',
    icon: 'hammer',
    hours: DAY,
  },
  {
    id: 'yoga20',
    tier: 4,
    title: '20 минут растяжки',
    short: 'Растяжка 20',
    hint: 'Видео-разминка или своя: всё тело, медленно',
    stat: 'body',
    icon: 'run',
  },
  {
    id: 'thankyou',
    tier: 4,
    title: 'Длинное «спасибо»',
    short: 'Спасибо',
    hint: 'Напиши человеку, которому давно хотел сказать, что он для тебя сделал',
    stat: 'mind',
    icon: 'speech',
  },
  {
    id: 'poem',
    tier: 4,
    title: 'Выучить стих',
    short: 'Стих',
    hint: 'Восемь строк наизусть. Расскажи вслух без подглядывания',
    stat: 'mind',
    icon: 'book',
  },
  {
    id: 'phonebed',
    tier: 4,
    title: 'Телефон спит отдельно',
    short: 'Телефон вон',
    hint: 'На ночь зарядка в другой комнате, будильник — обычный',
    stat: 'energy',
    icon: 'phone',
    hours: EVE,
  },
  {
    id: 'early',
    tier: 4,
    title: 'Отбой до 23:00',
    short: 'Отбой 23:00',
    hint: 'Телефон на зарядке вне кровати, свет выключен до 23:00',
    stat: 'energy',
    icon: 'moon',
    hours: [18, 23],
  },

  // ---- tier 5: about an hour and more ----
  {
    id: 'focus60',
    tier: 5,
    title: '60 минут фокуса',
    short: 'Фокус 60',
    hint: 'Над Делом дня. Телефон в другой комнате, одна вкладка',
    stat: 'deal',
    icon: 'clock',
    hours: DAY,
  },
  {
    id: 'workout30',
    tier: 5,
    title: 'Тренировка 30 минут',
    short: 'Тренировка',
    hint: 'Приседания, отжимания, выпады, планка — по кругу без пауз',
    stat: 'body',
    icon: 'dumbbell',
    hours: [5, 21],
  },
  {
    id: 'squats100',
    tier: 5,
    title: '100 приседаний',
    short: 'Присед ×100',
    hint: 'Пять подходов по 20 в течение двух часов',
    stat: 'body',
    icon: 'dumbbell',
    hours: DAY,
  },
  {
    id: 'noscreen',
    tier: 5,
    title: 'Вечер без экрана',
    short: 'Без экрана',
    hint: 'После 21:00 никаких экранов до сна: книга, разговор, душ',
    stat: 'will',
    icon: 'moon',
    hours: PRE21,
  },
  {
    id: 'walk60',
    tier: 5,
    title: 'Час пешком',
    short: 'Час пешком',
    hint: 'Новый маршрут, без наушников. Тысяч шесть шагов',
    stat: 'body',
    icon: 'boot',
    hours: [6, 20],
  },
  {
    id: 'detox3h',
    tier: 5,
    title: '3 часа без дофамина',
    short: 'Детокс 3 ч',
    hint: 'Ни рилсов, ни сладкого, ни игр. Только живые дела',
    stat: 'will',
    icon: 'shield',
    hours: DAY,
  },
  {
    id: 'read50',
    tier: 5,
    title: '50 страниц книги',
    short: '50 страниц',
    hint: 'Глава за главой, с закладкой и без телефона рядом',
    stat: 'mind',
    icon: 'book',
  },
  {
    id: 'mealprep',
    tier: 5,
    title: 'Еда на два дня',
    short: 'Заготовки',
    hint: 'Приготовь и разложи по контейнерам обеды на завтра и послезавтра',
    stat: 'body',
    icon: 'campfire',
    hours: [9, 21],
  },
  {
    id: 'letter',
    tier: 5,
    title: 'Письмо себе через год',
    short: 'Письмо себе',
    hint: 'Честно: где ты сейчас, чего хочешь, что бросишь. Сохрани и поставь напоминание',
    stat: 'mind',
    icon: 'pen',
  },
  {
    id: 'budget',
    tier: 5,
    title: 'Разбор трат',
    short: 'Траты',
    hint: 'Все траты за месяц в одну таблицу, три статьи урезать уже с завтра',
    stat: 'deal',
    icon: 'coin',
  },
  {
    id: 'weekplan',
    tier: 5,
    title: 'Разбор недели',
    short: 'План недели',
    hint: 'Все заметки и напоминалки в один список, план на 7 дней, лишнее вычеркнуть',
    stat: 'deal',
    icon: 'pen',
  },
]

export const plinkoTaskById = (id: string) => PLINKO_POOL.find((t) => t.id === id)

/** 0..23 clock hour → game hour 4..27 */
const gameHour = (hour: number) => (hour < 4 ? hour + 24 : hour)

export function plinkoPool(tier: PlinkoTier, hour: number): PlinkoTask[] {
  const h = gameHour(hour)
  return PLINKO_POOL.filter((t) => t.tier === tier && (!t.hours || (h >= t.hours[0] && h < t.hours[1])))
}

export type DropRef = Pick<PlinkoDrop, 'slot' | 'risk' | 'v'>

export const dropRisk = (d: Pick<PlinkoDrop, 'risk'>) => riskOf(d.risk)
/** v0.7 drops: 16-slot board; v0.6 drops: their risk board */
export const dropTier = (d: DropRef): PlinkoTier => (d.v === 2 ? boardTier(d.slot) : tierOfSlot(d.slot, dropRisk(d)))
export const dropJackpot = (d: DropRef) => (d.v === 2 ? isJackpotSlot(d.slot) : d.slot === 0 || d.slot === slotsOf(dropRisk(d)) - 1)

// ---------- the day's board: 16 different tasks ----------

/** Fisher–Yates with crypto (or a seeded rand in tests) */
function shuffle<T>(list: T[], rand: Rand): T[] {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** tasks of a tier that fit the hour; if the hour leaves too few, the ones without a time window */
function candidates(tier: PlinkoTier, hour: number, taken: Set<string>): PlinkoTask[] {
  const fit = plinkoPool(tier, hour).filter((t) => !taken.has(t.id))
  if (fit.length) return fit
  return PLINKO_POOL.filter((t) => t.tier === tier && !t.hours && !taken.has(t.id))
}

export const isBoard = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length === BOARD_SLOTS && ids.every((x) => typeof x === 'string') && new Set(ids).size === BOARD_SLOTS

/**
 * A fresh random layout for local hour `hour`: every slot gets a task of its tier, all 16 different.
 * `avoid` (today's dropped tasks) is skipped while there is anything else.
 */
export function layoutBoard(hour: number, rand: Rand = cryptoRand, avoid: Iterable<string> = []): string[] {
  const out: string[] = new Array(BOARD_SLOTS)
  const taken = new Set<string>(avoid)
  const onBoard = new Set<string>()
  for (const tier of [5, 4, 3, 2, 1] as PlinkoTier[]) {
    const slots = shuffle(
      BOARD_TIERS.map((t, k) => (t === tier ? k : -1)).filter((k) => k >= 0),
      rand,
    )
    for (const k of slots) {
      let list = candidates(tier, hour, new Set([...taken, ...onBoard]))
      if (!list.length) list = candidates(tier, hour, onBoard)
      if (!list.length) list = PLINKO_POOL.filter((t) => t.tier === tier && !onBoard.has(t.id))
      const pick = list[Math.floor(rand() * list.length)]
      out[k] = pick.id
      onBoard.add(pick.id)
    }
  }
  return out
}

/**
 * Keeps the stored layout and replaces only the slots that went stale: a task already dropped today
 * (`used`), one whose time window is over, or an unknown id. Returns null when nothing changes.
 */
export function refreshBoard(ids: unknown, hour: number, used: Iterable<string> = [], rand: Rand = cryptoRand): string[] | null {
  const usedSet = new Set(used)
  if (!isBoard(ids)) return layoutBoard(hour, rand, usedSet)
  const out = ids.slice()
  let changed = false
  const h = gameHour(hour)
  for (let k = 0; k < BOARD_SLOTS; k++) {
    const t = plinkoTaskById(out[k])
    const tier = BOARD_TIERS[k]
    const stale = !t || t.tier !== tier || usedSet.has(t.id) || (t.hours && !(h >= t.hours[0] && h < t.hours[1]))
    if (!stale) continue
    const list = candidates(tier, hour, new Set([...out, ...usedSet]))
    if (!list.length) continue
    out[k] = list[Math.floor(rand() * list.length)].id
    changed = true
  }
  return changed ? out : null
}

/** The task in slot `slot` of the stored board, or a random fitting one if the board is missing */
export function taskForSlot(ids: unknown, slot: number, hour: number, rand: Rand = cryptoRand): PlinkoTask {
  const tier = boardTier(slot)
  const t = isBoard(ids) ? plinkoTaskById(ids[slot]) : undefined
  if (t && t.tier === tier) return t
  const list = candidates(tier, hour, new Set())
  return list[Math.floor(rand() * list.length)] ?? PLINKO_POOL.find((x) => x.tier === tier)!
}

export function dropDeadline(drop: Pick<PlinkoDrop, 'at' | 'slot' | 'risk' | 'v'>): number {
  return drop.at + PLINKO_TIERS[dropTier(drop)].minutes * 60_000
}

/** closed before its timer ran out and never put off with «Позже» */
export function doneInTime(d: PlinkoDrop): boolean {
  return d.doneAt !== undefined && d.doneAt >= d.at && d.doneAt <= dropDeadline(d) && !(d.laterAt !== undefined && d.laterAt <= d.doneAt)
}

/** Full reward (× the streak) before the timer runs out, half after it */
export function plinkoReward(drop: Pick<PlinkoDrop, 'at' | 'slot' | 'risk' | 'v'>, doneAt: number, streakMult = 1): { xp: number; shards: number; inTime: boolean } {
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

/** Balls left today: 5 a day, no bonus balls */
export function ballsLeft(log: DayLog | undefined): number {
  return Math.max(0, PLINKO_BALLS - plinkoDrops(log).length)
}

/** Next throw number of the day, or null when no balls are left */
export function nextThrow(log: DayLog | undefined): number | null {
  if (ballsLeft(log) <= 0) return null
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
    out.push({
      day,
      at: d.doneAt,
      xp: r.xp,
      shards: r.shards,
      stat: plinkoTaskById(d.taskId)?.stat ?? 'will',
    })
  }
  return out
}

/** Keeps a well-formed drop, drops anything else */
export function sanitizeDrop(raw: unknown): PlinkoDrop | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const n = d.n
  const slot = d.slot
  const v2 = d.v === 2
  const risk = v2 || d.risk === undefined ? undefined : riskOf(d.risk)
  const slots = v2 ? BOARD_SLOTS : slotsOf(risk)
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= PLINKO_MAX) return null
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= slots) return null
  if (typeof d.at !== 'number' || !Number.isFinite(d.at) || typeof d.taskId !== 'string') return null
  const out: PlinkoDrop = { n, at: d.at, slot, taskId: d.taskId }
  if (v2) out.v = 2
  if (risk) out.risk = risk
  if (typeof d.doneAt === 'number' && Number.isFinite(d.doneAt)) out.doneAt = d.doneAt
  if (typeof d.laterAt === 'number' && Number.isFinite(d.laterAt)) out.laterAt = d.laterAt
  return out
}
