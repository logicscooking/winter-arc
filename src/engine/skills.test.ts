import { describe, expect, it } from 'vitest'
import {
  chestsFor,
  BAR_LADDERS,
  FLOW,
  GOAL_XP,
  PRACTICE_XP,
  barMult,
  barSuggestion,
  canRaise,
  canStartFlow,
  chestOdds,
  checkValue,
  expectedTime,
  flowWindows,
  goalBalance,
  goalIssues,
  isMetric,
  needsPivot,
  needsSplit,
  nodeProgress,
  pityCount,
  practiceImpact,
  rankOf,
  rollChest,
  shortRuns,
  skillLevelOf,
  skillStrikes,
  skillView,
  setupDue,
} from './skills'
import { TEMPLATES } from './templates'
import { decodeTree, encodeTree, materializeTree, templateTree, treeFromSkill } from './share'
import { computeState } from './replay'
import { buildPublicStats } from './social'
import { mergeDocs, stampChanges, toAtoms } from './sync'
import type { SyncDoc, SyncMeta } from './sync'
import { addDays } from './time'
import { at, log, makeData, nowAt } from './testkit'
import type { AppData, ChestOpen, Goal, Practice, Reward } from './types'

const D1 = '2026-11-23' // Monday, arc start
const D2 = '2026-11-24'

let n = 0
const uid = () => `id${++n}`

/** data with the «Продажи» template imported as an active skill */
function withSkill(over: Partial<AppData> = {}) {
  const data = makeData(over)
  const m = materializeTree(templateTree(TEMPLATES.find((t) => t.id === 'sales')!), {
    uid,
    now: at(D1, 8),
    today: D1,
    value: TEMPLATES[3].joy[0],
    valueKind: 'joy',
    status: 'active',
    order: 0,
  })
  data.skills = [m.skill]
  data.traits = m.traits
  data.nodes = m.nodes
  data.goals = m.goals
  data.practices = []
  return { data, skill: m.skill, node: m.nodes[0], node2: m.nodes[1], goals: m.goals }
}

const pr = (skillId: string, nodeId: string, day: string, h: number, note?: string, trend?: Practice['trend'], m = 0): Practice => ({
  id: `p-${nodeId}-${day}-${h}-${m}-${note ?? ''}`,
  skillId,
  nodeId,
  day,
  at: at(day, h, m),
  ...(note ? { note } : {}),
  ...(trend ? { trend } : {}),
})

describe('узел: ступени и правило обратной связи', () => {
  it('ступени по числу практик: 1 → знакомство, 3 → практика, 7 → уверенно, 15 → мастер', () => {
    const mk = (k: number) => Array.from({ length: k }, (_, i) => pr('s', 'n', addDays(D1, i), 10, 'получилось лучше'))
    expect(nodeProgress(mk(0)).stage).toBe(0)
    expect(nodeProgress(mk(1)).stage).toBe(1)
    expect(nodeProgress(mk(2)).stage).toBe(1)
    expect(nodeProgress(mk(3)).stage).toBe(2)
    expect(nodeProgress(mk(7)).stage).toBe(3)
    expect(nodeProgress(mk(15)).stage).toBe(4)
    expect(nodeProgress(mk(3)).toNext).toBe(4)
  })

  it('ступень растёт только если хотя бы у половины практик есть обратная связь', () => {
    const list = [pr('s', 'n', D1, 9), pr('s', 'n', D1, 10), pr('s', 'n', D1, 11)]
    const p = nodeProgress(list)
    expect(p.stage).toBe(0)
    expect(p.needsFeedback).toBe(true)
    // feedback on 2 of 4 → catches up to «практика»
    const more = [...list, pr('s', 'n', D2, 9, 'холодный заход с вопросом сработал')]
    expect(nodeProgress(more).stage).toBe(0) // 1 of 4
    more[0] = { ...more[0], note: 'сломалось на втором сообщении' }
    expect(nodeProgress(more).stage).toBe(2) // 2 of 4 → stage for 4 practices
  })

  it('3 раза подряд «так же» / «хуже» → карточка «ищи другой путь», пока нет нового «что попробую иначе»', () => {
    const list = [pr('s', 'n', D1, 9, 'ok', 'better'), pr('s', 'n', D1, 10, 'ok', 'same'), pr('s', 'n', D1, 11, 'ok', 'worse'), pr('s', 'n', D1, 12, 'ok', 'same')]
    const prog = nodeProgress(list)
    expect(prog.flatRun).toBe(3)
    const node = { id: 'n', skillId: 's', traitId: 't', title: 'x', order: 0, createdAt: 0 }
    expect(needsPivot(node, prog)).toBe(true)
    expect(needsPivot({ ...node, pivot: 'начну с вопроса', pivotAt: at(D1, 13) }, prog)).toBe(false)
  })
})

