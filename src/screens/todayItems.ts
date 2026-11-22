import { AREAS, TRANSITION_SLOTS, assignedBlock, blockAt, eventDayLabel, eventsView, gameMin, morningDone, planBlocksOf, questArea, questTime, sleepWindow } from '../engine'
import type { AppData, Area, CalEvent, DayKey, PlanBlock, TransitionSlot } from '../engine'
import type { SpriteName } from '../pixel/sprites'
import { PART_META, planItems, type DayPart, type PlanItem } from './planItems'

/** «Сегодня»: grouped by life areas («Сферы») or by the day's plan («Время») */
export type TodayMode = 'areas' | 'time'

/**
 * One row of «Сегодня». Besides the plan items (quests, tasks, goals, nodes) a day has a few rows
 * of its own: the morning warm-up, the three fixed transitions, events of «Разное» and the
 * «Выброс мыслей» bonus.
 */
export interface TodayRow {
  key: string
  type: 'item' | 'morning' | 'slot' | 'event' | 'dump'
  area: Area
  /** natural time of the day, minutes from 00:00: rows sort by it inside a section */
  at: number
  done: boolean
  /** counted in the ring: skipped quests, upcoming events and the dump are not */
  counts: boolean
  it?: PlanItem
  slot?: TransitionSlot
  event?: CalEvent
  /** an upcoming event: «завтра», «пт 27 ноя» */
  label?: string
}

export interface DaySection {
  id: string
  title: string
  icon?: SpriteName
  block?: PlanBlock
  part?: DayPart
  area?: Area
  /** the plan items of the section (as before «Сферы») */
  items: PlanItem[]
  /** everything shown in the section, in time order */
  rows: TodayRow[]
}

export interface DayProgress {
  done: number
  total: number
  quests: [number, number]
  tasks: [number, number]
  transitions: [number, number]
  /** «Сферы»: done / total per area (the ring legend) */
  areas: Record<Area, [number, number]>
}

export const AREA_ICON: Record<Area, SpriteName> = { health: 'heart', money: 'coin', growth: 'book', misc: 'star' }

/** Area of a plan item: quests by their own area, Дело дня and project steps are money, skills growth */
export function itemArea(it: PlanItem): Area {
  if (it.quest) return questArea(it.quest)
  if (it.group === 'deal' || it.group === 'project') return 'money'
  if (it.group === 'skill') return 'growth'
  return 'misc'
}

const partOfMin = (m: number): DayPart => (gameMin(m) < gameMin(12 * 60) ? 'morning' : gameMin(m) < gameMin(18 * 60) ? 'day' : 'evening')
const DAY_PART_AT: Record<DayPart, number> = { morning: 9 * 60, day: 12 * 60, evening: 21 * 60 }
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

/** All rows of the day (both modes share them, so the ring is the same in «Сферы» and «Время») */
export function todayRows(data: AppData, day: DayKey, { upcoming = true } = {}): { rows: TodayRow[]; items: PlanItem[] } {
  const log = data.days[day]
  const blocks = planBlocksOf(log)
  const wake = sleepWindow(data, day).wake
  const items = planItems(data, day, { withAuto: true }).filter((it) => it.group !== 'skill' || !!assignedBlock(log, it.key))
  const rows: TodayRow[] = []
  for (const it of items) {
    const b = assignedBlock(log, it.key)
    const block = b ? blocks.find((x) => x.id === b) : undefined
    const at = block ? block.start : it.quest ? questTime(it.quest, wake, it.part) : it.group === 'deal' ? 11 * 60 : it.group === 'project' ? 11 * 60 + 1 : DAY_PART_AT[it.part]
    rows.push({ key: it.key, type: 'item', area: itemArea(it), at, done: it.done, counts: it.status !== 'skip', it })
  }
  rows.push({ key: 'morning', type: 'morning', area: 'health', at: wake + 10, done: morningDone(log), counts: true })
  for (const slot of TRANSITION_SLOTS) rows.push({ key: `slot:${slot.id}`, type: 'slot', area: 'health', at: slot.at, done: !!log?.transitions?.[slot.id], counts: true, slot })
  const ev = eventsView(data.events, day)
  for (const e of ev.today) rows.push({ key: `event:${e.id}`, type: 'event', area: 'misc', at: e.time ? hm(e.time) : DAY_PART_AT.day, done: !!e.doneAt, counts: true, event: e })
  if (upcoming) for (const e of ev.upcoming) rows.push({ key: `event:${e.id}`, type: 'event', area: 'misc', at: e.time ? hm(e.time) : DAY_PART_AT.day, done: !!e.doneAt, counts: false, event: e, label: eventDayLabel(e.date, day) })
  rows.push({ key: 'dump', type: 'dump', area: 'misc', at: 22 * 60 + 10, done: !!log?.dump?.text?.trim(), counts: false })
  return { rows, items }
}

const byTime = (a: TodayRow, b: TodayRow) => gameMin(a.at) - gameMin(b.at)

