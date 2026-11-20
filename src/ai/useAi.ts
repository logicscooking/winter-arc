import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { aiErrorText, runTask } from './client'
import type { AiDeps } from './client'
import type { AiTask } from './prompts'

/** Real dependencies: the switch and the counter live in settings (the counter stays on this device) */
export const appDeps = (): AiDeps => ({
  fetch: (...a) => window.fetch(...a),
  now: () => Date.now(),
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  getUse: () => useStore.getState().data.settings.aiUse,
  setUse: (u) => useStore.getState().setSettings({ aiUse: u }),
  enabled: () => !!useStore.getState().data.settings.ai?.on,
  // dev only: vite proxies this path to Pollinations without the localhost Origin
  ...(import.meta.env.DEV ? { url: `${import.meta.env.BASE_URL}__ai/openai` } : {}),
})

export const useAiOn = () => useStore((s) => !!s.data.settings.ai?.on)

export type AiState<T> = { phase: 'idle' } | { phase: 'loading'; since: number } | { phase: 'error'; text: string } | { phase: 'done'; value: T; ms: number }

/** One AI action on a screen: run → «ИИ думает…» → preview or a readable error */
export function useAi<T>() {
  const [st, setSt] = useState<AiState<T>>({ phase: 'idle' })
  const ctrl = useRef<AbortController | null>(null)
  // no abort on unmount: StrictMode remounts in dev, and a late answer for a closed block is simply dropped by React
  const run = useCallback(async (task: AiTask<T>) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setSt({ phase: 'loading', since: Date.now() })
    try {
      const r = await runTask(task, appDeps(), c.signal)
      if (c.signal.aborted) return
      console.info(`[ai] ${task.kind}: ${r.ms} ms, attempts ${r.attempts}`)
      setSt({ phase: 'done', value: r.value, ms: r.ms })
    } catch (e) {
      if (c.signal.aborted && ctrl.current !== c) return
      console.info(`[ai] ${task.kind}: ${(e as { code?: string }).code ?? e}`)
      setSt({ phase: 'error', text: aiErrorText(e) })
    }
  }, [])
  const reset = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    setSt({ phase: 'idle' })
  }, [])
  return { st, run, reset }
}