describe('практики в replay', () => {
  it('XP в стат-покровитель; без обратной связи — половина', () => {
    const { data, skill, node } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'зашло лучше'), pr(skill.id, node.id, D1, 11)]
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.deal).toBe(PRACTICE_XP.full + PRACTICE_XP.half)
    expect(st.skillXp[skill.id]).toBe(PRACTICE_XP.full + PRACTICE_XP.half)
  })

  it('лимит: 3 практики на узел в день, четвёртая не даёт XP', () => {
    const { data, skill, node, node2 } = withSkill()
    data.practices = [9, 10, 11, 12].map((h) => pr(skill.id, node.id, D1, h, 'есть отзыв'))
    data.practices.push(pr(skill.id, node2.id, D1, 13, 'другой узел'))
    data.practices.push(pr(skill.id, node.id, D2, 9, 'новый день'))
    const st = computeState(data, nowAt(D2, 20))
    expect(st.xpByStat.deal).toBe(PRACTICE_XP.full * 5)
  })

  it('×1,5 за практики навыка — темы сезона', () => {
    const { data, skill, node } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'с отзывом')]
    data.themes = [{ id: 'ch0', chapter: 0, skillId: skill.id }]
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.deal).toBe(Math.round(PRACTICE_XP.full * 1.5))
    // a theme of another chapter does nothing
    data.themes = [{ id: 'ch1', chapter: 1, skillId: skill.id }]
    expect(computeState(data, nowAt(D1, 20)).xpByStat.deal).toBe(PRACTICE_XP.full)
  })

  it('детерминизм: порядок в логе не меняет результат', () => {
    const { data, skill, node, node2, goals } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'a'), pr(skill.id, node.id, D1, 11), pr(skill.id, node2.id, D2, 9, 'b'), pr(skill.id, node.id, D1, 12, 'c'), pr(skill.id, node.id, D1, 13, 'd')]
    const short = goals.find((g) => g.type === 'short')!
    short.checks = [{ day: D1, at: at(D1, 9) }, { day: D2, at: at(D2, 9) }]
    data.flows = [{ id: 'f1', day: D1, startedAt: at(D1, 10, 30), endedAt: at(D1, 11, 30) }]
    const a = computeState(data, nowAt(D2, 20))
    const shuffled = structuredClone(data)
    shuffled.practices!.reverse()
    shuffled.goals!.reverse()
    const b = computeState(shuffled, nowAt(D2, 20))
    expect(b.xp).toBe(a.xp)
    expect(b.xpByStat).toEqual(a.xpByStat)
    expect(b.flowStats).toEqual(a.flowStats)
    expect(computeState(data, nowAt(D2, 21)).xp).toBe(a.xp)
  })

  it('«Сегодня качаю»: практика на узле дня закрывает квест «Дело дня»', () => {
    const { data, skill, node } = withSkill()
    log(data, D1).dealNodeId = node.id
    const before = computeState(data, nowAt(D1, 20)).days[D1].marks.deal
    data.practices = [pr(skill.id, node.id, D1, 10, 'отзыв')]
    const after = computeState(data, nowAt(D1, 20)).days[D1].marks.deal
    expect(before).toBeUndefined()
    expect(after).toBe('done')
  })

  it('«Сделал больше плана»: фиксированный бонус, раз в день на навык', () => {
    const { data, skill } = withSkill()
    data.extras = [
      { id: 'e1', skillId: skill.id, day: D1, at: at(D1, 10) },
      { id: 'e2', skillId: skill.id, day: D1, at: at(D1, 11) },
      { id: 'e3', skillId: skill.id, day: D2, at: at(D2, 11) },
    ]
    expect(computeState(data, nowAt(D2, 20)).xpByStat.deal).toBe(20)
  })

  it('импакт: «+1 к узлу → навык ур. N (ещё K практик до ур. N+1)»', () => {
    const { data, skill, node } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'первый заход')]
    const imp = practiceImpact(data, data.practices[0].id)!
    expect(imp.stageUp).toBe(true)
    expect(imp.level).toBe(1)
    expect(imp.toLevel).toBe(2)
    expect(imp.text).toContain(`+1 к «${node.title}» → Продажи ур. 1 (ещё 2 практики до ур. 2)`)
  })
})

