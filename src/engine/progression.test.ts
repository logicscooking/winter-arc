import { describe, expect, it } from 'vitest'
import { LEVEL_CAP, LEVEL_UP_SHARDS, levelOf, levelTitle, nextTitle, sphereLevelOf, xpForLevel } from './levels'
import { CAPS, computeState, heroTitle, heroTitles } from './replay'
import { BOSS_RULES, BOSS_WIN, FINAL_WIN, taskCap, weaknessOf } from './bosses'
import { GEAR, gearPrice, ownsGear, wornOutfit } from './avatar'
import { usdRateOf } from './money'
import { MAIN_BOSS_PRIZE, MONEY_BOSSES, moneyLadder, moneyMonthEvents, moneyMonths, moneyXpDelta, monthEnd } from './moneyBosses'
import { MONEY_BOSS_HP } from './money'
import { SHOP_CHEST, rollChest, setupDue, CHAPTER_BOSS, PRACTICE_XP } from './skills'
import { STAT_SPHERE, laggingSphere } from './spheres'
import { buildPublicStats, detectFeedEvents, feedText, shareSettings } from './social'
import { dopaminePrice } from './shop'
import { ARC_START, addDays, gameDayOf, weekDays } from './time'
import { at, confess, log, makeData, mark, nowAt, perfectDays } from './testkit'
import type { AppData, Income, Reward, Task } from './types'

const D1 = ARC_START

let n = 0
const uid = () => `t${++n}`

function task(over: Partial<Task>): Task {
  return { id: uid(), parentId: null, title: 'x', stat: 'deal', scope: 'deal', createdAt: 0, postponed: 0, order: 0, ...over }
}

function income(day: string, amount: number, h = 12): Income {
  return { id: uid(), day, at: at(day, h), amount }
}

describe('уровни героя до 30', () => {
  it('кривая: L2–L5 быстро, L30 ≈ 25k, потолок', () => {
    expect(xpForLevel(2)).toBe(126)
    expect(xpForLevel(5)).toBe(816)
    expect(xpForLevel(30)).toBe(24766)
    expect(xpForLevel(30)).toBeGreaterThanOrEqual(24000)
    expect(xpForLevel(30)).toBeLessThanOrEqual(25000)
    // a solid player (~250/day) ends the 98 days at the cap, a mediocre one (~110/day) near 19–20
    expect(levelOf(250 * 98).level).toBeGreaterThanOrEqual(29)
    expect(levelOf(110 * 98).level).toBeGreaterThanOrEqual(18)
    expect(levelOf(110 * 98).level).toBeLessThanOrEqual(20)
    expect(levelOf(250 * 4).level).toBeGreaterThanOrEqual(5)
    const top = levelOf(1_000_000)
    expect(top).toMatchObject({ level: LEVEL_CAP, max: true, progress: 1, toNext: 0 })
    expect(top.over).toBe(1_000_000 - xpForLevel(30))
    expect(xpForLevel(31)).toBe(xpForLevel(30))
  })

  it('титулы каждые 5 уровней', () => {
    expect(levelTitle(1)).toBe('Путник')
    expect(levelTitle(4)).toBe('Путник')
    expect(levelTitle(5)).toBe('Снежинка')
    expect(levelTitle(14)).toBe('Морозный')
    expect(levelTitle(30)).toBe('Легенда арки')
    expect(nextTitle(7)).toEqual({ level: 10, title: 'Морозный' })
    expect(nextTitle(30)).toBeNull()
    // a special item every 5 levels
    for (const l of [5, 10, 15, 20, 25, 30]) expect(GEAR.filter((g) => g.level === l).length, `item at ${l}`).toBeGreaterThanOrEqual(1)
  })

  it('новый уровень даёт ❄ один раз, пересчёт ничего не удваивает', () => {
    const data = makeData()
    perfectDays(data, D1, 7)
    const st = computeState(data, nowAt(addDays(D1, 6), 22))
    const levels = st.levelUps.map((l) => l.level)
    expect(levels).toEqual(Array.from({ length: levelOf(st.xp).level - 1 }, (_, i) => i + 2))
    expect(st.levelUps.every((l) => l.shards === LEVEL_UP_SHARDS(l.level))).toBe(true)
    const again = computeState(structuredClone(data), nowAt(addDays(D1, 6), 23))
    expect(again.shards).toBe(st.shards)
    expect(again.levelUps).toEqual(st.levelUps)
  })
})

