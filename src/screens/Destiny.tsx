import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SHARDS, gameDayOf, questReward, planFor, statusFromValue, taskXp } from '../engine'
import type { MarkStatus } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useFx, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Ring, formatMMSS } from '../components/ui'
import { Px } from '../pixel/Pixel'
import { dayItems, type DayItem } from './dayItems'

const MINUTES = [15, 25, 45]

/** «Судьба дня»: an ornate frame spins over today's open quests and tasks, picks one, starts a focus timer */
export function Destiny() {
  const data = useStore((s) => s.data)
  const setDestiny = useStore((s) => s.setDestiny)
  const setMark = useStore((s) => s.setMark)
  const setValue = useStore((s) => s.setValue)
  const toggleTask = useStore((s) => s.toggleTask)
  const say = useUi((s) => s.say)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const locked = !!data.days[today]?.confession
  const all = dayItems(data, today, { handOnly: true })
  const open = all.filter((i) => !i.done).slice(0, 9)
  const z = data.days[today]?.destiny
  const zItem = z ? all.find((i) => i.ref === z.ref && i.id === z.id) : undefined
  const won = !!game.days[today]?.destinyWon

  const [lit, setLit] = useState<number | null>(null)
  const [picked, setPicked] = useState<DayItem | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [minutes, setMinutes] = useState(25)
  const [draft, setDraft] = useState('')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [, tick] = useState(0)

  const end = z ? z.startedAt + z.minutes * 60_000 : 0
  const nowMs = nowWithOffset().getTime()
  const running = !!z && !!zItem && !zItem.done && nowMs < end
  const expired = !!z && !!zItem && !zItem.done && nowMs >= end

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const spin = () => {
    if (open.length === 0 || spinning) return
    setPicked(null)
    const target = Math.floor(Math.random() * open.length)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || open.length === 1) {
      setLit(target)
      setPicked(open[target])
      return
    }
    setSpinning(true)
    const steps = open.length * 3 + target
    let t = 0
    for (let i = 0; i <= steps; i++) {
      const p = i / steps
      t += 45 + 260 * p * p * p
      timers.current.push(
        setTimeout(() => {
          setLit(i % open.length)
          if (i === steps) {
            setSpinning(false)
            setPicked(open[target])
          }
        }, t),
      )
    }
  }

  const start = () => {
    if (!picked) return
    setDestiny(today, { ref: picked.ref, id: picked.id, startedAt: nowWithOffset().getTime(), minutes })
    setPicked(null)
    setLit(null)
  }

  const finish = (el: Element) => {
    if (!z || !zItem) return
    const n = nowWithOffset()
    const inTime = n.getTime() <= end
    if (zItem.ref === 'quest') {
      const p = planFor(data, today).find((x) => x.id === zItem.id)
      if (!p) return
      let status: MarkStatus | undefined = 'done'
      if (zItem.kind === 'reading' || zItem.kind === 'number') {
        const v = Number(draft)
        const q = data.quests.find((x) => x.id === zItem.id)
        if (!q || !(v > 0)) return say(`Впиши, сколько ${zItem.unit ?? ''}`.trim())
        setValue(today, zItem.id, v, n)
        status = statusFromValue(q, v)
      } else setMark(today, zItem.id, 'done', n)
      const r = questReward(today, p, status)
      reward(el, { xp: r.xp })
      useFx.getState().showPop({ title: zItem.title, stat: zItem.stat, fromXp: game.xpByStat[zItem.stat], xp: r.xp, shards: r.shards, crit: r.crit, destiny: inTime ? SHARDS.destiny : 0 })
    } else {
      const t = data.tasks.find((x) => x.id === zItem.id)
      if (!t) return
      toggleTask(t.id, n)
      const xp = taskXp(data.tasks, t)
      reward(el, { xp })
      useFx.getState().showPop({ title: t.title, stat: t.stat, fromXp: game.xpByStat[t.stat], xp, shards: 0, crit: false, destiny: inTime ? SHARDS.destiny : 0 })
    }
  }

  const cells: (DayItem | null)[] = Array.from({ length: 9 }, (_, i) => open[i] ?? null)
  const litId = running || expired ? `${z!.ref}:${z!.id}` : null

  return (
    <div className="stack-lg">
      <a className="back" href="#/today">
        <ArrowLeft size={18} /> Сегодня
      </a>
      <header className="row between" style={{ marginTop: -14 }}>
        <div>
          <h1>Судьба дня</h1>
          <p className="small muted">Не знаешь, с чего начать? Пусть выберет рамка.</p>
        </div>
        <a className="quick" href="#/shop" aria-label={`Осколки: ${game.shards}`}>
          <Px name="shard" size={22} />
          <span className="num">{game.shards}</span>
        </a>
      </header>

      <div className="cols">
        <div className="destiny-frame">
          <span className="gem top">
            <Px name="shard" size={34} />
          </span>
          <span className="gem bottom">
            <Px name="snowflake" size={30} />
          </span>
          <span className="gem left">
            <Px name="shard" size={22} />
          </span>
          <span className="gem right">
            <Px name="shard" size={22} />
          </span>
          <div className="destiny-grid" aria-live="polite">
            {cells.map((c, i) => {
              const isLit = c && (lit === i || litId === `${c.ref}:${c.id}`)
              return (
                <div key={c ? `${c.ref}:${c.id}` : `e${i}`} className={`d-cell ${c ? '' : 'empty-cell'} ${isLit ? 'lit' : ''} ${isLit && picked ? 'won' : ''}`}>
                  {c ? (
                    <>
                      <Px name={c.sprite} size={34} />
                      <span>{c.title}</span>
                    </>
                  ) : (
                    <Px name="snowflake" size={22} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <section className="stack">
          {locked ? (
            <div className="empty">День закрыт исповедью. Судьба ждёт завтра.</div>
          ) : won ? (
            <div className="destiny-result" style={{ borderColor: 'var(--pine-line)' }}>
              <Px name="trophy" size={40} />
              <div>
                <small>Судьба исполнена</small>
                <h3>{zItem?.title ?? 'Квест'}</h3>
                <p className="small muted">Успел до конца таймера: +{SHARDS.destiny} ❄. Судьба выпадает раз в день — завтра рамка закрутится снова.</p>
              </div>
            </div>
          ) : running ? (
            <>
              <div className="destiny-result">
                <Px name={zItem!.sprite} size={40} />
                <div>
                  <small>Твоя судьба</small>
                  <h3>{zItem!.title}</h3>
                </div>
              </div>
              <Ring progress={(end - nowMs) / (z!.minutes * 60_000)} size={200} stroke={10} color="var(--pine)">
                <span className="t">{formatMMSS(end - nowMs)}</span>
              </Ring>
              {(zItem!.kind === 'reading' || zItem!.kind === 'number') && (
                <input className="input num" type="number" inputMode="numeric" min={0} placeholder={zItem!.unit} value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} aria-label={zItem!.unit ?? 'значение'} />
              )}
              <div className="stake">
                <span className="small">Успеешь до нуля</span>
                <span className="num">
                  <Px name="shard" size={18} />+{SHARDS.destiny}
                </span>
              </div>
              <button className="btn primary block" onClick={(e) => finish(e.currentTarget)}>
                Сделал!
              </button>
              <button className="btn ghost block" onClick={() => setDestiny(today, null)}>
                Сдаться и выбрать заново
              </button>
            </>
          ) : picked ? (
            <>
              <button className="destiny-result" style={{ textAlign: 'left' }} onClick={start}>
                <Px name={picked.sprite} size={40} />
                <div>
                  <small>Твоя судьба</small>
                  <h3>{picked.title}</h3>
                </div>
              </button>
              <div className="field">
                <span>Таймер фокуса</span>
                <div className="chips" role="radiogroup" aria-label="Минут на таймере">
                  {MINUTES.map((m) => (
                    <button key={m} className="chip num" role="radio" aria-checked={minutes === m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                      {m} мин
                    </button>
                  ))}
                </div>
              </div>
              <div className="stake">
                <span className="small">Успеешь до конца таймера</span>
                <span className="num">
                  <Px name="shard" size={18} />+{SHARDS.destiny}
                </span>
              </div>
              <button className="btn primary block" onClick={start}>
                Принять судьбу
              </button>
              <button className="btn ghost block" onClick={spin}>
                Крутить ещё раз
              </button>
            </>
          ) : (
            <>
              {expired && (
                <div className="hint" role="note">
                  <Px name="clock" size={22} />
                  <div className="grow">Время вышло: «{zItem!.title}» всё ещё можно закрыть на «Сегодня», но без бонуса. Или крути заново.</div>
                </div>
              )}
              {open.length === 0 ? (
                <div className="empty">
                  <Px name="snowman" size={48} />
                  Все ручные квесты и задачи на сегодня закрыты. Добавь задачу дня — и будет что крутить.
                </div>
              ) : (
                <>
                  <p className="small muted">
                    В рамке {open.length} {open.length === 1 ? 'дело' : open.length < 5 ? 'дела' : 'дел'}: главные квесты, задачи дня и побочные. Закрой выпавшее до конца таймера — +{SHARDS.destiny} ❄.
                  </p>
                  <button className="btn primary block" onClick={spin} disabled={spinning}>
                    <Px name="dice" size={24} /> {spinning ? 'Крутится…' : 'Крутить'}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
