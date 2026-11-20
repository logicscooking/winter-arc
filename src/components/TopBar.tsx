import type { ReactNode } from 'react'
import { Px } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'
import { useGame } from '../store/hooks'

/** A pixel icon button in the top bar: a link or an action, with an optional number pill */
export function BarBtn({ icon, label, href, onClick, badge }: { icon: SpriteName; label: string; href?: string; onClick?: () => void; badge?: ReactNode }) {
  const inner = (
    <>
      <Px name={icon} size={30} />
      {badge !== undefined && <span className="bar-pill num">{badge}</span>}
    </>
  )
  const cls = `bar-btn${badge !== undefined ? ' has-pill' : ''}`
  if (href)
    return (
      <a className={cls} href={href} aria-label={label} onClick={onClick}>
        {inner}
      </a>
    )
  return (
    <button className={cls} type="button" aria-label={label} onClick={onClick}>
      {inner}
    </button>
  )
}

/** «Назад»: a fixed parent when known, the browser history otherwise */
export function BackBtn({ href, onBack }: { href?: string; onBack?: () => void }) {
  if (href) return <BarBtn icon="back" label="Назад" href={href} onClick={onBack} />
  return (
    <BarBtn
      icon="back"
      label="Назад"
      onClick={() => {
        onBack?.()
        if (window.history.length > 1) window.history.back()
        else location.hash = '#/today'
      }}
    />
  )
}

/** The sticky island on top of every screen: title in the middle, pixel actions on the sides */
export function TopBar({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-side end">{right}</div>
    </header>
  )
}

const MORE_TITLES: Record<string, string> = {
  quests: 'Квесты',
  measurements: 'Замеры',
  triggers: 'Триггеры',
  reviews: 'Обзоры недель',
  books: 'Книги',
  pause: 'Пауза',
  backup: 'Бэкап',
  debug: 'Отладка',
  account: 'Аккаунт',
}

/** The top bar for a route; screens that need their own (week review) render it themselves */
export function RouteTopBar({ top, sub, query }: { top: string; sub?: string; query: URLSearchParams }) {
  const game = useGame()
  const shop = <BarBtn icon="gift" label={`Магазин наград, осколков: ${game.shards}`} href="#/shop" badge={game.shards} />
  switch (top) {
    case 'deal':
      return <TopBar title="Путь" left={<BarBtn icon="play" label="Поток: таймер глубокой работы" href="#/flow" />} right={<BarBtn icon="dial" label="План дня" href="#/plan" />} />
    case 'party':
      return <TopBar title="Пати" left={shop} right={<BarBtn icon="hero" label="Персонаж" href="#/hero" />} />
    case 'hero':
      return <TopBar title="Персонаж" left={shop} right={<BarBtn icon="hero" label="Образ и снаряжение" href="#/avatar" />} />
    case 'more':
      if (sub) return <TopBar title={MORE_TITLES[sub] ?? 'Ещё'} left={<BackBtn href="#/more" />} />
      return <TopBar title="Ещё" left={<BarBtn icon="star" label="Графики" href="#/charts" />} right={<BarBtn icon="book" label="Книги" href="#/more/books" />} />
    case 'skill-new':
      return <TopBar title={query.get('import') === '1' ? 'Импорт навыка' : 'Новый навык'} left={<BackBtn href="#/deal" />} />
    case 'flow':
      return <TopBar title="Поток" left={<BackBtn href="#/deal" />} />
    case 'charts':
      return <TopBar title="Графики" left={<BackBtn href="#/more" />} />
    case 'shop':
      return <TopBar title="Магазин" left={<BackBtn />} right={<BarBtn icon="hero" label="Образ" href="#/avatar" />} />
    case 'avatar':
      return <TopBar title="Образ" left={<BackBtn href="#/hero" />} right={shop} />
    case 'destiny':
      return <TopBar title="Судьба дня" left={<BackBtn href="#/today" />} right={shop} />
    case 'plan':
      return <TopBar title="План дня" left={<BackBtn href="#/today" />} right={<BarBtn icon="dice" label="Судьба дня" href="#/destiny" />} />
    case 'finale':
      return <TopBar title="Финал арки" left={<BackBtn href="#/today" />} />
    case 'skill':
    case 'review':
      return null
    default:
      return (
        <TopBar
          title="Сегодня"
          left={shop}
          right={
            <>
              <BarBtn icon="dice" label="Судьба дня" href="#/destiny" />
              <BarBtn icon="menu" label="План дня" href="#/plan" />
            </>
          }
        />
      )
  }
}
