import { useMemo } from 'react'
import type { Outfit } from '../engine'
import { useSocial } from '../cloud/state'
import { PixelAvatar } from '../pixel/Pixel'
import { safeOutfit } from '../pixel/outfit'
import { useWornOutfit } from '../pixel/useHero'

/** Outfit of any party user: me → the local worn look; a friend → their published outfit (validated) or the default hero */
export function useUserOutfit(userId: string | undefined): Outfit {
  const meId = useSocial((s) => s.account?.id)
  const mine = useWornOutfit()
  const raw = useSocial((s) => {
    if (!userId) return undefined
    for (const list of Object.values(s.members)) {
      const m = list.find((x) => x.id === userId)
      if (m?.stats?.outfit) return m.stats.outfit
    }
    return undefined
  })
  const theirs = useMemo(() => safeOutfit(raw), [raw])
  return userId && userId === meId ? mine : theirs
}

/** Pixel hero in a round frame, sized for lists (feed, nudges, account) */
export function HeroAva({ userId, size = 40, title, className }: { userId: string | undefined; size?: number; title?: string; className?: string }) {
  const outfit = useUserOutfit(userId)
  return (
    <span className={`hero-chip ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden={title ? undefined : true}>
      <PixelAvatar outfit={outfit} size={Math.round(size * 0.86)} title={title} />
    </span>
  )
}
