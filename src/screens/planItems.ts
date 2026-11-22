import { GOAL_XP, XP, activeSkills, checkedOn, isCompleted, itemKey, marksFor, planFor, practicesToday, projectOf, projectTasksFor, questXp, taskXp } from '../engine'
import type { AppData, DayKey, MarkStatus, PlanItemKind, PlannedQuest, Quest, StatId } from '../engine'
import { STAT_SPRITE, questSprite } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'

/** How the checkbox of a plan item works: the same store actions as on «Сегодня» and in «Навыки» */
export type PlanAction = 'mark' | 'value' | 'task' | 'goal' | 'open'

/** Natural time of the day for items outside the plan's blocks */
export type DayPart = 'morning' | 'day' | 'evening'

export interface PlanItem {
  key: string
  kind: PlanItemKind
  id: string
  title: string
  /** skill name, project name, «главный», «Дело дня» */
  sub?: string
  sprite: SpriteName
  stat: StatId
  group: 'quest' | 'deal' | 'skill' | 'own' | 'project'
  done: boolean
  action: PlanAction
  part: DayPart
  /** small right-side badge: a target value or the reward */
  badge?: string
  href?: string
  quest?: Quest
  plan?: PlannedQuest
  status?: MarkStatus
  auto?: boolean
}

/** Quests that close by themselves (check-in, confession) have no place in a time block */
const AUTO_KINDS = new Set(['wake', 'bedtime', 'reels'])

/** Default part of the day per quest; anything unknown (and own tasks) goes to «День» */
const QUEST_PART: Record<string, DayPart> = {
  wake: 'morning',
  light: 'morning',
  water: 'morning',
  caffeine: 'morning',
  workout: 'day',
  deal: 'day',
  skill: 'day',
  steps: 'day',
  reading: 'evening',
  phone: 'evening',
  reels: 'evening',
  bedtime: 'evening',
  meditation: 'morning',
  journal: 'evening',
  twitter: 'day',
  leads: 'day',
}
export const questPart = (q: Pick<Quest, 'id' | 'kind'>): DayPart => QUEST_PART[q.id] ?? (q.kind === 'bedtime' || q.kind === 'reels' || q.kind === 'reading' ? 'evening' : q.kind === 'wake' ? 'morning' : 'day')

export const PART_META: Record<DayPart, { title: string; icon: SpriteName }> = {
  morning: { title: 'Утро', icon: 'sun' },
  day: { title: 'День', icon: 'hammer' },
  evening: { title: 'Вечер', icon: 'moon' },
}

/**
 * What the player can put into the day's blocks: quests of the day, the Deal of the day,
 * project steps (projectTasksFor), goals and nodes of the active skills, the day's own tasks.
 * Nothing is copied: done states are read from the quests, tasks, goals and practices themselves.
 * `withAuto` adds the quests that close by themselves (check-in, confession) — «Сегодня» shows them.
 */
