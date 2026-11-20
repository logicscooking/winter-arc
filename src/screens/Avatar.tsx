import { useState } from 'react'

import { GEAR, OUTFIT_SLOTS, canBuy, gearPurchaseId, levelOf, ownsGear, wornOutfit } from '../engine'
import type { GearItem, Outfit, OutfitSlot } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame } from '../store/hooks'
import { useUi } from '../store/ui'
import { PixelAvatar, Px } from '../pixel/Pixel'
import { HAIR, SKIN, SWATCHES } from '../pixel/palette'

type Tab = OutfitSlot | 'look'

/** Avatar customizer: tabs per gear slot, color swatches, a tile grid of items with unlocks */
export function AvatarScreen() {
  const data = useStore((s) => s.data)
  const setOutfit = useStore((s) => s.setOutfit)
  const buy = useStore((s) => s.buy)
  const undoPurchase = useStore((s) => s.undoPurchase)
  const say = useUi((s) => s.say)
  const game = useGame()
  const level = levelOf(game.xp).level
  const [tab, setTab] = useState<Tab>('hat')
  const worn = wornOutfit(data.profile?.outfit, level, data.purchases)

  const wear = (slot: OutfitSlot, id: string) => setOutfit({ [slot]: id } as Partial<Outfit>)

  const onTile = (el: Element, item: GearItem) => {
    if (ownsGear(item, level, data.purchases)) {
      wear(item.slot, worn[item.slot] === item.id ? '' : item.id)
      return
    }
    if (item.level !== undefined) return say(`Откроется на уровне ${item.level}. Сейчас ${level}.`)
    const price = item.price ?? 0
    const c = canBuy(game.shards, price, game.fallen)
    if (!c.ok) return say(c.reason!)
    const id = buy({ itemId: gearPurchaseId(item.id), title: item.title, price, kind: 'avatar' }, nowWithOffset())
    reward(el, { shards: -price })
    wear(item.slot, item.id)
    say(`Куплено и надето: ${item.title}`, () => undoPurchase(id))
  }

  const slotItems = tab === 'look' ? [] : GEAR.filter((g) => g.slot === tab)
  const selected = tab === 'look' ? undefined : GEAR.find((g) => g.id === worn[tab])
  const colorable = selected && !selected.fixed

  return (
    <div className="stack-lg">

      <div className="cols">
        <section className="panel dress-stage" aria-label="Предпросмотр">
          <PixelAvatar outfit={worn} size={220} title="Твой герой" />
          <p className="small muted center" style={{ marginTop: 8 }}>
            Уровень {level}. Новые вещи открываются уровнем или за ❄ в магазине.
          </p>
        </section>

        <section className="stack">
          <div className="tabs-scroll" role="tablist" aria-label="Раздел гардероба">
            {[...OUTFIT_SLOTS, { id: 'look' as const, title: 'Облик' }].map((t) => (
              <button key={t.id} className="chip" role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.title}
              </button>
            ))}
          </div>

          {tab === 'look' ? (
            <div className="stack">
              <h3>Волосы</h3>
              <div className="swatches" role="radiogroup" aria-label="Цвет волос">
                {Object.entries(HAIR).map(([id, h]) => (
                  <button key={id} className="swatch" role="radio" aria-checked={worn.hair === id} aria-pressed={worn.hair === id} aria-label={h.name} title={h.name} style={{ background: h.H }} onClick={() => setOutfit({ hair: id })} />
                ))}
              </div>
              <h3>Кожа</h3>
              <div className="swatches" role="radiogroup" aria-label="Цвет кожи">
                {Object.entries(SKIN).map(([id, k]) => (
                  <button key={id} className="swatch" role="radio" aria-checked={worn.skin === id} aria-pressed={worn.skin === id} aria-label={k.name} title={k.name} style={{ background: k.s }} onClick={() => setOutfit({ skin: id })} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="swatches" role="radiogroup" aria-label="Цвет вещи" style={colorable ? undefined : { opacity: 0.4, pointerEvents: 'none' }}>
                {Object.entries(SWATCHES).map(([id, sw]) => {
                  const on = (worn.colors?.[tab] ?? 'red') === id
                  return (
                    <button
                      key={id}
                      className="swatch"
                      role="radio"
                      aria-checked={on}
                      aria-pressed={on}
                      aria-label={sw.name}
                      title={sw.name}
                      style={{ background: `linear-gradient(135deg, ${sw.Z} 0 30%, ${sw.X} 30% 70%, ${sw.Y} 70%)` }}
                      onClick={() => setOutfit({ colors: { [tab]: id } })}
                    />
                  )
                })}
              </div>
              {!colorable && <p className="tiny muted">{selected ? 'У этой вещи свой цвет.' : 'Надень вещь, чтобы выбрать цвет.'}</p>}
              <div className="tile-grid">
                <button className="tile none-tile" aria-pressed={!worn[tab]} onClick={() => wear(tab, '')}>
                  <span className="tile-art">∅</span>
                  Без
                </button>
                {slotItems.map((item) => {
                  const owned = ownsGear(item, level, data.purchases)
                  const preview: Outfit = { hair: worn.hair, skin: worn.skin, colors: worn.colors, [item.slot]: item.id }
                  return (
                    <button key={item.id} className={`tile ${owned ? '' : 'locked'}`} aria-pressed={worn[tab] === item.id} onClick={(e) => onTile(e.currentTarget, item)}>
                      {!owned && <Px name="lock" size={18} className="tile-lock" />}
                      <span className="tile-art">
                        <PixelAvatar outfit={preview} size={58} title={item.title} />
                      </span>
                      <span>{item.title}</span>
                      {!owned &&
                        (item.level !== undefined ? (
                          <span className="tile-price lvl">ур {item.level}</span>
                        ) : (
                          <span className="tile-price">
                            <Px name="shard" size={14} />
                            {item.price}
                          </span>
                        ))}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
