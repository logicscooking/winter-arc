import { ARC_DAYS, ARC_START, CHAPTERS, addDays, arcDayNumber, chapterOf, diffDays, heroTitle, eloLevel, plural, weekOf } from '../engine'
import type { GameState } from '../engine'
import { useStore } from '../store/store'
import { Banner, useHint } from './ui'
import { PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { EloBlock } from './Elo'

const NEW_YEAR = '2027-01-01'

/** «До Нового года N дней» until Jan 1, then a greeting on the day itself */
export function NewYearChip({ today }: { today: string }) {
  const n = diffDays(today, NEW_YEAR)
  if (n < 0) return null
  return (
    <span className="ny-chip">
      <Px name="fir" size={18} />
      {n === 0 ? 'С Новым годом!' : `До Нового года ${n} ${plural(n, 'день', 'дня', 'дней')}`}
    </span>
  )
}

export function Hud({ game, mainsDone, mainsTotal }: { game: GameState; mainsDone: number; mainsTotal: number }) {
  const profile = useStore((s) => s.data.profile)!
  const outfit = useWornOutfit()
  const warmup = game.today < ARC_START
  const day = Math.max(1, Math.min(ARC_DAYS, arcDayNumber(game.today)))
  const ch = CHAPTERS[chapterOf(game.today)]
  const lvl = eloLevel(game.elo)
  const toArc = diffDays(game.today, ARC_START)
  const [hpHint, dismissHp] = useHint('hp')
  const gainToday = game.days[game.today]?.eloGain ?? 0
  const mainPct = mainsTotal ? Math.round((mainsDone / mainsTotal) * 100) : 0
  return (
    <header className="hud">
      <div className="day-line">
        <span className="chapter-name">{warmup ? 'Разминка' : ch.id === 0 ? `Пролог · неделя ${weekOf(game.today)}` : `Глава ${ch.roman}. ${ch.name}`}</span>
        {warmup ? (
          <span className="day-counter" aria-label={`До старта арки ${toArc} ${plural(toArc, 'день', 'дня', 'дней')}`}>
            {toArc}
            <small>{plural(toArc, 'день', 'дня', 'дней')} до старта</small>
          </span>
        ) : (
          <span className="day-counter" aria-label={`День ${day} из ${ARC_DAYS}`}>
            День {day}
            <small>/{ARC_DAYS}</small>
          </span>
        )}
      </div>
      <a className="hero-strip" href="#/hero" aria-label={`${profile.nick}, Эло ${game.elo}, уровень ${lvl.level}, HP ${game.hp}. Открыть персонажа`} style={game.fallen ? { borderColor: 'var(--hp)' } : undefined}>
        <span className="hs-left">
          <span className="hs-name">{profile.nick}</span>
          <span className="hs-title">{heroTitle(game)}</span>
          <span className="hs-ava">
            <PixelAvatar outfit={outfit} size={78} title={`Аватар ${profile.nick}`} />
          </span>
          <span className={`hp-badge${game.hp <= 30 ? ' low' : ''}`}>
            <Px name="heart" size={18} />
            <span className="num">{game.hp}/100</span>
          </span>
        </span>
        <span className="hs-right">
          <EloBlock elo={game.elo} size={50} gain={warmup ? 0 : gainToday} />
          <span className="hs-k">
            <Px name="quests" size={16} />
            <span className="num">
              Главные: {mainsDone}/{mainsTotal}
            </span>
          </span>
          <span className="fat-row">
            <span className="fat-bar gold" role="progressbar" aria-label="Главные квесты сегодня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mainPct}>
              <i style={{ width: `${mainPct ? Math.max(mainPct, 4) : 0}%` }} />
            </span>
            <span className="num">{mainPct}%</span>
          </span>
        </span>
      </a>
      <NewYearChip today={game.today} />
      {hpHint && (
        <Banner icon="heart" title="HP — твоя жизнь в арке" art={['heart', 'shard']} onClose={dismissHp}>
          Падает за пропуски{warmup ? ' (в разминке не тратится)' : ''}. Осколки ❄ — валюта магазина наград.
        </Banner>
      )}
      {!warmup && <ArcStrip game={game} />}
    </header>
  )
}

export function ArcStrip({ game }: { game: GameState }) {
  const starts = new Set(CHAPTERS.map((c) => c.start))
  return (
    <div>
      <div className="arc" role="img" aria-label="98 дней арки: сделанные, пропущенные и сегодняшний день">
        {Array.from({ length: ARC_DAYS }, (_, i) => {
          const d = addDays(ARC_START, i)
          const r = game.days[d]
          let cls = ''
          if (d === game.today) cls = 'today'
          else if (r?.closed) cls = r.frozen ? 'frozen' : r.perfect ? 'perfect' : r.missedMain.length < r.plan.filter((p) => p.role === 'main').length ? 'ok' : 'miss'
          else if (d > game.today) cls = 'future'
          if (starts.has(d) && cls !== 'today') cls += ' ch'
          return <i key={d} className={cls} title={d} />
        })}
      </div>
      <div className="arc-legend">
        {CHAPTERS.map((c) => {
          const left = (diffDays(ARC_START, c.start) / ARC_DAYS) * 100
          return (
            <span key={c.id} style={{ left: `${left}%` }}>
              {c.id === 0 ? 'Пролог' : c.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}
