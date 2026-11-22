import { describe, expect, it } from 'vitest'
import { questStreak } from './analysis'
import { chapterRank, computeState, daysNeedingSnapshot, unacknowledgedMissed } from './replay'
import { addDays } from './time'
import { at, confess, doMains, log, makeData, mark, nowAt, perfectDays } from './testkit'

const D1 = '2026-11-23' // Пролог, mains: wake + phone
const I1 = '2026-11-30' // глава I, 5 mains

describe('HP: пропуски и «не пропускай дважды»', () => {
  it('пропущенный main −10, без исповеди ещё −10 (после дедлайна)', () => {
    const data = makeData()
    mark(data, D1, 'wake')
    // phone missed, no confession
    expect(computeState(data, nowAt(addDays(D1, 1), 15, 59)).hp).toBe(100) // ещё можно исповедаться
    const st = computeState(data, nowAt(addDays(D1, 1), 16, 0))
    expect(st.days[D1]).toMatchObject({ closed: true, retro: true, missedMain: ['phone'], closeHpDelta: -20 })
    expect(st.hp).toBe(80)
  })

  it('тот же квест второй день подряд −20, третий тоже −20, после выполнения снова −10', () => {
    const data = makeData()
    for (let i = 0; i < 5; i++) {
      const d = addDays(D1, i)
      mark(data, d, 'wake')
      if (i === 3) mark(data, d, 'phone')
      confess(data, d)
    }
    const st = computeState(data, nowAt(addDays(D1, 4), 22))
    expect([0, 1, 2, 3, 4].map((i) => st.days[addDays(D1, i)].closeHpDelta)).toEqual([-10, -20, -20, 5, -10])
    expect(st.hp).toBe(100 - 10 - 20 - 20 + 5 - 10)
  })

  it('разные квесты подряд — не двойной урон', () => {
    const data = makeData()
    mark(data, D1, 'wake')
    confess(data, D1)
    mark(data, addDays(D1, 1), 'phone')
    confess(data, addDays(D1, 1))
    const st = computeState(data, nowAt(addDays(D1, 1), 22))
    expect(st.days[addDays(D1, 1)].closeHpDelta).toBe(-10)
  })

  it('мини-версия = выполнение для HP и серий', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(D1, 9), day: D1, what: 'reels', why: 'auto' })
    doMains(data, D1, 'mini')
    confess(data, D1)
    const st = computeState(data, nowAt(D1, 22))
    expect(st.days[D1].perfect).toBe(true)
    expect(st.hp).toBe(95) // −10 слился, +5 идеальный день
    expect(questStreak(st, 'phone').current).toBe(1)
  })

  it('идеальный день +5, но не выше 100', () => {
    const data = makeData()
    perfectDays(data, D1, 2)
    expect(computeState(data, nowAt(addDays(D1, 1), 22)).hp).toBe(100)
  })
})

describe('Слился / Камбэк', () => {
  it('−10 сразу, камбэк в течение 60 минут +5 HP, +2❄, +5 XP Воли', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(D1, 15), day: D1, what: 'reels', why: 'boredom', comebackAt: at(D1, 15, 59) })
    data.slips.push({ id: 't', at: at(D1, 18), day: D1, what: 'cola', why: 'auto' })
    const st = computeState(data, nowAt(D1, 19))
    expect(st.hp).toBe(85)
    expect(st.shards).toBe(2)
    expect(st.xpByStat.will).toBe(5)
  })
  it('камбэк позже 60 минут не засчитывается', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(D1, 15), day: D1, what: 'reels', why: 'boredom', comebackAt: at(D1, 16, 1) })
    expect(computeState(data, nowAt(D1, 19)).hp).toBe(90)
  })
  it('тяга побеждена +10 XP Воли +2❄, пауза «Закрыть» +5 XP Воли', () => {
    const data = makeData()
    data.cravings.push({ id: 'c', at: at(D1, 12), day: D1, result: 'won', swap: 'вода' })
    data.cravings.push({ id: 'd', at: at(D1, 13), day: D1, result: 'lost', swap: 'вода' })
    data.pauses.push({ id: 'p', at: at(D1, 14), day: D1, app: 'instagram', result: 'resisted' })
    const st = computeState(data, nowAt(D1, 19))
    expect(st.xpByStat.will).toBe(15)
    expect(st.shards).toBe(2)
  })
})

