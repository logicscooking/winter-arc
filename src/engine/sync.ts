/**
 * Phone ↔ Mac sync: pure merge logic.
 *
 * The store is flattened into «atoms» — the smallest pieces two devices can edit independently:
 * one quest mark of one day, one check-in, one task, one purchase, one setting… Every atom carries
 * the time it was last changed on this device (stamps); a removed atom leaves a tombstone.
 * Merging two devices is last-writer-wins per atom, with two safety rules:
 *   - an atom edited after it was deleted elsewhere survives (an edit beats an older delete);
 *   - on an exact tie the remote side wins, so both devices converge on the same result.
 * Nothing here touches storage or the network.
 */
import { V04_COLLECTIONS, normalizeData } from './data'
import type { AppData, DayLog, Task } from './types'

export type Atoms = Record<string, unknown>

export interface SyncMeta {
  /** atom path → ms of the last local change (0 / missing = legacy, unknown time) */
  stamps: Record<string, number>
  /** atom path → ms when it was removed */
  tombs: Record<string, number>
}

/** What is stored in private_state.data */
export interface SyncDoc extends SyncMeta {
  v: 1
  data: AppData
}

/** Settings that stay per device: theme, snow and the debug clock are not synced */
export const LOCAL_SETTINGS = ['theme', 'snow', 'debugOffsetDays', 'aiUse'] as const

const SEP = '/'
// v0.4 collections merge per item exactly like tasks: one atom per id, LWW by stamp, tombstone on delete
const COLLECTIONS = ['quests', 'tasks', 'slips', 'cravings', 'purchases', 'rewards', 'pauses', 'books', ...V04_COLLECTIONS] as const
type CollectionKey = (typeof COLLECTIONS)[number]
const SET_ACKS = ['reviewedWeeks', 'hints', 'celebrated'] as const
const KNOWN = new Set<string>(['schemaVersion', 'profile', 'days', 'activeBookId', 'baseline', 'final', 'reviews', 'settings', 'ack', ...COLLECTIONS])

// ---------- canonical JSON ----------

export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export const sameValue = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b)

/** JSON round-trip drops undefined fields so atoms compare the way they are stored */
const clean = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

// ---------- flatten ----------

const atomCache = new WeakMap<AppData, Atoms>()

export function toAtoms(d: AppData): Atoms {
  const hit = atomCache.get(d)
  if (hit) return hit
  const a: Atoms = {}
  const put = (path: string, v: unknown) => {
    if (v !== undefined) a[path] = clean(v)
  }
  if (d.profile) for (const [k, v] of Object.entries(d.profile)) put(`profile${SEP}${k}`, v)
  for (const c of COLLECTIONS) {
    const list = (d[c] ?? []) as { id: string }[]
    for (const item of list) if (item && typeof item.id === 'string') put(`${c}${SEP}${item.id}`, item)
  }
  for (const [day, log] of Object.entries(d.days ?? {})) {
    if (!log) continue
    for (const [qid, m] of Object.entries(log.quests ?? {})) put(`days${SEP}${day}${SEP}quests${SEP}${qid}`, m)
    for (const [k, v] of Object.entries(log)) if (k !== 'quests') put(`days${SEP}${day}${SEP}${k}`, v)
  }
  put('activeBookId', d.activeBookId)
  for (const k of ['baseline', 'final'] as const) for (const [f, v] of Object.entries(d[k] ?? {})) put(`${k}${SEP}${f}`, v)
  for (const [w, r] of Object.entries(d.reviews ?? {})) put(`reviews${SEP}${w}`, r)
  for (const [k, v] of Object.entries(d.settings ?? {})) if (!(LOCAL_SETTINGS as readonly string[]).includes(k)) put(`settings${SEP}${k}`, v)
  for (const [k, v] of Object.entries(d.ack ?? {})) {
    if ((SET_ACKS as readonly string[]).includes(k) && Array.isArray(v)) {
      for (const x of v) put(`ack${SEP}${k}${SEP}${JSON.stringify(x)}`, true)
    } else put(`ack${SEP}${k}`, v)
  }
  for (const [k, v] of Object.entries(d)) if (!KNOWN.has(k)) put(`x${SEP}${k}`, v)
  atomCache.set(d, a)
  return a
}

