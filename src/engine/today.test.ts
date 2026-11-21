import { describe, expect, it } from 'vitest'
import { normalizeData } from './data'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { projectTasksFor } from './tasks'
import { log, makeData } from './testkit'
import type { AppData, Task } from './types'
import { todaySections } from '../screens/todayItems'

const D = '2026-11-24'
const task = (id: string, parentId: string | null, order: number, over: Partial<Task> = {}): Task => ({ id, parentId, title: id, stat: 'deal', scope: 'deal', createdAt: order, postponed: 0, order, ...over })

function projects(): AppData {
  const d = makeData()
  d.tasks.push(task('P', null, 0), task('a', 'P', 0), task('a1', 'a', 0), task('a2', 'a', 1), task('b', 'P', 1), task('c', 'P', 2))
  d.tasks.push(task('Q', null, 1), task('q1', 'Q', 0, { doneAt: 1, doneDay: '2026-11-20' }), task('q2', 'Q', 1))
  d.tasks.push(task('E', null, 2)) // empty project
  return d
}

describe('Задачи проектов на «Сегодня»', () => {
  it('первый открытый шаг каждого проекта, в порядке дерева', () => {
    expect(projectTasksFor(projects(), D).map((t) => t.id)).toEqual(['a1', 'q2'])
  })

  it('«на сегодня» добавляет задачу; закрытая сегодня остаётся видна, следующий шаг появляется', () => {
    const d = projects()
    log(d, D).picks = { c: 5 }
    expect(projectTasksFor(d, D).map((t) => t.id)).toEqual(['a1', 'c', 'q2'])
    d.tasks.find((t) => t.id === 'a1')!.doneAt = 9
    d.tasks.find((t) => t.id === 'a1')!.doneDay = D
    expect(projectTasksFor(d, D).map((t) => t.id)).toEqual(['a1', 'a2', 'c', 'q2'])
    // another day sees neither the pick nor yesterday's closed step
    expect(projectTasksFor(d, '2026-11-25').map((t) => t.id)).toEqual(['a2', 'q2'])
  })

  it('Дело дня не дублируется', () => {
    const d = projects()
    log(d, D).dealTaskId = 'a1'
    expect(projectTasksFor(d, D).map((t) => t.id)).toEqual(['a2', 'q2'])
  })

  it('отметки «на сегодня» чистятся и синхронизируются по одной', () => {
    const d = projects()
    log(d, D).picks = { a: 5, b: 'x' as unknown as number }
    expect(normalizeData(JSON.parse(JSON.stringify(d))).days[D].picks).toEqual({ a: 5 })
    expect(toAtoms(normalizeData(JSON.parse(JSON.stringify(d))))[`days/${D}/picks/a`]).toBe(5)

    const dev = (data: AppData) => ({ data: structuredClone(data), meta: { stamps: {}, tombs: {} } as SyncMeta })
    const edit = (x: { data: AppData; meta: SyncMeta }, t: number, fn: (d: AppData) => void) => {
      const next = structuredClone(x.data)
      fn(next)
      x.meta = stampChanges(toAtoms(x.data), toAtoms(next), x.meta, t)
      x.data = next
    }
    const sync = (x: { data: AppData; meta: SyncMeta }, server: { doc: SyncDoc | null }) => {
      const r = mergeDocs(x.data, x.meta, server.doc)
      x.data = r.data
      x.meta = r.meta
      if (r.remoteChanged || !server.doc) server.doc = { v: 1, data: structuredClone(x.data), ...structuredClone(x.meta) }
    }
    const server = { doc: null as SyncDoc | null }
    const phone = dev(projects())
    sync(phone, server)
    const mac = dev(phone.data)
    sync(mac, server)
    edit(phone, 10, (x) => void (log(x, D).picks = { b: 10 }))
    edit(mac, 11, (x) => void (log(x, D).picks = { c: 11 }))
    sync(phone, server)
    sync(mac, server)
    sync(phone, server)
    expect(phone.data.days[D].picks).toEqual({ b: 10, c: 11 })
    expect(mac.data.days[D].picks).toEqual({ b: 10, c: 11 })
  })
})

describe('«Сегодня» по блокам', () => {
  it('без плана — Утро · День · Вечер по естественному времени квестов', () => {
    const d = makeData()
    d.tasks.push({ id: 'own', parentId: null, title: 'Звонок', stat: 'deal', scope: 'daily', day: D, createdAt: 1, postponed: 0, order: 0 })
    const { sections } = todaySections(d, D)
    expect(sections.map((s) => s.id)).toEqual(['p:morning', 'p:day', 'p:evening'])
    const ids = (p: string) => sections.find((s) => s.id === p)!.items.map((it) => it.id)
    expect(ids('p:morning')).toEqual(expect.arrayContaining(['wake', 'light', 'water']))
    expect(ids('p:day')).toEqual(expect.arrayContaining(['own']))
    expect(ids('p:evening')).toEqual(expect.arrayContaining(['phone', 'reading', 'bedtime']))
    // every item once
    const all = sections.flatMap((s) => s.items.map((it) => it.key))
    expect(new Set(all).size).toBe(all.length)
  })

  it('блоки по времени, внутри — поставленные дела; навыки только если поставлены; прогресс с переходами', () => {
    const d = makeData()
    const l = log(d, D)
    l.dayBlocks = { a: { id: 'a', title: 'Утро · фокус', start: 9 * 60, dur: 120 }, b: { id: 'b', title: 'Вечер', start: 19 * 60 + 30, dur: 60 } }
    l.assign = { 'quest:water': 'a', 'quest:reading': 'b' }
    l.transitions = { a: 5 }
    l.quests.water = { status: 'done', at: 5 }
    l.quests.light = { status: 'skip', at: 5 }
    d.skills = [{ id: 's', title: 'Код', stat: 'mind', value: 'x', status: 'active', createdAt: 1, order: 0 }]
    d.nodes = [{ id: 'n', skillId: 's', traitId: 't', title: 'Узел', order: 0, createdAt: 1 }]
    const { sections, progress } = todaySections(d, D)
    expect(sections.map((s) => s.id)).toEqual(['p:morning', 'b:a', 'p:day', 'b:b', 'p:evening'])
    expect(sections.find((s) => s.id === 'b:a')!.items.map((it) => it.id)).toEqual(['water'])
    expect(sections.flatMap((s) => s.items).some((it) => it.kind === 'node')).toBe(false)
    expect(progress.transitions).toEqual([1, 2])
    // the skipped quest is out of the total
    const shown = sections.flatMap((s) => s.items).filter((it) => it.status !== 'skip').length
    expect(progress.total).toBe(shown + 2)
    expect(progress.done).toBe(2)
    // a node put into a block shows up there
    l.assign['node:n'] = 'b'
    expect(todaySections(d, D).sections.find((s) => s.id === 'b:b')!.items.map((it) => it.id)).toEqual(['reading', 'n'])
  })
})