describe('заморозка', () => {
  it('+1 за 7 идеальных дней подряд, максимум 2', () => {
    const data = makeData()
    perfectDays(data, D1, 21)
    expect(computeState(data, nowAt(addDays(D1, 6), 22)).freezes).toBe(1)
    expect(computeState(data, nowAt(addDays(D1, 13), 22)).freezes).toBe(2)
    expect(computeState(data, nowAt(addDays(D1, 20), 22)).freezes).toBe(2)
  })
  it('неидеальный день сбрасывает счёт до заморозки', () => {
    const data = makeData()
    perfectDays(data, D1, 6)
    confess(data, addDays(D1, 6)) // день 7 без квестов
    perfectDays(data, addDays(D1, 7), 6)
    expect(computeState(data, nowAt(addDays(D1, 12), 22)).freezes).toBe(0)
  })
  it('потраченная заморозка защищает HP и серии, «дважды» не срабатывает', () => {
    const data = makeData()
    perfectDays(data, D1, 7) // +1 заморозка
    const f = addDays(D1, 7)
    confess(data, f)
    log(data, f).freeze = true
    const n = addDays(D1, 8)
    confess(data, n)
    mark(data, n, 'wake')
    const st = computeState(data, nowAt(n, 22))
    expect(st.days[f]).toMatchObject({ frozen: true, closeHpDelta: 0 })
    expect(st.freezes).toBe(0)
    expect(st.days[n].closeHpDelta).toBe(-40) // 4 пропуска по −10: после заморозки не −20
    expect(questStreak(st, 'wake').current).toBe(8) // серия прошла сквозь замороженный день
  })
  it('без заморозок в запасе — обычный урон', () => {
    const data = makeData()
    confess(data, D1)
    log(data, D1).freeze = true
    const st = computeState(data, nowAt(D1, 22))
    expect(st.days[D1].frozen).toBe(false)
    expect(st.hp).toBe(80)
  })
})

describe('падение', () => {
  it('HP 0 → −20% ранга главы, осколки ÷2, восстановление 3 идеальных дня → HP 50', () => {
    const data = makeData()
    // день 1: всё сделано, копим XP и осколки
    for (const p of ['wake', 'phone', 'light', 'reading', 'deal', 'caffeine', 'bedtime', 'water']) mark(data, D1, p)
    confess(data, D1)
    const before = computeState(data, nowAt(D1, 22))
    expect(before.shards).toBeGreaterThan(0)
    // день 2: 10 срывов → HP 0
    const d2 = addDays(D1, 1)
    for (let i = 0; i < 10; i++) data.slips.push({ id: `s${i}`, at: at(d2, 10, i), day: d2, what: 'reels', why: 'auto' })
    const fallen = computeState(data, nowAt(d2, 12))
    expect(fallen.hp).toBe(0)
    expect(fallen.fallen).toBe(true)
    expect(fallen.shards).toBe(Math.floor(before.shards / 2))
    expect(chapterRank(fallen, 0)).toBe(before.xp - Math.round(before.xp * 0.2))
    expect(fallen.xp).toBe(before.xp) // общий XP не сгорает
    // во время падения урон и бонусы HP не применяются
    confess(data, d2)
    perfectDays(data, addDays(D1, 2), 1)
    const d4 = addDays(D1, 3)
    confess(data, d4) // неидеальный день сбрасывает восстановление
    perfectDays(data, addDays(D1, 4), 2)
    const mid = computeState(data, nowAt(addDays(D1, 5), 22))
    expect(mid).toMatchObject({ hp: 0, fallen: true, recovery: 2 })
    perfectDays(data, addDays(D1, 6), 1)
    const up = computeState(data, nowAt(addDays(D1, 6), 22))
    expect(up).toMatchObject({ hp: 50, fallen: false })
    expect(up.falls).toHaveLength(1)
  })
})

describe('ретроактивная оценка пропущенных дней', () => {
  it('не открывал приложение 3 дня → всё пропуск, исповеди нет = −10, и падение', () => {
    const data = makeData()
    const st = computeState(data, nowAt(addDays(D1, 3), 17))
    expect([0, 1, 2].map((i) => st.days[addDays(D1, i)].closeHpDelta)).toEqual([-30, -50, -50])
    expect(st.hp).toBe(0)
    expect(st.fallen).toBe(true)
    expect(unacknowledgedMissed(st)).toEqual([D1, addDays(D1, 1), addDays(D1, 2)])
    expect(unacknowledgedMissed(st, addDays(D1, 1))).toEqual([addDays(D1, 2)])
    expect(st.days[addDays(D1, 3)].closed).toBe(false) // сегодняшний день ещё идёт
  })
  it('оценка начинается с дня онбординга, если он позже старта арки', () => {
    const data = makeData()
    data.profile!.onboardDay = addDays(D1, 2)
    const st = computeState(data, nowAt(addDays(D1, 3), 17))
    expect(st.days[D1].closed).toBe(false)
    expect(st.hp).toBe(70)
  })
  it('снапшот плана для закрытых дней', () => {
    const data = makeData()
    confess(data, D1)
    // дни разминки (20–22 ноя) тоже замораживаются
    expect(daysNeedingSnapshot(data, nowAt(addDays(D1, 1), 10))).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', D1])
    expect(daysNeedingSnapshot(data, nowAt(addDays(D1, 1), 17))).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', D1])
  })
  it('до старта арки идёт разминка: день открыт, HP не тратится', () => {
    const st = computeState(makeData(), new Date(2026, 10, 20, 12))
    expect(st.hp).toBe(100)
    expect(Object.keys(st.days)).toEqual(['2026-11-20'])
    expect(st.days['2026-11-20']).toMatchObject({ warmup: true, closed: false })
  })
})

