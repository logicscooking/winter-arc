import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  STORAGE_KEY,
  activeQuestsFor,
  carryOver,
  createInitialData,
  daysNeedingSnapshot,
  descendantIds,
  gameDayOf,
  normalizeData,
  statusFromValue,
  uid,
  isSlotId,
  migrateAreas,
  shiftNow,
  sanitizeEvent,
  DUMP_TEXT_MAX,
  JOURNAL_TEXT_MAX,
  JOURNAL_PROMPTS,
  bumpProgress,
  sanitizeRecap,
  sanitizeWeekGoal,
  weekOfDay,
  sanitizeArcGoal,
  materializeTactics,
  ARC_LIMITS,
} from '../engine'
import type {
  AppData,
  Book,
  CheckIn,
  Confession,
  DayKey,
  DayLog,
  MarkStatus,
  Measurements,
  QuestMark,
  Profile,
  Quest,
  Review,
  Reward,
  Settings,
  ShopKind,
  SlipWhat,
  SlipWhy,
  StatId,
  Task,
  TaskScope,
  Ack,
  Destiny,
  PlinkoDrop,
  Outfit,
  PlanBlock,
  ChapterId,
  ChestType,
  FlowBlock,
  Goal,
  Materialized,
  Skill,
  SkillNode,
  SkillStatus,
  Trait,
  Trend,
  Duel,
  CalEvent,
  PlanDraft,
  WeekGoal,
  WeekRecap,
  ArcGoal,
} from '../engine'
import { MAX_ACTIVE_SKILLS, MONEY_MAX, MONEY_NOTE_MAX, MONEY_SOURCE_MAX, PRACTICE_LIMIT, barMin, canStartFlow, chestsFor, extraUsed, pityCount, practicesToday, rollChest, shopChestId } from '../engine'

type Fn = (d: AppData) => void