// ---------- rebuild ----------

const byAt = (a: { at?: number; id: string }, b: { at?: number; id: string }) => (a.at ?? 0) - (b.at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Rebuild the store from atoms. `local` provides the per-device settings and the preferred
 * order of lists without a natural sort key.
 */
export function fromAtoms(atoms: Atoms, local: AppData): AppData {
  const out = {
    schemaVersion: 1,
    quests: [],
    days: {},
    tasks: [],
    slips: [],
    cravings: [],
    purchases: [],
    rewards: [],
    pauses: [],
    books: [],
    baseline: {},
    final: {},
    reviews: {},
    settings: {},
    ack: { reviewedWeeks: [], hints: [], celebrated: [] },
    ...Object.fromEntries(V04_COLLECTIONS.map((k) => [k, []])),
  } as unknown as AppData & Record<string, unknown>
  const profile: Record<string, unknown> = {}
  const lists = Object.fromEntries(COLLECTIONS.map((k) => [k, [] as unknown[]])) as Record<CollectionKey, unknown[]>
  const sets: Record<string, unknown[]> = {}

  for (const path of Object.keys(atoms).sort()) {
    const v = clean(atoms[path])
    const parts = path.split(SEP)
    const head = parts[0]
    if (head === 'profile') profile[parts[1]] = v
    else if ((COLLECTIONS as readonly string[]).includes(head)) lists[head as CollectionKey].push(v)
    else if (head === 'days') {
      const day = parts[1]
      const log: DayLog = (out.days[day] ??= { quests: {} })
      if (parts[2] === 'quests' && parts.length >= 4) log.quests[parts.slice(3).join(SEP)] = v as DayLog['quests'][string]
      else (log as unknown as Record<string, unknown>)[parts[2]] = v
    } else if (head === 'activeBookId') out.activeBookId = v as string
    else if (head === 'baseline' || head === 'final') (out[head] as Record<string, unknown>)[parts[1]] = v
    else if (head === 'reviews') (out.reviews as Record<string, unknown>)[parts[1]] = v
    else if (head === 'settings') (out.settings as unknown as Record<string, unknown>)[parts[1]] = v
    else if (head === 'ack') {
      if (parts.length >= 3 && (SET_ACKS as readonly string[]).includes(parts[1])) {
        try {
          ;(sets[parts[1]] ??= []).push(JSON.parse(parts.slice(2).join(SEP)))
        } catch {
          /* malformed set member: skip */
        }
      } else (out.ack as unknown as Record<string, unknown>)[parts[1]] = v
    } else if (head === 'x') out[parts.slice(1).join(SEP)] = v
  }

  if (Object.keys(profile).length) out.profile = profile as unknown as AppData['profile']
  for (const k of SET_ACKS) {
    const vals = sets[k] ?? []
    ;(out.ack as unknown as Record<string, unknown>)[k] = k === 'reviewedWeeks' ? [...vals].sort((a, b) => Number(a) - Number(b)) : vals
  }
  for (const k of LOCAL_SETTINGS) {
    const v = local.settings?.[k]
    if (v !== undefined) (out.settings as unknown as Record<string, unknown>)[k] = v
  }

  // natural orders; quests and rewards keep the local order, newcomers go last
  const localIndex = (c: CollectionKey) => new Map(((local[c] ?? []) as { id: string }[]).map((x, i) => [x.id, i]))
  const keepOrder = (c: CollectionKey) => {
    const idx = localIndex(c)
    return (a: { id: string; order?: number }, b: { id: string; order?: number }) => {
      const ia = idx.get(a.id) ?? Infinity
      const ib = idx.get(b.id) ?? Infinity
      if (ia !== ib) return ia - ib
      return (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : 1)
    }
  }
  out.quests = (lists.quests as AppData['quests']).sort(keepOrder('quests'))
  out.rewards = (lists.rewards as AppData['rewards']).sort(keepOrder('rewards'))
  out.slips = (lists.slips as AppData['slips']).sort(byAt)
  out.cravings = (lists.cravings as AppData['cravings']).sort(byAt)
  out.purchases = (lists.purchases as AppData['purchases']).sort(byAt)
  out.pauses = (lists.pauses as AppData['pauses']).sort(byAt)
  out.books = (lists.books as AppData['books']).sort((a, b) => (a.startDay < b.startDay ? -1 : a.startDay > b.startDay ? 1 : a.id < b.id ? -1 : 1))
  // v0.4: orders that do not depend on the device
  type Ordered = { id: string; order?: number; createdAt?: number }
  const byOrderId = (a: Ordered, b: Ordered) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : 1)
  const byIdOnly = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const o = out as unknown as Record<string, unknown[]>
  o.skills = (lists.skills as Ordered[]).sort(keepOrder('skills'))
  o.traits = (lists.traits as Ordered[]).sort(byOrderId)
  o.nodes = (lists.nodes as Ordered[]).sort(byOrderId)
  o.goals = (lists.goals as Ordered[]).sort(byOrderId)
  o.practices = (lists.practices as { at: number; id: string }[]).sort(byAt)
  o.extras = (lists.extras as { at: number; id: string }[]).sort(byAt)
  o.chests = (lists.chests as { at: number; id: string }[]).sort(byAt)
  o.duels = (lists.duels as { createdAt: number; id: string }[]).sort((a, b) => a.createdAt - b.createdAt || byIdOnly(a, b))
  o.flows = (lists.flows as { startedAt: number; id: string }[]).sort((a, b) => a.startedAt - b.startedAt || byIdOnly(a, b))
  o.bars = (lists.bars as { id: string }[]).sort(byIdOnly)
  o.themes = (lists.themes as { id: string }[]).sort(byIdOnly)
  const tasks = (lists.tasks as Task[]).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  // a subtask whose parent was deleted on the other device is kept as a top-level task
  const ids = new Set(tasks.map((t) => t.id))
  out.tasks = tasks.map((t) => (t.parentId && !ids.has(t.parentId) ? { ...t, parentId: null } : t))
  return out as AppData
}

