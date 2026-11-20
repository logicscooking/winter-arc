import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDayShort } from '../engine'
import type { DayKey } from '../engine'

export interface Series {
  name: string
  color: string
  kind: 'line' | 'bar'
  /** colour override per point (e.g. over the limit) */
  colorAt?: (v: number, i: number) => string
}

/**
 * Reference lines that make a chart readable before the first point:
 * goal — the arc goal (solid gold), target — a per-day target (dashed), base — the start measurement (dotted).
 */
export interface RefLine {
  name: string
  style: 'goal' | 'target' | 'base'
  value?: number
  values?: (number | null)[]
}

export interface ChartProps {
  title: string
  subtitle?: string
  days: DayKey[]
  series: Series[]
  values: (number | null)[][] // [series][day]
  refs?: RefLine[]
  yMin?: number
  yMax?: number
  format?: (v: number) => string
  height?: number
  /** tick step multiple, e.g. 30 for clock minutes */
  tickUnit?: number
  today?: DayKey
  /** what to do to get the first point */
  empty?: { text: string; action?: ReactNode }
}

const PAD = { l: 42, r: 12, t: 12, b: 26 }
const REF_STROKE: Record<RefLine['style'], { color: string; dash?: string; width: number }> = {
  goal: { color: 'var(--gold-mark)', width: 1.5 },
  target: { color: 'var(--mist)', dash: '5 4', width: 1.5 },
  base: { color: 'var(--mist)', dash: '1.5 4', width: 2 },
}

