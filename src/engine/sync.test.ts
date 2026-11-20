import { describe, expect, it } from 'vitest'
import { createInitialData, normalizeData } from './data'
import { fromAtoms, mergeDocs, mergeSides, pruneTombs, stableStringify, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { at, confess, makeData, mark } from './testkit'
import type { AppData } from './types'

/** A simulated device: its store plus the stamps it recorded while the user edited */
class Device {
  data: AppData
  meta: SyncMeta = { stamps: {}, tombs: {} }
  constructor(data: AppData) {
    this.data = structuredClone(data)
  }
  edit(now: number, fn: (d: AppData) => void) {
    const next = structuredClone(this.data)
    fn(next)
    this.meta = stampChanges(toAtoms(this.data), toAtoms(next), this.meta, now)
    this.data = next
  }
  doc(): SyncDoc {
    return { v: 1, data: structuredClone(this.data), ...structuredClone(this.meta) }
  }
  /** pull + merge + (what would be pushed) */
  syncWith(server: { doc: SyncDoc | null }) {
    const r = mergeDocs(this.data, this.meta, server.doc)
    this.data = r.data
    this.meta = r.meta
    if (r.remoteChanged || !server.doc) server.doc = this.doc()
    return r
  }
}

const D = '2026-11-24'
const T0 = at(D, 9)

function base(): AppData {
  const d = makeData()
  d.tasks.push({ id: 't1', parentId: null, title: 'Проект', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0 })
  d.purchases.push({ id: 'p1', at: at(D, 8), day: D, itemId: 'cola', title: 'Банка колы', price: 12, kind: 'cola' })
  return d
}

describe('atoms', () => {
  it('round-trip keeps the store intact', () => {
    const d = base()
    mark(d, D, 'wake')
    confess(d, D)
    d.reviews[1] = { worked: 'a', remove: 'b', simplify: 'c', at: 5 }
    d.ack.reviewedWeeks = [2, 1]
    d.ack.hints = ['hp']
    d.books.push({ id: 'b1', title: 'Книга', total: 100, current: 10, startDay: D })
    d.activeBookId = 'b1'
    d.baseline = { pushups: 20, waistCm: 80 }
    const back = normalizeData(fromAtoms(toAtoms(d), d))
    const expected = structuredClone(d)
    expected.ack.reviewedWeeks = [1, 2]
    expect(stableStringify(back)).toBe(stableStringify(expected))
  })

  it('device-only settings are not synced', () => {
    const d = base()
    d.settings.theme = 'dark'
    d.settings.debugOffsetDays = 5
    const a = toAtoms(d)
    expect(Object.keys(a).some((k) => k.includes('theme') || k.includes('debugOffsetDays'))).toBe(false)
    const local = base()
    local.settings.theme = 'light'
    expect(fromAtoms(a, local).settings.theme).toBe('light')
  })

  it('stampChanges records edits and deletions', () => {
    const a = base()
    const b = structuredClone(a)
    mark(b, D, 'wake')
    b.purchases = []
    const m = stampChanges(toAtoms(a), toAtoms(b), { stamps: {}, tombs: {} }, 100)
    expect(m.stamps['days/2026-11-24/quests/wake']).toBe(100)
    expect(m.tombs['purchases/p1']).toBe(100)
    expect(Object.keys(m.stamps)).toHaveLength(1)
  })
})

describe('merge: two devices', () => {
  it('concurrent edits of different quests on the same day both survive', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T0 + 1000, (d) => mark(d, D, 'wake'))
    mac.edit(T0 + 2000, (d) => mark(d, D, 'light'))
    phone.syncWith(server)
    mac.syncWith(server)
    phone.syncWith(server)
    expect(Object.keys(phone.data.days[D].quests).sort()).toEqual(['light', 'wake'])
    expect(stableStringify(phone.data)).toBe(stableStringify(mac.data))
  })

  it('the same item edited on both: the later edit wins, the other is reported as overwritten', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T0 + 5000, (d) => void (d.tasks[0].title = 'Телефон'))
    mac.edit(T0 + 1000, (d) => void (d.tasks[0].title = 'Мак'))
    mac.syncWith(server) // mac pushes first (older edit)
    const r = phone.syncWith(server)
    expect(phone.data.tasks[0].title).toBe('Телефон')
    expect(r.overwritten).toEqual([])
    const r2 = mac.syncWith(server)
    expect(mac.data.tasks[0].title).toBe('Телефон')
    expect(r2.overwritten).toContain('tasks/t1')
  })

  it('offline edits on both devices merge when they come back', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    // both offline for a while
    phone.edit(T0 + 1, (d) => void d.slips.push({ id: 's1', at: T0 + 1, day: D, what: 'reels', why: 'tired' }))
    phone.edit(T0 + 2, (d) => void (d.days[D] = { ...(d.days[D] ?? { quests: {} }), checkin: { wake: '07:10', sleep: 4, energy: 3, at: T0 + 2 } }))
    mac.edit(T0 + 3, (d) => void d.tasks.push({ id: 't2', parentId: 't1', title: 'Подзадача', stat: 'deal', scope: 'deal', createdAt: T0 + 3, postponed: 0, order: 0 }))
    mac.edit(T0 + 4, (d) => confess(d, D))
    mac.syncWith(server)
    phone.syncWith(server)
    mac.syncWith(server)
    for (const dev of [phone, mac]) {
      expect(dev.data.slips.map((s) => s.id)).toEqual(['s1'])
      expect(dev.data.tasks.map((t) => t.id)).toEqual(['t1', 't2'])
      expect(dev.data.days[D].checkin?.wake).toBe('07:10')
      expect(dev.data.days[D].confession).toBeTruthy()
    }
  })

  it('a deletion propagates', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T0 + 10, (d) => void (d.purchases = []))
    phone.syncWith(server)
    const r = mac.syncWith(server)
    expect(mac.data.purchases).toEqual([])
    expect(r.overwritten).toContain('purchases/p1')
  })

  it('an edit made after a deletion elsewhere wins over the deletion (no data loss)', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T0 + 10, (d) => void (d.tasks = []))
    mac.edit(T0 + 20, (d) => void (d.tasks[0].title = 'Переименован позже'))
    phone.syncWith(server)
    mac.syncWith(server)
    phone.syncWith(server)
    expect(phone.data.tasks.map((t) => t.title)).toEqual(['Переименован позже'])
    expect(mac.data.tasks.map((t) => t.title)).toEqual(['Переименован позже'])
  })

  it('a deletion after an older edit elsewhere wins', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    mac.edit(T0 + 10, (d) => void (d.tasks[0].title = 'Старое'))
    phone.edit(T0 + 20, (d) => void (d.tasks = []))
    mac.syncWith(server)
    phone.syncWith(server)
    mac.syncWith(server)
    expect(phone.data.tasks).toEqual([])
    expect(mac.data.tasks).toEqual([])
  })

  it('a subtask added under a parent deleted on the other device is kept at the top level', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T0 + 10, (d) => void (d.tasks = []))
    mac.edit(T0 + 20, (d) => void d.tasks.push({ id: 't2', parentId: 't1', title: 'Сирота', stat: 'deal', scope: 'deal', createdAt: T0 + 20, postponed: 0, order: 0 }))
    phone.syncWith(server)
    mac.syncWith(server)
    expect(mac.data.tasks).toHaveLength(1)
    expect(mac.data.tasks[0]).toMatchObject({ id: 't2', parentId: null })
  })

  it('first login: legacy data on both sides (no stamps) is unioned, ties go to the server', () => {
    const phone = base()
    mark(phone, D, 'wake')
    const mac = createInitialData()
    mac.profile = { nick: 'Мак', avatar: '🦊', usualWake: '08:00', onboardDay: '2026-11-22' }
    mac.rewards.push({ id: 'r1', title: 'Кино', price: 50 })
    const server = { doc: { v: 1, data: phone, stamps: {}, tombs: {} } as SyncDoc }
    const r = mergeDocs(mac, { stamps: {}, tombs: {} }, server.doc)
    expect(r.data.days[D].quests.wake).toBeTruthy()
    expect(r.data.rewards.map((x) => x.id)).toEqual(['r1'])
    expect(r.data.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(r.data.profile?.nick).toBe('Тест') // tie → server
    expect(r.data.profile?.onboardDay).toBe('2026-11-20') // earliest onboarding is kept
  })

  it('a fresh device adopts the server state without pushing anything back', () => {
    const phone = new Device(base())
    phone.edit(T0, (d) => mark(d, D, 'wake'))
    const server = { doc: null as SyncDoc | null }
    phone.syncWith(server)
    const fresh = new Device(createInitialData())
    const r = fresh.syncWith(server)
    expect(r.localChanged).toBe(true)
    expect(r.remoteChanged).toBe(false)
    expect(fresh.data.profile?.nick).toBe('Тест')
    expect(fresh.data.days[D].quests.wake.status).toBe('done')
  })

  it('sync is idempotent: a second round changes nothing', () => {
    const phone = new Device(base())
    const mac = new Device(base())
    const server = { doc: null as SyncDoc | null }
    phone.edit(T0, (d) => mark(d, D, 'wake'))
    phone.syncWith(server)
    mac.syncWith(server)
    const r = mac.syncWith(server)
    expect(r.localChanged).toBe(false)
    expect(r.remoteChanged).toBe(false)
  })

  it('set-like acks are unioned', () => {
    const a = base()
    const b = base()
    a.ack.reviewedWeeks = [1]
    b.ack.reviewedWeeks = [2]
    const m = mergeSides({ atoms: toAtoms(a), meta: { stamps: {}, tombs: {} } }, { atoms: toAtoms(b), meta: { stamps: {}, tombs: {} } })
    expect(fromAtoms(m.atoms, a).ack.reviewedWeeks).toEqual([1, 2])
  })

  it('old tombstones are pruned', () => {
    const m = pruneTombs({ stamps: {}, tombs: { a: 0, b: 1000 } }, 1000 + 10, 100)
    expect(m.tombs).toEqual({ b: 1000 })
  })
})
