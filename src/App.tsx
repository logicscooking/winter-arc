import { useEffect, useRef } from 'react'
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
import { Party as PartyScreen } from './screens/Party'
import { NudgeBanner } from './components/NudgeBanner'
import { useSocial } from './cloud/state'
import { bootCloud } from './cloud/boot'
import { MissedDays } from './flows/MissedDays'
import { RewardPop } from './components/RewardPop'
import { Px } from './pixel/Pixel'
import type { SpriteName } from './pixel/sprites'
import { AvatarScreen } from './screens/Avatar'
import { Destiny } from './screens/Destiny'
import { PlanDay } from './screens/PlanDay'
import { SlipFlow, ComebackFlow } from './flows/Slip'
import { CravingFlow } from './flows/Craving'
import { CheckinSheet } from './flows/Checkin'
import { ConfessionSheet } from './flows/Confession'

const NAV: { path: string; label: string; icon: SpriteName; tab: boolean }[] = [
  { path: '/today', label: 'Сегодня', icon: 'quests', tab: true },
  { path: '/deal', label: 'Дело', icon: 'hammer', tab: true },
  { path: '/party', label: 'Пати', icon: 'campfire', tab: true },
  { path: '/hero', label: 'Персонаж', icon: 'hero', tab: true },
  // 5 tabs max on the phone: the rest opens from «Сегодня» (Судьба, План, ❄ → Магазин) and from «Ещё»
  { path: '/destiny', label: 'Судьба дня', icon: 'dice', tab: false },
  { path: '/plan', label: 'План дня', icon: 'dial', tab: false },
  { path: '/shop', label: 'Магазин', icon: 'shard', tab: false },
  { path: '/charts', label: 'Графики', icon: 'star', tab: false },
  { path: '/more', label: 'Ещё', icon: 'chest', tab: true },
]
/** sub-screens that light up a tab */
const TAB_OF: Record<string, string> = { '/avatar': '/hero', '/charts': '/more' }

/** «Полярная ночь» by default, «Снежный крем» by choice or by the system in «auto» */
function useTheme(pref: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement
    if (pref === 'auto') delete root.dataset.theme
    else root.dataset.theme = pref
    const apply = () => {
      const light = pref === 'light' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', light ? '#f0e8dd' : '#0f1d17'))
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
  useEffect(() => bootCloud(), [])
  const route = useRoute()
  const nudgeCount = useSocial((s) => s.nudges.length)
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
    case 'party':
      screen = <PartyScreen />
      break
    case 'avatar':
      screen = <AvatarScreen />
      break
    case 'destiny':
      screen = <Destiny />
      break
    case 'plan':
      screen = <PlanDay />
      break
    default:
      screen = <Today />
  }

  const current = `/${top}`
  const currentTab = TAB_OF[current] ?? current
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Разделы">
        <div className="brand">
          <Px name="wolf" size={32} /> Winter Arc
        </div>
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className="side-link" aria-current={currentTab === n.path ? 'page' : undefined}>
            <Px name={n.icon} size={26} />
            {n.label}
            {n.path === '/party' && nudgeCount > 0 && <span className="badge" aria-label={`${nudgeCount} новых`}>{nudgeCount}</span>}
          </a>
        ))}
        <div className="grow" />
        <a href="#/hero" className="muted tiny" style={{ padding: '0 12px', textDecoration: 'none', fontWeight: 800 }}>
          {data.profile.nick}
        </a>
      </nav>
      <main className="page">{screen}</main>
      <nav className="tabbar" aria-label="Разделы">
        {NAV.filter((n) => n.tab).map((n) => (
          <a key={n.path} href={`#${n.path}`} className="tab" aria-current={currentTab === n.path ? 'page' : undefined} onClick={() => current === n.path && window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Px name={n.icon} size={26} />
            {n.label}
            {n.path === '/party' && nudgeCount > 0 && <span className="badge" aria-label={`${nudgeCount} новых`}>{nudgeCount}</span>}
          </a>
        ))}
      </nav>
      <NudgeBanner hidden={top === 'party'} />
      <Snow />
      <Overlays />
      <ConfirmSheet />
      <Floaters />
      <RewardPop />
      <Party />
      <Toast />
    </div>
  )
}