interface Store {
  data: AppData
  update: (fn: Fn) => void
  onboard: (p: Profile, baseline: Measurements) => void
  setMark: (day: DayKey, questId: string, status: MarkStatus | null, now: Date) => void
  setValue: (day: DayKey, questId: string, value: number, now: Date) => void
  /** undo: put a quest mark back exactly as it was (book pages follow) */
  restoreMark: (day: DayKey, questId: string, prev: QuestMark | undefined) => void
  saveCheckin: (day: DayKey, c: Omit<CheckIn, 'at'>, now: Date) => void
  saveConfession: (day: DayKey, c: Omit<Confession, 'at'>, resolutions: Record<string, MarkStatus>, freeze: boolean, now: Date) => void
  addSlip: (what: SlipWhat, why: SlipWhy, note: string, now: Date) => string
  comeback: (slipId: string, swap: string, now: Date) => void
  addCraving: (result: 'won' | 'lost', swap: string, now: Date) => void
  buy: (item: { itemId: string; title: string; price: number; kind: ShopKind }, now: Date) => string
  undoPurchase: (id: string) => void
  addReward: (title: string, price: number, icon?: string) => void
  removeReward: (id: string) => void
  updateReward: (id: string, patch: Partial<Reward>) => void
  logPause: (app: string, result: 'resisted' | 'entered', minutes: number | undefined, now: Date) => void
  addTask: (scope: TaskScope, parentId: string | null, title: string, now: Date, stat?: StatId) => string
  toggleTask: (id: string, now: Date) => void
  renameTask: (id: string, title: string) => void
  deleteTask: (id: string) => void
  setDeal: (day: DayKey, taskId: string | null) => void
  updateQuest: (id: string, patch: Partial<Quest>) => void
  addQuest: (q: Omit<Quest, 'id' | 'order'>, today: DayKey) => void
  removeQuest: (id: string) => void
  addBook: (title: string, total: number, current: number, today: DayKey) => void
  updateBook: (id: string, patch: Partial<Book>) => void
  setActiveBook: (id: string) => void
  setMeasurements: (which: 'baseline' | 'final', m: Measurements) => void
  saveReview: (week: number, r: Omit<Review, 'at'>) => void
  setAck: (patch: Partial<Ack>) => void
  setOutfit: (patch: Partial<Outfit>) => void
  setDestiny: (day: DayKey, d: Destiny | null) => void
  /** v0.6 Плинко: record a throw (ignored when the slot number is taken) */
  addPlinkoDrop: (day: DayKey, drop: PlinkoDrop) => void
  /** v0.6 Плинко: «Сделал» (at) or undo (null) */
  setPlinkoDone: (day: DayKey, n: number, at: number | null) => void
  /** v0.6 Плинко: «Позже» (resets the streak) */
  setPlinkoLater: (day: DayKey, n: number, at: number) => void
  /** v0.7: the day's 16 slot tasks */
  setPlinkoBoard: (day: DayKey, ids: string[]) => void
  // ---- v0.9 «План дня» ----
  /** add or replace a block of the day */
  putPlanBlock: (day: DayKey, b: PlanBlock) => void
  /** remove a block; what was inside goes back to «Без времени» */
  removePlanBlock: (day: DayKey, id: string) => void
  /** replace all blocks of the day (a template); assignments to removed blocks are dropped */
  setPlanBlocks: (day: DayKey, blocks: PlanBlock[]) => void
  /** put a plan item (`quest:id`, `task:id`, …) into a block, or back to «Без времени» (null) */
  assignPlan: (day: DayKey, key: string, blockId: string | null) => void
  /** «Переход»: a fixed slot (`t12`, `t15`, `t18`) or a legacy block: done at (ms) or undo (null) */
  setTransition: (day: DayKey, blockId: string, at: number | null) => void
  // ---- «Сферы» ----
  /** a one-off event of «Разное»; null when the title or the date is not valid */
  addEvent: (x: { title: string; date: DayKey; time?: string; note?: string }, now: Date) => string | null
  updateEvent: (id: string, patch: Partial<Pick<CalEvent, 'title' | 'date' | 'time' | 'note'>>, now: Date) => void
  toggleEvent: (id: string, now: Date) => void
  deleteEvent: (id: string) => void
  // ---- «Неделя» ----
  /** goals of a week (Monday key); blank titles are skipped. Returns how many were added */
  addWeekGoals: (week: DayKey, list: (PlanDraft & { private?: boolean })[], now: Date) => number
  updateWeekGoal: (id: string, patch: Partial<Pick<WeekGoal, 'title' | 'target' | 'unit' | 'private' | 'done' | 'progress'>>, now: Date) => void
  /** +/− on a numeric goal */
  bumpWeekGoal: (id: string, delta: number, now: Date) => void
  deleteWeekGoal: (id: string) => void
  /** «Итог недели»: merge a patch into the week's итог (created on first edit) */
  setRecap: (week: DayKey, patch: Partial<Omit<WeekRecap, 'id' | 'updatedAt'>>, now: Date) => void
  /** «Вечерний дневник»: one answer; blank text removes it */
  setJournal: (day: DayKey, promptId: string, text: string, now: Date) => void
  /** «Выброс мыслей»: the day's free text; blank removes it */
  setDump: (day: DayKey, text: string, now: Date) => void
  /** v0.10: a project task «на сегодня» for a day (on) or not (off) */
  setPick: (day: DayKey, taskId: string, on: boolean, now: Date) => void
  /** a custom task of a plan day: a daily task on that day (the same list as on «Сегодня») */
  addDayTask: (day: DayKey, title: string, now: Date) => string
  /** «Утренняя инвестиция» finished: once per game day, a later finish keeps the first */
  finishMorning: (day: DayKey, at: number) => void
  setSettings: (patch: Partial<Settings>) => void
  // ---- v0.4 skills ----
  createSkill: (m: Materialized) => SkillStatus
  updateSkill: (id: string, patch: Partial<Skill>) => void
  /** false if 3 skills are already active */
  setSkillStatus: (id: string, status: SkillStatus) => boolean
  deleteSkill: (id: string) => void
  addTrait: (skillId: string, title: string) => void
  updateTrait: (id: string, patch: Partial<Trait>) => void
  deleteTrait: (id: string) => void
  addNode: (skillId: string, traitId: string, title: string, how: string | undefined, now: Date) => string
  updateNode: (id: string, patch: Partial<SkillNode>) => void
  deleteNode: (id: string) => void
  /** null when the node already has 3 practices today */
  addPractice: (nodeId: string, note: string, trend: Trend | undefined, now: Date) => string | null
  addGoal: (g: Omit<Goal, 'id' | 'createdAt' | 'order'>, now: Date) => string
  updateGoal: (id: string, patch: Partial<Goal>) => void
  deleteGoal: (id: string) => void
  /** short/repeat: today's tick; mid/long: done */
  toggleGoal: (id: string, now: Date) => void
  addScalePoint: (id: string, value: number, now: Date) => void
  startFlow: (now: Date, minutes?: number, skillId?: string) => FlowBlock & { id?: string }
  stopFlow: (id: string, now: Date) => void
  setTheme: (chapter: ChapterId, skillId: string | null) => void
  setBar: (questId: string, step: number, from: DayKey) => void
  addExtra: (skillId: string, now: Date) => boolean
  setDealNode: (day: DayKey, nodeId: string | null) => void
  openChest: (type: ChestType, now: Date) => string | null
  /** v0.16 «Сундук за WF»: the purchase and its prize (seeded by the purchase id); returns the purchase id */
  buyChest: (price: number, now: Date) => string
  // ---- v0.5 ----
  /** keeps the best streak of a repeat goal once it is beaten */
  setBestStreak: (goalId: string, best: number) => void
  /** adds a whole duel record (a new challenge or an accepted one) */
  putDuel: (d: Duel) => void
  patchDuel: (id: string, patch: Partial<Duel>) => void
  removeDuel: (id: string) => void
  // ---- v0.7 «Заработано» ----
  /** null when the amount or the day is not valid */
  addIncome: (x: { amount: number; day: DayKey; projectId?: string; source?: string; note?: string }, now: Date) => string | null
  deleteIncome: (id: string) => void
  // ---- «13 недель» ----
  /** add or replace an arc goal (tactics nested); false when invalid or over the limit */
  putArcGoal: (g: ArcGoal, now: Date) => boolean
  deleteArcGoal: (id: string) => void
  /** this week's tactics become week goals (once per tactic and week) */
  syncTactics: (now: Date) => void
  importData: (raw: unknown) => void
  resetAll: () => void
  finalize: (now: Date) => void
}

