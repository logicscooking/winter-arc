import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFx } from '../store/hooks'
import { useStore } from '../store/store'

/** Seeded pseudo-random so the snow layout is stable between renders */
function rnd(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

/** true while the system asks for less motion */
export function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)'
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(q)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(q).matches,
    () => false,
  )
}

// ---------- canvas snow ----------

interface Flake {
  x: number
  y: number
  r: number
  vy: number
  amp: number
  freq: number
  ph: number
  a: number
}

interface Layer {
  /** flakes per CSS px² of screen, clamped to [min, max] */
  density: number
  min: number
  max: number
  r: [number, number]
  /** fall speed in px/s at the smallest and the largest radius: bigger = closer = faster */
  vy: [number, number]
  a: [number, number]
  amp: [number, number]
}

/** behind the cards: many small, slow, dim flakes */
const BACK: Layer = { density: 1 / 4200, min: 36, max: 170, r: [0.7, 2.1], vy: [14, 38], a: [0.35, 0.85], amp: [6, 18] }
/** in front of the cards: a few big, soft, see-through flakes, rare enough to read through */
const FRONT: Layer = { density: 1 / 42000, min: 4, max: 18, r: [2.4, 4.2], vy: [44, 70], a: [0.22, 0.42], amp: [14, 30] }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function makeFlake(l: Layer, w: number, h: number, anywhere: boolean): Flake {
  const t = Math.random()
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -10 - Math.random() * 40,
    r: lerp(l.r[0], l.r[1], t),
    vy: lerp(l.vy[0], l.vy[1], t) * (0.85 + Math.random() * 0.3),
    amp: lerp(l.amp[0], l.amp[1], Math.random()),
    freq: 0.25 + Math.random() * 0.45,
    ph: Math.random() * Math.PI * 2,
    a: lerp(l.a[0], l.a[1], Math.random()),
  }
}

/** a soft round flake drawn once, then stamped with drawImage (cheaper than arc + fill per flake) */
function flakeSprite(color: string, soft: boolean) {
  const s = 32
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grd.addColorStop(0, color)
  grd.addColorStop(soft ? 0.35 : 0.6, color)
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  return c
}

/** the --snow token of the current theme, as an opaque color (alpha is per flake) */
function snowColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--snow').trim()
  const m = v.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/)
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : 'rgb(235, 246, 255)'
}

/**
 * Snowfall on two canvases driven by one rAF loop: a dense back layer behind the interface
 * and a sparse front layer over the cards. Sizes, speeds and alpha vary (parallax), every flake
 * sways on a sine. Density follows the screen area; the loop stops while the tab is hidden.
 * Off when the user turns snow off in «Ещё» and for prefers-reduced-motion.
 */
export function Snow() {
  const on = useStore((s) => s.data.settings.snow ?? true)
  const reduced = useReducedMotion()
  const back = useRef<HTMLCanvasElement>(null)
  const front = useRef<HTMLCanvasElement>(null)
  const run = on && !reduced

  useEffect(() => {
    if (!run) return
    const cb = back.current
    const cf = front.current
    if (!cb || !cf) return
    const xb = cb.getContext('2d')
    const xf = cf.getContext('2d')
    if (!xb || !xf) return
    let w = 0
    let h = 0
    let dpr = 1
    let flakesB: Flake[] = []
    let flakesF: Flake[] = []
    let spriteB = flakeSprite(snowColor(), false)
    let spriteF = flakeSprite(snowColor(), true)

    const fit = (list: Flake[], l: Layer) => {
      const n = Math.round(Math.min(l.max, Math.max(l.min, w * h * l.density)))
      if (list.length > n) return list.slice(0, n)
      const out = list.slice()
      while (out.length < n) out.push(makeFlake(l, w, h, true))
      return out
    }
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      // 2× is sharp enough for soft dots and halves the fill cost on 3× iPhones
      dpr = Math.min(2, window.devicePixelRatio || 1)
      for (const c of [cb, cf]) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      xb.setTransform(dpr, 0, 0, dpr, 0, 0)
      xf.setTransform(dpr, 0, 0, dpr, 0, 0)
      flakesB = fit(flakesB, BACK)
      flakesF = fit(flakesF, FRONT)
    }
    resize()

    const step = (ctx: CanvasRenderingContext2D, list: Flake[], l: Layer, sprite: HTMLCanvasElement, dt: number, t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        f.y += f.vy * dt
        if (f.y - f.r * 2 > h) {
          list[i] = makeFlake(l, w, h, false)
          continue
        }
        const x = f.x + Math.sin(t * f.freq + f.ph) * f.amp
        const d = f.r * 2.4
        ctx.globalAlpha = f.a
        ctx.drawImage(sprite, x - d / 2, f.y - d / 2, d, d)
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const t = now / 1000
      step(xb, flakesB, BACK, spriteB, dt, t)
      step(xf, flakesF, FRONT, spriteF, dt, t)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (raf || document.visibilityState !== 'visible') return
      last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop())
    // the theme changes the flake color
    const recolor = () => {
      const c = snowColor()
      spriteB = flakeSprite(c, false)
      spriteF = flakeSprite(c, true)
    }
    const mo = new MutationObserver(recolor)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', recolor)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', resize)
    start()
    return () => {
      stop()
      mo.disconnect()
      mq.removeEventListener('change', recolor)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [run])

  if (!run) return null
  return (
    <>
      <canvas ref={back} className="snow-canvas back" aria-hidden />
      <canvas ref={front} className="snow-canvas front" aria-hidden />
    </>
  )
}

