import { useState } from 'react'
import { ArrowLeft, Trophy } from 'lucide-react'
import { ARC_WEEKS, bossOf, formatDayRu, weekDays } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chart } from '../components/Chart'
import { Field } from '../components/ui'

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
      <div>
        <a className="back" href="#/today" onClick={markReviewed}>
          <ArrowLeft size={18} /> Сегодня
        </a>
        <span className="chapter-name">
          Неделя {week}, {formatDayRu(days[0])} – {formatDayRu(days[6])}
        </span>
        <h1 style={{ marginTop: 4 }}>Обзор недели</h1>
      </div>

      <section className={`panel ${b?.won ? 'glow' : ''}`} style={b?.won ? { borderColor: 'var(--amber)' } : undefined}>
        <div className="row">
          <Trophy color={b?.won ? 'var(--amber)' : 'var(--mist)'} aria-hidden />
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
        <Chart title="XP по дням" days={days} series={[{ name: 'XP', color: '#d8952a', kind: 'bar' }]} values={[days.map((d) => (game.days[d] ? game.xpByDay[d] ?? 0 : null))]} yMin={0} />
        <Chart title="HP по дням" days={days} series={[{ name: 'HP', color: '#e8553f', kind: 'line' }]} values={[days.map((d) => game.hpByDay[d] ?? null)]} yMin={0} yMax={100} />
      </div>

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
