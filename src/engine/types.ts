export type StatId = 'energy' | 'body' | 'mind' | 'will' | 'deal'
export type Role = 'main' | 'side'
export type ChapterId = 0 | 1 | 2 | 3
/** Game day key, local calendar date of the game day: YYYY-MM-DD */
export type DayKey = string

export type QuestKind =
  | 'check' // tap to complete
  | 'wake' // auto from morning check-in
  | 'reading' // pages, tied to the current book
  | 'deal' // auto when the Deal of the day is closed
  | 'reels' // auto from evening confession
  | 'bedtime' // auto from confession bedtime
  | 'caffeine' // tap, auto-missed if cola after 14:00
  | 'number' // numeric (steps, minutes)

export interface Quest {
  id: string
  title: string
  stat: StatId
  kind: QuestKind
  /** «если/когда X → Y» */
  ifThen: string
  /** 2-minute version */
  mini: string
  unit?: string
  min?: number
  goal?: number
  /** role per chapter [Пролог, I, II, III], null = inactive */
  roles: [Role | null, Role | null, Role | null, Role | null]
  enabled: boolean
  order: number
  /** quests added later are not active before this day (no retroactive penalties) */
  createdDay?: DayKey
}

export type MarkStatus = 'done' | 'mini' | 'skip'

export interface QuestMark {
  status: MarkStatus
  value?: number
  at: number
}

export interface CheckIn {
  wake: string // HH:MM
  sleep: number // 1..5
  energy: number // 1..5
  at: number
}

export type SugarAnswer = 'none' | 'slot' | 'outside'

export interface Confession {
  reelsMin: number
  sugar: SugarAnswer
  colaAfter14: boolean
  bedtime: string // HH:MM
  main: string
  at: number
}

export interface PlannedQuest {
  id: string
  role: Role
  base: boolean
  stat: StatId
}

export interface DayLog {
  quests: Record<string, QuestMark>
  checkin?: CheckIn
  confession?: Confession
  /** user asked to spend a freeze for this day */
  freeze?: boolean
  /** snapshot of active quests, written once the day is closed */
  plan?: PlannedQuest[]
  dealTaskId?: string
  /** v0.3 «Судьба дня»: the quest/task picked by the spin and its focus timer */
  destiny?: Destiny
  /** v0.3 «План дня»: time blocks on the 24h ring */
  blocks?: TimeBlock[]
  /** v0.4 «Сегодня качаю»: a skill node as the Deal of the day; a practice on it closes the quest */
  dealNodeId?: string
  /** v0.6 «Судьба дня» Плинко: throws of the day by throw number ("0", "1") */
  plinko?: Record<string, PlinkoDrop>
  /** v0.7 Плинко: the day's 16 slots (PLINKO_POOL ids or '@reroll' / '@rest', slot 0 = left edge), laid out once at random */
  plinkoBoard?: string[]
  /** «Утренняя инвестиция»: the warm-up program was finished at, ms (a partial run writes nothing) */
  morningAt?: number
}

export interface Destiny {
  ref: 'quest' | 'task'
  id: string
  /** focus timer start, ms */
  startedAt: number
  minutes: number
}

/** One Plinko throw. v0.7 (`v: 2`): the slot came out of the physics and is stored as is. */
export interface PlinkoDrop {
  /** throw number of the day, 0-based */
  n: number
  /** thrown at, ms: the task timer starts here */
  at: number
  /** 0..slots-1, centre = easy, edges = hard */
  slot: number
  /** PLINKO_POOL id (or a removed task's id), or '@reroll' / '@rest' for a special slot */
  taskId: string
  /** «Сделал» */
  doneAt?: number
  /** risk of the board; missing = 'mid' */
  risk?: PlinkoRisk
  /** «Позже» pressed: the streak resets */
  laterAt?: number
  /** 2 = v0.7 16-slot physics board; missing = v0.6 risk board */
  v?: 2
}

export type PlinkoRisk = 'low' | 'mid' | 'high'

export interface TimeBlock {
  id: string
  /** minutes from 00:00 of the calendar day, 0..1439 */
  start: number
  /** minutes, 5..720 */
  dur: number
  title: string
  stat?: StatId
  ref?: { kind: 'quest' | 'task'; id: string }
}

export type TaskScope = 'deal' | 'daily'

export interface Task {
  id: string
  parentId: string | null
  title: string
  stat: StatId
  scope: TaskScope
  /** for daily tasks: the day it is scheduled on */
  day?: DayKey
  createdAt: number
  doneAt?: number
  doneDay?: DayKey
  postponed: number
  order: number
}

export type SlipWhat = 'reels' | 'chocolate' | 'cola' | 'sleep' | 'skip' | 'other'
export type SlipWhy = 'boredom' | 'tired' | 'stress' | 'company' | 'auto' | 'other'

