/**
 * «Неделя»: the goals card of «Сегодня», the goals sheet, the share sheet (PNG / text), the
 * «Скопировать для ИИ» sheet and a read-only итог for the party. The deck itself lives in WeekReview.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, ClipboardPaste, Copy, Download, Lock, LockOpen, Minus, Pencil, Plus, Share2, Sparkles, Trash2, X } from 'lucide-react'
import {
  WEEK_LIMITS,
  WEEK_XP,
  addDays,
  formatRub,
  goalAmount,
  goalFact,
  goalPct,
  goalsFor,
  goalsOfWeek,
  goalsTally,
  incomesOf,
  isCompleted,
  marksFor,
  moneyShareOn,
  nextWeekKey,
  parseAiAnswer,
  planFor,
  prevWeekKey,
  pubGoal,
  questArea,
  recapContent,
  recapOf,
  recapPrompt,
  weekDayNotes,
  recapText,
  recapWeekFor,
  recapWindow,
  weekDaysOf,
  weekLabel,
  weekOfDay,
} from '../engine'
import type { AppData, DayKey, GameState, PlanDraft, PubGoal, RecapView, WeekGoal, WeekFigures } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, useGame, useNow } from '../store/hooks'
import { gameDayOf } from '../engine'
import { useUi } from '../store/ui'
import { Px } from '../pixel/Pixel'
import { Field, Help, NumInput, Sheet } from './ui'
import { todaySections } from '../screens/todayItems'
import { renderRecapPng } from './recapImage'
import './week.css'

// ---------- numbers of a week ----------

/** «Цифры недели»: the day ring averaged over the week's days so far, XP, honesty, top quests, money (opt-in) */
export function weekFigures(data: AppData, game: GameState, monday: DayKey, today: DayKey): WeekFigures {
  const start = data.profile?.onboardDay ?? monday
  const days = weekDaysOf(monday).filter((d) => d <= today && d >= start)
  let sum = 0
  let counted = 0
  const quests = new Map<string, { t: string; n: number; s: number; u?: string; money: boolean }>()
  for (const d of days) {
    const pr = todaySections(data, d).progress
    if (pr.total) {
      sum += pr.done / pr.total
      counted++
    }
    const plan = game.days[d]?.plan ?? planFor(data, d)
    const marks = marksFor(data, d, plan)
    for (const p of plan) {
      if (!isCompleted(marks[p.id]?.status)) continue
      const q = data.quests.find((x) => x.id === p.id)
      if (!q || q.kind === 'wake' || q.kind === 'bedtime' || q.kind === 'reels' || q.kind === 'caffeine') continue
      const cur = quests.get(q.id) ?? { t: q.title.slice(0, 40), n: 0, s: 0, u: q.unit, money: questArea(q) === 'money' }
      cur.n++
      if (q.kind === 'number' || q.kind === 'reading') cur.s += data.days[d]?.quests[q.id]?.value ?? 0
      quests.set(q.id, cur)
    }
  }
  const top = [...quests.values()]
    .sort((a, b) => Number(b.money) - Number(a.money) || b.n - a.n || b.s - a.s)
    .slice(0, 4)
    .map((q) => ({ t: q.t, n: q.n, ...(q.s > 0 ? { s: Math.round(q.s) } : {}), ...(q.s > 0 && q.u ? { u: q.u } : {}) }))
  const week = weekDaysOf(monday)
  const money = moneyShareOn(data) ? incomesOf(data).filter((x) => x.day >= week[0] && x.day <= week[6] && x.day <= today).reduce((s, x) => s + x.amount, 0) : undefined
  return {
    pct: counted ? Math.round((sum / counted) * 100) : 0,
    days: days.length,
    perfect: days.filter((d) => game.days[d]?.perfect).length,
    xp: days.reduce((s, d) => s + (game.xpByDay[d] ?? 0), 0),
    elo: days.length ? (game.eloByDay[days[days.length - 1]] ?? game.elo) - (game.eloByDay[addDays(days[0], -1)] ?? 1000) : 0,
    streak: game.honestyStreak,
    quests: top,
    ...(money !== undefined ? { money } : {}),
  }
}

/** Own deck as one view: shared goals, live numbers, the non-blank texts */
export function ownView(data: AppData, monday: DayKey, numbers: WeekFigures | undefined): RecapView {
  const r = recapOf(data, monday)
  const c = recapContent(r)
  return {
    name: data.profile?.nick,
    week: monday,
    goals: goalsOfWeek(data, monday, { withPrivate: false }).map(pubGoal),
    num: numbers,
    insights: c.insights,
    fails: c.fails,
    next: c.nextPlan,
    ai: r?.aiSummary,
  }
}

