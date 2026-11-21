/**
 * Pixel avatar: winter gear unlocked by the overall level or bought for ❄ in the shop.
 * A bought item is a purchase with kind 'avatar' and itemId `av:<id>` — so it replays,
 * syncs and undoes like any other purchase.
 */
import type { Outfit, OutfitSlot, Purchase } from './types'

export interface GearItem {
  id: string
  slot: OutfitSlot
  title: string
  /** free once the overall level reaches this */
  level?: number
  /** price in ❄ (shop), when not a level reward */
  price?: number
  /** colors can't be changed (e.g. the ice crown) */
  fixed?: boolean
}

export const GEAR: GearItem[] = [
  { id: 'beanie', slot: 'hat', title: 'Бини', level: 1 },
  { id: 'earmuffs', slot: 'hat', title: 'Наушники', level: 3 },
  { id: 'ushanka', slot: 'hat', title: 'Ушанка', level: 5 },
  { id: 'kolpak', slot: 'hat', title: 'Новогодний колпак', price: 40 },
  { id: 'crown', slot: 'hat', title: 'Корона инея', level: 10, fixed: true },
  { id: 'scarf', slot: 'scarf', title: 'Шарф', level: 1 },
  { id: 'longscarf', slot: 'scarf', title: 'Длинный шарф', price: 25 },
  { id: 'puffer', slot: 'coat', title: 'Пуховик', level: 2 },
  { id: 'sweater', slot: 'coat', title: 'Свитер с узором', price: 35 },
  { id: 'mittens', slot: 'mitts', title: 'Варежки', level: 4 },
  { id: 'round', slot: 'glasses', title: 'Круглые очки', level: 6 },
  { id: 'shades', slot: 'glasses', title: 'Тёмные очки', price: 30 },
  { id: 'goggles', slot: 'glasses', title: 'Горнолыжная маска', level: 8 },
  { id: 'breath', slot: 'extra', title: 'Пар изо рта', level: 1, fixed: true },
  { id: 'snowball', slot: 'extra', title: 'Снежок', level: 2, fixed: true },
  { id: 'cocoa', slot: 'extra', title: 'Какао', price: 20 },
  // v8: more free gear, all open from level 1
  { id: 'pompom', slot: 'hat', title: 'Шапка с помпоном', level: 1 },
  { id: 'bear', slot: 'hat', title: 'Шапка-медведь', level: 1 },
  { id: 'hood', slot: 'hat', title: 'Капюшон', level: 1 },
  { id: 'headband', slot: 'hat', title: 'Вязаная повязка', level: 1 },
  { id: 'antlers', slot: 'hat', title: 'Оленьи рожки', level: 1 },
  { id: 'stripescarf', slot: 'scarf', title: 'Полосатый шарф', level: 1 },
  { id: 'snood', slot: 'scarf', title: 'Снуд', level: 1 },
  { id: 'buff', slot: 'scarf', title: 'Бафф', level: 1 },
  { id: 'hoodie', slot: 'coat', title: 'Худи', level: 1 },
  { id: 'vest', slot: 'coat', title: 'Жилетка-пуховка', level: 1 },
  { id: 'skisuit', slot: 'coat', title: 'Лыжный комбинезон', level: 1 },
  { id: 'xmas', slot: 'coat', title: 'Ёлочный свитер', level: 1 },
  { id: 'tulup', slot: 'coat', title: 'Тулуп', level: 1 },
  { id: 'furmitts', slot: 'mitts', title: 'Меховые варежки', level: 1 },
  { id: 'paws', slot: 'mitts', title: 'Варежки-лапки', level: 1 },
  { id: 'warmers', slot: 'mitts', title: 'Митенки', level: 1 },
  { id: 'hearts', slot: 'glasses', title: 'Очки-сердечки', level: 1 },
  { id: 'stars', slot: 'glasses', title: 'Очки-звёздочки', level: 1 },
  { id: 'monocle', slot: 'glasses', title: 'Монокль', level: 1 },
  { id: 'thermos', slot: 'extra', title: 'Термос', level: 1 },
  { id: 'tangerine', slot: 'extra', title: 'Мандарин', level: 1, fixed: true },
  { id: 'snowfall', slot: 'extra', title: 'Снегопад', level: 1, fixed: true },
  { id: 'lantern', slot: 'extra', title: 'Фонарь', level: 1 },
]

export const OUTFIT_SLOTS: { id: OutfitSlot; title: string }[] = [
  { id: 'hat', title: 'Шапки' },
  { id: 'scarf', title: 'Шарфы' },
  { id: 'coat', title: 'Одежда' },
  { id: 'mitts', title: 'Варежки' },
  { id: 'glasses', title: 'Очки' },
  { id: 'extra', title: 'Ещё' },
]

export const gearItem = (id: string | undefined) => GEAR.find((g) => g.id === id)
export const gearPurchaseId = (id: string) => `av:${id}`

export function ownsGear(item: GearItem, level: number, purchases: Pick<Purchase, 'itemId' | 'kind'>[]): boolean {
  if (item.level !== undefined && level >= item.level) return true
  return item.price !== undefined && purchases.some((p) => p.kind === 'avatar' && p.itemId === gearPurchaseId(item.id))
}

/** Starter look for a new hero: beanie + scarf */
export const DEFAULT_OUTFIT: Outfit = { hat: 'beanie', scarf: 'scarf', colors: { hat: 'red', scarf: 'gold' }, hair: 'brown', skin: 'light' }

/** What is actually worn: items that are no longer owned (undo, level loss never happens, import) drop off */
export function wornOutfit(outfit: Outfit | undefined, level: number, purchases: Pick<Purchase, 'itemId' | 'kind'>[]): Outfit {
  const o = { ...DEFAULT_OUTFIT, ...(outfit ?? {}) }
  const out: Outfit = { colors: { ...DEFAULT_OUTFIT.colors, ...(outfit?.colors ?? {}) }, hair: o.hair, skin: o.skin }
  for (const s of OUTFIT_SLOTS) {
    const id = o[s.id]
    const item = gearItem(id)
    if (item && item.slot === s.id && ownsGear(item, level, purchases)) out[s.id] = id
  }
  return out
}
