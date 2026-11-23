import { ELO_FLOORS, eloColor, eloLevel } from '../engine'

const ARC_SEGS = 10
const SWEEP = 1.5 * Math.PI // 270°, open at the bottom
const START = Math.PI * 0.75 // from bottom-left, clockwise over the top to bottom-right

/**
 * FACEIT-style level badge: the level number in a dark disc, a 270° arc of 10 segments around it,
 * lit by the progress inside the level (all lit at level 10). Colors by level (eloColor).
 */
export function EloBadge({ level, progress = 1, size = 44 }: { level: number; progress?: number; size?: number }) {
  const color = eloColor(level)
  const c = 24
  const r = 20.5
  const lit = level >= 10 ? ARC_SEGS : Math.max(0, Math.min(ARC_SEGS, Math.floor(progress * ARC_SEGS + 1e-6)))
  const seg = (i: number) => {
    const gap = 0.09
    const a0 = START + (i / ARC_SEGS) * SWEEP + gap / 2
    const a1 = START + ((i + 1) / ARC_SEGS) * SWEEP - gap / 2
    const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
    return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
  }
  return (
    <svg className="elo-badge" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`Уровень ${level} из 10`}>
      <circle cx={c} cy={c} r={16.5} fill="#1b1f24" stroke="rgba(255,255,255,.08)" strokeWidth={1} />
      {Array.from({ length: ARC_SEGS }, (_, i) => (
        <path key={i} d={seg(i)} fill="none" strokeWidth={4} strokeLinecap="butt" stroke={i < lit ? color : 'rgba(127,135,145,.35)'} />
      ))}
      <text x={c} y={c + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={level >= 10 ? 15 : 19} fontWeight={900} fill={color} style={{ fontFamily: 'inherit' }}>
        {level}
      </text>
    </svg>
  )
}

/** «Эло 1012» with the FACEIT badge, a thin bar «до ур. 5: 39 Эло» and «+12 сегодня» */
export function EloBlock({ elo, size = 52, gain, loss }: { elo: number; size?: number; gain?: number; loss?: number }) {
  const l = eloLevel(elo)
  const pct = Math.round(l.progress * 100)
  return (
    <div className="elo-block">
      <EloBadge level={l.level} progress={l.progress} size={size} />
      <div className="elo-line">
        <span className="elo-num num">
          Эло <b>{elo}</b>
        </span>
        {(!!gain || !!loss) && (
          <span className="elo-today">
            {!!gain && <span className="elo-gain">+{gain} сегодня</span>}
            {!!loss && <span className="elo-loss">−{Math.abs(loss)} штраф</span>}
          </span>
        )}
      </div>
      <span className="elo-bar" role="progressbar" aria-label="Эло до следующего уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${Math.max(pct, 4)}%`, background: l.level === 1 ? 'var(--mist)' : eloColor(l.level) }} />
      </span>
      <span className="elo-next">{l.max ? 'Уровень 10 — максимум' : `до ур. ${l.level + 1}: ${l.toNext} Эло`}</span>
    </div>
  )
}

/** The level table «1 … 10» with Эло ranges, the current one highlighted */
export function EloTable({ elo }: { elo: number }) {
  const cur = eloLevel(elo).level
  return (
    <ol className="elo-table" aria-label="Уровни Эло">
      {ELO_FLOORS.map((from, i) => {
        const lvl = i + 1
        const to = ELO_FLOORS[i + 1]
        return (
          <li key={lvl} className={lvl === cur ? 'on' : ''}>
            <EloBadge level={lvl} size={28} />
            <span className="num">{lvl === 1 ? `до ${to - 1}` : `от ${from}`}</span>
          </li>
        )
      })}
    </ol>
  )
}
