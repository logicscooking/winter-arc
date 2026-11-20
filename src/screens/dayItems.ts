import { isCompleted, marksFor, planFor } from '../engine'
import type { AppData, DayKey, QuestKind, StatId } from '../engine'
import { STAT_SPRITE, questSprite } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'

export interface DayItem {
  ref: 'quest' | 'task'
  id: string
  title: string
  stat: StatId
  sprite: SpriteName
  main: boolean
  done: boolean
  kind?: QuestKind
  unit?: string
  min?: number
  goal?: number
}

/** Quests the player can finish by hand right now (auto quests close from check-in/confession) */
const HAND_KINDS: QuestKind[] = ['check', 'reading', 'number', 'caffeine']

/** Today's quests and tasks: main quests, the Deal of the day, daily tasks, side quests */
export function dayItems(data: AppData, day: DayKey, { handOnly = false } = {}): DayItem[] {
  const plan = planFor(data, day)
  const marks = marksFor(data, day, plan)
  const quests: DayItem[] = []
  for (const p of plan) {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q) continue
    if (handOnly && (!HAND_KINDS.includes(q.kind) || marks[p.id].status === 'skip')) continue
    quests.push({ ref: 'quest', id: q.id, title: q.title, stat: q.stat, sprite: questSprite(q), main: p.role === 'main', done: isCompleted(marks[p.id].status), kind: q.kind, unit: q.unit, min: q.min, goal: q.goal })
  }
  const tasks: DayItem[] = []
  const dealId = data.days[day]?.dealTaskId
  const deal = dealId ? data.tasks.find((t) => t.id === dealId) : undefined
  if (deal) tasks.push({ ref: 'task', id: deal.id, title: deal.title, stat: deal.stat, sprite: 'hammer', main: true, done: !!deal.doneAt })
  for (const t of data.tasks) {
    if (t.scope !== 'daily' || t.day !== day || t.id === dealId) continue
    if (data.tasks.some((c) => c.parentId === t.id)) continue // leaves only: the concrete step
    tasks.push({ ref: 'task', id: t.id, title: t.title, stat: t.stat, sprite: STAT_SPRITE[t.stat], main: false, done: !!t.doneAt })
  }
  return [...quests.filter((q) => q.main), ...tasks, ...quests.filter((q) => !q.main)]
}
