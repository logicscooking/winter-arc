import { useCallback, useEffect, useRef, useState } from 'react'

import { PAL } from '../pixel/palette'
import { gridPaths } from '../pixel/render'
import { SANTA, type SantaFrame } from '../pixel/santa'
import { Px } from '../pixel/Pixel'
import { sfxBell, sfxHoHo, sfxYawn, unlockAudio } from './plinkoFx'
import './santa.css'

const W = 32 // sprite on screen: 16 × 20 cells at 2 px
const H = 40
const SPEED = 26 // px/s
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export const SANTA_LINES = [
  'Хо-хо! Отжимания сами себя не сделают',
  'Кто взял шоколадку из лунки?',
  'Я тоже рилсы не смотрю… почти',
  'Мешок тяжёлый. Это я так качаюсь',
  'Олени бегают каждый день. А ты?',
  'Подарки — тем, кто закрыл задание',
  'Я без выходных с 1840-го. Не ной',
  'Стакан воды — и ты почти я',
  'Не тыкай, я на диете… с ноября',
  'Снежинка к снежинке — вот и сугроб',
  'Хо-хо-хо! Телефон — в другую комнату',
  'Тсс, я считаю шаги',
  'Холодный душ? Я в нём живу',
  'Серия ×2 — и в мешке найдётся место',
  'Зима близко. Арка ещё ближе',
  'Кто рано встал — тому подарок',
  'Брось шар. Я подсмотрю',
  'Я не сплю, я медитирую',
  'Ещё тык — и ты в списке непослушных',
  'Печенье? Нет, у меня Зимняя арка',
  'Хо-хо! Кровать заправлена?',
  'Борода не мешает приседать. А тебе что?',
  'Лови! Только задание не урони',
] as const
const WAKE = ['А? Что? Я не спал!', 'Пять минуточек ещё…', 'Кто будит Деда?!', 'Я просто глаза закрыл. Для фокуса'] as const
const CHEER = ['Давай, в край!', 'Лети, снежок!', 'Хо-хо, держись!', 'Только не в центр… или в центр?', 'Жирное, жирное!'] as const
const FLIP = ['Опа! Видал?', 'Сальто — это кардио', 'Хо-хо-хоп!'] as const
const LEAVE = 'Всё, я обиделся!'
const BACK = 'Ладно, вернулся. Без тычков!'

type Mode = 'walk' | 'idle' | 'yawn' | 'sleep' | 'hop' | 'flip' | 'wave' | 'wow' | 'leave' | 'gone'

interface Drop {
  id: number
  x: number
  kind: 'gift' | 'snow'
}

function Sprite({ frame }: { frame: SantaFrame }) {
  const p = gridPaths([SANTA[frame]], `santa:${frame}`)
  return (
    <g className={`f-${frame}`}>
      {p.runs.map(([c, d]) => (
        <path key={c} d={d} fill={PAL[c]} />
      ))}
    </g>
  )
}

const FRAMES = Object.keys(SANTA) as SantaFrame[]

/**
 * Дед Мороз walks along the top edge of the board frame, dozes off now and then and reacts to taps:
 * a hop with a gift or a snowball and a line, a flip on a double tap, a sulk off the edge after a
 * flurry of taps, a wave while the ball is falling. Movement is a ref + rAF, no React renders per frame.
 */
