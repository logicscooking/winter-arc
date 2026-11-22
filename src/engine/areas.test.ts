import { describe, expect, it } from 'vitest'
import { AREAS_V, compareEvents, eventDayLabel, eventsView, migrateAreas, questArea } from './areas'
import { createInitialData, normalizeData } from './data'
import { DUMP, journalAnswered, journalStatus } from './journal'
import { DEFAULT_QUESTS, PHONE_OLD, PHONE_TITLE, XP, activeQuestsFor, resolveCtx, resolveMark } from './quests'
import { TRANSITION, slotDue, slotsDone, transitionEvents } from './plan'
import { computeState } from './replay'
import { buildPublicStats } from './social'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData, CalEvent } from './types'
import { todaySections } from '../screens/todayItems'

const D = '2026-11-24'
const ev = (id: string, date: string, time?: string, over: Partial<CalEvent> = {}): CalEvent => ({ id, title: id, date, ...(time ? { time } : {}), updatedAt: 1, ...over })

describe('Сферы: области квестов', () => {
  it('встроенные квесты по умолчанию, свои — «Разное», явная сфера важнее', () => {
    const q = (id: string) => DEFAULT_QUESTS.find((x) => x.id === id)!
    expect(['wake', 'light', 'water', 'steps', 'workout', 'caffeine', 'bedtime'].map((id) => questArea(q(id)))).toEqual(Array(7).fill('health'))
    expect(['deal', 'twitter', 'leads'].map((id) => questArea(q(id)))).toEqual(['money', 'money', 'money'])
    expect(['reading', 'skill'].map((id) => questArea(q(id)))).toEqual(['growth', 'growth'])
    // no separate «Голова»: the head habits live in «Разное»
    expect(['meditation', 'phone', 'journal', 'reels'].map((id) => questArea(q(id)))).toEqual(['misc', 'misc', 'misc', 'misc'])
    expect(questArea({ id: 'x1' })).toBe('misc')
    expect(questArea({ id: 'x1', area: 'money' })).toBe('money')
    expect(questArea({ id: 'wake', area: 'growth' })).toBe('growth')
    expect(questArea({ id: 'meditation', area: 'head' as never })).toBe('misc')
  })

  it('«Сферы»: строки по сферам, внутри по времени; утро и переходы — в Здоровье', () => {
    const d = makeData()
    d.tasks.push({ id: 'own', parentId: null, title: 'Звонок', stat: 'deal', scope: 'daily', day: D, createdAt: 1, postponed: 0, order: 0 })
    const { sections } = todaySections(d, D, 'areas')
    expect(sections.map((s) => s.id)).toEqual(['a:health', 'a:money', 'a:growth', 'a:misc'])
    const keys = (id: string) => sections.find((s) => s.id === id)!.rows.map((r) => r.key)
    const health = keys('a:health')
    expect(health).toEqual(expect.arrayContaining(['quest:wake', 'quest:light', 'quest:water', 'morning', 'slot:t12', 'slot:t15', 'slot:t18', 'quest:bedtime']))
    // natural time: wake → warm-up → light … → transitions at noon → bedtime last
    expect(health[0]).toBe('quest:wake')
    expect(health.indexOf('morning')).toBeLessThan(health.indexOf('quest:light'))
    expect(health.indexOf('slot:t12')).toBeLessThan(health.indexOf('slot:t15'))
    expect(health.at(-1)).toBe('quest:bedtime')
    // «Разное»: медитация, телефон, дневник, выброс, (рилсы,) свои задачи
    expect(keys('a:misc')).toEqual(['quest:meditation', 'quest:phone', 'quest:journal', 'dump', 'task:own'])
    // twitter / leads are off by default
    expect(sections.flatMap((s) => s.rows).some((r) => r.key === 'quest:twitter' || r.key === 'quest:leads')).toBe(false)
    // every row once
    const all = sections.flatMap((s) => s.rows.map((r) => r.key))
    expect(new Set(all).size).toBe(all.length)
  })

  it('пустые сферы скрыты, «Разное» видно всегда; кольцо одно и то же в обоих режимах', () => {
    const d = makeData()
    d.quests = d.quests.map((q) => (questArea(q) === 'money' || questArea(q) === 'growth' ? { ...q, enabled: false } : q))
    const a = todaySections(d, D, 'areas')
    expect(a.sections.map((s) => s.id)).toEqual(['a:health', 'a:misc'])
    expect(todaySections(d, D, 'time').progress).toEqual(a.progress)
    expect(a.progress.areas.money).toEqual([0, 0])
    // «Разное» with nothing in it still shows (its «+ Событие»)
    d.quests = d.quests.map((q) => (questArea(q) === 'misc' ? { ...q, enabled: false } : q))
    const b = todaySections(d, D, 'areas')
    expect(b.sections.map((s) => s.id)).toEqual(['a:health', 'a:misc'])
    expect(b.sections[1].rows.map((r) => r.key)).toEqual(['dump'])
  })
})

