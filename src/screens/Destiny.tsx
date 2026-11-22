import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

import {
  PLINKO_BALLS,
  PLINKO_REROLLS,
  PLINKO_REST_SHARDS,
  PLINKO_TIERS,
  ballsLeft,
  ballsSpent,
  doneInTime,
  dropDeadline,
  dropJackpot,
  dropSpecial,
  dropStreakMult,
  dropTier,
  gameDayOf,
  nextStreak,
  nextThrow,
  plinkoDrops,
  plinkoReward,
  plinkoTaskById,
  poolTaskById,
  refreshBoard,
  rerollsLeft,
  returnedThrows,
  slotItemFor,
  specialById,
  statName,
  streakMult, STAT_SPHERE } from '../engine'
import type { PlinkoDrop } from '../engine'
import { rollDrop } from '../engine/plinkoSim'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useFx, useGame, useNow } from '../store/hooks'
import { PlinkoBoard, PlinkoCard, formatLeft, type PlinkoHandle, type PlinkoNotice } from '../components/Plinko'
import { Santa } from '../components/Santa'
import { buzz, sfxBurnt, sfxDone, sfxReroll, sfxRest, unlockAudio } from '../components/plinkoFx'
import { Px } from '../pixel/Pixel'
import { SPRITES, type SpriteName } from '../pixel/sprites'

const iconOf = (id: string | undefined): SpriteName => (id && id in SPRITES ? (id as SpriteName) : 'dice')
const fmtMult = (m: number) => `×${String(m).replace('.', ',')}`

/**
 * «Судьба дня»: Плинко. 16 slots, each with its own task laid out for the day; the ball falls by real
 * physics from a crypto-random start. Centre — easy, edges — hard and fat in XP. 5 balls a day.
 * Two tier-2 slots are specials: «Ещё раз» (the ball comes back, up to 3 a day) and «Отдых» (+1 ❄ for nothing).
 * The reward comes only after «Сделал»; a task closed in time grows the streak (an XP multiplier).
 */
