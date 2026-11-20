import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'

import { BOARD_SLOTS, BOARD_TIERS, PLINKO_TIERS, isJackpotSlot, levelOfSlot, type PlinkoTask } from '../engine'
import { SIM, SIM_ROWS, SIM_STEP, SIM_WALLS, pegX, pegY, slotX, type SimResult } from '../engine/plinkoSim'
import { Px } from '../pixel/Pixel'
import { SPRITES, type SpriteName } from '../pixel/sprites'
import { buzz, sfxJackpot, sfxPeg, sfxSlot } from './plinkoFx'
import './plinko.css'

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const iconOf = (id: string | undefined): SpriteName => (id && id in SPRITES ? (id as SpriteName) : 'dice')

/** cold centre → warm edges, by level 0..7 (matches .lv0….lv7 in plinko.css) */
export const LEVEL_COLORS = ['#8fd3ff', '#74c7f0', '#6fd6c4', '#9fdc7c', '#ffd36b', '#ffab5c', '#ff7d55', '#ff5c78']
const TRAIL = 9
const PEG_COLS = SIM_ROWS
const pegKey = (r: number, j: number) => r * 32 + j

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
}

interface Landing {
  id: number
  slot: number
  jackpot: boolean
  /** the slot's task at the moment of landing (the slot is refilled later) */
  task?: PlinkoTask
}

export interface PlinkoHandle {
  /** play a simulated fall; resolves once the ball has dropped into its slot */
  drop: (sim: SimResult) => Promise<void>
}

interface BoardProps {
  /** the 16 slot tasks, left to right */
  tasks: (PlinkoTask | undefined)[]
  /** slot of today's last drop (stays lit) */
  restSlot: number | null
  /** a ball waits at the top */
  ready: boolean
  sound: boolean
  ref?: Ref<PlinkoHandle>
}

/**
 * Plinko board: canvas for the pegs and the ball (real physics frames from engine/plinkoSim.ts),
 * DOM for the 16 task slots and the caption ribbon.
 */
