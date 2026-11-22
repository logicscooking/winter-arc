import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Check, ChevronRight, Minus, Play, Plus } from 'lucide-react'
import { AREAS, MORNING, blockAt, formatHM, gameDayOf, journalAnswered, journalStatus, planBlocksOf, questXp, wakeTargetFor } from '../engine'
import type { Area, CalEvent, DayKey, GameState } from '../engine'
import { useStore } from '../store/store'
import { go, useNow, useRoute } from '../store/hooks'
import { Px } from '../pixel/Pixel'
import { QuestRow } from '../components/QuestRow'
import { Help } from '../components/ui'
import { DumpSheet, EventSheet, JournalSheet, useToggleEvent } from '../components/AreaSheets'
import { buildProgram, programMinutes } from '../morning/program'
import { BLOCK_COLOR_VAR, ItemRow, PickBlockSheet, TransitionRow, blockIcon, fmtDur, useCheck } from './PlanDay'
import { todaySections, type DayProgress, type TodayMode, type TodayRow } from './todayItems'
import type { PlanItem } from './planItems'
import './plan.css'

const R = 38
const CIRC = 2 * Math.PI * R
/** gap between area segments of the ring, in ring length units */
const GAP = 3

export const AREA_COLOR: Record<Area, string> = {
  health: 'var(--st-body)',
  money: 'var(--st-deal)',
  growth: 'var(--st-mind)',
  misc: 'var(--frost)',
}

// ---------- «Сферы | Время»: remembered on this device ----------

const MODE_KEY = 'wa-today-mode'
function readMode(): TodayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'time' ? 'time' : 'areas'
  } catch {
    return 'areas'
  }
}
function useTodayMode(): [TodayMode, (m: TodayMode) => void] {
  const [mode, setMode] = useState<TodayMode>(readMode)
  return [
    mode,
    (m) => {
      setMode(m)
      try {
        localStorage.setItem(MODE_KEY, m)
      } catch {
        /* private mode: the choice lives until reload */
      }
    },
  ]
}

