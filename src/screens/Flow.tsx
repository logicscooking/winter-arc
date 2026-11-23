import { useEffect, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { FLOW, PRACTICE_LIMIT, activeSkills, canStartFlow, checkedOn, flowEnd, gameDayOf, goalsOf, liveFlow, planFor, practicesToday, flowWindows, questXp, taskXp } from '../engine'
import type { FlowSession } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, refreshClock, reward, useGame, useNow, useRoute } from '../store/hooks'
import { useUi } from '../store/ui'
import { Help, Ring, formatMMSS } from '../components/ui'
import { PracticeSheet, skillSprite } from '../components/skills'
import { Px } from '../pixel/Pixel'

/** «Поток»: ▶, timer, ×2 XP for practices and tasks, soft stop at 90 min, 3 a day, none after 22:00 */
export function Flow() {
  const data = useStore((s) => s.data)
  const stopFlow = useStore((s) => s.stopFlow)
  const startFlow = useStore((s) => s.startFlow)
  const say = useUi((s) => s.say)
  const game = useGame()
  const now = useNow()
  const route = useRoute()
  const today = gameDayOf(now)
  const live = liveFlow(data, now)
  const doneId = route.query.get('done')
  const [skillId, setSkillId] = useState<string | undefined>(activeSkills(data)[0]?.id)
  const used = flowWindows(data.flows).filter((w) => w.day === today).length
  // a flow that hit its cap without «Стоп»: soft stop
  const capped = (data.flows ?? []).filter((f) => !f.endedAt && f.day === today && now.getTime() >= flowEnd(f)).at(-1)
  const summaryId = doneId ?? capped?.id
  const summary = summaryId ? (data.flows ?? []).find((f) => f.id === summaryId) : undefined

  if (live) return <LiveFlow flow={live} onStop={() => (stopFlow(live.id, nowWithOffset()), refreshClock(), go(`/flow?done=${live.id}`))} />

  const block = canStartFlow(data, now)
  return (
    <div className="stack-lg">
      {summary && (
        <section className="panel glow stack flow-summary">
          <div className="row" style={{ gap: 10 }}>
            <Px name="trophy" size={34} />
            <div className="grow">
              <span className="tiny muted">{capped && summary.id === capped.id ? 'Мягкий стоп · перерыв 10 мин' : 'Поток завершён'}</span>
              <h2>
                Закрыто {game.flowStats[summary.id]?.closed ?? 0}, к сфере +{game.flowStats[summary.id]?.xp ?? 0}
              </h2>
            </div>
          </div>
          <p className="small muted">{Math.round((flowEnd(summary) - summary.startedAt) / 60_000)} мин в потоке, всё внутри — ×2.</p>
          {capped && summary.id === capped.id && (
            <button className="btn block" onClick={() => (stopFlow(capped.id, new Date(flowEnd(capped))), go(`/flow?done=${capped.id}`))}>
              Понял, перерыв
            </button>
          )}
        </section>
      )}

      <p className="small muted page-sub">
        Всё, что закроешь внутри, — ×2 очков сферы{' '}
        <Help title="Поток" text={[`Таймер глубокой работы. Практики навыка, задачи и Дело дня, закрытые внутри, дают ×${FLOW.mult} очков сферы.`, `До ${FLOW.maxMin} минут, потом мягкий стоп и перерыв ${FLOW.breakMin} минут. ${FLOW.perDay} потока в день, после 22:00 не стартует — сон важнее.`, 'Обычно поток включают прямо из навыка или из Дела дня.']} />
      </p>
      <div className="flow-rules">
        <span>
          <b className="num">{FLOW.maxMin}</b> мин максимум
        </span>
        <span>
          <b className="num">
            {used}/{FLOW.perDay}
          </b>{' '}
          сегодня
        </span>
        <span>
          до <b className="num">22:00</b>
        </span>
      </div>
      {activeSkills(data).length > 0 && (
        <div className="chips" role="group" aria-label="Навык потока">
          {activeSkills(data).map((s) => (
            <button key={s.id} className="chip" aria-pressed={skillId === s.id} onClick={() => setSkillId(skillId === s.id ? undefined : s.id)}>
              {s.title}
            </button>
          ))}
        </div>
      )}
      {!block.ok && <p className="warn-note">{block.reason}</p>}
      <div className="grid-2">
        <button
          className="btn primary"
          disabled={!block.ok}
          onClick={() => {
            const r = startFlow(nowWithOffset(), undefined, skillId)
            if (!r.ok) say(r.reason)
            refreshClock()
          }}
        >
          <Px name="play" size={22} /> Старт
        </button>
        <button
          className="btn ghost"
          disabled={!block.ok}
          onClick={() => {
            const r = startFlow(nowWithOffset(), FLOW.quickMin, skillId)
            if (!r.ok) say(r.reason)
            refreshClock()
          }}
        >
          15 минут
        </button>
      </div>
    </div>
  )
}

