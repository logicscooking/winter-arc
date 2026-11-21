/**
 * «Утренняя инвестиция»: the program. This is the only place that reads the clip list.
 *
 * src/morning/clips.json comes from the clip cutter (videos and posters in public/morning/). It goes
 * through a sanitizer, so a malformed entry is dropped instead of breaking the player.
 * The final block («Финал») is not a clip: it is built here from the «мужчин / женщин» setting.
 */
import clipsJson from './clips.json'

export type ClipBlock = 'v1' | 'v2' | 'v3' | 'v4'
export type BlockId = ClipBlock | 'fin'
export type FinalFor = 'm' | 'f'

export interface Clip {
  id: string
  block: BlockId
  title: string
  mode: 'time' | 'reps'
  seconds?: number
  reps?: number
  hint: string
  /** relative to the site root: 'morning/<id>.mp4' */
  video?: string
  poster?: string
}

export const BLOCKS: Record<BlockId, { title: string }> = {
  v1: { title: 'Разгон лимфы' },
  v2: { title: 'Мобильность' },
  v3: { title: 'Спина' },
  v4: { title: 'Шея и голова' },
  fin: { title: 'Финал' },
}

/** «Приготовься» 3-2-1 after «Старт», s */
export const GET_SEC = 3
/** getting into position between exercises, for the time estimate only, s */
export const SWITCH_SEC = 4
/** a rep, for the time estimate only, s */
export const REP_SEC = 3

const BLOCK_IDS: readonly string[] = ['v1', 'v2', 'v3', 'v4']
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const posInt = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.round(v)) : undefined)

/** Keeps a well-formed clip, drops anything else */
export function sanitizeClip(raw: unknown): Clip | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id, 60)
  const title = str(r.title, 60)
  if (!id || !title || typeof r.block !== 'string' || !BLOCK_IDS.includes(r.block)) return null
  const mode = r.mode === 'reps' ? 'reps' : r.mode === 'time' ? 'time' : null
  if (!mode) return null
  const out: Clip = { id, block: r.block as ClipBlock, title, mode, hint: str(r.hint) ?? '' }
  if (mode === 'time') {
    const s = posInt(r.seconds, 600)
    if (!s) return null
    out.seconds = s
  } else {
    const n = posInt(r.reps, 200)
    if (!n) return null
    out.reps = n
  }
  const video = str(r.video)
  const poster = str(r.poster)
  if (video) out.video = video
  if (poster) out.poster = poster
  return out
}

export function parseClips(raw: unknown): Clip[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.map(sanitizeClip).filter((c): c is Clip => !!c && !seen.has(c.id) && !!seen.add(c.id))
}

/** the clip program in order */
export const CLIPS: Clip[] = parseClips(clipsJson)

/** «Финал»: men 20 squats + 20 push-ups, women 20 squats + 5 push-ups (from the knees is fine) */
export function finalSteps(f: FinalFor): Clip[] {
  return [
    { id: 'fin-squats', block: 'fin', title: 'Приседания', mode: 'reps', reps: 20, hint: 'Пятки в пол, колени смотрят туда же, куда носки' },
    f === 'f'
      ? { id: 'fin-pushups', block: 'fin', title: 'Отжимания', mode: 'reps', reps: 5, hint: 'С колен — ок. Корпус прямой, грудь к полу' }
      : { id: 'fin-pushups', block: 'fin', title: 'Отжимания', mode: 'reps', reps: 20, hint: 'Корпус прямой, грудь к полу. Тяжело — с колен' },
  ]
}

/** «1 упражнение», «3 упражнения», «22 упражнения», «5 упражнений» */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]
}

/** «20 приседаний + 5 отжиманий» */
export function finalLabel(f: FinalFor): string {
  const [sq, pu] = finalSteps(f)
  return `${sq.reps} ${plural(sq.reps ?? 0, ['приседание', 'приседания', 'приседаний'])} + ${pu.reps} ${plural(pu.reps ?? 0, ['отжимание', 'отжимания', 'отжиманий'])}`
}

/** «×10» or «30 сек» */
export const clipAmount = (c: Clip) => (c.mode === 'time' ? `${c.seconds} сек` : `×${c.reps}`)

export function buildProgram(f: FinalFor = 'm', clips: Clip[] = CLIPS): Clip[] {
  return [...clips, ...finalSteps(f)]
}

export const clipSeconds = (c: Clip) => (c.mode === 'time' ? (c.seconds ?? 0) : (c.reps ?? 0) * REP_SEC)

/** whole session: the exercises, the 3-2-1 before each timed one, a few seconds to switch, s */
export function programSeconds(list: Clip[]): number {
  return list.reduce((s, c) => s + clipSeconds(c) + (c.mode === 'time' ? GET_SEC : 0) + SWITCH_SEC, 0)
}

export const programMinutes = (list: Clip[]) => Math.max(1, Math.round(programSeconds(list) / 60))

/** Blocks in program order with their exercise counts */
export function blocksOf(list: Clip[]): { id: BlockId; title: string; count: number; seconds: number }[] {
  const out: { id: BlockId; title: string; count: number; seconds: number }[] = []
  for (const c of list) {
    const last = out.at(-1)
    if (last && last.id === c.block) {
      last.count++
      last.seconds += clipSeconds(c)
    } else out.push({ id: c.block, title: BLOCKS[c.block].title, count: 1, seconds: clipSeconds(c) })
  }
  return out
}

/** a public/ path → URL under the site base (the app lives at /winter-arc/) */
export function mediaUrl(path: string | undefined): string | undefined {
  if (!path) return undefined
  if (/^(https?:)?\/\//.test(path) || path.startsWith('/')) return path
  return `${import.meta.env.BASE_URL}${path}`
}