export function PlinkoBoard({ tasks, restSlot, ready, sound, ref }: BoardProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])
  const readyRef = useRef(ready)
  const tasksRef = useRef(tasks)
  useEffect(() => {
    tasksRef.current = tasks
  })

  // render state lives in refs: the canvas is redrawn without React
  const st = useRef({
    scale: 1,
    dpr: 1,
    ball: null as { x: number; y: number; a: number } | null,
    trail: [] as { x: number; y: number }[],
    flash: new Map<number, number>(),
    parts: [] as Particle[],
    raf: 0,
    loop: false,
    playing: null as null | ((now: number) => boolean),
    lastNow: 0,
  })
  const [falling, setFalling] = useState(false)
  const [landing, setLanding] = useState<Landing | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  const draw = useCallback((now: number) => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const s = st.current
    const k = s.scale * s.dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(k, 0, 0, k, 0, 0)

    // frame: the triangle walls and the slot dividers
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.16)'
    ctx.lineWidth = 2
    for (const w of SIM_WALLS.slice(0, 4)) {
      ctx.beginPath()
      ctx.moveTo(w.ax, w.ay)
      ctx.lineTo(w.bx, Math.min(w.by, SIM.H))
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.22)'
    ctx.lineWidth = 1.4
    for (const w of SIM_WALLS.slice(4)) {
      ctx.beginPath()
      ctx.moveTo(w.ax, w.ay)
      ctx.lineTo(w.bx, SIM.H)
      ctx.stroke()
    }

    // pegs, flashing on real hits
    for (let r = 0; r < PEG_COLS; r++) {
      for (let j = 0; j <= r + 2; j++) {
        const x = pegX(r, j)
        const y = pegY(r)
        const t0 = s.flash.get(pegKey(r, j))
        const f = t0 === undefined ? 0 : Math.max(0, 1 - (now - t0) / 300)
        if (f > 0) {
          ctx.fillStyle = `rgba(190, 235, 255, ${0.35 * f})`
          ctx.beginPath()
          ctx.arc(x, y, SIM.pegR + 5 * f, 0, Math.PI * 2)
          ctx.fill()
        } else if (t0 !== undefined) s.flash.delete(pegKey(r, j))
        const edge = j === 0 || j === r + 2
        ctx.fillStyle = f > 0 ? '#ffffff' : edge ? 'rgba(236, 246, 255, 0.5)' : 'rgba(236, 246, 255, 0.85)'
        ctx.beginPath()
        ctx.arc(x, y, SIM.pegR * (1 + 0.5 * f), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // tail
    s.trail.forEach((p, i) => {
      const a = 0.42 * (1 - i / TRAIL)
      ctx.fillStyle = `rgba(191, 230, 255, ${a})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, SIM.ballR * (1 - (i + 1) / (TRAIL + 3)), 0, Math.PI * 2)
      ctx.fill()
    })

    // the ball: a glowing snowball with a pixel snowflake
    if (s.ball && s.ball.a > 0) {
      const { x, y, a } = s.ball
      const R = SIM.ballR
      ctx.globalAlpha = a
      ctx.fillStyle = 'rgba(143, 211, 255, 0.22)'
      ctx.beginPath()
      ctx.arc(x, y, R + 4, 0, Math.PI * 2)
      ctx.fill()
      const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, 0.5, x, y, R * 1.2)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.55, '#dff3ff')
      g.addColorStop(1, '#8fd3ff')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(61, 143, 196, 0.85)'
      const u = R / 6
      ctx.fillRect(x - u * 0.6, y - u * 3.6, u * 1.2, u * 7.2)
      ctx.fillRect(x - u * 3.6, y - u * 0.6, u * 7.2, u * 1.2)
      ctx.globalAlpha = 1
    }

    // sparks and snowflakes
    for (const p of s.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1
  }, [])

  // one rAF loop while anything moves; idle boards cost nothing
  const kick = useCallback(() => {
    const s = st.current
    if (s.loop) return
    s.loop = true
    s.lastNow = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - s.lastNow) / 1000)
      s.lastNow = now
      const playing = s.playing ? s.playing(now) : false
      for (const p of s.parts) {
        p.vy += 520 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      s.parts = s.parts.filter((p) => p.life > 0)
      draw(now)
      if (playing || s.parts.length || s.flash.size) s.raf = requestAnimationFrame(frame)
      else s.loop = false
    }
    s.raf = requestAnimationFrame(frame)
  }, [draw])

  // canvas size follows its CSS width
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const fit = () => {
      const w = c.clientWidth || SIM.W
      const s = st.current
      s.dpr = Math.min(3, window.devicePixelRatio || 1)
      s.scale = w / SIM.W
      c.width = Math.round(w * s.dpr)
      c.height = Math.round(((w * SIM.H) / SIM.W) * s.dpr)
      draw(performance.now())
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])

  // the waiting ball at the apex
  useEffect(() => {
    readyRef.current = ready
    const s = st.current
    if (s.playing) return
    s.ball = ready ? { x: SIM.CX, y: SIM.startY, a: 1 } : null
    draw(performance.now())
  }, [ready, draw])

  const land = (slot: number) => {
    const s = st.current
    const lv = levelOfSlot(slot)
    const jackpot = isJackpotSlot(slot)
    const tier = BOARD_TIERS[slot]
    setLanding({ id: Date.now(), slot, jackpot, task: tasksRef.current[slot] })
    setPicked(null)
    if (soundRef.current) {
      sfxSlot(tier)
      if (jackpot) sfxJackpot()
    }
    buzz(jackpot ? [30, 50, 30, 50, 70] : tier >= 3 ? [18, 40, 24] : 16)
    if (!reduced()) {
      const n = 10 + tier * 5
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
        const sp = 90 + Math.random() * (110 + tier * 30)
        s.parts.push({
          x: slotX(slot) + (Math.random() - 0.5) * 8,
          y: SIM.landY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.7 + Math.random() * 0.5,
          max: 1.2,
          size: i % 3 === 0 ? 4 : 2.5,
          color: i % 3 === 0 ? '#eaf7ff' : LEVEL_COLORS[lv],
        })
      }
      kick()
    }
  }

  useImperativeHandle(ref, () => ({
    drop: (sim) =>
      new Promise<void>((resolve) => {
        const s = st.current
        cancelAnimationFrame(s.raf)
        s.loop = false
        setLanding(null)
        setPicked(null)
        const last = sim.frames - 1
        let over = false
        const finish = () => {
          if (over) return
          over = true
          clearTimeout(guard)
          document.removeEventListener('visibilitychange', onHide)
          s.playing = null
          s.trail = []
          s.ball = null
          setFalling(false)
          land(sim.slot)
          // the next ball appears at the apex after the landing settles
          setTimeout(() => {
            if (!st.current.playing && readyRef.current) {
              st.current.ball = { x: SIM.CX, y: SIM.startY, a: 1 }
              draw(performance.now())
            }
          }, 700)
          draw(performance.now())
          resolve()
        }
        // a hidden tab pauses rAF: finish the throw right away (the outcome is already known)
        const onHide = () => document.hidden && finish()
        if (reduced() || document.hidden) {
          finish()
          return
        }
        document.addEventListener('visibilitychange', onHide)
        const guard = setTimeout(finish, sim.seconds * 1000 + 2500)
        const byFrame = new Map<number, typeof sim.hits>()
        for (const h of sim.hits) byFrame.set(h.f, [...(byFrame.get(h.f) ?? []), h])
        const knocks = new Set(sim.knocks.map((k) => k.f))
        let f = 0
        let acc = 0
        let t0 = -1
        let lastSfx = 0
        let lastBuzz = 0
        setFalling(true)
        s.trail = []
        s.ball = { x: sim.xs[0], y: sim.ys[0], a: 1 }
        s.playing = (now) => {
          // real time, capped: a throttled tab catches up in jumps instead of crawling
          const dt = t0 < 0 ? 0 : Math.min(0.2, (now - t0) / 1000)
          t0 = now
          acc += dt
          // fixed step: walk the recorded frames, fire their peg hits
          while (acc >= SIM_STEP && f < last) {
            acc -= SIM_STEP
            f++
            const hs = byFrame.get(f)
            if (hs) {
              for (const h of hs) s.flash.set(pegKey(h.row, h.j), now)
              const h = hs[0]
              if (soundRef.current && now - lastSfx > 45) {
                lastSfx = now
                sfxPeg(h.row, SIM_ROWS, Math.min(1, h.v / 420))
              }
              if (h.v > 160 && now - lastBuzz > 110) {
                lastBuzz = now
                buzz(5)
              }
            } else if (knocks.has(f) && soundRef.current && now - lastSfx > 45) {
              lastSfx = now
              sfxPeg(SIM_ROWS, SIM_ROWS, 0.5)
            }
          }
          if (f >= last) {
            finish()
            return false
          }
          const a = acc / SIM_STEP
          const x = sim.xs[f] + (sim.xs[f + 1] - sim.xs[f]) * a
          const y = sim.ys[f] + (sim.ys[f + 1] - sim.ys[f]) * a
          s.ball = { x, y, a: 1 }
          s.trail.unshift({ x, y })
          if (s.trail.length > TRAIL) s.trail.length = TRAIL
          return true
        }
        kick()
      }),
  }))

  // the ribbon: a picked slot shows its current task, otherwise the task the last ball landed on
  const landed = picked === null && landing?.task && !falling
  const show = picked ?? (landed ? landing!.slot : null)
  const showTask = picked !== null ? tasks[picked] : landed ? landing!.task : undefined
  const tier = show !== null ? BOARD_TIERS[show] : 1
  const r = PLINKO_TIERS[tier]

  return (
    <div className={`pk-stage ${landing?.jackpot ? 'shake' : ''}`}>
      <canvas ref={canvas} className="pk-canvas" role="img" aria-label="Доска Плинко: 16 лунок, центр — лёгкие задания, края — тяжёлые" />
      <div className="pk-bins" style={{ paddingInline: `${((SIM.M / SIM.W) * 100).toFixed(3)}%` }} role="list" aria-label="Задания в лунках">
        {Array.from({ length: BOARD_SLOTS }, (_, k) => {
          const t = tasks[k]
          const lit = landing?.slot === k
          return (
            <button
              key={`${k}:${t?.id ?? ''}:${lit ? landing!.id : ''}`}
              role="listitem"
              className={`pk-bin lv${levelOfSlot(k)} ${lit ? 'lit' : ''} ${!lit && restSlot === k && !falling ? 'last' : ''} ${show === k ? 'on' : ''}`}
              aria-label={t ? `${t.title}, ×${PLINKO_TIERS[BOARD_TIERS[k]].mult}` : 'Лунка'}
              onClick={() => setPicked(picked === k ? null : k)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setPicked(k)}
            >
              <span className="pk-bin-ico">
                <Px name={iconOf(t?.icon)} size={16} />
              </span>
              <span className="pk-bin-txt">{t?.short ?? '…'}</span>
            </button>
          )
        })}
      </div>
      <div className={`pk-ribbon ${showTask ? `lv${levelOfSlot(show!)}` : ''}`} aria-live="polite">
        {showTask ? (
          <>
            <Px name={iconOf(showTask.icon)} size={26} />
            <span className="grow">
              <b>
                {landed ? 'Выпало: ' : ''}
                {showTask.title}
              </b>
              <small className="num">
                ×{r.mult} · +{r.xp} XP · +{r.shards} ❄ · {r.minutes >= 60 ? `${r.minutes / 60} ч` : `${r.minutes} мин`}
              </small>
            </span>
          </>
        ) : (
          <span className="pk-ribbon-hint">Тапни лунку — покажу задание. Центр лёгкий, края жирные по XP</span>
        )}
      </div>
      {landing?.jackpot && (
        <div className="pk-jackpot" role="status" key={landing.id}>
          <span>ДЖЕКПОТ</span>
          <small>×{PLINKO_TIERS[BOARD_TIERS[landing.slot]].mult} XP</small>
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
            <span
              className="pk-timer-bar"
              style={{
                transform: `scaleX(${Math.max(0, Math.min(1, left / total))})`,
              }}
            />
            <span className="pk-timer-text num">{expired ? 'Время вышло' : formatLeft(left)}</span>
          </div>
          {!expired && <p className="tiny muted pk-card-note">Успеешь до нуля — серия {fmtMult(nextStreak)} на XP следующего броска. «Позже» сбрасывает серию.</p>}
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
