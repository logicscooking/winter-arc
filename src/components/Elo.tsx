import { ELO_FLOORS, eloColor, eloLevel } from '../engine'

/** FACEIT-style badge: a ring of 10 segments (lit up to the level) with the level number inside */
export function EloBadge({ level, size = 44 }: { level: number; size?: number }) {
  const color = eloColor(level)
  const c = 24
  const r = 20
  const seg = (i: number) => {
    const gap = 0.16
    const a0 = -Math.PI / 2 + (i / 10) * 2 * Math.PI + gap / 2
    const a1 = -Math.PI / 2 + ((i + 1) / 10) * 2 * Math.PI - gap / 2
    const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
    return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
  }
  return (
    <svg className="elo-badge" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`Уровень ${level} из 10`}>
      <circle cx={c} cy={c} r={16} fill="rgba(0,0,0,.35)" />
      {Array.from({ length: 10 }, (_, i) => (
        <path key={i} d={seg(i)} fill="none" strokeWidth={4.5} strokeLinecap="butt" stroke={i < level ? color : 'rgba(255,255,255,.16)'} />
      ))}
      <text x={c} y={c + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={level >= 10 ? 15 : 19} fontWeight={800} fill={color} style={{ fontFamily: 'inherit' }}>
        {level}
      </text>
    </svg>
  )
}

/** «Эло 1135 · Ур. 5» with the badge, a bar to the next level and the Эло left */
export function EloBlock({ elo, size = 52, gain }: { elo: number; size?: number; gain?: number }) {
  const l = eloLevel(elo)
  const color = eloColor(l.level)
  const pct = Math.round(l.progress * 100)
  return (
    <div className="elo-block">
      <EloBadge level={l.level} size={size} />
      <div className="elo-main">
        <div className="elo-line">
          <span className="elo-num num" style={{ color }}>
            Эло {elo}
          </span>
          <span className="elo-lvl">· Ур. {l.level}</span>
          {!!gain && <span className="elo-gain">+{gain} сегодня</span>}
        </div>
        <span className="elo-bar" role="progressbar" aria-label="Эло до следующего уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${Math.max(pct, 4)}%`, background: color }} />
        </span>
        <span className="tiny muted">{l.max ? 'Максимальный уровень' : `${l.toNext} до Ур. ${l.level + 1} (${ELO_FLOORS[l.level]})`}</span>
      </div>
    </div>
  )
}