describe('поток', () => {
  it('×2 XP за практики и задачи внутри потока', () => {
    const { data, skill, node } = withSkill()
    data.flows = [{ id: 'f1', day: D1, startedAt: at(D1, 10), endedAt: at(D1, 11) }]
    data.practices = [pr(skill.id, node.id, D1, 10, 'в потоке', undefined, 30), pr(skill.id, node.id, D1, 12, 'после')]
    data.tasks.push({ id: 'p', parentId: null, title: 'Проект', stat: 'deal', scope: 'deal', createdAt: 1, postponed: 0, order: 0 })
    data.tasks.push({ id: 't', parentId: 'p', title: 'Задача', stat: 'deal', scope: 'deal', createdAt: 2, postponed: 0, order: 0, doneAt: at(D1, 10, 40), doneDay: D1 })
    const st = computeState(data, nowAt(D1, 20))
    expect(st.xpByStat.deal).toBe(PRACTICE_XP.full * 2 + PRACTICE_XP.full + 30 * 2)
    expect(st.flowStats.f1).toEqual({ closed: 2, xp: PRACTICE_XP.full * 2 + 60 })
  })

  it('мягкий стоп на 90 минутах, потолок 3 в день, после 22:00 не стартует, перерыв 10 мин', () => {
    const flows = [
      { id: 'a', day: D1, startedAt: at(D1, 8) }, // never stopped → 90 min cap
      { id: 'b', day: D1, startedAt: at(D1, 9, 35) }, // inside the 10-min break → ignored
      { id: 'c', day: D1, startedAt: at(D1, 10), endedAt: at(D1, 10, 30) },
      { id: 'd', day: D1, startedAt: at(D1, 12), endedAt: at(D1, 12, 30) },
      { id: 'e', day: D1, startedAt: at(D1, 14), endedAt: at(D1, 14, 30) }, // 4th → ignored
      { id: 'late', day: D2, startedAt: at(D2, 22, 5), endedAt: at(D2, 23) },
    ]
    const w = flowWindows(flows)
    expect(w.map((x) => x.id)).toEqual(['a', 'c', 'd'])
    expect(w[0].to - w[0].from).toBe(FLOW.maxMin * 60_000)
    expect(canStartFlow({ flows }, nowAt(D1, 15))).toMatchObject({ ok: false })
    expect(canStartFlow({ flows: [] }, nowAt(D1, 22, 10))).toMatchObject({ ok: false })
    expect(canStartFlow({ flows: [] }, nowAt(D1, 21, 50))).toEqual({ ok: true })
    expect(canStartFlow({ flows: [{ id: 'a', day: D1, startedAt: at(D1, 8) }] }, nowAt(D1, 9, 35))).toMatchObject({ ok: false })
    expect(canStartFlow({ flows: [{ id: 'a', day: D1, startedAt: at(D1, 8) }] }, nowAt(D1, 9, 41))).toEqual({ ok: true })
  })
})