const dayLog = (d: AppData, day: DayKey): DayLog => (d.days[day] ??= { quests: {} })

/** v0.9 «План дня»: assignments and transitions of blocks that are gone, and empty maps, go away */
function dropPlanOrphans(log: DayLog) {
  const blocks = log.dayBlocks ?? {}
  for (const [k, v] of Object.entries(log.assign ?? {})) if (!blocks[v]) delete log.assign![k]
  // fixed «Сферы» slots (t12 / t15 / t18) are not tied to a block
  for (const id of Object.keys(log.transitions ?? {})) if (!blocks[id] && !isSlotId(id)) delete log.transitions![id]
  if (log.dayBlocks && !Object.keys(log.dayBlocks).length) delete log.dayBlocks
  if (log.assign && !Object.keys(log.assign).length) delete log.assign
  if (log.transitions && !Object.keys(log.transitions).length) delete log.transitions
}

function applyReadingDelta(d: AppData, delta: number, day: DayKey) {
  const book = d.books.find((b) => b.id === d.activeBookId)
  if (!book || !delta) return
  book.current = Math.max(0, Math.min(book.total, book.current + delta))
  if (book.current >= book.total && !book.finishedDay) book.finishedDay = day
  if (book.current < book.total) book.finishedDay = undefined
}

