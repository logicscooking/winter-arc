import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'

import { PLINKO_RISKS, PLINKO_TIERS, slotsOf, tierOfSlot, type PlinkoDir, type PlinkoRisk } from '../engine'
import { buzz, sfxJackpot, sfxPeg, sfxSlot } from './plinkoFx'
import './plinko.css'

// ---------- board geometry (SVG units) ----------
const S = 40 // peg spacing = slot width
const Y0 = 40 // first peg row
const DY = 30 // row gap
const PEG_R = 3.6
const BALL_R = 9
const START_Y = 12
const BIN_H = 54
const TRAIL = 7

interface Geo {
  rows: number
  slots: number
  W: number
  H: number
  CX: number
  binTop: number
  restY: number
  pegX: (r: number, j: number) => number
  rowY: (r: number) => number
  slotX: (k: number) => number
}

function geoOf(risk: PlinkoRisk): Geo {
  const rows = PLINKO_RISKS[risk].rows
  const slots = slotsOf(risk)
  const W = S * (slots + 1)
  const CX = W / 2
  const binTop = Y0 + (rows - 1) * DY + 22
  return {
    rows,
    slots,
    W,
    H: binTop + BIN_H + 6,
    CX,
    binTop,
    restY: binTop - BALL_R + 3,
    pegX: (r, j) => CX + (j - r / 2) * S,
    rowY: (r) => Y0 + r * DY,
    slotX: (k) => CX + (k - (slots - 1) / 2) * S,
  }
}

interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  dur: number
  hop: number
  /** peg hit at the end of the segment: "row:j" */
  peg?: string
  row?: number
}