describe('цели', () => {
  const g = (o: Partial<Goal>): Goal => ({ id: uid(), skillId: 's', type: 'short', title: 'x', createdAt: at(D1, 8), order: 0, since: D1, ...o })

  it('вложенность: у долгой 1–3 средних, у средней хотя бы одна краткая', () => {
    const long = g({ type: 'long' })
    const mid = g({ type: 'mid', parentId: long.id })
    expect(goalIssues([long])[long.id]).toMatch(/1–3 средних/)
    expect(goalIssues([long, mid])[mid.id]).toMatch(/краткая/)
    const short = g({ type: 'short', parentId: mid.id })
    expect(goalIssues([long, mid, short])).toEqual({})
    const mids = [1, 2, 3].map(() => g({ type: 'mid', parentId: long.id }))
    expect(goalIssues([long, mid, ...mids])[long.id]).toMatch(/Больше 3/)
  })

  it('краткая 3 дня в пролёте → «Разбить?», 7 подряд → «Поднять?»', () => {
    const s = g({ checks: [] })
    expect(needsSplit(s, addDays(D1, 2))).toBe(false)
    expect(needsSplit(s, addDays(D1, 3))).toBe(true)
    expect(shortRuns(s, addDays(D1, 3)).missRun).toBe(3)
    const done = g({ checks: Array.from({ length: 7 }, (_, i) => ({ day: addDays(D1, i), at: at(addDays(D1, i), 9) })) })
    expect(canRaise(done, addDays(D1, 6))).toBe(true)
    expect(canRaise(done, addDays(D1, 7))).toBe(true) // today still open, the run is through yesterday
    expect(canRaise({ ...done, checks: done.checks!.slice(1) }, addDays(D1, 6))).toBe(false)
    // simplified: the counter starts again
    expect(needsSplit({ ...s, since: addDays(D1, 3) }, addDays(D1, 3))).toBe(false)
  })

  it('XP и ❄ по типам: долгая > средняя > краткая > повторяющаяся; неделя повторяющейся даёт бонус', () => {
    expect(GOAL_XP.long).toBeGreaterThan(GOAL_XP.mid)
    expect(GOAL_XP.mid).toBeGreaterThan(GOAL_XP.short)
    expect(GOAL_XP.short).toBeGreaterThan(GOAL_XP.repeat)
    const { data, goals } = withSkill()
    const rep = goals.find((x) => x.type === 'repeat')! // 4 a week
    rep.checks = [0, 1, 2, 3].map((i) => ({ day: addDays(D1, i), at: at(addDays(D1, i), 9) }))
    const mid = goals.find((x) => x.type === 'mid')!
    mid.doneAt = at(D2, 10)
    mid.doneDay = D2
    const st = computeState(data, nowAt(addDays(D1, 3), 20))
    expect(st.xpByStat.deal).toBe(GOAL_XP.repeat * 4 + 5 + GOAL_XP.mid)
  })

  it('метрика vs действие', () => {
    expect(isMetric('Заработать 100 000 ₽')).toBe(true)
    expect(isMetric('Похудеть до 85 кг')).toBe(true)
    expect(isMetric('Пробежать 10 км')).toBe(true)
    expect(isMetric('50 первых сообщений')).toBe(false)
    expect(isMetric('3 дня считать калории')).toBe(false)
  })

  it('ожидаемый срок: три сценария по темпу шкалы', () => {
    const long = g({ type: 'long', scale: { from: 0, to: 10, unit: 'км', points: [{ day: D1, value: 1, at: 1 }, { day: addDays(D1, 10), value: 2, at: 2 }] } })
    const eta = expectedTime(long)
    expect(eta).toEqual({ current: 2, pace: 0.1, base: 80, good: 54, ideal: 40 })
    // scale downwards (weight)
    const down = g({ type: 'long', scale: { from: 95, to: 85, points: [{ day: D1, value: 95, at: 1 }, { day: addDays(D1, 7), value: 94, at: 2 }] } })
    expect(expectedTime(down)).toMatchObject({ base: 63, good: 42, ideal: 32 })
    expect(expectedTime({ ...long, scale: { ...long.scale!, points: [long.scale!.points[0]] } })).toHaveProperty('reason')
    // wrong direction is not a failure, just a question
    expect(expectedTime({ ...down, scale: { ...down.scale!, points: [{ day: D1, value: 95, at: 1 }, { day: D2, value: 96, at: 2 }] } })).toHaveProperty('reason')
  })

  it('баланс 60/30/10', () => {
    const list = [g({ type: 'long' }), g({ type: 'long' }), g({ type: 'mid' }), g({ type: 'short' })]
    expect(goalBalance(list).hint).toBeTruthy()
    const ok = [g({ type: 'long' }), g({ type: 'mid' }), g({ type: 'mid' }), g({ type: 'short' }), g({ type: 'short' }), g({ type: 'short' })]
    expect(goalBalance(ok).hint).toBeUndefined()
  })
})

