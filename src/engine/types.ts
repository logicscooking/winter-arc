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

export type ShopKind = 'chocolate' | 'cola' | 'reels' | 'custom'

export interface Purchase {
  id: string
  at: number
  day: DayKey
  itemId: string
  title: string
  price: number
  kind: ShopKind
}

export interface Reward {
  id: string
  title: string
  price: number
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
}

export interface Profile {
  nick: string
  avatar: string
  usualWake: string // HH:MM
  onboardDay: DayKey
}

export type ThemePref = 'auto' | 'light' | 'dark'

export interface Settings {
  debugOffsetDays: number
  reelsLimit: number
  defaultSwap: string
  /** added in v0.1.1, optional so older backups stay valid */
  theme?: ThemePref
  snow?: boolean
  /** v0.2: what goes to the party feed (missing = on) */
  share?: Partial<Record<'slips' | 'perfect' | 'boss' | 'level' | 'book', boolean>>
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
}
