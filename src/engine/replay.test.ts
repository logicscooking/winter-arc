import { describe, expect, it } from 'vitest'
import { questStreak } from './analysis'
import { computeState, daysNeedingSnapshot, unacknowledgedMissed } from './replay'
import { addDays } from './time'
import { at, confess, doMains, log, makeData, mark, nowAt, perfectDays } from './testkit'

const D1 = '2026-11-23' // Пролог, mains: wake + phone
const I1 = '2026-11-30' // глава I, 5 mains

describe('Эло вместо HP: молчание и пропуски', () => {
  it('пропущенный main больше не штрафует; день без исповеди после дедлайна −10 Эло', () => {
    const data = makeData()
    mark(data, D1, 'wake')
    // phone missed, no confession
    expect(computeState(data, nowAt(addDays(D1, 1), 15, 59)).elo).toBe(1000) // ещё можно исповедаться
    const st = computeState(data, nowAt(addDays(D1, 1), 16, 0))
    expect(st.days[D1]).toMatchObject({ closed: true, retro: true, missedMain: ['phone'], eloLoss: -10 })
    expect(st.elo).toBe(1000 + st.days[D1].eloGain - 10)
  })

  it('с исповедью пропуск ничего не отнимает', () => {
    const data = makeData()
    mark(data, D1, 'wake')
    confess(data, D1)
    const st = computeState(data, nowAt(D1, 22))
    expect(st.days[D1].eloLoss).toBe(0)
    expect(st.elo).toBe(1000 + st.days[D1].eloGain)
  })

  it('мини-версия = выполнение для серий', () => {
    const data = makeData()
    doMains(data, D1, 'mini')
    confess(data, D1)
    const st = computeState(data, nowAt(D1, 22))
    expect(st.days[D1].perfect).toBe(true)
    expect(questStreak(st, 'phone').current).toBe(1)
  })
})

describe('Слился / Камбэк', () => {
  it('−5 Эло сразу, камбэк в течение 60 минут отменяет минус, +2 WF, +5 очков Воли', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(D1, 15), day: D1, what: 'reels', why: 'boredom', comebackAt: at(D1, 15, 59) })
    data.slips.push({ id: 't', at: at(D1, 18), day: D1, what: 'cola', why: 'auto' })
    const st = computeState(data, nowAt(D1, 19))
    expect(st.elo).toBe(995)
    expect(st.days[D1].eloLoss).toBe(-5)
    expect(st.shards).toBe(2)
    expect(st.xpByStat.will).toBe(5)
  })
  it('камбэк позже 60 минут не засчитывается', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(D1, 15), day: D1, what: 'reels', why: 'boredom', comebackAt: at(D1, 16, 1) })
    expect(computeState(data, nowAt(D1, 19)).elo).toBe(995)
  })
  it('тяга побеждена +10 очков Воли +2 WF, пауза «Закрыть» +5 очков Воли', () => {
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
  it('потраченная заморозка защищает Эло и серии', () => {
    const data = makeData()
    perfectDays(data, D1, 7) // +1 заморозка
    const f = addDays(D1, 7)
    confess(data, f)
    log(data, f).freeze = true
    data.slips.push({ id: 's', at: at(f, 15), day: f, what: 'reels', why: 'auto' })
    const before = computeState(data, nowAt(addDays(D1, 6), 22)).elo
    const st = computeState(data, nowAt(f, 22))
    expect(st.days[f]).toMatchObject({ frozen: true, eloGain: 0, eloLoss: 0 })
    expect(st.freezes).toBe(0)
    expect(st.elo).toBe(before)
    expect(questStreak(st, 'wake').current).toBe(7) // серия прошла сквозь замороженный день
  })
  it('без заморозок в запасе — обычный счёт', () => {
    const data = makeData()
    confess(data, D1)
    log(data, D1).freeze = true
    const st = computeState(data, nowAt(D1, 22))
    expect(st.days[D1].frozen).toBe(false)
  })
})