/** Day progress: one ring split by areas (rows + warm-up + переходы + events of today), a legend per area */
export function DayRingCard({ progress }: { progress: DayProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const full = progress.total > 0 && progress.done === progress.total
  const parts = AREAS.filter((a) => progress.areas[a.id][1] > 0)
  const gap = parts.length > 1 ? GAP : 0
  const unit = progress.total ? (CIRC - gap * parts.length) / progress.total : 0
  let start = 0
  const segs = parts.map((a) => {
    const [d, t] = progress.areas[a.id]
    const seg = { id: a.id, start, len: t * unit, fill: d * unit }
    start += t * unit + gap
    return seg
  })
  return (
    <section className="td-ring" aria-label={`Прогресс дня: ${pct}%`}>
      <div className={`td-ring-dial${full ? ' full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Прогресс дня">
        <svg viewBox="0 0 100 100" aria-hidden>
          {segs.length === 0 && <circle className="track" cx="50" cy="50" r={R} />}
          {segs.map((s) => (
            <circle key={`t${s.id}`} className="track seg" cx="50" cy="50" r={R} strokeDasharray={`${s.len} ${CIRC}`} strokeDashoffset={-s.start} />
          ))}
          {segs.map((s) =>
            s.fill > 0 ? <circle key={`f${s.id}`} className="fill seg" cx="50" cy="50" r={R} style={{ stroke: full ? undefined : AREA_COLOR[s.id] }} strokeDasharray={`${s.fill} ${CIRC}`} strokeDashoffset={-s.start} /> : null,
          )}
        </svg>
        <b className="num">
          <span>
            {pct}
            <small>%</small>
          </span>
        </b>
      </div>
      <div className="td-ring-text">
        <b>
          {full ? 'День закрыт полностью' : `Сделано ${progress.done} из ${progress.total}`}
          <Help
            title="Прогресс дня"
            text={[
              'Кольцо — всё, что в списке дня, по сферам: квесты, дела, утренняя инвестиция, три перехода и сегодняшние события.',
              'Мини-версия считается сделанной. Пропущенный квест выпадает из общего числа. Будущие события и «Выброс мыслей» не считаются.',
            ]}
          />
        </b>
        <ul className="td-legend areas">
          {parts.map((a) => {
            const [d, t] = progress.areas[a.id]
            return (
              <li key={a.id}>
                <i style={{ background: AREA_COLOR[a.id] }} />
                {a.short}
                <span className="num">
                  {d}/{t}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** «Сегодня»: the day's list by areas («Сферы») or by plan blocks / parts of the day («Время») */
export function TodayBlocks({ game, locked }: { game: GameState; locked: boolean }) {
  const data = useStore((s) => s.data)
  const assignPlan = useStore((s) => s.assignPlan)
  const now = useNow()
  const today = gameDayOf(now)
  const route = useRoute()
  const [mode, setMode] = useTodayMode()
  const { sections } = useMemo(() => todaySections(data, today, mode), [data, today, mode])
  const blocks = planBlocksOf(data.days[today])
  const current = blockAt(blocks, now.getHours() * 60 + now.getMinutes())
  const wt = wakeTargetFor(data, today)
  const [pickFor, setPickFor] = useState<PlanItem | null>(null)
  const [sheet, setSheet] = useState<null | { kind: 'journal' } | { kind: 'dump' } | { kind: 'event'; event?: CalEvent }>(null)
  const check = useCheck(today, !locked, () => go('/plan'))
  const toggleEvent = useToggleEvent()

  // «#/today?journal=1» (from «План дня» or a quest tap elsewhere) opens the diary
  useEffect(() => {
    if (route.query.get('journal') !== '1') return
    setSheet({ kind: 'journal' })
    go('/today')
  }, [route])

  const row = (r: TodayRow) => {
    if (r.type === 'morning') return <MorningRow key={r.key} done={r.done} />
    if (r.type === 'slot') return <TransitionRow key={r.key} day={today} slot={r.slot!} isToday inList />
    if (r.type === 'event') return <EventRow key={r.key} ev={r.event!} label={r.label} onCheck={() => toggleEvent(r.event!)} onOpen={() => setSheet({ kind: 'event', event: r.event })} />
    if (r.type === 'dump') return <DumpRow key={r.key} done={r.done} onOpen={() => setSheet({ kind: 'dump' })} />
    const it = r.it!
    if (it.quest?.kind === 'journal' && it.plan) return <JournalRow key={r.key} day={today} xp={questXp(it.plan.role, it.plan.base, 'done')} onOpen={() => setSheet({ kind: 'journal' })} />
    if (it.kind === 'quest' && it.quest && it.plan && it.action !== 'open')
      return (
        <div id={`q-${it.id}`} key={it.key}>
          <QuestRow compact plan={it.plan} quest={it.quest} status={it.status} auto={!!it.auto} day={today} game={game} locked={locked} wakeTarget={wt} />
        </div>
      )
    return <ItemRow key={it.key} it={it} onCheck={check} onTap={() => setPickFor(it)} canCheck={!locked} badge />
  }

  return (
    <section className="stack" aria-label={mode === 'areas' ? 'Дела дня по сферам' : 'Дела дня по времени'}>
      <div className="section-title">
        <h2>
          <Px name="quests" size={24} /> Квесты
          <Help
            title="Как отмечать"
            text={[
              'Квадрат слева — выполнено. Тап по квесту — мини-версия или пропуск, по делу — в какой блок.',
              '«Сферы» — Здоровье, Деньги, Развитие и Разное (события, медитация, телефон, дневник). «Время» — по блокам плана или утро, день, вечер.',
              'Ошибся — внизу появится «Отменить».',
              'Пропустил главный — минус HP при закрытии дня.',
            ]}
          />
        </h2>
        <div className="seg-switch td-mode" role="group" aria-label="Как показать день">
          <button aria-pressed={mode === 'areas'} onClick={() => setMode('areas')}>
            Сферы
          </button>
          <button aria-pressed={mode === 'time'} onClick={() => setMode('time')}>
            Время
          </button>
        </div>
      </div>
      <div className="td-sections">
        {sections.map((s) => {
          const counted = s.rows.filter((r) => r.counts)
          const done = counted.filter((r) => r.done).length
          const total = counted.length
          const b = s.block
          const stripe = b ? BLOCK_COLOR_VAR[b.color ?? 'deal'] : s.area ? AREA_COLOR[s.area] : undefined
          return (
            <article key={s.id} className={`td-sec${stripe ? ' block' : ''}${b && current?.id === b.id ? ' now' : ''}`} style={stripe ? ({ '--bc': stripe } as CSSProperties) : undefined}>
              <header className="td-sec-head">
                <Px name={b ? blockIcon(b) : s.icon ?? 'star'} size={26} />
                <span className="grow">
                  <b>{s.title}</b>
                  {!b && !s.area && blocks.length > 0 && <small>вне блоков</small>}
                  {b && (
                    <small className="num">
                      {formatHM(b.start)}–{formatHM((b.start + b.dur) % 1440)} · {fmtDur(b.dur)}
                      {current?.id === b.id ? ' · сейчас' : ''}
                    </small>
                  )}
                </span>
                {total > 0 && <span className={`td-count${done >= total ? ' full' : ''}`}>{done}/{total}</span>}
              </header>
              {s.rows.length > 0 ? (
                <div className="td-sec-items">{s.rows.map(row)}</div>
              ) : s.area !== 'misc' ? (
                <button className="td-sec-empty link-btn" onClick={() => go('/plan')}>
                  Пусто — добавь дела в плане <ChevronRight size={14} aria-hidden />
                </button>
              ) : (
                <p className="td-sec-empty">Созвоны, встречи и всё на один раз — сюда.</p>
              )}
              {s.area === 'misc' && (
                <button className="pd-add td-add-event" onClick={() => setSheet({ kind: 'event' })}>
                  <Plus size={16} strokeWidth={3} aria-hidden /> Событие
                </button>
              )}
            </article>
          )
        })}
      </div>
      {mode === 'time' && (
        <a className="small link-btn td-plan-link" href="#/plan">
          {blocks.length ? 'Блоки дня' : 'Разбить день на блоки'} <ChevronRight size={14} aria-hidden />
        </a>
      )}
      {pickFor && (
        <PickBlockSheet
          item={pickFor}
          blocks={blocks}
          current={data.days[today]?.assign?.[pickFor.key]}
          onPick={(id) => {
            assignPlan(today, pickFor.key, id)
            setPickFor(null)
          }}
          onNew={() => {
            setPickFor(null)
            go('/plan')
          }}
          onClose={() => setPickFor(null)}
        />
      )}
      {sheet?.kind === 'journal' && <JournalSheet day={today} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'dump' && <DumpSheet day={today} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'event' && <EventSheet today={today} event={sheet.event} onClose={() => setSheet(null)} />}
    </section>
  )
}

// ---------- the day's own rows ----------

/** «Утренняя инвестиция» as a row of «Здоровье»: ▶ opens the warm-up, ✓ once finished today */
function MorningRow({ done }: { done: boolean }) {
  const final = useStore((s) => s.data.settings.morningFinal)
  const min = programMinutes(buildProgram(final ?? 'm'))
  return (
    <div className={`pd-item td-morning${done ? ' done' : ''}`}>
      <a className="pd-check open" href="#/morning" aria-label={done ? 'Утренняя инвестиция: сделано сегодня' : `Утренняя инвестиция, около ${min} минут: начать`}>
        <span>{done ? <Check size={14} strokeWidth={3} /> : <Play size={13} fill="currentColor" />}</span>
      </a>
      <a className="pd-item-main" href="#/morning">
        <Px name="sun" size={22} />
        <span className="grow">
          <span className="pd-item-title">Утренняя инвестиция</span>
          <small>{done ? `сделано · +${MORNING.shards} ❄` : `~${min} мин · зарядка с музыкой`}</small>
        </span>
        <span className={`qrow-badge num${done ? ' on' : ''}`}>+{MORNING.xp} XP</span>
      </a>
    </div>
  )
}

/** «Вечерний дневник»: the check shows the status (3 answers — done, 1–2 — mini); any tap opens the sheet */
function JournalRow({ day, xp, onOpen }: { day: DayKey; xp: number; onOpen: () => void }) {
  const n = useStore((s) => journalAnswered(s.data.days[day]))
  const status = journalStatus(n)
  return (
    <div className={`qrow ${status ?? ''}${status ? ' done' : ''}`} id="q-journal">
      <button className="pd-check" onClick={onOpen} aria-pressed={!!status} aria-label={`Вечерний дневник: ${n} из 5 ответов, открыть`}>
        <span>
          {status === 'done' && <Check size={15} strokeWidth={3.5} />}
          {status === 'mini' && <Minus size={15} strokeWidth={3.5} />}
        </span>
      </button>
      <button className="qrow-main" onClick={onOpen} aria-label="Вечерний дневник: открыть">
        <Px name="pen" size={24} />
        <span className="grow">
          <span className="pd-item-title">Вечерний дневник</span>
          <small>{n ? `${n}/5${status === 'mini' ? ` · ещё ${3 - n} до полного` : ' · закрыт'}` : '5 вопросов о дне'}</small>
        </span>
        <span className={`qrow-badge num${status ? ' on' : ''}`}>+{xp} XP</span>
      </button>
    </div>
  )
}

/** «Выброс мыслей · если есть вайб»: a bonus row, never in the ring */
function DumpRow({ done, onOpen }: { done: boolean; onOpen: () => void }) {
  return (
    <div className={`pd-item td-bonus${done ? ' done' : ''}`}>
      <button className="pd-check open" onClick={onOpen} aria-label="Выброс мыслей: открыть">
        <span>{done ? <Check size={14} strokeWidth={3} /> : <ChevronRight size={16} strokeWidth={3} />}</span>
      </button>
      <button className="pd-item-main" onClick={onOpen}>
        <Px name="speech" size={22} />
        <span className="grow">
          <span className="pd-item-title">Выброс мыслей</span>
          <small>{done ? 'записано · только для тебя' : 'если есть вайб'}</small>
        </span>
        <span className="qrow-badge num">бонус</span>
      </button>
    </div>
  )
}

/** An event of «Разное»: today's ones are checkable and count; upcoming ones show their day */
function EventRow({ ev, label, onCheck, onOpen }: { ev: CalEvent; label?: string; onCheck: () => void; onOpen: () => void }) {
  const done = !!ev.doneAt
  const upcoming = !!label
  return (
    <div className={`pd-item td-event${done ? ' done' : ''}${upcoming ? ' later' : ''}`}>
      {upcoming ? (
        <span className="td-event-day" aria-hidden>
          <Px name="clock" size={18} />
        </span>
      ) : (
        <button className="pd-check" onClick={onCheck} aria-pressed={done} aria-label={`${ev.title}: ${done ? 'снять отметку' : 'отметить'}`}>
          <span>{done && <Check size={14} strokeWidth={3} />}</span>
        </button>
      )}
      <button className="pd-item-main" onClick={onOpen} aria-label={`${ev.title}: изменить`}>
        {!upcoming && <Px name="clock" size={22} />}
        <span className="grow">
          <span className="pd-item-title">{ev.title}</span>
          {ev.note && <small>{ev.note}</small>}
        </span>
        <span className={`qrow-badge num td-when${upcoming ? ' later' : ''}`}>{[label, ev.time].filter(Boolean).join(' · ') || 'сегодня'}</span>
      </button>
    </div>
  )
}
