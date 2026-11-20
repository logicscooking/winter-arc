import { create } from 'zustand'
import type { DayKey } from '../engine'

export type Overlay =
  | { kind: 'slip' }
  | { kind: 'comeback'; slipId: string }
  | { kind: 'craving' }
  | { kind: 'checkin'; day: DayKey }
  | { kind: 'confession'; day: DayKey }
  | null

interface Ui {
  overlay: Overlay
  open: (o: Overlay) => void
  close: () => void
  toast?: string
  say: (t: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<Ui>((set) => ({
  overlay: null,
  open: (overlay) => set({ overlay }),
  close: () => set({ overlay: null }),
  say: (toast) => {
    set({ toast })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: undefined }), 2600)
  },
}))
