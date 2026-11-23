import { describe, expect, it } from 'vitest'
import { normalizeData } from './data'
import { computeState } from './replay'
import { buildPublicStats } from './social'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { at, confess, makeData, nowAt } from './testkit'
import type { AppData, WeekGoal, WeekRecap } from './types'
import {
  weekDayNotes,
  WEEK_XP,
  bumpProgress,
  goalFact,
  goalsFor,
  goalsOfWeek,
  goalsTally,
  parseAiAnswer,
  parseGoalText,
  publicRecap,
  publicWeek,
  recapPrompt,
  recapText,
  recapWeekFor,
  recapWindow,
  safeRecap,
  safeWeek,
  viewFromPub,
  weekEvents,
  weekKeyOf,
  weekLabel,
} from './week'

const MON = '2026-11-30'
const SUN = '2026-12-06'

const goal = (over: Partial<WeekGoal> = {}): WeekGoal => ({ id: 'g1', week: MON, title: 'Посты в Твиттер', target: 20, unit: 'постов', order: 0, createdAt: at(MON, 9), updatedAt: at(MON, 9), ...over })
const recap = (over: Partial<WeekRecap> = {}): WeekRecap => ({ id: MON, insights: ['Утро решает всё'], fails: [{ what: 'Не писал лидам', why: 'страшно' }], nextPlan: [{ title: '100 сообщений лидам' }], updatedAt: at(SUN, 20), ...over })

describe('week key', () => {
  it('Mon–Sun by game day: Monday before 04:00 is still the last week', () => {
    expect(weekKeyOf(nowAt(MON, 12))).toBe(MON)
    expect(weekKeyOf(nowAt(SUN, 23, 59))).toBe(MON)
    // Monday 03:30 belongs to Sunday → previous week
    expect(weekKeyOf(nowAt(MON, 3, 30))).toBe('2026-11-23')
    expect(weekKeyOf(nowAt(MON, 4))).toBe(MON)
    // Monday after Sunday night: 7 Dec 02:00 is still Sunday 6 Dec
    expect(weekKeyOf(nowAt('2026-12-07', 2))).toBe(MON)
    expect(weekKeyOf(nowAt('2026-12-07', 5))).toBe('2026-12-07')
  })

  it('labels and the итог window', () => {
    expect(weekLabel(MON)).toBe('30 ноября – 6 декабря')
    expect(weekLabel('2026-12-07')).toBe('7–13 декабря')
    expect(recapWindow(MON, '2026-12-05')).toBe(false)
    expect(recapWindow(MON, SUN)).toBe(true)
    expect(recapWindow(MON, '2026-12-12')).toBe(true)
    expect(recapWindow(MON, '2026-12-13')).toBe(false)
    expect(recapWeekFor(SUN)).toBe(MON)
    expect(recapWeekFor('2026-12-09')).toBe(MON)
  })
})

describe('goals', () => {
  it('progress +/−, done at the target, back below unmarks', () => {
    let g = goal()
    g = bumpProgress(g, 5, 1)
    expect(g.progress).toBe(5)
    expect(goalFact(g)).toBe('partial')
    g = bumpProgress(g, 15, 2)
    expect(g.done).toBe(true)
    expect(goalFact(g)).toBe('done')
    g = bumpProgress(g, -1, 3)
    expect(g.done).toBeUndefined()
    g = bumpProgress(g, -100, 4)
    expect(g.progress).toBeUndefined()
    expect(goalFact(g)).toBe('none')
    expect(goalFact({ done: true })).toBe('done')
    expect(goalsTally([goal({ done: true }), goal({ progress: 3 }), goal()])).toEqual({ done: 1, partial: 1, total: 3 })
  })

  it('parses a typed goal', () => {
    expect(parseGoalText('Посты | 20 постов')).toEqual({ title: 'Посты', target: 20, unit: 'постов' })
    expect(parseGoalText('Сообщения лидам | 1 000')).toEqual({ title: 'Сообщения лидам', target: 1000 })
    expect(parseGoalText('Доделать лендинг')).toEqual({ title: 'Доделать лендинг' })
  })

  it('week goals sort and filter private', () => {
    const d = makeData({ weekGoals: [goal({ id: 'b', order: 1 }), goal({ id: 'a', order: 0, private: true }), goal({ id: 'c', week: '2026-12-07' })] })
    expect(goalsOfWeek(d, MON).map((g) => g.id)).toEqual(['a', 'b'])
    expect(goalsOfWeek(d, '2026-12-03', { withPrivate: false }).map((g) => g.id)).toEqual(['b'])
  })
})

