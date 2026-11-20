import { useEffect, useMemo, useRef, useState } from 'react'
import { useFx } from '../store/hooks'
import { useStore } from '../store/store'

/** Seeded pseudo-random so the snow layout is stable between renders */
function rnd(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

/**
 * Light snowfall: ~22 compositor-only flakes. Off for prefers-reduced-motion (CSS),
 * when the user turns it off in «Ещё», and while the tab is hidden.
 */
export function Snow() {
  const on = useStore((s) => s.data.settings.snow ?? true)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    const v = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', v)
    return () => document.removeEventListener('visibilitychange', v)
  }, [])
  const flakes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: `${Math.round(rnd(i + 1) * 100)}%`,
        s: `${Math.round(2 + rnd(i + 7) * 3)}px`,
        d: `${(14 + rnd(i + 13) * 16).toFixed(1)}s`,
        delay: `${(-rnd(i + 29) * 30).toFixed(1)}s`,
        drift: `${Math.round((rnd(i + 41) - 0.5) * 60)}px`,
      })),
    [],
  )
  if (!on || !visible) return null
  return (
    <div className="snow" aria-hidden>
      {flakes.map((f, i) => (
        <i key={i} style={{ '--x': f.x, '--s': f.s, '--d': f.d, '--delay': f.delay, '--drift': f.drift } as React.CSSProperties} />
      ))}
    </div>
  )
}

const PARTY_COLORS = ['var(--gold-bright)', '#ff5a6a', '#43d57a', '#6cc6f2', '#ffffff']

/** One authored moment: a burst of garland light and snow, plus a card. Perfect day / boss defeated. */
export function Party() {
  const party = useFx((s) => s.party)
  const bits = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = rnd(i + 3) * Math.PI * 2
        const dist = 120 + rnd(i + 11) * 170
        return {
          dx: `${Math.round(Math.cos(a) * dist)}px`,
          dy: `${Math.round(Math.sin(a) * dist + 80)}px`,
          s: `${Math.round(5 + rnd(i + 5) * 7)}px`,
          br: i % 3 === 0 ? '2px' : '50%',
          c: PARTY_COLORS[i % PARTY_COLORS.length],
          rot: `${Math.round(rnd(i + 17) * 540)}deg`,
          delay: `${(rnd(i + 23) * 0.18).toFixed(2)}s`,
        }
      }),
    // new layout per celebration
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party?.id],
  )
  if (!party) return null
  return (
    <div className="party" key={party.id} role="status" aria-live="polite">
      {bits.map((b, i) => (
        <i key={i} style={{ '--dx': b.dx, '--dy': b.dy, '--s': b.s, '--br': b.br, '--c': b.c, '--rot': b.rot, '--delay': b.delay } as React.CSSProperties} />
      ))}
      <div className="party-card">
        <div className="big-title">{party.title}</div>
        {party.text && <p>{party.text}</p>}
      </div>
    </div>
  )
}

export interface Bulb {
  id: string
  main: boolean
  on: boolean
}

const BULB_COLORS = ['#ffc94a', '#ff5a6a', '#43d57a', '#6cc6f2']

/** Garland progress: one bulb per quest of the day, lit when it is done. */
export function Garland({ bulbs, label }: { bulbs: Bulb[]; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(340)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setCw(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const n = bulbs.length
  if (!n) return null
  // the wire always spans the full width; bulbs spread evenly but never further than 64px apart
  const step = Math.min(64, cw / n)
  const w = cw
  const h = 60
  const top = 8
  const sag = 9
  const offset = (w - step * n) / 2
  const xs = bulbs.map((_, i) => offset + step / 2 + i * step)
  // wire: hooks between bulbs, a soft sag in each span
  let d = `M0,${top}`
  const pts = [0, ...xs.map((x) => x), w]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const y = i === 1 || i === pts.length - 1 ? top + sag * 0.6 : top + sag
    d += ` Q${((a + b) / 2).toFixed(1)},${(y + sag * 0.6).toFixed(1)} ${b.toFixed(1)},${i === pts.length - 1 ? top : top + sag * 0.25}`
  }
  const lit = bulbs.filter((b) => b.on).length
  const all = lit === n
  return (
    <div className={`garland ${all ? 'all' : ''}`} ref={ref}>
      <div className="garland-head">
        <span>{label ?? 'Гирлянда дня'}</span>
        <span className="num small muted">
          {lit} из {n}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Выполнено ${lit} из ${n} квестов дня`}>
        <defs>
          {BULB_COLORS.map((c, k) => (
            <radialGradient key={c} id={`glow-${k}`}>
              <stop offset="0%" stopColor={c} stopOpacity="0.55" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <path className="wire" d={d} />
        {bulbs.map((b, i) => {
          const x = xs[i]
          const y = top + sag * 0.25 - 1
          const r = b.main ? 11 : 9
          const c = i % 4
          // a real string light: plastic socket clipped to the wire, a glass drop hanging from it, every other one tilted
          const sw = r * 0.75
          const y0 = y + 7
          const L = r * 2.3
          const W = r * 1.35
          const glass = `M${x - W * 0.3},${y0} L${x + W * 0.3},${y0} C${x + W * 0.78},${y0 + L * 0.3} ${x + W * 0.5},${y0 + L * 0.82} ${x},${y0 + L} C${x - W * 0.5},${y0 + L * 0.82} ${x - W * 0.78},${y0 + L * 0.3} ${x - W * 0.3},${y0} Z`
          return (
            <g key={b.id} transform={`rotate(${i % 2 ? 12 : -12} ${x} ${y})`} style={{ '--bc': BULB_COLORS[c], '--tw': `${(i % 5) * 0.35}s` } as React.CSSProperties}>
              {b.on && <circle className="glow" cx={x} cy={y0 + L * 0.55} r={r * 2.1} fill={`url(#glow-${c})`} />}
              <path className={`bulb ${b.main ? 'main' : ''} ${b.on ? 'on' : ''}`} d={glass} />
              {b.on && <ellipse className="shine" cx={x - W * 0.18} cy={y0 + L * 0.35} rx={r * 0.14} ry={r * 0.32} />}
              <rect className="cap" x={x - sw / 2} y={y} width={sw} height={8} rx={1.5} />
              <rect className="cap-rib" x={x - sw / 2} y={y + 3} width={sw} height={1.2} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