// ---------- one goal ----------

function amountText(g: Pick<WeekGoal, 'target' | 'unit' | 'progress'>) {
  return g.target ? `${g.progress ?? 0}/${goalAmount(g.target, g.unit)}` : ''
}

/** A goal of the week: ✓ for done, −/+ for a numeric one */
export function GoalRow({ g, onOpen }: { g: WeekGoal; onOpen?: () => void }) {
  const bump = useStore((s) => s.bumpWeekGoal)
  const updateGoal = useStore((s) => s.updateWeekGoal)
  const fact = goalFact(g)
  const done = fact === 'done'
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const sent = useRef(false) // Enter and the blur that follows must not add twice
  return (
    <div className={`wk-goal ${fact}`}>
      <button className="pd-check sm" aria-pressed={done} aria-label={`${g.title}: ${done ? 'снять отметку' : 'выполнено'}`} onClick={() => updateGoal(g.id, done && g.target && (g.progress ?? 0) >= g.target ? { done: undefined, progress: g.target - 1 } : { done: !done || undefined }, nowWithOffset())}>
        <span>{done && <Check size={13} strokeWidth={3.5} />}</span>
      </button>
      <div className="wk-goal-main">
        <button className="wk-goal-title" onClick={onOpen} aria-label={`${g.title}: изменить`}>
          {g.title}
          {g.private && <Lock size={12} aria-label="только мне" className="wk-lock" />}
        </button>
        {g.target ? (
          <span className="wk-goal-line">
            <span className="wk-bar" aria-hidden>
              <i style={{ width: `${goalPct(g) * 100}%` }} />
            </span>
            <span className="wk-step">
              <button className="wk-step-btn" aria-label={`${g.title}: минус 1`} disabled={!g.progress} onClick={() => bump(g.id, -1, nowWithOffset())}>
                <Minus size={14} strokeWidth={3} />
              </button>
              {typing ? (
                <form
                  className="wk-add"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (sent.current) return
                    sent.current = true
                    const n = Math.round(Number(draft.replace(',', '.')) * 100) / 100
                    if (Number.isFinite(n) && n !== 0) bump(g.id, Math.max(n, -(g.progress ?? 0)), nowWithOffset())
                    setTyping(false)
                  }}
                >
                  <input
                    className="num"
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="+ сколько"
                    aria-label={`${g.title}: сколько добавить`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.replace(/[^\d,.-]/g, ''))}
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                </form>
              ) : (
                <button className="num wk-amount" aria-label={`${g.title}: ${amountText(g)}, вписать сколько добавить`} onClick={() => ((sent.current = false), setDraft(''), setTyping(true))}>
                  {amountText(g)}
                </button>
              )}
              <button className="wk-step-btn" aria-label={`${g.title}: плюс 1`} onClick={() => bump(g.id, 1, nowWithOffset())}>
                <Plus size={14} strokeWidth={3} />
              </button>
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------- «Сегодня» ----------

const SKIP = (week: DayKey) => `wk-skip:${week}`

/** «Цели недели» on «Сегодня»: an invitation while the week has none, else the goals with −/+ and the итог entry */
export function WeekGoalsCard() {
  const data = useStore((s) => s.data)
  const setAck = useStore((s) => s.setAck)
  const now = useNow()
  const today = gameDayOf(now)
  const week = weekOfDay(today)
  const goals = goalsOfWeek(data, week)
  const [sheet, setSheet] = useState(false)
  const prev = recapOf(data, prevWeekKey(week))
  const rWeek = recapWeekFor(today)
  const r = recapOf(data, rWeek)
  const showRecap = recapWindow(rWeek, today) && !r?.doneAt && (rWeek === week || goalsOfWeek(data, rWeek).length > 0 || !!r)
  const skipped = (data.ack.hints ?? []).includes(SKIP(week))
  const tally = goalsTally(goals)
  const isSunday = today === addDays(week, 6)

  const recapRow = showRecap && (
    <a className="wk-recap-link" href={`#/review/${rWeek}`}>
      <Px name="trophy" size={24} />
      <span className="grow">
        <b>{rWeek === week ? 'Итог недели' : 'Итог прошлой недели'}</b>
        <small>Цели, цифры, инсайты, провал, план · +{WEEK_XP.recapShards} WF</small>
      </span>
      <ChevronRight size={18} aria-hidden />
    </a>
  )

  if (!goals.length) {
    if (skipped && !isSunday) return recapRow ? <section className="panel tight wk-card">{recapRow}</section> : null
    const draft = prev?.nextPlan?.length && !prev.appliedAt ? prev.nextPlan : undefined
    return (
      <section className="panel wk-card wk-invite" aria-label="Цели на неделю">
        {prev?.aiSummary && <AiSummaryLine text={prev.aiSummary} />}
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Px name="quests" size={34} />
          <div className="grow">
            <h3>Цели на неделю</h3>
            <p className="small muted">Что сделаешь до воскресенья? Сколько целей — решать тебе.</p>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary sm grow" onClick={() => setSheet(true)}>
            <Plus size={16} strokeWidth={3} aria-hidden /> Поставить цели
          </button>
          {draft && <TakePlanBtn week={week} plan={draft} fromWeek={prevWeekKey(week)} />}
          <button className="btn ghost sm" onClick={() => setAck({ hints: [...(data.ack.hints ?? []).filter((h) => !h.startsWith('wk-skip:')), SKIP(week)] })}>
            Не сейчас
          </button>
        </div>
        {recapRow}
        {sheet && <WeekGoalsSheet week={week} onClose={() => setSheet(false)} />}
      </section>
    )
  }

  return (
    <section className="panel wk-card" aria-label="Цели недели">
      <header className="wk-head">
        <Px name="quests" size={28} />
        <span className="grow">
          <b>Цели недели</b>
          <small>
            {weekLabel(week)} · {tally.done} из {tally.total}
          </small>
        </span>
        <button className="icon-btn" aria-label="Изменить цели недели" onClick={() => setSheet(true)}>
          <Pencil size={18} />
        </button>
      </header>
      {prev?.aiSummary && <AiSummaryLine text={prev.aiSummary} />}
      <div className="wk-goals">
        {goals.map((g) => (
          <GoalRow key={g.id} g={g} onOpen={() => setSheet(true)} />
        ))}
      </div>
      {recapRow}
      {sheet && <WeekGoalsSheet week={week} onClose={() => setSheet(false)} />}
    </section>
  )
}

function AiSummaryLine({ text, label = 'Вывод прошлой недели' }: { text: string; label?: string }) {
  return (
    <p className="wk-ai small">
      <Sparkles size={14} aria-hidden /> <b>{label}:</b> {text}
    </p>
  )
}

/** «Взять план итога»: next week's draft from the итог becomes this week's goals */
function TakePlanBtn({ week, plan, fromWeek }: { week: DayKey; plan: PlanDraft[]; fromWeek: DayKey }) {
  const add = useStore((s) => s.addWeekGoals)
  const setRecap = useStore((s) => s.setRecap)
  const say = useUi((s) => s.say)
  return (
    <button
      className="btn sm"
      onClick={() => {
        const now = nowWithOffset()
        const n = add(week, plan, now)
        setRecap(fromWeek, { appliedAt: now.getTime() }, now)
        say(`Цели недели: ${n} из плана итога`)
      }}
    >
      Взять план итога · {plan.length}
    </button>
  )
}

// ---------- goals sheet ----------

interface Form {
  id?: string
  title: string
  target?: number
  unit: string
  priv: boolean
}
const EMPTY: Form = { title: '', unit: '', priv: false }

export function WeekGoalsSheet({ week, onClose }: { week: DayKey; onClose: () => void }) {
  const weekGoals = useStore((s) => s.data.weekGoals)
  const goals = useMemo(() => goalsOfWeek({ weekGoals }, week), [weekGoals, week])
  const add = useStore((s) => s.addWeekGoals)
  const updateGoal = useStore((s) => s.updateWeekGoal)
  const del = useStore((s) => s.deleteWeekGoal)
  const say = useUi((s) => s.say)
  const [f, setF] = useState<Form>(EMPTY)
  const ok = !!f.title.trim()
  const save = () => {
    if (!ok) return
    const now = nowWithOffset()
    const target = f.target && f.target > 0 ? f.target : undefined
    const x = { title: f.title.trim(), target, unit: target ? f.unit.trim() || undefined : undefined, private: f.priv || undefined }
    if (f.id) updateGoal(f.id, x, now)
    else add(week, [x], now)
    setF({ ...EMPTY, priv: f.priv })
  }
  return (
    <Sheet title="Цели на неделю" onClose={onClose}>
      <div className="stack">
        <p className="small muted wk-note">
          <b>{weekLabel(week)}.</b> Лучше действия, а не метрики: «20 постов», «100 сообщений лидам» — их ты контролируешь.{' '}
          <Help title="Цели недели" text={['Сколько целей — решаешь ты. Можно одну, можно десять.', 'Число и единица — по желанию: тогда на «Сегодня» будет счётчик −/+. Цель без числа просто отмечается галочкой.', 'В воскресенье — «Итог недели»: план / факт, цифры, инсайты, провал и план на следующую.']} />
        </p>
        {goals.length > 0 && (
          <ul className="wk-edit-list">
            {goals.map((g) => (
              <li key={g.id} className={f.id === g.id ? 'on' : ''}>
                <button className="grow wk-edit-main" onClick={() => setF({ id: g.id, title: g.title, target: g.target, unit: g.unit ?? '', priv: !!g.private })}>
                  <b>{g.title}</b>
                  <small>{[g.target ? amountText(g) : 'без числа', g.private ? 'только мне' : 'видно пати'].join(' · ')}</small>
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Удалить: ${g.title}`}
                  onClick={() => {
                    del(g.id)
                    if (f.id === g.id) setF(EMPTY)
                    say(`Удалено: ${g.title}`, () => useStore.getState().update((d) => void (d.weekGoals ??= []).push(g)))
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="stack wk-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label={f.id ? 'Изменить цель' : goals.length ? 'Ещё цель' : 'Цель'}>
            <input className="input" value={f.title} maxLength={WEEK_LIMITS.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Посты в Твиттер, сообщения лидам" autoFocus={!goals.length} />
          </Field>
          <div className="grid-2">
            <Field label="Сколько · если есть">
              <NumInput value={f.target} onChange={(v) => setF({ ...f, target: v })} placeholder="число" min={0} />
            </Field>
            <Field label="Чего">
              <input className="input" value={f.unit} maxLength={WEEK_LIMITS.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="постов" disabled={!f.target} />
            </Field>
          </div>
          <div className="switch-row">
            <span className="grow">
              <b>Только мне</b>
              <small className="tiny muted" style={{ display: 'block' }}>
                Цель не увидит пати и её нет в итоге для группы
              </small>
            </span>
            <button type="button" className="switch" role="switch" aria-checked={f.priv} aria-label="Только мне" onClick={() => setF({ ...f, priv: !f.priv })} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            {f.id && (
              <button type="button" className="btn ghost" onClick={() => setF(EMPTY)}>
                Отмена
              </button>
            )}
            <button className="btn primary grow" type="submit" disabled={!ok}>
              {f.id ? 'Сохранить' : (
                <>
                  <Plus size={18} strokeWidth={3} aria-hidden /> Добавить цель
                </>
              )}
            </button>
          </div>
        </form>
        <p className="tiny muted wk-note">
          <LockOpen size={12} aria-hidden /> Цели видны пати — название, число и прогресс. Замок «только мне» прячет цель.
        </p>
      </div>
    </Sheet>
  )
}

// ---------- share ----------

/** «Поделиться»: the deck as one tall PNG and as text, via the share sheet or a download / copy */
export function ShareSheet({ view, onClose }: { view: RecapView; onClose: () => void }) {
  const say = useUi((s) => s.say)
  const [png, setPng] = useState<{ blob: Blob; url: string }>()
  const [err, setErr] = useState<string>()
  const text = useMemo(() => recapText(view), [view])
  useEffect(() => {
    let url = ''
    let live = true
    renderRecapPng(view).then(
      (blob) => {
        url = URL.createObjectURL(blob)
        if (live) setPng({ blob, url })
      },
      (e) => live && setErr(String(e?.message ?? e)),
    )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [view])
  const file = png ? new File([png.blob], `itog-${view.week}.png`, { type: 'image/png' }) : undefined
  const canFiles = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const download = () => {
    if (!png) return
    const a = document.createElement('a')
    a.href = png.url
    a.download = `itog-${view.week}.png`
    a.click()
    say('Картинка сохранена')
  }
  const copyText = () =>
    navigator.clipboard?.writeText(text).then(
      () => say('Текст итога скопирован'),
      () => say('Не получилось скопировать'),
    ) ?? say('Не получилось скопировать')
  return (
    <Sheet title="Поделиться итогом" onClose={onClose}>
      <div className="stack">
        <p className="small muted">Ровно то, что на слайдах. Цели «только мне» сюда не попадают.</p>
        <div className="wk-png">{png ? <img src={png.url} alt="Итог недели картинкой" /> : <span className="muted small">{err ?? 'Рисую картинку…'}</span>}</div>
        <div className="grid-2">
          <button
            className="btn primary"
            disabled={!png}
            onClick={() => (canFiles ? navigator.share({ files: [file!], text: `Итог недели · ${weekLabel(view.week)}` }).catch(() => undefined) : download())}
          >
            {canFiles ? <Share2 size={18} aria-hidden /> : <Download size={18} aria-hidden />} {canFiles ? 'Картинкой' : 'Скачать PNG'}
          </button>
          <button className="btn" onClick={() => (typeof navigator.share === 'function' ? navigator.share({ text }).catch(() => undefined) : copyText())}>
            <Share2 size={18} aria-hidden /> Текстом
          </button>
        </div>
        <button className="btn ghost sm" onClick={copyText}>
          <Copy size={16} aria-hidden /> Скопировать текст
        </button>
      </div>
    </Sheet>
  )
}

// ---------- «Скопировать для ИИ» ----------

export function copyPrompt(prompt: string, say: (t: string) => void) {
  const ok = () => say('Скопировано. Вставь в ChatGPT или Claude')
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(prompt).then(ok, () => say('Не получилось скопировать — выдели текст вручную'))
  else say('Не получилось скопировать — выдели текст вручную')
}

/** Copy a ready prompt, paste the answer back, preview what was read and apply it to the week */
export function AiSheet({ week, view, onClose }: { week: DayKey; view: RecapView; onClose: () => void }) {
  const say = useUi((s) => s.say)
  const nick = useStore((s) => s.data.profile?.nick)
  const add = useStore((s) => s.addWeekGoals)
  const setRecap = useStore((s) => s.setRecap)
  const days = useStore((s) => s.data.days)
  const today = gameDayOf(useNow())
  // the OWN prompt adds the private day notes (score, why, diary); the party one never does
  const prompt = useMemo(() => recapPrompt([view], { notes: weekDayNotes({ days }, week, today) }), [view, days, week, today])
  const [answer, setAnswer] = useState('')
  const parsed = useMemo(() => parseAiAnswer(answer), [answer])
  const goals = useMemo(() => goalsFor(parsed, nick), [parsed, nick])
  const [off, setOff] = useState<Set<number>>(new Set())
  useEffect(() => setOff(new Set()), [answer])
  const next = nextWeekKey(week)
  const picked = goals.filter((_, i) => !off.has(i))
  const found = !!parsed.summary || goals.length > 0
  return (
    <Sheet title="Скопировать для ИИ" onClose={onClose}>
      <div className="stack">
        <ol className="wk-steps small">
          <li>Скопируй запрос — в нём только то, что на слайдах.</li>
          <li>Вставь в ChatGPT или Claude, скопируй ответ.</li>
          <li>Вставь ответ сюда: вывод и цели появятся ниже.</li>
        </ol>
        <button className="btn primary block" onClick={() => copyPrompt(prompt, say)}>
          <Copy size={18} aria-hidden /> Скопировать запрос
        </button>
        <details className="later">
          <summary>Что уйдёт в запрос</summary>
          <pre className="wk-prompt">{prompt}</pre>
        </details>
        <Field label="Вставить ответ ИИ">
          <textarea className="textarea wk-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={'ВЫВОД: …\nЦЕЛЬ: Посты в Твиттер | 20 постов\nЦЕЛЬ: …'} />
        </Field>
        {!answer && typeof navigator.clipboard?.readText === 'function' && (
          <button className="btn ghost sm" onClick={() => navigator.clipboard.readText().then(setAnswer, () => say('Вставь ответ вручную'))}>
            <ClipboardPaste size={16} aria-hidden /> Вставить из буфера
          </button>
        )}
        {answer && !found && <p className="small muted">Не нашёл строк «ВЫВОД:» и «ЦЕЛЬ:». Попроси ИИ ответить строго в формате из запроса.</p>}
        {found && (
          <section className="panel tight stack wk-preview" aria-label="Что прочитал">
            {parsed.summary && (
              <div>
                <span className="tiny muted">Вывод недели</span>
                <p className="small">{parsed.summary}</p>
              </div>
            )}
            {goals.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="tiny muted">Цели на {weekLabel(next)} · сними лишние</span>
                {goals.map((g, i) => (
                  <label key={`${g.title}-${i}`} className="wk-pick">
                    <input
                      type="checkbox"
                      checked={!off.has(i)}
                      onChange={() => {
                        const s = new Set(off)
                        if (s.has(i)) s.delete(i)
                        else s.add(i)
                        setOff(s)
                      }}
                    />
                    <span className="grow">{g.title}</span>
                    {g.target ? <span className="num tiny">{goalAmount(g.target, g.unit)}</span> : null}
                  </label>
                ))}
              </div>
            )}
            <button
              className="btn primary block"
              onClick={() => {
                const now = nowWithOffset()
                if (parsed.summary) setRecap(week, { aiSummary: parsed.summary }, now)
                const n = picked.length ? add(next, picked, now) : 0
                say([parsed.summary ? 'Вывод сохранён' : '', n ? `${n} ${n === 1 ? 'цель' : n < 5 ? 'цели' : 'целей'} на следующую неделю` : ''].filter(Boolean).join(' · '))
                onClose()
              }}
            >
              <Check size={18} aria-hidden /> Применить
            </button>
          </section>
        )}
      </div>
    </Sheet>
  )
}

// ---------- a read-only итог (party) ----------

function PubGoalRow({ g }: { g: PubGoal }) {
  const f = goalFact({ done: !!g.d, target: g.n, progress: g.p })
  return (
    <li className={`wk-pub-goal ${f}`}>
      <span className="wk-mark" aria-label={f === 'done' ? 'сделано' : f === 'partial' ? 'частично' : 'не сделано'}>
        {f === 'done' ? <Check size={13} strokeWidth={3.5} /> : f === 'none' ? <X size={12} strokeWidth={3.5} /> : null}
      </span>
      <span className="grow">{g.t}</span>
      {g.n ? <span className="num tiny">{`${g.p ?? 0}/${goalAmount(g.n, g.u)}`}</span> : null}
    </li>
  )
}

export function PubGoals({ goals, max }: { goals: PubGoal[]; max?: number }) {
  const list = max ? goals.slice(0, max) : goals
  return (
    <ul className="wk-pub-goals">
      {list.map((g, i) => (
        <PubGoalRow key={`${g.t}-${i}`} g={g} />
      ))}
      {max && goals.length > max && <li className="tiny muted">ещё {goals.length - max}</li>}
    </ul>
  )
}

export function RecapSummary({ v }: { v: RecapView }) {
  const t = goalsTally(v.goals.map((g) => ({ done: !!g.d, target: g.n, progress: g.p })))
  return (
    <div className="stack wk-summary">
      {v.ai && <AiSummaryLine text={v.ai} label="Вывод недели" />}
      <section>
        <h3>Цели · {v.goals.length ? `${t.done} из ${t.total}` : 'не ставил'}</h3>
        <PubGoals goals={v.goals} />
      </section>
      {v.num && (
        <section>
          <h3>Цифры</h3>
          <p className="small">
            Дни выполнены на <b className="num">{v.num.pct}%</b> · {v.num.elo !== undefined ? 'Эло' : 'XP'} <b className="num">{v.num.elo !== undefined ? `${v.num.elo > 0 ? '+' : ''}${v.num.elo}` : v.num.xp}</b> · честность <b className="num">{v.num.streak}</b>
            {v.num.money !== undefined ? <> · {formatRub(v.num.money)}</> : null}
          </p>
          {v.num.quests.length > 0 && <p className="tiny muted">{v.num.quests.map((q) => `${q.t}: ${q.s ? `${q.s}${q.u ? ` ${q.u}` : ''}` : `${q.n} дн`}`).join(' · ')}</p>}
        </section>
      )}
      {v.insights.length > 0 && (
        <section>
          <h3>Лучшие инсайты</h3>
          <ol className="wk-ol small">
            {v.insights.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}
      {v.fails.length > 0 && (
        <section>
          <h3>Провал и почему</h3>
          {v.fails.map((f, i) => (
            <p key={i} className="small">
              <b>{f.what || 'Провал'}</b>
              {f.why ? <span className="muted"> → {f.why}</span> : null}
            </p>
          ))}
        </section>
      )}
      {v.next.length > 0 && (
        <section>
          <h3>План на следующую неделю</h3>
          <ul className="wk-ol small">
            {v.next.map((p, i) => (
              <li key={i}>
                {p.title}
                {p.target ? <span className="muted"> — {goalAmount(p.target, p.unit)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Current own numbers for the deck (live) */
export function useWeekFigures(monday: DayKey): WeekFigures {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  return useMemo(() => weekFigures(data, game, monday, today), [data, game, monday, today])
}

