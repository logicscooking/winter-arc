/** Pixel grid → SVG path per color (horizontal runs merged). Pure, cached. */
export type Grid = string[]

export interface Paths {
  w: number
  h: number
  /** color key → path data */
  runs: [string, string][]
}

const cache = new Map<string, Paths>()

export function gridPaths(grids: Grid[], key?: string): Paths {
  const k = key ?? grids.map((g) => g.join('|')).join('#')
  const hit = cache.get(k)
  if (hit) return hit
  const h = Math.max(...grids.map((g) => g.length))
  const w = Math.max(...grids.flatMap((g) => g.map((r) => r.length)))
  // compose: later grids paint over earlier ones
  const cells: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('.'))
  for (const g of grids)
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') cells[y][x] = row[x]
    })
  const byColor = new Map<string, string>()
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const c = cells[y][x]
      if (c === '.') {
        x++
        continue
      }
      let e = x + 1
      while (e < w && cells[y][e] === c) e++
      byColor.set(c, (byColor.get(c) ?? '') + `M${x} ${y}h${e - x}v1h-${e - x}z`)
      x = e
    }
  }
  const out = { w, h, runs: [...byColor.entries()] }
  cache.set(k, out)
  return out
}