describe('сферы', () => {
  it('квест считается по сфере «Сегодня», остальное — по стату', () => {
    const data = makeData()
    mark(data, D1, 'meditation') // stat mind, area «Разное»
    mark(data, D1, 'reading') // mind → «Развитие»
    mark(data, D1, 'water') // body → «Здоровье»
    const project = task({ title: 'Проект' })
    data.tasks = [project, task({ parentId: project.id, doneAt: at(D1, 14), doneDay: D1 })]
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpBySphere.misc).toBe(st.days[D1].crits.includes('meditation') ? 15 : 10)
    expect(st.xpBySphere.growth).toBeGreaterThanOrEqual(10)
    expect(st.xpBySphere.health).toBeGreaterThanOrEqual(10)
    expect(st.xpBySphere.money).toBe(30)
    expect(STAT_SPHERE).toEqual({ energy: 'health', body: 'health', deal: 'money', mind: 'growth', will: 'misc' })
  })

  it('уровни сфер, отстающая сфера', () => {
    expect(sphereLevelOf(1000).level).toBe(5)
    expect(sphereLevelOf(4500).level).toBe(10)
    expect(sphereLevelOf(10500).level).toBe(15)
    expect(laggingSphere({ health: 3000, money: 400, growth: 2000, misc: 1800 })).toBe('money')
    expect(laggingSphere({ health: 100, money: 0, growth: 0, misc: 0 })).toBeNull()
    expect(laggingSphere({ health: 1000, money: 800, growth: 900, misc: 700 })).toBeNull()
  })

  it('перк «Здоровье 10»: +1 слот заморозки, ❄ за уровни сфер один раз', () => {
    const data = makeData()
    // 4 500 XP of «Здоровье» on the first day: long goals of a body skill
    data.skills = [{ id: 's1', title: 'Бег', stat: 'body', value: 'v', status: 'active', createdAt: 0, order: 0 }]
    data.goals = Array.from({ length: 23 }, (_, i) => ({ id: `g${i}`, skillId: 's1', type: 'long' as const, title: 'g', createdAt: i, order: i, doneAt: at(D1, 9, i), doneDay: D1 }))
    const st = computeState(data, nowAt(D1, 20))
    expect(sphereLevelOf(st.xpBySphere.health).level).toBeGreaterThanOrEqual(10)
    expect(st.freezeMax).toBe(3)
    expect(st.perks).toContain('health:5')
    expect(st.perks).toContain('health:10')
    expect(st.perks.filter((p) => p === 'health:5')).toHaveLength(1)
  })
})