describe('«Кайф» / «Боль»', () => {
  it('отклоняет короткое и клише без конкретики', () => {
    expect(checkValue('бег для здоровья').ok).toBe(false)
    expect(checkValue('для здоровья и для себя, полезно и надо').ok).toBe(false)
    expect(checkValue('саморазвитие, чтобы было и для развития').ok).toBe(false)
    const r = checkValue('для свободы')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.hint).toMatch(/Что почувствуешь/)
  })
  it('принимает сцену или ощущение, в том числе «Боль»', () => {
    expect(checkValue('Бегу по набережной утром, дыхание ровное, ноги лёгкие').ok).toBe(true)
    expect(checkValue('Задыхаюсь на лестнице в офисе, и стыдно перед коллегами', 'pain').ok).toBe(true)
  })
  it('все примеры из шаблонов проходят проверку', () => {
    for (const t of TEMPLATES) for (const v of [...t.joy, ...t.pain]) expect(checkValue(v).ok, `${t.id}: ${v}`).toBe(true)
  })
  it('8 шаблонов: 3–5 характеристик, 1–8 узлов, по цели каждого типа', () => {
    expect(TEMPLATES).toHaveLength(8)
    for (const t of TEMPLATES) {
      expect(t.traits.length).toBeGreaterThanOrEqual(3)
      expect(t.traits.length).toBeLessThanOrEqual(5)
      for (const tr of t.traits) expect(tr.nodes.length).toBeGreaterThanOrEqual(1)
      const m = materializeTree(templateTree(t), { uid, now: 1, today: D1, value: t.joy[0], valueKind: 'joy', status: 'active', order: 0 })
      expect(new Set(m.goals.map((x) => x.type))).toEqual(new Set(['short', 'mid', 'long', 'repeat']))
      expect(goalIssues(m.goals)).toEqual({})
    }
  })
})

describe('ранги D→S и затухание', () => {
  it('уровень → ранг', () => {
    expect(skillLevelOf(0)).toBe(1)
    expect(rankOf(1)).toBe('D')
    expect(rankOf(3)).toBe('C')
    expect(rankOf(5)).toBe('B')
    expect(rankOf(7)).toBe('A')
    expect(rankOf(10)).toBe('S')
    expect(rankOf(10, 1)).toBe('A')
    expect(rankOf(1, 2)).toBe('D')
  })

  it('пропущенная неделя повторяющейся → страйк, 3 страйка → ранг вниз, 14 чистых дней снимают страйк', () => {
    const rep: Goal = { id: 'r', skillId: 's', type: 'repeat', title: 'x', perWeek: 2, createdAt: at(D1, 8), order: 0, since: D1, checks: [] }
    const w = (k: number) => addDays(D1, 7 * k) // Monday of week k (0 = setup week, never counts)
    const tick = (k: number, n2 = 2) => Array.from({ length: n2 }, (_, i) => ({ day: addDays(w(k), i), at: at(addDays(w(k), i), 9) }))
    // weeks 1, 2 missed → 2 strikes
    expect(skillStrikes({ goals: [rep] }, 's', w(3)).strikes).toBe(2)
    expect(skillStrikes({ goals: [rep] }, 's', addDays(w(3), -1)).strikes).toBe(1) // week 2 not finished yet
    // 3 missed → a rank step lost
    expect(skillStrikes({ goals: [rep] }, 's', w(4))).toMatchObject({ strikes: 0, drops: 1 })
    // missed 1, 2, then clean 3, 4 → one strike removed
    expect(skillStrikes({ goals: [{ ...rep, checks: [...tick(3), ...tick(4)] }] }, 's', w(5))).toMatchObject({ strikes: 1, drops: 0 })
    // a frozen day makes the week neutral
    expect(skillStrikes({ goals: [rep] }, 's', w(2), new Set([addDays(w(1), 3)])).strikes).toBe(0)
  })

  it('разминка не даёт страйков', () => {
    const early = '2026-11-02'
    const rep: Goal = { id: 'r', skillId: 's', type: 'repeat', title: 'x', perWeek: 2, createdAt: at(early, 8), order: 0, since: early, checks: [] }
    expect(skillStrikes({ goals: [rep] }, 's', D1).strikes).toBe(0)
  })

  it('страйки видны в skillView и роняют ранг', () => {
    const { data, skill } = withSkill()
    const view = skillView(data, skill.id, addDays(D1, 7 * 4))!
    expect(view.strikes.drops).toBe(1)
    expect(view.rank).toBe('D')
  })
})

