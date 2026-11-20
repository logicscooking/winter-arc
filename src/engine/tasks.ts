import { diffDays } from './time'
import type { DayKey, Task, TaskScope } from './types'
import { XP } from './quests'

/** daily: task → sub → sub-sub; deal: project → task → subtask → sub-sub */
export const MAX_DEPTH: Record<TaskScope, number> = { daily: 2, deal: 3 }
export const POSTPONE_WARN = 3

export function depthOf(tasks: Task[], id: string): number {
  let d = 0
  let cur = tasks.find((t) => t.id === id)
  while (cur?.parentId) {
    d++
    cur = tasks.find((t) => t.id === cur!.parentId)
    if (d > 10) break
  }
  return d
}

export function childrenOf(tasks: Task[], parentId: string | null, scope?: TaskScope): Task[] {
  return tasks
    .filter((t) => t.parentId === parentId && (!scope || t.scope === scope))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export function descendantIds(tasks: Task[], id: string): string[] {
  const out: string[] = []
  const walk = (pid: string) => {
    for (const t of tasks) if (t.parentId === pid) { out.push(t.id); walk(t.id) }
  }
  walk(id)
  return out
}

export function canAddChild(tasks: Task[], parentId: string | null, scope: TaskScope): boolean {
  if (parentId === null) return true
  return depthOf(tasks, parentId) + 1 <= MAX_DEPTH[scope]
}

/** XP for closing a task: deal-tree task (depth 1) 30, any deeper or daily item 3, project 0 */
export function taskXp(tasks: Task[], t: Task): number {
  const d = depthOf(tasks, t.id)
  if (t.scope === 'deal') {
    if (d === 0) return 0
    if (d === 1) return XP.dealTask
    return XP.subtask
  }
  return XP.subtask
}

/** Unfinished daily tasks from earlier days move to today; postponed counts the days moved. */
export function carryOver(tasks: Task[], today: DayKey): { tasks: Task[]; moved: number } {
  let moved = 0
  const roots = new Map<string, number>()
  for (const t of tasks) {
    if (t.scope === 'daily' && t.parentId === null && !t.doneAt && t.day && t.day < today) {
      roots.set(t.id, diffDays(t.day, today))
    }
  }
  if (!roots.size) return { tasks, moved }
  const rootOf = (t: Task): Task => {
    let cur = t
    while (cur.parentId) {
      const p = tasks.find((x) => x.id === cur.parentId)
      if (!p) break
      cur = p
    }
    return cur
  }
  const out = tasks.map((t) => {
    if (t.scope !== 'daily') return t
    const r = rootOf(t)
    const n = roots.get(r.id)
    if (n === undefined) return t
    if (t.id === r.id) {
      moved++
      return { ...t, day: today, postponed: t.postponed + n }
    }
    return { ...t, day: today }
  })
  return { tasks: out, moved }
}

export function needsSplitHint(t: Task): boolean {
  return t.postponed >= POSTPONE_WARN && !t.doneAt
}
