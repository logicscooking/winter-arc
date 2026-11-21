import { ChevronRight } from 'lucide-react'
import { ARC_START, ARC_WEEKS, CHAPTERS, STATS, bossOf, chapterOf, chapterRank, levelOf, rankTitle } from '../engine'
import type { StatId } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { Bar } from '../components/ui'
import { Spark } from '../components/Spark'
import { MiniTrends } from './Today'
import { hpValues, window7, xpValues } from '../store/trends'
import { BossSprite, PixelAvatar, Px, STAT_SPRITE } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'

export function Hero() {
  const profile = useStore((s) => s.data.profile)!
  const game = useGame()
  const outfit = useWornOutfit()
  const lvl = levelOf(game.xp)
  const ch = chapterOf(game.today)
  const rank = chapterRank(game, ch)
  const data = useStore((s) => s.data)
  const days = window7(data, game.today)
  const xp7 = xpValues(game, days, game.today)
  const hp7 = hpValues(game, days, game.today)
  const xpWeek = xp7.reduce<number>((s, v) => s + (v ?? 0), 0)
  const warmup = game.today < ARC_START

  // podium: the three strongest stats; ties keep the canonical order
  const ranked = [...STATS].sort((a, b) => game.xpByStat[b.id] - game.xpByStat[a.id])
  const top = ranked.slice(0, 3)
  const podium: { s: (typeof STATS)[number]; place: 1 | 2 | 3 }[] = [
    { s: top[1], place: 2 },
    { s: top[0], place: 1 },
    { s: top[2], place: 3 },
  ]
  const anyXp = top.some((s) => game.xpByStat[s.id] > 0)

  return (
    <div className="stack-lg">
      <div className="cols">
        <div className="stack-lg">
          <section className="hero-card" aria-label="Персонаж">
            <div className="hero-name">{profile.nick}</div>
            <a className="hero-ava" href="#/avatar" aria-label="Изменить образ">
              <PixelAvatar outfit={outfit} size={132} title={`Аватар ${profile.nick}`} />
            </a>
            <span className={`hp-badge${game.hp <= 30 ? ' low' : ''}`}>
              <Px name="heart" size={18} />
              <span className="num">{game.hp}/100</span>
            </span>
            <div className="hero-lvl">
              <span>Ур. {lvl.level}</span>
              <Px name="shield" size={24} />
              <span className="muted">→ Ур. {lvl.level + 1}</span>
              <Px name="shield" size={24} className="dim" />
            </div>
            <span className="small muted">{rankTitle(rank)}</span>
            <div className="hero-bars">
              <span className="hs-k">
                <Px name="star" size={16} />
                <span className="num">
                  XP: {lvl.into}/{lvl.span}
                </span>
              </span>
              <span className="fat-row">
                <span className="fat-bar xp" role="progressbar" aria-label="Опыт уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lvl.progress * 100)}>
                  <i style={{ width: `${Math.max(4, Math.round(lvl.progress * 100))}%` }} />
                </span>
                <span className="num">{Math.round(lvl.progress * 100)}%</span>
              </span>
              <span className="hs-k">
                <Px name="heart" size={16} />
                <span className="num">HP: {game.hp}/100</span>
              </span>
              <span className="fat-row">
                <span className="fat-bar hp" role="progressbar" aria-label="HP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={game.hp}>
                  <i style={{ width: `${game.hp}%` }} />
                </span>
                <span className="num">{game.hp}%</span>
              </span>
              <p className="tiny muted" style={{ textAlign: 'center', marginTop: 4 }}>
                {game.xp} XP всего · до уровня {lvl.level + 1}: {lvl.toNext} XP. XP не сгорает никогда.
              </p>
            </div>
            <a className="btn block" href="#/avatar">
              <Px name="hero" size={22} /> Образ и снаряжение
            </a>
          </section>

          <section className="podium-wrap" aria-label="Топ статов">
            <h2 style={{ textAlign: 'center' }}>Топ статов</h2>
            {!anyXp && <p className="small muted center" style={{ marginTop: 4 }}>Выполни первый квест — и статы выйдут на пьедестал.</p>}
            <div className="podium">
              {podium.map(({ s, place }) => {
                const xp = game.xpByStat[s.id]
                const l = levelOf(xp)
                return (
                  <div key={s.id} className={`pod p${place}`}>
                    <Px name={STAT_SPRITE[s.id]} size={place === 1 ? 44 : 36} />
                    <span className="pod-name">
                      <span className="pod-medal">{place}</span> {s.name}
                    </span>
                    <div className="pod-block" aria-label={`${s.name}: уровень ${l.level}`}>
                      {l.level}
                    </div>
                    <Bar value={l.progress} label={`${s.name}: опыт уровня`} />
                    <div className="pod-meta">
                      <span>ур {l.level}</span>
                      <span>{xp} XP</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="stack">
            <h2>Все статы</h2>
            <div className="stat-list">
              {STATS.map((s) => (
                <StatRow key={s.id} id={s.id} name={s.name} xp={game.xpByStat[s.id]} />
              ))}
            </div>
          </section>
        </div>

        <div className="stack-lg">
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
              <span className="row" style={{ gap: 6 }}>
                <Px name="owl" size={26} />
                <span className="num" style={{ fontSize: '1.6rem' }}>
                  {game.honestyStreak}
                </span>
              </span>
              <span className="tiny muted">лучшая {game.bestHonesty}</span>
            </div>
            <div className="panel stack" style={{ gap: 4 }}>
              <span className="small muted">Заморозки</span>
              <div className="row" style={{ gap: 4 }}>
                {[0, 1].map((i) => (
                  <Px key={i} name="snowflake" size={28} style={i < game.freezes ? undefined : { opacity: 0.25, filter: 'grayscale(1)' }} />
                ))}
                <span className="sr">{game.freezes} из 2</span>
              </div>
              <span className="tiny muted">идеальных подряд: {game.perfectRun}/7</span>
            </div>
          </section>

          <a className="list-btn" href="#/shop">
            <Px name="shard" size={28} />
            <span className="grow">
              Магазин наград
              <small>{game.shards} ❄ — дофамин, свои награды и снаряжение</small>
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
                  <div key={w} className={`trophy ${b?.won ? 'won' : ''}`} title={`${bossOf(w)}${b?.won ? ' — повержен' : ''}`}>
                    <BossSprite name={bossOf(w)} size={28} />
                    <span className="num">{w}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <a className="list-btn" href="#/party">
            <Px name="campfire" size={28} />
            <span className="grow">
              Пати
              <small>Друзья, дуэли, деньги</small>
            </span>
            <ChevronRight size={18} color="var(--mist)" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}

function StatRow({ id, name, xp }: { id: StatId; name: string; xp: number }) {
  const l = levelOf(xp)
  return (
    <div className="panel tight stat-row">
      <div className="stat-icon">
        <Px name={STAT_SPRITE[id]} size={30} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <span style={{ fontWeight: 800 }}>{name}</span>
          <span className="tiny muted num">
            {l.into}/{l.span}
          </span>
        </div>
        <Bar value={l.progress} label={`${name}: опыт уровня`} />
      </div>
      <span className="num" style={{ fontSize: '1.3rem', minWidth: 30, textAlign: 'right' }}>
        {l.level}
      </span>
    </div>
  )
}