describe('планка', () => {
  it('+10% XP квеста за ступень; прошлые дни не пересчитываются', () => {
    const data = makeData()
    data.profile!.onboardDay = D1
    for (const d of [D1, D2]) log(data, d).quests.reading = { status: 'done', value: 30, at: at(d, 22) }
    const base = computeState(data, nowAt(D2, 23)).xpByStat.mind
    data.bars = [{ id: 'reading:' + D2, questId: 'reading', step: 2, from: D2 }]
    expect(barMult(data, 'reading', D1)).toBe(1)
    expect(barMult(data, 'reading', D2)).toBeCloseTo(1.2)
    const st = computeState(data, nowAt(D2, 23))
    // D1 untouched, D2 ×1.2 (crit or not)
    expect(st.xpByStat.mind).toBeGreaterThan(base)
    expect(st.days[D1].xp).toBe(computeState({ ...data, bars: [] }, nowAt(D2, 23)).days[D1].xp)
  })

  it('5 «done» подряд → «Поднять?», две недели mini/skip → «Опустить»', () => {
    const marks: Record<string, string> = {}
    for (let i = 0; i < 5; i++) marks[addDays(D1, i)] = 'done'
    const st = (d: string) => marks[d]
    expect(barSuggestion({ bars: [] }, 'reading', addDays(D1, 4), st, D1)).toBe('up')
    expect(barSuggestion({ bars: [] }, 'reading', addDays(D1, 3), st, D1)).toBe(null)
    // dismissed yesterday → counts again from today
    expect(barSuggestion({ bars: [] }, 'reading', addDays(D1, 4), st, D1, addDays(D1, 3))).toBe(null)
    const bars = [{ id: 'b', questId: 'reading', step: 2, from: D1 }]
    expect(barSuggestion({ bars }, 'reading', addDays(D1, 20), () => 'mini', D1)).toBe('down')
    expect(barSuggestion({ bars }, 'reading', addDays(D1, 10), () => 'mini', D1)).toBe(null)
    expect(BAR_LADDERS.workout.steps).toHaveLength(6)
  })
})

describe('завязка', () => {
  it('за 3 дня до конца главы показывает следующую главу и её босса', () => {
    expect(setupDue('2027-01-01')).toMatchObject({ next: 2, boss: 'Сахарный голем', daysLeft: 2 })
    expect(setupDue('2026-12-25')).toBeNull()
    expect(setupDue('2027-02-27')).toBeNull()
  })
})

