import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { BackBtn, TopBar } from '../components/TopBar'
import { ARC_WEEKS, bossOf, formatDayRu, weekDays } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chart } from '../components/Chart'
import { Field } from '../components/ui'
import { WeeklyCheck } from '../components/WeeklyCheck'
import { cloudConfigured } from '../cloud/client'
import { activeSkills, frozenDays, isCompleted, skillView } from '../engine'
import type { AppData, GameState } from '../engine'
import { weekTask } from '../ai/prompts'
import type { WeekNumbers } from '../ai/prompts'
import { useAi, useAiOn } from '../ai/useAi'
import { AiButton, AiPreview, AiStatus } from '../components/ai'

/** Only numbers go to the AI: quest %, perfect days, confessions count, XP, boss, numbered skills */
export function weekNumbers(data: AppData, game: GameState, week: number): WeekNumbers {
  const days = weekDays(week)
  const results = days.map((d) => game.days[d]).filter(Boolean)
  const planned = results.reduce((s, r) => s + r.plan.length, 0)
  const closed = results.reduce((s, r) => s + r.plan.filter((p) => isCompleted(r.marks[p.id])).length, 0)
  const b = game.bosses[week]
  const frozen = frozenDays(game)
  return {
    week,
    questsPct: planned ? Math.round((closed / planned) * 100) : 0,
    perfectDays: results.filter((r) => r.perfect).length,
    confessions: results.filter((r) => r.confession).length,
    xp: results.reduce((s, r) => s + r.xp, 0),
    bossWon: b?.done ? b.won : null,
    skills: activeSkills(data).map((sk, i) => ({
      n: i + 1,
      xp: game.skillXp[sk.id] ?? 0,
      rank: skillView(data, sk.id, game.today, frozen)?.rank ?? 'D',
      practices: (data.practices ?? []).filter((p) => p.skillId === sk.id && p.day >= days[0] && p.day <= days[6]).length,
    })),
  }
}

function WeekAi({ week }: { week: number }) {
  const on = useAiOn()
  const data = useStore((s) => s.data)
  const game = useGame()
  const update = useStore((s) => s.update)
  const say = useUi((s) => s.say)
  const { st, run, reset } = useAi<string>()
  const saved = data.reviews[week]?.ai
  if (!on && !saved) return null
  const setAi = (text: string | undefined) =>
    update((d) => {
      const r = (d.reviews[week] ??= { worked: '', remove: '', simplify: '', at: Date.now() })
      if (text) r.ai = text
      else delete r.ai
    })
  const start = () => void run(weekTask(weekNumbers(useStore.getState().data, game, week)))
  return (
    <section className="stack">
      {saved && (
        <div className="panel tight stack ai-saved">
          <span className="tiny muted">Разбор недели · ИИ</span>
          <p className="small">{saved}</p>
        </div>
      )}
      {on && st.phase === 'idle' && <AiButton onClick={start}>{saved ? 'Разобрать заново' : 'Разбор недели'}</AiButton>}
      <AiStatus st={st} onRetry={start} onCancel={reset} />
      {st.phase === 'done' && (
        <AiPreview
          title="Разбор недели"
          ms={st.ms}
          onCancel={reset}
          onApply={() => {
            const prev = saved
            setAi(st.value)
            reset()
            say('Разбор сохранён в обзоре', () => setAi(prev))
          }}
        >
          <p className="small">{st.value}</p>
          <p className="tiny muted">ИИ видел только числа: % квестов, идеальные дни, исповеди (сколько), XP, ранги и практики навыков без названий.</p>
        </AiPreview>
      )}
    </section>
  )
}

