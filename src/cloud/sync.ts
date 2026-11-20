/**
 * Phone ↔ Mac sync through private_state. Offline-first:
 *   - every local change is stamped per atom (src/engine/sync.ts) — always, even logged out;
 *   - a debounced push follows each change; pull on start, focus, «pushed» ping and a slow poll;
 *   - writes are compare-and-swap on `rev`, so two devices never overwrite each other blindly;
 *   - before a merge overwrites anything local, the previous local state is saved as a snapshot.
 */
import { mergeDocs, pruneTombs, stampChanges, toAtoms } from '../engine'
import type { AppData, SyncDoc, SyncMeta } from '../engine'
import { useStore } from '../store/store'
import { CloudError, errorCode, getClient } from './client'
import { useSocial } from './state'

const META_KEY = 'winter-arc-sync-v1'
const BACKUPS_KEY = 'winter-arc-backups-v1'
const MAX_DOC = 1_900_000
const PUSH_DELAY = 3500

interface LocalMeta extends SyncMeta {
  /** server rev this device last merged with (0 = never) */
  rev: number
  /** account the rev belongs to */
  userId?: string
  /** bumps on every local change; a push is clean only if it did not move meanwhile */
  seq: number
  pushedSeq: number
}

function loadMeta(): LocalMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const m = JSON.parse(raw) as Partial<LocalMeta>
      return { stamps: m.stamps ?? {}, tombs: m.tombs ?? {}, rev: m.rev ?? 0, userId: m.userId, seq: m.seq ?? 0, pushedSeq: m.pushedSeq ?? -1 }
    }
  } catch {
    /* corrupted meta: start clean, data itself is untouched */
  }
  return { stamps: {}, tombs: {}, rev: 0, seq: 0, pushedSeq: -1 }
}

let meta = loadMeta()
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveMeta(now = false) {
  clearTimeout(saveTimer)
  const write = () => {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta))
    } catch {
      /* quota: stamps are best effort */
    }
  }
  if (now) write()
  else saveTimer = setTimeout(write, 600)
}

let applying = false
let tracking = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
const changeListeners = new Set<() => void>()

/** Stamp every local change. Runs from app start, with or without an account. */
export function startChangeTracking() {
  if (tracking) return
  tracking = true
  useStore.subscribe((s, prev) => {
    if (s.data === prev.data || applying) return
    const m = stampChanges(toAtoms(prev.data), toAtoms(s.data), meta, Date.now())
    meta = { ...meta, ...m, seq: meta.seq + 1 }
    saveMeta()
    changeListeners.forEach((l) => l())
    if (useSocial.getState().account) schedulePush()
  })
  window.addEventListener('pagehide', () => saveMeta(true))
}

/** Local data changes (not the ones applied from the server) */
export function onLocalChange(fn: () => void) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

export function schedulePush(delay = PUSH_DELAY) {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void syncNow().catch(() => undefined), delay)
}

export const hasUnpushedChanges = () => meta.seq !== meta.pushedSeq

// ---------- snapshots ----------

export interface Snapshot {
  at: number
  reason: string
  data: AppData
}

export function listSnapshots(): Snapshot[] {
  try {
    return (JSON.parse(localStorage.getItem(BACKUPS_KEY) ?? '[]') as Snapshot[]).filter((s) => s && s.data)
  } catch {
    return []
  }
}

function saveSnapshot(data: AppData, reason: string) {
  const list = [{ at: Date.now(), reason, data }, ...listSnapshots()]
  for (let keep = 3; keep >= 1; keep--) {
    try {
      localStorage.setItem(BACKUPS_KEY, JSON.stringify(list.slice(0, keep)))
      return
    } catch {
      /* quota: keep fewer */
    }
  }
}

// ---------- sync ----------

let running: Promise<void> | null = null
let again = false
let channelPing: ((rev: number) => void) | undefined

export function setPingSender(fn: ((rev: number) => void) | undefined) {
  channelPing = fn
}

