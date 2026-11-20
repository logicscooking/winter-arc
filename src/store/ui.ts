import { create } from 'zustand'
import type { DayKey } from '../engine'

export type Overlay =
  | { kind: 'slip' }
  | { kind: 'comeback'; slipId: string }
  | { kind: 'craving' }
  | { kind: 'checkin'; day: DayKey }
  | { kind: 'confession'; day: DayKey }
  | null

export interface Toast {
  id: number
  text: string
  /** «Отменить» — shown for check-offs and purchases */
  undo?: () => void
}

export interface Ask {
  title: string
  body?: string
  ok: string
  danger?: boolean
  resolve: (v: boolean) => void
}

interface Ui {
  overlay: Overlay
  open: (o: Overlay) => void
  close: () => void
  toast?: Toast
  say: (t: string, undo?: () => void) => void
  hideToast: () => void
  ask?: Ask
  confirm: (a: Omit<Ask, 'resolve'>) => Promise<boolean>
  answer: (v: boolean) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastId = 0

export const useUi = create<Ui>((set, get) => ({
  overlay: null,
  open: (overlay) => set({ overlay }),
  close: () => set({ overlay: null }),
  say: (text, undo) => {
    const id = ++toastId
    set({ toast: { id, text, undo } })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => get().toast?.id === id && set({ toast: undefined }), undo ? 5000 : 2600)
  },
  hideToast: () => set({ toast: undefined }),
  confirm: (a) =>
    new Promise<boolean>((resolve) => {
      get().ask?.resolve(false)
      set({ ask: { ...a, resolve } })
    }),
  answer: (v) => {
    get().ask?.resolve(v)
    set({ ask: undefined })
  },
}))