describe('боссы', () => {
  it('слабость бьёт ×2: Зомби — подъём и отбой', () => {
    const W2 = weekDays(2)[0]
    const data = makeData()
    mark(data, W2, 'wake') // main 20 → 40
    confess(data, W2, { bedtime: '23:00' }) // bedtime side 10 → 20
    const st = computeState(data, nowAt(W2, 22))
    const wake = st.days[W2].crits.includes('wake')
    void wake
    expect(st.days[W2].bossDamage).toBe(20 * BOSS_RULES.weakMult + 10 * BOSS_RULES.weakMult)
    expect(weaknessOf(2).label).toContain('подъём')
  })

  it('исповедь «сахара не было» бьёт Сахарного голема', () => {
    const W7 = weekDays(7)[0]
    const data = makeData()
    confess(data, W7, { sugar: 'none' })
    const st = computeState(data, nowAt(W7, 22))
    expect(st.days[W7].bossDamage).toBe(BOSS_RULES.answerHit)
    confess(data, W7, { sugar: 'outside' })
    expect(computeState(data, nowAt(W7, 22)).days[W7].bossDamage).toBe(0)
  })

  it('задачи бьют не больше трети HP за неделю', () => {
    const data = makeData()
    const project = task({ title: 'Проект' })
    data.tasks = [project, ...Array.from({ length: 10 }, (_, i) => task({ parentId: project.id, doneAt: at(D1, 9 + i), doneDay: D1 }))]
    const st = computeState(data, nowAt(D1, 22))
    expect(st.bosses[1].taskDamage).toBe(taskCap(280))
    expect(st.bosses[1].damage).toBe(93)
    // XP is not capped for project tasks
    expect(st.xpByStat.deal).toBe(300)
  })

  it('победа: +100 XP, +15 ❄, трофей и вещь босса', () => {
    const data = makeData()
    perfectDays(data, D1, 7)
    const st = computeState(data, nowAt(addDays(D1, 6), 22))
    const before = computeState(data, nowAt(addDays(D1, 5), 22))
    expect(st.bosses[1].won).toBe(true)
    // Sunday: its quests (~45) + the win
    expect(st.days[addDays(D1, 6)].xp).toBeGreaterThanOrEqual(BOSS_WIN.xp + 40)
    expect(st.xpByDay[addDays(D1, 6)]).toBe(st.days[addDays(D1, 6)].xp)
    const item = GEAR.find((g) => g.boss === 1)!
    expect(ownsGear(item, 1, [], st)).toBe(true)
    expect(ownsGear(item, 30, [], before)).toBe(false)
    expect(wornOutfit({ extra: item.id }, 1, [], st).extra).toBe(item.id)
  })

  it('сбежавший босс уходит к финальному: +50% его остатка', () => {
    const data = makeData()
    perfectDays(data, D1, 3) // 120 of 280
    const st = computeState(data, nowAt(addDays(D1, 8), 12))
    expect(st.bosses[1]).toMatchObject({ done: true, won: false, carry: 80 })
    expect(st.finalBoss.bonus).toBe(80)
    expect(st.finalBoss.hp).toBe(st.finalBoss.base + 80)
  })

  it('финальный босс: легендарная вещь, титул, +300 XP, +50 ❄', () => {
    const data = makeData()
    perfectDays(data, D1, 98)
    const last = addDays(D1, 97)
    const st = computeState(data, nowAt(last, 22))
    expect(Object.values(st.bosses).filter((b) => b.won)).toHaveLength(14)
    expect(st.bosses[14]).toMatchObject({ won: true, bonus: 0 })
    expect(st.trophies).toContain(14)
    expect(st.days[last].xp).toBeGreaterThanOrEqual(FINAL_WIN.xp + 100)
    expect(ownsGear(GEAR.find((g) => g.boss === 14)!, 1, [], st)).toBe(true)
    expect(GEAR.find((g) => g.boss === 14)!.legendary).toBe(true)
    expect(heroTitle(st)).toBe(FINAL_WIN.title)
  })

  it('CHAPTER_BOSS совпадает с боссом первой недели главы', () => {
    expect(CHAPTER_BOSS).toEqual({ 0: 'Хаос', 1: 'Зомби', 2: 'Сахарный голем', 3: 'Туман' })
    expect(setupDue('2027-01-29')?.boss).toBe('Туман')
  })
})

