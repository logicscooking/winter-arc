import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { MORNING, gameDayOf, morningCounts, morningDone, statName, STAT_SPHERE } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, useGame, useNow } from '../store/hooks'
import { useFx } from '../store/hooks'
import { Px } from '../pixel/Pixel'
import { Ring, Sheet, formatMMSS } from '../components/ui'
import { useReducedMotion } from '../components/festive'
import { buzz } from '../components/plinkoFx'
import { BLOCKS, GET_SEC, blocksOf, buildProgram, clipAmount, finalLabel, mediaUrl, plural, programMinutes, type Clip, type FinalFor } from '../morning/program'
import { clipMs, doneCount, spentMs, useMorning } from '../morning/session'
import { releaseAudio, resumeAudio, sfxChime, sfxFinish, sfxGo, sfxTick, startMusic, stopMusic, suspendAudio, unlockMorningAudio } from '../morning/audio'
import '../morning/morning.css'

/** «Утренняя инвестиция»: start screen → exercises (each waits for «Старт» / «Готово») → finish. Reward only for a finished run. */
export function Morning() {
  const phase = useMorning((s) => s.phase)
  const day = useMorning((s) => s.day)
  const reset = useMorning((s) => s.reset)
  const today = gameDayOf(useNow())
  const musicOn = useStore((s) => s.data.settings.morningMusic ?? true)
  const active = phase === 'work'

  // yesterday's session does not carry into a new game day
  useEffect(() => {
    if (day !== today && phase !== 'work') reset(today)
  }, [day, today, phase, reset])

  // music follows the session and the toggle; the context was unlocked by the tap that got here
  useEffect(() => {
    if (active && musicOn) startMusic()
    else stopMusic()
  }, [active, musicOn])
  useEffect(() => () => releaseAudio(), [])

  useWakeLock(active)
  useBackground()

  if (phase === 'intro' || day !== today) return <Intro />
  if (phase === 'done') return <Finish />
  return <Player />
}

/** Top bar button: music on / off, remembered on this device */
export function MorningMusicBtn() {
  const on = useStore((s) => s.data.settings.morningMusic ?? true)
  const setSettings = useStore((s) => s.setSettings)
  return (
    <button
      className={`bar-btn mi-music${on ? '' : ' off'}`}
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Музыка: включена' : 'Музыка: выключена'}
      onClick={() => {
        unlockMorningAudio()
        setSettings({ morningMusic: !on })
      }}
    >
      <Px name="note" size={30} />
    </button>
  )
}

// ---------- start ----------