describe('Сферы: переходы 12 · 15 · 18', () => {
  it('три слота в кольце; блоки больше не дают своих переходов', () => {
    const d = makeData()
    const l = log(d, D)
    l.dayBlocks = { a: { id: 'a', title: 'Фокус', start: 9 * 60, dur: 90 } }
    expect(todaySections(d, D).progress.transitions).toEqual([0, 3])
    l.transitions = { t12: at(D, 12), t18: at(D, 18, 5) }
    const p = todaySections(d, D).progress
    expect(p.transitions).toEqual([2, 3])
    expect(slotsDone(l)).toEqual([2, 3])
    expect(p.areas.health[0]).toBeGreaterThanOrEqual(2)
  })

  it('+2 XP Тела за слот, слоты переживают чистку плана и не требуют блока', () => {
    const now = nowAt(D, 20)
    const d0 = makeData()
    const base = computeState(d0, now)
    const d = structuredClone(d0)
    log(d, D).transitions = { t12: at(D, 12), t15: at(D, 15), bogus: at(D, 16) }
    expect(transitionEvents(d).map((e) => e.blockId)).toEqual(['t12', 't15'])
    expect(computeState(d, now).xpByStat.body - base.xpByStat.body).toBe(2 * TRANSITION.xp)
    const n = normalizeData(JSON.parse(JSON.stringify(d)))
    expect(n.days[D].transitions).toEqual({ t12: at(D, 12), t15: at(D, 15) })
  })

  it('карточка: за 15 минут до слота и 15 после, пока не сделан', () => {
    expect(slotDue(undefined, 11 * 60 + 40)).toBeUndefined()
    expect(slotDue(undefined, 11 * 60 + 50)).toEqual({ slot: { id: 't12', at: 720 }, inMin: 10 })
    expect(slotDue({ transitions: { t12: 1 } }, 11 * 60 + 50)).toBeUndefined()
    expect(slotDue(undefined, 15 * 60 + 15)?.slot.id).toBe('t15')
  })
})

describe('Сферы: вечерний дневник', () => {
  const q = DEFAULT_QUESTS.find((x) => x.id === 'journal')!
  const ctx = { reelsLimit: 20, dealDoneOnDay: false }
  const answers = (n: number) => Object.fromEntries(['win', 'stress', 'self', 'thanks', 'tomorrow'].slice(0, n).map((id, i) => [id, { text: `ответ ${i}`, at: 100 + i }]))

  it('3+ ответа — выполнено, 1–2 — мини, пустые не считаются', () => {
    expect(journalStatus(0)).toBeUndefined()
    expect(journalStatus(1)).toBe('mini')
    expect(journalStatus(2)).toBe('mini')
    expect(journalStatus(3)).toBe('done')
    expect(journalAnswered({ journal: { win: { text: '   ', at: 1 }, self: { text: 'да', at: 2 } } })).toBe(1)
    expect(resolveMark(q, { quests: {}, journal: answers(2) }, ctx)).toEqual({ status: 'mini', at: 101, auto: true })
    expect(resolveMark(q, { quests: {}, journal: answers(5) }, ctx)).toEqual({ status: 'done', at: 104, auto: true })
    expect(resolveMark(q, { quests: {} }, ctx)).toEqual({ auto: true })
  })

  it('XP по реплею: мини 5, полный 10 (побочный); выброс мыслей — бонус +2 раз в день, не в кольце', () => {
    const now = nowAt(D, 23)
    const d0 = makeData()
    const base = computeState(d0, now)
    const d = structuredClone(d0)
    log(d, D).journal = answers(1)
    expect(computeState(d, now).xpByStat.mind - base.xpByStat.mind).toBe(XP.mini)
    log(d, D).journal = answers(3)
    const st = computeState(d, now)
    expect(st.xpByStat.mind - base.xpByStat.mind).toBeGreaterThanOrEqual(XP.side)
    expect(resolveMark(q, d.days[D], resolveCtx(d, D)).status).toBe('done')
    const before = st.xp
    const total = todaySections(d, D).progress.total
    log(d, D).dump = { text: 'мысли', at: at(D, 22) }
    expect(computeState(d, now).xp - before).toBe(DUMP.xp)
    expect(todaySections(d, D).progress.total).toBe(total)
  })
})