describe('Боссы месяца', () => {
  const kills = (st: { moneyKills: { month: string; id: string }[] }) => st.moneyKills.map((k) => `${k.month}:${k.id}`)

  it('пять боссов, имена как у автора, HP и награды', () => {
    expect(MONEY_BOSSES.map((b) => [b.name, b.usd, b.xp, b.shards])).toEqual([
      ['Босс отсос', 500, 100, 10],
      ['Босс говна насос', 1000, 200, 20],
      ['Босс посёлка городского типа', 2500, 400, 40],
      ['Босс езжу только на бизнес такси', 5000, 700, 60],
      ['Босс смерть в нищете пока шлюха', 10000, 1500, 150],
    ])
    expect(MONEY_BOSSES.filter((b) => b.main).map((b) => b.id)).toEqual(['mb5'])
    expect(MONEY_BOSSES.map((b) => b.usd)).toEqual([...MONEY_BOSS_HP])
  })

  it('окно месяца — игровой день: до 04:00 первого числа ещё прошлый месяц', () => {
    const data = makeData()
    data.incomes = [income('2026-11-30', 40_000)]
    const night = gameDayOf(new Date(2026, 11, 1, 2, 30))
    expect(night).toBe('2026-11-30')
    const l1 = moneyLadder(data, night)
    expect(l1.month).toBe('2026-11')
    expect(l1.usd).toBe(500)
    expect(l1.main.daysLeft).toBe(1)
    // after 04:00 it is December: the ladder starts from zero, 31 days to go
    const l2 = moneyLadder(data, gameDayOf(new Date(2026, 11, 1, 4, 0)))
    expect(l2.month).toBe('2026-12')
    expect(l2.usd).toBe(0)
    expect(l2.killed).toBe(0)
    expect(l2.main.daysLeft).toBe(31)
    expect(l2.main.perDay).toBeCloseTo(10000 / 31)
    expect(monthEnd('2027-02-10')).toBe('2027-02-28')
  })

  it('урон в $ по курсу; лестница: убитые, текущая цель, следующие', () => {
    const data = makeData()
    data.incomes = [income('2026-12-02', 50_000), income('2026-12-05', 46_000)]
    const l = moneyLadder(data, '2026-12-10')
    // 96 000 ₽ / 80 = $1 200: two dead, «посёлок» is the target
    expect(l.usd).toBe(1200)
    expect(l.steps.map((x) => x.state)).toEqual(['dead', 'dead', 'cur', 'next', 'next'])
    expect(l.target?.id).toBe('mb3')
    expect(l.progress).toBeCloseTo(1200 / 2500)
    expect(l.main).toEqual({ dead: false, left: 8800, daysLeft: 22, perDay: 400 })
    data.settings.usdRate = 30
    expect(usdRateOf(data)).toBe(30)
    expect(moneyLadder(data, '2026-12-10').killed).toBe(3)
    data.settings.usdRate = -3
    expect(usdRateOf(data)).toBe(80)
    // the future does not count yet
    expect(moneyLadder(data, '2026-12-03').usd).toBe(625)
  })

  it('награда за каждого босса — раз в месяц, и снова в следующем', () => {
    const data = makeData()
    data.incomes = [income('2026-12-05', 50_000), income('2026-12-10', 40_000), income('2026-12-20', 10_000), income('2027-01-03', 100_000)]
    const ev = moneyMonthEvents(data).kills
    expect(ev.map((e) => [e.month, e.id, e.day])).toEqual([
      ['2026-12', 'mb1', '2026-12-05'],
      ['2026-12', 'mb2', '2026-12-10'],
      ['2027-01', 'mb1', '2027-01-03'],
      ['2027-01', 'mb2', '2027-01-03'],
    ])
    const st = computeState(data, nowAt('2027-01-04', 12))
    expect(kills(st)).toEqual(['2026-12:mb1', '2026-12:mb2', '2027-01:mb1', '2027-01:mb2'])
    // Dec: $1 250 → 125 XP + 100 + 200; Jan: $1 250 → 125 + 100 + 200
    expect(st.xpBySphere.money).toBe(125 + 300 + 125 + 300)
    expect(st.xpByDay['2026-12-05']).toBe(62 + 100)
    // two months never add up
    const split = makeData()
    split.incomes = [income('2026-12-30', 70_000), income('2027-01-02', 70_000)]
    expect(moneyMonthEvents(split).kills.map((e) => e.id)).toEqual(['mb1', 'mb1'])
  })

  it('главный босс: первая победа — костюм и титул; дальше просто награда', () => {
    const data = makeData()
    data.incomes = [income('2026-12-03', 400_000), income('2026-12-12', 400_000)]
    const st = computeState(data, nowAt('2026-12-12', 20))
    expect(kills(st)).toEqual(['2026-12:mb1', '2026-12:mb2', '2026-12:mb3', '2026-12:mb4', '2026-12:mb5'])
    expect(ownsGear(GEAR.find((g) => g.moneyBoss === 'mb5')!, 1, [], st)).toBe(true)
    expect(heroTitles(st)).toContain(MAIN_BOSS_PRIZE.title)
    expect(st.xpBySphere.money).toBe(1000 + 100 + 200 + 400 + 700 + 1500)
    expect(moneyLadder(data, '2026-12-12').target).toBeNull()
    // not yet: no suit, no title
    const poor = makeData()
    poor.incomes = [income('2026-12-03', 400_000)]
    const sp = computeState(poor, nowAt('2026-12-12', 20))
    expect(ownsGear(GEAR.find((g) => g.moneyBoss === 'mb5')!, 1, [], sp)).toBe(false)
    expect(heroTitles(sp)).not.toContain(MAIN_BOSS_PRIZE.title)
    // again next month: the reward once more, still one title
    data.incomes.push(income('2027-01-10', 800_000))
    const st2 = computeState(data, nowAt('2027-01-10', 20))
    expect(st2.moneyKills.filter((k) => k.id === 'mb5').map((k) => k.month)).toEqual(['2026-12', '2027-01'])
    expect(heroTitles(st2).filter((t) => t === MAIN_BOSS_PRIZE.title)).toHaveLength(1)
  })

  it('1 XP за $10 месяца; удалённая запись забирает XP и победу', () => {
    const data = makeData()
    data.incomes = [income('2026-12-02', 799), income('2026-12-03', 1)] // $9.99 + $0.01 = $10 → 1 XP on the second
    expect(moneyMonthEvents(data).xp).toEqual([{ day: '2026-12-03', at: at('2026-12-03', 12), xp: 1 }])
    expect(moneyXpDelta(data, '2026-12-04', 8000)).toBe(10)
    data.incomes.push(income('2026-12-05', 40_000))
    const st = computeState(data, nowAt('2026-12-06', 12))
    expect(kills(st)).toEqual(['2026-12:mb1'])
    expect(st.xpBySphere.money).toBe(51 + 100)
    data.incomes = data.incomes.slice(0, 2)
    const back = computeState(data, nowAt('2026-12-06', 12))
    expect(back.moneyKills).toEqual([])
    expect(back.xpBySphere.money).toBe(1)
    expect(back.shards).toBeLessThan(st.shards)
  })

  it('история месяцев: сколько убито из 5, главный ✓/✗', () => {
    const data = makeData()
    data.incomes = [income('2026-11-25', 60_000), income('2026-12-03', 820_000), income('2027-01-05', 100_000)]
    const months = moneyMonths(data, '2026-11-20', '2027-01-10')
    expect(months.map((m) => [m.month, m.killed, m.main, m.live])).toEqual([
      ['2027-01', 2, false, true],
      ['2026-12', 5, true, false],
      ['2026-11', 1, false, false],
    ])
  })

  it('пати видит убийства только при включённом шаринге денег', () => {
    const data = makeData()
    data.incomes = [income(D1, 900_000)]
    const st = computeState(data, nowAt(D1, 20))
    const ctx = { since: 0, levelAtSince: 99, share: shareSettings(data) }
    const mine = () => detectFeedEvents(data, st, ctx).filter((e) => e.key.startsWith('mboss'))
    expect(mine()).toEqual([])
    // the title tells the income: hidden from the party without the opt-in
    expect(heroTitles(st)[0]).toBe(MAIN_BOSS_PRIZE.title)
    expect(buildPublicStats(data, st, nowAt(D1, 20)).title).not.toBe(MAIN_BOSS_PRIZE.title)
    expect(JSON.stringify(buildPublicStats(data, st, nowAt(D1, 20)))).not.toMatch(/mb\d|bosses|900/)
    data.settings.moneyShare = true
    const ev = mine()
    expect(ev).toHaveLength(5)
    expect(ev.every((e) => e.kind === 'level' && e.key.length <= 64)).toBe(true)
    expect(feedText(ev[4].kind, ev[4].payload)).toContain('Босс смерть в нищете пока шлюха')
    expect(feedText(ev[0].kind, ev[0].payload)).toContain('$500')
    expect(buildPublicStats(data, st, nowAt(D1, 20)).title).toBe(heroTitle(st))
    expect(buildPublicStats(data, st, nowAt(D1, 20)).money?.bosses).toEqual({ month: '2026-11', killed: 5 })
  })
})