// ---------- local change tracking ----------

/** Stamp every atom that changed between two local states. Returns a new meta object. */
export function stampChanges(prev: Atoms, next: Atoms, meta: SyncMeta, now: number): SyncMeta {
  const stamps = { ...meta.stamps }
  const tombs = { ...meta.tombs }
  for (const [path, v] of Object.entries(next)) {
    if (!(path in prev) || !sameValue(prev[path], v)) {
      stamps[path] = now
      delete tombs[path]
    }
  }
  for (const path of Object.keys(prev)) {
    if (!(path in next)) {
      tombs[path] = now
      delete stamps[path]
    }
  }
  return { stamps, tombs }
}

// ---------- merge ----------

/** Atoms where both versions combine instead of one winning */
const RESOLVERS: Record<string, (a: unknown, b: unknown) => unknown> = {
  // the earliest onboarding keeps the warm-up days of whichever device started first
  [`profile${SEP}onboardDay`]: (a, b) => (String(a) <= String(b) ? a : b),
  [`ack${SEP}missedThrough`]: (a, b) => (String(a) >= String(b) ? a : b),
  [`ack${SEP}finaleSeen`]: (a, b) => !!a || !!b,
}

export interface Side {
  atoms: Atoms
  meta: SyncMeta
}

export interface MergeResult {
  atoms: Atoms
  meta: SyncMeta
  /** local atoms replaced by a different remote value or deleted by a remote tombstone */
  overwritten: string[]
  /** atoms that arrived from remote and did not exist locally */
  added: string[]
  /** merged result differs from local / from remote */
  localChanged: boolean
  remoteChanged: boolean
}

