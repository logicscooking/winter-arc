/**
 * v0.16 «Прогрессия»: spheres on «Герой», the «Покоритель зимы» card and the big-moment screen
 * («Новый уровень», v0.17 a money boss of the month killed, v0.18 «Покоритель зимы» at the arc end).
 */
import { useEffect, useMemo } from 'react'
import {
  ARC_END,
  ARC_START,
  CONQUEROR,
  GEAR,
  LEVEL_TITLES,
  SPHERES,
  SPHERE_PERKS,
  MAIN_BOSS_PRIZE,
  MAIN_MONEY_BOSS,
  addDays,
  diffDays,
  formatUsd,
  moneyBossById,
  laggingSphere,
  levelOf,
  levelTitle,
  plural,
  sphereLevelOf,
  wornOutfit,
} from '../engine'
import type { Area, GameState, GearItem, Outfit } from '../engine'
import { useStore } from '../store/store'
import { haptic, useGame } from '../store/hooks'
import { MoneyBossSprite, PixelAvatar, Px } from '../pixel/Pixel'
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

// ---------- «Покоритель зимы» ----------

/** «Покоритель зимы»: closed (perfect) arc days towards the arc-end title */
export function ConquerorCard({ game }: { game: GameState }) {
  const c = game.conqueror
  const ended = game.today > ARC_END || (game.today === ARC_END && !!game.days[ARC_END]?.closed)
  // arc days still open (the warm-up counts from the arc start; today counts while it is not closed yet)
  const from = game.today < ARC_START ? ARC_START : game.today
  const left = Math.max(0, diffDays(from, ARC_END) + (from === game.today && game.days[from]?.perfect ? 0 : 1))
  const still = Math.max(0, c.need - c.closed)
  const item = GEAR.find((g) => g.conqueror)
  return (
    <section className={`panel stack final-card${c.won ? ' won' : ''}`} aria-label={CONQUEROR.title}>
      <div className="row" style={{ gap: 10 }}>
        <Px name="trophy" size={36} className={c.won ? undefined : 'dim'} />
        <div className="grow">
          <span className="tiny muted">Финал арки · 28 февраля</span>
          <h3>{CONQUEROR.title}</h3>
        </div>
        <span className="num small muted">
          {c.closed}/{c.need}
        </span>
      </div>
      <div className="final-bar" role="progressbar" aria-label={`Закрыто ${c.closed} из ${c.need} нужных дней`} aria-valuemin={0} aria-valuemax={c.need} aria-valuenow={Math.min(c.closed, c.need)}>
        <i className="base" style={{ width: `${Math.min(1, c.closed / c.need) * 100}%` }} />
      </div>
      <p className="small">
        {CONQUEROR.title}: закрыто <b className="num">{c.closed}</b> из <span className="num">{c.need}</span> нужных
      </p>
      <p className="tiny muted">
        {c.won
          ? `Зима взята. Титул «${CONQUEROR.title}» твой.`
          : ended
            ? `Арка закрыта: ${c.closed} из ${c.need}. В этот раз не хватило.`
            : still > left
              ? `Даже если закрыть все ${left} оставшихся дней, до ${c.need} не дотянуть. Но каждый закрытый день всё равно в счёт.`
              : `Закрытый день — все главные квесты сделаны. Ещё ${still} ${plural(still, 'день', 'дня', 'дней')} из ${left} оставшихся.`}
      </p>
      {!c.won && (
        <p className="tiny muted">
          Награда в конце арки: {item ? `легендарный «${item.title}», ` : ''}титул, +{CONQUEROR.xp} XP и +{CONQUEROR.shards} ❄.
        </p>
      )}
    </section>
  )
}

// ---------- the big-moment screen ----------