describe('сундук: детерминированный pity-рандом', () => {
  const rewards: Reward[] = [
    { id: 'c1', title: 'Кофе в кофейне', price: 20, rarity: 'common' },
    { id: 'r1', title: 'Новая книга', price: 60, rarity: 'rare' },
    { id: 'l1', title: 'Выходной без дел', price: 200, rarity: 'legendary' },
  ]
  it('тот же день и тип — тот же приз', () => {
    expect(rollChest(D1, 'short', 0, rewards)).toEqual(rollChest(D1, 'short', 0, rewards))
  })
  it('pity: шанс редкого растёт с каждым сундуком без редкого', () => {
    expect(chestOdds(3).rare).toBeGreaterThan(chestOdds(0).rare)
    const chests: ChestOpen[] = [
      { id: 'a', day: D1, type: 'short', at: 1, rarity: 'rare' },
      { id: 'b', day: D2, type: 'short', at: 2, rarity: 'common' },
      { id: 'c', day: D2, type: 'mid', at: 3, rarity: 'common' },
    ]
    expect(pityCount(chests)).toBe(2)
    // with enough pity a rare-or-better prize is guaranteed
    for (let i = 0; i < 30; i++) expect(rollChest(addDays(D1, i), 'mid', 9, rewards).rarity).not.toBe('common')
    // rate without pity is mostly common
    let common = 0
    for (let i = 0; i < 300; i++) if (rollChest(addDays(D1, i), 'repeat', 0, rewards).rarity === 'common') common++
    expect(common / 300).toBeGreaterThan(0.7)
  })
  it('без наград с редкостью — пусто', () => {
    expect(rollChest(D1, 'short', 0, [{ id: 'x', title: 'x', price: 1 }])).toEqual({})
  })
})

describe('синк новых коллекций', () => {
  class Device {
    data: AppData
    meta: SyncMeta = { stamps: {}, tombs: {} }
    constructor(d: AppData) {
      this.data = structuredClone(d)
    }
    edit(now: number, fn: (d: AppData) => void) {
      const next = structuredClone(this.data)
      fn(next)
      this.meta = stampChanges(toAtoms(this.data), toAtoms(next), this.meta, now)
      this.data = next
    }
    sync(server: { doc: SyncDoc | null }) {
      const r = mergeDocs(this.data, this.meta, server.doc)
      this.data = r.data
      this.meta = r.meta
      if (r.remoteChanged || !server.doc) server.doc = { v: 1, data: structuredClone(this.data), ...structuredClone(this.meta) }
    }
  }

  it('практики, цели и поток с двух устройств сливаются по id; правка узла — LWW; удаление — tombstone', () => {
    const { data, skill, node, node2, goals } = withSkill()
    const server = { doc: null as SyncDoc | null }
    const phone = new Device(data)
    phone.sync(server)
    const mac = new Device(phone.data)
    mac.sync(server)

    phone.edit(at(D1, 10), (d) => {
      d.practices!.push(pr(skill.id, node.id, D1, 10, 'с телефона'))
      d.nodes!.find((x) => x.id === node.id)!.title = 'Холодный заход v2'
    })
    mac.edit(at(D1, 11), (d) => {
      d.practices!.push(pr(skill.id, node2.id, D1, 11, 'с мака'))
      d.flows!.push({ id: 'f1', day: D1, startedAt: at(D1, 11), endedAt: at(D1, 11, 30) })
      d.nodes!.find((x) => x.id === node.id)!.title = 'Холодный заход (мак)'
      d.goals = d.goals!.filter((x) => x.id !== goals[3].id)
      d.bars = [{ id: 'reading:' + D1, questId: 'reading', step: 1, from: D1 }]
      d.themes = [{ id: 'ch0', chapter: 0, skillId: skill.id }]
    })
    phone.sync(server)
    mac.sync(server)
    phone.sync(server)

    for (const dev of [phone, mac]) {
      expect(dev.data.practices!.map((p) => p.note).sort()).toEqual(['с мака', 'с телефона'])
      expect(dev.data.flows!.map((f) => f.id)).toEqual(['f1'])
      expect(dev.data.nodes!.find((x) => x.id === node.id)!.title).toBe('Холодный заход (мак)') // later edit wins
      expect(dev.data.goals!.some((g) => g.id === goals[3].id)).toBe(false)
      expect(dev.data.bars).toHaveLength(1)
      expect(dev.data.themes).toHaveLength(1)
    }
    expect(Object.keys(toAtoms(phone.data)).some((k) => k.startsWith('practices/'))).toBe(true)
    expect(phone.meta.tombs[`goals/${goals[3].id}`]).toBeGreaterThan(0)
  })

  it('старое сохранение без новых полей открывается', () => {
    const d = makeData() as unknown as Record<string, unknown>
    for (const k of ['skills', 'traits', 'nodes', 'practices', 'goals', 'flows', 'bars', 'themes', 'extras', 'chests']) delete d[k]
    const st = computeState(d as unknown as AppData, nowAt(D1, 12))
    expect(st.skillXp).toEqual({})
  })
})

