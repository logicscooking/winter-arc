/**
 * More free gear (v8). Same 20×24 grid and X/Y/Z swatch rules as avatar-layers.ts.
 * `L(top, rows)` just prepends `top` empty rows, so each piece is drawn where it sits on the hero.
 * Base hero reference: head cols 3-16 rows 2-13, eyes (cols 6-7, 12-13) rows 8-9, mouth row 11,
 * neck row 13, torso cols 6-13 rows 14-18, arms cols 2-5 / 14-17, hands row 19, boots rows 21-23.
 */
const BLANK = '....................'
const L = (top: number, rows: string[]) => [...Array<string>(top).fill(BLANK), ...rows]

export const AV_LAYERS_MORE: Record<string, string[]> = {
  // ---------- hats ----------
  pompom: L(0, [
    '........kkkk........',
    '.......kwwwWk.......',
    '.......kwWWWk.......',
    '......kkkkkkkk......',
    '....kkXXXXXXXXkk....',
    '...kXYXXYXXYXXYXk...',
    '..kYYYYYYYYYYYYYYk..',
    '..kYZYZYZYZYZYZYYk..',
  ]),
  bear: L(1, [
    '....kkkk....kkkk....',
    '...kXZZXk..kXZZXk...',
    '...kXZZXkkkkXZZXk...',
    '...kXXXXXXXXXXXXk...',
    '...kXXXXXXXXXXXXk...',
    '..kYYYYYYYYYYYYYYk..',
    '...kk..........kk...',
  ]),
  hood: L(1, [
    '......kkkkkkkk......',
    '....kkXXXXXXXXkk....',
    '...kXXXXXXXXXXXXk...',
    '..kXXXXXXXXXXXXXXk..',
    '..kXYYYYYYYYYYYYXk..',
    '..kXY..........YXk..',
    '..kXY..........YXk..',
    '..kXY..........YXk..',
    '..kXY..........YXk..',
    '..kXY..........YXk..',
    '..kXY..........YXk..',
    '..kXXk........kXXk..',
    '..kXXXXXXXXXXXXXXk..',
    '...kYYYYYYYYYYYYk...',
  ]),
  headband: L(4, [
    '...kkkkkkkkkkkkkk...',
    '...kXZXXZXXZXXZXk...',
    '...kYYYYYYYYYYYYk...',
  ]),
  antlers: L(0, [
    '..kk..kk....kk..kk..',
    '..kOk.kOk..kOk.kOk..',
    '...kOkkOk..kOkkOk...',
    '....kOOk....kOOk....',
    '...kkkkkkkkkkkkkk...',
    '...kXZXXZXXZXXZXk...',
    '...kYYYYYYYYYYYYk...',
  ]),

  // ---------- scarves ----------
  stripescarf: L(13, [
    '...kXXwwXXwwXXwwk...',
    '...kYYWWYYWWYYWWk...',
    '.........kXXk.......',
    '.........kwwk.......',
    '.........kXXk.......',
    '.........kkkk.......',
  ]),
  snood: L(12, [
    '....kXXXXXXXXXXk....',
    '...kXZXXZXXZXXZXk...',
    '...kXXZXXZXXZXXXk...',
    '...kYYYYYYYYYYYYk...',
    '....kkkkkkkkkkkk....',
  ]),
  buff: L(10, [
    '....kZZZZZZZZZZk....',
    '....kXXXXXXXXXXk....',
    '....kXZXXZXXZXXk....',
    '...kXXXXXXXXXXXXk...',
    '...kYYYYYYYYYYYYk...',
  ]),

  // ---------- coats ----------
  hoodie: L(13, [
    '...kYYYYYYYYYYYYk...',
    '...kXXXXXXXXXXXXk...',
    '..kXXkXXZXXZXXkXXk..',
    '..kXXkXXZXXZXXkXXk..',
    '..kXXkXkkkkkkXkXXk..',
    '..kYYkYYYYYYYYkYYk..',
  ]),
  vest: L(14, [
    '....kXXXk..kXXXk....',
    '.....kXXXeeXXXk.....',
    '.....kYYYeeYYYk.....',
    '.....kXXXeeXXXk.....',
    '.....kYYYeeYYYk.....',
  ]),
  skisuit: L(13, [
    '....kYYY....YYYk....',
    '...kXXXXXXXXXXXXk...',
    '..kXXkXXXXXXXXkXXk..',
    '..kZZkZZZZZZZZkZZk..',
    '..kXXkXXXXXXXXkXXk..',
    '..kYYkYYYYYYYYkYYk..',
    '.....kXXXXXXXXk.....',
    '......XXX..XXX......',
    '......YYY..YYY......',
  ]),
  xmas: L(14, [
    '...kXXXXXyyXXXXXk...',
    '..kXXkXXXnnXXXkXXk..',
    '..kXXkXXnnrnXXkXXk..',
    '..kXXkXnynnrnXkXXk..',
    '..kYYkYYYddYYYkYYk..',
  ]),
  tulup: L(13, [
    '...kwWwWwWwWwWwWk...',
    '...kXXXXwWwWXXXXk...',
    '..kXXkXXXwwXXXkXXk..',
    '..kXXkXXZwwZXXkXXk..',
    '..kXXkXXXwwXXXkXXk..',
    '..kwWkXXZwwZXXkwWk..',
    '.....kXXXwwXXXk.....',
    '.....kwWwWwWwWk.....',
  ]),

  // ---------- mitts ----------
  furmitts: L(18, [
    '..kwWk........kWwk..',
    '..kXXk........kXXk..',
    '..kXwk........kwXk..',
    '...kk..........kk...',
  ]),
  paws: L(18, [
    '.kWwWk........kWwWk.',
    '.kXXXk........kXXXk.',
    '.kmMmk........kmMmk.',
    '..kkk..........kkk..',
  ]),
  warmers: L(15, [
    '..kYYk........kYYk..',
    '..kXXk........kXXk..',
    '..kZXk........kXZk..',
    '..kYYk........kYYk..',
  ]),

  // ---------- glasses ----------
  hearts: L(7, [
    '....XX.XX..XX.XX....',
    '....XZXXXkkXZXXX....',
    '.....XXXY..XXXY.....',
    '......XY....XY......',
  ]),
  stars: L(7, [
    '......X......X......',
    '....XXXXX..XXXXX....',
    '.....XXZX..XXZX.....',
    '.....X.X....X.X.....',
  ]),
  monocle: L(7, [
    '...........XZXX.....',
    '..........X....X....',
    '..........X....X....',
    '...........XXXX.G...',
    '................h...',
    '................G...',
    '................h...',
  ]),

  // ---------- extra ----------
  thermos: L(15, [
    '................kkkk',
    '................kEEk',
    '................kkkk',
    '................kZXk',
    '................kZXk',
    '................kwWk',
    '................kZXk',
    '................kkkk',
  ]),
  tangerine: L(16, [
    '.................nn.',
    '................kkk.',
    '...............kogok',
    '...............koook',
    '...............kGGGk',
    '................kkk.',
  ]),
  snowfall: L(1, [
    '.I..................',
    'IwI.................',
    '.I..................',
    '..................I.',
    '.................IwI',
    '..................I.',
    '.I..................',
    '...................I',
    '.I..................',
  ]),
  lantern: L(14, [
    '..kk................',
    '.k..k...............',
    'kXXXXk..............',
    'kywwyk..............',
    'kywwyk..............',
    'kyyyyk..............',
    'kXXXXk..............',
    '.kkkk...............',
  ]),
}
