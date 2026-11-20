import type { ChapterId, ShopKind } from './types'

export interface ShopItem {
  id: string
  kind: Exclude<ShopKind, 'custom'>
  title: string
  basePrice: number
  hint: string
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'chocolate', kind: 'chocolate', title: 'Слот шоколада', basePrice: 15, hint: 'Сахар в слоте — без урона' },
  { id: 'cola', kind: 'cola', title: 'Банка колы', basePrice: 12, hint: 'До 14:00, если не хочешь сбить сон' },
  { id: 'reels', kind: 'reels', title: '+15 мин рилсов', basePrice: 10, hint: 'Добавляется к лимиту сегодня' },
]

/** ×1 in Prologue and I, ×1.5 in II, ×2 in III */
export function priceMultiplier(chapter: ChapterId): number {
  if (chapter === 2) return 1.5
  if (chapter === 3) return 2
  return 1
}

export function priceFor(basePrice: number, chapter: ChapterId): number {
  return Math.ceil(basePrice * priceMultiplier(chapter))
}

export function canBuy(shards: number, price: number, fallen: boolean): { ok: boolean; reason?: string } {
  if (fallen) return { ok: false, reason: 'Во время падения магазин закрыт' }
  if (shards < price) return { ok: false, reason: `Не хватает ${price - shards} ❄` }
  return { ok: true }
}
