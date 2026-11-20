import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { computeState, gameDayOf, shiftNow } from '../engine'
import type { GameState } from '../engine'
import { useStore } from './store'

// ---------- clock (with debug offset) ----------

let tick = Date.now()
const listeners = new Set<() => void>()
function emit() {
  tick = Date.now()
  listeners.forEach((l) => l())
}
if (typeof window !== 'undefined') {
  setInterval(emit, 20_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && emit())
}
export const refreshClock = emit

export function useNow(): Date {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => tick,
  )
  const offset = useStore((s) => s.data.settings.debugOffsetDays)
  return useMemo(() => shiftNow(new Date(t), offset), [t, offset])
}

export function nowWithOffset(): Date {
  return shiftNow(new Date(), useStore.getState().data.settings.debugOffsetDays)
}

export function useToday() {
  return gameDayOf(useNow())
}

export function useGame(): GameState {
  const data = useStore((s) => s.data)
  const now = useNow()
  const minute = Math.floor(now.getTime() / 60000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeState(data, now), [data, minute])
}

// ---------- floating rewards + haptics ----------

export interface Floater {
  id: number
  x: number
  y: number
  text: string
  tone: 'xp' | 'hp' | 'ice' | 'bad'
}

export interface Celebration {
  id: number
  title: string
  text?: string
  kind: 'perfect' | 'boss'
}

interface FxStore {
  items: Floater[]
  push: (f: Omit<Floater, 'id'>) => void
  party?: Celebration
  celebrate: (c: Omit<Celebration, 'id'>) => void
}

let fxId = 0
export const useFx = create<FxStore>((set, get) => ({
  items: [],
  push: (f) => {
    const id = ++fxId
    set((s) => ({ items: [...s.items, { ...f, id }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 1300)
  },
  celebrate: (c) => {
    const id = ++fxId
    set({ party: { ...c, id } })
    haptic([20, 50, 20, 50, 40])
    setTimeout(() => get().party?.id === id && set({ party: undefined }), 3200)
  },
}))

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

export function reward(el: Element | null | { x: number; y: number }, parts: { xp?: number; shards?: number; hp?: number }) {
  let x = window.innerWidth / 2
  let y = window.innerHeight / 2
  if (el && 'getBoundingClientRect' in el) {
    const r = el.getBoundingClientRect()
    x = r.left + r.width / 2
    y = r.top
  } else if (el) {
    x = el.x
    y = el.y
  }
  const push = useFx.getState().push
  let dy = 0
  if (parts.xp) push({ x, y: y - dy, text: `+${parts.xp} XP`, tone: 'xp' }), (dy += 26)
  if (parts.shards) push({ x: x + 14, y: y - dy, text: `${parts.shards > 0 ? '+' : ''}${parts.shards} ❄`, tone: 'ice' }), (dy += 26)
  if (parts.hp) push({ x: x - 10, y: y - dy, text: `${parts.hp > 0 ? '+' : ''}${parts.hp} HP`, tone: parts.hp > 0 ? 'hp' : 'bad' })
  haptic(parts.hp && parts.hp < 0 ? [30, 40, 30] : 12)
}

// ---------- hash router ----------

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [p, q] = raw.split('?')
  const path = p.startsWith('/') ? p : `/${p}`
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') }
}

export function useRoute(): Route {
  const [r, setR] = useState(parseHash)
  useEffect(() => {
    const on = () => setR(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export function go(path: string) {
  window.location.hash = path
}
