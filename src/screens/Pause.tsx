import { useEffect, useState } from 'react'
import { SHOP_ITEMS, XP, canBuy, chapterOf, gameDayOf, priceFor, reelsLimitFor } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame, useNow } from '../store/hooks'
import { Breath } from '../flows/Craving'
import { Ring } from '../components/ui'

const NAMES: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }

/** The importable «WA Захожу» shortcut (public/shortcuts): saves the window end it gets as input, then opens
 *  Instagram, so «WA Пауза» run by the automation lets the user in until then instead of looping back here.
 *  The end is computed here, not in the shortcut: «Adjust Date» with a variable amount imported broken. */
export const ENTER_SHORTCUT = 'WA Захожу'
const p2 = (n: number) => String(n).padStart(2, '0')
/** local time as yyyyMMddHHmmss, the number «WA Пауза» compares */
export const stamp = (d: Date) =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
export const enterShortcutUrl = (min: number) =>
  `shortcuts://run-shortcut?name=${encodeURIComponent(ENTER_SHORTCUT)}&input=text&text=${stamp(new Date(Date.now() + min * 60_000))}`

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
  const buyable = canBuy(game.shards, price)
  const name = NAMES[app] ?? app
  // «WA Пауза» passes what it compared: the saved window end (u) and now (n), both yyyyMMddHHmmss
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const dbg = q.has('n') ? `окно до ${q.get('u') || 'нет'} · сейчас ${q.get('n')}` : ''

  const enter = (min: number) => {
    logPause(app, 'entered', min, nowWithOffset())
    setEntered(min)
    setState('entered')
    if (app === 'instagram') window.location.href = enterShortcutUrl(Math.max(1, min))
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
                  Закрыть
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
                      Купить +15 мин за {price} WF
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
            <p className="muted">
              {app === 'instagram'
                ? `${name} откроется сам, пауза не будет мешать ${entered} мин. Минуты подставятся в вечерний чек-ин.`
                : 'Минуты подставятся в вечерний чек-ин. Поставь таймер, если хочешь выйти вовремя.'}
            </p>
            {app === 'instagram' && (
              <p className="tiny muted">
                Не открылся? Поставь быструю команду «{ENTER_SHORTCUT}» (<a href="#/more/pause">как</a>) или{' '}
                <a href={enterShortcutUrl(entered)}>запусти её ещё раз</a>.
              </p>
            )}
            <a className="btn ghost block" href="#/today">
              Вернуться в Winter Arc
            </a>
          </div>
        )}
        {dbg && (
          <p className="tiny muted" style={{ textAlign: 'center', opacity: 0.6 }}>
            {dbg}
          </p>
        )}
      </div>
    </div>
  )
}