describe('Сферы: события «Разное»', () => {
  it('сортировка: дата, время, без времени — после временных того же дня', () => {
    const list = [ev('c', '2026-11-25'), ev('b', '2026-11-25', '18:00'), ev('a', '2026-11-25', '09:30'), ev('z', '2026-11-24', '23:00')]
    expect([...list].sort(compareEvents).map((e) => e.id)).toEqual(['z', 'a', 'b', 'c'])
  })

  it('сегодня и ближайшие 14 дней; прошедшие исчезают; подписи дней', () => {
    const list = [ev('old', '2026-11-23', '10:00'), ev('t', D, '15:00'), ev('t0', D), ev('tm', '2026-11-25', '08:00'), ev('far', '2026-12-08'), ev('tooFar', '2026-12-09')]
    const v = eventsView(list, D)
    expect(v.today.map((e) => e.id)).toEqual(['t', 't0'])
    expect(v.upcoming.map((e) => e.id)).toEqual(['tm', 'far'])
    expect(eventDayLabel(D, D)).toBe('сегодня')
    expect(eventDayLabel('2026-11-25', D)).toBe('завтра')
    expect(eventDayLabel('2026-11-27', D)).toBe('пт 27 ноя')
  })

  it('«Разное» всегда последним; события на самом верху; в кольце только сегодняшние', () => {
    const d = makeData()
    d.tasks.push({ id: 'own', parentId: null, title: 'Задача', stat: 'deal', scope: 'daily', day: D, createdAt: 1, postponed: 0, order: 0 })
    d.events = [ev('tm', '2026-11-25', '08:00')]
    const misc = () => todaySections(d, D, 'areas').sections.at(-1)!
    expect(misc().id).toBe('a:misc')
    expect(misc().rows.map((x) => x.key)).toEqual(['event:tm', 'quest:meditation', 'quest:phone', 'quest:journal', 'dump', 'task:own'])
    const base = todaySections(d, D, 'areas').progress.areas.misc
    d.events.push(ev('now', D, '16:00', { doneAt: at(D, 16) }), ev('allday', D))
    const r = todaySections(d, D, 'areas')
    expect(r.sections.at(-1)!.id).toBe('a:misc')
    expect(r.sections.at(-1)!.rows.slice(0, 4).map((x) => x.key)).toEqual(['event:now', 'event:allday', 'event:tm', 'quest:meditation'])
    expect(r.sections.at(-1)!.rows.find((x) => x.key === 'event:tm')!.label).toBe('завтра')
    // today's two count (one done), tomorrow's does not
    expect(r.progress.areas.misc).toEqual([base[0] + 1, base[1] + 2])
    // «Время»: today's events by their time, upcoming ones are not shown
    const t = todaySections(d, D, 'time')
    expect(t.sections.flatMap((s) => s.rows).some((x) => x.key === 'event:tm')).toBe(false)
    expect(t.sections.find((s) => s.id === 'p:day')!.rows.some((x) => x.key === 'event:now')).toBe(true)
  })

  it('битые события выкидываются при загрузке', () => {
    const d = makeData() as unknown as Record<string, unknown>
    d.events = [ev('ok', D, '10:00'), { id: 'x', title: '', date: D }, { id: 'y', title: 'y', date: 'завтра' }, ev('t', D, '25:00')]
    const n = normalizeData(d)
    expect(n.events!.map((e) => e.id)).toEqual(['ok', 't'])
    expect(n.events![1].time).toBeUndefined()
  })
})

/** A simulated device (see sync.test.ts) */
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
  syncWith(server: { doc: SyncDoc | null }) {
    const r = mergeDocs(this.data, this.meta, server.doc)
    this.data = r.data
    this.meta = r.meta
    if (r.remoteChanged || !server.doc) server.doc = { v: 1, data: structuredClone(this.data), ...structuredClone(this.meta) }
    return r
  }
}

