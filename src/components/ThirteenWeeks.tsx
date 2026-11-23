/**
 * «13 недель»: the first screen of «Путь». Countdown, the 91-day grid (+ the final week), the week's
 * execution score with 13 bars and the won-weeks streak, arc totals and «Цели на 13 недель» with their
 * weekly tactics. All numbers come from engine/twelveWeeks.ts.
 */
import { useMemo, useState } from 'react'
import { Check, ChevronRight, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  ARC_LIMITS,
  BATTLE_WEEKS,
  CONQUEROR,
  RU_WEEKDAYS,
  WEEK_SHARE,
  WEEK_WIN,
  arcGoalsOf,
  arcGrid,
  arcPos,
  arcScores,
  arcTotals,
  formatRub,
  gameDayOf,
  goalAmount,
  goalPct,
  isGoalDone,
  plural,
  tacticWeeks,
  uid,
  weekDaysLeft,
  weekStartOf,
  wonStreak,
} from '../engine'
import type { ArcGoal, ArcTactic, WeekScore } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Px } from '../pixel/Pixel'
import { Field, Help, NumInput, Sheet } from './ui'
import { StreakCard } from './Streak'
import './thirteen.css'

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
export const pctOf = (s: number | null) => (s === null ? '—' : `${Math.round(s * 100)}%`)
const WIN = Math.round(WEEK_WIN * 100)

export function ThirteenWeeks() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  const pos = arcPos(today)
  const scores = useMemo(() => arcScores(data, game, today), [data, game, today])
  const totals = arcTotals(data, game, today, scores)
  const ws = wonStreak(scores)
  const cur = pos.phase === 'battle' ? scores[pos.week - 1] : undefined

  return (
    <section id="weeks13" className="w13 stack-lg" aria-label="13 недель">
      <StreakCard />
      <Countdown pos={pos} today={today} totals={totals} />
      <ArcGridCard scores={scores} today={today} />
      <div className="w13-cols">
        <ScoreCard cur={cur} scores={scores} ws={ws} />
        <TotalsCard t={totals} />
      </div>
      <ArcGoalsCard />
    </section>
  )
}

// ---------- countdown ----------

function Countdown({ pos, today, totals }: { pos: ReturnType<typeof arcPos>; today: string; totals: ReturnType<typeof arcTotals> }) {
  const help = (
    <Help
      title="13 недель"
      text={[
        'Арка — это 13 боевых недель (91 день, до 21 февраля) и финальная 14-я: итоги, замеры, «Покоритель зимы».',
        `Неделя = месяц: каждая — ${WEEK_SHARE}% всей арки. Год у обычных людей, неделя у тебя.`,
        `Неделя выиграна, если выполнено ≥ ${WIN}% целевых действий: главные квесты дней (мини = половина) и цели недели.`,
      ]}
    />
  )
  if (pos.phase === 'warmup')
    return (
      <div className="w13-hero">
        <span className="w13-ear">13 недель {help}</span>
        <div className="w13-big">
          До старта <b className="num">{pos.untilStart}</b> {plural(pos.untilStart, 'день', 'дня', 'дней')}
        </div>
        <p className="small muted">23 ноября — неделя 1. 13 недель по 7 дней, каждая — {WEEK_SHARE}% арки. Поставь цели на 13 недель ниже.</p>
      </div>
    )
  if (pos.phase === 'final' || pos.phase === 'after') {
    const final = pos.phase === 'final'
    return (
      <div className="w13-hero final">
        <span className="w13-ear">13 недель {help}</span>
        <div className="w13-big">{final ? 'Финальная неделя' : 'Арка пройдена'}</div>
        <p className="small">
          Выиграно недель: <b className="num">{totals.weeksWon}</b> из {BATTLE_WEEKS} · закрыто дней <b className="num">{totals.closedDays}</b> · сделано действий <b className="num">{fmtNum(totals.done)}</b>
        </p>
        {final && <p className="small muted">Итоги, финальные замеры и «Покоритель зимы» — до 28 февраля.</p>}
        <a className="btn primary block" href="#/finale">
          <Px name="star" size={20} /> {final ? 'Финал и замеры' : 'Итоги арки'}
        </a>
      </div>
    )
  }
  const left = weekDaysLeft(today)
  return (
    <div className="w13-hero">
      <span className="w13-ear">13 недель {help}</span>
      <div className="w13-big">
        Неделя <b className="num">{pos.week}</b> из {BATTLE_WEEKS}
      </div>
      <p className="w13-sub num">
        день {pos.day} из 91 · {pos.daysLeft ? `осталось ${pos.daysLeft} ${plural(pos.daysLeft, 'день', 'дня', 'дней')}` : 'последний день'}
      </p>
      <div className="w13-track" role="progressbar" aria-label="Пройдено арки" aria-valuemin={0} aria-valuemax={91} aria-valuenow={pos.day}>
        <i style={{ width: `${pos.progress * 100}%` }} />
        {Array.from({ length: BATTLE_WEEKS - 1 }, (_, i) => (
          <span key={i} className="w13-tick" style={{ left: `${((i + 1) / BATTLE_WEEKS) * 100}%` }} />
        ))}
      </div>
      <p className="w13-share">
        Эта неделя — <b>{WEEK_SHARE}%</b> всей арки. {left ? `До конца недели ${left} ${plural(left, 'день', 'дня', 'дней')}.` : 'Сегодня последний день недели.'}
      </p>
    </div>
  )
}

