import { ChevronRight, ShoppingBag, Snowflake, Trophy, Users } from 'lucide-react'
import { ARC_START, ARC_WEEKS, CHAPTERS, STATS, bossOf, chapterOf, chapterRank, levelOf, rankTitle } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { Bar, StatIcon } from '../components/ui'
import { Spark } from '../components/Spark'
import { MiniTrends } from './Today'
import { hpValues, window7, xpValues } from '../store/trends'

export function Hero() {
  const profile = useStore((s) => s.data.profile)!
  const game = useGame()
  const lvl = levelOf(game.xp)
  const ch = chapterOf(game.today)
  const rank = chapterRank(game, ch)
  const data = useStore((s) => s.data)
  const days = window7(data, game.today)
  const xp7 = xpValues(game, days, game.today)
  const hp7 = hpValues(game, days, game.today)
  const xpWeek = xp7.reduce<number>((s, v) => s + (v ?? 0), 0)
  const warmup = game.today < ARC_START
  return (
    <div className="stack-lg">
      <header className="row" style={{ gap: 14 }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: '2.1rem', borderRadius: 20 }}>
          {profile.avatar}
        </div>
        <div className="grow">
          <h1>{profile.nick}</h1>
          <p className="muted small">
            Уровень {lvl.level}, {game.xp} XP всего
          </p>
        </div>
      </header>

      <div className="cols">
        <div className="stack-lg">
          <section className="panel stack">
            <div className="row between">
              <h2>Общий уровень</h2>
              <span className="num xp-v" style={{ fontSize: '1.6rem' }}>
                {lvl.level}
              </span>
            </div>
            <Bar value={lvl.progress} label="Опыт уровня" />
            <p className="tiny muted">
              До уровня {lvl.level + 1}: {lvl.toNext} XP. XP не сгорает никогда.
            </p>
          </section>

          <div className="mini-trends">
            <a className="mini-trend" href="#/charts">
              <span className="k">
                XP <span>7 дней</span>
              </span>
              <span className="v xp-v">
                +{xpWeek}
                <small>за неделю</small>
              </span>
              <Spark values={xp7} kind="bar" min={0} color="var(--c-xp)" label="XP по дням за 7 дней" />
            </a>
            <a className="mini-trend" href="#/charts">
              <span className="k">
                HP <span>7 дней</span>
              </span>
              <span className="v hp-v">
                {game.hp}
                <small>{warmup ? 'до старта' : 'сейчас'}</small>
              </span>
              <Spark values={hp7} kind="line" min={0} max={100} color="var(--c-hp)" label="HP на конец дня за 7 дней" />
            </a>
          </div>
          <MiniTrends />

          <section className="stack">
            <h2>Статы</h2>
            {STATS.map((s) => {
              const xp = game.xpByStat[s.id]
              const l = levelOf(xp)
              return (
                <div key={s.id} className="panel tight stat-row">
                  <div className="stat-icon">
                    <StatIcon stat={s.id} size={20} />
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row between">
                      <span style={{ fontWeight: 700 }}>{s.name}</span>
                      <span className="tiny muted num">{xp} XP</span>
                    </div>
                    <Bar value={l.progress} label={`${s.name}: опыт уровня`} />
                  </div>
                  <span className="num" style={{ fontSize: '1.2rem', minWidth: 28, textAlign: 'right' }}>
                    {l.level}
                  </span>
                </div>
              )
            })}
          </section>
        </div>

        <div className="stack-lg">
          <section className="panel stack">
            <span className="small muted">{ch === 0 ? 'Ранг пролога' : `Ранг главы ${CHAPTERS[ch].roman}`}</span>
            <div className="row between">
              <h2>{rankTitle(rank)}</h2>
              <span className="num xp-v">{rank} XP</span>
            </div>
            {game.chapterPenalty[ch] > 0 && <p className="tiny" style={{ color: 'var(--hp)' }}>Падение отняло {game.chapterPenalty[ch]} XP ранга.</p>}
          </section>

          <section className="grid-2">
            <div className="panel stack" style={{ gap: 4 }}>
              <span className="small muted">Серия честности</span>
              <span className="num" style={{ fontSize: '1.6rem' }}>
                {game.honestyStreak}
              </span>
              <span className="tiny muted">лучшая {game.bestHonesty}</span>
            </div>
            <div className="panel stack" style={{ gap: 4 }}>
              <span className="small muted">Заморозки</span>
              <div className="row" style={{ gap: 4 }}>
                {[0, 1].map((i) => (
                  <Snowflake key={i} size={26} color={i < game.freezes ? 'var(--frost)' : 'var(--line)'} aria-hidden />
                ))}
                <span className="sr">{game.freezes} из 2</span>
              </div>
              <span className="tiny muted">идеальных подряд: {game.perfectRun}/7</span>
            </div>
          </section>

          <a className="list-btn" href="#/shop">
            <ShoppingBag aria-hidden />
            <span className="grow">
              Магазин наград
              <small>{game.shards} ❄ — шоколад, кола, рилсы и свои награды</small>
            </span>
            <ChevronRight size={18} color="var(--mist)" aria-hidden />
          </a>

          <section className="stack">
            <div className="section-title">
              <h2>Трофеи боссов</h2>
              <span className="num small muted">
                {game.trophies.length}/{ARC_WEEKS}
              </span>
            </div>
            <div className="trophies">
              {Array.from({ length: ARC_WEEKS }, (_, i) => i + 1).map((w) => {
                const b = game.bosses[w]
                return (
                  <div key={w} className={`trophy ${b?.won ? 'won' : ''}`} title={bossOf(w)}>
                    <Trophy size={18} aria-hidden style={{ opacity: b?.won ? 1 : 0.3 }} />
                    <span className="num">{w}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <a className="list-btn" href="#/party">
            <Users aria-hidden />
            <span className="grow">
              Пати
              <small>Друзья, лента, «пнуть». Дневник и замеры остаются только у тебя</small>
            </span>
            <ChevronRight size={18} color="var(--mist)" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}
