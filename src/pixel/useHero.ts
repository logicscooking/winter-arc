import { levelOf, wornOutfit } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'

/** The outfit the hero actually wears (only owned gear) */
export function useWornOutfit() {
  const outfit = useStore((s) => s.data.profile?.outfit)
  const purchases = useStore((s) => s.data.purchases)
  const game = useGame()
  return wornOutfit(outfit, levelOf(game.xp).level, purchases)
}