// ---------- grid ----------

function ArcGridCard({ scores, today }: { scores: WeekScore[]; today: string }) {
  const game = useGame()
  const grid = arcGrid(game, today)
  const row = (w: (typeof grid)[number], label: string) => {
    const s = scores[w.week - 1]
    return (
      <div key={w.week} className={`w13-row${s.current ? ' cur' : ''}`}>
        <span className="w13-lab">{label}</span>
        {w.days.map((c) => (
          <span key={c.day} className={`w13-cell ${c.state}${c.day === today ? ' today' : ''}`} title={c.day} />
        ))}
        <span className={`w13-pct num${s.won ? ' won' : s.ended && s.score !== null ? ' lost' : ''}`}>{s.ended || s.current ? (s.won ? `${pctOf(s.score)}✓` : pctOf(s.score)) : ''}</span>
      </div>
    )
  }
  return (
    <div className="panel w13-grid-card">
      <div className="w13-row head" aria-hidden>
        <span className="w13-lab" />
        {RU_WEEKDAYS.map((d) => (
          <span key={d} className="w13-wd">
            {d}
          </span>
        ))}
        <span className="w13-pct" />
      </div>
      <div className="w13-grid" role="img" aria-label="91 день арки по неделям">
        {grid.slice(0, BATTLE_WEEKS).map((w) => row(w, `Н${w.week}`))}
      </div>
      <div className="w13-grid final">{row(grid[BATTLE_WEEKS], 'Фин')}</div>
      <div className="w13-legend tiny">
        <span>
          <i className="w13-cell done" /> закрыт
        </span>
        <span>
          <i className="w13-cell frozen" /> заморозка
        </span>
        <span>
          <i className="w13-cell miss" /> провал
        </span>
        <span>
          <i className="w13-cell future" /> впереди
        </span>
      </div>
    </div>
  )
}

// ---------- score ----------

