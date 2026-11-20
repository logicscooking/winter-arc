import { useEffect, useState } from 'react'
import { SHARDS, XP } from '../engine'
import { useStore } from '../store/store'
import { haptic, nowWithOffset, reward } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chips, Ring, Sheet, formatMMSS } from '../components/ui'
import { SWAPS } from './Slip'

const WAVE_MS = 10 * 60 * 1000

export function Breath({ start }: { start: number }) {
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  useEffect(() => {
    const t = setInterval(() => {
      const c = (Date.now() - start) % 10000
      setPhase(c < 4000 ? 'in' : 'out')
    }, 200)
    return () => clearInterval(t)
  }, [start])
  return (
    <div className={`breath ${phase}`} style={{ transform: `scale(${phase === 'in' ? 1.18 : 0.86})` }} aria-live="polite">
      <span>{phase === 'in' ? 'вдох' : 'выдох'}</span>
    </div>
  )
}

export function CravingFlow() {
  const close = useUi((s) => s.close)
  const open = useUi((s) => s.open)
  const add = useStore((s) => s.addCraving)
  const defaultSwap = useStore((s) => s.data.settings.defaultSwap)
  const [swap, setSwap] = useState(SWAPS.includes(defaultSwap) ? defaultSwap : SWAPS[0])
  const [start, setStart] = useState<number>()
  const [state, setState] = useState<'setup' | 'run' | 'won' | 'lost'>('setup')
  const [, tick] = useState(0)

  useEffect(() => {
    if (state !== 'run') return
    const t = setInterval(() => tick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [state])

  const left = start ? start + WAVE_MS - Date.now() : WAVE_MS
  useEffect(() => {
    if (state === 'run' && left <= 0) {
      setState('won')
      haptic([20, 60, 20])
    }
  }, [state, left])

  return (
    <Sheet title="Тяга" onClose={close}>
      <div className="stack-lg">
        {state === 'setup' && (
          <>
            <p className="small muted">Тяга — это волна: пик и спад за 10 минут. Пересиди её, дыша медленно, и сделай замену.</p>
            <Chips label="Замена на время волны" options={SWAPS.map((s) => ({ id: s, label: s }))} value={swap} onChange={setSwap} />
            <button
              className="btn primary block"
              onClick={() => {
                setStart(Date.now())
                setState('run')
              }}
            >
              Пережить волну, 10 минут
            </button>
          </>
        )}
        {state === 'run' && start && (
          <>
            <Ring progress={1 - left / WAVE_MS}>
              <Breath start={start} />
            </Ring>
            <div className="center">
              <div className="num" style={{ fontSize: '1.6rem' }}>
                {formatMMSS(left)}
              </div>
              <p className="small muted">Вдох 4 секунды, выдох 6. Замена: {swap.toLowerCase()}.</p>
            </div>
            <button
              className="btn ghost block"
              onClick={() => {
                add('lost', swap, nowWithOffset())
                setState('lost')
              }}
            >
              Сдался
            </button>
          </>
        )}
        {state === 'won' && (
          <>
            <div className="big-title center">Волна прошла</div>
            <button
              className="btn primary block"
              onClick={(e) => {
                add('won', swap, nowWithOffset())
                reward(e.currentTarget, { xp: XP.craving, shards: SHARDS.craving })
                setTimeout(close, 700)
              }}
            >
              Забрать +10 XP Воли и +2 ❄
            </button>
          </>
        )}
        {state === 'lost' && (
          <>
            <p>Бывает. Если сорвался, честнее нажать «Слился»: урон тот же, зато будет шанс на камбэк.</p>
            <button className="btn danger block" onClick={() => open({ kind: 'slip' })}>
              Нажать «Слился»
            </button>
            <button className="btn ghost block" onClick={close}>
              Удержался, просто устал ждать
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
