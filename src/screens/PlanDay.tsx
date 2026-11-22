import { useMemo, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, LayoutTemplate, Pencil, Plus } from 'lucide-react'
import {
  ARC_END,
  ARC_START,
  BLOCK_COLORS,
  GOAL_XP,
  PLAN_ICONS,
  PLAN_TEMPLATES,
  PLAN_TITLE_MAX,
  RU_MONTHS_GEN,
  RU_WEEKDAYS,
  TRANSITION,
  WORK_RULES,
  addDays,
  assignedBlock,
  blockAt,
  blockEnd,
  blocksOverlap,
  formatHM,
  gameDayOf,
  gameMin,
  lateWork,
  nextFreeStart,
  parseDay,
  parseHM,
  planBlocksOf,
  questReward,
  replayStartOf,
  sleepWindow,
  taskXp,
  templateBlocks,
  TRANSITION_SLOTS,
  eventsView,
  slotDue,
  transitionReps,
  transitionShort,
  transitionText,
  TRANSITION_MIN,
  uid,
  weekday,
  workMinutes, STAT_SPHERE } from '../engine'
import type { BlockColor, DayKey, DayLog, PlanBlock, PlanTemplate, TransitionSlot } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, reward, useFx, useGame, useNow, useRoute } from '../store/hooks'
import { useUi } from '../store/ui'
import { Px, STAT_SPRITE } from '../pixel/Pixel'
import { SPRITES, type SpriteName } from '../pixel/sprites'
import { PAL } from '../pixel/palette'
import { gridPaths } from '../pixel/render'
import { Help, NumInput, Sheet } from '../components/ui'
import { TimePicker } from '../components/TimePicker'
import { planItems, type PlanItem } from './planItems'
import { PlanTips } from './PlanTips'
import './plan.css'

// ---------- shared bits ----------

export const BLOCK_COLOR_VAR: Record<BlockColor, string> = {
  energy: 'var(--st-energy)',
  body: 'var(--st-body)',
  mind: 'var(--st-mind)',
  will: 'var(--st-will)',
  deal: 'var(--st-deal)',
  frost: 'var(--frost)',
  gold: 'var(--gold-mark)',
}
const COLOR_NAME: Record<BlockColor, string> = { mind: 'Разум', deal: 'Дело', body: 'Тело', energy: 'Энергия', will: 'Воля', frost: 'Лёд', gold: 'Золото' }
const DUR_CHIPS: [number, string][] = [
  [15, '15′'],
  [30, '30′'],
  [45, '45′'],
  [60, '1 ч'],
  [90, '1,5 ч'],
  [120, '2 ч'],
]
const NAME_PRESETS = ['Утро · фокус', 'Глубокая работа', 'Дела', 'Учёба', 'Спорт', 'Прогулка', 'Обед', 'Вечер']

const colorOf = (b: Pick<PlanBlock, 'color'>) => BLOCK_COLOR_VAR[b.color ?? 'deal']
export function blockIcon(b: Pick<PlanBlock, 'icon' | 'color'>): SpriteName {
  if (b.icon && b.icon in SPRITES) return b.icon as SpriteName
  const c = b.color ?? 'deal'
  return c === 'frost' ? 'snowflake' : c === 'gold' ? 'star' : STAT_SPRITE[c]
}

export function fmtDur(m: number): string {
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r} мин`
  return r ? `${h} ч ${r} мин` : `${h} ч`
}
const range = (b: Pick<PlanBlock, 'start' | 'dur'>) => `${formatHM(b.start)}–${formatHM(blockEnd(b))}`
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes()

// ---------- the ring ----------

const SIZE = 320
const C = SIZE / 2
const R = 128
const BAND = 30
const ang = (m: number) => (m / 1440) * Math.PI * 2 - Math.PI / 2
const pt = (m: number, r: number) => [C + Math.cos(ang(m)) * r, C + Math.sin(ang(m)) * r] as const

function arc(start: number, dur: number, r = R) {
  const d = Math.min(dur, 1439.9)
  const [x0, y0] = pt(start, r)
  const [x1, y1] = pt(start + d, r)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${d > 720 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** A sprite placed inside the ring SVG */
function SpriteAt({ name, x, y, size }: { name: SpriteName; x: number; y: number; size: number }) {
  const p = gridPaths([SPRITES[name]], `s:${name}`)
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
      {p.runs.map(([c, d]) => (
        <path key={c} d={d} fill={PAL[c]} />
      ))}
    </svg>
  )
}

function DayRing({ blocks, sleep, nowMin, center, onFree, onBlock }: { blocks: PlanBlock[]; sleep: { sleep: number; wake: number; dur: number }; nowMin?: number; center: ReactNode; onFree: (m: number) => void; onBlock: (id: string) => void }) {
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * SIZE - C
    const y = ((e.clientY - r.top) / r.height) * SIZE - C
    const dist = Math.hypot(x, y)
    if (dist < R - BAND || dist > R + BAND) return
    let a = Math.atan2(y, x) + Math.PI / 2
    if (a < 0) a += Math.PI * 2
    const exact = (a / (Math.PI * 2)) * 1440
    const hit = blockAt(blocks, Math.floor(exact) % 1440)
    if (hit) return onBlock(hit.id)
    onFree((Math.round(exact / 15) * 15) % 1440)
  }
  return (
    <div className="ring-wrap pd-ring">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Кольцо суток: ${blocks.length} блоков, сон с ${formatHM(sleep.sleep)} до ${formatHM(sleep.wake)}`} onPointerUp={onUp}>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={BAND} />
        <circle cx={C} cy={C} r={R - BAND / 2 - 3} fill="var(--surface)" stroke="var(--line-soft)" strokeWidth={2} />
        <path d={arc(sleep.sleep, sleep.dur)} fill="none" stroke="var(--frost-soft)" strokeWidth={BAND} />
        <path d={arc(sleep.sleep, sleep.dur, R + BAND / 2 - 2)} fill="none" stroke="var(--frost)" strokeWidth={3} strokeDasharray="4 4" opacity={0.7} />
        {Array.from({ length: 24 }, (_, h) => {
          const [x0, y0] = pt(h * 60, R - BAND / 2 - 7)
          const [x1, y1] = pt(h * 60, R - BAND / 2 - (h % 3 === 0 ? 13 : 10))
          return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--mist)" strokeWidth={h % 3 === 0 ? 2 : 1} opacity={0.6} />
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const [x, y] = pt(h * 60, R - BAND / 2 - 24)
          return (
            <text key={h} x={x} y={y} className="ring-hour" textAnchor="middle" dominantBaseline="central">
              {String(h).padStart(2, '0')}
            </text>
          )
        })}
        {blocks.map((b) => (
          <g key={b.id} className="ring-arc">
            <title>{`${b.title}: ${range(b)}`}</title>
            <path d={arc(b.start + 1.5, Math.max(1, b.dur - 3))} fill="none" stroke={colorOf(b)} strokeWidth={BAND - 4} />
          </g>
        ))}
        {blocks.map((b) => {
          const [x, y] = pt(b.start + b.dur / 2, R)
          return b.dur >= 40 ? <SpriteAt key={`i${b.id}`} name={blockIcon(b)} x={x} y={y} size={20} /> : null
        })}
        {(() => {
          const [x, y] = pt(sleep.sleep + sleep.dur / 2, R)
          const [wx, wy] = pt(sleep.wake, R + BAND / 2 + 12)
          return (
            <>
              <SpriteAt name="moon" x={x} y={y} size={22} />
              <SpriteAt name="sun" x={wx} y={wy} size={20} />
            </>
          )
        })()}
        {nowMin !== undefined &&
          (() => {
            const [x, y] = pt(nowMin, R + BAND / 2 + 2)
            const [x0, y0] = pt(nowMin, R - BAND / 2 - 2)
            return (
              <>
                <line x1={x0} y1={y0} x2={x} y2={y} stroke="var(--gold-bright)" strokeWidth={3} />
                <rect x={x - 4} y={y - 4} width={8} height={8} fill="var(--gold-bright)" stroke="var(--bg)" strokeWidth={2} />
              </>
            )
          })()}
      </svg>
      <div className="ring-center">{center}</div>
    </div>
  )
}

