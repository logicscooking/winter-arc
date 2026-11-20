/**
 * v0.5 additions to the skill screen: AI check, AI split / next step on goals, rank chance, streak flame.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHECK_LABEL, CHECK_POINTS, VERDICT_LABEL, nextStepTask, skillCheckTask, splitTask } from '../ai/prompts'
import type { NextStep, SkillCheck } from '../ai/prompts'
import { useAi, useAiOn } from '../ai/useAi'
import { addDays, checkValue, childGoals, frozenDays, gameDayOf, goalsOf, nodesOf, rankChance, repeatStreak, traitsOf } from '../engine'
import type { AppData, DayKey, Goal, SkillView } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Px } from '../pixel/Pixel'
import { AiButton, AiPreview, AiStatus } from './ai'
import { RankBadge } from './skills'

// ---------- A1 «Проверить навык» ----------

export function skillCheckInput(data: AppData, skillId: string) {
  const skill = data.skills?.find((s) => s.id === skillId)
  if (!skill) return null
  return {
    title: skill.title,
    valueKind: skill.valueKind ?? 'joy',
    value: skill.value,
    traits: traitsOf(data, skillId).map((t) => ({ t: t.title, nodes: nodesOf(data, t.id).map((n) => n.title) })),
    goals: goalsOf(data, skillId)
      .filter((g) => !g.doneAt)
      .slice(0, 12)
      .map((g) => ({ type: g.type, title: g.title, ...(g.scale ? { scale: `${g.scale.from} → ${g.scale.to}${g.scale.unit ? ` ${g.scale.unit}` : ''}` } : {}) })),
  }
}

export function SkillCheckBlock({ skillId }: { skillId: string }) {
  const on = useAiOn()
  const { st, run, reset } = useAi<SkillCheck>()
  const updateSkill = useStore((s) => s.updateSkill)
  const say = useUi((s) => s.say)
  if (!on) return null
  const start = () => {
    const input = skillCheckInput(useStore.getState().data, skillId)
    if (input) void run(skillCheckTask(input))
  }
  if (st.phase === 'idle')
    return (
      <AiButton onClick={start} block>
        Проверить навык
      </AiButton>
    )
  if (st.phase !== 'done') return <AiStatus st={st} onRetry={start} onCancel={reset} />
  const c = st.value
  const skill = useStore.getState().data.skills?.find((s) => s.id === skillId)
  const better = c.better && skill && checkValue(c.better, skill.valueKind ?? 'joy').ok ? c.better : undefined
  return (
    <AiPreview
      title="Проверка навыка"
      ms={st.ms}
      onCancel={reset}
      applyLabel="Взять формулировку"
      disabled={!better}
      onApply={
        better && skill
          ? () => {
              const prev = { value: skill.value, valueKind: skill.valueKind }
              updateSkill(skillId, { value: better })
              reset()
              say('Формулировка «Кайфа» обновлена', () => updateSkill(skillId, prev))
            }
          : undefined
      }
    >
      <ul className="ai-verdicts">
        {CHECK_POINTS.map((k) => (
          <li key={k}>
            <span className={`verdict v-${c.points[k].v}`}>{VERDICT_LABEL[c.points[k].v]}</span>
            <span className="grow">
              <b>{CHECK_LABEL[k]}</b>
              {c.points[k].note && <span className="tiny muted" style={{ display: 'block' }}>{c.points[k].note}</span>}
            </span>
          </li>
        ))}
      </ul>
      {better ? (
        <blockquote className={`value-quote ${skill?.valueKind === 'pain' ? 'pain' : ''}`}>
          <small>Как можно лучше</small>
          {better}
        </blockquote>
      ) : (
        <p className="tiny muted">Лучшей формулировки «Кайфа» ИИ не дал{c.better ? ': его вариант не прошёл проверку конкретики' : ''}.</p>
      )}
    </AiPreview>
  )
}

// ---------- A3 «Разбить» ----------

export function SplitBlock({ goal, skillTitle, onClose }: { goal: Goal; skillTitle: string; onClose: () => void }) {
  const { st, run, reset } = useAi<string[]>()
  const addGoal = useStore((s) => s.addGoal)
  const delGoal = useStore((s) => s.deleteGoal)
  const say = useUi((s) => s.say)
  const [picked, setPicked] = useState<Set<number>>(new Set([0, 1, 2]))
  const start = () => {
    const goals = goalsOf(useStore.getState().data, goal.skillId)
    void run(splitTask({ skill: skillTitle, goal: { type: goal.type as 'long' | 'mid', title: goal.title }, existing: childGoals(goals, goal.id).map((g) => g.title) }))
  }
  const started = useRef(false)
  useEffect(() => {
    // once per opening, also under StrictMode's double effects
    if (started.current) return
    started.current = true
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const close = () => (reset(), onClose())
  if (st.phase !== 'done') return st.phase === 'idle' ? null : <AiStatus st={st} onRetry={start} onCancel={close} />
  const childType = goal.type === 'long' ? 'mid' : 'short'
  const room = goal.type === 'long' ? Math.max(0, 3 - childGoals(goalsOf(useStore.getState().data, goal.skillId), goal.id).filter((c) => c.type === 'mid').length) : 3
  const items = st.value.slice(0, room)
  return (
    <AiPreview
      title={goal.type === 'long' ? 'Средние шаги' : 'Краткие старты до 15 минут'}
      ms={st.ms}
      onCancel={close}
      disabled={!items.some((_, i) => picked.has(i))}
      onApply={() => {
        const now = nowWithOffset()
        const ids = items.filter((_, i) => picked.has(i)).map((title) => addGoal({ skillId: goal.skillId, type: childType, title, parentId: goal.id }, now))
        close()
        say(`Добавлено: ${ids.length}`, () => ids.forEach((id) => delGoal(id)))
      }}
    >
      {items.length === 0 && <p className="small muted">Средних уже 3 — больше не надо, фокус расплывётся.</p>}
      {items.map((t, i) => (
        <label key={t} className="ai-pick">
          <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))} />
          <span className={`gtag t-${childType}`}>{childType === 'mid' ? 'средняя' : 'краткая'}</span>
          <span className="grow">{t}</span>
        </label>
      ))}
    </AiPreview>
  )
}

// ---------- A4 «Следующий шаг» ----------

/** «Зависла»: a short in the miss zone 3+ days, or an open mid 3+ days old whose starts were not touched for 3 days */
export function isStuck(goal: Goal, goals: Goal[], today: DayKey): boolean {
  if (goal.archived || goal.doneAt) return false
  const from = addDays(today, -3)
  const created = gameDayOf(new Date(goal.createdAt))
  if (goal.type === 'short') {
    const start = goal.since ?? created
    if (start > from) return false
    return !(goal.checks ?? []).some((c) => c.day > from)
  }
  if (goal.type === 'mid') {
    if (created > from) return false
    return !childGoals(goals, goal.id).some((k) => (k.checks ?? []).some((c) => c.day > from) || (k.doneDay && k.doneDay > from))
  }
  return false
}

