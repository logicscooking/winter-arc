import { useEffect, useRef } from 'react'
import { ChartLine, Ellipsis, Hammer, ShoppingBag, Sunrise, UserRound, type LucideIcon } from 'lucide-react'
import { ARC_START, gameDayOf, unacknowledgedMissed } from './engine'
import { useStore } from './store/store'
import { useGame, useNow, useRoute } from './store/hooks'
import { useUi } from './store/ui'
import { Floaters } from './components/ui'
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

const NAV: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/today', label: 'Сегодня', icon: Sunrise },
  { path: '/deal', label: 'Дело', icon: Hammer },
  { path: '/hero', label: 'Персонаж', icon: UserRound },
  { path: '/charts', label: 'Графики', icon: ChartLine },
  { path: '/shop', label: 'Магазин', icon: ShoppingBag },
  { path: '/more', label: 'Ещё', icon: Ellipsis },
]

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

function Toast() {
  const t = useUi((s) => s.toast)
  return t ? <div className="toast" role="status">{t}</div> : null
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

  // freeze closed days and carry over tasks (skipped while time-travelling in debug)
  const offset = data.settings.debugOffsetDays
  useEffect(() => {
    if (!offset) finalize(now)
  }, [finalize, now, offset])

  // morning check-in: first open of the day before 12:00
  useEffect(() => {
    if (!data.profile || today < ARC_START || (route.parts[0] ?? 'today') !== 'today') return
    if (now.getHours() >= 12 || now.getHours() < 4) return
    if (data.days[today]?.checkin || data.ack.checkinSkipped === today) return
    if (autoOpened.current === today) return
    autoOpened.current = today
    open({ kind: 'checkin', day: today })
  }, [data.profile, data.days, data.ack.checkinSkipped, today, now, open, route.parts])

  const top = route.parts[0] ?? 'today'

  if (top === 'pause') return <Pause app={route.query.get('app') ?? 'instagram'} />
  if (!data.profile) return <Onboarding />

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
        <div className="brand">Winter Arc</div>
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
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className="tab" aria-current={current === n.path ? 'page' : undefined} onClick={() => current === n.path && window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <n.icon aria-hidden />
            {n.label}
          </a>
        ))}
      </nav>
      <Overlays />
      <Floaters />
      <Toast />
    </div>
  )
}