describe('XP', () => {
  it('once per week for goals and for the итог, only in time', () => {
    const d = makeData({
      weekGoals: [goal(), goal({ id: 'g2', createdAt: at(MON, 10) }), goal({ id: 'old', week: '2026-11-23', createdAt: at(SUN, 12) })],
      weekRecaps: [recap({ doneAt: at(SUN, 21) }), recap({ id: '2026-11-23', doneAt: at(SUN, 21) })],
    })
    const ev = weekEvents(d)
    expect(ev.filter((e) => e.kind === 'goals')).toHaveLength(1)
    expect(ev.find((e) => e.kind === 'goals')!.day).toBe(MON)
    expect(ev.filter((e) => e.kind === 'recap').map((e) => e.week)).toEqual([MON])
    const now = nowAt(SUN, 22)
    const withXp = computeState(d, now)
    const without = computeState(makeData(), now)
    expect(withXp.xp - without.xp).toBe(WEEK_XP.goals + WEEK_XP.recap)
    // replay is deterministic: the same log gives the same XP
    expect(computeState(structuredClone(d), now).xp).toBe(withXp.xp)
  })
})

describe('AI answer parser', () => {
  it('reads the strict format', () => {
    const p = parseAiAnswer('ВЫВОД: Неделя ровная, утро держит.\nЦЕЛЬ: Посты в Твиттер | 20 постов\nЦЕЛЬ: Доделать лендинг')
    expect(p.summary).toBe('Неделя ровная, утро держит.')
    expect(p.goals).toEqual([{ title: 'Посты в Твиттер', target: 20, unit: 'постов' }, { title: 'Доделать лендинг' }])
  })

  it('tolerates bullets, numbering, markdown, English labels and chatter', () => {
    const text = [
      'Конечно! Вот разбор:',
      '',
      '**Вывод недели:**',
      'Ты стабилен в утренних квестах,',
      'но провалил лидов из-за страха.',
      '',
      '### Цели на следующую неделю',
      '1. **ЦЕЛЬ:** Сообщения лидам | 100 сообщений',
      '- Цель — 3 тренировки | 3 раза',
      '* goal: Read 50 pages | 50 pages',
      '• ЦЕЛЬ 4: Лечь до 23:30 пять раз',
      '2) Позвонить маме',
      'Удачи на неделе!',
      'ЦЕЛЬ: сообщения лидам | 100 сообщений',
    ].join('\n')
    const p = parseAiAnswer(text)
    expect(p.summary).toBe('Ты стабилен в утренних квестах, но провалил лидов из-за страха.')
    expect(p.goals.map((g) => g.title)).toEqual(['Сообщения лидам', '3 тренировки', 'Read 50 pages', 'Лечь до 23:30 пять раз', 'Позвонить маме'])
    expect(p.goals[0]).toMatchObject({ target: 100, unit: 'сообщений' })
    expect(p.goals[2]).toMatchObject({ target: 50, unit: 'pages' })
    expect(p.goals[3].target).toBeUndefined()
  })

  it('a dash number, a plain «Цели:» list and English summary', () => {
    const p = parseAiAnswer('Summary: Solid week.\nGoals:\n- Посты — 20 постов\n- 10 звонков клиентам\n\nP.S. ты молодец')
    expect(p.summary).toBe('Solid week.')
    expect(p.goals).toEqual([{ title: 'Посты', target: 20, unit: 'постов' }, { title: '10 звонков клиентам' }])
  })

  it('party answers: [Ник] before a goal, only mine are taken', () => {
    const p = parseAiAnswer('ВЫВОД: Пати держится.\nЦЕЛЬ: [Лёша] Посты | 15 постов\nЦЕЛЬ (Маша): 3 тренировки\nЦЕЛЬ: Общий созвон')
    expect(p.goals.map((g) => g.who)).toEqual(['Лёша', 'Маша', undefined])
    expect(goalsFor(p, 'лёша')).toEqual([{ title: 'Посты', target: 15, unit: 'постов' }, { title: 'Общий созвон' }])
  })

  it('garbage gives nothing', () => {
    expect(parseAiAnswer('')).toEqual({ goals: [] })
    expect(parseAiAnswer('просто текст\nбез формата')).toEqual({ goals: [] })
  })
})

