import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, ChevronLeft, ChevronRight, ClipboardPaste, Copy, Lock, Pencil, Plus, Share2, Sparkles, Trash2, Trophy, X } from 'lucide-react'
import { BackBtn, TopBar } from '../components/TopBar'
import {
  ARC_END,
  ARC_START,
  ARC_WEEKS,
  RU_WEEKDAYS,
  WEEK_LIMITS,
  WEEK_XP,
  addDays,
  bossOf,
  formatRub,
  gameDayOf,
  goalAmount,
  goalFact,
  goalPct,
  goalsOfWeek,
  goalsTally,
  isGoalDone,
  moneyShareOn,
  nextWeekKey,
  plural,
  recapOf,
  recapPrompt,
  recapWindow,
  weekDays,
  weekDaysOf,
  weekLabel,
  weekOf,
  weekOfDay,
  weekday,
} from '../engine'
import type { DayKey, PlanDraft } from '../engine'
import { AiSheet, ShareSheet, WeekGoalsSheet, copyPrompt, ownView, useWeekFigures } from '../components/Week'
import { NumInput, Ring } from '../components/ui'
import { Px } from '../pixel/Pixel'
import { nowWithOffset, useNow } from '../store/hooks'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chart } from '../components/Chart'
import { Field } from '../components/ui'
import { WeeklyCheck } from '../components/WeeklyCheck'
import { cloudConfigured } from '../cloud/client'
import { BOSS_WIN, FINAL_WEEK, FINAL_WIN, GEAR, activeSkills, frozenDays, isCompleted, skillView, weaknessOf } from '../engine'
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

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** «#/review/3» (arc week) or «#/review/2026-11-16» (any week by its Monday) */
export function resolveWeek(param: string | undefined): { monday: DayKey; arcWeek?: number } | null {
  if (param && DAY_RE.test(param)) {
    const monday = weekOfDay(param)
    const inArc = addDays(monday, 6) >= ARC_START && monday <= ARC_END
    return { monday, ...(inArc ? { arcWeek: weekOf(monday < ARC_START ? ARC_START : monday) } : {}) }
  }
  const n = Number(param)
  if (!Number.isInteger(n) || n < 1 || n > ARC_WEEKS) return null
  return { monday: weekDays(n)[0], arcWeek: n }
}

export function WeekReview({ param }: { param?: string }) {
  const data = useStore((s) => s.data)
  const setAck = useStore((s) => s.setAck)
  const w = resolveWeek(param)
  if (!w) return <div className="empty">Такой недели нет.</div>
  const week = w.arcWeek
  const markReviewed = () => {
    if (week && !data.ack.reviewedWeeks.includes(week)) setAck({ reviewedWeeks: [...data.ack.reviewedWeeks, week] })
  }
  return (
    <div className="stack-lg">
      <TopBar title="Итог недели" left={<BackBtn href="#/today" onBack={markReviewed} />} />
      <p className="small muted page-sub">
        {weekLabel(w.monday)}
        {week ? ` · неделя ${week} арки` : ''}
      </p>
      <WeekDeck monday={w.monday} />
      {week && <ArcWeek week={week} onReviewed={markReviewed} />}
    </div>
  )
}

