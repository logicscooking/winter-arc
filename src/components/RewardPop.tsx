import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { levelOf, statName } from '../engine'
import { useFx } from '../store/hooks'
import { Px, STAT_SPRITE } from '../pixel/Pixel'
import { Bar } from './ui'

/** Skillion-style reward card: stat + level, bar filling to the new value, XP pill, ❄ and CRITICAL chips */
export function RewardPop() {
  const pop = useFx((s) => s.pop)
  const hide = useFx((s) => s.hidePop)
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    setFilled(false)
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)))
    return () => cancelAnimationFrame(t)
  }, [pop?.id])
  if (!pop) return null
  const before = levelOf(pop.fromXp)
  const after = levelOf(pop.fromXp + pop.xp)
  const levelUp = after.level > before.level
  const shown = filled ? after : before
  const lo = pop.fromXp + pop.xp - after.into
  return (
    <div className="pop-wrap" role="status" aria-live="polite">
      <div className="pop" key={pop.id}>
        <button className="icon-btn pop-close" onClick={hide} aria-label="Скрыть">
          <X size={18} />
        </button>
        <div className="pop-top">
          <Px name={STAT_SPRITE[pop.stat]} size={44} />
          <div>
            <h3>{statName(pop.stat)}</h3>
            <div className="small muted">{levelUp ? `Новый уровень ${after.level}!` : `Уровень ${after.level}`}</div>
          </div>
          <span className="pop-xp">+{pop.xp} XP</span>
        </div>
        <div className="pop-bar">
          <span className="num">{lo}</span>
          <Bar value={levelUp && !filled ? 1 : shown.progress} label={`${statName(pop.stat)}: опыт уровня`} />
          <span className="num">{lo + after.span}</span>
        </div>
        <div className="pop-chips">
          {pop.shards > 0 && (
            <span className="reward-chip ice">
              <Px name="shard" size={22} /> +{pop.shards}
            </span>
          )}
          {pop.crit && (
            <span className="reward-chip crit">
              <Px name="flame" size={22} /> КРИТ! ×1,5
            </span>
          )}
          {!!pop.destiny && (
            <span className="reward-chip gold">
              <Px name="dice" size={22} /> Судьба +{pop.destiny}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