describe('соцслой', () => {
  it('в public stats только названия активных навыков и ранги; «Кайф», заметки и отзывы — нет', () => {
    const { data, skill, node } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'СЕКРЕТНЫЙ ОТЗЫВ')]
    data.nodes!.find((x) => x.id === node.id)!.pivot = 'ЛИЧНАЯ ЗАМЕТКА'
    data.skills!.push({ ...skill, id: 'later', title: 'Отложенный', status: 'later' })
    const game = computeState(data, nowAt(D1, 12))
    const s = buildPublicStats(data, game, nowAt(D1, 12))
    expect(s.skills).toEqual([{ t: 'Продажи', r: 'D' }])
    const json = JSON.stringify(s)
    expect(json).not.toContain(skill.value)
    expect(json).not.toContain('СЕКРЕТНЫЙ')
    expect(json).not.toContain('ЛИЧНАЯ')
    expect(json).not.toContain('Отложенный')
    expect(json).not.toContain(node.title)
  })
})

describe('обмен деревом', () => {
  it('код без практик, «Кайфа» и личного; импорт восстанавливает дерево и цели', async () => {
    const { data, skill, node } = withSkill()
    data.practices = [pr(skill.id, node.id, D1, 10, 'ЛИЧНЫЙ ОТЗЫВ')]
    data.skills![0].bridge = { want: 'ТАЙНОЕ ЖЕЛАНИЕ' }
    const tree = treeFromSkill(data, skill.id)!
    const code = await encodeTree(tree)
    expect(code).toMatch(/^WA1\./)
    const back = await decodeTree(`вот мой код: ${code} `)
    expect(back).toEqual(tree)
    const plain = JSON.stringify(back)
    expect(plain).not.toContain('ЛИЧНЫЙ')
    expect(plain).not.toContain('ТАЙНОЕ')
    expect(plain).not.toContain(skill.value)
    const m = materializeTree(back, { uid, now: 5, today: D2, value: 'x'.repeat(30), valueKind: 'joy', status: 'later', order: 1 })
    expect(m.nodes).toHaveLength(data.nodes!.length)
    expect(goalIssues(m.goals)).toEqual({})
  })
  it('мусор → понятная ошибка', async () => {
    await expect(decodeTree('привет')).rejects.toThrow(/не код/)
    await expect(decodeTree('WA1.!!!!')).rejects.toThrow()
  })
})

describe('chests count quests, tasks and practices', () => {
  it('fills «Квесты», «Задачи», «Навыки» from the day', () => {
    const day = '2026-11-23'
    const at = new Date('2026-11-23T12:00:00').getTime()
    const data = {
      goals: [],
      chests: [],
      days: { [day]: { quests: { a: { status: 'done', at }, b: { status: 'mini', at }, c: { status: 'skip', at }, d: { status: 'done', at } } } },
      tasks: [{ doneAt: at }, { doneAt: at }, { doneAt: at }, {}],
      practices: [{ day }, { day: '2026-11-22' }],
    } as unknown as Parameters<typeof chestsFor>[0]
    const [repeat, short, mid] = chestsFor(data, day)
    expect([repeat.count, repeat.ready]).toEqual([3, true])
    expect([short.count, short.ready]).toEqual([3, true])
    expect([mid.count, mid.ready]).toEqual([1, false])
  })
})