describe('Сферы: синхронизация', () => {
  it('события и ответы дневника сливаются по одному, удаление доходит', () => {
    const T = at(D, 9)
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(makeData())
    const mac = new Device(makeData())
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(T + 1, (d) => {
      d.events = [ev('e1', D, '10:00'), ev('e2', '2026-11-26')]
      log(d, D).journal = { win: { text: 'с телефона', at: T + 1 } }
    })
    mac.edit(T + 2, (d) => {
      d.events = [ev('e3', '2026-11-25', '09:00')]
      log(d, D).journal = { thanks: { text: 'с мака', at: T + 2 } }
      log(d, D).dump = { text: 'выброс', at: T + 2 }
    })
    phone.syncWith(server)
    mac.syncWith(server)
    phone.syncWith(server)
    for (const dev of [phone, mac]) {
      expect(dev.data.events!.map((e) => e.id)).toEqual(['e1', 'e3', 'e2'])
      expect(Object.keys(dev.data.days[D].journal!).sort()).toEqual(['thanks', 'win'])
      expect(dev.data.days[D].dump?.text).toBe('выброс')
    }
    // the same answer edited on both: the later one wins; a deleted event is gone everywhere
    phone.edit(T + 10, (d) => void (d.days[D].journal!.win = { text: 'v1', at: T + 10 }))
    mac.edit(T + 11, (d) => {
      d.days[D].journal!.win = { text: 'v2', at: T + 11 }
      d.events = d.events!.filter((e) => e.id !== 'e2')
    })
    phone.syncWith(server)
    mac.syncWith(server)
    phone.syncWith(server)
    expect(phone.data.days[D].journal!.win.text).toBe('v2')
    expect(phone.data.events!.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(mac.data).toEqual(phone.data)
    expect(Object.keys(toAtoms(phone.data)).filter((k) => k.startsWith(`days/${D}/journal/`)).sort()).toEqual([`days/${D}/journal/thanks`, `days/${D}/journal/win`])
  })
})

describe('Сферы: приватность', () => {
  it('публичная статистика не видит дневник, выброс мыслей и заметки событий', () => {
    const d = makeData()
    log(d, D).journal = { win: { text: 'СЕКРЕТ-ДНЕВНИКА', at: at(D, 22) }, self: { text: 'СЕКРЕТ-2', at: at(D, 22) }, thanks: { text: 'СЕКРЕТ-3', at: at(D, 22) } }
    log(d, D).dump = { text: 'СЕКРЕТ-ВЫБРОСА', at: at(D, 22) }
    d.events = [ev('e', D, '10:00', { title: 'СЕКРЕТ-СОБЫТИЯ', note: 'СЕКРЕТ-ЗАМЕТКИ' })]
    const now = nowAt(D, 23)
    const json = JSON.stringify(buildPublicStats(d, computeState(d, now), now))
    expect(json).not.toMatch(/СЕКРЕТ/)
  })
})

describe('Сферы: миграция', () => {
  const oldData = () => {
    const d = makeData()
    d.quests = d.quests.filter((q) => !['meditation', 'journal', 'twitter', 'leads'].includes(q.id)).map((q) => (q.id === 'phone' ? { ...q, ...PHONE_OLD } : q))
    return d
  }

  it('новые квесты с сегодняшнего дня, Твиттер и Рассылка выключены, телефон переименован', () => {
    const d = migrateAreas(normalizeData(oldData()), '2026-11-26')
    const q = (id: string) => d.quests.find((x) => x.id === id)!
    expect(q('meditation')).toMatchObject({ enabled: true, createdDay: '2026-11-26', area: 'misc' })
    expect(q('journal')).toMatchObject({ enabled: true, createdDay: '2026-11-26', kind: 'journal' })
    expect(q('twitter')).toMatchObject({ enabled: false, unit: 'постов', min: 1, goal: 3 })
    expect(q('leads')).toMatchObject({ enabled: false, unit: 'сообщений', min: 10, goal: 20 })
    expect(q('phone').title).toBe(PHONE_TITLE)
    expect(new Set(d.quests.map((x) => x.order)).size).toBe(d.quests.length)
    expect(d.ack.areasV).toBe(AREAS_V)
    // idempotent; a quest switched off later is not brought back
    const off = { ...d, quests: d.quests.map((x) => (x.id === 'meditation' ? { ...x, enabled: false } : x)) }
    expect(migrateAreas(off, '2026-11-30')).toBe(off)
  })

  it('прошлые дни не меняются: план и XP до даты появления те же', () => {
    const old = oldData()
    const day = '2026-11-25'
    log(old, day).quests.wake = { status: 'done', at: at(day, 7) }
    const now = nowAt('2026-11-26', 12)
    const before = computeState(normalizeData(structuredClone(old)), now)
    const after = computeState(migrateAreas(normalizeData(structuredClone(old)), '2026-11-26'), now)
    expect(after.days[day].plan).toEqual(before.days[day].plan)
    expect(after.xpByDay[day]).toEqual(before.xpByDay[day])
    expect(after.hpByDay[day]).toEqual(before.hpByDay[day])
    expect(activeQuestsFor(migrateAreas(old, '2026-11-26').quests, '2026-11-26').map((p) => p.id)).toEqual(expect.arrayContaining(['meditation', 'journal']))
  })

  it('свежие данные уже с новыми квестами; правленый пользователем телефон не трогается', () => {
    const fresh = migrateAreas(createInitialData(), '2026-11-26')
    expect(fresh.quests.filter((q) => q.id === 'meditation')).toHaveLength(1)
    expect(fresh.quests.find((q) => q.id === 'meditation')!.createdDay).toBeUndefined()
    const own = oldData()
    own.quests = own.quests.map((q) => (q.id === 'phone' ? { ...q, title: 'Телефон в коридоре' } : q))
    expect(normalizeData(own).quests.find((q) => q.id === 'phone')!.title).toBe('Телефон в коридоре')
  })
})