describe('ретроактивная оценка пропущенных дней', () => {
  it('не открывал приложение 3 дня → каждый день −10 Эло за молчание, падения больше нет', () => {
    const data = makeData()
    const st = computeState(data, nowAt(addDays(D1, 3), 17))
    expect([0, 1, 2].map((i) => st.days[addDays(D1, i)].eloLoss)).toEqual([-10, -10, -10])
    expect(st.elo).toBe(970)
    expect(unacknowledgedMissed(st)).toEqual([D1, addDays(D1, 1), addDays(D1, 2)])
    expect(unacknowledgedMissed(st, addDays(D1, 1))).toEqual([addDays(D1, 2)])
    expect(st.days[addDays(D1, 3)].closed).toBe(false) // сегодняшний день ещё идёт
  })
  it('оценка начинается с дня онбординга, если он позже старта арки', () => {
    const data = makeData()
    data.profile!.onboardDay = addDays(D1, 2)
    const st = computeState(data, nowAt(addDays(D1, 3), 17))
    expect(st.days[D1].closed).toBe(false)
    expect(st.elo).toBe(990)
  })
  it('снапшот плана для закрытых дней', () => {
    const data = makeData()
    confess(data, D1)
    // дни разминки (20–22 ноя) тоже замораживаются
    expect(daysNeedingSnapshot(data, nowAt(addDays(D1, 1), 10))).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', D1])
    expect(daysNeedingSnapshot(data, nowAt(addDays(D1, 1), 17))).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', D1])
  })
  it('до старта арки идёт разминка: день открыт, Эло не двигается', () => {
    const st = computeState(makeData(), new Date(2026, 10, 20, 12))
    expect(st.elo).toBe(1000)
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

describe('очки сфер и WF', () => {
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
})

describe('неделя без босса', () => {
  it('идеальная неделя: только квесты, исповеди и уровни, без награды босса', () => {
    const data = makeData()
    perfectDays(data, D1, 7)
    const st = computeState(data, nowAt(addDays(D1, 6), 22))
    // Эло levels start at 4 (1000): no level-up ❄ in the first week
    expect(st.shards).toBe(7 * (3 + 3 + 1))
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

  it('до 23 ноября квесты, исповедь и тяга дают очки и WF, Эло не меняется', () => {
    const data = makeData()
    mark(data, W1, 'wake')
    mark(data, W1, 'water')
    confess(data, W1)
    data.cravings.push({ id: 'c', at: at(W1, 14), day: W1, result: 'won', swap: 'вода' })
    const st = computeState(data, nowAt(W1, 22))
    expect(st.days[W1]).toMatchObject({ warmup: true, closed: true, confession: true, eloLoss: 0 })
    expect(st.xp).toBe(20 + 10 + 5 + 10)
    expect(st.shards).toBe(3 + 2 + 1 + 2)
    expect(st.elo).toBe(1000)
    expect(st.xpByDay[W1]).toBe(45)
  })

  it('«Слился» в разминке записывается, но Эло не снимает; камбэк даёт очки и WF', () => {
    const data = makeData()
    data.slips.push({ id: 's', at: at(W1, 15), day: W1, what: 'reels', why: 'boredom', comebackAt: at(W1, 15, 30) })
    data.slips.push({ id: 't', at: at(W1, 18), day: W1, what: 'cola', why: 'auto' })
    const st = computeState(data, nowAt(W1, 19))
    expect(st.elo).toBe(1000)
    expect(st.xpByStat.will).toBe(5)
    expect(st.shards).toBe(2)
  })

  it('пропуски и молчание в разминке не стоят Эло и не попадают в «Пропущено N дней»', () => {
    const data = makeData()
    const st = computeState(data, nowAt(ARC_START_DAY, 17))
    for (const d of [W1, '2026-11-21', SUN]) expect(st.days[d]).toMatchObject({ warmup: true, closed: true, retro: false, eloLoss: 0 })
    expect(st.elo).toBe(1000)
    expect(unacknowledgedMissed(st)).toEqual([])
  })

  it('идеальные дни разминки не идут в счёт «Покорителя зимы»', () => {
    const data = makeData()
    perfectDays(data, W1, 3)
    const st = computeState(data, nowAt(ARC_START_DAY, 10))
    expect(st.conqueror).toEqual({ closed: 0, need: 70, won: false })
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
