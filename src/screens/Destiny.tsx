import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

import {
  PLINKO_FREE,
  PLINKO_MAX,
  PLINKO_RISKS,
  PLINKO_RISK_IDS,
  PLINKO_TIERS,
  ballsFor,
  ballsLeft,
  doneInTime,
  dropDeadline,
  dropRisk,
  dropStreakMult,
  dropTier,
  gameDayOf,
  nextStreak,
  nextThrow,
  plinkoDrops,
  plinkoReward,
  plinkoSeed,
  plinkoTaskById,
  riskOf,
  rollPlinko,
  statName,
  streakMult,
} from '../engine'
import type { PlinkoDrop } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useFx, useGame, useNow } from '../store/hooks'
import { PlinkoBoard, PlinkoCard, formatLeft, type PlinkoHandle } from '../components/Plinko'
import { buzz, sfxDone, unlockAudio } from '../components/plinkoFx'
import { Px } from '../pixel/Pixel'
import { SPRITES, type SpriteName } from '../pixel/sprites'

const iconOf = (id: string | undefined): SpriteName => (id && id in SPRITES ? (id as SpriteName) : 'dice')
const fmtMult = (m: number) => `×${String(m).replace('.', ',')}`

/**
 * «Судьба дня»: Плинко. The ball picks a small useful task; centre — easy, edges — hard and fat in XP.
 * The reward comes only after «Сделал»; a task closed in time earns another ball and grows the streak.
 */
export function Destiny() {
  const data = useStore((s) => s.data)
  const addPlinkoDrop = useStore((s) => s.addPlinkoDrop)
  const setPlinkoDone = useStore((s) => s.setPlinkoDone)
  const setPlinkoLater = useStore((s) => s.setPlinkoLater)
  const setSettings = useStore((s) => s.setSettings)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const log = data.days[today]
  const locked = !!log?.confession
  const allMains = !!game.days[today]?.perfect
  const drops = plinkoDrops(log)
  const next = nextThrow(log, allMains)
  const left = ballsLeft(log, allMains)
  const budget = ballsFor(log, allMains)
  const risk = riskOf(data.settings.plinkoRisk)
  const sound = data.settings.sound ?? true

  const board = useRef<PlinkoHandle>(null)
  const [falling, setFalling] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [, tick] = useState(0)

  const nowMs = nowWithOffset().getTime()
  const ticking = drops.some((d) => d.doneAt === undefined && nowMs < dropDeadline(d))
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
    const r = rollPlinko(today, next, plinkoSeed(data), when, risk)
    addPlinkoDrop(today, { n: next, at: when.getTime(), slot: r.slot, taskId: r.task.id, risk })
    setOpen(null)
    setFalling(next)
    buzz(8)
    await board.current?.drop(r.path)
    setFalling(null)
    setOpen(next)
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
    if (task) useFx.getState().showPop({ title: task.title, stat: task.stat, fromXp: game.xpByStat[task.stat], xp: r.xp, shards: r.shards, crit: false })
  }

  const later = (drop: PlinkoDrop) => {
    if (drop.doneAt === undefined && nowMs < dropDeadline(drop)) setPlinkoLater(today, drop.n, nowWithOffset().getTime())
    setOpen(null)
  }

  // how to get another ball when none are left
  const pendingInTime = drops.some((d) => d.doneAt === undefined && d.laterAt === undefined && nowMs < dropDeadline(d))
  const moreHint =
    budget >= PLINKO_MAX
      ? `Сегодня выбраны все ${PLINKO_MAX} шаров. Завтра — снова ${PLINKO_FREE}.`
      : pendingInTime
        ? 'Закрой выпавшее задание до конца таймера — получишь ещё шар.'
        : !allMains
          ? 'Ещё шар — за все главные квесты дня. Или приходи завтра.'
          : `Шары на сегодня кончились. Завтра — снова ${PLINKO_FREE}.`

  return (
    <div className="stack-lg">
      <p className="small muted page-sub">Не знаешь, чем заняться? Шар выберет маленькое полезное дело. Сделал — получил ещё шар.</p>

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

        <div className="pk-risk" role="radiogroup" aria-label="Риск">
          {PLINKO_RISK_IDS.map((id) => (
            <button key={id} role="radio" aria-checked={risk === id} className={risk === id ? 'on' : ''} disabled={falling !== null} onClick={() => setSettings({ plinkoRisk: id })}>
              {PLINKO_RISKS[id].label}
            </button>
          ))}
        </div>

        <p className="pk-rule">
          <b className="c1">Центр</b> — лёгкие, <b className="c5">края</b> — тяжёлые и жирные по XP
        </p>
        <PlinkoBoard ref={board} risk={risk} sound={sound} restSlot={last && dropRisk(last) === risk ? last.slot : null} />
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

      {card && (
        <DropCard
          key={card.n}
          drop={card}
          nowMs={nowMs}
          streak={dropStreakMult(data.days, today, card.n)}
          onDone={(el) => finish(card, el)}
          onLater={() => later(card)}
        />
      )}

      {visible.length > 0 && (
        <section className="stack">
          <h2 className="pk-h">
            Задания дня <span className="muted small num">шаров {drops.length}/{budget}</span>
          </h2>
          {visible.map((d) => {
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
                <span className="pk-row-state num">
                  {doneR ? `✓ +${doneR.xp}${doneInTime(d) ? ' 🎱' : ''}` : left > 0 ? formatLeft(left) : 'Время вышло'}
                </span>
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
