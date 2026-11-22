/**
 * Pixel avatar: winter gear unlocked by the overall level or bought for ❄ in the shop.
 * A bought item is a purchase with kind 'avatar' and itemId `av:<id>` — so it replays,
 * syncs and undoes like any other purchase.
 */
import { priceFor } from './shop'
import type { ChapterId, Outfit, OutfitSlot, Purchase } from './types'

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
  /** earned by beating the boss of this arc week (14 = «Весенний босс») */
  boss?: number
  /** earned by a money milestone (money.ts MILESTONES id) */
  milestone?: string
  /** «легенда»: shown with a gold frame; a priced legendary keeps its price in every chapter */
  legendary?: boolean
}

export const GEAR: GearItem[] = [
  { id: 'beanie', slot: 'hat', title: 'Бини', level: 1 },
  { id: 'earmuffs', slot: 'hat', title: 'Наушники', level: 4 },
  { id: 'ushanka', slot: 'hat', title: 'Ушанка', level: 12 },
  { id: 'kolpak', slot: 'hat', title: 'Новогодний колпак', price: 40 },
  { id: 'crown', slot: 'hat', title: 'Корона инея', level: 22, fixed: true },
  { id: 'scarf', slot: 'scarf', title: 'Шарф', level: 1 },
  { id: 'longscarf', slot: 'scarf', title: 'Длинный шарф', price: 25 },
  { id: 'puffer', slot: 'coat', title: 'Пуховик', level: 2 },
  { id: 'sweater', slot: 'coat', title: 'Свитер с узором', price: 35 },
  { id: 'mittens', slot: 'mitts', title: 'Варежки', level: 6 },
  { id: 'round', slot: 'glasses', title: 'Круглые очки', level: 8 },
  { id: 'shades', slot: 'glasses', title: 'Тёмные очки', price: 30 },
  { id: 'goggles', slot: 'glasses', title: 'Горнолыжная маска', level: 17 },
  { id: 'breath', slot: 'extra', title: 'Пар изо рта', level: 1, fixed: true },
  { id: 'snowball', slot: 'extra', title: 'Снежок', level: 3, fixed: true },
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
  // v0.16 «Прогрессия»: a special item every 5 levels (titles: levels.ts LEVEL_TITLES)
  { id: 'flakescarf', slot: 'scarf', title: 'Шарф-снежинка', level: 5 },
  { id: 'frostgloves', slot: 'mitts', title: 'Морозные краги', level: 10, fixed: true },
  { id: 'peacoat', slot: 'coat', title: 'Бушлат ледокола', level: 15, fixed: true },
  { id: 'stormvisor', slot: 'glasses', title: 'Визор бурана', level: 20, fixed: true },
  { id: 'wintercloak', slot: 'coat', title: 'Мантия хозяина зимы', level: 25, fixed: true },
  { id: 'legendcrown', slot: 'hat', title: 'Венец легенды', level: 30, fixed: true, legendary: true },
  // boss trophies: one per arc week, the final one is legendary
  { id: 'b_compass', slot: 'extra', title: 'Компас порядка', boss: 1, fixed: true },
  { id: 'b_alarm', slot: 'extra', title: 'Будильник Зомби', boss: 2, fixed: true },
  { id: 'b_sleepmask', slot: 'glasses', title: 'Маска для сна', boss: 3 },
  { id: 'b_ghost', slot: 'extra', title: 'Призрачок', boss: 4, fixed: true },
  { id: 'b_snowman', slot: 'extra', title: 'Снеговичок', boss: 5, fixed: true },
  { id: 'b_horns', slot: 'hat', title: 'Рожки Рилс-демона', boss: 6, fixed: true },
  { id: 'b_candycane', slot: 'extra', title: 'Леденцовая трость', boss: 7, fixed: true },
  { id: 'b_boxing', slot: 'mitts', title: 'Боксёрские перчатки', boss: 8 },
  { id: 'b_slime', slot: 'extra', title: 'Слизень-питомец', boss: 9, fixed: true },
  { id: 'b_hourglass', slot: 'extra', title: 'Песочные часы', boss: 10, fixed: true },
  { id: 'b_foglights', slot: 'glasses', title: 'Противотуманные очки', boss: 11, fixed: true },
  { id: 'b_cape', slot: 'coat', title: 'Плащ дедлайна', boss: 12 },
  { id: 'b_shield', slot: 'extra', title: 'Щит смелости', boss: 13, fixed: true },
  { id: 'b_springcrown', slot: 'hat', title: 'Венок весны', boss: 14, fixed: true, legendary: true },
  // «Путь к $10k»
  { id: 'goldsuit', slot: 'coat', title: 'Золотой костюм', milestone: 'usd10k', fixed: true, legendary: true },
  // legendary ❄ sinks: the price never scales with the chapter
  { id: 'shuba', slot: 'coat', title: 'Царская шуба', price: 180, fixed: true, legendary: true },
  { id: 'aurora', slot: 'extra', title: 'Северное сияние', price: 250, fixed: true, legendary: true },
  { id: 'icesword', slot: 'extra', title: 'Ледяной меч', price: 300, fixed: true, legendary: true },
  { id: 'icewings', slot: 'extra', title: 'Ледяные крылья', price: 400, fixed: true, legendary: true },
  { id: 'queencrown', slot: 'hat', title: 'Корона Снежной королевы', price: 500, fixed: true, legendary: true },
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

/** v0.16: what the replay earned besides levels: boss trophies (weeks) and money milestones */
export interface Earned {
  trophies: number[]
  milestones: { id: string }[]
}

export function ownsGear(item: GearItem, level: number, purchases: Pick<Purchase, 'itemId' | 'kind'>[], earned?: Earned): boolean {
  if (item.level !== undefined && level >= item.level) return true
  if (item.boss !== undefined) return !!earned?.trophies.includes(item.boss)
  if (item.milestone !== undefined) return !!earned?.milestones.some((m) => m.id === item.milestone)
  return item.price !== undefined && purchases.some((p) => p.kind === 'avatar' && p.itemId === gearPurchaseId(item.id))
}

/** ❄ price of a gear item now: regular gear follows the chapter (×1 / ×1,5 / ×2), a legendary one never changes */
export function gearPrice(item: GearItem, chapter: ChapterId): number {
  if (item.price === undefined) return 0
  return item.legendary ? item.price : priceFor(item.price, chapter)
}

/** How a locked item opens, for its tile */
export function gearUnlockLabel(item: GearItem, bossName: (week: number) => string): string {
  if (item.level !== undefined) return `ур ${item.level}`
  if (item.boss !== undefined) return bossName(item.boss)
  if (item.milestone === 'usd10k') return '$10k/мес'
  return ''
}

/** Starter look for a new hero: beanie + scarf */
export const DEFAULT_OUTFIT: Outfit = { hat: 'beanie', scarf: 'scarf', colors: { hat: 'red', scarf: 'gold' }, hair: 'brown', skin: 'light' }

/** What is actually worn: items that are no longer owned (undo, level loss never happens, import) drop off */
export function wornOutfit(outfit: Outfit | undefined, level: number, purchases: Pick<Purchase, 'itemId' | 'kind'>[], earned?: Earned): Outfit {
  const o = { ...DEFAULT_OUTFIT, ...(outfit ?? {}) }
  const out: Outfit = { colors: { ...DEFAULT_OUTFIT.colors, ...(outfit?.colors ?? {}) }, hair: o.hair, skin: o.skin }
  for (const s of OUTFIT_SLOTS) {
    const id = o[s.id]
    const item = gearItem(id)
    if (item && item.slot === s.id && ownsGear(item, level, purchases, earned)) out[s.id] = id
  }
  return out
}