describe('public stats and privacy', () => {
  function sample(): AppData {
    const d = makeData({
      weekGoals: [goal({ progress: 12 }), goal({ id: 'p', title: 'СЕКРЕТ-ЦЕЛИ', private: true })],
      weekRecaps: [recap({ doneAt: at(SUN, 21), numbers: { pct: 74, days: 7, perfect: 2, xp: 400, streak: 6, quests: [], money: 55555 } })],
    })
    d.profile!.onboardDay = '2026-11-23'
    confess(d, SUN, { main: 'СЕКРЕТ-ИСПОВЕДИ' })
    d.days[SUN].journal = { self: { text: 'СЕКРЕТ-ДНЕВНИКА', at: at(SUN, 22) } }
    d.days[SUN].dump = { text: 'СЕКРЕТ-ВЫБРОСА', at: at(SUN, 22) }
    return d
  }

  it('goals and the итог go out without private goals, the diary or money', () => {
    const d = sample()
    const now = nowAt(SUN, 23)
    const s = buildPublicStats(d, computeState(d, now), now)
    const json = JSON.stringify(s)
    expect(json).not.toMatch(/СЕКРЕТ/)
    expect(json).not.toMatch(/55555/)
    expect(s.week).toEqual({ key: MON, goals: [{ t: 'Посты в Твиттер', n: 20, u: 'постов', p: 12 }] })
    expect(s.recap?.ins).toEqual(['Утро решает всё'])
    expect(s.recap?.goals).toHaveLength(1)
    expect(s.recap?.num?.money).toBeUndefined()
    d.settings.moneyShare = true
    expect(publicRecap(d, SUN)?.num?.money).toBe(55555)
  })

  it('a draft or hidden итог stays home', () => {
    const d = sample()
    d.weekRecaps = [recap()]
    expect(publicRecap(d, SUN)).toBeUndefined()
    d.weekRecaps = [recap({ doneAt: at(SUN, 21), private: true })]
    expect(publicRecap(d, SUN)).toBeUndefined()
    // two weeks later it is stale
    d.weekRecaps = [recap({ doneAt: at(SUN, 21) })]
    expect(publicRecap(d, '2026-12-21')).toBeUndefined()
    expect(publicWeek(makeData(), SUN)).toBeUndefined()
  })

  it('a friend payload is validated', () => {
    expect(safeWeek({ key: MON, goals: [{ t: 'Посты', n: 20, p: 5 }, { t: '' }, 'x'] }, SUN)).toEqual([{ t: 'Посты', n: 20, p: 5 }])
    expect(safeWeek({ key: '2026-11-23', goals: [{ t: 'old' }] }, SUN)).toBeNull()
    const r = safeRecap({ key: MON, goals: [], ins: ['a'.repeat(999), 5], fails: [{ w: 'x', y: 'y' }, {}], next: [{ t: 'z', n: 3, u: 'раза' }], ai: 'ok', evil: '<script>' }, SUN)
    expect(r?.ins[0]).toHaveLength(280)
    expect(r?.ins).toHaveLength(1)
    expect(r?.fails).toEqual([{ w: 'x', y: 'y' }])
    expect(r?.next).toEqual([{ t: 'z', n: 3, u: 'раза' }])
    expect(JSON.stringify(r)).not.toMatch(/script/)
    expect(safeRecap({ key: 'nope' }, SUN)).toBeNull()
  })

  it('share text and prompt hold exactly the deck', () => {
    const d = sample()
    const pub = publicRecap(d, SUN)!
    const v = viewFromPub(pub, 'Волк')
    const text = recapText(v)
    expect(text).toMatch(/Итог недели · Волк · 30 ноября – 6 декабря/)
    expect(text).toMatch(/◐ Посты в Твиттер — 12\/20 постов/)
    expect(text).toMatch(/Утро решает всё/)
    expect(text).toMatch(/Не писал лидам → страшно/)
    expect(text).not.toMatch(/СЕКРЕТ/)
    const prompt = recapPrompt([v])
    expect(prompt).toMatch(/ВЫВОД:/)
    expect(prompt).toMatch(/ЦЕЛЬ: <действие> \| <число> <единица>/)
    expect(prompt).not.toMatch(/СЕКРЕТ/)
    const party = recapPrompt([v, { ...v, name: 'Маша' }], { party: 'Зима' })
    expect(party).toMatch(/### Волк/)
    expect(party).toMatch(/### Маша/)
    expect(party).toMatch(/\[Ник\]/)
  })

  it('личный промпт для ИИ видит оценку дня, «почему так» и дневник; промпт пати — нет', () => {
    const d = sample()
    d.days[SUN].confession!.dayScore = 7
    d.days[SUN].confession!.dayWhy = 'ПОЧЕМУ-ТАК'
    const notes = weekDayNotes(d, MON, SUN)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ day: SUN, score: 7, why: 'ПОЧЕМУ-ТАК', main: 'СЕКРЕТ-ИСПОВЕДИ' })
    const v = viewFromPub(publicRecap(d, SUN)!, 'Волк')
    const own = recapPrompt([v], { notes })
    expect(own).toMatch(/оценка дня 7\/10/)
    expect(own).toMatch(/Почему так: ПОЧЕМУ-ТАК/)
    expect(own).toMatch(/Что я понял о себе\? СЕКРЕТ-ДНЕВНИКА/)
    expect(own).toMatch(/закономерности/)
    expect(own).not.toMatch(/СЕКРЕТ-ВЫБРОСА/)
    const party = recapPrompt([v, { ...v, name: 'Маша' }], { party: 'Зима', notes })
    expect(party).not.toMatch(/ПОЧЕМУ-ТАК|СЕКРЕТ|оценка дня/)
    // public stats never carry them
    const now = nowAt(SUN, 23)
    expect(JSON.stringify(buildPublicStats(d, computeState(d, now), now))).not.toMatch(/ПОЧЕМУ-ТАК/)
  })
})