interface Moment {
  key: string
  kind: 'level' | 'mboss' | 'final'
  eyebrow: string
  /** a money boss: its sprite instead of the hero */
  boss?: string
  title: string
  text?: string
  chips: { cls: string; icon: 'shard' | 'star' | 'trophy'; text: string }[]
  items: GearItem[]
  /** acknowledging it */
  ack: { levelSeen?: number; moments?: string[] }
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

/** ack key of one money boss kill: once per boss per month */
export const moneyMomentKey = (k: { month: string; id: string }) => `mb:${k.month}:${k.id}`

function pendingMoment(game: GameState, levelSeen: number | undefined, moments: string[]): Moment | null {
  // v0.18: its own ack key ('conqueror'); an old 'final' ack of the weekly bosses means nothing now
  if (game.conqueror?.won && !moments.includes('conqueror')) {
    return {
      key: 'conqueror',
      kind: 'final',
      eyebrow: 'Финал арки',
      title: CONQUEROR.title,
      text: `${game.conqueror.closed} закрытых дней из 98. Зима твоя — титул навсегда.`,
      chips: [
        { cls: 'gold', icon: 'star', text: `+${CONQUEROR.xp} XP` },
        { cls: 'ice', icon: 'shard', text: `+${CONQUEROR.shards}` },
        { cls: 'gold', icon: 'trophy', text: CONQUEROR.title },
      ],
      items: GEAR.filter((g) => g.conqueror),
      ack: { moments: ['conqueror'] },
    }
  }
  // v0.17 «Боссы месяца»: kills of the last week not seen yet, all in one screen (the top boss leads)
  const fresh = game.moneyKills.filter((k) => k.day >= addDays(game.today, -7) && !moments.includes(moneyMomentKey(k)))
  if (fresh.length) {
    const top = fresh.reduce((a, k) => ((moneyBossById(k.id)?.usd ?? 0) > (moneyBossById(a.id)?.usd ?? 0) ? k : a))
    const tb = moneyBossById(top.id)!
    const firstMain = top.id === MAIN_MONEY_BOSS.id && game.moneyKills.find((k) => k.id === MAIN_MONEY_BOSS.id) === top
    const others = fresh.filter((k) => k !== top).map((k) => moneyBossById(k.id)?.name).filter(Boolean)
    const xp = fresh.reduce((s, k) => s + (moneyBossById(k.id)?.xp ?? 0), 0)
    const shards = fresh.reduce((s, k) => s + (moneyBossById(k.id)?.shards ?? 0), 0)
    return {
      key: `mb:${fresh.map(moneyMomentKey).join(',')}`,
      kind: 'mboss',
      boss: tb.id,
      eyebrow: tb.main ? 'Главный босс месяца' : 'Босс месяца повержен',
      title: tb.name,
      text: [
        firstMain ? `${formatUsd(tb.usd)} за месяц. Титул «${MAIN_BOSS_PRIZE.title}» — твой.` : tb.main ? `${formatUsd(tb.usd)} за месяц. Снова в десятке.` : `${formatUsd(tb.usd)} за месяц — повержен.`,
        others.length ? `И ещё: ${others.map((n) => `«${n}»`).join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      chips: [
        { cls: 'gold', icon: 'star', text: `+${xp} XP` },
        { cls: 'ice', icon: 'shard', text: `+${shards}` },
        ...(firstMain ? [{ cls: 'gold', icon: 'trophy' as const, text: MAIN_BOSS_PRIZE.title }] : []),
      ],
      items: firstMain ? GEAR.filter((g) => g.moneyBoss === MAIN_MONEY_BOSS.id) : [],
      ack: { moments: fresh.map(moneyMomentKey) },
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
    if (m.ack.moments) setAck({ moments: [...(ack.moments ?? []), ...m.ack.moments] })
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
          {m.boss ? (
            <span className="moment-boss">
              <MoneyBossSprite id={m.boss} size={120} title={m.title} />
              <span className="moment-ko" aria-hidden>
                ✕
              </span>
            </span>
          ) : (
            <PixelAvatar outfit={look} size={150} title="Твой герой" />
          )}
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
