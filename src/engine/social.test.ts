import { describe, expect, it } from 'vitest'
import { computeState } from './replay'
import { buildPublicStats, detectFeedEvents, feedText, shareSettings } from './social'
import { at, confess, doMains, makeData, mark, nowAt } from './testkit'

const D = '2026-11-24'

function sample() {
  const d = makeData()
  d.profile!.onboardDay = '2026-11-23'
  doMains(d, D)
  confess(d, D, { main: 'СЕКРЕТ-ИСПОВЕДИ' })
  d.days[D].checkin = { wake: '07:00', sleep: 2, energy: 1, at: at(D, 7) }
  d.slips.push({ id: 's1', at: at(D, 15), day: D, what: 'reels', why: 'stress', note: 'СЕКРЕТ-ЗАМЕТКИ', comebackAt: at(D, 15, 20), swap: '10 отжиманий' })
  d.slips.push({ id: 's2', at: at(D, 16), day: D, what: 'cola', why: 'boredom', comebackAt: at(D, 16, 10), swap: 'Позвонил СЕКРЕТ-СВОЯ-ЗАМЕНА' })
  d.baseline = { waistCm: 91, screenMin: 333 }
  d.reviews[1] = { worked: 'СЕКРЕТ-ОБЗОРА', remove: '', simplify: '', at: 1 }
  d.books.push({ id: 'b1', title: 'Мастер и Маргарита', total: 10, current: 10, startDay: D, finishedDay: D })
  return d
}

describe('public stats', () => {
  it('never leaks private text or numbers', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const s = buildPublicStats(d, computeState(d, now), now)
    const json = JSON.stringify(s)
    expect(json).not.toMatch(/СЕКРЕТ/)
    expect(json).not.toMatch(/stress|boredom|waist|screen|333|91/)
    expect(json.length).toBeLessThan(32 * 1024)
  })

  it('describes today: bulbs, mains, honesty', () => {
    const d = sample()
    const day = '2026-11-25'
    mark(d, day, 'wake')
    const now = nowAt(day, 12)
    const s = buildPublicStats(d, computeState(d, now), now)
    expect(s.day).toBe(day)
    expect(s.mainDone).toBe(1)
    expect(s.bulbs.length).toBeGreaterThan(s.mainTotal)
    expect(s.bulbs[0]).toBe('M')
    expect(s.mains[0]).toEqual({ t: 'Подъём в целевое время', n: 2 })
    expect(s.honesty).toBe(1)
  })
})

describe('feed events', () => {
  const ctx = (since: number, levelAtSince = 1) => ({ since, levelAtSince, share: shareSettings(makeData()) })

  it('slip shows only the category; a preset comeback swap is shared, a custom one is not', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const ev = detectFeedEvents(d, computeState(d, now), ctx(at(D, 0)))
    const json = JSON.stringify(ev)
    expect(json).not.toMatch(/СЕКРЕТ|stress|boredom/)
    const slip = ev.find((e) => e.key === 'slip:s1')!
    expect(slip.payload).toEqual({ what: 'reels' })
    expect(ev.find((e) => e.key === 'comeback:s1')!.payload).toEqual({ what: 'reels', slip: 'slip:s1', swap: '10 отжиманий' })
    expect(ev.find((e) => e.key === 'comeback:s2')!.payload).toEqual({ what: 'cola', slip: 'slip:s2' })
    expect(feedText('slip', slip.payload, { swap: '10 отжиманий' })).toBe('Слился на рилсах → камбэк: 10 отжиманий ✅')
  })

  it('perfect day, book and level up after `since`', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const game = computeState(d, now)
    const ev = detectFeedEvents(d, game, ctx(at(D, 0), 0))
    const keys = ev.map((e) => e.key)
    expect(keys).toContain(`perfect:${D}`)
    expect(keys).toContain('book:b1')
    expect(keys).toContain('level:4')
    expect(detectFeedEvents(d, game, ctx(at(D, 0), 4)).some((e) => e.kind === 'level')).toBe(false)
  })

  it('nothing from before `since`, and nothing that is switched off', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const game = computeState(d, now)
    expect(detectFeedEvents(d, game, ctx(at('2026-11-25', 9), 99))).toEqual([])
    const off = detectFeedEvents(d, game, { since: at(D, 0), levelAtSince: 1, share: { slips: false, perfect: false, level: false, book: false } })
    expect(off).toEqual([])
  })

  it('keys are stable, so two devices post the same event once', () => {
    const d = sample()
    const now = nowAt('2026-11-25', 10)
    const a = detectFeedEvents(d, computeState(d, now), ctx(at(D, 0))).map((e) => e.key)
    const b = detectFeedEvents(structuredClone(d), computeState(d, nowAt('2026-11-25', 11)), ctx(at(D, 0))).map((e) => e.key)
    expect(a).toEqual(b)
  })
})