export interface Slip {
  id: string
  at: number
  day: DayKey
  what: SlipWhat
  why: SlipWhy
  note?: string
  /** created from the confession («сахар вне слота») */
  retro?: boolean
  comebackAt?: number
  swap?: string
}

export interface Craving {
  id: string
  at: number
  day: DayKey
  result: 'won' | 'lost'
  swap: string
}

export type ShopKind = 'chocolate' | 'cola' | 'reels' | 'custom' | 'avatar'

export interface Purchase {
  id: string
  at: number
  day: DayKey
  itemId: string
  title: string
  price: number
  kind: ShopKind
}

export type Rarity = 'common' | 'rare' | 'legendary'

export interface Reward {
  id: string
  title: string
  price: number
  /** pixel icon name (v0.3), optional */
  icon?: string
  /** v0.4 chest prize rarity; missing = not in chests */
  rarity?: Rarity
}

export interface PauseLog {
  id: string
  at: number
  day: DayKey
  app: string
  result: 'resisted' | 'entered'
  minutes?: number
}

export interface Book {
  id: string
  title: string
  total: number
  current: number
  startDay: DayKey
  finishedDay?: DayKey
}

export interface Measurements {
  wake?: string
  screenMin?: number
  colaWeek?: number
  chocoWeek?: number
  pushups?: number
  plankSec?: number
  pullups?: number
  waistCm?: number
  morningFeel?: number
  booksYear?: number
}

export interface Review {
  worked: string
  remove: string
  simplify: string
  at: number
  /** v0.5 «Разбор недели» from the AI helper, applied by the user */
  ai?: string
}

export interface Profile {
  nick: string
  avatar: string
  usualWake: string // HH:MM
  onboardDay: DayKey
  /** v0.3 pixel avatar: item id per slot + colors */
  outfit?: Outfit
}

export type OutfitSlot = 'hat' | 'scarf' | 'coat' | 'mitts' | 'glasses' | 'extra'

export interface Outfit {
  hat?: string
  scarf?: string
  coat?: string
  mitts?: string
  glasses?: string
  extra?: string
  /** swatch id per slot */
  colors?: Partial<Record<OutfitSlot, string>>
  hair?: string
  skin?: string
}

/** v0.5: five extra winter themes on top of «Ночь» (dark) and «Снег» (light) */
export type ThemePref = 'auto' | 'light' | 'dark' | 'polar' | 'aurora' | 'fir' | 'pink' | 'pinkdark'

export interface Settings {
  debugOffsetDays: number
  reelsLimit: number
  defaultSwap: string
  /** added in v0.1.1, optional so older backups stay valid */
  theme?: ThemePref
  snow?: boolean
  /** v0.2: what goes to the party feed (missing = on) */
  share?: Partial<Record<'slips' | 'perfect' | 'boss' | 'level' | 'book', boolean>>
  /** v0.5 «ИИ-помощник»: off by default, turned on only after the consent screen */
  ai?: { on: boolean; consentAt?: number }
  /** v0.6 Плинко: last chosen risk */
  plinkoRisk?: PlinkoRisk
  /** v0.6 sound effects on this device (missing = on) */
  sound?: boolean
  /** v0.5: AI request counter of this device (kept local, never synced) */
  aiUse?: { day: DayKey; n: number; last: number }
  /** v0.7 «Заработано»: publish week / arc totals to the party (missing = off) */
  moneyShare?: boolean
  /** «Утренняя инвестиция»: the final block (squats + push-ups) for men or women; missing = ask on first run */
  morningFinal?: 'm' | 'f'
  /** «Утренняя инвестиция»: ambient music on this device (missing = on, kept local) */
  morningMusic?: boolean
}

export interface Ack {
  missedThrough?: DayKey
  reviewedWeeks: number[]
  finaleSeen?: boolean
  supportMode?: boolean
  checkinSkipped?: DayKey
  /** first-run hints the user has dismissed */
  hints?: string[]
  /** days whose «perfect day» celebration was already shown */
  celebrated?: DayKey[]
}

// ---------- v0.4 «Навыки и прогрессия» ----------

export type SkillStatus = 'active' | 'later'
/** «Кайф» (к чему) or «Боль» (от чего ухожу) */
export type ValueKind = 'joy' | 'pain'

export interface Skill {
  id: string
  title: string
  /** patron stat: practice XP goes there */
  stat: StatId
  icon?: string
  value: string
  valueKind?: ValueKind
  status: SkillStatus
  /** «чего хочешь → что мешает» */
  bridge?: { want?: string; block?: string }
  templateId?: string
  createdAt: number
  order: number
}

/** Характеристика: 1–8 nodes */
export interface Trait {
  id: string
  skillId: string
  title: string
  /** что повышает (+) */
  plus?: string
  /** что понижает (−) */
  minus?: string
  order: number
}