export function planItems(data: AppData, day: DayKey, { withAuto = false } = {}): PlanItem[] {
  const log = data.days[day]
  const out: PlanItem[] = []
  const dealTask = log?.dealTaskId ? data.tasks.find((t) => t.id === log.dealTaskId) : undefined
  const dealNode = log?.dealNodeId ? data.nodes?.find((n) => n.id === log.dealNodeId) : undefined
  const skillName = (id: string) => data.skills?.find((s) => s.id === id)?.title
  const plan = planFor(data, day)
  const dealPlan = plan.find((p) => data.quests.find((q) => q.id === p.id)?.kind === 'deal')
  const dealSub = dealPlan?.role === 'main' ? 'Дело дня · главный' : 'Дело дня'

  if (dealTask) {
    const project = dealTask.parentId ? projectOf(data.tasks, dealTask) : undefined
    out.push({ key: itemKey('task', dealTask.id), kind: 'task', id: dealTask.id, title: dealTask.title, sub: project && project.id !== dealTask.id ? `${dealSub} · ${project.title}` : dealSub, sprite: 'hammer', stat: dealTask.stat, group: 'deal', done: !!dealTask.doneAt, action: 'task', part: 'day', badge: `+${taskXp(data.tasks, dealTask) + (dealPlan ? questXp(dealPlan.role, dealPlan.base, 'done') : 0)} XP` })
  } else if (dealNode) {
    const skill = data.skills?.find((s) => s.id === dealNode.skillId)
    out.push({ key: itemKey('node', dealNode.id), kind: 'node', id: dealNode.id, title: dealNode.title, sub: dealSub, sprite: 'hammer', stat: skill?.stat ?? 'deal', group: 'deal', done: practicesToday(data, dealNode.id, day) > 0, action: 'open', part: 'day', href: `#/skill/${dealNode.skillId}` })
  }

  const marks = marksFor(data, day, plan)
  for (const p of plan) {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q || (!withAuto && AUTO_KINDS.has(q.kind))) continue
    if (q.kind === 'deal' && (dealTask || dealNode)) continue
    // the diary closes from its answers: it opens (on «Сегодня» — the diary sheet)
    const action: PlanAction = q.kind === 'deal' || q.kind === 'journal' ? 'open' : q.kind === 'reading' || q.kind === 'number' ? 'value' : 'mark'
    const m = marks[p.id]
    out.push({
      key: itemKey('quest', q.id),
      kind: 'quest',
      id: q.id,
      title: q.title,
      sub: p.role === 'main' ? 'главный' : undefined,
      sprite: questSprite(q),
      stat: q.stat,
      group: q.kind === 'deal' ? 'deal' : 'quest',
      done: isCompleted(m?.status),
      action,
      part: questPart(q),
      badge: q.kind === 'reading' || q.kind === 'number' ? `${q.goal ?? q.min} ${q.unit ?? ''}`.trim() : undefined,
      href: q.kind === 'deal' ? '#/deal' : q.kind === 'journal' ? '#/today?journal=1' : undefined,
      quest: q,
      plan: p,
      status: m?.status,
      auto: m?.auto,
    })
  }

  for (const t of projectTasksFor(data, day)) {
    const project = projectOf(data.tasks, t)
    out.push({ key: itemKey('task', t.id), kind: 'task', id: t.id, title: t.title, sub: project.title, sprite: 'hammer', stat: t.stat, group: 'project', done: !!t.doneAt, action: 'task', part: 'day', badge: `+${taskXp(data.tasks, t)} XP` })
  }

  for (const t of data.tasks) {
    if (t.scope !== 'daily' || t.day !== day || t.id === dealTask?.id) continue
    if (data.tasks.some((c) => c.parentId === t.id)) continue // leaves only: the concrete step
    out.push({ key: itemKey('task', t.id), kind: 'task', id: t.id, title: t.title, sprite: STAT_SPRITE[t.stat], stat: t.stat, group: 'own', done: !!t.doneAt, action: 'task', part: 'day', badge: `+${XP.subtask} XP` })
  }

  for (const s of activeSkills(data)) {
    for (const g of data.goals ?? []) {
      if (g.skillId !== s.id || g.archived || (g.type !== 'short' && g.type !== 'repeat')) continue
      out.push({ key: itemKey('goal', g.id), kind: 'goal', id: g.id, title: g.title, sub: skillName(s.id), sprite: 'trophy', stat: s.stat, group: 'skill', done: checkedOn(g, day), action: 'goal', part: 'day', badge: `+${GOAL_XP[g.type]} XP` })
    }
    for (const n of data.nodes ?? []) {
      if (n.skillId !== s.id || n.id === dealNode?.id) continue
      out.push({ key: itemKey('node', n.id), kind: 'node', id: n.id, title: n.title, sub: skillName(s.id), sprite: STAT_SPRITE[s.stat], stat: s.stat, group: 'skill', done: practicesToday(data, n.id, day) > 0, action: 'open', part: 'day', href: `#/skill/${s.id}` })
    }
  }
  return out
}