function LiveFlow({ flow, onStop }: { flow: FlowSession; onStop: () => void }) {
  const data = useStore((s) => s.data)
  const toggleGoal = useStore((s) => s.toggleGoal)
  const toggleTask = useStore((s) => s.toggleTask)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const [practice, setPractice] = useState<string | null>(null)
  const [, force] = useState(0)
  const cap = Math.min(flow.minutes ?? FLOW.maxMin, FLOW.maxMin) * 60_000
  const elapsed = nowWithOffset().getTime() - flow.startedAt
  const skill = data.skills?.find((s) => s.id === flow.skillId)
  const nodes = (data.nodes ?? []).filter((n) => n.skillId === flow.skillId)
  const shorts = skill ? goalsOf(data, skill.id).filter((g) => g.type === 'short' || g.type === 'mid') : []
  const stats = game.flowStats[flow.id]
  // the Deal of the day closes right here: tasks closed inside the flow count ×2
  const dealId = data.days[today]?.dealTaskId
  const deal = dealId ? data.tasks.find((t) => t.id === dealId) : undefined
  const dealPlan = planFor(data, today).find((p) => p.id === 'deal')
  const locked = !!data.days[today]?.confession
  // re-render every second for the clock
  useTick(() => force((x) => x + 1))
  return (
    <div className="stack-lg flow-live">
      <div className="center stack" style={{ gap: 4 }}>
        <span className="tiny muted">Поток · {skill ? skill.title : deal ? 'Дело дня' : 'глубокая работа'}</span>
        <span className="reward-chip gold" style={{ alignSelf: 'center' }}>
          <Px name="play" size={20} /> ×2 к сфере
        </span>
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Ring progress={elapsed / cap} size={230} stroke={10} color="var(--gold-mark)">
          <div className="t num">{formatMMSS(cap - elapsed)}</div>
        </Ring>
      </div>
      <p className="center small muted">
        Закрыто {stats?.closed ?? 0} · к сфере +{stats?.xp ?? 0}
      </p>
      <button className="btn block danger" onClick={onStop}>
        Стоп
      </button>
      {deal && !locked && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>Дело дня</h3>
          <button
            className={`flow-node goal ${deal.doneAt ? 'done' : ''}`}
            onClick={(e) => {
              if (!deal.doneAt) reward(e.currentTarget, { xp: taskXp(data.tasks, deal) + (dealPlan ? questXp(dealPlan.role, dealPlan.base, 'done') : 0), shards: dealPlan ? (dealPlan.role === 'main' ? 3 : 2) : 0 })
              toggleTask(deal.id, nowWithOffset())
            }}
          >
            <Check size={16} />
            <span className="grow" style={{ textAlign: 'left' }}>
              {deal.title}
            </span>
          </button>
        </section>
      )}
      {skill && nodes.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>Практика в потоке</h3>
          {nodes.slice(0, 12).map((n) => (
            <div key={n.id} className="flow-node">
              <span className="grow">{n.title}</span>
              <button className="btn sm primary" disabled={practicesToday(data, n.id, today) >= PRACTICE_LIMIT} onClick={() => setPractice(n.id)}>
                <Plus size={16} /> практика
              </button>
            </div>
          ))}
        </section>
      )}
      {shorts.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>Цели</h3>
          {shorts.map((g) => {
            const done = g.type === 'short' ? checkedOn(g, today) : !!g.doneAt
            return (
              <button key={g.id} className={`flow-node goal ${done ? 'done' : ''}`} onClick={() => toggleGoal(g.id, nowWithOffset())}>
                <Check size={16} />
                <span className="grow" style={{ textAlign: 'left' }}>
                  {g.title}
                </span>
              </button>
            )
          })}
        </section>
      )}
      {skill && (
        <a className="list-btn" href={`#/skill/${skill.id}`}>
          <Px name={skillSprite(skill)} size={26} />
          <span className="grow">
            Дерево навыка
            <small>поток идёт, таймер не останавливается</small>
          </span>
        </a>
      )}
      {practice && <PracticeSheet nodeId={practice} onClose={() => setPractice(null)} />}
    </div>
  )
}

function useTick(fn: () => void) {
  useEffect(() => {
    const t = setInterval(fn, 1000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
