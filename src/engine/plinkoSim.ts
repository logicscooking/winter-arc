/**
 * «Судьба дня» v0.7: a real Plinko board. A 2D rigid-ball simulation, pure and headless:
 * gravity, a round ball, round pegs, the triangle walls and the slot dividers. Each drop starts
 * from crypto-random initial conditions (start x, start velocity, a little bounciness jitter), so
 * the slot comes out of the physics itself and is then written to the drop log. Rendering lives in
 * components/Plinko.tsx and only plays the recorded frames back.
 *
 * Fixed step: the sim advances in STEP = 1/120 s frames (2 substeps each for the collisions), the
 * renderer walks those frames with an accumulator on rAF and interpolates between them.
 */

/** slots at the bottom */
export const SIM_SLOTS = 16
/** peg rows: row r has r + 3 pegs, the last row's 17 pegs sit on the slot dividers */
export const SIM_ROWS = SIM_SLOTS - 1
/** frame of the recorded trajectory, s */
export const SIM_STEP = 1 / 120
const SUB = 2
const DT = SIM_STEP / SUB

/** Board geometry in board units (the canvas scales it to its CSS width) */
export const SIM = (() => {
  const S = 24 // peg spacing = slot width
  const M = 8 // side margin
  const W = SIM_SLOTS * S + 2 * M
  const CX = W / 2
  const Y0 = 34 // first peg row
  const DY = 21 // row gap
  const lastY = Y0 + (SIM_ROWS - 1) * DY
  const landY = lastY + 18 // the ball is in the slot once its centre passes this line
  return {
    S,
    M,
    W,
    CX,
    Y0,
    DY,
    lastY,
    landY,
    H: landY + 8,
    pegR: 3,
    ballR: 5.5,
    startY: 6,
    /** wall top: row -1 */
    wallTopY: Y0 - DY,
    gravity: 2000,
  }
})()

export const pegX = (r: number, j: number) => SIM.CX + (j - (r + 2) / 2) * SIM.S
export const pegY = (r: number) => SIM.Y0 + r * SIM.DY
/** centre x of slot k */
export const slotX = (k: number) => SIM.M + (k + 0.5) * SIM.S
export const slotAtX = (x: number) => Math.max(0, Math.min(SIM_SLOTS - 1, Math.floor((x - SIM.M) / SIM.S)))

interface Seg {
  ax: number
  ay: number
  bx: number
  by: number
}

const WALL_OUT = 3

/** Triangle walls just outside the outer pegs, vertical walls under them, and the slot dividers */
export const SIM_WALLS: Seg[] = (() => {
  const { M, W, CX, S, wallTopY, lastY, landY } = SIM
  const out: Seg[] = [
    // a little outside the outer pegs: they stick out of the wall and kick a sliding ball back in
    { ax: CX - S / 2 - WALL_OUT, ay: wallTopY, bx: M - WALL_OUT, by: lastY },
    { ax: CX + S / 2 + WALL_OUT, ay: wallTopY, bx: W - M + WALL_OUT, by: lastY },
    { ax: M - WALL_OUT, ay: lastY, bx: M - WALL_OUT, by: landY + 30 },
    { ax: W - M + WALL_OUT, ay: lastY, bx: W - M + WALL_OUT, by: landY + 30 },
  ]
  for (let k = 1; k < SIM_SLOTS; k++) out.push({ ax: M + k * S, ay: lastY, bx: M + k * S, by: landY + 30 })
  return out
})()

/** What makes one drop unique. All numbers come from crypto in the app, from a seeded PRNG in tests. */
export interface DropParams {
  /** start x offset from the centre, board units */
  x0: number
  vx0: number
  vy0: number
  /** restitution on pegs and walls, ~0.4–0.6 */
  e: number
  /** tangential damping per contact, 0..1 */
  mu: number
  /** −1 | 1: which way to nudge a ball balanced dead on a peg */
  nudge: number
}

export type Rand = () => number

/** Uniform [0, 1) from crypto.getRandomValues (53 bits) */
export const cryptoRand: Rand = () => {
  const a = new Uint32Array(2)
  globalThis.crypto.getRandomValues(a)
  return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53
}