describe('❄-стоки', () => {
  const rewards: Reward[] = [
    { id: 'c1', title: 'Кофе', price: 20, rarity: 'common' },
    { id: 'c2', title: 'Кино', price: 40, rarity: 'common' },
    { id: 'r1', title: 'Кроссовки', price: 200, rarity: 'rare' },
    { id: 'l1', title: 'Поездка', price: 900, rarity: 'legendary' },
  ]
  it('сундук за ❄: тот же id покупки — тот же приз, ежедневный сундук не изменился', () => {
    const a = rollChest(D1, 'shop', 0, rewards, 'p-1')
    expect(rollChest(D1, 'shop', 0, rewards, 'p-1')).toEqual(a)
    expect(rollChest('2027-01-01', 'shop', 0, rewards, 'p-1')).toEqual(a)
    const many = new Set(Array.from({ length: 40 }, (_, i) => rollChest(D1, 'shop', 0, rewards, `p${i}`).reward?.id))
    expect(many.size).toBeGreaterThan(1)
    // pity still works for bought chests
    expect(rollChest(D1, 'shop', 40, rewards, 'p-1').rarity).not.toBe('common')
    expect(rollChest(D1, 'repeat', 0, rewards)).toEqual(rollChest(D1, 'repeat', 0, rewards, undefined))
    expect(SHOP_CHEST.price).toBe(60)
  })

  it('цены: обычные вещи растут с главой, легендарные — нет, бесплатные бесплатны', () => {
    const kolpak = GEAR.find((g) => g.id === 'kolpak')!
    const crown = GEAR.find((g) => g.id === 'queencrown')!
    expect([0, 1, 2, 3].map((c) => gearPrice(kolpak, c as 0 | 1 | 2 | 3))).toEqual([40, 40, 60, 80])
    expect([0, 1, 2, 3].map((c) => gearPrice(crown, c as 0 | 1 | 2 | 3))).toEqual([500, 500, 500, 500])
    const legend = GEAR.filter((g) => g.legendary && g.price)
    expect(legend.length).toBeGreaterThanOrEqual(4)
    expect(legend.every((g) => g.price! >= 150 && g.price! <= 500)).toBe(true)
    // the free outfits stay level 1
    expect(GEAR.filter((g) => g.level === 1).length).toBe(26)
    expect(dopaminePrice(15, 3, true)).toBe(27)
    expect(dopaminePrice(15, 3, false)).toBe(30)
  })
})

