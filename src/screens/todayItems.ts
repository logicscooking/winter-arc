import { assignedBlock, gameMin, planBlocksOf, sleepWindow } from '../engine'
import type { AppData, DayKey, PlanBlock } from '../engine'
import type { SpriteName } from '../pixel/sprites'
import { PART_META, planItems, type DayPart, type PlanItem } from './planItems'

export interface DaySection {
  id: string
  title: string
  icon?: SpriteName
  block?: PlanBlock
  part?: DayPart
  items: PlanItem[]
}

export interface DayProgress {
  done: number
  total: number
  quests: [number, number]
  tasks: [number, number]
  transitions: [number, number]
}

/**
 * «Сегодня» grouped by the day's plan: one section per block with what was put into it, the rest
 * by its natural time of the day («Утро · День · Вечер»), all in time order.
 * Shown: every quest of the day, the Deal of the day, project steps, own tasks; skill goals and nodes
 * only when they were put into a block (otherwise the day would drown in them).
 *
 * Progress rule: done rows / all rows shown + one «Переход» per block. A skipped quest leaves the
 * total (it is decided, not pending); mini counts as done.
 */
export function todaySections(data: AppData, day: DayKey): { sections: DaySection[]; progress: DayProgress } {
  const log = data.days[day]
  const blocks = planBlocksOf(log)
  const items = planItems(data, day, { withAuto: true }).filter((it) => it.group !== 'skill' || !!assignedBlock(log, it.key))
  const byBlock = new Map<string, PlanItem[]>()
  const byPart: Record<DayPart, PlanItem[]> = { morning: [], day: [], evening: [] }
  for (const it of items) {
    const b = assignedBlock(log, it.key)
    if (b) byBlock.set(b, [...(byBlock.get(b) ?? []), it])
    else byPart[it.part].push(it)
  }
  const wake = sleepWindow(data, day).wake
  const anchor: Record<DayPart, number> = { morning: gameMin(wake), day: gameMin(12 * 60), evening: gameMin(21 * 60) }
  const list: { at: number; s: DaySection }[] = []
  for (const b of blocks) list.push({ at: gameMin(b.start) + 0.5, s: { id: `b:${b.id}`, title: b.title, block: b, items: byBlock.get(b.id) ?? [] } })
  for (const p of ['morning', 'day', 'evening'] as const) {
    if (byPart[p].length) list.push({ at: anchor[p], s: { id: `p:${p}`, title: PART_META[p].title, icon: PART_META[p].icon, part: p, items: byPart[p] } })
  }
  const sections = list.sort((a, b) => a.at - b.at).map((x) => x.s)

  const count = (pred: (it: PlanItem) => boolean): [number, number] => {
    const rows = items.filter((it) => pred(it) && it.status !== 'skip')
    return [rows.filter((it) => it.done).length, rows.length]
  }
  const quests = count((it) => it.kind === 'quest')
  const tasks = count((it) => it.kind !== 'quest')
  const transitions: [number, number] = [blocks.filter((b) => !!log?.transitions?.[b.id]).length, blocks.length]
  return {
    sections,
    progress: { done: quests[0] + tasks[0] + transitions[0], total: quests[1] + tasks[1] + transitions[1], quests, tasks, transitions },
  }
}
