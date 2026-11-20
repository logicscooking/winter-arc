/**
 * Дед Мороз for the Plinko board frame: original pixel art drawn as text (palette keys from
 * palette.ts, '.' transparent). 16 × 20, facing right; the sack hangs on his back.
 * Frames share the body and override a few rows.
 */
import type { Grid } from './render'

const BASE: Grid = [
  '......kkkk......',
  '.....krrrRkk....',
  '....krrrrrrRk...',
  '..kkkrrrrrrRk...',
  '.kwwkWwwwwwwWk..',
  '.kwwkwwwwwwwwk..',
  '..kkkssssskssk..',
  '....kssssssmsk..',
  '...kwwsswwwwwk..',
  '..kOkwwwwwwwwk..',
  '.kOOkkwwwwwwk...',
  'kOOOOkrrwwrrRk..',
  'kOdOOkrrrrrrRsk.',
  'kOOdOkkkgkkkkk..',
  'kOOOOkrrrrrrRk..',
  '.kOOkkrrrrrrRk..',
  '..kk.kwwwwwwWk..',
  '.....kRRkkRRk...',
  '.....kDDkkDDDk..',
  '.....kkkkkkkkk..',
]

const rows = (base: Grid, over: Record<number, string>): Grid => base.map((r, i) => over[i] ?? r)

/** legs apart: the stepping frame */
const STEP: Record<number, string> = {
  17: '....kRRk.kRRk...',
  18: '...kDDk...kDDDk.',
  19: '...kkkk...kkkkk.',
}

export const SANTA: Record<'stand' | 'step' | 'sleep' | 'yawn' | 'wave' | 'wow', Grid> = {
  stand: BASE,
  step: rows(BASE, STEP),
  // eyes shut, head a bit lower in the beard
  sleep: rows(BASE, { 6: '..kkkssssSSssk..' }),
  // eyes shut, mouth wide open in the beard
  yawn: rows(BASE, {
    6: '..kkkssssSSssk..',
    8: '...kwwsswkkkwk..',
    9: '..kOkwwwwkkwwk..',
  }),
  // the free arm up, waving
  wave: rows(BASE, {
    5: '.kwwkwwwwwwwwk.s',
    6: '..kkkssssskssksk',
    7: '....kssssssmskrk',
    8: '...kwwsswwwwwkrk',
    9: '..kOkwwwwwwwwkr.',
    12: 'kOdOOkrrrrrrRk..',
  }),
  // startled: round eyes, open mouth
  wow: rows(BASE, { 6: '..kkksssskkssk..', 8: '...kwwsswwkkwk..' }),
}

export type SantaFrame = keyof typeof SANTA
