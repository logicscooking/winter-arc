import { ChevronRight } from 'lucide-react'
import { ARC_START, CHAPTERS, chapterOf, chapterRank, eloLevel, heroTitles, nextEloTitle, rankTitle } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { Spark } from '../components/Spark'
import { ConquerorCard, SphereList } from '../components/Progress'
import { MoneyBossesCard } from '../components/MoneyBosses'
import { MiniTrends } from './Today'
import { hpValues, window7, xpValues } from '../store/trends'
import { PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { EloBlock } from '../components/Elo'

export function Hero() {
  const profile = useStore((s) => s.data.profile)!
  const game = useGame()
  const outfit = useWornOutfit()
  const lvl = eloLevel(game.elo)
  const ch = chapterOf(game.today)
  const rank = chapterRank(game, ch)
  const data = useStore((s) => s.data)
  const days = window7(data, game.today)
  const xp7 = xpValues(game, days, game.today)
  const hp7 = hpValues(game, days, game.today)
  const xpWeek = xp7.reduce<number>((s, v) => s + (v ?? 0), 0)
  const warmup = game.today < ARC_START

  const titles = heroTitles(game)
  const levelT = titles[titles.length - 1]
  const special = titles.slice(0, -1)
  const nt = nextEloTitle(lvl.level)
  const anyXp = game.xp > 0

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
            <div className="hero-elo">
              <EloBlock elo={game.elo} size={64} gain={warmup ? 0 : game.days[game.today]?.eloGain ?? 0} />
            </div>
            <div className="hero-titles">
              {special.map((t) => (
                <span key={t} className="hero-title special">
                  <Px name="trophy" size={16} /> {t}
                </span>
              ))}
              <span className="hero-title">
                <Px name="star" size={16} /> {levelT}
              </span>
            </div>
            <div className="hero-bars">
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
                {lvl.max
                  ? 'Уровень 10 — вершина лестницы FACEIT. Эло не сгорает.'
                  : `Каждый закрытый день: 0–15 Эло за квесты без «Денег»${nt ? ` · титул «${nt.title}» на Ур. ${nt.level}` : ''}. Каждый уровень — ❄. XP: ${game.xp}.`}
              </p>
            </div>
            <a className="btn block" href="#/avatar">
              <Px name="hero" size={22} /> Образ и снаряжение
            </a>
          </section>

          <section className="stack" aria-label="Сферы">
            <div className="section-title">
              <h2>Сферы</h2>
              <span className="tiny muted">бонусы на 5 · 10 · 15</span>
            </div>
            {!anyXp && <p className="small muted">Выполни первый квест — и сферы начнут расти.</p>}
            <SphereList game={game} />
          </section>

          <MoneyBossesCard history />
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
                {Array.from({ length: game.freezeMax }, (_, i) => (
                  <Px key={i} name="snowflake" size={28} style={i < game.freezes ? undefined : { opacity: 0.25, filter: 'grayscale(1)' }} />
                ))}
                <span className="sr">
                  {game.freezes} из {game.freezeMax}
                </span>
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

          <ConquerorCard game={game} />

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