export function WeekReview({ week }: { week: number }) {
  const game = useGame()
  const data = useStore((s) => s.data)
  const saveReview = useStore((s) => s.saveReview)
  const setAck = useStore((s) => s.setAck)
  const say = useUi((s) => s.say)
  const saved = data.reviews[week]
  const [worked, setWorked] = useState(saved?.worked ?? '')
  const [remove, setRemove] = useState(saved?.remove ?? '')
  const [simplify, setSimplify] = useState(saved?.simplify ?? '')

  if (!Number.isFinite(week) || week < 1 || week > ARC_WEEKS) {
    return <div className="empty">Такой недели нет.</div>
  }
  const b = game.bosses[week]
  const days = weekDays(week)
  const results = days.map((d) => game.days[d]).filter(Boolean)
  const perfect = results.filter((r) => r.perfect).length
  const xp = results.reduce((s, r) => s + r.xp, 0)
  const confessions = results.filter((r) => r.confession).length

  const markReviewed = () => {
    if (!data.ack.reviewedWeeks.includes(week)) setAck({ reviewedWeeks: [...data.ack.reviewedWeeks, week] })
  }

  return (
    <div className="stack-lg">
      <TopBar title="Обзор недели" left={<BackBtn href="#/today" onBack={markReviewed} />} />
      <p className="small muted page-sub">
        Неделя {week}, {formatDayRu(days[0])} – {formatDayRu(days[6])}
      </p>

      <section className={`panel ${b?.won ? 'glow' : ''}`} style={b?.won ? { borderColor: 'var(--gold)' } : undefined}>
        <div className="row">
          <Trophy color={b?.won ? 'var(--gold)' : 'var(--mist)'} aria-hidden />
          <div className="grow">
            <h2>{b?.done ? (b.won ? `${bossOf(week)} повержен` : `${bossOf(week)} выстоял`) : `Бой с «${bossOf(week)}» ещё идёт`}</h2>
            <p className="small muted">
              Урон {b?.damage ?? 0} из {b?.hp ?? 0}.{b?.won ? ' Трофей и +15 ❄ твои.' : b?.done ? (b.damage >= b.hp * 0.7 ? ' Не хватило совсем немного.' : ' Значит, квесты пока тяжелее, чем неделя. Упрости или опирайся на мини-версии.') : ''}
            </p>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {(
          [
            ['Идеальных дней', perfect],
            ['XP за неделю', xp],
            ['Исповедей', confessions],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="panel tight stack" style={{ gap: 2 }}>
            <span className="tiny muted">{k}</span>
            <span className="num" style={{ fontSize: '1.3rem' }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="cols">
        <Chart title="XP по дням" days={days} series={[{ name: 'XP', color: 'var(--c-xp)', kind: 'bar' }]} values={[days.map((d) => (game.days[d] ? game.xpByDay[d] ?? 0 : null))]} yMin={0} />
        <Chart title="HP по дням" days={days} series={[{ name: 'HP', color: 'var(--c-hp)', kind: 'line' }]} values={[days.map((d) => game.hpByDay[d] ?? null)]} yMin={0} yMax={100} />
      </div>

      <WeekAi week={week} />

      {cloudConfigured && <WeeklyCheck week={week} />}

      <section className="stack">
        <h2>Три вопроса</h2>
        <Field label="Что сработало">
          <textarea className="textarea" value={worked} onChange={(e) => setWorked(e.target.value)} />
        </Field>
        <Field label="Что убрать">
          <textarea className="textarea" value={remove} onChange={(e) => setRemove(e.target.value)} />
        </Field>
        <Field label="Что упростить">
          <textarea className="textarea" value={simplify} onChange={(e) => setSimplify(e.target.value)} />
        </Field>
        <div className="row wrap">
          <button
            className="btn primary"
            onClick={() => {
              saveReview(week, { worked, remove, simplify })
              markReviewed()
              say('Ответы сохранены')
            }}
          >
            Сохранить ответы
          </button>
          <a className="btn ghost" href="#/more/quests" onClick={markReviewed}>
            Подстроить квесты
          </a>
        </div>
      </section>
    </div>
  )
}
