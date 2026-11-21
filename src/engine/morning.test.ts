import { describe, expect, it } from 'vitest'
import { normalizeData } from './data'
import { MORNING, morningCounts, morningEvents } from './morning'
import { computeState } from './replay'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData } from './types'

const D = '2026-11-24'
const D2 = '2026-11-25'

describe('Утренняя инвестиция: награда', () => {
  it('завершённая программа даёт XP Энергии и ❄ один раз за игровой день', () => {
    const d = makeData()
    const before = computeState(d, nowAt(D, 12))
    log(d, D).morningAt = at(D, 7, 20)
    const st = computeState(d, nowAt(D, 12))
    expect(st.xp - before.xp).toBe(MORNING.xp)
    expect(st.xpByStat.energy - before.xpByStat.energy).toBe(MORNING.xp)
    expect(st.shards - before.shards).toBe(MORNING.shards)
    expect(st.days[D].morning).toBe(true)
    expect(st.days[D].xp).toBe(MORNING.xp)
  })

  it('без отметки (частичный проход) — ничего', () => {
    const d = makeData()
    const st = computeState(d, nowAt(D, 12))
    expect(st.days[D].morning).toBe(false)
    expect(morningEvents(d)).toEqual([])
  })

  it('каждый день отдельно: два дня — две награды', () => {
    const d = makeData()
    log(d, D).morningAt = at(D, 7)
    log(d, D2).morningAt = at(D2, 8)
    const st = computeState(d, nowAt(D2, 12))
    expect(st.xpByStat.energy).toBe(2 * MORNING.xp)
    expect(morningEvents(d).map((e) => e.day)).toEqual([D, D2])
  })

  it('будущий день не засчитывается до его наступления', () => {
    const d = makeData()
    log(d, D2).morningAt = at(D2, 8)
    expect(computeState(d, nowAt(D, 12)).xpByStat.energy).toBe(0)
  })

  it('порог прохождения: 70% упражнений сделаны, а не пропущены', () => {
    expect(morningCounts(17, 17)).toBe(true)
    expect(morningCounts(12, 17)).toBe(true)
    expect(morningCounts(11, 17)).toBe(false)
    expect(morningCounts(0, 0)).toBe(false)
  })
})

describe('Утренняя инвестиция: реплей', () => {
  it('повторный расчёт и бэкап дают то же состояние', () => {
    const d = makeData()
    log(d, D).morningAt = at(D, 7, 5)
    const a = computeState(d, nowAt(D2, 12))
    const b = computeState(normalizeData(JSON.parse(JSON.stringify(d))), nowAt(D2, 12))
    expect(b.xp).toBe(a.xp)
    expect(b.shards).toBe(a.shards)
    expect(b.days[D].morning).toBe(true)
  })

  it('мусор в morningAt отбрасывается при загрузке', () => {
    const d = makeData()
    ;(log(d, D) as unknown as Record<string, unknown>).morningAt = 'вчера'
    log(d, D2).morningAt = -5
    const n = normalizeData(JSON.parse(JSON.stringify(d)))
    expect(n.days[D].morningAt).toBeUndefined()
    expect(n.days[D2].morningAt).toBeUndefined()
    expect(computeState(n, nowAt(D2, 12)).xpByStat.energy).toBe(0)
  })
})

describe('Утренняя инвестиция: синк', () => {
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
    sync(server: { doc: SyncDoc | null }) {
      const r = mergeDocs(this.data, this.meta, server.doc)
      this.data = r.data
      this.meta = r.meta
      if (r.remoteChanged || !server.doc) server.doc = this.doc()
    }
  }

  it('пройдено на телефоне → приходит на Mac, награда одна', () => {
    const base = makeData()
    const phone = new Device(base)
    const mac = new Device(base)
    const server = { doc: null as SyncDoc | null }
    mac.sync(server)
    phone.sync(server)
    phone.edit(at(D, 7, 30), (d) => void (log(d, D).morningAt = at(D, 7, 30)))
    phone.sync(server)
    mac.sync(server)
    expect(mac.data.days[D].morningAt).toBe(at(D, 7, 30))
    expect(computeState(mac.data, nowAt(D, 12)).xpByStat.energy).toBe(MORNING.xp)
  })

  it('пройдено на обоих устройствах → остаётся самое раннее, награда одна', () => {
    const base = makeData()
    const phone = new Device(base)
    const mac = new Device(base)
    const server = { doc: null as SyncDoc | null }
    phone.sync(server)
    mac.sync(server)
    phone.edit(at(D, 7), (d) => void (log(d, D).morningAt = at(D, 7)))
    // the later edit on the Mac would win plain LWW; the resolver keeps the earliest finish
    mac.edit(at(D, 9), (d) => void (log(d, D).morningAt = at(D, 9)))
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)
    expect(mac.data.days[D].morningAt).toBe(at(D, 7))
    expect(phone.data.days[D].morningAt).toBe(at(D, 7))
    expect(computeState(mac.data, nowAt(D, 12)).xpByStat.energy).toBe(MORNING.xp)
  })

  it('музыка остаётся своей на каждом устройстве, финал синкается', () => {
    const base = makeData()
    const phone = new Device(base)
    const mac = new Device(base)
    const server = { doc: null as SyncDoc | null }
    phone.sync(server)
    mac.sync(server)
    phone.edit(at(D, 7), (d) => void Object.assign(d.settings, { morningMusic: false, morningFinal: 'f' }))
    phone.sync(server)
    mac.sync(server)
    expect(mac.data.settings.morningFinal).toBe('f')
    expect(mac.data.settings.morningMusic).toBeUndefined()
  })
})
