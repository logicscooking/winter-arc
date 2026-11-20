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
  Settings,
  ShopKind,
  SlipWhat,
  SlipWhy,
  StatId,
  Task,
  TaskScope,
  Ack,
  Destiny,
  Outfit,
  TimeBlock,
} from '../engine'

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
  setBlocks: (day: DayKey, blocks: TimeBlock[]) => void
  setSettings: (patch: Partial<Settings>) => void
  importData: (raw: unknown) => void
  resetAll: () => void
  finalize: (now: Date) => void
}

const dayLog = (d: AppData, day: DayKey): DayLog => (d.days[day] ??= { quests: {} })

function applyReadingDelta(d: AppData, delta: number, day: DayKey) {
  const book = d.books.find((b) => b.id === d.activeBookId)
  if (!book || !delta) return
  book.current = Math.max(0, Math.min(book.total, book.current + delta))
  if (book.current >= book.total && !book.finishedDay) book.finishedDay = day
  if (book.current < book.total) book.finishedDay = undefined
}

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
            const status = statusFromValue(q, v)
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
        undoPurchase: (id) => update((d) => void (d.purchases = d.purchases.filter((p) => p.id !== id))),
        addReward: (title, price, icon) => update((d) => void d.rewards.push(icon ? { id: uid(), title, price, icon } : { id: uid(), title, price })),
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
        setBlocks: (day, blocks) =>
          update((d) => {
            const log = dayLog(d, day)
            if (blocks.length) log.blocks = blocks
            else delete log.blocks
          }),
        setSettings: (patch) => update((d) => void Object.assign(d.settings, patch)),
        importData: (raw) => set({ data: normalizeData(raw) }),
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
          return { ...current, data: normalizeData(p.data) }
        } catch {
          return current
        }
      },
    },
  ),
)