/** «Разное» after the events: the head habits in this order, then own tasks, then anything else */
const MISC_RANK: Record<string, number> = { 'quest:meditation': 0, 'quest:phone': 1, 'quest:journal': 2, dump: 3, 'quest:reels': 4 }
const miscRank = (r: TodayRow) => MISC_RANK[r.key] ?? (r.it?.group === 'own' ? 5 : 6)

/** «Разное»: events first (earliest first, today before upcoming), then the head habits, own tasks, the rest */
function miscOrder(rows: TodayRow[]): TodayRow[] {
  const events = rows.filter((r) => r.type === 'event')
  const todays = events.filter((r) => !r.label)
  const later = events.filter((r) => !!r.label)
  const rest = rows.filter((r) => r.type !== 'event').sort((a, b) => miscRank(a) - miscRank(b) || byTime(a, b))
  return [...todays, ...later, ...rest]
}

/**
 * «Сегодня» as sections.
 * «Время» (as before «Сферы»): one section per plan block with what was put into it, the rest by
 * its natural time of the day («Утро · День · Вечер»), all in time order.
 * «Сферы»: Здоровье · Деньги · Развитие · Разное, rows by time inside; empty areas are hidden
 * except «Разное» (its «+ Событие»), always last: events on top, then медитация, телефон, дневник…
 * Shown: every quest of the day, the Deal of the day, project steps, own tasks; skill goals and nodes
 * only when they were put into a block (otherwise the day would drown in them).
 *
 * Progress rule: done rows / all counted rows (quests, tasks, warm-up, the 3 transitions, today's
 * events). A skipped quest leaves the total (it is decided, not pending); mini counts as done.
 */
export function todaySections(data: AppData, day: DayKey, mode: TodayMode = 'time'): { sections: DaySection[]; progress: DayProgress } {
  const log = data.days[day]
  const blocks = planBlocksOf(log)
  const { rows } = todayRows(data, day, { upcoming: mode === 'areas' })
  let sections: DaySection[]

  if (mode === 'areas') {
    sections = AREAS.map((a) => a.id)
      .map((area): DaySection => {
        const list = rows.filter((r) => r.area === area)
        const sorted = area === 'misc' ? miscOrder(list) : [...list].sort(byTime)
        return { id: `a:${area}`, title: AREAS.find((a) => a.id === area)!.title, icon: AREA_ICON[area], area, items: sorted.flatMap((r) => (r.it ? [r.it] : [])), rows: sorted }
      })
      .filter((s) => s.rows.length > 0 || s.area === 'misc')
  } else {
    const byBlock = new Map<string, TodayRow[]>()
    const byPart: Record<DayPart, TodayRow[]> = { morning: [], day: [], evening: [] }
    for (const r of rows) {
      // plan items sit where they were put; the day's own rows go to the block running at their time
      const b = r.it ? assignedBlock(log, r.it.key) : r.type === 'dump' ? undefined : blockAt(blocks, r.at)?.id
      if (b) byBlock.set(b, [...(byBlock.get(b) ?? []), r])
      else byPart[r.it ? r.it.part : partOfMin(r.at)].push(r)
    }
    const wake = sleepWindow(data, day).wake
    const anchor: Record<DayPart, number> = { morning: gameMin(wake), day: gameMin(12 * 60), evening: gameMin(21 * 60) }
    const list: { at: number; s: DaySection }[] = []
    const mk = (id: string, title: string, rs: TodayRow[], extra: Partial<DaySection>): DaySection => {
      const sorted = [...rs].sort(byTime)
      return { id, title, items: sorted.flatMap((r) => (r.it ? [r.it] : [])), rows: sorted, ...extra }
    }
    for (const b of blocks) list.push({ at: gameMin(b.start) + 0.5, s: mk(`b:${b.id}`, b.title, byBlock.get(b.id) ?? [], { block: b }) })
    for (const p of ['morning', 'day', 'evening'] as const) {
      if (byPart[p].length) list.push({ at: anchor[p], s: mk(`p:${p}`, PART_META[p].title, byPart[p], { icon: PART_META[p].icon, part: p }) })
    }
    sections = list.sort((a, b) => a.at - b.at).map((x) => x.s)
  }

  const counted = rows.filter((r) => r.counts)
  const pair = (pred: (r: TodayRow) => boolean): [number, number] => {
    const rs = counted.filter(pred)
    return [rs.filter((r) => r.done).length, rs.length]
  }
  const areas = Object.fromEntries(AREAS.map((a) => [a.id, pair((r) => r.area === a.id)])) as Record<Area, [number, number]>
  const all = pair(() => true)
  return {
    sections,
    progress: {
      done: all[0],
      total: all[1],
      quests: pair((r) => r.it?.kind === 'quest' || r.type === 'morning'),
      tasks: pair((r) => (r.type === 'item' && r.it?.kind !== 'quest') || r.type === 'event'),
      transitions: pair((r) => r.type === 'slot'),
      areas,
    },
  }
}
