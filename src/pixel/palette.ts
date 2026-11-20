/** Shared pixel palette: one char per color. '.' is transparent. */
export const PAL: Record<string, string> = {
  k: '#10170f', // outline
  w: '#ffffff',
  W: '#cfdfe9', // snow shade
  i: '#c4ecff', // ice light
  I: '#6cc6f2', // ice
  b: '#2f80c0', // ice deep
  B: '#1d4f86',
  g: '#ffd166', // gold light
  G: '#f2a93b', // gold
  h: '#b8701c', // gold dark
  y: '#fff27a', // bright yellow
  r: '#ff5a6a', // red
  R: '#c22a44',
  n: '#56c271', // green
  N: '#2c8a4f',
  v: '#17583a',
  l: '#a6e39a',
  o: '#ff9a3c', // orange
  O: '#a0612b', // brown
  d: '#6b3d1d',
  D: '#3e2412',
  s: '#ffd9b8', // skin
  S: '#e9a87e',
  p: '#b48cff', // purple
  P: '#6f49c2',
  e: '#b9c4cc', // grey
  E: '#7a8a96',
  F: '#48545e',
  c: '#fff4d6', // cream
  m: '#ff9cc0', // pink
  M: '#d75f8f',
  t: '#8be0d0',
}

/** Swatches for avatar gear: X main, Y shade, Z highlight */
export const SWATCHES: Record<string, { name: string; X: string; Y: string; Z: string }> = {
  red: { name: 'Клюква', X: '#e0465a', Y: '#9e2236', Z: '#ff8a96' },
  gold: { name: 'Гирлянда', X: '#f2b84b', Y: '#b8701c', Z: '#ffe08a' },
  green: { name: 'Ель', X: '#3fae6a', Y: '#1f6b45', Z: '#8fe0a6' },
  blue: { name: 'Лёд', X: '#3f8fe0', Y: '#24508f', Z: '#9cc8ff' },
  white: { name: 'Снег', X: '#eef4f8', Y: '#aebfcc', Z: '#ffffff' },
  black: { name: 'Ночь', X: '#30363d', Y: '#15181c', Z: '#5d6670' },
  purple: { name: 'Сияние', X: '#9a6ad6', Y: '#5d3a8f', Z: '#c9a8ff' },
}

export const HAIR: Record<string, { name: string; H: string; J: string }> = {
  brown: { name: 'Каштан', H: '#7a4a24', J: '#4a2a12' },
  black: { name: 'Смоль', H: '#2d2b33', J: '#141318' },
  blond: { name: 'Пшеница', H: '#e8c06a', J: '#b0832a' },
  ginger: { name: 'Рыжий', H: '#d2692c', J: '#8a3d14' },
  silver: { name: 'Иней', H: '#dfe6ea', J: '#98a6b0' },
}

export const SKIN: Record<string, { name: string; s: string; S: string }> = {
  light: { name: 'Светлая', s: '#ffd9b8', S: '#e9a87e' },
  mid: { name: 'Средняя', s: '#ebb48c', S: '#c4805a' },
  tan: { name: 'Смуглая', s: '#c98a5e', S: '#9a5f3a' },
  deep: { name: 'Тёмная', s: '#8d5a3b', S: '#5e3a24' },
}
