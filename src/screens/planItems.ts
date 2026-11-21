import { activeSkills, checkedOn, isCompleted, itemKey, marksFor, planFor, practicesToday } from '../engine'
import type { AppData, DayKey, PlanItemKind, PlannedQuest, Quest, StatId } from '../engine'
import { STAT_SPRITE, questSprite } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'

/** How the checkbox of a plan item works: the same store actions as on «Сегодня» and in «Навыки» */
export type PlanAction = 'mark' | 'value' | 'task' | 'goal' | 'open'

export interface PlanItem {
  key: string
  kind: PlanItemKind
  id: string
  title: string
  /** skill name, «главный», «Дело дня» */
  sub?: string
  sprite: SpriteName
  stat: StatId
  group: 'quest' | 'deal' | 'skill' | 'own'
  done: boolean
  action: PlanAction
  href?: string
  quest?: Quest
  plan?: PlannedQuest
}

/** Quests that close by themselves (check-in, confession) have no place in a time block */
const AUTO_KINDS = new Set(['wake', 'bedtime', 'reels'])

/**
 * What the player can put into the day's blocks: quests of the day, the Deal of the day,
 * goals and nodes of the active skills, the day's own tasks. Nothing is copied: done states are read
 * from the quests, tasks, goals and practices themselves.
 */
export function planItems(data: AppData, day: DayKey): PlanItem[] {
  const log = data.days[day]
  const out: PlanItem[] = []
  const dealTask = log?.dealTaskId ? data.tasks.find((t) => t.id === log.dealTaskId) : undefined
  const dealNode = log?.dealNodeId ? data.nodes?.find((n) => n.id === log.dealNodeId) : undefined
  const skillName = (id: string) => data.skills?.find((s) => s.id === id)?.title

  if (dealTask) out.push({ key: itemKey('task', dealTask.id), kind: 'task', id: dealTask.id, title: dealTask.title, sub: 'Дело дня', sprite: 'hammer', stat: dealTask.stat, group: 'deal', done: !!dealTask.doneAt, action: 'task' })
  else if (dealNode) {
    const skill = data.skills?.find((s) => s.id === dealNode.skillId)
    out.push({ key: itemKey('node', dealNode.id), kind: 'node', id: dealNode.id, title: dealNode.title, sub: 'Дело дня', sprite: 'hammer', stat: skill?.stat ?? 'deal', group: 'deal', done: practicesToday(data, dealNode.id, day) > 0, action: 'open', href: `#/skill/${dealNode.skillId}` })
  }

  const plan = planFor(data, day)
  const marks = marksFor(data, day, plan)
  for (const p of plan) {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q || AUTO_KINDS.has(q.kind)) continue
    if (q.kind === 'deal' && (dealTask || dealNode)) continue
    const action: PlanAction = q.kind === 'deal' ? 'open' : q.kind === 'reading' || q.kind === 'number' ? 'value' : 'mark'
    out.push({
      key: itemKey('quest', q.id),
      kind: 'quest',
      id: q.id,
      title: q.title,
      sub: p.role === 'main' ? 'главный' : undefined,
      sprite: questSprite(q),
      stat: q.stat,
      group: q.kind === 'deal' ? 'deal' : 'quest',
      done: isCompleted(marks[p.id]?.status),
      action,
      href: q.kind === 'deal' ? '#/deal' : undefined,
      quest: q,
      plan: p,
    })
  }

  for (const t of data.tasks) {
    if (t.scope !== 'daily' || t.day !== day || t.id === dealTask?.id) continue
    if (data.tasks.some((c) => c.parentId === t.id)) continue // leaves only: the concrete step
    out.push({ key: itemKey('task', t.id), kind: 'task', id: t.id, title: t.title, sprite: STAT_SPRITE[t.stat], stat: t.stat, group: 'own', done: !!t.doneAt, action: 'task' })
  }

  for (const s of activeSkills(data)) {
    for (const g of data.goals ?? []) {
      if (g.skillId !== s.id || g.archived || (g.type !== 'short' && g.type !== 'repeat')) continue
      out.push({ key: itemKey('goal', g.id), kind: 'goal', id: g.id, title: g.title, sub: skillName(s.id), sprite: 'trophy', stat: s.stat, group: 'skill', done: checkedOn(g, day), action: 'goal' })
    }
    for (const n of data.nodes ?? []) {
      if (n.skillId !== s.id || n.id === dealNode?.id) continue
      out.push({ key: itemKey('node', n.id), kind: 'node', id: n.id, title: n.title, sub: skillName(s.id), sprite: STAT_SPRITE[s.stat], stat: s.stat, group: 'skill', done: practicesToday(data, n.id, day) > 0, action: 'open', href: `#/skill/${s.id}` })
    }
  }
  return out
}
