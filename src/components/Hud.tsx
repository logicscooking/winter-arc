import { X } from 'lucide-react'
import { ARC_DAYS, ARC_START, CHAPTERS, addDays, arcDayNumber, bossOf, chapterOf, diffDays, levelOf, plural, weekOf } from '../engine'
import type { GameState } from '../engine'
import { useStore } from '../store/store'
import { Bar, HpBar, useHint } from './ui'
import { BossSprite, PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'

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

export function Hud({ game }: { game: GameState }) {
  const profile = useStore((s) => s.data.profile)!
  const outfit = useWornOutfit()
  const warmup = game.today < ARC_START
  const day = Math.max(1, Math.min(ARC_DAYS, arcDayNumber(game.today)))
  const ch = CHAPTERS[chapterOf(game.today)]
  const lvl = levelOf(game.xp)
  const toArc = diffDays(game.today, ARC_START)
  const [hpHint, dismissHp] = useHint('hp')
  return (
    <header className="hud">
      <div className="today-head">
        <div>
          <div className="chapter-name">{warmup ? 'Разминка перед аркой' : ch.id === 0 ? `Пролог · неделя ${weekOf(game.today)}` : `Глава ${ch.roman}. ${ch.name}`}</div>
          {warmup ? (
            <div className="day-counter" aria-label={`До старта арки ${toArc} ${plural(toArc, 'день', 'дня', 'дней')}`}>
              {toArc}
              <small>{plural(toArc, 'день', 'дня', 'дней')} до старта</small>
            </div>
          ) : (
            <div className="day-counter" aria-label={`День ${day} из ${ARC_DAYS}`}>
              День {day}
              <small>/{ARC_DAYS}</small>
            </div>
          )}
          <NewYearChip today={game.today} />
        </div>
      </div>
      <a className="profile-card" href="#/hero" aria-label={`${profile.nick}, уровень ${lvl.level}. Открыть персонажа`} style={game.fallen ? { borderColor: 'var(--hp)' } : undefined}>
        <span className="profile-ava">
          <PixelAvatar outfit={outfit} size={64} title={`Аватар ${profile.nick}`} />
        </span>
        <span className="meters">
          <span className="lvl-line">
            <b style={{ fontWeight: 900, fontSize: '1.05rem' }}>{profile.nick}</b>
            <span className="lvl-badge">УР {lvl.level}</span>
          </span>
          <span className="meter">
            <Px name="heart" size={20} />
            <HpBar hp={game.hp} />
            <span className="num hp-v">{game.hp}/100</span>
          </span>
          <span className="meter">
            <Px name="star" size={20} />
            <Bar value={lvl.progress} label="Опыт до следующего уровня" />
            <span className="num">
              {lvl.into}/{lvl.span}
            </span>
          </span>
        </span>
      </a>
      <nav className="quickbar" aria-label="Инструменты дня">
        <a className="quick" href="#/destiny">
          <Px name="dice" size={26} />
          <span>Судьба</span>
        </a>
        <a className="quick" href="#/plan">
          <Px name="dial" size={26} />
          <span>План</span>
        </a>
        <a className="quick" href="#/shop" aria-label={`Магазин, осколков: ${game.shards}`}>
          <Px name="shard" size={24} />
          <span className="num">{game.shards}</span>
          <span className="wide-only">Магазин</span>
        </a>
      </nav>
      {hpHint && (
        <p className="hud-hint">
          <span className="grow">
            <b>HP</b> — твоя жизнь в арке, падает за пропуски{warmup ? ' (в разминке не тратится)' : ''}. <b style={{ color: 'var(--frost)' }}>❄</b> осколки — валюта магазина наград.
          </span>
          <button className="icon-btn" onClick={dismissHp} aria-label="Скрыть подсказку">
            <X size={16} />
          </button>
        </p>
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

export function BossCard({ game }: { game: GameState }) {
  if (game.today < ARC_START) {
    return (
      <section className="panel boss" aria-label="Босс первой недели">
        <div className="boss-head">
          <span className="boss-sprite">
            <BossSprite name={bossOf(1)} size={44} />
          </span>
          <h3 className="grow">Первый босс: {bossOf(1)}</h3>
        </div>
        <p className="small muted">Бой начнётся 23 ноября. Главные квесты и Дело будут снимать ему HP.</p>
      </section>
    )
  }
  const w = weekOf(game.today)
  const b = game.bosses[w]
  if (!b) return null
  const left = Math.max(0, b.hp - b.damage)
  const pct = b.hp ? left / b.hp : 0
  return (
    <section className="panel boss" aria-label="Босс недели">
      <div className="boss-head">
        <span className="boss-sprite">{b.won ? <Px name="trophy" size={40} /> : <BossSprite name={b.name} size={44} />}</span>
        <div>
          <span className="tiny muted">Босс недели {w}</span>
          <h3>{b.name}</h3>
        </div>
        <span className="num small muted">
          {left}/{b.hp}
        </span>
      </div>
      <div className="boss-bar" role="progressbar" aria-label="HP босса" aria-valuemin={0} aria-valuemax={b.hp} aria-valuenow={left}>
        <i className={b.won ? 'won' : ''} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="tiny muted">{b.won ? 'Босс повержен. Добивай неделю ради XP.' : `Урон наносят главные квесты и Дело. Нанесено ${b.damage}.`}</p>
    </section>
  )
}