describe('анти-фарм', () => {
  it('тяга и пауза: не больше 3 в день', () => {
    const data = makeData()
    data.cravings = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, day: D1, at: at(D1, 10 + i), result: 'won' as const, swap: 'вода' }))
    data.pauses = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, day: D1, at: at(D1, 10 + i, 30), app: 'instagram', result: 'resisted' as const }))
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.will).toBe(CAPS.craving * 10 + CAPS.pause * 5)
    // the next day pays again
    const D2 = addDays(D1, 1)
    data.cravings.push({ id: 'c9', day: D2, at: at(D2, 10), result: 'won', swap: 'вода' })
    expect(computeState(data, nowAt(D2, 20)).xpByStat.will).toBe(CAPS.craving * 10 + CAPS.pause * 5 + 10)
  })

  it('свои задачи и подзадачи дня: не больше 30 XP в день', () => {
    const data = makeData()
    data.tasks = Array.from({ length: 15 }, (_, i) => task({ scope: 'daily', stat: 'will', day: D1, doneAt: at(D1, 9, i), doneDay: D1 }))
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.will).toBe(CAPS.dailyTaskXp)
  })

  it('поток × тема сезона — не больше ×2', () => {
    const data: AppData = makeData()
    data.skills = [{ id: 's1', title: 'Продажи', stat: 'deal', value: 'v', status: 'active', createdAt: 0, order: 0 }]
    data.themes = [{ id: 'ch0', chapter: 0, skillId: 's1' }]
    data.flows = [{ id: 'f1', day: D1, startedAt: at(D1, 10), endedAt: at(D1, 11) }]
    data.practices = [{ id: 'pr1', skillId: 's1', nodeId: 'n1', day: D1, at: at(D1, 10, 20), note: 'есть отзыв' }]
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.deal).toBe(PRACTICE_XP.full * 2)
  })

  it('камбэк не тронут', () => {
    const data = makeData()
    log(data, D1)
    data.slips = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, day: D1, at: at(D1, 10 + i), what: 'reels' as const, why: 'auto' as const, comebackAt: at(D1, 10 + i, 20) }))
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.will).toBe(4 * 5)
  })
})
