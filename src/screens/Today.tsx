import { useEffect } from 'react'
import { AlertTriangle, Flame, Moon, Snowflake, Sun, Waves } from 'lucide-react'
import {
  ARC_END,
  ARC_START,
  CHAPTERS,
  COMEBACK_WINDOW_MS,
  FINAL_MEASURE_FROM,
  activeQuestsFor,
  addDays,
  childrenOf,
  confessionOpensAt,
  diffDays,
  evalStartOf,
  formatHM,
  gameDayOf,
  isConfessionOpen,
  isPastDeadline,
  marksFor,
  planFor,
  plural,
  redFlag,
  wakeTargetFor,
} from '../engine'
import { useStore } from '../store/store'
import { go, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { BossCard, Hud } from '../components/Hud'
import { QuestRow } from '../components/QuestRow'
import { AddTask, TaskTree } from '../components/TaskTree'
import { formatMMSS } from '../components/ui'

export function Today() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const open = useUi((s) => s.open)

  const pendingReview = Object.values(game.bosses)
    .filter((b) => b.done && !data.ack.reviewedWeeks.includes(b.week))
    .map((b) => b.week)
    .sort((a, b) => a - b)[0]

  useEffect(() => {
    if (!pendingReview) return
    const k = `wa-review-shown-${pendingReview}`
    try {
      if (sessionStorage.getItem(k)) return
      sessionStorage.setItem(k, '1')
    } catch {
      /* private mode */
    }
    go(`/review/${pendingReview}`)
  }, [pendingReview])

  if (today < ARC_START) return <PreArc days={diffDays(today, ARC_START)} />
  if (today > ARC_END) return <AfterArc />

  const plan = planFor(data, today)
  const marks = marksFor(data, today, plan)
  const log = data.days[today]
  const locked = !!log?.confession
  const yesterday = addDays(today, -1)
  const yPending = yesterday >= evalStartOf(data) && !data.days[yesterday]?.confession && !isPastDeadline(yesterday, now)
  const confOpen = isConfessionOpen(today, now) && !locked
  const wt = wakeTargetFor(data, today)
  const mains = plan.filter((p) => p.role === 'main')
  const sides = plan.filter((p) => p.role === 'side')
  const doneMain = mains.filter((p) => marks[p.id].status === 'done' || marks[p.id].status === 'mini').length
  const activeSlip = [...data.slips].reverse().find((s) => !s.retro && !s.comebackAt && now.getTime() - s.at < COMEBACK_WINDOW_MS && now.getTime() >= s.at)
  const dailyRoots = childrenOf(data.tasks, null, 'daily').filter((t) => t.day === today)
  const flag = redFlag(data)

  const renderQuest = (p: (typeof plan)[number]) => {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q) return null
    return <QuestRow key={p.id} plan={p} quest={q} status={marks[p.id].status} auto={marks[p.id].auto} day={today} game={game} locked={locked} wakeTarget={wt} />
  }

  const ritual = (
    <div className="stack">
      {activeSlip && (
        <button className="panel glow row" style={{ textAlign: 'left', borderColor: 'var(--ember)' }} onClick={() => open({ kind: 'comeback', slipId: activeSlip.id })}>
          <Flame color="var(--ember)" aria-hidden />
          <div className="grow">
            <h3>Камбэк ещё возможен</h3>
            <p className="small muted">2-минутная замена вернёт +5 HP</p>
          </div>
          <span className="num" style={{ color: 'var(--ember)' }}>
            {formatMMSS(activeSlip.at + COMEBACK_WINDOW_MS - now.getTime())}
          </span>
        </button>
      )}
      {yPending && (
        <button className="panel glow row" style={{ textAlign: 'left' }} onClick={() => open({ kind: 'confession', day: yesterday })}>
          <Moon color="var(--ice)" aria-hidden />
          <div className="grow">
            <h3>Исповедь за вчера</h3>
            <p className="small muted">Можно до 16:00. Без неё день закроется с −10 HP.</p>
          </div>
        </button>
      )}
      {!log?.checkin && now.getHours() < 20 && (
        <button className="panel row" style={{ textAlign: 'left' }} onClick={() => open({ kind: 'checkin', day: today })}>
          <Sun color="var(--amber)" aria-hidden />
          <div className="grow">
            <h3>Утренний чек-ин</h3>
            <p className="small muted">Подъём, сон, энергия. 10 секунд.{wt !== undefined && ` Цель подъёма ${formatHM(wt)}.`}</p>
          </div>
        </button>
      )}
      {confOpen && (
        <button className="panel glow row" style={{ textAlign: 'left' }} onClick={() => open({ kind: 'confession', day: today })}>
          <Moon color="var(--ice)" aria-hidden />
          <div className="grow">
            <h3>Вечерняя исповедь</h3>
            <p className="small muted">30 секунд честности закрывают день. +5 XP, +1 ❄</p>
          </div>
        </button>
      )}
      {!confOpen && !locked && !yPending && (
        <p className="tiny muted" style={{ padding: '0 4px' }}>
          Исповедь откроется в {formatHM(confessionOpensAt(today).getHours() * 60)}.
        </p>
      )}
      {locked && (
        <div className="panel tight row">
          <Moon size={18} color="var(--ice)" aria-hidden />
          <p className="small grow">День закрыт исповедью. {game.days[today]?.perfect ? 'Идеальный день, +5 HP.' : 'Завтра новый.'}</p>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <Hud game={game} />
      <div className="cols">
        <div className="stack-lg">
          {game.fallen && (
            <section className="panel" style={{ borderColor: 'var(--ember)' }}>
              <h3 style={{ color: 'var(--ember)' }}>Падение</h3>
              <p className="small" style={{ marginTop: 6 }}>
                Квест «Восстановление»: 3 идеальных дня подряд вернут 50 HP. Сейчас {game.recovery} из 3. Магазин закрыт до восстановления.
              </p>
            </section>
          )}
          {ritual}
          <section>
            <div className="section-title">
              <h2>Главные квесты</h2>
              <span className="num small muted">
                {doneMain}/{mains.length}
              </span>
            </div>
            <div className="quests">{mains.map(renderQuest)}</div>
          </section>
          <section>
            <div className="section-title">
              <h2>Побочные</h2>
              <span className="small muted">только XP</span>
            </div>
            <div className="quests">{sides.map(renderQuest)}</div>
          </section>
        </div>
        <div className="stack-lg" style={{ marginTop: 22 }}>
          <BossCard game={game} />
          {pendingReview && (
            <a className="list-btn" href={`#/review/${pendingReview}`}>
              <Waves aria-hidden />
              <span className="grow">
                Обзор недели {pendingReview}
                <small>Итог боя и 3 вопроса</small>
              </span>
            </a>
          )}
          {today >= FINAL_MEASURE_FROM && (
            <a className="list-btn" href="#/finale">
              <Snowflake aria-hidden />
              <span className="grow">
                Финальные замеры
                <small>До/после по всем стартовым замерам</small>
              </span>
            </a>
          )}
          {flag && (
            <section className="card-calm">
              <div className="row" style={{ marginBottom: 6 }}>
                <AlertTriangle size={18} color="var(--ice)" aria-hidden />
                <h3>Энергия на нуле уже две недели</h3>
              </div>
              <p className="small" style={{ color: 'var(--ink-2)' }}>
                Это может быть не лень, а зима и усталость. Свет по утрам, витамин D по анализу, врач, разговор с кем-то близким. HP за это не снимается.
              </p>
            </section>
          )}
          <section>
            <div className="section-title">
              <h2>Задачи дня</h2>
              <span className="small muted">подзадача +3 XP</span>
            </div>
            {dailyRoots.length > 0 && <TaskTree scope="daily" roots={dailyRoots} />}
            <AddTask scope="daily" parentId={null} placeholder="Что сделать сегодня" />
          </section>
        </div>
      </div>
      <div className="fab-wrap">
        <button className="fab secondary" onClick={() => open({ kind: 'craving' })}>
          <Waves size={20} aria-hidden /> Тяга
        </button>
        <button className="fab" onClick={() => open({ kind: 'slip' })}>
          Слился
        </button>
      </div>
    </div>
  )
}

function PreArc({ days }: { days: number }) {
  const data = useStore((s) => s.data)
  const plan = activeQuestsFor(data.quests, ARC_START)
  const hasBaseline = Object.values(data.baseline).some((v) => v !== undefined && v !== '')
  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 8 }}>
        <span className="chapter-name">Пролог начнётся 23 ноября</span>
        <div className="big-title">
          Через {days} {plural(days, 'день', 'дня', 'дней')}
        </div>
        <p className="muted">До старта HP не тратится. Самое время снять замеры и настроить квесты под себя.</p>
      </header>
      <div className="cols">
        <div className="stack">
          <a className="list-btn" href="#/more/measurements">
            <Snowflake aria-hidden />
            <span className="grow">
              Замеры на старте
              <small>{hasBaseline ? 'Заполнено, можно дополнить' : 'Подъём, экранное время, отжимания, талия…'}</small>
            </span>
          </a>
          <a className="list-btn" href="#/more/quests">
            <Sun aria-hidden />
            <span className="grow">
              Квесты
              <small>Формулировки «когда X → Y», мини-версии</small>
            </span>
          </a>
          <a className="list-btn" href="#/more/books">
            <Moon aria-hidden />
            <span className="grow">
              Книга на пролог
              <small>Страницы пойдут в квест «Чтение»</small>
            </span>
          </a>
          <a className="list-btn" href="#/deal">
            <Flame aria-hidden />
            <span className="grow">
              Дерево Дела
              <small>Проекты и задачи для «Дела дня»</small>
            </span>
          </a>
        </div>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Пролог: квесты первой недели</h2>
          <div className="stack" style={{ gap: 8 }}>
            {plan.map((p) => {
              const q = data.quests.find((x) => x.id === p.id)!
              return (
                <div key={p.id} className="row between">
                  <span>{q.title}</span>
                  <span className={`tag ${p.role === 'main' ? 'auto' : ''}`}>{p.role === 'main' ? 'главный' : 'побочный'}</span>
                </div>
              )
            })}
          </div>
          <p className="tiny muted" style={{ marginTop: 14 }}>
            {CHAPTERS[0].focus}. Проверить главы до старта можно в «Ещё → Отладка».
          </p>
        </section>
      </div>
    </div>
  )
}

function AfterArc() {
  const data = useStore((s) => s.data)
  const setAck = useStore((s) => s.setAck)
  return (
    <div className="stack-lg">
      <div className="big-title">Арка пройдена</div>
      <p className="muted">98 дней позади. Сравни себя с собой в ноябре.</p>
      <a className="btn primary block" href="#/finale">
        Открыть финал арки
      </a>
      {data.ack.supportMode ? (
        <SupportQuests />
      ) : (
        <button className="btn ghost block" onClick={() => setAck({ supportMode: true })}>
          Включить режим поддержки
        </button>
      )}
    </div>
  )
}

function SupportQuests() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  const plan = planFor(data, today)
  const marks = marksFor(data, today, plan)
  return (
    <section className="stack">
      <p className="small muted">Режим поддержки: база из главы III, только XP, без HP и боссов.</p>
      <div className="quests">
        {plan.map((p) => {
          const q = data.quests.find((x) => x.id === p.id)
          return q ? <QuestRow key={p.id} plan={p} quest={q} status={marks[p.id].status} auto={marks[p.id].auto} day={today} game={game} locked={false} wakeTarget={wakeTargetFor(data, today)} /> : null
        })}
      </div>
    </section>
  )
}
