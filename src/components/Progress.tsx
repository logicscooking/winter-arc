/**
 * v0.16 «Прогрессия»: spheres on «Герой», the final boss card, «Путь к $10k» and the big-moment screen
 * («Новый уровень», a money milestone, «Весенний босс» повержен).
 */
import { useEffect, useMemo } from 'react'
import {
  BOSSES,
  FINAL_WEEK,
  FINAL_WIN,
  GEAR,
  LEVEL_TITLES,
  MILESTONES,
  SPHERES,
  SPHERE_PERKS,
  formatRub,
  formatUsd,
  gameDayOf,
  incomesOf,
  laggingSphere,
  levelOf,
  levelTitle,
  moneyPath,
  plural,
  sphereLevelOf,
  wornOutfit,
} from '../engine'
import type { Area, GameState, GearItem, Outfit } from '../engine'
import { useStore } from '../store/store'
import { haptic, useGame, useNow } from '../store/hooks'
import { BossSprite, PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { AREA_ICON } from '../screens/todayItems'
import { AREA_COLOR } from '../screens/TodayBlocks'

// ---------- spheres ----------

export function SphereList({ game }: { game: GameState }) {
  const lag = laggingSphere(game.xpBySphere)
  return (
    <div className="sphere-list">
      {SPHERES.map((s) => (
        <SphereRow key={s.id} area={s.id} title={s.title} xp={game.xpBySphere[s.id]} lagging={lag === s.id} />
      ))}
    </div>
  )
}

function SphereRow({ area, title, xp, lagging }: { area: Area; title: string; xp: number; lagging: boolean }) {
  const l = sphereLevelOf(xp)
  const gold = l.level >= 15
  const next = SPHERE_PERKS[area].find((p) => p.level > l.level)
  return (
    <div className={`panel tight sphere-row${gold ? ' gold' : ''}${lagging ? ' lag' : ''}`} style={{ '--sc': AREA_COLOR[area] } as React.CSSProperties}>
      <div className="sphere-icon">
        <Px name={AREA_ICON[area]} size={28} />
      </div>
      <div className="stack" style={{ gap: 5, minWidth: 0 }}>
        <div className="row between" style={{ gap: 6 }}>
          <span style={{ fontWeight: 800 }}>
            {title}
            {lagging && <span className="lag-chip">отстаёт</span>}
          </span>
          <span className="tiny muted num">
            {l.into}/{l.span}
          </span>
        </div>
        <div className="bar sphere-bar" role="progressbar" aria-label={`${title}: опыт уровня`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.progress * 100)}>
          <i style={{ width: `${Math.round(l.progress * 100)}%` }} />
        </div>
        <div className="perk-dots" aria-label="Бонусы сферы">
          {SPHERE_PERKS[area].map((p) => (
            <span key={p.level} className={`perk-dot${l.level >= p.level ? ' on' : ''}`} title={`Ур. ${p.level}: ${p.title}`}>
              {p.level}
            </span>
          ))}
          <span className="tiny muted perk-next">{next ? `ур ${next.level}: ${next.title}` : 'все бонусы взяты'}</span>
        </div>
      </div>
      <span className="sphere-lvl num" aria-label={`${title}: уровень ${l.level}`}>
        {l.level}
      </span>
    </div>
  )
}

// ---------- the final boss ----------