function Intro() {
  const settings = useStore((s) => s.data.settings)
  const setSettings = useStore((s) => s.setSettings)
  const doneToday = useStore((s) => morningDone(s.data.days[gameDayOf(nowWithOffset())]))
  const start = useMorning((s) => s.start)
  const [ask, setAsk] = useState(false)
  const final = settings.morningFinal
  const list = useMemo(() => buildProgram(final ?? 'm'), [final])
  const blocks = blocksOf(list)

  const begin = (f: FinalFor) => {
    unlockMorningAudio()
    sfxGo()
    start(gameDayOf(nowWithOffset()), buildProgram(f), Date.now())
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="stack-lg mi-intro">
      <div className="mi-hero">
        <Px name="sun" size={48} />
        <div className="grow">
          <p className="mi-lede">Мягкая зарядка под спокойную музыку: вклад в энергию на весь день.</p>
          <div className="mi-meta">
            <span className="num">~{programMinutes(list)} мин</span>
            <span>·</span>
            <span>
              {list.length} {plural(list.length, ['упражнение', 'упражнения', 'упражнений'])}
            </span>
          </div>
        </div>
      </div>

      <ol className="mi-blocks">
        {blocks.map((b, n) => (
          <li key={b.id} className={b.id === 'fin' ? 'fin' : ''}>
            <span className="mi-bn num">{n + 1}</span>
            <span className="grow">
              {b.title}
              <small>{b.id === 'fin' ? (final ? finalLabel(final) : 'приседания + отжимания') : `${b.count} упр. · ${formatMMSS(b.seconds * 1000)}`}</small>
            </span>
          </li>
        ))}
      </ol>

      {final && <FinalPicker value={final} onChange={(f) => setSettings({ morningFinal: f })} />}

      <div className="mi-reward">
        <span className="reward-chip gold">+{MORNING.xp} XP</span>
        <span className="reward-chip ice">
          <Px name="shard" size={20} /> +{MORNING.shards}
        </span>
        <span className="small muted">{doneToday ? 'Сегодня уже сделано: ещё раз — без награды' : `${statName(MORNING.stat)} · раз в день`}</span>
      </div>

      <button className="btn primary block mi-big" onClick={() => (final ? begin(final) : setAsk(true))}>
        <Play size={22} fill="currentColor" aria-hidden /> {doneToday ? 'Пройти ещё раз' : 'Начать'}
      </button>
      <p className="tiny muted center">Музыка и таймер включатся с первым тапом. Экран не погаснет.</p>

      {ask && (
        <Sheet title="Финал для" onClose={() => setAsk(false)}>
          <p className="small muted" style={{ marginBottom: 14 }}>
            Последний блок: приседания и отжимания. Выбор запомнится, поменять можно в «Ещё».
          </p>
          <div className="grid-2">
            {(['m', 'f'] as const).map((f) => (
              <button
                key={f}
                className="btn ghost mi-final-opt"
                onClick={() => {
                  setSettings({ morningFinal: f })
                  setAsk(false)
                  begin(f)
                }}
              >
                <b>{f === 'm' ? 'Мужчин' : 'Женщин'}</b>
                <small>{finalLabel(f)}</small>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

export function FinalPicker({ value, onChange }: { value?: FinalFor; onChange: (f: FinalFor) => void }) {
  return (
    <div className="mi-final" role="radiogroup" aria-label="Финал для">
      <span className="small" style={{ fontWeight: 800 }}>
        Финал для
      </span>
      <div className="seg-switch">
        {(['m', 'f'] as const).map((f) => (
          <button key={f} className="seg" role="radio" aria-checked={value === f} onClick={() => onChange(f)}>
            {f === 'm' ? 'мужчин' : 'женщин'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- the player ----------

function Player() {
  const s = useMorning()
  const sound = useStore((st) => st.data.settings.sound ?? true)
  const [now, setNow] = useState(Date.now())
  const c = s.list[s.i]
  const next = s.list[s.i + 1]
  const total = s.list.length
  const left = s.running ? Math.max(0, s.endsAt - now) : s.left
  const lastTick = useRef(-1)

  // the clock: 4 frames a second is enough for a seconds display and a smooth ring
  useEffect(() => {
    if (!s.running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [s.running])

  // «Приготовься» 3-2-1 ticks then a soft «go»; the exercise: ticks on its last 3 s, then the chime
  useEffect(() => {
    if (!s.running) return
    const sec = Math.ceil(left / 1000)
    if (left <= 0) {
      lastTick.current = -1
      if (s.stage === 'run') {
        if (sound) sfxChime()
        buzz([14, 40, 22])
      } else {
        if (sound) sfxGo()
        buzz(10)
      }
      useMorning.getState().expire(Date.now())
      return
    }
    if (sec <= 3 && sec !== lastTick.current) {
      lastTick.current = sec
      if (sound) sfxTick(sec)
      buzz(6)
    }
  }, [left, s.running, s.stage, sound])

  useEffect(() => {
    lastTick.current = -1
  }, [s.i, s.stage])

  const tap = (fn: (now: number) => void) => () => {
    unlockMorningAudio()
    fn(Date.now())
    setNow(Date.now())
  }

  if (!c) return null
  const isTime = c.mode === 'time'
  const full = clipMs(c)
  const paused = !s.running && !!s.pausedAt
  const getting = s.stage === 'get'
  const ring = s.stage === 'idle' ? 0 : getting ? 1 - left / (GET_SEC * 1000) : full ? 1 - left / full : 0
  return (
    <div className="mi-player">
      <Progress i={s.i} total={total} list={s.list} />
      <ClipView clip={c} />
      <div className="mi-text">
        <h2 className="mi-title">{c.title}</h2>
        {c.hint && <p className="small muted">{c.hint}</p>}
      </div>
      <div className="mi-controls">
        <button className="mi-round" onClick={tap(s.prev)} disabled={s.i === 0} aria-label="Назад к прошлому упражнению">
          <SkipBack size={22} />
        </button>
        {isTime ? (
          <button className="mi-ring-btn" onClick={tap(s.running ? s.pause : s.play)} aria-label={s.running ? 'Пауза' : s.stage === 'idle' ? 'Старт' : 'Продолжить'}>
            <Ring progress={ring} size={124} stroke={9} color={getting ? 'var(--frost)' : 'var(--pine)'}>
              {s.stage === 'idle' ? (
                <div className="t num mi-t sm">{formatMMSS(full)}</div>
              ) : (
                <div className={`t num mi-t${getting ? ' get' : left <= 3000 && s.running ? ' hot' : ''}`}>{Math.ceil(left / 1000)}</div>
              )}
              {s.stage !== 'idle' && <span className="mi-unit">{paused ? 'пауза' : getting ? 'приготовься' : 'сек'}</span>}
            </Ring>
          </button>
        ) : (
          <div className="mi-reps" aria-label={`${c.reps} раз`}>
            <span className="num">×{c.reps}</span>
            <small>раз</small>
          </div>
        )}
        <button className="mi-round" onClick={tap(s.skip)} aria-label="Пропустить упражнение">
          <SkipForward size={22} />
        </button>
      </div>
      <p className="mi-next tiny">
        {next ? (
          <>
            Дальше: <b>{next.title}</b> · <span className="num">{clipAmount(next)}</span>
          </>
        ) : (
          'Последнее упражнение'
        )}
      </p>
      {isTime ? (
        <button className={`btn block mi-big${s.running ? ' ghost' : ' primary'}`} onClick={tap(s.running ? s.pause : s.play)}>
          {s.running ? (
            <>
              <Pause size={20} aria-hidden /> Пауза
            </>
          ) : s.stage === 'idle' ? (
            <>
              <Play size={20} fill="currentColor" aria-hidden /> Старт <span className="num mi-btn-time">{formatMMSS(full)}</span>
            </>
          ) : (
            <>
              <Play size={20} fill="currentColor" aria-hidden /> Продолжить
            </>
          )}
        </button>
      ) : (
        <button
          className="btn primary block mi-big"
          onClick={tap((n) => {
            if (sound) sfxChime()
            buzz([12, 30, 18])
            s.complete(n)
          })}
        >
          <Check size={22} strokeWidth={3} aria-hidden /> Готово
        </button>
      )}
      <button className="link-btn mi-skip" onClick={tap(s.skip)}>
        Пропустить
      </button>
    </div>
  )
}

function Progress({ i, total, list }: { i: number; total: number; list: Clip[] }) {
  const c = list[i]
  return (
    <div className="mi-top">
      <div className="mi-top-row">
        <span className="mi-block">{BLOCKS[c.block].title}</span>
        <span className="num mi-count">
          {i + 1} / {total}
        </span>
      </div>
      <div className="mi-bar" aria-hidden>
        {list.map((x, k) => (
          <i key={x.id + k} className={`${k < i ? 'on' : k === i ? 'now' : ''}${k > 0 && list[k - 1].block !== x.block ? ' gap' : ''}`} />
        ))}
      </div>
    </div>
  )
}

/** Looping muted clip; without a file (or if it fails) a calm pixel placeholder */
function ClipView({ clip }: { clip: Clip }) {
  const [failed, setFailed] = useState(false)
  const [ar, setAr] = useState<number | null>(null)
  const src = mediaUrl(clip.video)
  const poster = mediaUrl(clip.poster)
  useEffect(() => {
    setFailed(false)
    setAr(null)
  }, [src])
  const show = !!src && !failed
  return (
    <div className="mi-frame" style={ar ? ({ '--ar': ar } as React.CSSProperties) : undefined}>
      {show ? (
        <video
          key={src}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight)
            // iOS sometimes ignores autoplay after a route change
            void v.play().catch(() => {})
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="mi-ph" aria-hidden>
          <Px name={clip.block === 'fin' ? 'dumbbell' : clip.block === 'v4' ? 'snowman' : 'run'} size={84} />
        </div>
      )}
    </div>
  )
}

// ---------- finish ----------

function Finish() {
  const s = useMorning()
  const finishMorning = useStore((st) => st.finishMorning)
  const sound = useStore((st) => st.data.settings.sound ?? true)
  const game = useGame()
  const reduced = useReducedMotion()
  const done = doneCount(s)
  const total = s.list.length
  const counts = morningCounts(done, total)
  const handled = useRef(false)

  // log once, right when the run ends: a finished run that counts and the day is not paid yet
  useEffect(() => {
    if (handled.current || s.rewarded !== undefined) return
    handled.current = true
    const now = nowWithOffset()
    const day = gameDayOf(now)
    const data = useStore.getState().data
    const pay = counts && !morningDone(data.days[day])
    if (pay) {
      finishMorning(day, now.getTime())
      useFx.getState().showPop({ title: 'Утренняя инвестиция', stat: MORNING.stat, fromXp: game.xpBySphere[STAT_SPHERE[MORNING.stat]], xp: MORNING.xp, shards: MORNING.shards, crit: false })
    }
    useMorning.getState().setRewarded(pay)
    if (sound) sfxFinish()
    buzz([20, 50, 20, 50, 40])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const bits = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const r = (k: number) => {
          const x = Math.sin((i + 1) * 9301 + k * 49297) * 233280
          return x - Math.floor(x)
        }
        return { x: `${Math.round(r(1) * 100)}%`, d: `${(0.9 + r(2) * 1.1).toFixed(2)}s`, delay: `${(r(3) * 0.5).toFixed(2)}s`, rot: `${Math.round(r(4) * 400 - 200)}deg`, c: ['var(--gold-bright)', 'var(--pine)', 'var(--frost)', 'var(--hp)'][i % 4], s: `${Math.round(6 + r(5) * 6)}px` }
      }),
    [],
  )
  const minutes = formatMMSS(spentMs(s, Date.now()))
  return (
    <div className="stack-lg mi-finish">
      <div className="mi-cele">
        {!reduced && (
          <div className="mi-confetti" aria-hidden>
            {bits.map((b, i) => (
              <i key={i} style={{ '--x': b.x, '--d': b.d, '--delay': b.delay, '--rot': b.rot, '--c': b.c, '--s': b.s } as React.CSSProperties} />
            ))}
          </div>
        )}
        <Px name={counts ? 'trophy' : 'sun'} size={72} />
        <div className="big-title">{counts ? 'Инвестиция сделана' : 'Зарядка закончена'}</div>
        <p className="muted">
          {done} из {total} {plural(total, ['упражнения', 'упражнений', 'упражнений'])} · <span className="num">{minutes}</span>
        </p>
      </div>
      {s.rewarded ? (
        <div className="mi-reward center-row">
          <span className="reward-chip gold">+{MORNING.xp} XP · {statName(MORNING.stat)}</span>
          <span className="reward-chip ice">
            <Px name="shard" size={20} /> +{MORNING.shards}
          </span>
        </div>
      ) : (
        <p className="small center mi-note">{!counts ? `Награда — за проход от ${Math.round(MORNING.minShare * 100)}% упражнений. Пропущено ${total - done}.` : 'Награда за сегодня уже получена. Завтра — новая.'}</p>
      )}
      <button className="btn primary block mi-big" onClick={() => go('/today')}>
        На сегодня
      </button>
      <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => useMorning.getState().reset(gameDayOf(nowWithOffset()))}>
        К программе
      </button>
    </div>
  )
}

// ---------- device ----------

/** Keep the screen on while the session runs (Wake Lock API where it exists, nothing otherwise) */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    type Lock = { release: () => Promise<void> }
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock
    if (!wl) return
    let lock: Lock | null = null
    let alive = true
    const get = async () => {
      try {
        const l = await wl.request('screen')
        if (alive) lock = l
        else void l.release()
      } catch {
        /* denied or not allowed now */
      }
    }
    void get()
    // the lock is dropped by the browser when the page is hidden: take it again on return
    const vis = () => document.visibilityState === 'visible' && void get()
    document.addEventListener('visibilitychange', vis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', vis)
      void lock?.release().catch(() => {})
    }
  }, [on])
}

/** The app went to the background: pause the countdown and quiet the audio; resume the audio on return */
function useBackground() {
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        useMorning.getState().pause(Date.now(), true)
        suspendAudio()
      } else resumeAudio()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
}