/** The arc part of the weekly review: the boss, XP/HP charts, the AI helper and the three questions */
function ArcWeek({ week, onReviewed }: { week: number; onReviewed: () => void }) {
  const game = useGame()
  const data = useStore((s) => s.data)
  const saveReview = useStore((s) => s.saveReview)
  const say = useUi((s) => s.say)
  const saved = data.reviews[week]
  const [worked, setWorked] = useState(saved?.worked ?? '')
  const [remove, setRemove] = useState(saved?.remove ?? '')
  const [simplify, setSimplify] = useState(saved?.simplify ?? '')

  const b = game.bosses[week]
  const days = weekDays(week)
  const results = days.map((d) => game.days[d]).filter(Boolean)
  const perfect = results.filter((r) => r.perfect).length
  const xp = results.reduce((s, r) => s + r.xp, 0)
  const confessions = results.filter((r) => r.confession).length
  const markReviewed = onReviewed

  return (
    <>
      <div className="section-title" style={{ marginBottom: -8 }}>
        <h2>Бой недели</h2>
      </div>
      <section className={`panel ${b?.won ? 'glow' : ''}`} style={b?.won ? { borderColor: 'var(--gold)' } : undefined}>
        <div className="row">
          <Trophy color={b?.won ? 'var(--gold)' : 'var(--mist)'} aria-hidden />
          <div className="grow">
            <h2>{b?.done ? (b.won ? `${bossOf(week)} повержен` : `${bossOf(week)} выстоял`) : `Бой с «${bossOf(week)}» ещё идёт`}</h2>
            <p className="small muted">
              Урон {b?.damage ?? 0} из {b?.hp ?? 0}.
              {b?.won
                ? week === FINAL_WEEK
                  ? ` +${FINAL_WIN.xp} XP, +${FINAL_WIN.shards} ❄, легендарная вещь и титул «${FINAL_WIN.title}».`
                  : ` +${BOSS_WIN.xp} XP, +${BOSS_WIN.shards} ❄ и «${GEAR.find((g) => g.boss === week)?.title ?? 'трофей'}» в гардероб.`
                : b?.done
                  ? `${b.damage >= b.hp * 0.7 ? ' Не хватило совсем немного.' : ' Значит, квесты пока тяжелее, чем неделя. Упрости или опирайся на мини-версии.'}${b.carry ? ` Он ушёл к финальному боссу: +${b.carry} HP Весеннему боссу.` : ''}`
                  : ` Слабость: ${weaknessOf(week).label}.`}
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
    </>
  )
}

// ---------- «Итог недели»: the pitch deck ----------

const SLIDES = [
  { id: 'goals', kicker: 'Цели', title: 'План / факт', c: 'var(--pine)' },
  { id: 'nums', kicker: 'Цифры', title: 'Цифры недели', c: 'var(--frost)' },
  { id: 'ins', kicker: 'Инсайты', title: 'Лучшие инсайты', c: 'var(--gold-mark)' },
  { id: 'fail', kicker: 'Провал', title: 'Провал и почему', c: 'var(--hp)' },
  { id: 'plan', kicker: 'Дальше', title: 'План на следующую неделю', c: 'var(--st-mind)' },
] as const

interface PlanRow {
  title: string
  target?: number
  unit: string
}
const toRows = (p: PlanDraft[]): PlanRow[] => p.map((x) => ({ title: x.title, target: x.target, unit: x.unit ?? '' }))
const toDrafts = (rows: PlanRow[]): PlanDraft[] =>
  rows.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), ...(r.target && r.target > 0 ? { target: r.target, ...(r.unit.trim() ? { unit: r.unit.trim() } : {}) } : {}) }))

/** Diary answers «Что я понял о себе?» of the week: suggestions on this device only */
function diaryLines(data: AppData, monday: DayKey): { day: DayKey; text: string }[] {
  return weekDaysOf(monday)
    .map((day) => ({ day, text: data.days[day]?.journal?.self?.text?.trim() ?? '' }))
    .filter((x) => x.text)
    .map((x) => ({ ...x, text: x.text.slice(0, WEEK_LIMITS.insight) }))
}

