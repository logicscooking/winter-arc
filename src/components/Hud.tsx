import { Snowflake, Swords, Trophy } from 'lucide-react'
import { ARC_DAYS, ARC_START, CHAPTERS, addDays, arcDayNumber, chapterOf, diffDays, levelOf, weekOf } from '../engine'
import type { GameState } from '../engine'
import { useStore } from '../store/store'
import { Bar, HpBar } from './ui'

export function Hud({ game }: { game: GameState }) {
  const profile = useStore((s) => s.data.profile)!
  const day = Math.max(1, Math.min(ARC_DAYS, arcDayNumber(game.today)))
  const ch = CHAPTERS[chapterOf(game.today)]
  const lvl = levelOf(game.xp)
  return (
    <header className="hud">
      <div className="hud-top">
        <div>
          <div className="chapter-name">
            {ch.id === 0 ? 'Пролог' : `Глава ${ch.roman}. ${ch.name}`}
          </div>
          <div className="day-counter" aria-label={`День ${day} из ${ARC_DAYS}`}>
            День {day}
            <small>/{ARC_DAYS}</small>
          </div>
        </div>
        <a href="#/hero" className="avatar" aria-label="Персонаж">
          {profile.avatar}
        </a>
      </div>
      <div className="hud-stats">
        <div className="hud-cell" style={game.fallen ? { borderColor: 'var(--ember-dim)' } : undefined}>
          <div className="k">
            <span>HP</span>
            <span className="num hp-v" style={{ marginLeft: 'auto', fontSize: '0.95rem' }}>
              {game.hp}
            </span>
          </div>
          <HpBar hp={game.hp} />
        </div>
        <div className="hud-cell">
          <div className="k">
            <Snowflake size={13} aria-hidden /> Осколки
          </div>
          <div className="v ice-v">{game.shards}</div>
        </div>
        <div className="hud-cell">
          <div className="k">Уровень</div>
          <div className="v xp-v">{lvl.level}</div>
          <Bar value={lvl.progress} label="Опыт до следующего уровня" />
        </div>
      </div>
      <ArcStrip game={game} />
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
  const w = weekOf(game.today)
  const b = game.bosses[w]
  if (!b) return null
  const left = Math.max(0, b.hp - b.damage)
  const pct = b.hp ? left / b.hp : 0
  return (
    <section className="panel boss" aria-label="Босс недели">
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          {b.won ? <Trophy size={18} color="var(--amber)" aria-hidden /> : <Swords size={18} color="var(--ice)" aria-hidden />}
          <h3>
            Неделя {w}: {b.name}
          </h3>
        </div>
        <span className="num small muted">
          {left} / {b.hp}
        </span>
      </div>
      <div className={`boss-bar ${b.won ? 'won' : ''}`} role="progressbar" aria-label="HP босса" aria-valuemin={0} aria-valuemax={b.hp} aria-valuenow={left}>
        <i style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="tiny muted">{b.won ? 'Босс повержен. Добивай неделю ради XP.' : `Урон наносят main-квесты и Дело. Нанесено ${b.damage}.`}</p>
    </section>
  )
}