/** Seeded PRNG for tests and replays of the physics (mulberry32) */
export function seededRand(seed: number): Rand {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random start: a small spread at the apex, a little push, micro-variation of bounciness */
export function randomDropParams(rand: Rand = cryptoRand): DropParams {
  return {
    x0: (rand() * 2 - 1) * 6,
    vx0: (rand() * 2 - 1) * 28,
    vy0: rand() * 40,
    e: 0.44 + rand() * 0.14,
    mu: 0.04 + rand() * 0.06,
    nudge: rand() < 0.5 ? -1 : 1,
  }
}

export interface PegHit {
  /** frame index */
  f: number
  row: number
  j: number
  /** impact speed, board units/s */
  v: number
}

export interface SimResult {
  slot: number
  /** frames recorded at SIM_STEP: xs[i], ys[i] */
  xs: Float32Array
  ys: Float32Array
  frames: number
  /** real peg impacts (not rolling contacts) in order */
  hits: PegHit[]
  /** divider / wall impacts (frame, speed) */
  knocks: { f: number; v: number }[]
  /** wall-clock length of the fall, s */
  seconds: number
}

const MAX_FRAMES = 120 * 14
const VMAX = 900
const HIT_MIN = 28

/** Simulate one drop to the end. Pure: the same params give the same trajectory. */
export function simulateDrop(p: DropParams): SimResult {
  const { pegR, ballR, gravity, landY } = SIM
  const xs = new Float32Array(MAX_FRAMES + 1)
  const ys = new Float32Array(MAX_FRAMES + 1)
  const hits: PegHit[] = []
  const knocks: { f: number; v: number }[] = []
  let x = SIM.CX + p.x0
  let y = SIM.startY
  let vx = p.vx0
  let vy = p.vy0
  const e = p.e
  const keep = 1 - p.mu
  const rr = pegR + ballR
  let slow = 0
  // per-peg cooldown, so a rolling contact is not counted as many hits
  const lastHit = new Map<number, number>()
  xs[0] = x
  ys[0] = y
  let f = 0

  const bounce = (nx: number, ny: number, frame: number): number => {
    const vn = vx * nx + vy * ny
    if (vn >= 0) return 0
    const tx = -ny
    const ty = nx
    const vt = vx * tx + vy * ty
    const nvn = -vn * e
    const nvt = vt * keep
    vx = nx * nvn + tx * nvt
    vy = ny * nvn + ty * nvt
    void frame
    return -vn
  }

  while (f < MAX_FRAMES) {
    f++
    for (let s = 0; s < SUB; s++) {
      vy += gravity * DT
      // a breath of air drag
      vx *= 1 - 0.15 * DT
      vy *= 1 - 0.05 * DT
      const sp = Math.hypot(vx, vy)
      if (sp > VMAX) {
        vx *= VMAX / sp
        vy *= VMAX / sp
      }
      x += vx * DT
      y += vy * DT

      // pegs: only the rows the ball can touch
      const r0 = Math.max(0, Math.floor((y - rr - SIM.Y0) / SIM.DY))
      const r1 = Math.min(SIM_ROWS - 1, Math.ceil((y + rr - SIM.Y0) / SIM.DY))
      for (let r = r0; r <= r1; r++) {
        const py = pegY(r)
        if (Math.abs(py - y) > rr) continue
        const jc = Math.round((x - SIM.CX) / SIM.S + (r + 2) / 2)
        for (let j = Math.max(0, jc - 1); j <= Math.min(r + 2, jc + 1); j++) {
          const px = pegX(r, j)
          const dx = x - px
          const dy = y - py
          const d2 = dx * dx + dy * dy
          if (d2 >= rr * rr) continue
          const d = Math.sqrt(d2) || 1e-6
          const nx = dx / d
          const ny = dy / d
          x = px + nx * rr
          y = py + ny * rr
          const imp = bounce(nx, ny, f)
          const key = r * 32 + j
          if (imp > HIT_MIN && f - (lastHit.get(key) ?? -99) > 4) hits.push({ f, row: r, j, v: imp })
          if (imp > 0) lastHit.set(key, f)
        }
      }

      // walls and dividers (capsules)
      for (const w of SIM_WALLS) {
        if (y + ballR < Math.min(w.ay, w.by) || y - ballR > Math.max(w.ay, w.by) + ballR) continue
        const ex = w.bx - w.ax
        const ey = w.by - w.ay
        const t = Math.max(0, Math.min(1, ((x - w.ax) * ex + (y - w.ay) * ey) / (ex * ex + ey * ey)))
        const cx = w.ax + ex * t
        const cy = w.ay + ey * t
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy
        const lim = ballR + 1
        if (d2 >= lim * lim) continue
        const d = Math.sqrt(d2) || 1e-6
        const nx = dx / d
        const ny = dy / d
        x = cx + nx * lim
        y = cy + ny * lim
        const imp = bounce(nx, ny, f)
        if (imp > HIT_MIN * 2) knocks.push({ f, v: imp })
      }
    }

    // a ball balanced dead on top of a peg: nudge it off, the way a real board would wobble
    if (Math.hypot(vx, vy) < 10 && y < landY) {
      if (++slow > 24) {
        vx += p.nudge * 45
        slow = 0
      }
    } else slow = 0

    xs[f] = x
    ys[f] = y
    if (y >= landY) break
  }

  return {
    slot: slotAtX(x),
    xs: xs.subarray(0, f + 1),
    ys: ys.subarray(0, f + 1),
    frames: f + 1,
    hits,
    knocks,
    seconds: f * SIM_STEP,
  }
}

/** A drop with fresh crypto-random initial conditions */
export const rollDrop = (rand: Rand = cryptoRand) => simulateDrop(randomDropParams(rand))
