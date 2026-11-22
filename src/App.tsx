import { useEffect, useRef } from 'react'
import { gameDayOf, replayStartOf, unacknowledgedMissed } from './engine'
import type { ThemePref } from './engine'
import { useStore } from './store/store'
import { useGame, useNow, useRoute } from './store/hooks'
import { useUi } from './store/ui'
import { ConfirmSheet, Floaters, Toast } from './components/ui'
import { Party, Snow, TopGarland } from './components/festive'
import { Today } from './screens/Today'
import { Deal } from './screens/Deal'
import { SkillScreen } from './screens/Skill'
import { SkillNew } from './screens/SkillNew'
import { Flow } from './screens/Flow'
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
import { RouteTopBar } from './components/TopBar'
import { FlowPill } from './components/skills'
import { useSocial } from './cloud/state'
import { bootCloud } from './cloud/boot'
import { MissedDays } from './flows/MissedDays'
import { RewardPop } from './components/RewardPop'
import { Px } from './pixel/Pixel'
import type { SpriteName } from './pixel/sprites'
import { AvatarScreen } from './screens/Avatar'
import { Destiny } from './screens/Destiny'
import { PlanDay } from './screens/PlanDay'
import { Morning } from './screens/Morning'
import { SlipFlow, ComebackFlow } from './flows/Slip'
import { CravingFlow } from './flows/Craving'
import { CheckinSheet } from './flows/Checkin'
import { ConfessionSheet } from './flows/Confession'

const NAV: { path: string; label: string; icon: SpriteName; tab: boolean }[] = [
  { path: '/today', label: 'Сегодня', icon: 'quests', tab: true },
  { path: '/deal', label: 'Путь', icon: 'fir', tab: true },
  { path: '/party', label: 'Пати', icon: 'campfire', tab: true },
  { path: '/hero', label: 'Персонаж', icon: 'hero', tab: true },
  // 5 tabs max on the phone: the rest opens from «Сегодня» (Судьба, План, ❄ → Магазин) and from «Ещё»
  { path: '/destiny', label: 'Судьба дня', icon: 'plinko', tab: false },
  { path: '/plan', label: 'План дня', icon: 'dial', tab: false },
  { path: '/shop', label: 'Магазин', icon: 'shard', tab: false },
  { path: '/charts', label: 'Графики', icon: 'star', tab: false },
  { path: '/more', label: 'Ещё', icon: 'chest', tab: true },
]
/** sub-screens that light up a tab */
const TAB_OF: Record<string, string> = { '/morning': '/today', '/avatar': '/hero', '/charts': '/more', '/skill': '/deal', '/skill-new': '/deal', '/flow': '/deal', '/duels': '/party', '/money': '/party' }

/** the theme's top bar color as #rrggbb: the tokens are color-mix()es, so let the browser resolve them */
function barColor() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;background:var(--bar-bg)'
  document.body.appendChild(probe)
  const css = getComputedStyle(probe).backgroundColor
  probe.remove()
  const c = document.createElement('canvas').getContext('2d')
  if (!c) return '#0f1d17'
  c.fillStyle = css
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * «Ночь» by default, «Снег» by choice or by the system in «auto», plus five winter themes.
 * The status bar: the home-screen app runs with status-bar-style black-translucent (index.html), so iOS
 * draws the clock over the page itself and the top bar (padded by safe-area-inset-top) paints under it —
 * it follows the theme instantly, «auto» included. theme-color is kept in sync for Safari tabs and Android.
 */
function useTheme(pref: ThemePref) {
  useEffect(() => {
    const root = document.documentElement
    if (pref === 'auto') delete root.dataset.theme
    else root.dataset.theme = pref
    const apply = () => {
      const color = barColor()
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color))
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

  // snow and the top garland live outside the router: the same nodes on every screen, never remounted
  const missed = data.profile ? unacknowledgedMissed(game, data.ack.missedThrough) : []
  const shell = top !== 'pause' && !!data.profile && missed.length === 0
  return (
    <>
      <Snow />
      <TopGarland hidden={!shell} />
      <div className="status-shade" aria-hidden />
      {top === 'pause' ? <Pause app={route.query.get('app') ?? 'instagram'} /> : !data.profile ? <Onboarding /> : missed.length > 0 ? <MissedDays days={missed} /> : <Shell top={top} />}
    </>
  )
}

/** the tabbed app: sidebar / tab bar, the routed screen under its top bar, overlays */
function Shell({ top }: { top: string }) {
  const route = useRoute()
  const nudgeCount = useSocial((s) => s.nudges.length)
  const data = useStore((s) => s.data)
  const profile = data.profile!

  // duels and money live inside «Пати» now: old links land in the right section
  useEffect(() => {
    if (top === 'duels' || top === 'money') location.replace(`#/party?tab=${top}`)
  }, [top])

  let screen
  switch (top) {
    case 'deal':
      screen = <Deal />
      break
    case 'skill':
      screen = <SkillScreen id={route.parts[1] ?? ''} tab={route.query.get('tab') ?? undefined} />
      break
    case 'skill-new':
      screen = <SkillNew importMode={route.query.get('import') === '1'} />
      break
    case 'flow':
      screen = <Flow />
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
      screen = <WeekReview param={route.parts[1]} />
      break
    case 'finale':
      screen = <Finale />
      break
    case 'party':
    case 'duels':
    case 'money':
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
    case 'morning':
      screen = <Morning />
      break
    default:
      screen = <Today />
  }

  const current = `/${top}`
  const currentTab = TAB_OF[current] ?? current
  return (
    <div className={`app${top === 'morning' ? ' focus' : ''}`}>
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
          {profile.nick}
        </a>
      </nav>
      <main className="page">
        <RouteTopBar top={top} sub={route.parts[1]} query={route.query} />
        {/* the running flow stays in sight everywhere; «Навык» draws its own top bar and the pill under it */}
        {!['flow', 'morning', 'skill', 'review'].includes(top) && <FlowPill />}
        {screen}
      </main>
      <nav className="tabbar" aria-label="Разделы">
        {NAV.filter((n) => n.tab).map((n) => (
          <a key={n.path} href={`#${n.path}`} className="tab" aria-current={currentTab === n.path ? 'page' : undefined} onClick={() => current === n.path && window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Px name={n.icon} size={28} />
            <span className="tab-label">{n.label}</span>
            {n.path === '/party' && nudgeCount > 0 && <span className="badge" aria-label={`${nudgeCount} новых`}>{nudgeCount}</span>}
          </a>
        ))}
      </nav>
      <NudgeBanner hidden={top === 'party'} />
      <Overlays />
      <ConfirmSheet />
      <Floaters />
      <RewardPop />
      <Party />
      <Toast />
    </div>
  )
}