describe('sync', () => {
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
    syncWith(server: { doc: SyncDoc | null }) {
      const r = mergeDocs(this.data, this.meta, server.doc)
      this.data = r.data
      this.meta = r.meta
      if (r.remoteChanged || !server.doc) server.doc = this.doc()
    }
  }

  it('goals merge per goal, итоги per week, deletes win over older edits', () => {
    const start = makeData({ weekGoals: [goal(), goal({ id: 'g2', title: 'Лендинг', target: undefined, unit: undefined, order: 1 })] })
    const phone = new Device(start)
    const mac = new Device(start)
    const server: { doc: SyncDoc | null } = { doc: null }
    phone.syncWith(server)
    mac.syncWith(server)
    phone.edit(1000, (d) => (d.weekGoals![0] = bumpProgress(d.weekGoals![0], 3, 1000)))
    mac.edit(1100, (d) => {
      d.weekGoals = d.weekGoals!.filter((g) => g.id !== 'g2')
      d.weekGoals.push(goal({ id: 'g3', title: 'Звонки', order: 2 }))
      d.weekRecaps = [recap()]
    })
    phone.edit(1200, (d) => (d.weekRecaps = [recap({ insights: ['с телефона'], updatedAt: 1200 })]))
    phone.syncWith(server)
    mac.syncWith(server)
    phone.syncWith(server)
    for (const dev of [phone, mac]) {
      expect(dev.data.weekGoals!.map((g) => g.id)).toEqual(['g1', 'g3'])
      expect(dev.data.weekGoals![0].progress).toBe(3)
      // the later edit of the week's итог wins as a whole
      expect(dev.data.weekRecaps).toHaveLength(1)
      expect(dev.data.weekRecaps![0].insights).toEqual(['с телефона'])
    }
  })

  it('normalize drops broken goals and keeps one итог per week', () => {
    const d = normalizeData({ ...makeData(), weekGoals: [goal(), { id: 'x' }, { ...goal({ id: 'y' }), week: 'bad' }], weekRecaps: [recap({ updatedAt: 1 }), recap({ updatedAt: 2, insights: ['new'] }), { id: 5 }] })
    expect(d.weekGoals!.map((g) => g.id)).toEqual(['g1'])
    expect(d.weekRecaps).toHaveLength(1)
    expect(d.weekRecaps![0].insights).toEqual(['new'])
  })
})
