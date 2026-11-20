import { useState } from 'react'
import { ArrowLeft, Lock, Plus, Trash2 } from 'lucide-react'
import { CHAPTERS, SHOP_ITEMS, canBuy, chapterOf, formatDayShort, gameDayOf, priceFor, priceMultiplier } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'

export function Shop() {
  const data = useStore((s) => s.data)
  const buy = useStore((s) => s.buy)
  const addReward = useStore((s) => s.addReward)
  const removeReward = useStore((s) => s.removeReward)
  const undoPurchase = useStore((s) => s.undoPurchase)
  const say = useUi((s) => s.say)
  const ask = useUi((s) => s.confirm)
  const game = useGame()
  const today = gameDayOf(useNow())
  const ch = chapterOf(today)
  const mult = priceMultiplier(ch)
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')

  const doBuy = (el: Element, item: { itemId: string; title: string; price: number; kind: 'chocolate' | 'cola' | 'reels' | 'custom' }) => {
    const c = canBuy(game.shards, item.price, game.fallen)
    if (!c.ok) return say(c.reason!)
    const id = buy(item, nowWithOffset())
    reward(el, { shards: -item.price })
    say(item.kind === 'reels' ? '+15 минут к лимиту рилсов на сегодня' : item.kind === 'custom' ? `Куплено: ${item.title}. Заслужил.` : 'Записано как сахар в слоте', () => undoPurchase(id))
  }

  const history = [...data.purchases].sort((a, b) => b.at - a.at).slice(0, 30)

  return (
    <div className="stack-lg">
      <button className="back mobile-only" onClick={() => (window.history.length > 1 ? window.history.back() : (location.hash = '#/hero'))}>
        <ArrowLeft size={18} /> Назад
      </button>
      <header className="row between" style={{ alignItems: 'flex-end', marginTop: -18 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1>Магазин</h1>
          <p className="small muted">
            {CHAPTERS[ch].id === 0 ? 'Пролог' : `Глава ${CHAPTERS[ch].roman}`}: цены ×{String(mult).replace('.', ',')}
          </p>
        </div>
        <div className="num ice-v" style={{ fontSize: '1.6rem' }}>
          {game.shards} ❄
        </div>
      </header>

      {game.fallen && (
        <div className="panel row" style={{ borderColor: 'var(--hp)' }}>
          <Lock color="var(--hp)" aria-hidden />
          <p className="small grow">Во время падения награды недоступны. Три идеальных дня — и магазин снова открыт.</p>
        </div>
      )}

      <div className="cols">
        <div className="stack-lg">
          <section className="stack">
            <h2>Разрешённый дофамин</h2>
            {SHOP_ITEMS.map((it) => {
              const p = priceFor(it.basePrice, ch)
              const ok = canBuy(game.shards, p, game.fallen).ok
              return (
                <div key={it.id} className="panel tight shop-item">
                  <div>
                    <div style={{ fontWeight: 700 }}>{it.title}</div>
                    <div className="tiny muted">{it.hint}</div>
                  </div>
                  <button className={`btn sm ${ok ? 'primary' : 'ghost'}`} disabled={game.fallen} onClick={(e) => doBuy(e.currentTarget, { itemId: it.id, title: it.title, price: p, kind: it.kind })}>
                    {p} ❄
                  </button>
                </div>
              )
            })}
          </section>

          <section className="stack">
            <h2>Свои награды</h2>
            {data.rewards.length === 0 && <div className="empty">Впиши реальную вещь: кино, кроссовки, ужин. Цена в осколках — сколько она для тебя стоит.</div>}
            {data.rewards.map((r) => (
              <div key={r.id} className="panel tight shop-item">
                <div className="row">
                  <span style={{ fontWeight: 700 }}>{r.title}</span>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="icon-btn" aria-label={`Удалить ${r.title}`} onClick={async () => (await ask({ title: 'Удалить награду?', body: `«${r.title}» пропадёт из магазина. История покупок останется.`, ok: 'Удалить', danger: true })) && removeReward(r.id)}>
                    <Trash2 size={16} />
                  </button>
                  <button className={`btn sm ${canBuy(game.shards, r.price, game.fallen).ok ? 'primary' : 'ghost'}`} disabled={game.fallen} onClick={(e) => doBuy(e.currentTarget, { itemId: r.id, title: r.title, price: r.price, kind: 'custom' })}>
                    {r.price} ❄
                  </button>
                </div>
              </div>
            ))}
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                const p = Number(price)
                if (!title.trim() || !(p > 0)) return
                addReward(title.trim(), Math.round(p))
                setTitle('')
                setPrice('')
              }}
            >
              <input className="input grow" placeholder="Своя награда" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название награды" maxLength={60} />
              <input className="input num" style={{ width: 88 }} placeholder="❄" type="number" inputMode="numeric" min={1} max={9999} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} aria-label="Цена в осколках" />
              <button className="btn sm primary" type="submit" aria-label="Добавить награду" disabled={!title.trim() || !(Number(price) > 0)} style={{ minWidth: 48 }}>
                <Plus size={18} />
              </button>
            </form>
          </section>
        </div>

        <section className="stack">
          <h2>История покупок</h2>
          {history.length === 0 ? (
            <div className="empty">Покупок пока нет. Осколки дают за квесты, исповедь, камбэк и победу над боссом.</div>
          ) : (
            <div className="panel kv small">
              {history.map((p) => (
                <div key={p.id} style={{ display: 'contents' }}>
                  <span>
                    <span className="muted num">{formatDayShort(p.day)}</span> {p.title}
                  </span>
                  <span className="num ice-v" style={{ textAlign: 'right' }}>
                    −{p.price}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
