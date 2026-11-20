import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, Check, ChevronRight, Flame, Hammer, ListChecks, Moon, Ruler, Snowflake, Sun, Waves, type LucideIcon } from 'lucide-react'
import {
  ARC_END,
  ARC_START,
  COMEBACK_WINDOW_MS,
  FINAL_MEASURE_FROM,
  addDays,
  childrenOf,
  confessionOpensAt,
  formatHM,
  gameDayOf,
  isCompleted,
  isConfessionOpen,
  isPastDeadline,
  marksFor,
  planFor,
  redFlag,
  replayStartOf,
  wakeTargetFor,
} from '../engine'
import type { AppData, DayKey, Quest } from '../engine'
import { useStore } from '../store/store'
import { go, useFx, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { BossCard, Hud } from '../components/Hud'
import { QuestRow } from '../components/QuestRow'
import { AddTask, TaskTree } from '../components/TaskTree'
import { Hint, formatMMSS } from '../components/ui'
import { Garland } from '../components/festive'
import { Spark } from '../components/Spark'
import { PAGES_GOAL, WAKE_GOAL, pagesValues, wakeValues, window7 } from '../store/trends'

export function Today() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())

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

  if (today > ARC_END) return <AfterArc />
  return <TodayMain pendingReview={pendingReview} />
}

interface Step {
  key: string
  icon: LucideIcon
  title: string
  text: string
  cta: string
  run: () => void
  tone?: 'hp' | 'calm'
  timer?: string
}

const EVENING_QUESTS = ['phone', 'bedtime']

function nextQuestStep(data: AppData, q: Quest, day: DayKey): Omit<Step, 'key' | 'icon'> | null {
  switch (q.kind) {
    case 'reels':
    case 'bedtime':
    case 'wake':
      return null
    case 'deal':
      return { title: q.title, text: q.ifThen, cta: data.days[day]?.dealTaskId ? 'Открыть Дело дня' : 'Выбрать Дело дня', run: () => go('/deal') }
    case 'reading':
    case 'number':
      return { title: q.title, text: q.ifThen, cta: `Записать ${q.unit ?? ''}`.trim(), run: () => document.getElementById(`q-${q.id}`)?.querySelector<HTMLButtonElement>('.check')?.click() }
    default:
      return { title: q.title, text: q.ifThen, cta: 'Сделал', run: () => document.getElementById(`q-${q.id}`)?.querySelector<HTMLButtonElement>('.check')?.click() }
  }
}