describe('граница дня в отметках', () => {
  it('исповедь в 02:00 ночи относится к прошлому дню и закрывает его', () => {
    const data = makeData()
    doMains(data, D1)
    confess(data, D1, { at: at(D1, 2, 0, 1) })
    const st = computeState(data, nowAt(addDays(D1, 1), 2))
    expect(st.today).toBe(D1)
    expect(st.days[D1]).toMatchObject({ closed: true, perfect: true, retro: false })
  })
})

describe('XP, осколки, ранг', () => {
  it('main 20 / side 10 / база ×0.5 / исповедь 5 + осколки', () => {
    const data = makeData()
    mark(data, D1, 'wake') // main 20, 3❄
    mark(data, D1, 'water') // side 10, 2❄
    confess(data, D1) // 5 XP, 1❄
    const st = computeState(data, nowAt(D1, 22))
    expect(st.xp).toBe(35)
    expect(st.xpByStat).toMatchObject({ energy: 20, body: 10, will: 5 })
    expect(st.shards).toBe(6)
    const ii = '2027-01-10'
    const d2 = makeData()
    mark(d2, ii, 'phone') // база
    expect(computeState(d2, nowAt(ii, 12)).xp).toBe(5)
  })
  it('задача Дела 30 XP, подзадача 3 XP, Дело дня закрывает квест', () => {
    const data = makeData()
    data.tasks.push(
      { id: 'p', parentId: null, title: 'Проект', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0 },
      { id: 't', parentId: 'p', title: 'Задача', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0, doneAt: at(I1, 15), doneDay: I1 },
      { id: 's', parentId: 't', title: 'Подзадача', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0, doneAt: at(I1, 14), doneDay: I1 },
    )
    log(data, I1).dealTaskId = 't'
    const st = computeState(data, nowAt(I1, 16))
    expect(st.days[I1].marks.deal).toBe('done')
    expect(st.xpByStat.deal).toBe(30 + 3 + 20)
  })
  it('покупки списывают осколки', () => {
    const data = makeData()
    perfectDays(data, D1, 3)
    const before = computeState(data, nowAt(addDays(D1, 2), 22)).shards
    data.purchases.push({ id: 'x', at: at(addDays(D1, 2), 23), day: addDays(D1, 2), itemId: 'cola', title: 'Кола', price: 12, kind: 'cola' })
    expect(computeState(data, nowAt(addDays(D1, 2), 23, 30)).shards).toBe(before - 12)
  })
  it('ранг главы считается отдельно по главам', () => {
    const data = makeData()
    perfectDays(data, '2026-11-29', 2)
    const st = computeState(data, nowAt('2026-11-30', 22))
    // CRITICAL rolls are deterministic per day + quest: add their bonus on top of the base XP
    const critBonus = (day: string) => st.days[day].crits.reduce((s, id) => s + (st.days[day].plan.find((p) => p.id === id)?.role === 'main' ? 10 : 5), 0)
    expect(chapterRank(st, 0)).toBe(45 + critBonus('2026-11-29'))
    expect(chapterRank(st, 1)).toBe(105 + critBonus('2026-11-30'))
  })
})

describe('неделя без босса', () => {
  it('идеальная неделя: только квесты, исповеди и уровни, без награды босса', () => {
    const data = makeData()
    perfectDays(data, D1, 7)
    const st = computeState(data, nowAt(addDays(D1, 6), 22))
    // levels 2 and 3 give 6 + 9 ❄
    expect(st.shards).toBe(7 * (3 + 3 + 1) + 6 + 9)
    expect(st.conqueror.closed).toBe(7)
  })
})