export function Destiny() {
  const data = useStore((s) => s.data)
  const addPlinkoDrop = useStore((s) => s.addPlinkoDrop)
  const setPlinkoDone = useStore((s) => s.setPlinkoDone)
  const setPlinkoLater = useStore((s) => s.setPlinkoLater)
  const setPlinkoBoard = useStore((s) => s.setPlinkoBoard)
  const setSettings = useStore((s) => s.setSettings)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const log = data.days[today]
  const locked = !!log?.confession
  const drops = plinkoDrops(log)
  const next = nextThrow(log)
  const left = ballsLeft(log)
  const sound = data.settings.sound ?? true
  const layout = log?.plinkoBoard
  const tasks = Array.from({ length: 16 }, (_, k) => (layout?.[k] ? (specialById(layout[k]) ?? poolTaskById(layout[k])) : undefined))
  const spent = ballsSpent(log)
  const returned = returnedThrows(log)

  const board = useRef<PlinkoHandle>(null)
  const [falling, setFalling] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [, tick] = useState(0)
  /** the board stays as is while a ball falls and lands */
  const [hold, setHold] = useState(false)
  const [cheer, setCheer] = useState(0)
  const [notice, setNotice] = useState<PlinkoNotice | null>(null)
  const usedKey = drops.map((d) => d.taskId).join()

  // the day's layout: made once at random, then only stale slots (dropped or out of hours) change
  useEffect(() => {
    if (hold || falling !== null) return
    const fresh = refreshBoard(layout, nowWithOffset().getHours(), usedKey ? usedKey.split(',') : [])
    if (fresh) setPlinkoBoard(today, fresh)
  }, [today, hold, falling, layout, usedKey, setPlinkoBoard])

  const nowMs = nowWithOffset().getTime()
  const ticking = drops.some((d) => !dropSpecial(d) && d.doneAt === undefined && nowMs < dropDeadline(d))
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [ticking])

  const streakNow = streakMult(nextStreak(data.days, nowMs))
  const last = drops[drops.length - 1]
  const visible = drops.filter((d) => d.n !== falling)
  const card = open !== null && falling === null ? drops.find((d) => d.n === open) : undefined

  const throwBall = async () => {
    if (locked || falling !== null || next === null) return
    if (sound) unlockAudio()
    const when = nowWithOffset()
    // real physics from crypto-random initial conditions; the slot is what the simulation gives
    const sim = rollDrop()
    const task = slotItemFor(layout, sim.slot, when.getHours())
    const drop: PlinkoDrop = {
      n: next,
      at: when.getTime(),
      slot: sim.slot,
      taskId: task.id,
      v: 2,
    }
    // the cap is read before this throw is stored: the first PLINKO_REROLLS «Ещё раз» of the day bring the ball back
    const comesBack = rerollsLeft(log) > 0
    setHold(true)
    setNotice(null)
    addPlinkoDrop(today, drop)
    setOpen(null)
    setFalling(next)
    buzz(8)
    await board.current?.drop(sim)
    setFalling(null)
    const kind = dropSpecial(drop)
    if (kind) {
      // a special has no card: just the result, and the ❄ of «Отдых» is paid by the replay of this drop
      setOpen(null)
      if (kind === 'rest') {
        setNotice({ id: Date.now(), kind, title: `Отдых: +${PLINKO_REST_SHARDS} ❄`, sub: 'Без задания и без вины. Серия не тронута' })
        reward(document.querySelector('.pk-stage'), { shards: PLINKO_REST_SHARDS })
        if (sound) sfxRest()
        buzz([20, 40, 20])
      } else if (comesBack) {
        const more = rerollsLeft(log) - 1 // this one is used up
        setNotice({ id: Date.now(), kind, title: 'Шар вернулся!', sub: more > 0 ? `Бросай снова. Ещё перебросов: ${more}` : 'Бросай снова. Перебросы на сегодня кончились' })
        if (sound) sfxReroll()
        buzz([14, 30, 14, 30, 30])
      } else {
        setNotice({ id: Date.now(), kind: 'burnt', title: 'Перебросов нет', sub: `${PLINKO_REROLLS} из ${PLINKO_REROLLS} уже были: шар потрачен` })
        if (sound) sfxBurnt()
        buzz(30)
      }
    } else {
      setOpen(next)
    }
    if (dropJackpot(drop)) setCheer(Date.now())
    window.setTimeout(() => setHold(false), 1800)
  }

  const finish = (drop: PlinkoDrop, el: HTMLElement) => {
    const task = plinkoTaskById(drop.taskId)
    const at = nowWithOffset().getTime()
    const r = plinkoReward(drop, at, dropStreakMult(data.days, today, drop.n))
    setPlinkoDone(today, drop.n, at)
    if (sound) {
      unlockAudio()
      sfxDone()
    }
    buzz([12, 30, 18])
    reward(el, { xp: r.xp, shards: r.shards })
    if (task)
      useFx.getState().showPop({
        title: task.title,
        stat: task.stat,
        fromXp: game.xpBySphere[STAT_SPHERE[task.stat]],
        xp: r.xp,
        shards: r.shards,
        crit: false,
      })
  }

  const later = (drop: PlinkoDrop) => {
    if (drop.doneAt === undefined && nowMs < dropDeadline(drop)) setPlinkoLater(today, drop.n, nowWithOffset().getTime())
    setOpen(null)
  }

  const moreHint = `Все ${PLINKO_BALLS} шаров на сегодня брошены. Завтра — новые ${PLINKO_BALLS} и новая доска.`

  return (
    <div className="stack-lg">
      <p className="small muted page-sub">Шар выберет маленькое полезное дело · {PLINKO_BALLS} в день</p>

      <div className="pk-wrap">
        <Santa falling={falling !== null} sound={sound} cheer={cheer} />
        <div className="pk">
          <div className="pk-hud">
            <span className="pk-balls num" aria-label={`Шаров: ${left}`}>
              <span aria-hidden>🎱</span> ×{left}
            </span>
            {streakNow > 1 && <span className="pk-streak num">серия {fmtMult(streakNow)}</span>}
            <span className="grow" />
            <button className="pk-mute" aria-pressed={sound} aria-label={sound ? 'Выключить звук' : 'Включить звук'} onClick={() => setSettings({ sound: !sound })}>
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          <PlinkoBoard ref={board} tasks={tasks} rerollsLeft={rerollsLeft(log)} notice={notice} sound={sound} ready={!locked && next !== null} restSlot={last?.v === 2 ? last.slot : null} />
          <div className="pk-actions">
            {locked ? (
              <p className="small pk-note">День закрыт исповедью. Шар ждёт завтра.</p>
            ) : next === null ? (
              <p className="small pk-note">{moreHint}</p>
            ) : (
              <button className="btn primary block pk-throw" onClick={throwBall} disabled={falling !== null}>
                <Px name="snowflake" size={22} /> {falling !== null ? 'Шар летит…' : 'Бросить шар'}
              </button>
            )}
          </div>
        </div>
      </div>

      {card && <DropCard key={card.n} drop={card} nowMs={nowMs} streak={dropStreakMult(data.days, today, card.n)} onDone={(el) => finish(card, el)} onLater={() => later(card)} />}

      {visible.length > 0 && (
        <section className="stack">
          <h2 className="pk-h">
            Задания дня{' '}
            <span className="muted small num">
              шаров {spent}/{PLINKO_BALLS}
            </span>
          </h2>
          {visible.map((d) => {
            const sp = specialById(d.taskId)
            if (sp)
              return (
                <div key={d.n} className={`pk-row sp ${sp.kind} ${sp.kind === 'rest' ? 'done' : ''}`}>
                  <Px name={iconOf(sp.icon)} size={30} />
                  <span className="grow">
                    <b>{sp.title}</b>
                    <small className="muted">{sp.kind === 'rest' ? `+${PLINKO_REST_SHARDS} ❄, без XP, серия не тронута` : returned.has(d.n) ? 'Шар вернулся, не потрачен' : 'Перебросов не осталось, шар потрачен'}</small>
                  </span>
                  <span className="pk-row-state num">{sp.kind === 'rest' ? `✓ +${PLINKO_REST_SHARDS} ❄` : returned.has(d.n) ? '↺' : '✕'}</span>
                </div>
              )
            const task = plinkoTaskById(d.taskId)
            const tier = dropTier(d)
            const left = dropDeadline(d) - nowMs
            const mult = dropStreakMult(data.days, today, d.n)
            const doneR = d.doneAt !== undefined ? plinkoReward(d, d.doneAt, mult) : undefined
            return (
              <button key={d.n} className={`pk-row t${tier} ${doneR ? 'done' : ''} ${open === d.n ? 'on' : ''}`} onClick={() => setOpen(open === d.n ? null : d.n)}>
                <Px name={iconOf(task?.icon)} size={30} />
                <span className="grow">
                  <b>{task?.title ?? 'Задание'}</b>
                  <small className="muted">
                    ×{PLINKO_TIERS[tier].mult} · +{Math.round(PLINKO_TIERS[tier].xp * mult)} XP +{PLINKO_TIERS[tier].shards} ❄
                  </small>
                </span>
                <span className="pk-row-state num">{doneR ? `✓ +${doneR.xp}${doneInTime(d) ? ' ⚡' : ''}` : left > 0 ? formatLeft(left) : 'Время вышло'}</span>
              </button>
            )
          })}
        </section>
      )}
    </div>
  )
}

function DropCard({ drop, nowMs, streak, onDone, onLater }: { drop: PlinkoDrop; nowMs: number; streak: number; onDone: (el: HTMLElement) => void; onLater: () => void }) {
  const task = plinkoTaskById(drop.taskId)
  const tier = dropTier(drop)
  const r = PLINKO_TIERS[tier]
  return (
    <PlinkoCard
      icon={<Px name={iconOf(task?.icon)} size={40} />}
      title={task?.title ?? 'Задание'}
      hint={task?.hint ?? ''}
      tier={tier}
      statLabel={task ? statName(task.stat) : ''}
      xp={Math.round(r.xp * streak)}
      shards={r.shards}
      streak={streak}
      left={dropDeadline(drop) - nowMs}
      total={r.minutes * 60_000}
      doneXp={drop.doneAt !== undefined ? plinkoReward(drop, drop.doneAt, streak).xp : undefined}
      onDone={onDone}
      onLater={onLater}
    />
  )
}