export function WeekDeck({ monday }: { monday: DayKey }) {
  const data = useStore((s) => s.data)
  const setRecap = useStore((s) => s.setRecap)
  const addGoals = useStore((s) => s.addWeekGoals)
  const say = useUi((s) => s.say)
  const today = gameDayOf(useNow())
  const nums = useWeekFigures(monday)
  const recap = recapOf(data, monday)
  const allGoals = goalsOfWeek(data, monday)
  const goals = allGoals.filter((g) => !g.private)
  const hidden = allGoals.length - goals.length
  const tally = goalsTally(goals)
  const next = nextWeekKey(monday)
  const track = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [sheet, setSheet] = useState<null | 'goals' | 'share' | 'ai'>(null)
  const [rows, setRows] = useState<PlanRow[]>(() => (recap?.nextPlan.length ? toRows(recap.nextPlan) : [{ title: '', unit: '' }]))
  const view = useMemo(() => ownView(data, monday, nums), [data, monday, nums])
  const save = (patch: Parameters<typeof setRecap>[1]) => setRecap(monday, patch, nowWithOffset())
  const inWindow = recapWindow(monday, today)
  const showMoney = moneyShareOn(data)

  const goTo = (i: number) => {
    const el = track.current?.children[i] as HTMLElement | undefined
    if (el && track.current) track.current.scrollTo({ left: el.offsetLeft - track.current.offsetLeft - 16, behavior: 'smooth' })
  }
  const onScroll = () => {
    const t = track.current
    if (!t) return
    const first = t.children[0] as HTMLElement | undefined
    const step = first ? first.offsetWidth + 14 : t.clientWidth
    const i = Math.round(t.scrollLeft / step)
    if (i !== idx) setIdx(Math.max(0, Math.min(SLIDES.length - 1, i)))
  }

  // insights: up to 3 fields, one more than written
  const ins = recap?.insights ?? []
  const filled = ins.filter((s) => s.trim()).length
  const insCount = Math.min(WEEK_LIMITS.insights, Math.max(1, ins.length, filled + 1))
  const setInsight = (i: number, text: string) => {
    const arr = Array.from({ length: Math.max(ins.length, i + 1) }, (_, k) => ins[k] ?? '')
    arr[i] = text.slice(0, WEEK_LIMITS.insight)
    save({ insights: arr })
  }
  const used = new Set(ins.map((s) => s.trim()))
  const chips = diaryLines(data, monday).filter((x) => !ins.some((s) => s.includes(x.text)) && !used.has(x.text))
  const insertChip = (text: string) => {
    const i = Array.from({ length: WEEK_LIMITS.insights }, (_, k) => k).find((k) => !(ins[k] ?? '').trim())
    if (i === undefined) return say('Уже три инсайта — освободи поле')
    setInsight(i, text)
  }

  // fails: at least one row on screen
  const fails = recap?.fails.length ? recap.fails : [{ what: '', why: '' }]
  const setFail = (i: number, patch: Partial<{ what: string; why: string }>) => save({ fails: fails.map((f, k) => (k === i ? { ...f, ...patch } : f)) })

  const setPlan = (next: PlanRow[]) => {
    setRows(next)
    save({ nextPlan: toDrafts(next) })
  }
  const drafts = toDrafts(rows)
  const openGoals = goals.filter((g) => !isGoalDone(g) && !rows.some((r) => r.title.trim().toLowerCase() === g.title.toLowerCase()))

  const slides = [
    // 1 · goals
    <>
      <div className="deck-big">
        {goals.length ? `${tally.done}/${tally.total}` : '—'}
        <small>{goals.length ? `сделано${tally.partial ? ` · ${tally.partial} частично` : ''}` : 'целей не было'}</small>
      </div>
      <div className="deck-body">
        {goals.length > 0 ? (
          <ul className="deck-goals">
            {goals.map((g) => {
              const f = goalFact(g)
              return (
                <li key={g.id} className={`deck-goal ${f}`}>
                  <span className="wk-mark" aria-label={f === 'done' ? 'сделано' : f === 'partial' ? 'частично' : 'не сделано'}>
                    {f === 'done' ? <Check size={14} strokeWidth={3.5} /> : f === 'none' ? <X size={13} strokeWidth={3.5} /> : null}
                  </span>
                  <b>{g.title}</b>
                  <span className="num">{g.target ? `${g.progress ?? 0}/${goalAmount(g.target, g.unit)}` : f === 'done' ? 'да' : 'нет'}</span>
                  {g.target ? (
                    <span className="wk-bar" aria-hidden>
                      <i style={{ width: `${goalPct(g) * 100}%` }} />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="small muted">На эту неделю целей не было. Поставь их на следующую — на последнем слайде.</p>
        )}
        {hidden > 0 && (
          <p className="tiny muted">
            <Lock size={11} aria-hidden /> ещё {hidden} только для тебя — не в итоге
          </p>
        )}
      </div>
      <div className="deck-foot">
        <button className="btn sm ghost" onClick={() => setSheet('goals')}>
          <Pencil size={15} aria-hidden /> {allGoals.length ? 'Изменить цели' : 'Добавить цели'}
        </button>
      </div>
    </>,
    // 2 · numbers
    <>
      <div className="deck-ring">
        <Ring progress={nums.pct / 100} size={112} stroke={11} color="var(--frost)">
          <b className="num">{nums.pct}%</b>
        </Ring>
        <div className="grow">
          <b className="deck-title" style={{ fontSize: '1.3rem' }}>
            Дни выполнены на {nums.pct}%
          </b>
          <p className="small muted">Среднее кольцо дня за {nums.days} {plural(nums.days, 'день', 'дня', 'дней')}</p>
        </div>
      </div>
      <div className="deck-tiles">
        <div className="deck-tile">
          <span>XP</span>
          <b className="num">{nums.xp}</b>
        </div>
        <div className="deck-tile">
          <span>Честность</span>
          <b className="num">{nums.streak}</b>
        </div>
        <div className="deck-tile">
          <span>Идеальных</span>
          <b className="num">{nums.perfect}</b>
        </div>
      </div>
      <div className="deck-body">
        {nums.quests.length > 0 && (
          <ul className="deck-quests">
            {nums.quests.map((q) => (
              <li key={q.t}>
                <span>{q.t}</span>
                <span className="num">
                  {q.s ? `${q.s}${q.u ? ` ${q.u}` : ''} · ` : ''}
                  {q.n} из 7
                </span>
              </li>
            ))}
          </ul>
        )}
        {showMoney && nums.money !== undefined && (
          <ul className="deck-quests">
            <li>
              <Px name="coin" size={20} />
              <span>Заработано</span>
              <span className="num">{formatRub(nums.money)}</span>
            </li>
          </ul>
        )}
      </div>
    </>,
    // 3 · insights
    <>
      <div className="deck-body">
        <div className="deck-fields">
          {Array.from({ length: insCount }, (_, i) => (
            <label key={i} className="deck-n">
              <span>{i + 1}</span>
              <textarea className="textarea" value={ins[i] ?? ''} maxLength={WEEK_LIMITS.insight} onChange={(e) => setInsight(i, e.target.value)} placeholder={i === 0 ? 'Главное, что понял за неделю' : 'Ещё один инсайт'} aria-label={`Инсайт ${i + 1}`} />
            </label>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="deck-chips">
            <span className="tiny muted">
              <Lock size={11} aria-hidden /> Из дневника «Что я понял о себе?» · видишь только ты, тап — вставить
            </span>
            {chips.slice(0, 5).map((c) => (
              <button key={c.day} className="deck-chip" onClick={() => insertChip(c.text)}>
                <b>{RU_WEEKDAYS[weekday(c.day)]}</b>
                {c.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </>,
    // 4 · fails
    <>
      <div className="deck-body">
        {fails.map((f, i) => (
          <div key={i} className="deck-fail">
            <div className="deck-fail-head">
              <input className="input" value={f.what} maxLength={WEEK_LIMITS.failWhat} onChange={(e) => setFail(i, { what: e.target.value })} placeholder="Что не получилось" aria-label={`Провал ${i + 1}`} />
              {(fails.length > 1 || f.what || f.why) && (
                <button className="icon-btn" aria-label="Убрать провал" onClick={() => save({ fails: fails.filter((_, k) => k !== i) })}>
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            <textarea className="textarea" value={f.why} maxLength={WEEK_LIMITS.failWhy} onChange={(e) => setFail(i, { why: e.target.value })} placeholder="Почему — честно, без самобичевания" aria-label={`Почему ${i + 1}`} />
          </div>
        ))}
        {fails.length < WEEK_LIMITS.fails && (
          <button className="pd-add" onClick={() => save({ fails: [...fails, { what: '', why: '' }] })}>
            <Plus size={16} strokeWidth={3} aria-hidden /> Ещё провал
          </button>
        )}
      </div>
    </>,
    // 5 · next week
    <>
      {recap?.aiSummary && (
        <p className="wk-ai small">
          <Sparkles size={14} aria-hidden /> <b>Вывод:</b> {recap.aiSummary}
        </p>
      )}
      <div className="deck-body">
        <div className="deck-fields">
          {rows.map((r, i) => (
            <div key={i} className="deck-plan-row">
              <input className="input" value={r.title} maxLength={WEEK_LIMITS.title} onChange={(e) => setPlan(rows.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} placeholder="Цель" aria-label={`Цель ${i + 1}`} />
              <NumInput value={r.target} onChange={(v) => setPlan(rows.map((x, k) => (k === i ? { ...x, target: v } : x)))} placeholder="число" />
              <input className="input" value={r.unit} maxLength={WEEK_LIMITS.unit} onChange={(e) => setPlan(rows.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)))} placeholder="чего" aria-label={`Единица ${i + 1}`} />
              <button className="icon-btn" aria-label="Убрать" onClick={() => setPlan(rows.length > 1 ? rows.filter((_, k) => k !== i) : [{ title: '', unit: '' }])}>
                <X size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {rows.length < WEEK_LIMITS.plan && (
            <button className="pd-add" onClick={() => setRows([...rows, { title: '', unit: '' }])}>
              <Plus size={16} strokeWidth={3} aria-hidden /> Ещё цель
            </button>
          )}
          {openGoals.length > 0 && (
            <button className="pd-add" onClick={() => setPlan([...rows.filter((r) => r.title.trim()), ...openGoals.map((g) => ({ title: g.title, target: g.target, unit: g.unit ?? '' }))].slice(0, WEEK_LIMITS.plan))}>
              <ChevronRight size={16} strokeWidth={3} aria-hidden /> Перенести невыполненные · {openGoals.length}
            </button>
          )}
        </div>
      </div>
      <div className="deck-foot">
        {recap?.appliedAt ? (
          <span className="deck-applied small">
            <Check size={16} strokeWidth={3} aria-hidden /> Цели на {weekLabel(next)} поставлены
          </span>
        ) : (
          <button
            className="btn primary sm"
            disabled={!drafts.length}
            onClick={() => {
              const now = nowWithOffset()
              const n = addGoals(next, drafts, now)
              setRecap(monday, { appliedAt: now.getTime(), nextPlan: drafts }, now)
              say(`${n} ${plural(n, 'цель', 'цели', 'целей')} на ${weekLabel(next)}`)
            }}
          >
            <Check size={16} strokeWidth={3} aria-hidden /> Сделать целями недели
          </button>
        )}
        <button
          className="btn sm"
          onClick={() => {
            copyPrompt(recapPrompt([view]), say)
            setSheet('ai')
          }}
        >
          <Copy size={15} aria-hidden /> Скопировать для ИИ
        </button>
        <button className="btn sm ghost" onClick={() => setSheet('ai')}>
          <ClipboardPaste size={15} aria-hidden /> Вставить ответ ИИ
        </button>
      </div>
    </>,
  ]

  return (
    <section className="deck" aria-label="Итог недели">
      <div className="deck-track" ref={track} onScroll={onScroll} role="region" aria-roledescription="карусель" aria-label="Слайды итога">
        {SLIDES.map((sl, i) => (
          <article key={sl.id} className="deck-slide" style={{ '--slide-c': sl.c } as CSSProperties} aria-roledescription="слайд" aria-label={`${i + 1} из ${SLIDES.length}: ${sl.title}`}>
            <div className="deck-kicker">
              {sl.kicker}
              <span className="num">
                {i + 1}/{SLIDES.length}
              </span>
            </div>
            <h2 className="deck-title">{sl.title}</h2>
            {slides[i]}
          </article>
        ))}
      </div>
      <div className="deck-nav">
        <button className="icon-btn" aria-label="Предыдущий слайд" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="deck-dots">
          {SLIDES.map((sl, i) => (
            <button key={sl.id} aria-label={`Слайд ${i + 1}: ${sl.title}`} aria-current={idx === i} onClick={() => goTo(i)}>
              <i />
            </button>
          ))}
        </div>
        <button className="icon-btn" aria-label="Следующий слайд" disabled={idx === SLIDES.length - 1} onClick={() => goTo(idx + 1)}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="panel tight deck-actions">
        <div className="switch-row">
          <span className="grow">
            <b>Итог видит пати</b>
            <small className="tiny muted" style={{ display: 'block' }}>
              После «Итог готов». Дневник и цели «только мне» — никогда
            </small>
          </span>
          <button className="switch" role="switch" aria-checked={!recap?.private} aria-label="Итог видит пати" onClick={() => save({ private: recap?.private ? undefined : true })} />
        </div>
        <div className="grid-2">
          {recap?.doneAt ? (
            <button className="btn" onClick={() => save({ numbers: nums })}>
              <Check size={18} strokeWidth={3} aria-hidden /> Итог готов
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                const now = nowWithOffset()
                setRecap(monday, { doneAt: now.getTime(), numbers: nums }, now)
                say(inWindow ? `Итог готов · +${WEEK_XP.recap} XP, +${WEEK_XP.recapShards} ❄` : 'Итог готов')
              }}
            >
              <Check size={18} strokeWidth={3} aria-hidden /> Итог готов{inWindow ? ` · +${WEEK_XP.recap} XP` : ''}
            </button>
          )}
          <button className="btn" onClick={() => setSheet('share')}>
            <Share2 size={18} aria-hidden /> Поделиться
          </button>
        </div>
      </div>

      {sheet === 'goals' && <WeekGoalsSheet week={monday} onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ShareSheet view={view} onClose={() => setSheet(null)} />}
      {sheet === 'ai' && <AiSheet week={monday} view={view} onClose={() => setSheet(null)} />}
    </section>
  )
}