export function NextStepBlock({ goal, skillTitle, onClose }: { goal: Goal; skillTitle: string; onClose: () => void }) {
  const { st, run, reset } = useAi<NextStep>()
  const addGoal = useStore((s) => s.addGoal)
  const updateGoal = useStore((s) => s.updateGoal)
  const delGoal = useStore((s) => s.deleteGoal)
  const say = useUi((s) => s.say)
  const start = () => void run(nextStepTask(skillTitle, { type: goal.type, title: goal.title }))
  const started = useRef(false)
  useEffect(() => {
    // once per opening, also under StrictMode's double effects
    if (started.current) return
    started.current = true
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const close = () => (reset(), onClose())
  if (st.phase !== 'done') return st.phase === 'idle' ? null : <AiStatus st={st} onRetry={start} onCancel={close} />
  const step = st.value
  return (
    <AiPreview
      title="Следующий шаг"
      ms={st.ms}
      onCancel={close}
      onApply={() => {
        const now = nowWithOffset()
        if (goal.type === 'short') {
          // the stuck start is retired (kept for history), the new one takes its place
          updateGoal(goal.id, { archived: true })
          const id = addGoal({ skillId: goal.skillId, type: 'short', title: step.title, ...(goal.parentId ? { parentId: goal.parentId } : {}) }, now)
          close()
          say('Новый старт вместо зависшего', () => (delGoal(id), updateGoal(goal.id, { archived: false })))
        } else {
          const id = addGoal({ skillId: goal.skillId, type: 'short', title: step.title, parentId: goal.id }, now)
          close()
          say('Краткая цель добавлена', () => delGoal(id))
        }
      }}
    >
      <div className="now-card calm">
        <div className="now-head">
          <span className="now-icon">
            <Px name="flame" size={26} />
          </span>
          <span className="grow">
            <b>{step.title}</b>
            <span className="tiny muted" style={{ display: 'block' }}>
              {step.minutes} мин · краткая
            </span>
          </span>
        </div>
      </div>
    </AiPreview>
  )
}

// ---------- B1 «Шанс ранга» ----------

export function useRankChance(view: SkillView | null) {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  return useMemo(() => (view ? rankChance(data, view, today) : null), [data, view, today])
}

export function RankChanceCard({ view, compact }: { view: SkillView; compact?: boolean }) {
  const c = useRankChance(view)
  if (!c) return compact ? null : <p className="tiny muted">Высший ранг S. Держи его повторяющимися целями.</p>
  if (compact)
    return (
      <span className="chance-line">
        Шанс взять ранг <b>{c.target}</b> за 30 дней: <b className="num">{c.pct}%</b>
      </span>
    )
  return (
    <section className="chance-card" aria-label="Шанс ранга">
      <div className="row" style={{ gap: 10 }}>
        <RankBadge rank={c.target} size="sm" />
        <span className="grow">
          Шанс взять ранг {c.target} за 30 дней
          <span className="tiny muted" style={{ display: 'block' }}>
            по темпу практик за 14 дней, целям и страйкам
          </span>
        </span>
        <b className="num chance-pct">{c.pct}%</b>
      </div>
      <div className="chance-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.pct} aria-label="Шанс ранга">
        <i style={{ width: `${c.pct}%` }} />
      </div>
      {c.hints.length > 0 && (
        <ul className="chance-hints">
          {c.hints.map((h) => (
            <li key={h.text}>
              <b className="num">+{h.delta}%</b> {h.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- B2 «Огонёк» ----------

export function StreakFlame({ goal }: { goal: Goal }) {
  const game = useGame()
  const setBest = useStore((s) => s.setBestStreak)
  const s = useMemo(() => repeatStreak(goal, game.today, frozenDays(game)), [goal, game])
  useEffect(() => {
    if (s.best > (goal.bestStreak ?? 0)) setBest(goal.id, s.best)
  }, [s.best, goal.bestStreak, goal.id, setBest])
  if (!s.current && !s.best) return null
  return (
    <span className={`flame-chip ${s.current ? '' : 'out'}`} title={`Недель подряд с нормой. Рекорд ${s.best}. Заморозка и разминка огонёк не гасят`}>
      <Px name="flame" size={14} />
      <span className="num">{s.current}</span>
      {s.best > s.current && <span className="tiny">рекорд {s.best}</span>}
    </span>
  )
}
