import { useEffect, useRef, useState } from 'react'
import { formatDayShort } from '../engine'
import type { DayKey } from '../engine'

export interface Series {
  name: string
  color: string
  kind: 'line' | 'bar'
  /** colour override per point (e.g. over the limit) */
  colorAt?: (v: number, i: number) => string
}

export interface ChartProps {
  title: string
  subtitle?: string
  days: DayKey[]
  series: Series[]
  values: (number | null)[][] // [series][day]
  reference?: { name: string; values: (number | null)[] }
  yMin?: number
  yMax?: number
  format?: (v: number) => string
  height?: number
  /** tick step multiple, e.g. 30 for clock minutes */
  tickUnit?: number
}

const PAD = { l: 40, r: 10, t: 10, b: 24 }

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

export function Chart({ title, subtitle, days, series, values, reference, yMin, yMax, format = (v) => String(Math.round(v)), height = 180, tickUnit }: ChartProps) {
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

  const all = [...values.flat(), ...(reference?.values ?? [])].filter((v): v is number => v !== null && Number.isFinite(v))
  const hasData = values.flat().some((v) => v !== null)
  let lo = yMin ?? Math.min(...all, 0)
  let hi = yMax ?? Math.max(...all, 1)
  if (yMin === undefined && all.length) lo = Math.min(...all)
  if (hi <= lo) hi = lo + 1
  const ticks = niceTicks(lo, hi, 4, tickUnit)
  lo = Math.min(lo, ticks[0])
  hi = Math.max(hi, ticks[ticks.length - 1])

  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const n = days.length
  const band = iw / Math.max(1, n)
  const x = (i: number) => PAD.l + band * i + band / 2
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih
  const bars = series.filter((s) => s.kind === 'bar')
  const barW = Math.max(2, Math.min(24, (band - 2) / Math.max(1, bars.length)))

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

  const xLabels = n <= 7 ? days.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.floor((px - PAD.l) / band)
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <figure className="panel" style={{ margin: 0 }}>
      <figcaption className="stack" style={{ gap: 2, marginBottom: 10 }}>
        <h3>{title}</h3>
        {subtitle && <span className="tiny muted">{subtitle}</span>}
      </figcaption>
      {(series.length > 1 || reference) && (
        <div className="row wrap tiny" style={{ gap: 14, marginBottom: 8, color: 'var(--ink-2)' }}>
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}>
              <i style={{ width: 12, height: s.kind === 'line' ? 2 : 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
              {s.name}
            </span>
          ))}
          {reference && (
            <span className="row" style={{ gap: 6 }}>
              <i style={{ width: 14, height: 0, borderTop: '2px dashed var(--mist)', display: 'inline-block' }} />
              {reference.name}
            </span>
          )}
        </div>
      )}
      <div ref={wrap} className="chart-wrap" style={{ position: 'relative' }}>
        {!hasData ? (
          <div className="empty" style={{ height }}>
            Пока нет данных за этот период
          </div>
        ) : (
          <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${title}. ${subtitle ?? ''}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--mist)">
                  {format(t)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--mist)">
                {formatDayShort(days[i])}
              </text>
            ))}
            {hover !== null && <rect x={PAD.l + band * hover} y={PAD.t} width={band} height={ih} fill="rgba(127,227,241,0.06)" />}
            {bars.map((s, si) => {
              const vals = values[series.indexOf(s)]
              return vals.map((v, i) => {
                if (v === null || v === 0) return null
                const bx = x(i) - (barW * bars.length) / 2 + si * barW + 1
                const top = y(Math.max(v, lo))
                const base = y(Math.max(lo, 0))
                const h = Math.max(1, base - top)
                const r = Math.min(4, h, (barW - 2) / 2)
                const bw = barW - 2
                const d = `M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${base} Z`
                return <path key={`${si}-${i}`} d={d} fill={s.colorAt ? s.colorAt(v, i) : s.color} />
              })
            })}
            {reference && <path d={linePath(reference.values)} fill="none" stroke="var(--mist)" strokeWidth={1.5} strokeDasharray="5 4" />}
            {series
              .filter((s) => s.kind === 'line')
              .map((s) => {
                const vals = values[series.indexOf(s)]
                const last = vals.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1)
                return (
                  <g key={s.name}>
                    <path d={linePath(vals)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {vals.map((v, i) =>
                      v !== null && (n <= 14 || i === last || i === hover) ? <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--deep)" strokeWidth={2} /> : null,
                    )}
                  </g>
                )
              })}
          </svg>
        )}
        {hover !== null && hasData && (
          <div
            className="panel tight tiny"
            style={{
              position: 'absolute',
              top: 0,
              left: Math.min(Math.max(0, x(hover) - 70), w - 150),
              width: 150,
              pointerEvents: 'none',
              background: 'var(--raised-2)',
              borderColor: 'var(--line)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatDayShort(days[hover])}</div>
            {series.map((s, si) => (
              <div key={s.name} className="row between" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 6 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                  {s.name}
                </span>
                <span className="num">{values[si][hover] === null ? '—' : format(values[si][hover]!)}</span>
              </div>
            ))}
            {reference && (
              <div className="row between muted">
                <span>{reference.name}</span>
                <span className="num">{reference.values[hover] === null ? '—' : format(reference.values[hover]!)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {hasData && (
        <details style={{ marginTop: 8 }}>
          <summary className="tiny muted" style={{ cursor: 'pointer' }}>
            Таблица
          </summary>
          <table className="tiny" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr className="muted">
                <th style={{ textAlign: 'left' }}>День</th>
                {series.map((s) => (
                  <th key={s.name} style={{ textAlign: 'right' }}>
                    {s.name}
                  </th>
                ))}
                {reference && <th style={{ textAlign: 'right' }}>{reference.name}</th>}
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
                    {reference && (
                      <td className="num" style={{ textAlign: 'right' }}>
                        {reference.values[i] === null ? '—' : format(reference.values[i]!)}
                      </td>
                    )}
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