// ---------- the garland over every screen ----------

const GARLAND_KEY = 'wa-top-garland'
const garlandSubs = new Set<() => void>()

function readGarland() {
  try {
    return localStorage.getItem(GARLAND_KEY) !== '0'
  } catch {
    return true
  }
}

/** «Гирлянда сверху»: a per-device switch kept outside the synced settings, on by default */
export function useTopGarlandPref() {
  return useSyncExternalStore(
    (cb) => {
      garlandSubs.add(cb)
      return () => garlandSubs.delete(cb)
    },
    readGarland,
    () => true,
  )
}

export function setTopGarlandPref(on: boolean) {
  try {
    if (on) localStorage.removeItem(GARLAND_KEY)
    else localStorage.setItem(GARLAND_KEY, '0')
  } catch {
    // private mode: the switch just lasts for this session
  }
  garlandSubs.forEach((cb) => cb())
}

/** wire supports and bulbs for a given width: sagging spans, a small bulb every ~26px along the wire */
function topGarlandLayout(w: number) {
  const top = 3
  const sag = 7
  const spans = Math.max(2, Math.round(w / 96))
  const sw = w / spans
  let d = `M0,${top}`
  for (let s = 0; s < spans; s++) {
    const a = s * sw
    d += ` Q${(a + sw / 2).toFixed(1)},${top + sag * 2} ${(a + sw).toFixed(1)},${top}`
  }
  const per = Math.max(2, Math.round(sw / 26))
  const bulbs: { x: number; y: number; tilt: number }[] = []
  for (let s = 0; s < spans; s++) {
    for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per
      // a symmetric quadratic: x is linear in t, y = top + 4·sag·t(1−t)
      const x = s * sw + sw * t
      const y = top + 4 * sag * t * (1 - t)
      // hang plumb at the bottom of the span, lean outwards towards the hooks
      bulbs.push({ x, y, tilt: (t - 0.5) * -26 + (bulbs.length % 2 ? 4 : -4) })
    }
  }
  return { d, bulbs }
}

/**
 * A thin string of lights along the bottom edge of the top bar, on every screen. Mounted once at the
 * App level, outside the router, so it never remounts and its slow glow never restarts on navigation.
 * CSS-only motion (opacity), static soft glow for prefers-reduced-motion, pointer-events: none.
 */
export function TopGarland({ hidden }: { hidden?: boolean }) {
  const on = useTopGarlandPref()
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 375 : window.innerWidth))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { d, bulbs } = useMemo(() => topGarlandLayout(w), [w])
  const H = 30
  return (
    <div ref={ref} className={`top-garland${hidden || !on ? ' is-off' : ''}`} aria-hidden>
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H}>
        <defs>
          {BULB_COLORS.map((c, k) => (
            <radialGradient key={c} id={`tg-glow-${k}`}>
              <stop offset="0%" stopColor={c} stopOpacity="0.6" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <path className="tg-wire" d={d} />
        {bulbs.map((b, i) => {
          const c = i % 4
          const y0 = b.y + 3.5
          const L = 8.5
          const W = 5.6
          const x = b.x
          const glass = `M${x - W * 0.3},${y0} L${x + W * 0.3},${y0} C${x + W * 0.8},${y0 + L * 0.3} ${x + W * 0.5},${y0 + L * 0.82} ${x},${y0 + L} C${x - W * 0.5},${y0 + L * 0.82} ${x - W * 0.8},${y0 + L * 0.3} ${x - W * 0.3},${y0} Z`
          // a slow wave runs along the string; each color breathes at its own pace
          const style = { '--bc': BULB_COLORS[c], '--tg-d': `${(-i * 0.45 - c * 0.9).toFixed(2)}s`, '--tg-t': `${[4.6, 5.4, 5, 5.8][c]}s` } as React.CSSProperties
          return (
            <g key={i} className="tg-bulb" style={style} transform={`rotate(${b.tilt.toFixed(1)} ${x.toFixed(1)} ${b.y.toFixed(1)})`}>
              <circle className="tg-glow" cx={x} cy={y0 + L * 0.55} r={9} fill={`url(#tg-glow-${c})`} />
              <path className="tg-glass" d={glass} />
              <path className="tg-lit" d={glass} />
              <ellipse className="tg-shine" cx={x - W * 0.17} cy={y0 + L * 0.36} rx={0.7} ry={1.5} />
              <rect className="tg-cap" x={x - 1.9} y={b.y - 0.5} width={3.8} height={4.2} rx={0.8} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const PARTY_COLORS = ['var(--gold-bright)', '#ff5a6a', '#43d57a', '#6cc6f2', '#ffffff']

/** One authored moment: a burst of garland light and snow, plus a card. Perfect day. */
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