/** Keyframes of the fall: drop onto the top peg, one hop per row, into the bin. The last rows slow down (suspense). */
function segmentsOf(g: Geo, path: PlinkoDir[]): Seg[] {
  const segs: Seg[] = []
  const contact = (row: number, j: number) => ({ x: g.pegX(row, j), y: g.rowY(row) - PEG_R - BALL_R + 1 })
  const base = Math.max(150, 1500 / g.rows)
  const slow = (fromEnd: number) => (fromEnd === 2 ? 1.5 : fromEnd === 1 ? 1.95 : fromEnd === 0 ? 1.7 : 1)
  let p = contact(0, 0)
  segs.push({ x0: g.CX, y0: START_Y, x1: p.x, y1: p.y, dur: 360, hop: 0, peg: '0:0', row: 0 })
  let rights = 0
  for (let r = 0; r < g.rows; r++) {
    if (path[r] === 'R') rights++
    const fromEnd = g.rows - 1 - r
    if (r + 1 < g.rows) {
      const q = contact(r + 1, rights)
      segs.push({ x0: p.x, y0: p.y, x1: q.x, y1: q.y, dur: (base - r * 4) * slow(fromEnd), hop: 11 - r * 0.4 + (fromEnd <= 2 ? 4 : 0), peg: `${r + 1}:${rights}`, row: r + 1 })
      p = q
    } else {
      segs.push({ x0: p.x, y0: p.y, x1: g.slotX(rights), y1: g.restY, dur: 360 * slow(0), hop: 10 })
    }
  }
  return segs
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export interface PlinkoHandle {
  /** play a precomputed path; resolves when the ball rests in its slot */
  drop: (path: PlinkoDir[]) => Promise<void>
}

interface Landing {
  id: number
  slot: number
  tier: number
  jackpot: boolean
}

/** Plinko board: triangle of pegs, a glowing snowball with a tail, tiered slots with casino multipliers. The path comes from the engine. */
export function PlinkoBoard({ risk, restSlot, sound, ref }: { risk: PlinkoRisk; restSlot: number | null; sound: boolean; ref?: Ref<PlinkoHandle> }) {
  const g = geoOf(risk)
  const ball = useRef<SVGGElement>(null)
  const trail = useRef<(SVGCircleElement | null)[]>([])
  const pegEls = useRef(new Map<string, SVGCircleElement>())
  const raf = useRef(0)
  const fallingRef = useRef(false)
  const [falling, setFalling] = useState(false)
  const [landing, setLanding] = useState<Landing | null>(null)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  const place = (x: number, y: number, sx = 1, sy = 1) => {
    ball.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`)
  }
  const hist = useRef<{ x: number; y: number }[]>([])
  const drawTrail = (x?: number, y?: number) => {
    if (x === undefined || y === undefined) hist.current = []
    else {
      hist.current.unshift({ x, y })
      hist.current.length = Math.min(hist.current.length, TRAIL * 2)
    }
    trail.current.forEach((c, i) => {
      if (!c) return
      const p = hist.current[(i + 1) * 2 - 1]
      if (!p) return c.setAttribute('opacity', '0')
      c.setAttribute('cx', p.x.toFixed(1))
      c.setAttribute('cy', p.y.toFixed(1))
      c.setAttribute('opacity', (0.5 * (1 - i / TRAIL)).toFixed(2))
    })
  }
  const flashPeg = (key: string) => {
    const el = pegEls.current.get(key)
    if (!el) return
    el.classList.remove('hit')
    void el.getBoundingClientRect()
    el.classList.add('hit')
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => setLanding(null), [risk])

  const land = (slot: number) => {
    const tier = tierOfSlot(slot, risk)
    const jackpot = slot === 0 || slot === g.slots - 1
    setLanding({ id: Date.now(), slot, tier, jackpot })
    if (soundRef.current) {
      sfxSlot(tier)
      if (jackpot) sfxJackpot()
    }
    buzz(jackpot ? [30, 50, 30, 50, 70] : tier >= 3 ? [18, 40, 24] : 16)
  }

  useImperativeHandle(ref, () => ({
    drop: (path) =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(raf.current)
        setLanding(null)
        const segs = segmentsOf(g, path)
        const last = segs[segs.length - 1]
        const slot = path.filter((d) => d === 'R').length
        if (reduced()) {
          place(last.x1, last.y1)
          land(slot)
          resolve()
          return
        }
        setFalling(true)
        fallingRef.current = true
        drawTrail()
        let i = 0
        let t0 = performance.now()
        let over = false
        const finishFall = () => {
          if (over) return
          over = true
          cancelAnimationFrame(raf.current)
          clearTimeout(guard)
          place(last.x1, last.y1)
          drawTrail()
          fallingRef.current = false
          setFalling(false)
          land(slot)
          resolve()
        }
        // rAF pauses in a hidden tab: never leave the throw hanging
        const guard = setTimeout(finishFall, segs.reduce((a, s) => a + s.dur, 0) + 900)
        const step = (now: number) => {
          // finish every segment whose time is up (a slow frame never stretches the fall)
          let el = now - t0
          let hits = 0
          while (i < segs.length && el >= segs[i].dur) {
            const s = segs[i]
            if (s.peg) {
              flashPeg(s.peg)
              if (hits++ === 0 && soundRef.current) sfxPeg(s.row ?? 0, g.rows)
            }
            el -= s.dur
            i++
          }
          t0 = now - el
          if (hits) buzz(6)
          if (i >= segs.length) return finishFall()
          const s = segs[i]
          const t = el / s.dur
          const x = s.x0 + (s.x1 - s.x0) * easeOut(t)
          // gravity: y grows with t², plus a small hop off the peg
          const y = s.y0 + (s.y1 - s.y0) * t * t - s.hop * 4 * t * (1 - t)
          const sq = t < 0.1 ? 0.88 + t * 1.2 : 1
          place(x, y, 2 - sq, sq)
          drawTrail(x, y)
          raf.current = requestAnimationFrame(step)
        }
        place(g.CX, START_Y)
        raf.current = requestAnimationFrame(step)
      }),
  }))

  // where the ball waits when nothing is falling (a finished fall already left it there)
  useEffect(() => {
    if (fallingRef.current) return
    if (restSlot === null || restSlot >= g.slots) place(g.CX, START_Y)
    else place(g.slotX(restSlot), g.restY)
  }, [restSlot, risk]) // eslint-disable-line react-hooks/exhaustive-deps

  const pegs: { key: string; x: number; y: number; edge: boolean }[] = []
  for (let r = 0; r < g.rows; r++) for (let j = -1; j <= r + 1; j++) pegs.push({ key: `${r}:${j}`, x: g.pegX(r, j), y: g.rowY(r), edge: j < 0 || j > r })
  const wide = g.slots > 9
  const sparks = landing && !reduced() ? Array.from({ length: 6 + landing.tier * 3 }, (_, i) => i) : []

  return (
    <div className={`pk-stage ${landing?.jackpot ? 'shake' : ''}`}>
      <svg className="pk-board" viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="Доска Плинко: центр — лёгкие задания, края — тяжёлые">
        <defs>
          <radialGradient id="pk-ball" cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#dff3ff" />
            <stop offset="100%" stopColor="#8fd3ff" />
          </radialGradient>
        </defs>

        {/* slots with casino multipliers */}
        {Array.from({ length: g.slots }, (_, k) => {
          const tier = tierOfSlot(k, risk)
          const x = g.slotX(k) - S / 2 + 2
          return (
            <g key={`${risk}${k}${landing?.slot === k ? landing.id : ''}`} className={`pk-bin t${tier} ${landing?.slot === k ? 'lit' : ''}`}>
              <rect x={x} y={g.binTop} width={S - 4} height={BIN_H} rx={8} />
              <text x={g.slotX(k)} y={g.binTop + (wide ? 32 : 25)} className={`pk-bin-mult ${wide ? 'wide' : ''}`}>
                ×{PLINKO_TIERS[tier].mult}
              </text>
              {!wide && (
                <text x={g.slotX(k)} y={g.binTop + 41} className="pk-bin-unit">
                  {PLINKO_TIERS[tier].xp} XP
                </text>
              )}
            </g>
          )
        })}

        {pegs.map((p) => (
          <circle
            key={p.key}
            ref={(el) => {
              if (el) pegEls.current.set(p.key, el)
              else pegEls.current.delete(p.key)
            }}
            className={`pk-peg ${p.edge ? 'edge' : ''}`}
            cx={p.x}
            cy={p.y}
            r={PEG_R}
          />
        ))}

        {/* tail */}
        {Array.from({ length: TRAIL }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              trail.current[i] = el
            }}
            className="pk-trail"
            r={BALL_R * (1 - (i + 1) / (TRAIL + 2))}
            opacity={0}
          />
        ))}

        {/* sparks and snowflakes from the slot */}
        {landing && sparks.length > 0 && (
          <g key={landing.id} className={`pk-sparks t${landing.tier}`} transform={`translate(${g.slotX(landing.slot)} ${g.binTop + 4})`}>
            {sparks.map((i) => {
              const a = -Math.PI / 2 + (i / Math.max(1, sparks.length - 1) - 0.5) * Math.PI * 1.15
              const d = 34 + ((i * 37) % 28) + landing.tier * 6
              const big = i % 3 === 0
              return (
                <rect
                  key={i}
                  className={`pk-spark ${big ? 'flake' : ''}`}
                  x={big ? -2.5 : -1.5}
                  y={big ? -2.5 : -1.5}
                  width={big ? 5 : 3}
                  height={big ? 5 : 3}
                  style={{ ['--dx' as string]: `${(Math.cos(a) * d).toFixed(1)}px`, ['--dy' as string]: `${(Math.sin(a) * d).toFixed(1)}px`, animationDelay: `${(i % 4) * 25}ms` }}
                />
              )
            })}
          </g>
        )}

        {/* ball: a glowing snowball with a pixel snowflake */}
        <g ref={ball} className={`pk-ball ${falling ? 'falling' : restSlot === null ? 'idle' : ''}`}>
          <g className="pk-ball-in">
            <circle r={BALL_R + 6} className="pk-ball-glow" />
            <circle r={BALL_R} fill="url(#pk-ball)" />
            <path className="pk-ball-flake" d="M-1 -6h2v12h-2z M-6 -1h12v2h-12z M-4 -4h2v2h-2z M2 -4h2v2h-2z M-4 2h2v2h-2z M2 2h2v2h-2z" />
          </g>
        </g>
      </svg>
      {landing?.jackpot && (
        <div className="pk-jackpot" role="status" key={landing.id}>
          <span>ДЖЕКПОТ</span>
          <small>×{PLINKO_TIERS[landing.tier as 1].mult} XP</small>
        </div>
      )}
    </div>
  )
}

// ---------- task card ----------

/** 1:05:09 / 9:59 */
export function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Number that runs up from 0 (instant under reduced motion) */
export function useCountUp(target: number, ms = 750): number {
  const [v, setV] = useState(() => (reduced() ? target : 0))
  useEffect(() => {
    let raf = 0
    if (reduced()) {
      raf = requestAnimationFrame(() => setV(target))
      return () => cancelAnimationFrame(raf)
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

const fmtMult = (m: number) => `×${String(m).replace('.', ',')}`

export interface PlinkoCardProps {
  icon: ReactNode
  title: string
  hint: string
  tier: number
  statLabel: string
  /** XP with the streak applied */
  xp: number
  shards: number
  /** streak multiplier of this throw */
  streak: number
  /** ms left on the timer (≤ 0 → expired) */
  left: number
  total: number
  doneXp?: number
  onDone?: (el: HTMLElement) => void
  onLater?: () => void
}

/** The task card that slides up from under the board after the ball lands */
export function PlinkoCard({ icon, title, hint, tier, statLabel, xp, shards, streak, left, total, doneXp, onDone, onLater }: PlinkoCardProps) {
  const expired = left <= 0
  const done = doneXp !== undefined
  const showXp = done ? doneXp : expired ? Math.floor(xp / 2) : xp
  const showIce = expired && !done ? Math.floor(shards / 2) : shards
  const xpRun = useCountUp(showXp)
  const iceRun = useCountUp(showIce)
  const nextStreak = Math.min(2, Math.round((streak + 0.2) * 10) / 10)
  return (
    <section className={`pk-card t${tier}`} aria-live="polite">
      <div className="pk-card-top">
        <span className="pk-card-ico">{icon}</span>
        <div className="grow">
          <small className="pk-card-tier">
            ×{PLINKO_TIERS[tier as 1].mult} · {statLabel}
          </small>
          <h3>{title}</h3>
          <p className="small muted">{hint}</p>
        </div>
      </div>
      <div className="pk-card-reward num" aria-label={`+${showXp} XP, +${showIce} снежинок`}>
        <span className="xp">+{xpRun} XP</span>
        <span className="ice">+{iceRun} ❄</span>
        {streak > 1 && !expired && !done && <span className="pk-streak">серия {fmtMult(streak)}</span>}
        {!done && expired && <span className="small muted">после таймера — половина</span>}
      </div>
      {done ? (
        <div className="pk-card-done">Сделано: +{doneXp} XP</div>
      ) : (
        <>
          <div className={`pk-timer ${expired ? 'out' : ''}`} role="timer">
            <span className="pk-timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / total))})` }} />
            <span className="pk-timer-text num">{expired ? 'Время вышло' : formatLeft(left)}</span>
          </div>
          {!expired && (
            <p className="tiny muted pk-card-note">
              Успеешь до нуля — ещё шар и серия {fmtMult(nextStreak)} на следующий бросок. «Позже» сбрасывает серию.
            </p>
          )}
          <div className="pk-card-actions">
            <button className="btn primary" onClick={(e) => onDone?.(e.currentTarget)}>
              Сделал
            </button>
            <button className="btn ghost" onClick={onLater}>
              Позже
            </button>
          </div>
        </>
      )}
    </section>
  )
}