export function Santa({ falling, sound, cheer }: { falling: boolean; sound: boolean; cheer?: number }) {
  const lane = useRef<HTMLDivElement>(null)
  const el = useRef<HTMLButtonElement>(null)
  const pos = useRef({
    x: -1,
    dir: 1,
    target: 0,
    raf: 0,
    last: 0,
    stepT: 0,
    frame: 0 as 0 | 1,
    walk: 0,
  })
  const timer = useRef(0)
  const bubbleTimer = useRef(0)
  const taps = useRef<number[]>([])
  /** sulking: from «Всё, я обиделся» until he is back, taps are ignored */
  const sulk = useRef(false)
  const [mode, setMode] = useState<Mode>('idle')
  const modeRef = useRef<Mode>('idle')
  const [bubble, setBubble] = useState<{
    text: string
    id: number
    x: number
  } | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [sleepy, setSleepy] = useState(false)
  const soundRef = useRef(sound)
  const fallingRef = useRef(falling)
  useEffect(() => {
    soundRef.current = sound
    fallingRef.current = falling
  }, [sound, falling])

  const laneW = () => lane.current?.clientWidth ?? 320

  const place = useCallback(() => {
    const p = pos.current
    const node = el.current
    if (!node) return
    node.style.transform = `translate3d(${p.x.toFixed(1)}px, 0, 0)`
    node.dataset.dir = p.dir > 0 ? 'r' : 'l'
    node.dataset.step = String(p.frame)
  }, [])

  const set = useCallback((m: Mode) => {
    modeRef.current = m
    setMode(m)
  }, [])

  const say = useCallback((text: string, ms = 2600) => {
    clearTimeout(bubbleTimer.current)
    const w = laneW()
    const bw = Math.min(200, w - 8)
    const x = Math.max(4, Math.min(w - bw - 4, pos.current.x + W / 2 - bw / 2))
    setBubble({ text, id: Date.now(), x })
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms)
  }, [])

  // ---- behaviour loop ----
  const walkTo = useCallback(
    (target: number, fast = false) => {
      const p = pos.current
      p.target = target
      p.dir = target >= p.x ? 1 : -1
      set(fast ? 'leave' : 'walk')
      cancelAnimationFrame(p.raf)
      p.last = performance.now()
      const token = ++p.walk
      const step = (now: number) => {
        if (token !== p.walk) return
        const dt = Math.min(0.05, (now - p.last) / 1000)
        p.last = now
        const v = SPEED * (fast ? 3.2 : 1)
        p.x += p.dir * v * dt
        p.stepT += dt
        if (p.stepT > (fast ? 0.09 : 0.18)) {
          p.stepT = 0
          p.frame = p.frame ? 0 : 1
        }
        const done = p.dir > 0 ? p.x >= p.target : p.x <= p.target
        if (done) {
          p.x = p.target
          p.frame = 0
          place()
          arrive()
          return
        }
        place()
        p.raf = requestAnimationFrame(step)
      }
      p.raf = requestAnimationFrame(step)
    },
    [place, set], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }

  const wander = useCallback(() => {
    if (reduced()) return set('idle')
    const w = laneW()
    const p = pos.current
    let t = rnd(8, w - W - 8)
    if (Math.abs(t - p.x) < 50) t = p.x < w / 2 ? Math.min(w - W - 8, p.x + rnd(60, 140)) : Math.max(8, p.x - rnd(60, 140))
    walkTo(t)
  }, [walkTo, set])

  const arrive = () => {
    const m = modeRef.current
    if (m === 'leave') {
      set('gone')
      setDrops([])
      later(() => {
        // back in from the other edge
        const w = laneW()
        const p = pos.current
        p.x = p.x < 0 ? w + 4 : -W - 4
        place()
        walkTo(p.x < 0 ? rnd(20, w / 3) : rnd((w * 2) / 3, w - W - 20))
        window.setTimeout(() => {
          say(BACK)
          sulk.current = false
        }, 900)
      }, 5200)
      return
    }
    const r = Math.random()
    if (r < 0.5) later(wander, rnd(200, 900))
    else if (r < 0.84) {
      set('idle')
      later(wander, rnd(1500, 3800))
    } else doze()
  }

  const doze = () => {
    set('yawn')
    if (soundRef.current) sfxYawn()
    later(() => {
      set('sleep')
      setSleepy(true)
      later(
        () => {
          setSleepy(false)
          set('idle')
          later(wander, 1200)
        },
        rnd(7000, 14000),
      )
    }, 1500)
  }

  // start: stand somewhere on the right, then wander
  useEffect(() => {
    const w = laneW()
    const p = pos.current
    p.x = Math.round(w * 0.72)
    place()
    if (!reduced()) later(wander, 1600)
    const onHide = () => {
      if (document.hidden) {
        cancelAnimationFrame(p.raf)
        clearTimeout(timer.current)
      } else if (!reduced() && (modeRef.current === 'walk' || modeRef.current === 'idle')) later(wander, 600)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelAnimationFrame(p.raf)
      clearTimeout(timer.current)
      clearTimeout(bubbleTimer.current)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // keep him on the frame when the lane resizes
  useEffect(() => {
    const onResize = () => {
      const p = pos.current
      const w = laneW()
      if (modeRef.current !== 'gone' && modeRef.current !== 'leave') p.x = Math.max(4, Math.min(w - W - 4, p.x))
      place()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [place])

  // jackpot: he celebrates
  useEffect(() => {
    if (!cheer || modeRef.current === 'gone' || modeRef.current === 'leave') return
    stopMoving()
    setSleepy(false)
    set('hop')
    say('ДЖЕКПОТ! Хо-хо-хо!', 2400)
    later(() => {
      set('idle')
      later(wander, 1500)
    }, 900)
  }, [cheer]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopMoving = () => {
    pos.current.walk++
    cancelAnimationFrame(pos.current.raf)
    clearTimeout(timer.current)
    pos.current.frame = 0
    place()
  }

  const resume = (ms: number) =>
    later(() => {
      set('idle')
      later(wander, rnd(1200, 2400))
    }, ms)

  const onTap = () => {
    const m = modeRef.current
    if (m === 'gone' || m === 'leave' || sulk.current) return
    if (soundRef.current) unlockAudio()
    const now = performance.now()
    taps.current = [...taps.current.filter((t) => now - t < 2500), now]
    const n = taps.current.length
    const prev = taps.current[n - 2]
    stopMoving()
    setSleepy(false)

    // a flurry of taps: sulks off the edge
    if (n >= 5) {
      taps.current = []
      sulk.current = true
      say(LEAVE, 1800)
      set('wow')
      if (soundRef.current) sfxBell()
      later(() => {
        const w = laneW()
        const p = pos.current
        walkTo(p.x + W / 2 < w / 2 ? -W - 10 : w + 10, true)
      }, 700)
      return
    }
    // double tap: a flip
    if (prev !== undefined && now - prev < 380) {
      set('flip')
      say(pick(FLIP), 1800)
      if (soundRef.current) sfxBell()
      resume(900)
      return
    }
    if (m === 'sleep' || m === 'yawn') {
      set('hop')
      say(pick(WAKE))
      if (soundRef.current) sfxHoHo()
      resume(1100)
      return
    }
    if (fallingRef.current) {
      set('wave')
      say(pick(CHEER), 2000)
      if (soundRef.current) sfxBell()
      resume(1700)
      return
    }
    set('hop')
    say(pick(SANTA_LINES))
    if (soundRef.current) sfxHoHo()
    if (!reduced()) {
      const d: Drop = {
        id: now,
        x: pos.current.x + W / 2,
        kind: Math.random() < 0.55 ? 'gift' : 'snow',
      }
      setDrops((list) => [...list.slice(-3), d])
      window.setTimeout(() => setDrops((list) => list.filter((x) => x.id !== d.id)), 1400)
    }
    resume(1300)
  }

  const FRAME_OF: Partial<Record<Mode, SantaFrame>> = {
    sleep: 'sleep',
    yawn: 'yawn',
    wave: 'wave',
    hop: 'wave',
    wow: 'wow',
    flip: 'wow',
  }
  const frame: SantaFrame = FRAME_OF[mode] ?? 'stand'
  const walking = mode === 'walk' || mode === 'leave'

  return (
    <div className="santa-lane" ref={lane} aria-hidden={false}>
      <button ref={el} type="button" className={`santa m-${mode} ${walking ? 'walking' : ''}`} data-frame={frame} aria-label="Дед Мороз. Тыкни его" onClick={onTap}>
        <span className="santa-body">
          <svg viewBox="0 0 16 20" width={W} height={H} shapeRendering="crispEdges" aria-hidden>
            {FRAMES.map((f) => (
              <Sprite key={f} frame={f} />
            ))}
          </svg>
        </span>
        {sleepy && (
          <span className="santa-zzz" aria-hidden>
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        )}
      </button>
      {bubble && (
        <div key={bubble.id} className="santa-bubble" style={{ left: bubble.x }} role="status">
          {bubble.text}
        </div>
      )}
      {drops.map((d) => (
        <span key={d.id} className={`santa-drop ${d.kind}`} style={{ left: d.x }} aria-hidden>
          {d.kind === 'gift' ? <Px name="gift" size={16} /> : null}
        </span>
      ))}
    </div>
  )
}