export interface SkillNode {
  id: string
  skillId: string
  traitId: string
  title: string
  /** «как качать» */
  how?: string
  order: number
  createdAt: number
  /** «что попробую иначе» after three practices without progress */
  pivot?: string
  pivotAt?: number
}

export type Trend = 'better' | 'same' | 'worse'

export interface Practice {
  id: string
  skillId: string
  nodeId: string
  day: DayKey
  at: number
  /** one line of feedback: what got better / what broke. Empty → half XP */
  note?: string
  trend?: Trend
}

export type GoalType = 'short' | 'mid' | 'long' | 'repeat'

export interface GoalCheck {
  day: DayKey
  at: number
}

export interface ScalePoint {
  day: DayKey
  value: number
  at: number
}

export interface Goal {
  id: string
  skillId: string
  type: GoalType
  title: string
  /** short → mid, mid → long */
  parentId?: string
  createdAt: number
  order: number
  /** short/repeat: streaks and misses count from this day (reset on «проще» / «поднять») */
  since?: DayKey
  /** short and repeat goals are checked per day */
  checks?: GoalCheck[]
  /** mid / long: closed once */
  doneAt?: number
  doneDay?: DayKey
  /** retired by «Разбить» / «Поднять»: kept for history, not shown */
  archived?: boolean
  /** repeat: times a week */
  perWeek?: number
  /** long: numeric scale, can move both ways */
  scale?: { from: number; to: number; unit?: string; points: ScalePoint[] }
  /** manual deadline, only for things done many times */
  deadline?: DayKey
  /** v0.5 repeat: best streak of fulfilled weeks ever seen (kept even if checks are later removed) */
  bestStreak?: number
}

export interface FlowSession {
  id: string
  day: DayKey
  startedAt: number
  endedAt?: number
  /** planned length, min (default 90, «Не могу начать» = 15) */
  minutes?: number
  skillId?: string
}

/** «Планка»: quest norm step, valid from `from` on */
export interface BarStep {
  id: string
  questId: string
  step: number
  from: DayKey
}

/** Season theme: one skill per chapter, ×1.5 practice XP */
export interface SeasonTheme {
  id: string
  chapter: ChapterId
  skillId: string
}

/** «Сделал больше плана»: once a day per skill */
export interface Extra {
  id: string
  skillId: string
  day: DayKey
  at: number
}

export type ChestType = 'repeat' | 'short' | 'mid'

export interface ChestOpen {
  /** `${day}:${type}` */
  id: string
  day: DayKey
  type: ChestType
  at: number
  rewardId?: string
  rewardTitle?: string
  rarity?: Rarity
}

// ---------- v0.5 duels ----------

export type DuelMetric = 'quests'

/** A 3-day duel in the party. Both sides keep the same record locally; the score travels via public stats. */
export interface Duel {
  /** same id on both sides */
  id: string
  /** challenger user id */
  by: string
  /** opponent user id */
  with: string
  /** first game day of the window */
  start: DayKey
  days: number
  metric: DuelMetric
  /** when the challenge was made (ms): it expires 24 h later if not accepted */
  createdAt: number
  /** accepted: the opponent's moment of accepting, or when the challenger first saw it */
  acceptedAt?: number
  /** the opponent said no (kept so the card stays quiet) */
  declined?: boolean
  /** settled once, by this device: the replay gives the win reward from here */
  result?: DuelResult
}

export interface DuelResult {
  me: number
  them: number
  outcome: 'win' | 'loss' | 'draw'
  /** game day of the settlement: the reward lands on it */
  day: DayKey
  at: number
}

// ---------- v0.7 «Заработано» ----------

/** One earned amount. The note and the source stay private: only week / arc totals may leave the device. */
export interface Income {
  id: string
  /** game day the money is for (default today) */
  day: DayKey
  at: number
  /** whole rubles, > 0 */
  amount: number
  /** a «Дело» project (task id) … */
  projectId?: string
  /** … or own text */
  source?: string
  note?: string
}

export interface AppData {
  schemaVersion: 1
  profile?: Profile
  quests: Quest[]
  days: Record<DayKey, DayLog>
  tasks: Task[]
  slips: Slip[]
  cravings: Craving[]
  purchases: Purchase[]
  rewards: Reward[]
  pauses: PauseLog[]
  books: Book[]
  activeBookId?: string
  baseline: Measurements
  final: Measurements
  reviews: Record<number, Review>
  settings: Settings
  ack: Ack
  // v0.4: optional so old saves and old clients stay valid
  skills?: Skill[]
  traits?: Trait[]
  nodes?: SkillNode[]
  practices?: Practice[]
  goals?: Goal[]
  flows?: FlowSession[]
  bars?: BarStep[]
  themes?: SeasonTheme[]
  extras?: Extra[]
  chests?: ChestOpen[]
  /** v0.5 */
  duels?: Duel[]
  /** v0.7 */
  incomes?: Income[]
}
