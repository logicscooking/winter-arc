import { Snowflake, Trophy, Users } from 'lucide-react'
import { ARC_WEEKS, CHAPTERS, STATS, bossOf, chapterOf, chapterRank, levelOf, rankTitle } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { Bar, StatIcon } from '../components/ui'

export function Hero() {
  const profile = useStore((s) => s.data.profile)!
  const game = useGame()
  const lvl = levelOf(game.xp)
  const ch = chapterOf(game.today)
  const rank = chapterRank(game, ch)
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
            {game.chapterPenalty[ch] > 0 && <p className="tiny" style={{ color: 'var(--ember)' }}>Падение отняло {game.chapterPenalty[ch]} XP ранга.</p>}
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
                  <Snowflake key={i} size={26} color={i < game.freezes ? 'var(--ice)' : 'var(--line)'} aria-hidden />
                ))}
                <span className="sr">{game.freezes} из 2</span>
              </div>
              <span className="tiny muted">идеальных подряд: {game.perfectRun}/7</span>
            </div>
          </section>

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

          <section className="panel row" style={{ opacity: 0.75 }}>
            <Users color="var(--mist)" aria-hidden />
            <div className="grow">
              <h3>Пати — в v0.2</h3>
              <p className="small muted">Друзья по инвайту, серии и «пнуть». Дневник и замеры останутся только у тебя.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