// ---------- dates ----------

function DateStrip({ day, setDay, first, last, today, planned, onCalendar }: { day: DayKey; setDay: (d: DayKey) => void; first: DayKey; last: DayKey; today: DayKey; planned: (d: DayKey) => boolean; onCalendar: () => void }) {
  const mon = addDays(day, -weekday(day))
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const sun = days[6]
  const a = parseDay(mon)
  const b = parseDay(sun)
  const label = a.m === b.m ? `${a.d}–${b.d} ${RU_MONTHS_GEN[b.m - 1]}` : `${a.d} ${RU_MONTHS_GEN[a.m - 1].slice(0, 3)} – ${b.d} ${RU_MONTHS_GEN[b.m - 1].slice(0, 3)}`
  const clamp = (d: DayKey) => (d < first ? first : d > last ? last : d)
  return (
    <div className="pd-dates">
      <div className="pd-week">
        <button className="icon-btn" onClick={() => setDay(clamp(addDays(day, -7)))} disabled={mon <= first} aria-label="Прошлая неделя">
          <ChevronLeft size={22} />
        </button>
        <span className="pd-week-label">{label}</span>
        <button className="icon-btn" onClick={() => setDay(clamp(addDays(day, 7)))} disabled={sun >= last} aria-label="Следующая неделя">
          <ChevronRight size={22} />
        </button>
        <button className="icon-btn pd-cal-btn" onClick={onCalendar} aria-label="Выбрать дату">
          <CalendarDays size={22} />
        </button>
      </div>
      <div className="pd-days" role="group" aria-label="День недели">
        {days.map((d, i) => {
          const off = d < first || d > last
          return (
            <button key={d} className={`pd-day${d === today ? ' today' : ''}`} aria-pressed={d === day} disabled={off} onClick={() => setDay(d)} aria-label={`${RU_WEEKDAYS[i]}, ${parseDay(d).d} ${RU_MONTHS_GEN[parseDay(d).m - 1]}${d === today ? ', сегодня' : ''}`}>
              <small>{RU_WEEKDAYS[i]}</small>
              <b className="num">{parseDay(d).d}</b>
              <i className={planned(d) ? 'on' : ''} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CalendarSheet({ day, first, last, today, planned, onPick, onClose }: { day: DayKey; first: DayKey; last: DayKey; today: DayKey; planned: (d: DayKey) => boolean; onPick: (d: DayKey) => void; onClose: () => void }) {
  const months: { y: number; m: number }[] = []
  const f = parseDay(first)
  const l = parseDay(last)
  for (let y = f.y, m = f.m; y < l.y || (y === l.y && m <= l.m); m === 12 ? ((m = 1), y++) : m++) months.push({ y, m })
  const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return (
    <Sheet title="Выбери день" onClose={onClose}>
      <div className="pd-cal">
        <p className="tiny muted">
          Арка: 23 ноября – 28 февраля{first < ARC_START ? ' · до неё разминка' : ''}
        </p>
        {months.map(({ y, m }) => {
          const firstDay = key(y, m, 1)
          const len = new Date(y, m, 0).getDate()
          const lead = weekday(firstDay)
          return (
            <section key={`${y}-${m}`} className="pd-month">
              <h3>
                {MONTHS[m - 1]} {y}
              </h3>
              <div className="pd-grid">
                {RU_WEEKDAYS.map((w) => (
                  <span key={w} className="pd-wd">
                    {w}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`x${i}`} />
                ))}
                {Array.from({ length: len }, (_, i) => {
                  const d = key(y, m, i + 1)
                  const off = d < first || d > last
                  return (
                    <button key={d} className={`pd-cd${d === today ? ' today' : ''}${d < ARC_START ? ' warm' : ''}`} aria-pressed={d === day} disabled={off} onClick={() => onPick(d)}>
                      <span className="num">{i + 1}</span>
                      <i className={planned(d) ? 'on' : ''} aria-hidden />
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </Sheet>
  )
}

// ---------- checking items: the same actions as on «Сегодня» ----------

export function useCheck(day: DayKey, canCheck: boolean, openValue: (it: PlanItem) => void) {
  const game = useGame()
  const say = useUi((s) => s.say)
  return (it: PlanItem, el: HTMLElement) => {
    if (it.action === 'open') {
      if (it.href) go(it.href.replace(/^#/, ''))
      return
    }
    if (!canCheck) return say('Отмечать можно только сегодня')
    const st = useStore.getState()
    const now = nowWithOffset()
    if (it.action === 'value') return openValue(it)
    if (it.action === 'mark' && it.plan && it.quest) {
      const prev = st.data.days[day]?.quests[it.id]
      const snap = prev ? { ...prev } : undefined
      if (it.done) {
        if (!prev) return say('Отмечено автоматически')
        st.setMark(day, it.id, null, now)
        say(`Отметка снята: ${it.title}`, () => useStore.getState().restoreMark(day, it.id, snap))
        return
      }
      st.setMark(day, it.id, 'done', now)
      const r = questReward(day, it.plan, 'done')
      reward(el, { xp: r.xp })
      useFx.getState().showPop({ title: it.title, stat: it.stat, fromXp: game.xpBySphere[STAT_SPHERE[it.stat]], xp: r.xp, shards: r.shards, crit: r.crit })
      say(`Готово: ${it.title}`, () => useStore.getState().restoreMark(day, it.id, snap))
      return
    }
    if (it.action === 'task') {
      const t = st.data.tasks.find((x) => x.id === it.id)
      if (!t) return
      if (!t.doneAt) {
        const xp = taskXp(st.data.tasks, t)
        if (xp) reward(el, { xp })
      }
      st.toggleTask(it.id, now)
      say(t.doneAt ? `Вернул: ${it.title}` : `Готово: ${it.title}`, () => useStore.getState().toggleTask(it.id, nowWithOffset()))
      return
    }
    if (it.action === 'goal') {
      const g = st.data.goals?.find((x) => x.id === it.id)
      if (!g) return
      if (!it.done) reward(el, { xp: GOAL_XP[g.type] })
      st.toggleGoal(it.id, now)
      say(it.done ? `Отметка снята: ${it.title}` : `Цель на сегодня: ${it.title}`, () => useStore.getState().toggleGoal(it.id, nowWithOffset()))
    }
  }
}

export function ItemRow({ it, onCheck, onTap, canCheck, place, badge }: { it: PlanItem; onCheck: (it: PlanItem, el: HTMLElement) => void; onTap: () => void; canCheck: boolean; place?: ReactNode; badge?: boolean }) {
  const open = it.action === 'open'
  return (
    <div className={`pd-item${it.done ? ' done' : ''}`}>
      <button
        className={`pd-check${open ? ' open' : ''}`}
        onClick={(e) => onCheck(it, e.currentTarget)}
        aria-pressed={open ? undefined : it.done}
        disabled={!open && !canCheck}
        aria-label={open ? `${it.title}: открыть` : `${it.title}: ${it.done ? 'снять отметку' : 'отметить'}`}
      >
        <span>{open ? it.done ? <Check size={14} strokeWidth={3} /> : <ChevronRight size={16} strokeWidth={3} /> : it.done && <Check size={14} strokeWidth={3} />}</span>
      </button>
      <button className="pd-item-main" onClick={onTap} aria-label={`${it.title}: выбрать блок`}>
        <Px name={it.sprite} size={22} />
        <span className="grow">
          <span className="pd-item-title">{it.title}</span>
          {it.sub && <small>{it.sub}</small>}
        </span>
        {badge && it.badge && <span className={`qrow-badge num${it.done ? ' on' : ''}`}>{it.badge}</span>}
        {place}
      </button>
    </div>
  )
}

/** «Переход» at a fixed time (12:00 · 15:00 · 18:00): checkbox (today only) + tap on the text opens the reps sheet */
export function TransitionRow({ day, slot, isToday, inList }: { day: DayKey; slot: TransitionSlot; isToday: boolean; inList?: boolean }) {
  const done = useStore((s) => !!s.data.days[day]?.transitions?.[slot.id])
  const cfg = useStore((s) => s.data.settings.transition)
  const sex = useStore((s) => s.data.settings.morningFinal)
  const setTransition = useStore((s) => s.setTransition)
  const say = useUi((s) => s.say)
  const [open, setOpen] = useState(false)
  const toggle = (el: HTMLElement) => {
    if (!isToday) return say('Переход отмечается в свой день')
    if (done) {
      setTransition(day, slot.id, null)
      return say('Переход снят', () => useStore.getState().setTransition(day, slot.id, nowWithOffset().getTime()))
    }
    setTransition(day, slot.id, nowWithOffset().getTime())
    reward(el, { xp: TRANSITION.xp })
    say(`Переход сделан: +${TRANSITION.xp} XP Тела`, () => useStore.getState().setTransition(day, slot.id, null))
  }
  const time = formatHM(slot.at)
  // inList: a plain row inside a «Сегодня» section; otherwise the dashed timeline row of «План дня»
  return (
    <div className={inList ? `pd-item${done ? ' done' : ''}` : `pd-trans${done ? ' done' : ''}`}>
      <button className={`pd-check${inList ? '' : ' sm'}`} onClick={(e) => toggle(e.currentTarget)} aria-pressed={done} disabled={!isToday} aria-label={`Переход в ${time}: ${done ? 'снять' : 'сделал'}`}>
        <span>{done && <Check size={inList ? 14 : 12} strokeWidth={3} />}</span>
      </button>
      <button className={inList ? 'pd-item-main' : 'pd-trans-main'} onClick={() => setOpen(true)} aria-label={`Переход в ${time}: сколько повторов`}>
        <Px name="dumbbell" size={inList ? 22 : 18} />
        <span className="grow">
          {inList ? <span className="pd-item-title">Переход · {time}</span> : <b>Переход · {time}</b>}
          <small>{inList ? transitionShort(transitionReps(cfg, sex), sex) : transitionText(transitionReps(cfg, sex), sex)}</small>
        </span>
        <span className={inList ? `qrow-badge num${done ? ' on' : ''}` : 'pd-xp num'}>+{TRANSITION.xp} XP</span>
      </button>
      {open && <RepsSheet onClose={() => setOpen(false)} />}
    </div>
  )
}

// ---------- the screen ----------

/** «План дня»: the day in a few blocks (timeline + ring), things to put into them, tips */
export function PlanDay() {
  const route = useRoute()
  const data = useStore((s) => s.data)
  const now = useNow()
  const today = gameDayOf(now)
  const qt = route.query.get('tab')
  const [tab, setTab] = useState<'plan' | 'calendar' | 'tips'>(qt === 'tips' || qt === 'calendar' ? qt : 'plan')
  const first = [replayStartOf(data), today].sort()[0]
  const last = today > ARC_END ? today : ARC_END
  const qd = route.query.get('day')
  const [day, setDayRaw] = useState<DayKey>(qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) && qd >= first && qd <= last ? qd : today)
  const [cal, setCal] = useState(false)
  const planned = (d: DayKey) => !!data.days[d]?.dayBlocks && Object.keys(data.days[d].dayBlocks!).length > 0
  const setDay = (d: DayKey) => setDayRaw(d < first ? first : d > last ? last : d)

  return (
    <div className="stack-lg pd">
      <div className="seg-switch pd-tabs" role="tablist" aria-label="Разделы плана">
        <button role="tab" aria-selected={tab === 'plan'} aria-pressed={tab === 'plan'} onClick={() => setTab('plan')}>
          План
        </button>
        <button role="tab" aria-selected={tab === 'calendar'} aria-pressed={tab === 'calendar'} onClick={() => setTab('calendar')}>
          Календарь
        </button>
        <button role="tab" aria-selected={tab === 'tips'} aria-pressed={tab === 'tips'} onClick={() => setTab('tips')}>
          Как строить день
        </button>
      </div>
      {tab !== 'tips' ? (
        <>
          <DateStrip day={day} setDay={setDay} first={first} last={last} today={today} planned={planned} onCalendar={() => setCal(true)} />
          {tab === 'plan' ? <PlanTab key={day} day={day} today={today} /> : <PlanCalendar key={day} day={day} today={today} />}
        </>
      ) : (
        <PlanTips day={day} today={today} onApplied={() => setTab('plan')} />
      )}
      {cal && <CalendarSheet day={day} first={first} last={last} today={today} planned={planned} onPick={(d) => (setDay(d), setCal(false))} onClose={() => setCal(false)} />}
    </div>
  )
}

type BlockEdit = { mode: 'new'; start?: number; assignKey?: string } | { mode: 'edit'; id: string }

function PlanTab({ day, today }: { day: DayKey; today: DayKey }) {
  const data = useStore((s) => s.data)
  const assignPlan = useStore((s) => s.assignPlan)
  const now = useNow()
  const log = data.days[day]
  const blocks = useMemo(() => planBlocksOf(log), [log])
  const items = useMemo(() => planItems(data, day), [data, day])
  const sleep = sleepWindow(data, day)
  const isToday = day === today
  const nowMin = isToday ? minOf(now) : undefined
  const current = nowMin !== undefined ? blockAt(blocks, nowMin) : undefined
  const canCheck = isToday && !log?.confession
  const sex = data.settings.morningFinal
  const reps = transitionReps(data.settings.transition, sex)

  const [edit, setEdit] = useState<BlockEdit | null>(null)
  const [pickFor, setPickFor] = useState<PlanItem | null>(null)
  const [addTo, setAddTo] = useState<string | null>(null)
  const [tpl, setTpl] = useState(false)
  const [valueFor, setValueFor] = useState<PlanItem | null>(null)
  const [moreSkills, setMoreSkills] = useState(false)
  const check = useCheck(day, canCheck, setValueFor)

  const inBlock = (id: string) => items.filter((it) => assignedBlock(log, it.key) === id)
  const loose = items.filter((it) => !assignedBlock(log, it.key))
  const work = workMinutes(blocks)
  const late = lateWork(blocks)

  const centerTxt =
    nowMin !== undefined ? (
      <>
        <span className="num">{formatHM(nowMin)}</span>
        <small>{current ? current.title : 'Свободное время'}</small>
      </>
    ) : (
      <>
        <span className="num">{blocks.length}</span>
        <small>{blocks.length ? `блок${blocks.length === 1 ? '' : blocks.length < 5 ? 'а' : 'ов'} · ${RU_WEEKDAYS[weekday(day)]} ${parseDay(day).d}` : `${RU_WEEKDAYS[weekday(day)]} ${parseDay(day).d} · пусто`}</small>
      </>
    )

  // timeline: wake → [gap] → block … → sleep; the 3 fixed transitions sit at their time (before the next block)
  const rows: ReactNode[] = []
  let prevEnd = gameMin(sleep.wake)
  const slots = [...TRANSITION_SLOTS]
  const slotsBefore = (gm: number) => {
    while (slots.length && gameMin(slots[0].at) < gm) {
      const sl = slots.shift()!
      rows.push(<TransitionRow key={sl.id} day={day} slot={sl} isToday={isToday} />)
    }
  }
  blocks.forEach((b) => {
    const gap = gameMin(b.start) - prevEnd
    if (gap >= 15) rows.push(<div key={`g${b.id}`} className="pd-gap">свободно {fmtDur(gap)}</div>)
    slotsBefore(gameMin(b.start))
    const list = inBlock(b.id)
    const isNow = current?.id === b.id
    rows.push(
      <article key={b.id} className={`pd-block${isNow ? ' now' : ''}`} style={{ '--bc': colorOf(b) } as CSSProperties}>
        <header className="pd-block-head">
          <span className="pd-block-icon">
            <Px name={blockIcon(b)} size={26} />
          </span>
          <button className="grow pd-block-name" onClick={() => setEdit({ mode: 'edit', id: b.id })} aria-label={`Изменить блок «${b.title}»`}>
            <b>{b.title}</b>
            <span className="num">
              {range(b)} <span className="muted">· {fmtDur(b.dur)}</span>
              {b.work && <span className="pd-tag">работа</span>}
              {isNow && <span className="pd-tag now">сейчас</span>}
            </span>
          </button>
          <button className="icon-btn" onClick={() => setEdit({ mode: 'edit', id: b.id })} aria-label={`Изменить «${b.title}»`}>
            <Pencil size={17} />
          </button>
        </header>
        {list.length > 0 && (
          <div className="pd-block-items">
            {list.map((it) => (
              <ItemRow key={it.key} it={it} onCheck={check} onTap={() => setPickFor(it)} canCheck={canCheck} />
            ))}
          </div>
        )}
        <button className="pd-add" onClick={() => setAddTo(b.id)}>
          <Plus size={16} strokeWidth={3} aria-hidden /> Дело в блок
        </button>
      </article>,
    )
    prevEnd = gameMin(b.start) + b.dur
  })
  slotsBefore(Infinity)

  const skills = loose.filter((it) => it.group === 'skill')
  const shownSkills = moreSkills ? skills : skills.slice(0, 3)
  const looseShown = [...loose.filter((it) => it.group === 'deal'), ...loose.filter((it) => it.group === 'quest'), ...loose.filter((it) => it.group === 'project'), ...loose.filter((it) => it.group === 'own'), ...shownSkills]

  return (
    <>
      <DayRing
        blocks={blocks}
        sleep={sleep}
        nowMin={nowMin}
        center={centerTxt}
        onFree={(m) => setEdit({ mode: 'new', start: m })}
        onBlock={(id) => setEdit({ mode: 'edit', id })}
      />
      <p className="pd-summary">
        <span>
          Сон {formatHM(sleep.sleep)}–{formatHM(sleep.wake)}
        </span>
        {work > 0 && <span className={work > WORK_RULES.maxMin ? 'warn' : ''}>работа {fmtDur(work)}</span>}
        {late.length > 0 && <span className="warn">после 17:00</span>}
        <Help
          title="План дня"
          text={[
            'День — это несколько блоков: «Утро · фокус», «Дела», «Вечер». Нажми на свободное место кольца — блок начнётся с этого времени.',
            'Дела из списка «Без времени» ставятся в блок тапом. Галочки здесь те же, что на «Сегодня».',
            `Переходы в 12:00, 15:00 и 18:00: ${transitionText(reps, sex)}. +${TRANSITION.xp} XP Тела за каждый. Те же галочки, что на «Сегодня».`,
            'Сон на кольце — по целям подъёма и отбоя. Работа: не больше 6 ч и до 17:00.',
          ]}
        />
      </p>

      {blocks.length === 0 ? (
        <section className="pd-empty">
          <Px name="clock" size={40} />
          <b>День пока не разбит на блоки</b>
          <div className="pd-tpl-list">
            {PLAN_TEMPLATES.map((t) => (
              <TemplateButton key={t.id} t={t} day={day} />
            ))}
          </div>
          <button className="btn ghost block" onClick={() => setEdit({ mode: 'new' })}>
            <Plus size={18} strokeWidth={3} aria-hidden /> Свой блок
          </button>
        </section>
      ) : (
        <section className="pd-timeline" aria-label="Блоки дня">
          <div className="pd-edge">
            <Px name="sun" size={18} /> <span className="num">{formatHM(sleep.wake)}</span> подъём
          </div>
          {rows}
          <div className="pd-edge">
            <Px name="moon" size={18} /> <span className="num">{formatHM(sleep.sleep)}</span> отбой
          </div>
          <div className="grid-2">
            <button className="btn ghost sm" onClick={() => setEdit({ mode: 'new' })}>
              <Plus size={17} strokeWidth={3} aria-hidden /> Блок
            </button>
            <button className="btn ghost sm" onClick={() => setTpl(true)}>
              <LayoutTemplate size={17} aria-hidden /> Шаблоны
            </button>
          </div>
        </section>
      )}

      <section className="stack" aria-label="Дела без времени">
        <div className="section-title">
          <h2>
            <Px name="quests" size={24} /> Без времени <span className="count-pill num">{loose.length}</span>
          </h2>
          {blocks.length > 0 && <span className="small muted">тап — в блок</span>}
        </div>
        {looseShown.length === 0 && <div className="empty">Всё расставлено по блокам.</div>}
        <div className="pd-loose">
          {looseShown.map((it) => (
            <ItemRow key={it.key} it={it} onCheck={check} onTap={() => setPickFor(it)} canCheck={canCheck} place={blocks.length > 0 ? <Clock size={17} className="pd-place" aria-hidden /> : undefined} />
          ))}
          {skills.length > 3 && (
            <button className="link-btn" onClick={() => setMoreSkills(!moreSkills)}>
              {moreSkills ? 'Свернуть навыки' : `Ещё из навыков: ${skills.length - 3}`}
            </button>
          )}
        </div>
        <AddOwn day={day} />
      </section>

      {edit && <BlockSheet day={day} edit={edit} blocks={blocks} sleep={sleep} onClose={() => setEdit(null)} />}
      {pickFor && (
        <PickBlockSheet
          item={pickFor}
          blocks={blocks}
          current={assignedBlock(log, pickFor.key)}
          onPick={(id) => {
            assignPlan(day, pickFor.key, id)
            setPickFor(null)
          }}
          onNew={() => {
            setEdit({ mode: 'new', assignKey: pickFor.key })
            setPickFor(null)
          }}
          onClose={() => setPickFor(null)}
        />
      )}
      {addTo && blocks.some((b) => b.id === addTo) && <AddToBlockSheet day={day} block={blocks.find((b) => b.id === addTo)!} items={loose} onClose={() => setAddTo(null)} />}
      {tpl && <TemplateSheet day={day} onClose={() => setTpl(false)} />}
      {valueFor && <ValueSheet day={day} item={valueFor} onClose={() => setValueFor(null)} />}
    </>
  )
}

/** a custom task of this day: a daily task, the same as «+ Задача» on «Сегодня» */
function AddOwn({ day, blockId, onAdded }: { day: DayKey; blockId?: string; onAdded?: () => void }) {
  const addDayTask = useStore((s) => s.addDayTask)
  const assignPlan = useStore((s) => s.assignPlan)
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    const id = addDayTask(day, t.slice(0, 80), nowWithOffset())
    if (blockId) assignPlan(day, `task:${id}`, blockId)
    setText('')
    onAdded?.()
  }
  return (
    <form
      className="pd-own"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <input className="input" placeholder="Своё дело, например звонок" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} aria-label="Своё дело" />
      <button className="btn primary sm" type="submit" disabled={!text.trim()} aria-label="Добавить своё дело">
        <Plus size={18} strokeWidth={3} />
      </button>
    </form>
  )
}

// ---------- sheets ----------

function BlockSheet({ day, edit, blocks, sleep, onClose }: { day: DayKey; edit: BlockEdit; blocks: PlanBlock[]; sleep: { wake: number }; onClose: () => void }) {
  const putPlanBlock = useStore((s) => s.putPlanBlock)
  const removePlanBlock = useStore((s) => s.removePlanBlock)
  const assignPlan = useStore((s) => s.assignPlan)
  const say = useUi((s) => s.say)
  const existing = edit.mode === 'edit' ? blocks.find((b) => b.id === edit.id) : undefined
  const others = blocks.filter((b) => b.id !== existing?.id)
  const init = (): PlanBlock => {
    if (existing) return existing
    const last = blocks[blocks.length - 1]
    const from = edit.mode === 'new' && edit.start !== undefined ? edit.start : last ? blockEnd(last) + 15 : Math.max(9 * 60, sleep.wake + 60)
    const s = edit.mode === 'new' && edit.start !== undefined && !others.some((b) => blocksOverlap(b, { start: from, dur: 60 })) ? from : nextFreeStart(others, from, 60)
    return { id: uid(), title: '', start: s, dur: 60, color: 'mind', icon: 'brain', work: true }
  }
  const [b, setB] = useState<PlanBlock>(init)
  const [err, setErr] = useState('')
  const end = blockEnd(b)
  const clash = others.find((o) => blocksOverlap(o, b))
  const set = (patch: Partial<PlanBlock>) => (setB({ ...b, ...patch }), setErr(''))
  const setEnd = (hm: string) => {
    const e = parseHM(hm)
    const dur = (((e - b.start) % 1440) + 1440) % 1440
    set({ dur: Math.max(5, Math.min(720, dur || 5)) })
  }

  const save = () => {
    const title = b.title.trim()
    if (!title) return setErr('Назови блок: «Утро · фокус», «Дела»…')
    if (clash) return setErr(`Пересекается с «${clash.title}» (${range(clash)})`)
    const out: PlanBlock = { id: b.id, title: title.slice(0, PLAN_TITLE_MAX), start: b.start, dur: b.dur }
    if (b.color) out.color = b.color
    if (b.icon) out.icon = b.icon
    if (b.work) out.work = true
    putPlanBlock(day, out)
    if (edit.mode === 'new' && edit.assignKey) assignPlan(day, edit.assignKey, out.id)
    onClose()
  }

  const remove = () => {
    if (!existing) return
    const snap = structuredClone(useStore.getState().data.days[day]) as DayLog
    removePlanBlock(day, existing.id)
    say(`Блок «${existing.title}» убран, дела — в «Без времени»`, () =>
      useStore.getState().update((d) => {
        const l = (d.days[day] ??= { quests: {} })
        for (const k of ['dayBlocks', 'assign', 'transitions'] as const) {
          if (snap[k]) (l as unknown as Record<string, unknown>)[k] = snap[k]
        }
      }),
    )
    onClose()
  }

  return (
    <Sheet title={existing ? 'Блок' : 'Новый блок'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Название</span>
          <input className="input" value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="Например, «Утро · фокус»" maxLength={PLAN_TITLE_MAX} autoFocus={!existing} />
        </label>
        <div className="chips pd-names">
          {NAME_PRESETS.map((n) => (
            <button key={n} type="button" className="chip sm" aria-pressed={b.title === n} onClick={() => set({ title: n })}>
              {n}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <div className="field">
            <span>Начало</span>
            <TimePicker label="Начало" value={formatHM(b.start)} onChange={(v) => v && set({ start: parseHM(v) })} />
          </div>
          <div className="field">
            <span>Конец · {fmtDur(b.dur)}</span>
            <TimePicker label="Конец" value={formatHM(end)} onChange={(v) => v && setEnd(v)} />
          </div>
        </div>
        <div className="chips pd-durs" role="group" aria-label="Длительность">
          {DUR_CHIPS.map(([d, label]) => (
            <button key={d} type="button" className="chip sm" aria-pressed={b.dur === d} onClick={() => set({ dur: d })}>
              {label}
            </button>
          ))}
        </div>
        <div className="field">
          <span>Цвет и значок</span>
          <div className="pd-swatches" role="group" aria-label="Цвет">
            {BLOCK_COLORS.map((c) => (
              <button key={c} type="button" className="pd-swatch" style={{ background: BLOCK_COLOR_VAR[c] }} aria-pressed={b.color === c} aria-label={COLOR_NAME[c]} onClick={() => set({ color: c })} />
            ))}
          </div>
          <div className="pd-icons" role="group" aria-label="Значок">
            {PLAN_ICONS.map((i) => (
              <button key={i} type="button" className="pd-icon" aria-pressed={b.icon === i} aria-label={i} onClick={() => set({ icon: i })}>
                <Px name={i} size={24} />
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="pd-toggle" aria-pressed={!!b.work} onClick={() => set({ work: !b.work })}>
          <span className="pd-check-box">{b.work && <Check size={14} strokeWidth={3} />}</span>
          <span className="grow">
            Рабочий блок
            <small>считается в «не больше 6 ч» и «до 17:00»</small>
          </span>
        </button>
        {(err || clash) && (
          <div className="row wrap" style={{ gap: 8 }}>
            <p className="err grow">{err || `Пересекается с «${clash!.title}» (${range(clash!)})`}</p>
            {clash && (
              <button className="btn sm ghost" type="button" onClick={() => set({ start: nextFreeStart(others, b.start, b.dur) })}>
                Ближайшее свободное
              </button>
            )}
          </div>
        )}
        <button className="btn primary block" onClick={save}>
          {existing ? 'Сохранить' : `Поставить ${formatHM(b.start)}–${formatHM(end)}`}
        </button>
        {existing && (
          <button className="btn ghost block pd-danger" onClick={remove}>
            Убрать блок
          </button>
        )}
      </div>
    </Sheet>
  )
}

export function PickBlockSheet({ item, blocks, current, onPick, onNew, onClose }: { item: PlanItem; blocks: PlanBlock[]; current?: string; onPick: (id: string | null) => void; onNew: () => void; onClose: () => void }) {
  return (
    <Sheet title="Куда поставить?" onClose={onClose}>
      <div className="stack">
        <p className="pd-pick-what">
          <Px name={item.sprite} size={24} /> <b>{item.title}</b>
        </p>
        <div className="pd-pick-list">
          {blocks.map((b) => (
            <button key={b.id} className="pd-pick" style={{ '--bc': colorOf(b) } as CSSProperties} aria-pressed={current === b.id} onClick={() => onPick(b.id)}>
              <Px name={blockIcon(b)} size={24} />
              <span className="grow">
                <b>{b.title}</b>
                <small className="num">{range(b)}</small>
              </span>
              {current === b.id && <Check size={18} strokeWidth={3} />}
            </button>
          ))}
          <button className="pd-pick plain" aria-pressed={!current} onClick={() => onPick(null)}>
            <Px name="quests" size={24} />
            <span className="grow">
              <b>Без времени</b>
            </span>
            {!current && <Check size={18} strokeWidth={3} />}
          </button>
        </div>
        <button className="btn ghost block" onClick={onNew}>
          <Plus size={18} strokeWidth={3} aria-hidden /> Новый блок для этого дела
        </button>
      </div>
    </Sheet>
  )
}

function AddToBlockSheet({ day, block, items, onClose }: { day: DayKey; block: PlanBlock; items: PlanItem[]; onClose: () => void }) {
  const assignPlan = useStore((s) => s.assignPlan)
  const [added, setAdded] = useState<string[]>([])
  const list = items.filter((it) => !it.done || added.includes(it.key))
  return (
    <Sheet title={`В блок «${block.title}»`} onClose={onClose}>
      <div className="stack">
        <p className="tiny muted num">{range(block)} · тапни, что сюда входит</p>
        <div className="pd-pick-list">
          {list.length === 0 && <div className="empty">Свободных дел нет — впиши своё ниже.</div>}
          {list.map((it) => {
            const on = added.includes(it.key)
            return (
              <button
                key={it.key}
                className="pd-pick"
                style={{ '--bc': colorOf(block) } as CSSProperties}
                aria-pressed={on}
                onClick={() => {
                  assignPlan(day, it.key, on ? null : block.id)
                  setAdded(on ? added.filter((k) => k !== it.key) : [...added, it.key])
                }}
              >
                <Px name={it.sprite} size={22} />
                <span className="grow">
                  <b>{it.title}</b>
                  {it.sub && <small>{it.sub}</small>}
                </span>
                {on && <Check size={18} strokeWidth={3} />}
              </button>
            )
          })}
        </div>
        <AddOwn day={day} blockId={block.id} />
        <button className="btn primary block" onClick={onClose}>
          Готово
        </button>
      </div>
    </Sheet>
  )
}

/** apply a template to a day: replaces its blocks (asks first when there are any), with an undo */
export function useApplyTemplate() {
  const data = useStore((s) => s.data)
  const setPlanBlocks = useStore((s) => s.setPlanBlocks)
  const confirm = useUi((s) => s.confirm)
  const say = useUi((s) => s.say)
  return async (day: DayKey, id: PlanTemplate['id']): Promise<boolean> => {
    const log = data.days[day]
    const has = planBlocksOf(log).length > 0
    if (has) {
      const ok = await confirm({ title: 'Заменить блоки дня?', body: 'Блоки этого дня заменятся шаблоном, дела из них вернутся в «Без времени».', ok: 'Заменить' })
      if (!ok) return false
    }
    const snap = structuredClone(log ?? { quests: {} }) as DayLog
    const sleep = sleepWindow(data, day)
    setPlanBlocks(
      day,
      templateBlocks(id, { wake: sleep.wake, sleep: sleep.sleep }).map((b) => ({ ...b, id: uid() })),
    )
    const t = PLAN_TEMPLATES.find((x) => x.id === id)!
    say(`День собран: ${t.title}`, () =>
      useStore.getState().update((d) => {
        const l = (d.days[day] ??= { quests: {} })
        for (const k of ['dayBlocks', 'assign', 'transitions'] as const) {
          if (snap[k]) (l as unknown as Record<string, unknown>)[k] = snap[k]
          else delete l[k]
        }
      }),
    )
    return true
  }
}

function TemplatePreview({ id, day }: { id: PlanTemplate['id']; day: DayKey }) {
  const data = useStore((s) => s.data)
  const sleep = sleepWindow(data, day)
  const bs = templateBlocks(id, { wake: sleep.wake, sleep: sleep.sleep })
  // a strip from the wake time to bedtime
  const from = gameMin(sleep.wake)
  const to = gameMin(sleep.sleep) > from ? gameMin(sleep.sleep) : from + 16 * 60
  return (
    <span className="pd-tpl-strip" aria-hidden>
      {bs.map((b, i) => {
        const l = ((gameMin(b.start) - from) / (to - from)) * 100
        const w = (b.dur / (to - from)) * 100
        return <i key={i} style={{ left: `${Math.max(0, l)}%`, width: `${Math.min(100 - Math.max(0, l), w)}%`, background: colorOf(b) }} />
      })}
    </span>
  )
}

function TemplateButton({ t, day, onDone }: { t: PlanTemplate; day: DayKey; onDone?: () => void }) {
  const apply = useApplyTemplate()
  return (
    <button className="pd-tpl" onClick={async () => (await apply(day, t.id)) && onDone?.()}>
      <span className="grow">
        <b>{t.title}</b>
        <small>{t.sub}</small>
        <TemplatePreview id={t.id} day={day} />
      </span>
      <ChevronRight size={18} aria-hidden />
    </button>
  )
}

function TemplateSheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  return (
    <Sheet title="Шаблоны дня" onClose={onClose}>
      <div className="stack">
        <p className="tiny muted">Блоки потом можно поправить: время, название, цвет.</p>
        <div className="pd-tpl-list">
          {PLAN_TEMPLATES.map((t) => (
            <TemplateButton key={t.id} t={t} day={day} onDone={onClose} />
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function RepsSheet({ onClose }: { onClose: () => void }) {
  const cur = useStore((s) => s.data.settings.transition)
  const sex = useStore((s) => s.data.settings.morningFinal)
  const setSettings = useStore((s) => s.setSettings)
  const r = transitionReps(cur, sex)
  const min = TRANSITION_MIN[sex === 'f' ? 'f' : 'm']
  const set = (k: 'push' | 'squat', d: number) => setSettings({ transition: transitionReps({ ...r, [k]: r[k] + d }, sex) })
  const Step = ({ k, label }: { k: 'push' | 'squat'; label: string }) => (
    <div className="pd-step">
      <span className="grow">{label}</span>
      <button className="btn sm ghost" onClick={() => set(k, -5)} disabled={r[k] <= min[k]} aria-label={`${label}: меньше`}>
        −5
      </button>
      <b className="num">{r[k]}</b>
      <button className="btn sm ghost" onClick={() => set(k, 5)} disabled={r[k] >= TRANSITION.maxReps} aria-label={`${label}: больше`}>
        +5
      </button>
    </div>
  )
  return (
    <Sheet title="Переход" onClose={onClose}>
      <div className="stack">
        <p className="small" style={{ color: 'var(--ink-2)' }}>
          В 12:00, 15:00 и 18:00 — разогнать кровь и переключить голову. Минимум: {transitionText(min, sex)}, больше — по желанию. <b>+{TRANSITION.xp} XP Тела</b> за каждый.
        </p>
        {sex === 'f' ? (
          <>
            <Step k="squat" label="Приседания по Неумывакину" />
            <Step k="push" label="Отжимания" />
          </>
        ) : (
          <>
            <Step k="push" label="Отжимания" />
            <Step k="squat" label="Приседания по Неумывакину" />
          </>
        )}
        <p className="tiny muted">Минимум зависит от пола («Ещё» → «Пол»): М — {transitionText(TRANSITION_MIN.m, 'm')}, Ж — {transitionText(TRANSITION_MIN.f, 'f')}.</p>
        <button className="btn primary block" onClick={onClose}>
          Готово
        </button>
      </div>
    </Sheet>
  )
}

function ValueSheet({ day, item, onClose }: { day: DayKey; item: PlanItem; onClose: () => void }) {
  const setValue = useStore((s) => s.setValue)
  const restoreMark = useStore((s) => s.restoreMark)
  const say = useUi((s) => s.say)
  const cur = useStore((s) => s.data.days[day]?.quests[item.id]?.value)
  const [v, setV] = useState<number | undefined>(cur)
  const q = item.quest!
  return (
    <Sheet title={item.title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (v === undefined || !Number.isFinite(v) || v < 0) return
          const prev = useStore.getState().data.days[day]?.quests[item.id]
          const snap = prev ? { ...prev } : undefined
          setValue(day, item.id, v, nowWithOffset())
          say(`Записано: ${v} ${q.unit ?? ''}`.trim(), () => restoreMark(day, item.id, snap))
          onClose()
        }}
      >
        <label className="field">
          <span>
            Сколько {q.unit ?? ''} · цель {q.goal ?? q.min}
          </span>
          <NumInput value={v} onChange={setV} placeholder={String(q.goal ?? q.min ?? '')} />
        </label>
        <button className="btn primary block" type="submit" disabled={v === undefined}>
          Записать
        </button>
      </form>
    </Sheet>
  )
}

// ---------- «Календарь»: the day as an hour grid ----------

const HOUR_PX = 56

/** Hour grid of the game day (04:00 → 04:00): blocks as rectangles, their tasks inside, sleep shaded, a «now» line */
function PlanCalendar({ day, today }: { day: DayKey; today: DayKey }) {
  const data = useStore((s) => s.data)
  const now = useNow()
  const log = data.days[day]
  const blocks = useMemo(() => planBlocksOf(log), [log])
  const items = useMemo(() => planItems(data, day), [data, day])
  const sleep = sleepWindow(data, day)
  const [edit, setEdit] = useState<BlockEdit | null>(null)
  const isToday = day === today
  const y = (gm: number) => (gm / 60) * HOUR_PX
  const scroller = (el: HTMLDivElement | null) => {
    if (el && !el.dataset.ready) {
      el.dataset.ready = '1'
      el.scrollTop = Math.max(0, y(gameMin(sleep.wake) - 45))
    }
  }
  // «Сферы»: the day's events of «Разное» — timed ones on the grid, the rest above it
  const events = eventsView(data.events, day).today
  const onGrid = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.pd-cal-block, .pd-cal-ev')) return
    const r = e.currentTarget.getBoundingClientRect()
    const gm = Math.floor((((e.clientY - r.top) / HOUR_PX) * 60) / 15) * 15
    setEdit({ mode: 'new', start: (gm + 240) % 1440 })
  }
  const sleepFrom = gameMin(sleep.sleep)
  const wakeAt = gameMin(sleep.wake)
  const hours = Array.from({ length: 24 }, (_, i) => (i + 4) % 24)
  return (
    <>
      {events.some((e) => !e.time) && (
        <p className="pd-cal-allday small">
          <Px name="clock" size={16} /> Весь день: {events.filter((e) => !e.time).map((e) => e.title).join(' · ')}
        </p>
      )}
      <div className="pd-hours" ref={scroller} aria-label="Часы дня">
        <div className="pd-hgrid" style={{ height: y(1440) }} onClick={onGrid}>
          {hours.map((h, i) => (
            <div key={h} className="pd-hrow" style={{ top: y(i * 60) }}>
              <span className="num">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          {wakeAt > 0 && <div className="pd-hsleep" style={{ top: 0, height: y(wakeAt) }} aria-hidden />}
          {sleepFrom < 1440 && (
            <div className="pd-hsleep" style={{ top: y(sleepFrom), height: y(1440 - sleepFrom) }}>
              <span>
                <Px name="moon" size={16} /> сон {formatHM(sleep.sleep)}–{formatHM(sleep.wake)}
              </span>
            </div>
          )}
          {blocks.map((b) => {
            const list = items.filter((it) => assignedBlock(log, it.key) === b.id)
            const h = y(b.dur) - 3
            const room = Math.max(0, Math.floor((h - 46) / 20))
            return (
              <button key={b.id} className="pd-cal-block" style={{ top: y(gameMin(b.start)) + 1, height: h, '--bc': colorOf(b) } as CSSProperties} onClick={() => setEdit({ mode: 'edit', id: b.id })} aria-label={`${b.title}, ${range(b)}: изменить`}>
                <span className="pd-cal-head">
                  <Px name={blockIcon(b)} size={18} />
                  <b>{b.title}</b>
                </span>
                {h >= 34 && <small className="num">{range(b)}</small>}
                {list.slice(0, room).map((it) => (
                  <span key={it.key} className={`pd-cal-item${it.done ? ' done' : ''}`}>
                    {it.done ? <Check size={12} strokeWidth={3} /> : <i />}
                    {it.title}
                  </span>
                ))}
                {list.length > room && h >= 66 && <span className="pd-cal-more">+{list.length - room}</span>}
              </button>
            )
          })}
          {events
            .filter((e) => e.time)
            .map((e) => (
              <a key={e.id} className={`pd-cal-ev${e.doneAt ? ' done' : ''}`} style={{ top: y(gameMin(parseHM(e.time!))) + 2 }} href="#/today" aria-label={`Событие ${e.time} ${e.title}`}>
                <span className="num">{e.time}</span> {e.title}
              </a>
            ))}
          {isToday && <div className="pd-hnow" style={{ top: y(gameMin(minOf(now))) }} aria-label={`Сейчас ${formatHM(minOf(now))}`} />}
        </div>
      </div>
      <p className="tiny muted center">Тап по пустому часу — новый блок, по блоку — изменить.</p>
      {edit && <BlockSheet day={day} edit={edit} blocks={blocks} sleep={sleep} onClose={() => setEdit(null)} />}
    </>
  )
}

// ---------- «Сегодня»: the transition card ----------

/** «Переход в 15:00»: 15 min before a fixed transition and 15 min after, until it is done */
export function TransitionCard() {
  const now = useNow()
  const today = gameDayOf(now)
  const log = useStore((s) => s.data.days[today])
  const repsCfg = useStore((s) => s.data.settings.transition)
  const sex = useStore((s) => s.data.settings.morningFinal)
  const setTransition = useStore((s) => s.setTransition)
  const say = useUi((s) => s.say)
  const due = slotDue(log, minOf(now))
  if (!due) return null
  const r = transitionReps(repsCfg, sex)
  const { slot, inMin } = due
  const when = inMin > 0 ? `через ${inMin} мин` : inMin === 0 ? 'сейчас' : `${-inMin} мин назад`
  return (
    <div className="pd-today" style={{ '--bc': 'var(--st-body)' } as CSSProperties}>
      <Px name="dumbbell" size={32} />
      <span className="grow">
        <b>Переход в {formatHM(slot.at)}</b>
        <small>
          {transitionText(r, sex)} · {when} · +{TRANSITION.xp} XP
        </small>
      </span>
      <button
        className="pd-check"
        aria-pressed={false}
        aria-label={`Переход в ${formatHM(slot.at)}: сделал`}
        onClick={(e) => {
          setTransition(today, slot.id, nowWithOffset().getTime())
          reward(e.currentTarget, { xp: TRANSITION.xp })
          say(`Переход сделан: +${TRANSITION.xp} XP Тела`, () => useStore.getState().setTransition(today, slot.id, null))
        }}
      >
        <span />
      </button>
    </div>
  )
}
