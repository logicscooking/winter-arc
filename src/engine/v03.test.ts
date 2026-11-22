import { describe, expect, it } from 'vitest'
import { CRIT, SHARDS, hash32, isCrit, questReward } from './quests'
import { computeState, planFor } from './replay'
import { normalizeData } from './data'
import { blockAt, blocksOverlap, nextFreeStart, sanitizeBlock, sleepWindow, sortBlocks } from './plan'
import { DEFAULT_OUTFIT, GEAR, gearPurchaseId, ownsGear, wornOutfit } from './avatar'
import { addDays } from './time'
import { at, confess, log, makeData, mark, nowAt } from './testkit'

const D1 = '2026-11-23'

describe('CRITICAL ×1.5', () => {
  it('детерминирован: тот же день и квест — тот же результат', () => {
    expect(isCrit(D1, 'wake')).toBe(isCrit(D1, 'wake'))
    expect(hash32('abc')).toBe(hash32('abc'))
  })

  it('частота около 15%', () => {
    let n = 0
    const total = 4000
    for (let i = 0; i < total; i++) if (isCrit(addDays(D1, i % 400), `q${Math.floor(i / 400)}`)) n++
    expect(n / total).toBeGreaterThan(0.12)
    expect(n / total).toBeLessThan(0.18)
  })

  it('крит даёт ×1.5 XP только за полное выполнение; мини и пропуск без крита', () => {
    // find a day where 'phone' crits
    let day = D1
    for (let i = 0; i < 200 && !isCrit(day, 'phone'); i++) day = addDays(D1, i)
    expect(isCrit(day, 'phone')).toBe(true)
    expect(questReward(day, { id: 'phone', role: 'main', base: false }, 'done')).toEqual({ xp: 30, baseXp: 20, crit: true, shards: 3 })
    expect(questReward(day, { id: 'phone', role: 'main', base: false }, 'mini')).toMatchObject({ xp: 5, crit: false })
    expect(questReward(day, { id: 'phone', role: 'main', base: false }, 'skip')).toMatchObject({ xp: 0, crit: false })
    expect(CRIT.mult).toBe(1.5)
  })

  it('replay: крит попадает в XP и в список crits', () => {
    const data = makeData()
    let day = D1
    for (let i = 0; i < 90 && !isCrit(day, 'phone'); i++) day = addDays(D1, i)
    data.profile!.onboardDay = day
    mark(data, day, 'phone')
    const st = computeState(data, nowAt(day, 13))
    const phone = planFor(data, day).find((p) => p.id === 'phone')!
    const full = phone.role === 'main' ? 20 : 10
    expect(st.days[day].crits).toContain('phone')
    expect(st.xpByStat.will).toBe(Math.round((phone.base ? full / 2 : full) * 1.5))
    // stable across replays
    expect(computeState(data, nowAt(day, 14)).xpByStat.will).toBe(st.xpByStat.will)
  })
})

describe('Судьба дня', () => {
  it('квест закрыт до конца таймера → +3 ❄', () => {
    const data = makeData()
    log(data, D1).destiny = { ref: 'quest', id: 'water', startedAt: at(D1, 10), minutes: 25 }
    mark(data, D1, 'water', 'done', 10) // at 10:00 → inside
    log(data, D1).quests.water.at = at(D1, 10, 20)
    const base = computeState(makeDataWith(D1, 'water', at(D1, 10, 20)), nowAt(D1, 12)).shards
    const st = computeState(data, nowAt(D1, 12))
    expect(st.days[D1].destinyWon).toBe(true)
    expect(st.shards).toBe(base + SHARDS.destiny)
  })

  it('опоздал или отметил до старта — бонуса нет', () => {
    const late = makeData()
    log(late, D1).destiny = { ref: 'quest', id: 'water', startedAt: at(D1, 10), minutes: 25 }
    mark(late, D1, 'water')
    late.days[D1].quests.water.at = at(D1, 10, 26)
    expect(computeState(late, nowAt(D1, 12)).days[D1].destinyWon).toBe(false)
    const early = makeData()
    log(early, D1).destiny = { ref: 'quest', id: 'water', startedAt: at(D1, 10), minutes: 25 }
    mark(early, D1, 'water', 'done', 9)
    expect(computeState(early, nowAt(D1, 12)).days[D1].destinyWon).toBe(false)
  })

  it('задача дня тоже может быть судьбой', () => {
    const data = makeData()
    data.tasks.push({ id: 't', parentId: null, title: 'Позвонить', stat: 'deal', scope: 'daily', day: D1, createdAt: at(D1, 9), postponed: 0, order: 0, doneAt: at(D1, 10, 10), doneDay: D1 })
    log(data, D1).destiny = { ref: 'task', id: 't', startedAt: at(D1, 10), minutes: 15 }
    expect(computeState(data, nowAt(D1, 12)).days[D1].destinyWon).toBe(true)
  })

  it('HP и закрытие дня не меняются из-за судьбы', () => {
    const a = makeData()
    const b = makeData()
    for (const d of [a, b]) {
      mark(d, D1, 'wake')
      mark(d, D1, 'phone')
      confess(d, D1)
    }
    log(b, D1).destiny = { ref: 'quest', id: 'phone', startedAt: at(D1, 11), minutes: 25 }
    expect(computeState(b, nowAt(D1, 22)).hp).toBe(computeState(a, nowAt(D1, 22)).hp)
  })
})