/** «Весенний босс»: its HP grows with every boss that got away */
export function FinalBossCard({ game, compact }: { game: GameState; compact?: boolean }) {
  const fled = Object.values(game.bosses).filter((b) => b.done && !b.won && (b.carry ?? 0) > 0 && b.week < FINAL_WEEK)
  const fb = game.finalBoss
  const won = game.trophies.includes(FINAL_WEEK)
  const pctBonus = fb.hp ? fb.bonus / fb.hp : 0
  if (compact)
    return (
      <p className="tiny muted final-line">
        <BossSprite name={BOSSES[FINAL_WEEK - 1]} size={18} /> Весенний босс: <span className="num">{fb.hp}</span> HP
        {fb.bonus > 0 && <b className="final-plus"> +{fb.bonus} от сбежавших</b>}
      </p>
    )
  return (
    <section className={`panel stack final-card${won ? ' won' : ''}`} aria-label="Финальный босс">
      <div className="boss-head">
        <span className="boss-sprite">{won ? <Px name="trophy" size={40} /> : <BossSprite name={BOSSES[FINAL_WEEK - 1]} size={44} />}</span>
        <div>
          <span className="tiny muted">Финальный босс · неделя {FINAL_WEEK}</span>
          <h3>Весенний босс</h3>
        </div>
        <span className="num small muted">{fb.hp} HP</span>
      </div>
      <div className="final-bar" role="img" aria-label={`Своё HP ${fb.base}, от сбежавших боссов ${fb.bonus}`}>
        <i className="base" style={{ width: `${(1 - pctBonus) * 100}%` }} />
        <i className="plus" style={{ width: `${pctBonus * 100}%` }} />
      </div>
      {won ? (
        <p className="tiny" style={{ color: 'var(--gold)' }}>
          Повержен. Титул «{FINAL_WIN.title}» твой.
        </p>
      ) : fled.length ? (
        <>
          <p className="tiny muted">Каждый непобеждённый босс уходит к финальному: половина его остатка HP.</p>
          <div className="fled">
            {fled.map((b) => (
              <span key={b.week} className="fled-chip" title={`${b.name}: +${b.carry} HP`}>
                <BossSprite name={b.name} size={18} />
                <span className="num">+{b.carry}</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="tiny muted">Побеждай боссов недель — иначе они уходят к финальному и он растёт.</p>
      )}
      <p className="tiny muted">
        Награда: легендарная вещь, титул «{FINAL_WIN.title}», +{FINAL_WIN.xp} XP и +{FINAL_WIN.shards} ❄.
      </p>
    </section>
  )
}

// ---------- «Путь к $10k» ----------

/** Shown only once the user logs money; `compact`: one line for the «Деньги» area of «Сегодня» */
export function MoneyPathCard({ compact }: { compact?: boolean }) {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const logged = incomesOf(data).length > 0
  if (!logged) return null
  const p = moneyPath(data, today)
  if (compact)
    return (
      <a className="mp-mini" href="#/hero" aria-label="Путь к $10k">
        <Px name="coin" size={20} />
        <span className="grow">
          <span className="row between">
            <b>Путь к $10k</b>
            <span className="num tiny">
              {formatUsd(p.usd)} / {p.next ? formatUsd(p.next.usd) : '$10 000'}
            </span>
          </span>
          <span className="bar gold thin">
            <i style={{ width: `${Math.round(p.progress * 100)}%` }} />
          </span>
        </span>
      </a>
    )
  return (
    <section className="panel stack money-path" aria-label="Путь к $10k">
      <div className="row between">
        <h3 className="row" style={{ gap: 8 }}>
          <Px name="coin" size={24} /> Путь к $10k
        </h3>
        <span className="tiny muted">в месяц · курс {p.rate} ₽</span>
      </div>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="num mp-now">{formatUsd(p.usd)}</span>
        <span className="small muted num">{formatRub(p.rub)} за месяц</span>
      </div>
      <div className="bar gold" role="progressbar" aria-label={p.next ? `К ${formatUsd(p.next.usd)}` : '$10k взято'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
        <i style={{ width: `${Math.max(p.progress > 0 ? 3 : 0, Math.round(p.progress * 100))}%` }} />
      </div>
      <div className="mp-steps">
        {MILESTONES.map((m) => {
          const got = p.reached.includes(m.id)
          const cur = p.next?.id === m.id
          return (
            <span key={m.id} className={`mp-step${got ? ' got' : ''}${cur ? ' cur' : ''}`}>
              <span className="num">{formatUsd(m.usd)}</span>
              <small>+{m.xp} XP</small>
            </span>
          )
        })}
      </div>
      <p className="tiny muted">
        {p.next ? `До ${formatUsd(p.next.usd)} в этом месяце: ${formatUsd(p.next.usd - p.usd)}. Первая такая веха за арку — +${p.next.xp} XP и +${p.next.shards} ❄${p.next.item ? ', золотой костюм и титул' : ''}.` : 'Этот месяц уже за $10k. Легенда.'}
      </p>
    </section>
  )
}

// ---------- the big-moment screen ----------

interface Moment {
  key: string
  kind: 'level' | 'milestone' | 'final'
  eyebrow: string
  title: string
  text?: string
  chips: { cls: string; icon: 'shard' | 'star' | 'trophy'; text: string }[]
  items: GearItem[]
  /** acknowledging it */
  ack: { levelSeen?: number; moment?: string }
}

const PARTY_COLORS = ['var(--gold-bright)', '#ff5a6a', '#43d57a', '#6cc6f2', '#ffffff']

function bits(seed: number) {
  const r = (i: number) => {
    const x = Math.sin((seed + i) * 9301 + 49297) * 233280
    return x - Math.floor(x)
  }
  return Array.from({ length: 40 }, (_, i) => {
    const a = r(i + 3) * Math.PI * 2
    const dist = 130 + r(i + 11) * 190
    return {
      '--dx': `${Math.round(Math.cos(a) * dist)}px`,
      '--dy': `${Math.round(Math.sin(a) * dist + 80)}px`,
      '--s': `${Math.round(5 + r(i + 5) * 8)}px`,
      '--br': i % 3 === 0 ? '2px' : '50%',
      '--c': PARTY_COLORS[i % PARTY_COLORS.length],
      '--rot': `${Math.round(r(i + 17) * 540)}deg`,
      '--delay': `${(0.15 + r(i + 23) * 0.3).toFixed(2)}s`,
    } as React.CSSProperties
  })
}

function pendingMoment(game: GameState, levelSeen: number | undefined, moments: string[]): Moment | null {
  if (game.trophies.includes(FINAL_WEEK) && !moments.includes('final')) {
    const item = GEAR.filter((g) => g.boss === FINAL_WEEK)
    return {
      key: 'final',
      kind: 'final',
      eyebrow: 'Финал арки',
      title: 'Весенний босс повержен',
      text: `Зима твоя. Титул «${FINAL_WIN.title}» — навсегда.`,
      chips: [
        { cls: 'gold', icon: 'star', text: `+${FINAL_WIN.xp} XP` },
        { cls: 'ice', icon: 'shard', text: `+${FINAL_WIN.shards}` },
      ],
      items: item,
      ack: { moment: 'final' },
    }
  }
  for (const m of game.milestones) {
    if (moments.includes(m.id)) continue
    const ms = MILESTONES.find((x) => x.id === m.id)
    if (!ms) continue
    return {
      key: m.id,
      kind: 'milestone',
      eyebrow: 'Путь к $10k',
      title: `${formatUsd(ms.usd)} за месяц`,
      text: ms.title ? `Цель арки взята. Титул «${ms.title}».` : 'Первая такая веха за арку. Дальше — следующая.',
      chips: [
        { cls: 'gold', icon: 'star', text: `+${ms.xp} XP` },
        { cls: 'ice', icon: 'shard', text: `+${ms.shards}` },
      ],
      items: GEAR.filter((g) => g.milestone === m.id),
      ack: { moment: m.id },
    }
  }
  const level = levelOf(game.xp).level
  if (levelSeen !== undefined && level > levelSeen) {
    const ups = game.levelUps.filter((u) => u.level > levelSeen && u.level <= level)
    const shards = ups.reduce((s, u) => s + u.shards, 0)
    const titleUp = LEVEL_TITLES.find(([l]) => l > levelSeen && l <= level)
    const items = GEAR.filter((g) => g.level !== undefined && g.level > Math.max(1, levelSeen) && g.level <= level)
    return {
      key: `lvl:${level}`,
      kind: 'level',
      eyebrow: ups.length > 1 ? `+${ups.length} ${plural(ups.length, 'уровень', 'уровня', 'уровней')}` : 'Герой вырос',
      title: `Новый уровень ${level}`,
      text: titleUp ? `Новый титул: «${levelTitle(level)}»` : level >= 30 ? 'Максимум арки. Дальше XP идёт «сверх».' : undefined,
      chips: [{ cls: 'ice', icon: 'shard', text: `+${shards}` }, ...(titleUp ? [{ cls: 'gold', icon: 'trophy' as const, text: levelTitle(level) }] : [])],
      items,
      ack: { levelSeen: level },
    }
  }
  return null
}

/** Mounted once in the shell: shows one pending moment at a time, until «Забрать» */
export function MomentScreen() {
  const game = useGame()
  const ack = useStore((s) => s.data.ack)
  const setAck = useStore((s) => s.setAck)
  const outfit = useWornOutfit()
  const purchases = useStore((s) => s.data.purchases)
  const profileOutfit = useStore((s) => s.data.profile?.outfit)
  const level = levelOf(game.xp).level

  // first run of v0.16: the current level counts as seen, nothing floods in
  useEffect(() => {
    if (ack.levelSeen === undefined) setAck({ levelSeen: level })
  }, [ack.levelSeen, level, setAck])

  const m = pendingMoment(game, ack.levelSeen, ack.moments ?? [])
  const seed = useMemo(() => (m ? m.key.length * 31 + level : 0), [m?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const confetti = useMemo(() => bits(seed), [seed])
  useEffect(() => {
    if (m) haptic([20, 50, 20, 50, 40])
  }, [m?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null

  const take = () => {
    if (m.ack.levelSeen !== undefined) setAck({ levelSeen: m.ack.levelSeen })
    if (m.ack.moment) setAck({ moments: [...(ack.moments ?? []), m.ack.moment] })
  }
  // the hero wears the first new item on the screen
  const first = m.items[0]
  const look: Outfit = first ? { ...wornOutfit(profileOutfit, level, purchases, game), [first.slot]: first.id } : outfit
  return (
    <div className={`moment moment-${m.kind}`} role="dialog" aria-modal="true" aria-label={m.title}>
      <div className="moment-fx" aria-hidden>
        {confetti.map((b, i) => (
          <i key={i} style={b} />
        ))}
      </div>
      <div className="moment-card">
        <span className="moment-eyebrow">{m.eyebrow}</span>
        <div className="moment-ava">
          <span className="moment-rays" aria-hidden />
          <PixelAvatar outfit={look} size={150} title="Твой герой" />
        </div>
        <div className="big-title">{m.title}</div>
        {m.text && <p className="moment-text">{m.text}</p>}
        <div className="pop-chips moment-chips">
          {m.chips.map((c) => (
            <span key={c.text} className={`reward-chip ${c.cls}`}>
              <Px name={c.icon} size={22} /> {c.text}
            </span>
          ))}
        </div>
        {m.items.length > 0 && (
          <div className="moment-items">
            {m.items.map((g) => (
              <span key={g.id} className={`moment-item${g.legendary ? ' legend' : ''}`}>
                <PixelAvatar outfit={{ hair: look.hair, skin: look.skin, colors: look.colors, [g.slot]: g.id }} size={52} title={g.title} />
                <small>{g.title}</small>
              </span>
            ))}
          </div>
        )}
        <button className="btn primary block" onClick={take} autoFocus>
          Забрать
        </button>
      </div>
    </div>
  )
}
