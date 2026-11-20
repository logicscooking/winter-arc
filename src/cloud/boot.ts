/**
 * Wires the optional cloud into the app: change tracking always; sync, stats, feed and realtime
 * only while signed in. Nothing here blocks the local app.
 */
import { haptic } from '../store/hooks'
import { cloudConfigured, hasStoredSession } from './client'
import { useSocial } from './state'
import type { Nudge } from './state'
import { loadNudges, onNudge, postFeedEvents, pushStats, refreshParties, refreshParty, resubscribe, scheduleStats, schedulePosting, subscribeMe } from './party'
import { onLocalChange, setPingSender, startChangeTracking, syncNow } from './sync'

let booted = false
let services = false
let poll: ReturnType<typeof setInterval> | undefined

const nudgeHandlers = new Set<(n: Nudge) => void>()
export function onIncomingNudge(fn: (n: Nudge) => void) {
  nudgeHandlers.add(fn)
  return () => void nudgeHandlers.delete(fn)
}

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined)

function onFocus() {
  if (!useSocial.getState().account) return
  quiet(syncNow())
  scheduleStats(800)
  quiet(refreshParty())
  quiet(loadNudges())
}

export function bootCloud() {
  if (booted) return
  booted = true
  startChangeTracking()
  if (!cloudConfigured) return
  onLocalChange(() => {
    if (!useSocial.getState().account) return
    scheduleStats()
    schedulePosting()
  })
  onNudge((n) => {
    haptic([20, 40, 20])
    nudgeHandlers.forEach((h) => h(n))
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && onFocus())
  window.addEventListener('online', onFocus)
  if (hasStoredSession()) {
    void import('./auth').then((m) => m.resumeSession()).catch(() => undefined)
  } else if (useSocial.getState().account) {
    // session gone (signed out elsewhere, storage cleared): drop the cached account
    useSocial.getState().reset()
  }
}

/** Called after sign-in / session restore */
export async function startServices() {
  if (!services) {
    services = true
    clearInterval(poll)
    // slow fallback in case realtime is not reachable
    poll = setInterval(() => document.visibilityState === 'visible' && useSocial.getState().account && quiet(syncNow()), 120_000)
  }
  quiet(syncNow())
  try {
    const ping = await subscribeMe(() => quiet(syncNow()))
    setPingSender(ping)
  } catch {
    /* realtime unavailable: polling covers sync */
  }
  try {
    const parties = await refreshParties()
    await Promise.all([parties.length ? refreshParty() : Promise.resolve(), loadNudges()])
    await resubscribe()
    await pushStats(true)
    await postFeedEvents()
  } catch {
    /* offline or schema missing: cached data stays, flags are set by the callers */
  }
}

export function stopServices() {
  services = false
  clearInterval(poll)
  setPingSender(undefined)
}