export function mergeSides(local: Side, remote: Side): MergeResult {
  const atoms: Atoms = {}
  const stamps: Record<string, number> = {}
  const tombs: Record<string, number> = {}
  const overwritten: string[] = []
  const added: string[] = []
  let localChanged = false
  let remoteChanged = false

  const paths = new Set([...Object.keys(local.atoms), ...Object.keys(remote.atoms), ...Object.keys(local.meta.tombs), ...Object.keys(remote.meta.tombs)])
  for (const path of paths) {
    const lHas = path in local.atoms
    const rHas = path in remote.atoms
    const lT = lHas ? local.meta.stamps[path] ?? 0 : local.meta.tombs[path] ?? -1
    const rT = rHas ? remote.meta.stamps[path] ?? 0 : remote.meta.tombs[path] ?? -1

    if (lHas && rHas) {
      const lv = local.atoms[path]
      const rv = remote.atoms[path]
      const t = Math.max(lT, rT)
      if (sameValue(lv, rv)) {
        atoms[path] = lv
      } else if (RESOLVERS[path]) {
        atoms[path] = RESOLVERS[path](lv, rv)
      } else {
        atoms[path] = lT > rT ? lv : rv
      }
      stamps[path] = t
      if (!sameValue(atoms[path], lv)) {
        localChanged = true
        overwritten.push(path)
      }
      if (!sameValue(atoms[path], rv)) remoteChanged = true
    } else if (lHas) {
      // remote deleted it after our last edit → delete; otherwise keep ours
      if (rT > lT) {
        tombs[path] = rT
        localChanged = true
        overwritten.push(path)
      } else {
        atoms[path] = local.atoms[path]
        stamps[path] = lT
        remoteChanged = true
      }
    } else if (rHas) {
      if (lT > rT) {
        tombs[path] = lT
        remoteChanged = true
      } else {
        atoms[path] = remote.atoms[path]
        stamps[path] = rT
        localChanged = true
        added.push(path)
      }
    } else {
      const t = Math.max(lT, rT)
      if (t >= 0) tombs[path] = t
      if (lT >= 0 && rT < 0) remoteChanged = true
    }
  }
  // tombstones and stamps travel too: a remote that lacks our tomb must learn it
  for (const path of Object.keys(tombs)) if (remote.meta.tombs[path] !== tombs[path]) remoteChanged = true
  return { atoms, meta: { stamps, tombs }, overwritten, added, localChanged, remoteChanged }
}

/** Merge a local store with the doc pulled from the server. */
export function mergeDocs(localData: AppData, localMeta: SyncMeta, remote: SyncDoc | null | undefined) {
  const local: Side = { atoms: toAtoms(localData), meta: localMeta }
  if (!remote || !remote.data) {
    return { data: localData, meta: localMeta, overwritten: [] as string[], added: [] as string[], localChanged: false, remoteChanged: true }
  }
  const r: Side = { atoms: toAtoms(remote.data), meta: { stamps: remote.stamps ?? {}, tombs: remote.tombs ?? {} } }
  const m = mergeSides(local, r)
  const data = m.localChanged ? normalizeData(fromAtoms(m.atoms, localData)) : localData
  return { data, meta: m.meta, overwritten: m.overwritten, added: m.added, localChanged: m.localChanged, remoteChanged: m.remoteChanged }
}

/** Drop tombstones older than `maxAgeMs` so the doc does not grow forever */
export function pruneTombs(meta: SyncMeta, now: number, maxAgeMs = 180 * 86400_000): SyncMeta {
  const tombs: Record<string, number> = {}
  for (const [k, t] of Object.entries(meta.tombs)) if (now - t < maxAgeMs) tombs[k] = t
  return { stamps: meta.stamps, tombs }
}
