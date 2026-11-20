import { useEffect, useRef } from 'react'
import { ChartLine, Ellipsis, Hammer, ShoppingBag, Snowflake, Sunrise, UserRound, type LucideIcon } from 'lucide-react'
import { gameDayOf, replayStartOf, unacknowledgedMissed } from './engine'
import { useStore } from './store/store'
import { useGame, useNow, useRoute } from './store/hooks'
import { useUi } from './store/ui'
import { ConfirmSheet, Floaters, Toast } from './components/ui'
import { Party, Snow } from './components/festive'
import { Today } from './screens/Today'
import { Deal } from './screens/Deal'
import { Hero } from './screens/Hero'
import { Charts } from './screens/Charts'
import { Shop } from './screens/Shop'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'
import { Pause } from './screens/Pause'
import { WeekReview } from './screens/WeekReview'
import { Finale } from './screens/Finale'
import { MissedDays } from './flows/MissedDays'
import { SlipFlow, ComebackFlow } from './flows/Slip'
import { CravingFlow } from './flows/Craving'
import { CheckinSheet } from './flows/Checkin'
import { ConfessionSheet } from './flows/Confession'

const NAV: { path: string; label: string; icon: LucideIcon; tab: boolean }[] = [
  { path: '/today', label: 'Сегодня', icon: Sunrise, tab: true },
  { path: '/deal', label: 'Дело', icon: Hammer, tab: true },
  { path: '/charts', label: 'Графики', icon: ChartLine, tab: true },
  { path: '/hero', label: 'Персонаж', icon: UserRound, tab: true },
  // on the phone the shop opens from the ❄ counter, «Персонаж» and «Ещё»: 5 tabs max
  { path: '/shop', label: 'Магазин', icon: ShoppingBag, tab: false },
  { path: '/more', label: 'Ещё', icon: Ellipsis, tab: true },
]

/** light by default, follows the system, manual override in «Ещё» */
function useTheme(pref: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement
    if (pref === 'auto') delete root.dataset.theme
    else root.dataset.theme = pref
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0a1513' : '#f3f6f3'))
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
}

function Overlays() {
  const overlay = useUi((s) => s.overlay)
  if (!overlay) return null
  switch (overlay.kind) {
    case 'slip':
      return <SlipFlow />
    case 'comeback':
      return <ComebackFlow slipId={overlay.slipId} />
    case 'craving':
      return <CravingFlow />
    case 'checkin':
      return <CheckinSheet day={overlay.day} />
    case 'confession':
      return <ConfessionSheet day={overlay.day} />
  }
}

export default function App() {
  const route = useRoute()
  const data = useStore((s) => s.data)
  const finalize = useStore((s) => s.finalize)
  const now = useNow()
  const game = useGame()
  const today = gameDayOf(now)
  const open = useUi((s) => s.open)
  const autoOpened = useRef<string>('')
  useTheme(data.settings.theme ?? 'auto')

  // freeze closed days and carry over tasks (skipped while time-travelling in debug)
  const offset = data.settings.debugOffsetDays
  useEffect(() => {
    if (!offset) finalize(now)
  }, [finalize, now, offset])

  // morning check-in: first open of the day before 12:00
  useEffect(() => {
    if (!data.profile || today < replayStartOf(data) || (route.parts[0] ?? 'today') !== 'today') return
    if (now.getHours() >= 12 || now.getHours() < 4) return
    if (data.days[today]?.checkin || data.ack.checkinSkipped === today) return
    if (autoOpened.current === today) return
    autoOpened.current = today
    open({ kind: 'checkin', day: today })
  }, [data.profile, data.days, data.ack.checkinSkipped, today, now, open, route.parts])

  const top = route.parts[0] ?? 'today'

  if (top === 'pause') return <Pause app={route.query.get('app') ?? 'instagram'} />
  if (!data.profile)
    return (
      <>
        <Snow />
        <Onboarding />
      </>
    )

  const missed = unacknowledgedMissed(game, data.ack.missedThrough)
  if (missed.length > 0) return <MissedDays days={missed} />

  let screen
  switch (top) {
    case 'deal':
      screen = <Deal />
      break
    case 'hero':
      screen = <Hero />
      break
    case 'charts':
      screen = <Charts />
      break
    case 'shop':
      screen = <Shop />
      break
    case 'more':
      screen = <More sub={route.parts[1]} />
      break
    case 'review':
      screen = <WeekReview week={Number(route.parts[1])} />
      break
    case 'finale':
      screen = <Finale />
      break
    default:
      screen = <Today />
  }

  const current = `/${top}`
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Разделы">
        <div className="brand">
          <Snowflake size={20} color="var(--gold-bright)" aria-hidden /> Winter Arc
        </div>
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className="side-link" aria-current={current === n.path ? 'page' : undefined}>
            <n.icon aria-hidden />
            {n.label}
          </a>
        ))}
        <div className="grow" />
        <div className="muted tiny" style={{ padding: '0 12px' }}>
          {data.profile.avatar} {data.profile.nick}
        </div>
      </nav>
      <main className="page">{screen}</main>
      <nav className="tabbar" aria-label="Разделы">
        {NAV.filter((n) => n.tab).map((n) => (
          <a key={n.path} href={`#${n.path}`} className="tab" aria-current={current === n.path ? 'page' : undefined} onClick={() => current === n.path && window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <n.icon aria-hidden />
            {n.label}
          </a>
        ))}
      </nav>
      <Snow />
      <Overlays />
      <ConfirmSheet />
      <Floaters />
      <Party />
      <Toast />
    </div>
  )
}