describe('серии', () => {
  it('«X из последних 7» и серия честности', () => {
    const data = makeData()
    perfectDays(data, D1, 5)
    const d6 = addDays(D1, 5)
    mark(data, d6, 'wake')
    const st = computeState(data, nowAt(addDays(D1, 6), 17))
    const s = questStreak(st, 'phone')
    expect(s.current).toBe(0)
    expect(s.last7).toBe(5)
    expect(s.best).toBe(5)
    expect(st.honestyStreak).toBe(0)
    expect(st.bestHonesty).toBe(5)
    expect(questStreak(st, 'wake').current).toBe(6)
  })
})

describe('Разминка: дни до старта арки', () => {
  const W1 = '2026-11-20' // день онбординга в makeData, пятница
  const SUN = '2026-11-22'

  it('до 23 ноября квесты, исповедь и тяга дают XP и ❄, HP не меняется', () => {
    const data = makeData()
    mark(data, W1, 'wake')
    mark(data, W1, 'water')
    confess(data, W1)
    data.cravings.push({ id: 'c', at: at(W1, 14), day: W1, result: 'won', swap: 'вода' })
    const st = computeState(data, nowAt(W1, 22))
    expect(st.days[W1]).toMatchObject({ warmup: true, closed: true, confession: true, closeHpDelta: 0 })
    expect(st.xp).toBe(20 + 10 + 5 + 10)
    expect(st.shards).toBe(3 + 2 + 1 + 2)
    expect(st.hp).toBe(100)
    expect(st.xpByDay[W1]).toBe(45)
  })

  it('«Слился» в разминке записывается, но HP не снимает; камбэк даёт XP и ❄', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(W1, 15), day: W1, what: 'reels', why: 'boredom', comebackAt: at(W1, 15, 30) })
    data.slips.push({ id: 't', at: at(W1, 18), day: W1, what: 'cola', why: 'auto' })
    const st = computeState(data, nowAt(W1, 19))
    expect(st.hp).toBe(100)
    expect(st.xpByStat.will).toBe(5)
    expect(st.shards).toBe(2)
  })

  it('пропуски и молчание в разминке не стоят HP и не попадают в «Пропущено N дней»', () => {
    const data = makeData()
    const st = computeState(data, nowAt(ARC_START_DAY, 17))
    for (const d of [W1, '2026-11-21', SUN]) expect(st.days[d]).toMatchObject({ warmup: true, closed: true, retro: false, closeHpDelta: 0 })
    expect(st.hp).toBe(100)
    expect(unacknowledgedMissed(st)).toEqual([])
  })

  it('идеальные дни разминки не идут в счёт «Покорителя зимы»', () => {
    const data = makeData()
    perfectDays(data, W1, 3)
    const st = computeState(data, nowAt(ARC_START_DAY, 10))
    expect(st.conqueror).toEqual({ closed: 0, need: 70, won: false })
  })

  it('пропуск в последний день разминки не делает первый пропуск арки двойным', () => {
    const data = makeData()
    mark(data, SUN, 'wake')
    confess(data, SUN) // phone пропущен
    mark(data, ARC_START_DAY, 'wake')
    confess(data, ARC_START_DAY) // phone пропущен снова
    const st = computeState(data, nowAt(ARC_START_DAY, 22))
    expect(st.days[ARC_START_DAY].closeHpDelta).toBe(-10)
    expect(st.hp).toBe(90)
  })

  it('идеальные дни разминки не копят заморозки, но идут в серии и честность', () => {
    const data = makeData({ profile: { nick: 'Т', avatar: '🐺', usualWake: '07:00', onboardDay: '2026-11-14' } })
    perfectDays(data, '2026-11-14', 9)
    const st = computeState(data, nowAt(SUN, 22))
    expect(st.freezes).toBe(0)
    expect(st.perfectRun).toBe(0)
    expect(st.honestyStreak).toBe(9)
    expect(questStreak(st, 'wake').current).toBe(9)
  })

  it('онбординг после старта — разминки нет, дни до онбординга не оцениваются', () => {
    const data = makeData({ profile: { nick: 'Т', avatar: '🐺', usualWake: '07:00', onboardDay: '2026-11-25' } })
    const st = computeState(data, nowAt('2026-11-25', 12))
    expect(Object.values(st.days).some((r) => r.warmup)).toBe(false)
    expect(st.days[ARC_START_DAY].closed).toBe(false)
  })

  it('закрытые дни разминки получают снимок плана', () => {
    const data = makeData()
    expect(daysNeedingSnapshot(data, nowAt(SUN, 17))).toEqual([W1, '2026-11-21'])
  })
})

const ARC_START_DAY = '2026-11-23'