/** «Сферы»: new quests join from the current game day (the debug clock included) */
const withAreas = (d: AppData) => migrateAreas(d, gameDayOf(shiftNow(new Date(), d.settings.debugOffsetDays ?? 0)))

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const update = (fn: Fn) => {
        const next = structuredClone(get().data)
        fn(next)
        set({ data: next })
      }
      return {
        data: createInitialData(),
        update,
        onboard: (p, baseline) =>
          update((d) => {
            d.profile = p
            d.baseline = { ...d.baseline, ...baseline }
          }),
        setMark: (day, questId, status, now) =>
          update((d) => {
            const log = dayLog(d, day)
            const prev = log.quests[questId]
            if (status === null) {
              const q = d.quests.find((x) => x.id === questId)
              if (q?.kind === 'reading' && prev?.value) applyReadingDelta(d, -prev.value, day)
              delete log.quests[questId]
            } else log.quests[questId] = { ...prev, status, at: now.getTime() }
          }),
        setValue: (day, questId, value, now) =>
          update((d) => {
            const q = d.quests.find((x) => x.id === questId)
            if (!q) return
            const log = dayLog(d, day)
            const prev = log.quests[questId]?.value ?? 0
            const v = Math.max(0, Math.round(value))
            if (q.kind === 'reading') applyReadingDelta(d, v - prev, day)
            const status = statusFromValue(q, v, barMin(d, questId, day))
            if (!status) delete log.quests[questId]
            else log.quests[questId] = { status, value: v, at: now.getTime() }
          }),
        restoreMark: (day, questId, prev) =>
          update((d) => {
            const log = dayLog(d, day)
            const cur = log.quests[questId]
            const q = d.quests.find((x) => x.id === questId)
            if (q?.kind === 'reading') applyReadingDelta(d, (prev?.value ?? 0) - (cur?.value ?? 0), day)
            if (prev) log.quests[questId] = { ...prev }
            else delete log.quests[questId]
          }),
        saveCheckin: (day, c, now) =>
          update((d) => {
            dayLog(d, day).checkin = { ...c, at: now.getTime() }
          }),
        saveConfession: (day, c, resolutions, freeze, now) =>
          update((d) => {
            const log = dayLog(d, day)
            const at = now.getTime()
            log.confession = { ...c, at }
            log.freeze = freeze || undefined
            for (const [id, status] of Object.entries(resolutions)) {
              if (!log.quests[id]) log.quests[id] = { status, at }
            }
            if (c.sugar === 'outside' && !d.slips.some((s) => s.retro && s.day === day)) {
              d.slips.push({ id: uid(), at, day, what: 'chocolate', why: 'other', note: 'Сахар вне слота (из исповеди)', retro: true })
            }
            log.plan = activeQuestsFor(d.quests, day)
          }),
        addSlip: (what, why, note, now) => {
          const id = uid()
          update((d) => {
            d.slips.push({ id, at: now.getTime(), day: gameDayOf(now), what, why, note: note || undefined })
          })
          return id
        },
        comeback: (slipId, swap, now) =>
          update((d) => {
            const s = d.slips.find((x) => x.id === slipId)
            if (s && !s.comebackAt) {
              s.comebackAt = now.getTime()
              s.swap = swap
            }
          }),
        addCraving: (result, swap, now) =>
          update((d) => {
            d.cravings.push({ id: uid(), at: now.getTime(), day: gameDayOf(now), result, swap })
          }),
        buy: (item, now) => {
          const id = uid()
          update((d) => {
            d.purchases.push({ id, at: now.getTime(), day: gameDayOf(now), ...item })
          })
          return id
        },
        undoPurchase: (id) =>
          update((d) => {
            d.purchases = d.purchases.filter((p) => p.id !== id)
            // a bought chest goes back with its prize
            if (d.chests?.some((c) => c.id === shopChestId(id))) d.chests = d.chests.filter((c) => c.id !== shopChestId(id))
          }),
        addReward: (title, price, icon) => update((d) => void d.rewards.push(icon ? { id: uid(), title, price, icon } : { id: uid(), title, price })),
        updateReward: (id, patch) =>
          update((d) => {
            const r = d.rewards.find((x) => x.id === id)
            if (!r) return
            Object.assign(r, patch)
            if (!r.rarity) delete r.rarity
          }),
        removeReward: (id) => update((d) => void (d.rewards = d.rewards.filter((r) => r.id !== id))),
        logPause: (app, result, minutes, now) =>
          update((d) => {
            d.pauses.push({ id: uid(), at: now.getTime(), day: gameDayOf(now), app, result, minutes })
          }),
        addTask: (scope, parentId, title, now, stat = 'deal') => {
          const id = uid()
          update((d) => {
            const parent = parentId ? d.tasks.find((t) => t.id === parentId) : undefined
            const siblings = d.tasks.filter((t) => t.parentId === parentId && t.scope === scope)
            d.tasks.push({
              id,
              parentId,
              title,
              stat: parent?.stat ?? stat,
              scope,
              day: scope === 'daily' ? parent?.day ?? gameDayOf(now) : undefined,
              createdAt: now.getTime(),
              postponed: 0,
              order: siblings.length,
            })
          })
          return id
        },
        toggleTask: (id, now) =>
          update((d) => {
            const t = d.tasks.find((x) => x.id === id)
            if (!t) return
            if (t.doneAt) {
              t.doneAt = undefined
              t.doneDay = undefined
            } else {
              t.doneAt = now.getTime()
              t.doneDay = gameDayOf(now)
            }
          }),
        renameTask: (id, title) =>
          update((d) => {
            const t = d.tasks.find((x) => x.id === id)
            if (t) t.title = title
          }),
        deleteTask: (id) =>
          update((d) => {
            const ids = new Set([id, ...descendantIds(d.tasks, id)])
            d.tasks = d.tasks.filter((t: Task) => !ids.has(t.id))
            for (const log of Object.values(d.days)) if (log.dealTaskId && ids.has(log.dealTaskId)) delete log.dealTaskId
          }),
        setDeal: (day, taskId) =>
          update((d) => {
            const log = dayLog(d, day)
            if (taskId) log.dealTaskId = taskId
            else delete log.dealTaskId
          }),
        updateQuest: (id, patch) =>
          update((d) => {
            const q = d.quests.find((x) => x.id === id)
            if (q) Object.assign(q, patch)
          }),
        addQuest: (q, today) =>
          update((d) => {
            d.quests.push({ ...q, id: uid(), order: d.quests.length, createdDay: today })
          }),
        removeQuest: (id) =>
          update((d) => {
            const q = d.quests.find((x) => x.id === id)
            if (q) q.enabled = false
          }),
        addBook: (title, total, current, today) =>
          update((d) => {
            const id = uid()
            d.books.push({ id, title, total, current, startDay: today })
            d.activeBookId = id
          }),
        updateBook: (id, patch) =>
          update((d) => {
            const b = d.books.find((x) => x.id === id)
            if (!b) return
            Object.assign(b, patch)
            if (b.current >= b.total && !b.finishedDay) b.finishedDay = patch.finishedDay ?? b.startDay
          }),
        setActiveBook: (id) => update((d) => void (d.activeBookId = id)),
        setMeasurements: (which, m) => update((d) => void (d[which] = { ...m })),
        saveReview: (week, r) => update((d) => void (d.reviews[week] = { ...r, at: Date.now() })),
        setAck: (patch) => update((d) => void Object.assign(d.ack, patch)),
        setOutfit: (patch) =>
          update((d) => {
            if (!d.profile) return
            const cur = d.profile.outfit ?? {}
            d.profile.outfit = { ...cur, ...patch, colors: { ...(cur.colors ?? {}), ...(patch.colors ?? {}) } }
          }),
        setDestiny: (day, z) =>
          update((d) => {
            const log = dayLog(d, day)
            if (z) log.destiny = z
            else delete log.destiny
          }),
        addPlinkoDrop: (day, drop) =>
          update((d) => {
            const log = dayLog(d, day)
            const map = (log.plinko ??= {})
            if (!map[String(drop.n)]) map[String(drop.n)] = drop
          }),
        setPlinkoDone: (day, n, at) =>
          update((d) => {
            const drop = d.days[day]?.plinko?.[String(n)]
            if (!drop) return
            if (at === null) delete drop.doneAt
            else drop.doneAt = at
          }),
        setPlinkoBoard: (day, ids) =>
          update((d) => {
            dayLog(d, day).plinkoBoard = ids.slice()
          }),
        setPlinkoLater: (day, n, at) =>
          update((d) => {
            const drop = d.days[day]?.plinko?.[String(n)]
            if (drop && drop.doneAt === undefined && drop.laterAt === undefined) drop.laterAt = at
          }),
        putPlanBlock: (day, b) =>
          update((d) => {
            const log = dayLog(d, day)
            ;(log.dayBlocks ??= {})[b.id] = { ...b }
          }),
        removePlanBlock: (day, id) =>
          update((d) => {
            const log = d.days[day]
            if (!log?.dayBlocks?.[id]) return
            delete log.dayBlocks[id]
            dropPlanOrphans(log)
          }),
        setPlanBlocks: (day, blocks) =>
          update((d) => {
            const log = dayLog(d, day)
            log.dayBlocks = Object.fromEntries(blocks.map((b) => [b.id, { ...b }]))
            dropPlanOrphans(log)
          }),
        assignPlan: (day, key, blockId) =>
          update((d) => {
            const log = dayLog(d, day)
            if (blockId && log.dayBlocks?.[blockId]) (log.assign ??= {})[key] = blockId
            else if (log.assign) {
              delete log.assign[key]
              if (!Object.keys(log.assign).length) delete log.assign
            }
          }),
        setTransition: (day, blockId, at) =>
          update((d) => {
            const log = dayLog(d, day)
            if (at !== null && (log.dayBlocks?.[blockId] || isSlotId(blockId))) {
              if (!log.transitions?.[blockId]) (log.transitions ??= {})[blockId] = at
            } else if (log.transitions) {
              delete log.transitions[blockId]
              if (!Object.keys(log.transitions).length) delete log.transitions
            }
          }),
        setPick: (day, taskId, on, now) =>
          update((d) => {
            const log = dayLog(d, day)
            if (on) (log.picks ??= {})[taskId] = now.getTime()
            else if (log.picks) {
              delete log.picks[taskId]
              if (!Object.keys(log.picks).length) delete log.picks
            }
          }),
        addDayTask: (day, title, now) => {
          const id = uid()
          update((d) => {
            const siblings = d.tasks.filter((t) => t.parentId === null && t.scope === 'daily')
            d.tasks.push({ id, parentId: null, title, stat: 'deal', scope: 'daily', day, createdAt: now.getTime(), postponed: 0, order: siblings.length })
          })
          return id
        },
        addEvent: (x, now) => {
          const id = uid()
          const ev = sanitizeEvent({ ...x, id, updatedAt: now.getTime() })
          if (!ev) return null
          update((d) => void (d.events ??= []).push(ev))
          return id
        },
        updateEvent: (id, patch, now) =>
          update((d) => {
            const i = (d.events ?? []).findIndex((e) => e.id === id)
            if (i < 0) return
            const cur = d.events![i]
            const ev = sanitizeEvent({ ...cur, ...patch, updatedAt: now.getTime() })
            if (ev) d.events![i] = ev
          }),
        toggleEvent: (id, now) =>
          update((d) => {
            const ev = d.events?.find((e) => e.id === id)
            if (!ev) return
            if (ev.doneAt) delete ev.doneAt
            else ev.doneAt = now.getTime()
            ev.updatedAt = now.getTime()
          }),
        deleteEvent: (id) => update((d) => void (d.events = (d.events ?? []).filter((e) => e.id !== id))),
        addWeekGoals: (week, list, now) => {
          const key = weekOfDay(week)
          const t = now.getTime()
          const items = list.map((x) => ({ ...x, title: x.title.trim() })).filter((x) => x.title)
          if (!items.length) return 0
          update((d) => {
            const goals = (d.weekGoals ??= [])
            let order = goals.filter((g) => g.week === key).reduce((m, g) => Math.max(m, g.order + 1), 0)
            for (const x of items) {
              const g = sanitizeWeekGoal({ id: uid(), week: key, title: x.title, target: x.target, unit: x.unit, private: x.private, order: order++, createdAt: t, updatedAt: t })
              if (g) goals.push(g)
            }
          })
          return items.length
        },
        updateWeekGoal: (id, patch, now) =>
          update((d) => {
            const i = (d.weekGoals ?? []).findIndex((g) => g.id === id)
            if (i < 0) return
            const merged: Record<string, unknown> = { ...d.weekGoals![i], ...patch, updatedAt: now.getTime() }
            // explicit undefined in the patch clears the field
            for (const [k, v] of Object.entries(patch)) if (v === undefined || v === false) delete merged[k]
            const g = sanitizeWeekGoal(merged)
            if (g) d.weekGoals![i] = g
          }),
        bumpWeekGoal: (id, delta, now) =>
          update((d) => {
            const i = (d.weekGoals ?? []).findIndex((g) => g.id === id)
            if (i >= 0) d.weekGoals![i] = bumpProgress(d.weekGoals![i], delta, now.getTime())
          }),
        deleteWeekGoal: (id) => update((d) => void (d.weekGoals = (d.weekGoals ?? []).filter((g) => g.id !== id))),
        setRecap: (week, patch, now) =>
          update((d) => {
            const key = weekOfDay(week)
            const list = (d.weekRecaps ??= [])
            const i = list.findIndex((r) => r.id === key)
            const cur = i >= 0 ? list[i] : { id: key, insights: [], fails: [], nextPlan: [], updatedAt: 0 }
            const merged: Record<string, unknown> = { ...cur, ...patch, id: key, updatedAt: now.getTime() }
            for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k]
            const r = sanitizeRecap(merged)
            if (!r) return
            if (i >= 0) list[i] = r
            else list.push(r)
          }),
        setJournal: (day, promptId, text, now) =>
          update((d) => {
            if (!JOURNAL_PROMPTS.some((p) => p.id === promptId)) return
            const log = dayLog(d, day)
            const t = text.slice(0, JOURNAL_TEXT_MAX)
            if (t.trim()) {
              if (log.journal?.[promptId]?.text === t) return
              ;(log.journal ??= {})[promptId] = { text: t, at: now.getTime() }
            } else if (log.journal) {
              delete log.journal[promptId]
              if (!Object.keys(log.journal).length) delete log.journal
            }
          }),
        setDump: (day, text, now) =>
          update((d) => {
            const log = dayLog(d, day)
            const t = text.slice(0, DUMP_TEXT_MAX)
            if (!t.trim()) delete log.dump
            else if (log.dump?.text !== t) log.dump = { text: t, at: log.dump?.at ?? now.getTime() }
          }),
        setSettings: (patch) => update((d) => void Object.assign(d.settings, patch)),
        finishMorning: (day, at) =>
          update((d) => {
            const log = dayLog(d, day)
            if (log.morningAt === undefined) log.morningAt = at
          }),

        // ---------- v0.4 skills ----------
        createSkill: (m) => {
          const active = (get().data.skills ?? []).filter((s) => s.status === 'active').length
          const status: SkillStatus = m.skill.status === 'active' && active >= MAX_ACTIVE_SKILLS ? 'later' : m.skill.status
          update((d) => {
            ;(d.skills ??= []).push({ ...m.skill, status, order: d.skills.length })
            ;(d.traits ??= []).push(...m.traits)
            ;(d.nodes ??= []).push(...m.nodes)
            ;(d.goals ??= []).push(...m.goals)
          })
          return status
        },
        updateSkill: (id, patch) =>
          update((d) => {
            const s = d.skills?.find((x) => x.id === id)
            if (s) Object.assign(s, patch)
          }),
        setSkillStatus: (id, status) => {
          const list = get().data.skills ?? []
          if (status === 'active' && list.filter((s) => s.status === 'active' && s.id !== id).length >= MAX_ACTIVE_SKILLS) return false
          update((d) => {
            const s = d.skills?.find((x) => x.id === id)
            if (s) s.status = status
          })
          return true
        },
        deleteSkill: (id) =>
          update((d) => {
            const nodeIds = new Set((d.nodes ?? []).filter((n) => n.skillId === id).map((n) => n.id))
            d.skills = (d.skills ?? []).filter((s) => s.id !== id)
            d.traits = (d.traits ?? []).filter((t) => t.skillId !== id)
            d.nodes = (d.nodes ?? []).filter((n) => n.skillId !== id)
            d.practices = (d.practices ?? []).filter((p) => p.skillId !== id)
            d.goals = (d.goals ?? []).filter((g) => g.skillId !== id)
            d.extras = (d.extras ?? []).filter((e) => e.skillId !== id)
            d.themes = (d.themes ?? []).filter((t) => t.skillId !== id)
            for (const log of Object.values(d.days)) if (log.dealNodeId && nodeIds.has(log.dealNodeId)) delete log.dealNodeId
          }),
        addTrait: (skillId, title) =>
          update((d) => {
            const n = (d.traits ?? []).filter((t) => t.skillId === skillId).length
            ;(d.traits ??= []).push({ id: uid(), skillId, title, order: n })
          }),
        updateTrait: (id, patch) =>
          update((d) => {
            const t = d.traits?.find((x) => x.id === id)
            if (t) Object.assign(t, patch)
          }),
        deleteTrait: (id) =>
          update((d) => {
            const nodeIds = new Set((d.nodes ?? []).filter((n) => n.traitId === id).map((n) => n.id))
            d.traits = (d.traits ?? []).filter((t) => t.id !== id)
            d.nodes = (d.nodes ?? []).filter((n) => !nodeIds.has(n.id))
            d.practices = (d.practices ?? []).filter((p) => !nodeIds.has(p.nodeId))
          }),
        addNode: (skillId, traitId, title, how, now) => {
          const id = uid()
          update((d) => {
            const n = (d.nodes ?? []).filter((x) => x.traitId === traitId).length
            ;(d.nodes ??= []).push({ id, skillId, traitId, title, ...(how ? { how } : {}), order: n, createdAt: now.getTime() })
          })
          return id
        },
        updateNode: (id, patch) =>
          update((d) => {
            const n = d.nodes?.find((x) => x.id === id)
            if (n) Object.assign(n, patch)
          }),
        deleteNode: (id) =>
          update((d) => {
            d.nodes = (d.nodes ?? []).filter((n) => n.id !== id)
            d.practices = (d.practices ?? []).filter((p) => p.nodeId !== id)
            for (const log of Object.values(d.days)) if (log.dealNodeId === id) delete log.dealNodeId
          }),
        addPractice: (nodeId, note, trend, now) => {
          const data = get().data
          const node = data.nodes?.find((n) => n.id === nodeId)
          const day = gameDayOf(now)
          if (!node || practicesToday(data, nodeId, day) >= PRACTICE_LIMIT) return null
          const id = uid()
          const text = note.trim()
          update((d) => {
            ;(d.practices ??= []).push({ id, skillId: node.skillId, nodeId, day, at: now.getTime(), ...(text ? { note: text.slice(0, 200) } : {}), ...(trend ? { trend } : {}) })
          })
          return id
        },
        addGoal: (g, now) => {
          const id = uid()
          update((d) => {
            const n = (d.goals ?? []).filter((x) => x.skillId === g.skillId).length
            ;(d.goals ??= []).push({ ...g, id, createdAt: now.getTime(), order: n, since: g.since ?? gameDayOf(now), ...(g.type === 'short' || g.type === 'repeat' ? { checks: g.checks ?? [] } : {}) })
          })
          return id
        },
        updateGoal: (id, patch) =>
          update((d) => {
            const g = d.goals?.find((x) => x.id === id)
            if (g) Object.assign(g, patch)
          }),
        deleteGoal: (id) =>
          update((d) => {
            const g = d.goals?.find((x) => x.id === id)
            d.goals = (d.goals ?? []).filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: g?.parentId } : x))
          }),
        toggleGoal: (id, now) =>
          update((d) => {
            const g = d.goals?.find((x) => x.id === id)
            if (!g) return
            const day = gameDayOf(now)
            if (g.type === 'short' || g.type === 'repeat') {
              const checks = g.checks ?? []
              g.checks = checks.some((c) => c.day === day) ? checks.filter((c) => c.day !== day) : [...checks, { day, at: now.getTime() }]
            } else if (g.doneAt) {
              delete g.doneAt
              delete g.doneDay
            } else {
              g.doneAt = now.getTime()
              g.doneDay = day
            }
          }),
        addScalePoint: (id, value, now) =>
          update((d) => {
            const g = d.goals?.find((x) => x.id === id)
            if (!g?.scale || !Number.isFinite(value)) return
            const day = gameDayOf(now)
            g.scale.points = [...g.scale.points.filter((p) => p.day !== day), { day, value, at: now.getTime() }]
          }),
        startFlow: (now, minutes, skillId) => {
          const ok = canStartFlow(get().data, now)
          if (!ok.ok) return ok
          const id = uid()
          update((d) => {
            ;(d.flows ??= []).push({ id, day: gameDayOf(now), startedAt: now.getTime(), ...(minutes ? { minutes } : {}), ...(skillId ? { skillId } : {}) })
          })
          return { ok: true, id }
        },
        stopFlow: (id, now) =>
          update((d) => {
            const f = d.flows?.find((x) => x.id === id)
            if (f && !f.endedAt) f.endedAt = now.getTime()
          }),
        setTheme: (chapter, skillId) =>
          update((d) => {
            d.themes = (d.themes ?? []).filter((t) => t.chapter !== chapter)
            if (skillId) d.themes.push({ id: `ch${chapter}`, chapter, skillId })
          }),
        setBar: (questId, step, from) =>
          update((d) => {
            d.bars = [...(d.bars ?? []).filter((b) => !(b.questId === questId && b.from === from)), { id: `${questId}:${from}`, questId, step, from }]
          }),
        addExtra: (skillId, now) => {
          const day = gameDayOf(now)
          if (extraUsed(get().data, skillId, day)) return false
          update((d) => void (d.extras ??= []).push({ id: `${skillId}:${day}`, skillId, day, at: now.getTime() }))
          return true
        },
        setDealNode: (day, nodeId) =>
          update((d) => {
            const log = dayLog(d, day)
            if (nodeId) log.dealNodeId = nodeId
            else delete log.dealNodeId
          }),
        openChest: (type, now) => {
          const data = get().data
          const day = gameDayOf(now)
          const st = chestsFor(data, day).find((c) => c.type === type)
          if (!st?.ready) return null
          const r = rollChest(day, type, pityCount(data.chests), data.rewards)
          const id = `${day}:${type}`
          update((d) => {
            ;(d.chests ??= []).push({ id, day, type, at: now.getTime(), ...(r.reward ? { rewardId: r.reward.id, rewardTitle: r.reward.title, rarity: r.rarity } : {}) })
          })
          return id
        },
        buyChest: (price, now) => {
          const data = get().data
          const day = gameDayOf(now)
          const pid = uid()
          const r = rollChest(day, 'shop', pityCount(data.chests), data.rewards, pid)
          update((d) => {
            d.purchases.push({ id: pid, at: now.getTime(), day, itemId: 'chest', title: 'Сундук за WF', price, kind: 'chest' })
            ;(d.chests ??= []).push({ id: shopChestId(pid), day, type: 'shop', at: now.getTime(), ...(r.reward ? { rewardId: r.reward.id, rewardTitle: r.reward.title, rarity: r.rarity } : {}) })
          })
          return pid
        },
        setBestStreak: (goalId, best) =>
          update((d) => {
            const g = d.goals?.find((x) => x.id === goalId)
            if (g && best > (g.bestStreak ?? 0)) g.bestStreak = best
          }),
        putDuel: (x) =>
          update((d) => {
            d.duels = [...(d.duels ?? []).filter((y) => y.id !== x.id), x]
          }),
        patchDuel: (id, patch) =>
          update((d) => {
            const x = d.duels?.find((y) => y.id === id)
            if (x) Object.assign(x, patch)
          }),
        removeDuel: (id) => update((d) => void (d.duels = (d.duels ?? []).filter((x) => x.id !== id))),
        addIncome: (x, now) => {
          const today = gameDayOf(now)
          if (!Number.isInteger(x.amount) || x.amount <= 0 || x.amount > MONEY_MAX || !/^\d{4}-\d{2}-\d{2}$/.test(x.day) || x.day > today) return null
          const id = uid()
          const source = x.source?.trim().slice(0, MONEY_SOURCE_MAX)
          const note = x.note?.trim().slice(0, MONEY_NOTE_MAX)
          update((d) => {
            ;(d.incomes ??= []).push({ id, day: x.day, at: now.getTime(), amount: x.amount, ...(x.projectId ? { projectId: x.projectId } : source ? { source } : {}), ...(note ? { note } : {}) })
          })
          return id
        },
        deleteIncome: (id) => update((d) => void (d.incomes = (d.incomes ?? []).filter((x) => x.id !== id))),
        putArcGoal: (raw, now) => {
          const g = sanitizeArcGoal({ ...raw, updatedAt: now.getTime() })
          const list = get().data.arcGoals ?? []
          const i = list.findIndex((x) => x.id === raw.id)
          if (!g || (i < 0 && list.length >= ARC_LIMITS.goals)) return false
          update((d) => {
            const l = (d.arcGoals ??= [])
            const j = l.findIndex((x) => x.id === g.id)
            if (j >= 0) l[j] = g
            else l.push({ ...g, order: l.reduce((m, x) => Math.max(m, x.order + 1), 0) })
            Object.assign(d, materializeTactics(d, gameDayOf(now), now.getTime()))
          })
          return true
        },
        deleteArcGoal: (id) => update((d) => void (d.arcGoals = (d.arcGoals ?? []).filter((g) => g.id !== id))),
        syncTactics: (now) => {
          const next = materializeTactics(get().data, gameDayOf(now), now.getTime())
          if (next) set({ data: next })
        },
        importData: (raw) => set({ data: withAreas(normalizeData(raw)) }),
        resetAll: () => set({ data: createInitialData() }),
        finalize: (now) => {
          const d0 = get().data
          const snap = daysNeedingSnapshot(d0, now)
          const today = gameDayOf(now)
          const co = carryOver(d0.tasks, today)
          if (!snap.length && !co.moved) return
          update((d) => {
            for (const day of snap) dayLog(d, day).plan = activeQuestsFor(d.quests, day)
            d.tasks = co.tasks
          })
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ data: s.data }),
      merge: (persisted, current) => {
        const p = persisted as { data?: unknown } | undefined
        if (!p?.data) return current
        try {
          return { ...current, data: withAreas(normalizeData(p.data)) }
        } catch {
          return current
        }
      },
    },
  ),
)