function ScoreCard({ cur, scores, ws }: { cur?: WeekScore; scores: WeekScore[]; ws: ReturnType<typeof wonStreak> }) {
  const battle = scores.slice(0, BATTLE_WEEKS)
  return (
    <div className="panel w13-score stack">
      <div className="section-title" style={{ margin: 0 }}>
        <h2>
          Счёт недели
          <Help
            title="Счёт недели"
            text={[
              'Счёт = сделанные целевые действия / запланированные.',
              'Целевые действия: главные квесты каждого дня (сделал — 1, мини — 0,5, пропуск — 0; дни до сегодня, дни в заморозке не считаются) и цели недели (выполнена — 1, цель с числом — по доле).',
              `${WIN}% и выше — неделя выиграна. Серия выигранных недель считается по закончившимся неделям: текущая её не ломает.`,
            ]}
          />
        </h2>
      </div>
      {cur && (() => {
        const pct = Math.round((cur.score ?? 0) * 100)
        const need = Math.max(0, Math.ceil(WEEK_WIN * cur.planned - cur.done - 1e-9))
        return (
          <div className="stack" style={{ gap: 6 }}>
            <p className="w13-plain">
              На этой неделе сделано <b className="num">{fmtNum(cur.done)}</b> из <b className="num">{cur.planned}</b> {plural(cur.planned, 'целевого действия', 'целевых действий', 'целевых действий')} — <b className={`num ${cur.onTrack ? 'ok' : ''}`}>{pct}%</b>.{' '}
              {cur.onTrack ? `Это уже победа недели (нужно ${WIN}%) ✓` : `Для победы недели нужно ${WIN}%: ещё ${fmtNum(need)}.`}
            </p>
            <div className="w13-meter" role="progressbar" aria-label="Счёт недели" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i className={cur.onTrack ? 'ok' : ''} style={{ width: `${Math.min(1, cur.score ?? 0) * 100}%` }} />
              <span className="w13-win" style={{ left: `${WIN}%` }} />
            </div>
            <p className="tiny muted">
              Из них главные квесты: {fmtNum(cur.mains.done)} из {cur.mains.planned} · цели недели: {fmtNum(cur.goals.done)} из {cur.goals.planned}
            </p>
          </div>
        )
      })()}
      <div className="w13-bars-head small">
        <b>Все 13 недель</b>
        <span className="muted">
          выиграно {ws.won} из {ws.passed} {plural(ws.passed, 'прошедшей', 'прошедших', 'прошедших')}
        </span>
      </div>
      <div className="w13-bars" role="img" aria-label={`Счёт по неделям. Выиграно недель: ${ws.won} из ${ws.passed}`}>
        <span className="w13-bars-line" style={{ bottom: `calc(${WIN}% * 0.72 + 32px)` }}>
          <em>победа {WIN}%</em>
        </span>
        {battle.map((s) => (
          <span key={s.week} className={`w13-bar${s.won ? ' won' : ''}${s.current ? ' cur' : ''}${s.ended && !s.won ? ' lost' : ''}`} title={`Неделя ${s.week}: ${pctOf(s.score)}`}>
            <span className="w13-bar-pct num">{(s.ended || s.current) && s.score !== null ? Math.round(s.score * 100) : ''}</span>
            <span className="w13-bar-track">
              <i style={{ height: `${Math.min(1, s.score ?? 0) * 100}%` }} />
            </span>
            <small className="num">Н{s.week}</small>
          </span>
        ))}
      </div>
      <p className="tiny muted">Столбик и число над ним — сколько % сделано за неделю. Зелёный — неделя выиграна, красный — нет, жёлтый — идёт сейчас.</p>
      <p className="w13-plain small">
        Выиграно недель подряд: <b className="num">{ws.run}</b> · рекорд {ws.best}
      </p>
    </div>
  )
}

// ---------- totals ----------

function TotalsCard({ t }: { t: ReturnType<typeof arcTotals> }) {
  const conq = Math.min(1, t.conqueror.closed / t.conqueror.need)
  const pct = t.planned ? Math.round((t.done / t.planned) * 100) : 0
  return (
    <div className="panel w13-totals stack">
      <div className="section-title" style={{ margin: 0 }}>
        <h2>Итог арки</h2>
        <span className="small muted">на сегодня</span>
      </div>
      <ul className="w13-facts">
        <li>
          <b className="num">{fmtNum(t.done)}</b>
          <span>
            из {t.planned} целевых действий сделано{t.planned ? ` — ${pct}%` : ''}
            <small>главные квесты дней и цели недель</small>
          </span>
        </li>
        <li className="bad">
          <b className="num">{t.wasted}</b>
          <span>
            проёбано
            <small>главные квесты, которые не сделал, и невыполненные цели прошедших недель</small>
          </span>
        </li>
        <li>
          <b className="num">{t.closedDays}</b>
          <span>
            {plural(t.closedDays, 'день выполнен', 'дня выполнено', 'дней выполнено')} полностью
            <small>все главные квесты сделаны · лучшая серия {t.bestDayStreak}</small>
          </span>
        </li>
        <li>
          <b className="num">{t.weeksWon}</b>
          <span>
            {plural(t.weeksWon, 'неделя выиграна', 'недели выиграно', 'недель выиграно')} из {t.weeksPassed} прошедших
            <small>победа — {WIN}% целевых действий за неделю</small>
          </span>
        </li>
        {t.money && (
          <li className="gold">
            <b className="num">{formatRub(t.money.rub)}</b>
            <span>
              заработано в арке
              <small>боссов месяца убито: {t.money.kills}</small>
            </span>
          </li>
        )}
      </ul>
      <div className="w13-conq">
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small">
            <b>{CONQUEROR.title}</b>: {t.conqueror.closed} из {t.conqueror.need} выполненных дней
          </span>
        </span>
        <span className="w13-meter thin">
          <i className="gold" style={{ width: `${conq * 100}%` }} />
        </span>
      </div>
    </div>
  )
}

// ---------- arc goals ----------

