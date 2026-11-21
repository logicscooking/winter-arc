import { useMemo, useState, type PointerEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { addDays, blockAt, blocksOverlap, formatDayRu, formatHM, gameDayOf, nextFreeStart, parseHM, plannedMinutes, sleepWindow, sortBlocks, statName, uid } from '../engine'
import type { StatId, TimeBlock } from '../engine'
import { useStore } from '../store/store'
import { useNow } from '../store/hooks'
import { Px, STAT_SPRITE } from '../pixel/Pixel'
import { SPRITES, type SpriteName } from '../pixel/sprites'
import { PAL } from '../pixel/palette'
import { gridPaths } from '../pixel/render'
import { dayItems } from './dayItems'

const STAT_COLOR: Record<StatId, string> = {
  energy: 'var(--st-energy)',
  body: 'var(--st-body)',
  mind: 'var(--st-mind)',
  will: 'var(--st-will)',
  deal: 'var(--st-deal)',
}
const DURS = [15, 30, 45, 60, 90, 120]
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

/** «План дня»: a 24h ring with time blocks, the sleep arc from the targets, and the current moment */
export function PlanDay() {
  const data = useStore((s) => s.data)
  const setBlocks = useStore((s) => s.setBlocks)
  const now = useNow()
  const today = gameDayOf(now)
  const [which, setWhich] = useState<'today' | 'tomorrow'>('today')
  const day = which === 'today' ? today : addDays(today, 1)
  const blocks = useMemo(() => sortBlocks(data.days[day]?.blocks ?? []), [data.days, day])
  const items = dayItems(data, day)
  const sleep = sleepWindow(data, day)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const current = which === 'today' ? blockAt(blocks, nowMin) : undefined

  const [pick, setPick] = useState<string>('') // `${ref}:${id}` or 'custom'
  const [custom, setCustom] = useState('')
  const [start, setStart] = useState(() => formatHM(nextFreeStart(blocks, nowMin + 5, 30)))
  const [dur, setDur] = useState(30)
  const [err, setErr] = useState('')

  const chosen = items.find((i) => `${i.ref}:${i.id}` === pick)
  const title = pick === 'custom' ? custom.trim() : chosen?.title ?? ''
  const startMin = parseHM(start)
  const clash = blocks.find((b) => blocksOverlap(b, { start: startMin, dur }))

  const add = () => {
    if (!title) return setErr('Выбери квест или впиши своё дело')
    if (clash) return setErr(`Пересекается с «${clash.title}» (${formatHM(clash.start)})`)
    const b: TimeBlock = { id: uid(), start: startMin, dur, title, stat: chosen?.stat ?? 'deal' }
    if (chosen) b.ref = { kind: chosen.ref, id: chosen.id }
    setBlocks(day, sortBlocks([...blocks, b]))
    setErr('')
    setPick('')
    setCustom('')
    setStart(formatHM(nextFreeStart([...blocks, b], startMin + dur, dur)))
  }

  const remove = (id: string) => setBlocks(day, blocks.filter((b) => b.id !== id))

  const onRing = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * SIZE - C
    const y = ((e.clientY - r.top) / r.height) * SIZE - C
    const dist = Math.hypot(x, y)
    if (dist < R - BAND || dist > R + BAND) return
    let a = Math.atan2(y, x) + Math.PI / 2
    if (a < 0) a += Math.PI * 2
    const m = Math.round(((a / (Math.PI * 2)) * 1440) / 15) * 15
    const hit = blockAt(blocks, m)
    if (hit) return
    setStart(formatHM(m % 1440))
    setErr('')
    document.getElementById('plan-add')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const icon = (b: TimeBlock): SpriteName => {
    const it = b.ref ? items.find((i) => i.ref === b.ref!.kind && i.id === b.ref!.id) : undefined
    return it?.sprite ?? STAT_SPRITE[b.stat ?? 'deal']
  }

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 8 }}>
        <div className="row between wrap">
          <span className="small muted">{formatDayRu(day)}</span>
          <div className="seg-switch" role="tablist" aria-label="День">
            <button role="tab" aria-selected={which === 'today'} aria-pressed={which === 'today'} onClick={() => setWhich('today')}>
              Сегодня
            </button>
            <button role="tab" aria-selected={which === 'tomorrow'} aria-pressed={which === 'tomorrow'} onClick={() => setWhich('tomorrow')}>
              Завтра
            </button>
          </div>
        </div>
      </header>

      <div className="cols">
        <section className="stack">
          <div className="ring-wrap">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Кольцо суток: ${blocks.length} блоков, сон с ${formatHM(sleep.sleep)} до ${formatHM(sleep.wake)}`} onPointerUp={onRing}>
              <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={BAND} />
              <circle cx={C} cy={C} r={R - BAND / 2 - 3} fill="var(--surface)" stroke="var(--line-soft)" strokeWidth={2} />
              {/* sleep: from bedtime target to the wake target */}
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
                  <title>{`${b.title}: ${formatHM(b.start)}–${formatHM((b.start + b.dur) % 1440)}`}</title>
                  <path d={arc(b.start + 1.5, Math.max(1, b.dur - 3))} fill="none" stroke={STAT_COLOR[b.stat ?? 'deal']} strokeWidth={BAND - 4} />
                </g>
              ))}
              {blocks.map((b) => {
                const [x, y] = pt(b.start + b.dur / 2, R)
                return b.dur >= 20 ? <SpriteAt key={`i${b.id}`} name={icon(b)} x={x} y={y} size={22} /> : null
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
              {which === 'today' &&
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
            <div className="ring-center">
              <span className="num">{which === 'today' ? formatHM(nowMin) : formatHM(sleep.wake)}</span>
              <small>{which === 'today' ? (current ? `Сейчас: ${current.title}` : 'Свободное время') : 'Подъём завтра'}</small>
            </div>
          </div>
          <p className="tiny muted center">
            Сон {formatHM(sleep.sleep)}–{formatHM(sleep.wake)} по целям подъёма и отбоя · запланировано {Math.floor(plannedMinutes(blocks) / 60)} ч {plannedMinutes(blocks) % 60} мин. Нажми на свободное место кольца — время подставится.
          </p>

          {blocks.length === 0 ? (
            <div className="empty">Расставь главные квесты по часам.</div>
          ) : (
            <div className="block-list">
              {blocks.map((b) => (
                <div key={b.id} className={`block-row ${current?.id === b.id ? 'now' : ''}`}>
                  <span className="stripe" style={{ background: STAT_COLOR[b.stat ?? 'deal'] }} />
                  <Px name={icon(b)} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, lineHeight: 1.25 }}>{b.title}</div>
                    <span className="num">
                      {formatHM(b.start)}–{formatHM((b.start + b.dur) % 1440)}
                    </span>
                    <span className="tiny muted"> · {statName(b.stat ?? 'deal')}</span>
                  </div>
                  <button className="icon-btn" onClick={() => remove(b.id)} aria-label={`Убрать «${b.title}» из плана`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel stack" id="plan-add" aria-label="Добавить блок">
          <h2>Добавить блок</h2>
          <div className="field">
            <span>Что</span>
            <div className="pick-grid">
              {items.map((i) => (
                <button key={`${i.ref}:${i.id}`} type="button" className="pick" aria-pressed={pick === `${i.ref}:${i.id}`} onClick={() => setPick(`${i.ref}:${i.id}`)}>
                  <Px name={i.sprite} size={22} />
                  <span>{i.title}</span>
                </button>
              ))}
              <button type="button" className="pick" aria-pressed={pick === 'custom'} onClick={() => setPick('custom')}>
                <Px name="star" size={22} />
                <span>Своё дело</span>
              </button>
            </div>
            {pick === 'custom' && <input className="input" placeholder="Например, «Звонок маме»" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} autoFocus aria-label="Своё дело" />}
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Начало</span>
              <input className="input num" type="time" step={300} value={start} onChange={(e) => (setStart(e.target.value || '00:00'), setErr(''))} />
            </label>
            <div className="field">
              <span>Длительность</span>
              <select className="select input" value={dur} onChange={(e) => (setDur(Number(e.target.value)), setErr(''))} aria-label="Длительность">
                {DURS.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} мин` : `${d / 60} ч${d % 60 ? ` ${d % 60} мин` : ''}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {(err || clash) && (
            <div className="row wrap" style={{ gap: 8 }}>
              <p className="err grow">{err || `Пересекается с «${clash!.title}»`}</p>
              {clash && (
                <button className="btn sm ghost" type="button" onClick={() => (setStart(formatHM(nextFreeStart(blocks, startMin, dur))), setErr(''))}>
                  Ближайшее свободное
                </button>
              )}
            </div>
          )}
          <button className="btn primary block" onClick={add} disabled={!title || !!clash}>
            Поставить в {start}
          </button>
        </section>
      </div>
    </div>
  )
}