function TodayMain({ pendingReview }: { pendingReview?: number }) {
  const data = useStore((s) => s.data)
  const setAck = useStore((s) => s.setAck)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const open = useUi((s) => s.open)
  const celebrate = useFx((s) => s.celebrate)
  const warmup = today < ARC_START

  const plan = planFor(data, today)
  const marks = marksFor(data, today, plan)
  const log = data.days[today]
  const locked = !!log?.confession
  const yesterday = addDays(today, -1)
  const yPending = yesterday >= replayStartOf(data) && yesterday <= ARC_END && !data.days[yesterday]?.confession && !isPastDeadline(yesterday, now)
  const confOpen = isConfessionOpen(today, now) && !locked
  const wt = wakeTargetFor(data, today)
  const mains = plan.filter((p) => p.role === 'main')
  const sides = plan.filter((p) => p.role === 'side')
  const doneMain = mains.filter((p) => isCompleted(marks[p.id].status)).length
  const perfectNow = mains.length > 0 && doneMain === mains.length
  const activeSlip = [...data.slips].reverse().find((s) => !s.retro && !s.comebackAt && now.getTime() - s.at < COMEBACK_WINDOW_MS && now.getTime() >= s.at)
  const dailyRoots = childrenOf(data.tasks, null, 'daily').filter((t) => t.day === today)
  const flag = redFlag(data)

  useEffect(() => {
    if (!perfectNow || locked) return
    const seen = data.ack.celebrated ?? []
    if (seen.includes(today)) return
    setAck({ celebrated: [...seen.slice(-40), today] })
    celebrate({
      kind: 'perfect',
      title: 'Идеальный день',
      text: warmup ? 'Все главные квесты разминки закрыты. Так держать 98 дней.' : 'Все главные квесты закрыты. При закрытии дня +5 HP.',
    })
  }, [perfectNow, locked, today]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what to do now: the most urgent step is the hero, the rest wait below ----
  const steps: Step[] = []
  if (activeSlip)
    steps.push({
      key: 'comeback',
      icon: Flame,
      title: 'Камбэк ещё возможен',
      text: warmup ? '2-минутная замена: +5 XP Воли и +2 ❄.' : '2-минутная замена вернёт +5 HP.',
      cta: 'Сделать камбэк',
      run: () => open({ kind: 'comeback', slipId: activeSlip.id }),
      tone: 'hp',
      timer: formatMMSS(activeSlip.at + COMEBACK_WINDOW_MS - now.getTime()),
    })
  if (yPending)
    steps.push({
      key: 'yconf',
      icon: Moon,
      title: 'Исповедь за вчера',
      text: yesterday < ARC_START ? 'Закрой вчерашний день разминки: XP и ❄ ещё можно забрать до 16:00.' : 'Можно до 16:00. Без неё день закроется с −10 HP.',
      cta: 'Закрыть вчера',
      run: () => open({ kind: 'confession', day: yesterday }),
    })
  if (!log?.checkin && now.getHours() < 20)
    steps.push({
      key: 'checkin',
      icon: Sun,
      title: 'Утренний чек-ин',
      text: `Подъём, сон, энергия — 10 секунд.${wt !== undefined ? ` Цель подъёма ${formatHM(wt)}.` : ''}`,
      cta: 'Отметить подъём',
      run: () => open({ kind: 'checkin', day: today }),
    })
  if (confOpen)
    steps.push({
      key: 'conf',
      icon: Moon,
      title: 'Вечерняя исповедь',
      text: '30 секунд честности закрывают день. +5 XP, +1 ❄.',
      cta: 'Закрыть день',
      run: () => open({ kind: 'confession', day: today }),
    })
  // Don't suggest evening-only quests in the morning, or the morning light after noon
  const h = now.getHours()
  const fitsNow = (id: string) => (EVENING_QUESTS.includes(id) ? h >= 20 : id === 'light' ? h < 12 : true)
  const openMains = mains.filter((p) => !isCompleted(marks[p.id].status) && marks[p.id].status !== 'skip')
  const laterQuest = data.quests.find((x) => x.id === openMains.find((p) => !fitsNow(p.id))?.id)
  if (!locked) {
    const next = openMains.find((p) => fitsNow(p.id))
    const q = next && data.quests.find((x) => x.id === next.id)
    const s = q && nextQuestStep(data, q, today)
    if (s) steps.push({ key: `q-${q!.id}`, icon: Check, ...s, title: `Дальше: ${s.title}`, tone: 'calm' })
  }
  const hero = steps[0]
  const rest = steps.slice(1, 3)

  const renderQuest = (p: (typeof plan)[number]) => {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q) return null
    return (
      <div id={`q-${p.id}`} key={p.id}>
        <QuestRow plan={p} quest={q} status={marks[p.id].status} auto={marks[p.id].auto} day={today} game={game} locked={locked} wakeTarget={wt} />
      </div>
    )
  }

  const bulbs = plan.map((p) => ({ id: p.id, main: p.role === 'main', on: isCompleted(marks[p.id].status) }))

  return (
    <div>
      <Hud game={game} />
      <div className="cols">
        <div className="stack-lg">
          {game.fallen && (
            <section className="panel" style={{ borderColor: 'var(--hp)' }}>
              <h3 style={{ color: 'var(--hp)' }}>Падение</h3>
              <p className="small" style={{ marginTop: 6 }}>
                Квест «Восстановление»: 3 идеальных дня подряд вернут 50 HP. Сейчас {game.recovery} из 3. Магазин закрыт до восстановления.
              </p>
            </section>
          )}

          {hero ? (
            <section className={`now-card ${hero.tone ?? ''}`} aria-label="Что сделать сейчас">
              <div className="now-head">
                <span className="now-icon">
                  <hero.icon size={20} aria-hidden />
                </span>
                <h2 className="grow">{hero.title}</h2>
                {hero.timer && <span className="timer">{hero.timer}</span>}
              </div>
              <p>{hero.text}</p>
              <button className="btn block" onClick={hero.run}>
                {hero.cta}
              </button>
            </section>
          ) : (
            <section className="now-card calm" aria-label="Статус дня">
              <div className="now-head">
                <span className="now-icon">
                  <Moon size={20} aria-hidden />
                </span>
                <h2 className="grow">{locked ? (game.days[today]?.perfect ? 'Идеальный день закрыт' : 'День закрыт') : laterQuest ? 'Пока всё' : 'Главное сделано'}</h2>
              </div>
              <p className="muted">
                {locked
                  ? 'Исповедь записана. Завтра новый день.'
                  : `${laterQuest ? `Позже: ${laterQuest.title}. ` : 'Побочные квесты добавят XP. '}Исповедь откроется в ${formatHM(confessionOpensAt(today).getHours() * 60)}.`}
              </p>
            </section>
          )}
          {rest.length > 0 && (
            <div className="also">
              {rest.map((s) => (
                <button key={s.key} className="also-row" onClick={s.run}>
                  <s.icon size={20} aria-hidden />
                  <span className="grow">
                    {s.title}
                    <small>{s.text}</small>
                  </span>
                  <ChevronRight size={18} color="var(--mist)" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <Garland bulbs={bulbs} label={warmup ? 'Гирлянда разминки' : 'Гирлянда дня'} />

          <Hint id="quests">
            Нажми кружок — квест выполнен. Нажми на название — мини-версия на 2 минуты или пропуск. Ошибся — внизу будет «Отменить».
          </Hint>

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

        <div className="stack-lg" style={{ marginTop: 4 }}>
          <MiniTrends />
          <BossCard game={game} />
          {warmup && <Prep />}
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
                <AlertTriangle size={18} color="var(--frost)" aria-hidden />
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

/** Two 7-day tiles so progress is visible without opening «Графики» */
export function MiniTrends() {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const days = window7(data, today)
  const wake = wakeValues(data, days, today)
  const pages = pagesValues(data, days, today)
  const lastWake = [...wake].reverse().find((v) => v !== null)
  const todayPages = pages[days.indexOf(today)]
  const pagesWeek = pages.reduce<number>((s, v) => s + (v ?? 0), 0)
  return (
    <div className="mini-trends">
      <a className="mini-trend" href="#/charts">
        <span className="k">
          Подъём <span>7 дней</span>
        </span>
        <span className="v">
          {lastWake != null ? formatHM(lastWake) : '—'}
          <small>цель 07:00</small>
        </span>
        <Spark values={wake} kind="line" goal={WAKE_GOAL} label="Время подъёма за 7 дней" />
        {lastWake == null && <span className="note">Точка появится после чек-ина</span>}
      </a>
      <a className="mini-trend" href="#/charts">
        <span className="k">
          Страницы <span>7 дней</span>
        </span>
        <span className="v">
          {todayPages ?? 0}
          <small>сегодня · {pagesWeek} за 7 дн</small>
        </span>
        <Spark values={pages} kind="bar" goal={PAGES_GOAL} min={0} label="Страниц в день за 7 дней" />
      </a>
    </div>
  )
}

function PrepLink({ href, icon: I, title, hint, done }: { href: string; icon: LucideIcon; title: string; hint: ReactNode; done?: boolean }) {
  return (
    <a className="list-btn" href={href}>
      <I aria-hidden />
      <span className="grow">
        {title}
        <small>{hint}</small>
      </span>
      {done ? <Check size={18} color="var(--pine)" aria-label="готово" /> : <ChevronRight size={18} color="var(--mist)" aria-hidden />}
    </a>
  )
}

/** Before the arc: the setup that makes day one easy */
function Prep() {
  const data = useStore((s) => s.data)
  const hasBaseline = Object.entries(data.baseline).some(([k, v]) => k !== 'wake' && v !== undefined && v !== '')
  const hasBook = !!data.activeBookId
  const hasProject = data.tasks.some((t) => t.scope === 'deal')
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="section-title" style={{ marginBottom: 4 }}>
        <h2>Подготовка к старту</h2>
      </div>
      <PrepLink href="#/more/measurements" icon={Ruler} title="Замеры на старте" hint={hasBaseline ? 'Заполнено — в финале сравним' : 'Отжимания, планка, талия, экран…'} done={hasBaseline} />
      <PrepLink href="#/more/books" icon={BookOpen} title="Книга на пролог" hint={hasBook ? 'Страницы идут в «Чтение»' : 'Страницы пойдут в квест «Чтение»'} done={hasBook} />
      <PrepLink href="#/deal" icon={Hammer} title="Дерево Дела" hint={hasProject ? 'Проекты есть — выбирай Дело дня' : 'Проект и задачи для «Дела дня»'} done={hasProject} />
      <PrepLink href="#/more/quests" icon={ListChecks} title="Квесты под себя" hint="Формулировки «когда X → Y», мини-версии" />
    </section>
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
