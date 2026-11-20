import { useState } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { CHAPTERS, GEAR, SHOP_ITEMS, canBuy, chapterOf, formatDayShort, gameDayOf, gearPurchaseId, levelOf, ownsGear, priceFor, priceMultiplier, wornOutfit } from '../engine'
import type { Rarity, ShopKind } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { PixelAvatar, Px, REWARD_ICONS, SHOP_SPRITE } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'

type Tab = 'dopamine' | 'custom' | 'avatar'

export function Shop() {
  const data = useStore((s) => s.data)
  const buy = useStore((s) => s.buy)
  const addReward = useStore((s) => s.addReward)
  const removeReward = useStore((s) => s.removeReward)
  const updateReward = useStore((s) => s.updateReward)
  const undoPurchase = useStore((s) => s.undoPurchase)
  const setOutfit = useStore((s) => s.setOutfit)
  const say = useUi((s) => s.say)
  const ask = useUi((s) => s.confirm)
  const game = useGame()
  const today = gameDayOf(useNow())
  const ch = chapterOf(today)
  const mult = priceMultiplier(ch)
  const level = levelOf(game.xp).level
  const [tab, setTab] = useState<Tab>('dopamine')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [icon, setIcon] = useState<SpriteName>('gift')
  const [adding, setAdding] = useState(false)

  const doBuy = (el: Element, item: { itemId: string; title: string; price: number; kind: ShopKind }) => {
    const c = canBuy(game.shards, item.price, game.fallen)
    if (!c.ok) return say(c.reason!)
    const id = buy(item, nowWithOffset())
    reward(el, { shards: -item.price })
    say(
      item.kind === 'reels' ? '+15 минут к лимиту рилсов на сегодня' : item.kind === 'custom' ? `Куплено: ${item.title}. Заслужил.` : item.kind === 'avatar' ? `${item.title} — в гардеробе` : 'Записано как сахар в слоте',
      () => undoPurchase(id),
    )
    return id
  }

  const history = [...data.purchases].sort((a, b) => b.at - a.at).slice(0, 30)
  const worn = wornOutfit(data.profile?.outfit, level, data.purchases)
  const shopGear = GEAR.filter((g) => g.price !== undefined)

  return (
    <div className="stack-lg">
      <p className="small muted page-sub">
        {CHAPTERS[ch].id === 0 ? 'Пролог' : `Глава ${CHAPTERS[ch].roman}`}: цены дофамина ×{String(mult).replace('.', ',')}
      </p>

      <div className="wallet">
        <Px name="shard" size={44} />
        <div>
          <small>Мои осколки</small>
          <span className="num">{game.shards}</span>
        </div>
        <small style={{ textAlign: 'right', maxWidth: 130 }}>За квесты, исповедь, камбэк, босса и Судьбу дня</small>
      </div>

      {game.fallen && (
        <div className="panel row" style={{ borderColor: 'var(--hp)' }}>
          <Lock color="var(--hp)" aria-hidden />
          <p className="small grow">Во время падения награды недоступны. Три идеальных дня — и магазин снова открыт.</p>
        </div>
      )}

      <div className="seg-switch" role="tablist" aria-label="Раздел магазина" style={{ alignSelf: 'flex-start' }}>
        {(
          [
            ['dopamine', 'Дофамин'],
            ['custom', 'Свои награды'],
            ['avatar', 'Аватар'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="cols">
        <section className="stack">
          {tab === 'dopamine' && (
            <>
              <p className="small muted">Разрешённый дофамин: награда за дело, а не фон. Сахар из магазина идёт «в слоте» — без урона.</p>
              <div className="tile-grid">
                {SHOP_ITEMS.map((it) => {
                  const p = priceFor(it.basePrice, ch)
                  const ok = canBuy(game.shards, p, game.fallen).ok
                  return (
                    <button key={it.id} className={`tile ${ok ? '' : 'locked'}`} disabled={game.fallen} onClick={(e) => doBuy(e.currentTarget, { itemId: it.id, title: it.title, price: p, kind: it.kind })} title={it.hint}>
                      <span className="tile-art">
                        <Px name={SHOP_SPRITE[it.id] ?? 'gift'} size={48} />
                      </span>
                      <span>{it.title}</span>
                      <span className="tile-price">
                        <Px name="shard" size={14} />
                        {p}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {tab === 'custom' && (
            <>
              <p className="small muted">Реальная вещь — кино, кроссовки, ужин. Цена в осколках — сколько она для тебя стоит.</p>
              <div className="tile-grid">
                <button className="tile add-tile" onClick={() => setAdding(true)} aria-expanded={adding}>
                  <span className="tile-art">
                    <Plus size={32} />
                  </span>
                  Новая награда
                </button>
                {data.rewards.map((r) => (
                  <div key={r.id} style={{ position: 'relative' }}>
                    <button
                      className={`tile ${canBuy(game.shards, r.price, game.fallen).ok ? '' : 'locked'}`}
                      style={{ width: '100%' }}
                      disabled={game.fallen}
                      onClick={(e) => doBuy(e.currentTarget, { itemId: r.id, title: r.title, price: r.price, kind: 'custom' })}
                    >
                      <span className="tile-art">
                        <Px name={(r.icon as SpriteName) ?? 'gift'} size={48} />
                      </span>
                      <span>{r.title}</span>
                      <span className="tile-price">
                        <Px name="shard" size={14} />
                        {r.price}
                      </span>
                    </button>
                    <button
                      className="icon-btn"
                      style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36 }}
                      aria-label={`Удалить ${r.title}`}
                      onClick={async () => (await ask({ title: 'Удалить награду?', body: `«${r.title}» пропадёт из магазина. История покупок останется.`, ok: 'Удалить', danger: true })) && removeReward(r.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      className={`rarity-btn r-${r.rarity ?? 'none'}`}
                      onClick={() => updateReward(r.id, { rarity: RARITY_NEXT[r.rarity ?? 'none'] })}
                      aria-label={`Сундук: ${RARITY_LABEL[r.rarity ?? 'none']}`}
                    >
                      сундук: {RARITY_LABEL[r.rarity ?? 'none']}
                    </button>
                  </div>
                ))}
              </div>
              {adding && (
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const p = Number(price)
                    if (!title.trim() || !(p > 0)) return
                    addReward(title.trim(), Math.round(p), icon)
                    setTitle('')
                    setPrice('')
                    setAdding(false)
                  }}
                >
                  <div className="row">
                    <input className="input grow" placeholder="Своя награда" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название награды" maxLength={60} autoFocus />
                    <input className="input num" style={{ width: 88 }} placeholder="❄" type="number" inputMode="numeric" min={1} max={9999} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} aria-label="Цена в осколках" />
                  </div>
                  <div className="chips" role="radiogroup" aria-label="Иконка">
                    {REWARD_ICONS.map((n) => (
                      <button key={n} type="button" className="chip" role="radio" aria-checked={icon === n} aria-pressed={icon === n} style={{ padding: '0 8px' }} onClick={() => setIcon(n)} aria-label={n}>
                        <Px name={n} size={26} />
                      </button>
                    ))}
                  </div>
                  <div className="grid-2">
                    <button className="btn ghost" type="button" onClick={() => setAdding(false)}>
                      Отмена
                    </button>
                    <button className="btn primary" type="submit" disabled={!title.trim() || !(Number(price) > 0)}>
                      Добавить
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {tab === 'avatar' && (
            <>
              <p className="small muted">Снаряжение за осколки. Остальное открывается уровнем — смотри в «Образе».</p>
              <div className="tile-grid">
                {shopGear.map((g) => {
                  const owned = ownsGear(g, level, data.purchases)
                  const p = g.price ?? 0
                  return (
                    <button
                      key={g.id}
                      className={`tile ${owned || canBuy(game.shards, p, game.fallen).ok ? '' : 'locked'}`}
                      aria-pressed={worn[g.slot] === g.id}
                      disabled={!owned && game.fallen}
                      onClick={(e) => {
                        if (owned) {
                          setOutfit({ [g.slot]: g.id })
                          return say(`Надето: ${g.title}`)
                        }
                        if (doBuy(e.currentTarget, { itemId: gearPurchaseId(g.id), title: g.title, price: p, kind: 'avatar' })) setOutfit({ [g.slot]: g.id })
                      }}
                    >
                      <span className="tile-art">
                        <PixelAvatar outfit={{ hair: worn.hair, skin: worn.skin, colors: worn.colors, [g.slot]: g.id }} size={58} title={g.title} />
                      </span>
                      <span>{g.title}</span>
                      {owned ? (
                        <span className="tile-price lvl">{worn[g.slot] === g.id ? 'надето' : 'есть'}</span>
                      ) : (
                        <span className="tile-price">
                          <Px name="shard" size={14} />
                          {p}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <a className="btn block" href="#/avatar">
                <Px name="hero" size={22} /> Открыть гардероб
              </a>
            </>
          )}
        </section>

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

const RARITY_LABEL: Record<string, string> = { none: 'нет', common: 'обычная', rare: 'редкая', legendary: 'легенда' }
const RARITY_NEXT: Record<string, Rarity | undefined> = { none: 'common', common: 'rare', rare: 'legendary', legendary: undefined }
