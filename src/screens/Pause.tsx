import { useEffect, useState } from 'react'
import { SHOP_ITEMS, XP, canBuy, chapterOf, gameDayOf, priceFor, reelsLimitFor } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame, useNow } from '../store/hooks'
import { Breath } from '../flows/Craving'
import { Ring } from '../components/ui'

const NAMES: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }

export function Pause({ app }: { app: string }) {
  const data = useStore((s) => s.data)
  const logPause = useStore((s) => s.logPause)
  const buy = useStore((s) => s.buy)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const [start] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [state, setState] = useState<'breath' | 'choose' | 'resisted' | 'entered'>('breath')
  const [entered, setEntered] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - start), 200)
    return () => clearInterval(t)
  }, [start])

  const limit = reelsLimitFor(data, today)
  const used = data.pauses.filter((p) => p.day === today && p.result === 'entered').reduce((s, p) => s + (p.minutes ?? 0), 0)
  const left = Math.max(0, limit - used)
  const ready = elapsed >= 10_000
  const item = SHOP_ITEMS.find((i) => i.kind === 'reels')!
  const price = priceFor(item.basePrice, chapterOf(today))
  const buyable = canBuy(game.shards, price, game.fallen)
  const name = NAMES[app] ?? app

  const enter = (min: number) => {
    logPause(app, 'entered', min, nowWithOffset())
    setEntered(min)
    setState('entered')
  }

  return (
    <div className="fullscreen">
      <div className="fullscreen-inner" style={{ justifyContent: 'center', textAlign: 'center' }}>
        {state === 'breath' || state === 'choose' ? (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <span className="chapter-name">Ты открываешь {name}</span>
              <div className="big-title">
                Осталось {left} мин
              </div>
              <p className="muted">из лимита {limit} на сегодня</p>
            </div>
            <Ring progress={Math.min(1, elapsed / 10_000)} size={240}>
              <Breath start={start} />
            </Ring>
            <p className="small muted">{ready ? 'Теперь реши.' : `Вдохни. ${Math.ceil((10_000 - elapsed) / 1000)} сек.`}</p>
            {state === 'breath' && (
              <div className="stack">
                <button
                  className="btn primary block"
                  disabled={!ready}
                  onClick={(e) => {
                    logPause(app, 'resisted', undefined, nowWithOffset())
                    reward(e.currentTarget, { xp: XP.pause })
                    setState('resisted')
                  }}
                >
                  Закрыть, +5 XP Воли
                </button>
                <button className="btn ghost block" disabled={!ready} onClick={() => setState('choose')}>
                  Захожу
                </button>
              </div>
            )}
            {state === 'choose' && (
              <div className="stack">
                {left > 0 ? (
                  <>
                    <p className="small">На сколько?</p>
                    <div className="chips" style={{ justifyContent: 'center' }}>
                      {[5, 10, 15].filter((m) => m <= Math.max(5, left)).map((m) => (
                        <button key={m} className="chip" onClick={() => enter(Math.min(m, left))}>
                          {m} мин
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p>Лимит на сегодня исчерпан.</p>
                    <button
                      className="btn amber block"
                      disabled={!buyable.ok}
                      onClick={(e) => {
                        buy({ itemId: item.id, title: item.title, price, kind: 'reels' }, nowWithOffset())
                        reward(e.currentTarget, { shards: -price })
                      }}
                    >
                      Купить +15 мин за {price} ❄
                    </button>
                    {!buyable.ok && <p className="tiny muted">{buyable.reason}</p>}
                    <button className="btn ghost block" onClick={() => enter(15)}>
                      Всё равно зайти (запишется сверх лимита)
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : state === 'resisted' ? (
          <div className="stack-lg">
            <div className="big-title">Устоял</div>
            <p className="muted">Записано. Можно закрыть приложение или заняться делом.</p>
            <a className="btn primary block" href="#/today">
              К квестам
            </a>
          </div>
        ) : (
          <div className="stack-lg">
            <div className="big-title">{entered} минут</div>
            <p className="muted">Минуты подставятся в вечернюю исповедь. Поставь таймер, если хочешь выйти вовремя.</p>
            <a className="btn ghost block" href="#/today">
              Вернуться в Winter Arc
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