function ArcGoalsCard() {
  const arcGoals = useStore((s) => s.data.arcGoals)
  const weekGoals = useStore((s) => s.data.weekGoals)
  const today = gameDayOf(useNow())
  const goals = useMemo(() => arcGoalsOf({ arcGoals }), [arcGoals])
  const [edit, setEdit] = useState<ArcGoal | 'new' | null>(null)
  const monday = weekStartOf(today)
  return (
    <section className="stack">
      <div className="section-title">
        <h2>
          Цели на 13 недель
          <Help
            title="Цели на 13 недель"
            text={[
              `1–${ARC_LIMITS.goals} большие цели на арку: «$10k в месяц», «−8 кг». Под каждой — тактики: что делаешь каждую неделю.`,
              'Каждый понедельник тактики сами становятся целями недели. Копию недели можно менять и удалять — она не вернётся.',
              'Сами цели арки видишь только ты.',
            ]}
          />
        </h2>
        {goals.length > 0 && (
          <span className="num small muted">
            {goals.length}/{ARC_LIMITS.goals}
          </span>
        )}
      </div>
      {goals.length === 0 && (
        <div className="empty w13-empty">
          <Px name="fir" size={40} />
          <p>Одна большая цель на арку и 2–3 действия в неделю под неё. Остальное сделают понедельники.</p>
          <button className="btn primary" onClick={() => setEdit('new')}>
            <Plus size={18} strokeWidth={3} aria-hidden /> Поставить цель
          </button>
        </div>
      )}
      <div className="w13-goals">
        {goals.map((g) => {
          const tw = tacticWeeks({ weekGoals }, g, today)
          return (
            <div key={g.id} className="panel w13-goal">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <b className="w13-goal-title">
                    {g.title}
                    {g.private && <Lock size={13} className="wk-lock" aria-label="только мне" />}
                  </b>
                  <small className="tiny muted num">
                    Тактики выполнены: {tw.done} из {tw.total} {plural(tw.total, 'недели', 'недель', 'недель')}
                  </small>
                </div>
                <button className="icon-btn" aria-label={`Изменить: ${g.title}`} onClick={() => setEdit(g)}>
                  <Pencil size={17} />
                </button>
              </div>
              {g.tactics.length ? (
                <ul className="w13-tactics">
                  {g.tactics.map((t) => {
                    const copy = (weekGoals ?? []).find((w) => w.tacticId === t.id && w.week === monday)
                    const done = !!copy && isGoalDone(copy)
                    return (
                      <li key={t.id} className={done ? 'done' : ''}>
                        <span className="w13-tac-dot">{done ? <Check size={13} strokeWidth={3.5} /> : null}</span>
                        <span className="grow">
                          {t.title}
                          {t.target ? <small className="muted"> — {goalAmount(t.target, t.unit)}</small> : null}
                        </span>
                        {copy && copy.target ? (
                          <span className="num tiny w13-tac-prog">
                            {fmtNum(copy.progress ?? 0)}/{fmtNum(copy.target)}
                            <span className="wk-bar">
                              <i style={{ width: `${goalPct(copy) * 100}%` }} />
                            </span>
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <button className="tiny muted w13-link" onClick={() => setEdit(g)}>
                  Добавь тактику: что делаешь каждую неделю →
                </button>
              )}
            </div>
          )
        })}
      </div>
      {goals.length > 0 && goals.length < ARC_LIMITS.goals && (
        <button className="btn ghost block" onClick={() => setEdit('new')}>
          <Plus size={18} strokeWidth={3} aria-hidden /> Ещё цель на арку
        </button>
      )}
      {goals.length > 0 && (
        <a className="tiny muted w13-link" href="#/today">
          Тактики этой недели — в «Целях на неделю» на «Сегодня» →
        </a>
      )}
      {edit && <ArcGoalSheet goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </section>
  )
}

interface TacForm {
  id: string
  title: string
  target?: number
  unit: string
  made?: string[]
  createdAt: number
}

function ArcGoalSheet({ goal, onClose }: { goal?: ArcGoal; onClose: () => void }) {
  const put = useStore((s) => s.putArcGoal)
  const del = useStore((s) => s.deleteArcGoal)
  const say = useUi((s) => s.say)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [priv, setPriv] = useState(!!goal?.private)
  const [tacs, setTacs] = useState<TacForm[]>(() => (goal?.tactics ?? []).map((t) => ({ ...t, unit: t.unit ?? '' })))
  const blank = (): TacForm => ({ id: uid(), title: '', unit: '', createdAt: Date.now() })
  const [draft, setDraft] = useState<TacForm>(blank)
  const ok = !!title.trim()
  const patch = (id: string, p: Partial<TacForm>) => setTacs(tacs.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const addDraft = () => {
    if (!draft.title.trim() || tacs.length >= ARC_LIMITS.tactics) return
    setTacs([...tacs, draft])
    setDraft(blank())
  }
  const save = () => {
    if (!ok) return
    const all = draft.title.trim() && tacs.length < ARC_LIMITS.tactics ? [...tacs, draft] : tacs
    const now = nowWithOffset()
    const tactics: ArcTactic[] = all
      .filter((t) => t.title.trim())
      .map((t) => ({ id: t.id, title: t.title.trim(), createdAt: t.createdAt, ...(t.target ? { target: t.target, ...(t.unit.trim() ? { unit: t.unit.trim() } : {}) } : {}), ...(t.made?.length ? { made: t.made } : {}) }))
    const g: ArcGoal = { id: goal?.id ?? uid(), title: title.trim(), tactics, ...(priv ? { private: true } : {}), order: goal?.order ?? 0, createdAt: goal?.createdAt ?? now.getTime(), updatedAt: now.getTime() }
    if (put(g, now)) {
      say(goal ? 'Цель сохранена' : 'Цель на 13 недель поставлена')
      onClose()
    } else say(`Не больше ${ARC_LIMITS.goals} целей на арку`)
  }
  return (
    <Sheet title={goal ? 'Цель на 13 недель' : 'Новая цель на 13 недель'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Цель арки">
          <input className="input" value={title} maxLength={ARC_LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="$10k в месяц" autoFocus={!goal} />
        </Field>
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">Тактики — что делаешь каждую неделю. Каждый понедельник они станут целями недели.</span>
          {tacs.map((t) => (
            <div key={t.id} className="w13-tac-edit">
              <input className="input" value={t.title} maxLength={ARC_LIMITS.title} onChange={(e) => patch(t.id, { title: e.target.value })} aria-label="Тактика" />
              <NumInput value={t.target} onChange={(v) => patch(t.id, { target: v })} placeholder="число" />
              <input className="input" value={t.unit} maxLength={ARC_LIMITS.unit} onChange={(e) => patch(t.id, { unit: e.target.value })} placeholder="чего" disabled={!t.target} aria-label="Единица" />
              <button type="button" className="icon-btn" aria-label={`Убрать: ${t.title}`} onClick={() => setTacs(tacs.filter((x) => x.id !== t.id))}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          {tacs.length < ARC_LIMITS.tactics && (
            <div className="w13-tac-edit new">
              <input
                className="input"
                value={draft.title}
                maxLength={ARC_LIMITS.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDraft()
                  }
                }}
                placeholder={tacs.length ? 'Ещё тактика' : 'Сообщения лидам'}
                aria-label="Новая тактика"
              />
              <NumInput value={draft.target} onChange={(v) => setDraft({ ...draft, target: v })} placeholder="100" />
              <input className="input" value={draft.unit} maxLength={ARC_LIMITS.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="сообщ." disabled={!draft.target} aria-label="Единица" />
              <button type="button" className="icon-btn add" aria-label="Добавить тактику" onClick={addDraft} disabled={!draft.title.trim()}>
                <Plus size={18} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
        <div className="switch-row">
          <span className="grow">
            <b>Тактики — только мне</b>
            <small className="tiny muted" style={{ display: 'block' }}>
              Цели недели из тактик не увидит пати. Саму цель арки и так видишь только ты.
            </small>
          </span>
          <button type="button" className="switch" role="switch" aria-checked={priv} aria-label="Тактики только мне" onClick={() => setPriv(!priv)} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          {goal && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                del(goal.id)
                say(`Удалено: ${goal.title}`, () => useStore.getState().update((d) => void (d.arcGoals ??= []).push(goal)))
                onClose()
              }}
            >
              <Trash2 size={17} /> Удалить
            </button>
          )}
          <button className="btn primary grow" type="submit" disabled={!ok}>
            {goal ? 'Сохранить' : 'Поставить цель'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/** One line for the «Серия» card on «Сегодня» */
export function ArcLine() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  const pos = arcPos(today)
  const score = useMemo(() => (pos.phase === 'battle' ? arcScores(data, game, today)[pos.week - 1] : undefined), [data, game, today, pos.phase, pos.week])
  if (pos.phase === 'after') return null
  const text =
    pos.phase === 'warmup'
      ? `13 недель: старт через ${pos.untilStart} ${plural(pos.untilStart, 'день', 'дня', 'дней')}`
      : pos.phase === 'final'
        ? 'Финальная неделя · итоги арки'
        : `Неделя ${pos.week}/${BATTLE_WEEKS} · осталось ${pos.daysLeft} дн · неделя ${pctOf(score?.score ?? null)}`
  return (
    <a className={`streak-arc${score?.onTrack ? ' ok' : ''}`} href="#/deal">
      <Px name="trophy" size={20} />
      <span className="grow num">{text}</span>
      <ChevronRight size={16} aria-hidden />
    </a>
  )
}