function niceTicks(min: number, max: number, n = 4, unit?: number): number[] {
  const span = max - min || 1
  const raw = span / n
  let step: number
  if (unit) step = Math.max(1, Math.ceil(raw / unit)) * unit
  else {
    const mag = 10 ** Math.floor(Math.log10(raw))
    step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  }
  const out: number[] = []
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

function RefSwatch({ style }: { style: RefLine['style'] }) {
  const s = REF_STROKE[style]
  return (
    <svg width="16" height="6" aria-hidden>
      <line x1="0" x2="16" y1="3" y2="3" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />
    </svg>
  )
}

export function Chart({ title, subtitle, days, series, values, refs = [], yMin, yMax, format = (v) => String(Math.round(v)), height = 180, tickUnit, today, empty }: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = days.length
  const refVals = (r: RefLine) => r.values ?? days.map(() => r.value ?? null)
  const all = [...values.flat(), ...refs.flatMap(refVals)].filter((v): v is number => v !== null && Number.isFinite(v))
  const hasData = values.flat().some((v) => v !== null)
  let lo = yMin ?? (all.length ? Math.min(...all) : 0)
  let hi = yMax ?? (all.length ? Math.max(...all) : 1)
  if (hi <= lo) hi = lo + (tickUnit ?? 1)
  const ticks = niceTicks(lo, hi, 4, tickUnit)
  lo = Math.min(lo, ticks[0])
  hi = Math.max(hi, ticks[ticks.length - 1])

  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const band = iw / Math.max(1, n)
  const x = (i: number) => PAD.l + band * i + band / 2
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih
  const bars = series.filter((s) => s.kind === 'bar')
  const barW = Math.max(3, Math.min(22, (band - 3) / Math.max(1, bars.length)))

  const linePath = (vals: (number | null)[]) => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const tIdx = today ? days.indexOf(today) : -1
  const xLabels = (n <= 7 ? days.map((_, i) => i).filter((i) => band >= 36 || i % 2 === 0 || i === tIdx) : [0, Math.floor((n - 1) / 2), n - 1]).filter(
    // never let a neighbour collide with the bold «сег.» label
    (i, _, arr) => i === tIdx || tIdx < 0 || !arr.includes(tIdx) || Math.abs(i - tIdx) * band >= 34,
  )
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!hasData) return
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - PAD.l) / band)
    setHover(i >= 0 && i < n ? i : null)
  }
  const showLegend = series.length > 1 || refs.length > 0

  return (
    <figure className="panel" style={{ margin: 0 }}>
      <figcaption className="stack" style={{ gap: 3, marginBottom: 10 }}>
        <h3>{title}</h3>
        {subtitle && <span className="tiny muted">{subtitle}</span>}
      </figcaption>
      {showLegend && (
        <div className="chart-legend">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.name}>
                <i style={{ width: 12, height: s.kind === 'line' ? 3 : 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
                {s.name}
              </span>
            ))}
          {refs.map((r) => (
            <span key={r.name}>
              <RefSwatch style={r.style} />
              {r.name}
            </span>
          ))}
        </div>
      )}
      <div ref={wrap} className="chart-wrap">
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${title}. ${subtitle ?? ''}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fontWeight={600} fill="var(--mist)">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={x(i)} y={height - 7} textAnchor="middle" fontSize={11} fontWeight={days[i] === today ? 800 : 600} fill={days[i] === today ? 'var(--ink)' : 'var(--mist)'}>
              {days[i] === today ? 'сег.' : formatDayShort(days[i])}
            </text>
          ))}
          {hover !== null && <rect x={PAD.l + band * hover} y={PAD.t} width={band} height={ih} rx={6} fill="var(--surface-2)" />}
          {refs.map((r) => {
            const s = REF_STROKE[r.style]
            const vals = refVals(r)
            return <path key={r.name} d={linePath(vals.map((v) => (v === null ? null : Math.min(hi, Math.max(lo, v)))))} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />
          })}
          {bars.map((s, si) => {
            const vals = values[series.indexOf(s)]
            return vals.map((v, i) => {
              if (v === null || v === 0) return null
              const bx = x(i) - (barW * bars.length) / 2 + si * barW + 1
              const top = y(Math.min(hi, Math.max(v, lo)))
              const base = y(Math.max(lo, 0))
              const h = Math.max(1.5, base - top)
              const bw = barW - 2
              const r = Math.min(4, h, bw / 2)
              const d = `M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${base} Z`
              return <path key={`${si}-${i}`} d={d} fill={s.colorAt ? s.colorAt(v, i) : s.color} />
            })
          })}
          {series
            .filter((s) => s.kind === 'line')
            .map((s) => {
              const vals = values[series.indexOf(s)]
              const last = vals.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1)
              return (
                <g key={s.name}>
                  <path d={linePath(vals)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {vals.map((v, i) =>
                    v !== null && (n <= 14 || i === last || i === hover) ? <circle key={i} cx={x(i)} cy={y(v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null,
                  )}
                </g>
              )
            })}
        </svg>
        {!hasData && empty && (
          <div className="chart-ghost">
            <div>
              <span>{empty.text}</span>
              {empty.action}
            </div>
          </div>
        )}
        {hover !== null && hasData && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(0, x(hover) - 79), w - 158) }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{formatDayShort(days[hover])}</div>
            {series.map((s, si) => (
              <div key={s.name} className="row between" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 6 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                  {s.name}
                </span>
                <span className="num">{values[si][hover] === null ? '—' : format(values[si][hover]!)}</span>
              </div>
            ))}
            {refs.map((r) => {
              const v = refVals(r)[hover]
              return (
                <div key={r.name} className="row between muted">
                  <span>{r.name}</span>
                  <span className="num">{v === null || v === undefined ? '—' : format(v)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {hasData && (
        <details style={{ marginTop: 6 }}>
          <summary className="tiny muted">Таблица</summary>
          <table className="tiny" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr className="muted">
                <th style={{ textAlign: 'left' }}>День</th>
                {series.map((s) => (
                  <th key={s.name} style={{ textAlign: 'right' }}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) =>
                values.some((vs) => vs[i] !== null) ? (
                  <tr key={d}>
                    <td>{formatDayShort(d)}</td>
                    {values.map((vs, si) => (
                      <td key={si} className="num" style={{ textAlign: 'right' }}>
                        {vs[i] === null ? '—' : format(vs[i]!)}
                      </td>
                    ))}
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  )
}
