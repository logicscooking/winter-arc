import { DEFAULT_OUTFIT, OUTFIT_SLOTS, gearItem } from '../engine'
import type { Outfit, OutfitSlot } from '../engine'
import { AV_LAYERS } from './avatar-layers'
import { HAIR, SKIN, SWATCHES } from './palette'

const own = (o: object, k: unknown): k is string => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k)

/**
 * A friend's outfit from their public stats: someone else's data, possibly from an older or newer app.
 * Unknown gear/colors/hair/skin fall back to the default look, so rendering never breaks.
 * Missing outfit (old app version) → the default hero.
 */
export function safeOutfit(raw: unknown): Outfit {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_OUTFIT, colors: { ...DEFAULT_OUTFIT.colors } }
  const src = raw as Record<string, unknown>
  const rawColors = src.colors && typeof src.colors === 'object' && !Array.isArray(src.colors) ? (src.colors as Record<string, unknown>) : {}
  const out: Outfit = {
    hair: own(HAIR, src.hair) ? src.hair : DEFAULT_OUTFIT.hair,
    skin: own(SKIN, src.skin) ? src.skin : DEFAULT_OUTFIT.skin,
    colors: {},
  }
  for (const { id: slot } of OUTFIT_SLOTS) {
    if (!(slot in src) || src[slot] === undefined || src[slot] === null || src[slot] === '') continue // slot left empty on purpose
    const id = src[slot]
    const item = typeof id === 'string' ? gearItem(id) : undefined
    const ok = item && item.slot === slot && own(AV_LAYERS, id)
    const worn = ok ? (id as string) : DEFAULT_OUTFIT[slot]
    if (!worn) continue
    out[slot] = worn
    const c = rawColors[slot]
    out.colors![slot as OutfitSlot] = own(SWATCHES, c) ? c : (DEFAULT_OUTFIT.colors?.[slot] ?? 'red')
  }
  return out
}
