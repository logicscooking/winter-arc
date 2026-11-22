import { memo, type CSSProperties } from 'react'
import { gearItem, type Outfit, type QuestKind, type StatId } from '../engine'
import { SPRITES, type SpriteName } from './sprites'
import { HAIR, PAL, SKIN, SWATCHES } from './palette'
import { AV_BASE, AV_LAYERS, LAYER_ORDER } from './avatar-layers'
import { gridPaths } from './render'

interface PxProps {
  name: SpriteName
  size?: number
  /** recolor palette keys, e.g. { w: '#c9a8ff' } */
  swap?: Record<string, string>
  className?: string
  title?: string
  style?: CSSProperties
}

/** A crisp 16×16 pixel sprite as inline SVG */
export const Px = memo(function Px({ name, size = 24, swap, className, title, style }: PxProps) {
  const p = gridPaths([SPRITES[name] ?? SPRITES.star], `s:${name}`)
  return (
    <svg
      className={`px ${className ?? ''}`}
      viewBox={`0 0 ${p.w} ${p.h}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={style}
    >
      {p.runs.map(([c, d]) => (
        <path key={c} d={d} fill={swap?.[c] ?? PAL[c]} />
      ))}
    </svg>
  )
})

// ---------- semantic icon maps ----------

export const STAT_SPRITE: Record<StatId, SpriteName> = {
  energy: 'bolt',
  body: 'dumbbell',
  mind: 'brain',
  will: 'shield',
  deal: 'hammer',
}

const QUEST_SPRITE: Record<string, SpriteName> = {
  wake: 'clock',
  light: 'sun',
  phone: 'phone',
  reading: 'book',
  deal: 'hammer',
  workout: 'dumbbell',
  reels: 'shield',
  skill: 'brain',
  caffeine: 'coffee',
  bedtime: 'moon',
  steps: 'boot',
  water: 'water',
  meditation: 'snowflake',
  journal: 'pen',
  twitter: 'speech',
  leads: 'note',
}

const KIND_SPRITE: Partial<Record<QuestKind, SpriteName>> = { reading: 'book', wake: 'clock', bedtime: 'moon', caffeine: 'coffee', deal: 'hammer', reels: 'shield', journal: 'pen' }

export function questSprite(q: { id: string; kind?: QuestKind; stat: StatId }): SpriteName {
  return QUEST_SPRITE[q.id] ?? (q.kind && KIND_SPRITE[q.kind]) ?? STAT_SPRITE[q.stat]
}

/** Icons the player can pick for own rewards */
export const REWARD_ICONS: SpriteName[] = ['gift', 'star', 'trophy', 'fir', 'campfire', 'snowman', 'book', 'coffee', 'choco', 'phone']

export const SHOP_SPRITE: Record<string, SpriteName> = { chocolate: 'choco', cola: 'cola', reels: 'phone' }

/** Boss sprite per week name; reuses a few base monsters with recolors */
const BOSS_LOOK: Record<string, { name: SpriteName; swap?: Record<string, string> }> = {
  Хаос: { name: 'slime', swap: { r: '#b48cff', R: '#6f49c2', m: '#e2d0ff' } },
  Зомби: { name: 'zombie' },
  'Ночной скролл': { name: 'ghost', swap: { w: '#9cc8ff', W: '#5a8fd6' } },
  'Кофеиновый призрак': { name: 'ghost', swap: { w: '#e2c39a', W: '#a0713f' } },
  'Снежный ком': { name: 'snowmonster' },
  'Рилс-демон': { name: 'demon' },
  'Сахарный голем': { name: 'golem' },
  'Диванный тролль': { name: 'troll' },
  'Кола-слизень': { name: 'slime' },
  Потом: { name: 'blob' },
  Туман: { name: 'ghost', swap: { w: '#c9d2d8', W: '#8b98a2' } },
  Прокрастинатор: { name: 'blob', swap: { e: '#8fd0a0', E: '#4f9a66' } },
  'Страх начать': { name: 'demon', swap: { p: '#59626c', P: '#30363d', y: '#ff5a6a' } },
  'Весенний босс': { name: 'yeti' },
}

export function BossSprite({ name, size = 48, className }: { name: string; size?: number; className?: string }) {
  const look = BOSS_LOOK[name] ?? { name: 'slime' as SpriteName }
  return <Px name={look.name} swap={look.swap} size={size} className={className} />
}


// ---------- avatar ----------

interface AvatarProps {
  outfit: Outfit
  size?: number
  className?: string
  title?: string
}

/** The pixel hero with the worn gear. `outfit` must already be filtered by ownership. */
export const PixelAvatar = memo(function PixelAvatar({ outfit, size = 96, className, title }: AvatarProps) {
  const grids = [AV_BASE]
  const keys: string[] = ['base']
  const colorOf: Record<string, { X: string; Y: string; Z: string }> = {}
  for (const slot of LAYER_ORDER) {
    const id = outfit[slot]
    if (!id || !AV_LAYERS[id]) continue
    grids.push(AV_LAYERS[id])
    keys.push(id)
    colorOf[id] = SWATCHES[outfit.colors?.[slot] ?? ''] ?? SWATCHES.red
  }
  const p = gridPaths(grids, keys.join('+'))
  const hair = HAIR[outfit.hair ?? ''] ?? HAIR.brown
  const skin = SKIN[outfit.skin ?? ''] ?? SKIN.light
  // X/Y/Z of every layer share one swatch per layer: paint layers separately for their own colors
  const layered = keys.slice(1).map((id) => ({ id, p: gridPaths([AV_LAYERS[id]], `l:${id}`), sw: colorOf[id], fixed: gearItem(id)?.fixed }))
  const base = gridPaths([AV_BASE], 'l:base')
  const fill = (c: string, sw?: { X: string; Y: string; Z: string }) =>
    c === 'H' ? hair.H : c === 'J' ? hair.J : c === 's' ? skin.s : c === 'S' ? skin.S : c === 'X' || c === 'Y' || c === 'Z' ? (sw?.[c] ?? PAL.e) : PAL[c]
  return (
    <svg className={`px px-avatar ${className ?? ''}`} viewBox={`0 0 ${p.w} ${p.h}`} width={(size * p.w) / p.h} height={size} shapeRendering="crispEdges" role="img" aria-label={title ?? 'Аватар'}>
      {base.runs.map(([c, d]) => (
        <path key={`b${c}`} d={d} fill={fill(c)} />
      ))}
      {layered.map((l) =>
        l.p.runs.map(([c, d]) => <path key={`${l.id}${c}`} d={d} fill={fill(c, l.fixed ? SWATCHES.white : l.sw)} />),
      )}
    </svg>
  )
})
