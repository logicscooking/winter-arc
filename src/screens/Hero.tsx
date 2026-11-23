import { ChevronRight } from 'lucide-react'
import { ARC_START, dayStreak, eloLevel, heroTitles, nextEloTitle } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { Spark } from '../components/Spark'
import { ConquerorCard, SphereList } from '../components/Progress'
import { MoneyBossesCard } from '../components/MoneyBosses'
import { MiniTrends } from './Today'
import { eloValues, window7 } from '../store/trends'
import { PixelAvatar, Px } from '../pixel/Pixel'
import { useWornOutfit } from '../pixel/useHero'
import { EloBlock, EloTable } from '../components/Elo'
import { Help } from '../components/ui'

export function Hero() {
  const profile = useStore((s) => s.data.profile)!
  const game = useGame()
  const outfit = useWornOutfit()
  const lvl = eloLevel(game.elo)
  const data = useStore((s) => s.data)
  const days = window7(data, game.today)
  const elo7 = eloValues(game, days, game.today)
  const warmup = game.today < ARC_START
  const streak = dayStreak(game, game.today)

  const titles = heroTitles(game)
  const levelT = titles[titles.length - 1]
  const special = titles.slice(0, -1)
  const nt = nextEloTitle(game.eloLevel)
  const r = game.days[game.today]
  const week = elo7.filter((v): v is number => v !== null)
  const weekDelta = week.length > 1 ? week[week.length - 1] - week[0] : 0

  return (
    <div className="stack-lg">
      <div className="cols">
        <div className="stack-lg">
          <section className="hero-card" aria-label="Персонаж">
            <div className="hero-name">{profile.nick}</div>
            <a className="hero-ava" href="#/avatar" aria-label="Изменить образ">
              <PixelAvatar outfit={outfit} size={132} title={`Аватар ${profile.nick}`} />
            </a>
            <div className="hero-elo">
              <EloBlock elo={game.elo} size={64} gain={warmup ? 0 : (r?.eloGain ?? 0)} loss={warmup ? 0 : (r?.eloLoss ?? 0)} />
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
              <p className="small" style={{ textAlign: 'center', margin: 0 }}>
                Эло — твой жизненный ранг: тело, дисциплина, ум. За закрытый день до +15. Деньги — это боссы месяца.
              </p>
              <p className="tiny muted" style={{ textAlign: 'center', margin: 0 }}>
                День без исповеди −10, «Слился» −5 (камбэк за час отменяет). Заморозка: ни плюса, ни минуса. Ниже 100 не падает.
                {nt ? ` Титул «${nt.title}» — на ур. ${nt.level}.` : ''}
              </p>
              <EloTable elo={game.elo} />
            </div>
            <a className="btn block" href="#/avatar">
              <Px name="hero" size={22} /> Образ и снаряжение
            </a>
          </section>

          <section className="stack" aria-label="Сферы">
            <div className="section-title">
              <h2>Сферы</h2>
              <Help
                title="Сферы"
                text={[
                  'Четыре сферы жизни — как на «Сегодня». Цифры недели — это квесты сферы с понедельника: сделано (мини тоже) из всех в плане.',
                  'Уровень сферы растёт от очков за её квесты, дела и навыки. На ур. 5, 10 и 15 сфера даёт бонус: WF-поинты, заморозку, скидку или рамку.',
                ]}
              />
            </div>
            <SphereList game={game} />
          </section>

          <MoneyBossesCard history />
        </div>

        <div className="stack-lg">
          <div className="mini-trends">
            <a className="mini-trend" href="#/charts">
              <span className="k">
                Эло <span>7 дней</span>
              </span>
              <span className="v">
                {weekDelta > 0 ? '+' : ''}
                {weekDelta}
                <small>за неделю · ур. {lvl.level}</small>
              </span>
              <Spark values={elo7} kind="line" color="var(--c1)" label="Эло на конец дня за 7 дней" />
            </a>
          </div>
          <MiniTrends />

          <section className="grid-2">
            <a className="panel stack" style={{ gap: 4, color: 'inherit', textDecoration: 'none' }} href="#/deal">
              <span className="small muted">Стрик выполненных дней</span>
              <span className="row" style={{ gap: 6 }}>
                <Px name="flame" size={26} />
                <span className="num" style={{ fontSize: '1.6rem' }}>
                  {streak.run}
                </span>
              </span>
              <span className="tiny muted">рекорд {streak.best}</span>
            </a>
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
              <small>{game.shards} WF-поинтов — дофамин, свои награды и снаряжение</small>
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