function makeDataWith(day: string, id: string, t: number) {
  const d = makeData()
  mark(d, day, id)
  d.days[day].quests[id].at = t
  return d
}

describe('План дня', () => {
  it('пересечения учитывают переход через полночь', () => {
    expect(blocksOverlap({ start: 60, dur: 30 }, { start: 80, dur: 30 })).toBe(true)
    expect(blocksOverlap({ start: 60, dur: 30 }, { start: 90, dur: 30 })).toBe(false)
    expect(blocksOverlap({ start: 23 * 60 + 30, dur: 60 }, { start: 10, dur: 10 })).toBe(true)
  })

  it('следующий свободный слот и блок в моменте', () => {
    const blocks = [{ id: 'a', start: 600, dur: 60, title: 'A' }]
    expect(nextFreeStart(blocks, 610, 30)).toBe(660)
    expect(nextFreeStart(blocks, 540, 30)).toBe(540)
    expect(blockAt(blocks, 630)?.id).toBe('a')
    expect(blockAt(blocks, 660)).toBeUndefined()
    expect(sortBlocks([{ id: 'b', start: 900, dur: 5, title: '' }, ...blocks]).map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('мусорные блоки чистятся, нормальные сохраняются', () => {
    expect(sanitizeBlock({ id: 'x', title: 'Т', start: 1500, dur: 2000 })).toEqual({ id: 'x', title: 'Т', start: 60, dur: 720 })
    expect(sanitizeBlock({ title: 'нет id' })).toBeNull()
  })

  it('сон: от отбоя 23:30 до цели подъёма', () => {
    const data = makeData()
    data.profile!.usualWake = '07:00'
    const w = sleepWindow(data, '2026-12-10')
    expect(w).toEqual({ sleep: 23 * 60 + 30, wake: 7 * 60, dur: 450 })
  })

  it('normalizeData сохраняет блоки и судьбу, ничего не теряет', () => {
    const data = makeData()
    log(data, D1).blocks = [{ id: 'a', start: 600, dur: 60, title: 'Тренировка', stat: 'body', ref: { kind: 'quest', id: 'workout' } }]
    log(data, D1).destiny = { ref: 'quest', id: 'water', startedAt: 1, minutes: 25 }
    mark(data, D1, 'wake')
    const back = normalizeData(JSON.parse(JSON.stringify(data)))
    // v0.9: the legacy block lives on as a day block with its quest inside
    expect(back.days[D1].blocks).toBeUndefined()
    expect(back.days[D1].dayBlocks).toEqual({ a: { id: 'a', start: 600, dur: 60, title: 'Тренировка', color: 'body' } })
    expect(back.days[D1].assign).toEqual({ 'quest:workout': 'a' })
    expect(back.days[D1].destiny).toEqual(data.days[D1].destiny)
    expect(back.days[D1].quests.wake.status).toBe('done')
    const broken = normalizeData({ ...JSON.parse(JSON.stringify(data)), days: { [D1]: { quests: {}, blocks: 'x', destiny: { ref: 'nope' } } } })
    expect(broken.days[D1]).toEqual({ quests: {}, planV: 2 })
  })
})

describe('Аватар', () => {
  it('уровневые вещи открываются уровнем, магазинные — покупкой', () => {
    const ushanka = GEAR.find((g) => g.id === 'ushanka')!
    const kolpak = GEAR.find((g) => g.id === 'kolpak')!
    expect(ownsGear(ushanka, 11, [])).toBe(false)
    expect(ownsGear(ushanka, 12, [])).toBe(true)
    expect(ownsGear(kolpak, 50, [])).toBe(false)
    expect(ownsGear(kolpak, 1, [{ kind: 'avatar', itemId: gearPurchaseId('kolpak') }])).toBe(true)
  })

  it('надето только то, что открыто; пустая строка = снято', () => {
    const w = wornOutfit({ hat: 'ushanka', glasses: 'goggles', scarf: '' }, 12, [])
    expect(w.hat).toBe('ushanka')
    expect(w.glasses).toBeUndefined()
    expect(w.scarf).toBeUndefined()
    expect(wornOutfit(undefined, 1, []).hat).toBe(DEFAULT_OUTFIT.hat)
  })
})
