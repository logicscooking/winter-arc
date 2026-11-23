import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { sphereLevelOf, sphereOfStat, sphereTitle } from '../engine'
import { useFx } from '../store/hooks'
import { Px } from '../pixel/Pixel'
import { AREA_ICON } from '../screens/todayItems'
import { Bar } from './ui'

/** Skillion-style reward card: stat + level, bar filling to the new value, sphere points pill, WF and CRITICAL chips */
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
  // v0.16: progress of the sphere («Здоровье», «Деньги», «Развитие», «Разное»)
  const area = pop.area ?? sphereOfStat(pop.stat) ?? 'misc'
  const name = sphereTitle(area)
  const before = sphereLevelOf(pop.fromXp)
  const after = sphereLevelOf(pop.fromXp + pop.xp)
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
          <Px name={AREA_ICON[area]} size={44} />
          <div>
            <h3>{name}</h3>
            <div className="small muted">{levelUp ? `Новый уровень ${after.level}!` : `Уровень ${after.level}`}</div>
          </div>
          <span className="pop-xp" title="Очки сферы: растят её уровень">+{pop.xp} в сферу</span>
        </div>
        <div className="pop-bar">
          <span className="num">{lo}</span>
          <Bar value={levelUp && !filled ? 1 : shown.progress} label={`${name}: очки до следующего уровня сферы`} />
          <span className="num">{lo + after.span}</span>
        </div>
        {pop.impact && <p className="pop-impact">{pop.impact}</p>}
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
          {pop.flow && (
            <span className="reward-chip gold">
              <Px name="play" size={22} /> Поток ×2
            </span>
          )}
          {pop.theme && !pop.flow && (
            <span className="reward-chip gold">
              <Px name="star" size={22} /> Тема ×1,5
            </span>
          )}
          {!!pop.destiny && (
            <span className="reward-chip gold">
              <Px name="plinko" size={22} /> Судьба +{pop.destiny}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
