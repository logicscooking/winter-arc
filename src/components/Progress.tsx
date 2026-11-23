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
  ELO_TITLES,
  SPHERES,
  MAIN_BOSS_PRIZE,
  MAIN_MONEY_BOSS,
  addDays,
  diffDays,
  formatUsd,
  moneyBossById,
  eloTitle,
  levelOf,
  plural,
  sphereWeekGrid,
  RU_WEEKDAYS,
  wornOutfit,
} from '../engine'
import type { Area, GameState, GearItem, Outfit } from '../engine'
import { useStore } from '../store/store'
import { haptic, useGame } from '../store/hooks'
import { MoneyBossSprite, PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { AREA_ICON } from '../screens/todayItems'
import { AREA_COLOR } from '../screens/TodayBlocks'

// ---------- spheres: radar + week grid ----------

const CX = 150
const CY = 118
const RAD = 74
/** axes clockwise from the top: Здоровье, Деньги, Развитие, Разное */
const ANGLE = [-90, 0, 90, 180]
const pt = (i: number, r: number) => `${(CX + Math.cos((ANGLE[i] * Math.PI) / 180) * r).toFixed(1)},${(CY + Math.sin((ANGLE[i] * Math.PI) / 180) * r).toFixed(1)}`
const poly = (vals: number[]) => vals.map((v, i) => pt(i, RAD * Math.max(0.02, v))).join(' ')

export function SphereList({ game }: { game: GameState }) {
  const quests = useStore((s) => s.data.quests)
  const g = useMemo(() => sphereWeekGrid(game, quests, game.today), [game, quests])
  const areas = SPHERES.map((s) => s.id)
  const now = areas.map((a) => g.thisWeek[a] ?? 0)
  const before = areas.map((a) => g.lastWeek[a] ?? 0)
  const totals = Object.fromEntries(areas.map((a) => [a, g.cells[a].reduce((t, c) => ({ done: t.done + c.done, total: t.total + c.total }), { done: 0, total: 0 })])) as Record<Area, { done: number; total: number }>
  const known = areas.filter((a) => g.thisWeek[a] !== null)
  const best = known.reduce<Area | null>((m, a) => (m === null || g.thisWeek[a]! > g.thisWeek[m]! ? a : m), null)
  const worst = known.reduce<Area | null>((m, a) => (m === null || g.thisWeek[a]! < g.thisWeek[m]! ? a : m), null)
  const pct = (a: Area) => Math.round((g.thisWeek[a] ?? 0) * 100)
  const title = (a: Area) => SPHERES.find((s) => s.id === a)!.title
  let verdict = 'За эту неделю ещё нет квестов в планах.'
  if (best && worst) {
    if (best === worst || g.thisWeek[best] === g.thisWeek[worst]) verdict = `Все сферы идут вровень — ${pct(best)}%.`
    else verdict = `Сильнее всего — ${title(best)} ${pct(best)}%. Подтяни ${title(worst)}: ${totals[worst].done} из ${totals[worst].total} за неделю.`
  }
  return (
    <div className="panel stack sphere-card">
      <div className="radar" role="img" aria-label={`Сферы за неделю: ${areas.map((a) => `${title(a)} ${pct(a)}%`).join(', ')}`}>
        <svg viewBox="0 -30 300 296" aria-hidden>
          {[0.25, 0.5, 0.75, 1].map((k) => (
            <polygon key={k} className={`radar-ring${k === 1 ? ' outer' : ''}`} points={areas.map((_, i) => pt(i, RAD * k)).join(' ')} />
          ))}
          {areas.map((_, i) => (
            <line key={i} className="radar-axis" x1={CX} y1={CY} x2={pt(i, RAD).split(',')[0]} y2={pt(i, RAD).split(',')[1]} />
          ))}
          <polygon className="radar-last" points={poly(before)} />
          <polygon className="radar-now" points={poly(now)} />
          {areas.map((a, i) => {
            const [x, y] = pt(i, RAD * Math.max(0.02, now[i])).split(',')
            return <circle key={a} cx={x} cy={y} r={4.5} className="radar-dot" style={{ fill: AREA_COLOR[a] }} />
          })}
          {[25, 50, 75].map((k) => (
            <text key={k} className="radar-tick" x={CX + 3} y={CY - (RAD * k) / 100 + 9}>
              {k}
            </text>
          ))}
        </svg>
        {areas.map((a, i) => (
          <div key={a} className={`radar-tip t${i}`} style={{ '--sc': AREA_COLOR[a] } as React.CSSProperties}>
            <span className="radar-ico">
              <Px name={AREA_ICON[a]} size={18} />
            </span>
            <b>{title(a)}</b>
            <span className="num">{g.thisWeek[a] === null ? '—' : `${pct(a)}%`}</span>
          </div>
        ))}
      </div>
      <div className="radar-legend tiny">
        <span>
          <i className="lg-now" /> эта неделя
        </span>
        <span>
          <i className="lg-last" /> прошлая
        </span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {verdict}
      </p>

      <div className="week-grid" role="table" aria-label="Сферы по дням недели">
        <div className="wg-row wg-head" role="row">
          <span />
          {g.days.map((d, i) => (
            <span key={d} className={`tiny${d === game.today ? ' now' : ''}`} role="columnheader">
              {RU_WEEKDAYS[i]}
            </span>
          ))}
          <span />
        </div>
        {areas.map((a) => (
          <div key={a} className="wg-row" role="row" style={{ '--sc': AREA_COLOR[a] } as React.CSSProperties}>
            <span className="wg-name small" role="rowheader">
              <Px name={AREA_ICON[a]} size={18} />
              {title(a)}
            </span>
            {g.cells[a].map((c, i) => {
              const d = g.days[i]
              const future = d > game.today
              const r = c.total ? c.score / c.total : 0
              const cls = future ? 'future' : !c.total ? 'none' : r >= 1 ? 'full' : r > 0 ? 'part' : 'zero'
              return (
                <i
                  key={d}
                  role="cell"
                  className={`wg-cell ${cls}${d === game.today ? ' today' : ''}`}
                  style={cls === 'part' ? ({ '--o': `${Math.round(28 + r * 52)}%` } as React.CSSProperties) : undefined}
                  aria-label={`${RU_WEEKDAYS[i]}: ${future ? 'впереди' : c.total ? `${c.done} из ${c.total}` : 'нет квестов'}`}
                />
              )
            })}
            <span className="wg-sum num tiny">
              {totals[a].done}/{totals[a].total}
            </span>
          </div>
        ))}
      </div>
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
          Награда в конце арки: {item ? `легендарный «${item.title}», ` : ''}титул и +{CONQUEROR.shards} WF.
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
  ack: { eloSeen?: number; moments?: string[] }
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
        { cls: 'ice', icon: 'shard', text: `+${shards}` },
        ...(firstMain ? [{ cls: 'gold', icon: 'trophy' as const, text: MAIN_BOSS_PRIZE.title }] : []),
      ],
      items: firstMain ? GEAR.filter((g) => g.moneyBoss === MAIN_MONEY_BOSS.id) : [],
      ack: { moments: fresh.map(moneyMomentKey) },
    }
  }
  const level = game.eloLevel
  if (levelSeen !== undefined && level > levelSeen) {
    const ups = game.levelUps.filter((u) => u.level > levelSeen && u.level <= level)
    const shards = ups.reduce((s, u) => s + u.shards, 0)
    const titleUp = ELO_TITLES.find(([l]) => l > levelSeen && l <= level && l > 1)
    const items = GEAR.filter((g) => g.eloLevel !== undefined && g.eloLevel > levelSeen && g.eloLevel <= level)
    return {
      key: `elo:${level}`,
      kind: 'level',
      eyebrow: ups.length > 1 ? `+${ups.length} ${plural(ups.length, 'уровень', 'уровня', 'уровней')}` : `Эло ${game.elo}`,
      title: `Уровень ${level} из 10`,
      text: titleUp ? `Новый титул: «${eloTitle(level)}»` : level >= 10 ? 'Максимум FACEIT-лестницы. Ты на вершине.' : undefined,
      chips: [{ cls: 'ice', icon: 'shard', text: `+${shards}` }, ...(titleUp ? [{ cls: 'gold', icon: 'trophy' as const, text: eloTitle(level) }] : [])],
      items,
      ack: { eloSeen: level },
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

  // first run of v0.22: the current Эло level counts as seen, nothing floods in
  useEffect(() => {
    if (ack.eloSeen === undefined) setAck({ eloSeen: game.eloLevel })
  }, [ack.eloSeen, game.eloLevel, setAck])

  const m = pendingMoment(game, ack.eloSeen, ack.moments ?? [])
  const seed = useMemo(() => (m ? m.key.length * 31 + level : 0), [m?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const confetti = useMemo(() => bits(seed), [seed])
  useEffect(() => {
    if (m) haptic([20, 50, 20, 50, 40])
  }, [m?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null

  const take = () => {
    if (m.ack.eloSeen !== undefined) setAck({ eloSeen: m.ack.eloSeen })
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