export function deviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Браузер'
}

function setStatus(status: 'syncing' | 'ok' | 'offline' | 'error', error?: string) {
  useSocial.setState((s) => ({ sync: { status, at: status === 'ok' ? Date.now() : s.sync.at, error } }))
}

/** Pull, merge, push. Coalesces concurrent calls. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

function isDoc(x: unknown): x is SyncDoc {
  return !!x && typeof x === 'object' && (x as SyncDoc).v === 1 && !!(x as SyncDoc).data && Array.isArray((x as SyncDoc).data.quests)
}

async function syncOnce() {
  const acc = useSocial.getState().account
  if (!acc) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline')
    return
  }
  setStatus('syncing')
  try {
    const sb = await getClient()
    if (meta.userId !== acc.id) meta = { ...meta, userId: acc.id, rev: 0, pushedSeq: -1 }

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: row, error } = await sb.from('private_state').select('data, rev').eq('user_id', acc.id).maybeSingle()
      if (error) throw error
      const remote = row && isDoc(row.data) ? (row.data as SyncDoc) : null

      let needPush: boolean
      if (row && row.rev === meta.rev) {
        // nothing new on the server since our last sync: only our own changes matter
        needPush = hasUnpushedChanges()
      } else {
        const local = useStore.getState().data
        const r = mergeDocs(local, meta, remote)
        if (r.localChanged) {
          const firstPull = meta.rev === 0 && !!local.profile
          if (r.overwritten.length || firstPull) saveSnapshot(local, firstPull ? 'Перед первой синхронизацией' : 'Перед слиянием с другим устройством')
          applying = true
          try {
            useStore.setState({ data: r.data })
          } finally {
            applying = false
          }
        }
        meta = { ...meta, ...r.meta }
        needPush = r.remoteChanged || !row
        if (!needPush) {
          meta.rev = row?.rev ?? 0
          meta.pushedSeq = meta.seq
        }
      }

      if (!needPush) break
      // a device that has not finished onboarding never seeds the cloud with empty defaults
      if (!useStore.getState().data.profile) break

      const seqAtPush = meta.seq
      const pruned = pruneTombs(meta, Date.now())
      const doc: SyncDoc = { v: 1, data: useStore.getState().data, stamps: pruned.stamps, tombs: pruned.tombs }
      if (JSON.stringify(doc).length > MAX_DOC) throw new CloudError('too_big', 'Данные слишком большие для синхронизации')

      if (!row) {
        const { error: e } = await sb.from('private_state').insert({ user_id: acc.id, data: doc, rev: 1, device: deviceLabel() })
        if (e) {
          if (e.code === '23505') continue // the other device created it first: pull and merge
          throw e
        }
        meta = { ...meta, rev: 1, pushedSeq: seqAtPush }
      } else {
        const next = row.rev + 1
        const { data: upd, error: e } = await sb
          .from('private_state')
          .update({ data: doc, rev: next, device: deviceLabel() })
          .eq('user_id', acc.id)
          .eq('rev', row.rev)
          .select('rev')
        if (e) throw e
        if (!upd || upd.length === 0) continue // lost the race: pull again and merge
        meta = { ...meta, rev: next, pushedSeq: seqAtPush }
      }
      channelPing?.(meta.rev)
      break
    }
    saveMeta(true)
    setStatus('ok')
    if (hasUnpushedChanges()) schedulePush(1500)
  } catch (e) {
    saveMeta(true)
    const code = errorCode(e)
    if (code === 'schema_missing') useSocial.setState({ schemaMissing: true })
    setStatus(code === 'offline' ? 'offline' : 'error', code)
  }
}

/** After sign-out the next login starts a fresh merge (stamps are kept) */
export function forgetServer() {
  meta = { ...meta, rev: 0, userId: undefined, pushedSeq: -1 }
  saveMeta(true)
  clearTimeout(pushTimer)
}
