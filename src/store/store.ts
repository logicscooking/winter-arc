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
  TimeBlock,
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
} from '../engine'
import { MAX_ACTIVE_SKILLS, MONEY_MAX, MONEY_NOTE_MAX, MONEY_SOURCE_MAX, PRACTICE_LIMIT, barMin, canStartFlow, chestsFor, extraUsed, pityCount, practicesToday, rollChest } from '../engine'

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
  setBlocks: (day: DayKey, blocks: TimeBlock[]) => void
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
        undoPurchase: (id) => update((d) => void (d.purchases = d.purchases.filter((p) => p.id !== id))),
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
        setBlocks: (day, blocks) =>
          update((d) => {
            const log = dayLog(d, day)
            if (blocks.length) log.blocks = blocks
            else delete log.blocks
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
