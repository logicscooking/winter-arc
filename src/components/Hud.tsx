import { useState } from 'react'
import { ARC_DAYS, ARC_START, CHAPTERS, arcDayNumber, chapterOf, diffDays, eloLevel, formatRub, formatUsd, gameDayOf, monthEarned, plural, weekOf } from '../engine'
import type { GameState } from '../engine'
import { useStore } from '../store/store'
import { useNow } from '../store/hooks'
import { Banner, useHint } from './ui'
import { PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { EloBlock } from './Elo'
import { MoneySheet } from './Money'
import { DayRingCard } from '../screens/TodayBlocks'
import type { DayProgress } from '../screens/todayItems'

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

/** «Заработано $X» this month ($ by «Курс $», ₽ without it); tap → «Заработал» sheet */
export function EarnedChip() {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const [open, setOpen] = useState(false)
  const m = monthEarned(data, today)
  return (
    <>
      <button type="button" className="ny-chip earned-chip" onClick={() => setOpen(true)} aria-label={`Заработано за месяц ${m.usd !== undefined ? formatUsd(m.usd) : formatRub(m.rub)}. Записать доход`}>
        <Px name="coin" size={18} />
        Заработано {m.usd !== undefined ? formatUsd(m.usd) : formatRub(m.rub)}
      </button>
      {open && <MoneySheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Today's hero card: avatar + party nick, Эло with the FACEIT badge, the day ring, then the chips */
export function Hud({ game, progress }: { game: GameState; progress: DayProgress }) {
  const profile = useStore((s) => s.data.profile)!
  const outfit = useWornOutfit()
  const warmup = game.today < ARC_START
  const day = Math.max(1, Math.min(ARC_DAYS, arcDayNumber(game.today)))
  const ch = CHAPTERS[chapterOf(game.today)]
  const lvl = eloLevel(game.elo)
  const toArc = diffDays(game.today, ARC_START)
  const [eloHint, dismissElo] = useHint('elo-v23')
  const r = game.days[game.today]
  const gainToday = warmup ? 0 : (r?.eloGain ?? 0)
  const lossToday = warmup ? 0 : (r?.eloLoss ?? 0)
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
      <section className="hero-strip" aria-label="Герой и день">
        <a className="hs-left" href="#/hero" aria-label={`${profile.nick}, Эло ${game.elo}, уровень ${lvl.level}. Открыть персонажа`}>
          <span className="hs-ava">
            <PixelAvatar outfit={outfit} size={78} title={`Аватар ${profile.nick}`} />
          </span>
          <span className="hs-name">{profile.nick}</span>
        </a>
        <a className="hs-right" href="#/hero" aria-hidden tabIndex={-1}>
          <EloBlock elo={game.elo} size={58} gain={gainToday} loss={lossToday} />
        </a>
        <div className="hs-day">
          <DayRingCard progress={progress} bare />
        </div>
      </section>
      <div className="hud-chips">
        <NewYearChip today={game.today} />
        <EarnedChip />
      </div>
      {eloHint && (
        <Banner icon="star" title="Эло — твой жизненный ранг" art={['star', 'shard']} onClose={dismissElo}>
          Тело, дисциплина, ум: за закрытый день до +15. Молчание −10, «Слился» −5. Деньги — это боссы месяца. WF-поинты — валюта магазина наград.
        </Banner>
      )}
    </header>
  )
}
