import { useRef, useState, type ReactNode } from 'react'
import { BookOpen, Bug, ChartLine, Download, Hand, ListChecks, Ruler, ScrollText, Activity, ChevronRight } from 'lucide-react'
import { Px } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'
import { AccountEntry, AccountPage } from './Account'
import {
  CHAPTERS,
  FINAL_MEASURE_FROM,
  STATS,
  TRIGGERS_MIN,
  WHAT_LABEL,
  WHY_LABEL,
  analyzeTriggers,
  booksFinishedInArc,
  bossOf,
  diffDays,
  formatDayRu,
  formatDayShort,
  gameDayOf,
  RU_WEEKDAYS,
  ARC_START,
} from '../engine'
import type { Quest, Role, StatId, ThemePref } from '../engine'
import { useStore } from '../store/store'
import { refreshClock, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { MeasurementsForm } from '../components/MeasurementsForm'
import { Field } from '../components/ui'
import { AiSettings } from '../components/ai'
import { setTopGarlandPref, useTopGarlandPref } from '../components/festive'

/** game screens first, with their pixel icons */
const GAME: { title: string; hint: string; icon: SpriteName; href: string }[] = [
  { title: 'Магазин', hint: 'Дофамин, свои награды, снаряжение за ❄', icon: 'shard', href: '#/shop' },
  { title: 'Судьба дня', hint: 'Шар Плинко выберет дело и запустит таймер', icon: 'plinko', href: '#/destiny' },
  { title: 'План дня', hint: 'Кольцо суток: квесты по часам', icon: 'dial', href: '#/plan' },
  { title: 'Образ', hint: 'Шапки, шарфы, пуховики, очки', icon: 'hero', href: '#/avatar' },
]

const PAGES: { id: string; title: string; hint: string; icon: typeof ListChecks; href?: string }[] = [
  { id: 'charts', title: 'Графики', hint: 'Подъём, сон, рилсы, страницы, HP', icon: ChartLine, href: '#/charts' },
  { id: 'quests', title: 'Квесты', hint: 'Редактор, роли по главам, мини-версии', icon: ListChecks },
  { id: 'measurements', title: 'Замеры', hint: 'Старт и финал', icon: Ruler },
  { id: 'triggers', title: 'Триггеры', hint: 'Когда и почему срываешься', icon: Activity },
  { id: 'reviews', title: 'Обзоры недель', hint: 'Бои с боссами и ответы', icon: ScrollText },
  { id: 'books', title: 'Книги', hint: 'Текущая книга и прочитанные', icon: BookOpen },
  { id: 'pause', title: 'Пауза перед рилсами', hint: 'Как настроить в «Командах»', icon: Hand },
  { id: 'backup', title: 'Бэкап', hint: 'Экспорт и импорт JSON', icon: Download },
  { id: 'debug', title: 'Отладка', hint: 'Сдвиг даты «сегодня»', icon: Bug },
]

/** the title lives in the top bar; `title` stays for the accessible region name */
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack-lg" aria-label={title}>
      {children}
    </section>
  )
}

export function More({ sub }: { sub?: string }) {
  switch (sub) {
    case 'quests':
      return <QuestsEditor />
    case 'measurements':
      return <MeasurementsPage />
    case 'triggers':
      return <TriggersPage />
    case 'reviews':
      return <ReviewsPage />
    case 'books':
      return <BooksPage />
    case 'pause':
      return <PauseHelp />
    case 'backup':
      return <Backup />
    case 'debug':
      return <Debug />
    case 'account':
      return <AccountPage />
  }
  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        {GAME.map((p) => (
          <a key={p.href} className="list-btn" href={p.href}>
            <Px name={p.icon} size={30} />
            <span className="grow">
              {p.title}
              <small>{p.hint}</small>
            </span>
            <ChevronRight size={18} color="var(--mist)" aria-hidden />
          </a>
        ))}
      </div>
      <AccountEntry />
      <Appearance />
      <AiSettings />
      <div className="stack" style={{ gap: 8 }}>
        {PAGES.map((p) => (
          <a key={p.id} className="list-btn" href={p.href ?? `#/more/${p.id}`}>
            <p.icon aria-hidden />
            <span className="grow">
              {p.title}
              <small>{p.hint}</small>
            </span>
            <ChevronRight size={18} color="var(--mist)" aria-hidden />
          </a>
        ))}
      </div>
    </div>
  )
}

// ---------- appearance ----------

const THEMES: { id: ThemePref; label: string; hint: string }[] = [
  { id: 'dark', label: 'Ночь', hint: 'хвойная тьма' },
  { id: 'light', label: 'Снег', hint: 'дневной крем' },
  { id: 'auto', label: 'Авто', hint: 'как в системе' },
  { id: 'polar', label: 'Полярная ночь', hint: 'глубокий синий' },
  { id: 'aurora', label: 'Северное сияние', hint: 'бирюза и фиолет' },
  { id: 'fir', label: 'Ёлочная', hint: 'ель, красный, золото' },
]

/** A tiny live sample of a theme: its own tokens are scoped to the tile via data-tp */
function ThemeSample({ id }: { id: ThemePref }) {
  if (id === 'auto')
    return (
      <span className="theme-sample split" aria-hidden>
        <span data-tp="dark" className="half">
          <i className="s-card" />
        </span>
        <span data-tp="light" className="half">
          <i className="s-card" />
        </span>
      </span>
    )
  return (
    <span className="theme-sample" data-tp={id} aria-hidden>
      <i className="s-card">
        <b className="s-line" />
        <b className="s-line short" />
      </i>
      <span className="s-dots">
        <i className="s-pine" />
        <i className="s-gold" />
        <i className="s-hp" />
        <i className="s-frost" />
      </span>
    </span>
  )
}

function Appearance() {
  const settings = useStore((s) => s.data.settings)
  const setSettings = useStore((s) => s.setSettings)
  const theme = settings.theme ?? 'auto'
  const snow = settings.snow ?? true
  const garland = useTopGarlandPref()
  return (
    <section className="panel stack" aria-label="Оформление">
      <h3>Оформление</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Тема">
        {THEMES.map((t) => (
          <button key={t.id} className="theme-tile" role="radio" aria-checked={theme === t.id} onClick={() => setSettings({ theme: t.id })}>
            <ThemeSample id={t.id} />
            <span className="theme-name">{t.label}</span>
            <span className="tiny muted">{t.hint}</span>
          </button>
        ))}
      </div>
      <p className="tiny muted">Все темы бесплатные. Тема своя на каждом устройстве.</p>
      <div className="switch-row">
        <span>
          <span style={{ fontWeight: 700 }}>Падающий снег</span>
          <span className="tiny muted" style={{ display: 'block' }}>
            Выключается сам, если в системе «Уменьшить движение»
          </span>
        </span>
        <button className="switch" role="switch" aria-checked={snow} aria-label="Падающий снег" onClick={() => setSettings({ snow: !snow })} />
      </div>
      <div className="switch-row">
        <span>
          <span style={{ fontWeight: 700 }}>Гирлянда сверху</span>
          <span className="tiny muted" style={{ display: 'block' }}>
            Тихо мерцает под шапкой на всех экранах. Только на этом устройстве
          </span>
        </span>
        <button className="switch" role="switch" aria-checked={garland} aria-label="Гирлянда сверху" onClick={() => setTopGarlandPref(!garland)} />
      </div>
      <div className="switch-row">
        <span>
          <span style={{ fontWeight: 700 }}>Звук</span>
          <span className="tiny muted" style={{ display: 'block' }}>
            Щелчки и звон в Плинко. Беззвучный режим телефона сайт не видит
          </span>
        </span>
        <button className="switch" role="switch" aria-checked={settings.sound ?? true} aria-label="Звук" onClick={() => setSettings({ sound: !(settings.sound ?? true) })} />
      </div>
    </section>
  )
}

// ---------- quests ----------

const ROLE_OPTS: { v: Role | ''; l: string }[] = [
  { v: '', l: '—' },
  { v: 'main', l: 'главный' },
  { v: 'side', l: 'побочный' },
]
const ROLE_SHORT: Record<Role, string> = { main: 'главный', side: 'побоч.' }

function QuestCard({ q }: { q: Quest }) {
  const update = useStore((s) => s.updateQuest)
  const remove = useStore((s) => s.removeQuest)
  const [open, setOpen] = useState(false)
  return (
    <div className="panel tight stack" style={{ opacity: q.enabled ? 1 : 0.55 }}>
      <div className="row">
        <button className="grow" style={{ textAlign: 'left', fontWeight: 700 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          {q.title}
          <div className="tiny muted" style={{ fontWeight: 500 }}>
            {q.roles.map((r, i) => `${i === 0 ? 'Пролог' : CHAPTERS[i].roman}: ${r ? ROLE_SHORT[r] : '—'}`).join(' · ')}
          </div>
        </button>
        <button className="switch" role="switch" aria-checked={q.enabled} aria-label={`${q.title}: ${q.enabled ? 'включён' : 'выключен'}`} onClick={() => update(q.id, { enabled: !q.enabled })} />
      </div>
      {open && (
        <div className="stack">
          <Field label="Название">
            <input className="input" value={q.title} onChange={(e) => update(q.id, { title: e.target.value })} />
          </Field>
          <Field label="Если/когда X → Y">
            <input className="input" value={q.ifThen} onChange={(e) => update(q.id, { ifThen: e.target.value })} />
          </Field>
          <Field label="Мини-версия (2 минуты)">
            <input className="input" value={q.mini} onChange={(e) => update(q.id, { mini: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Стат">
              <select className="select" value={q.stat} onChange={(e) => update(q.id, { stat: e.target.value as StatId })}>
                {STATS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {(q.kind === 'number' || q.kind === 'reading') && (
              <Field label={`Минимум, ${q.unit ?? ''}`}>
                <input className="input num" type="number" min={1} value={q.min ?? 1} onChange={(e) => update(q.id, { min: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
            )}
          </div>
          <div className="field">
            <span>Роль по главам</span>
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {CHAPTERS.map((c, i) => (
                <label key={c.id} className="field">
                  <span className="tiny">{c.id === 0 ? 'Пролог' : c.roman}</span>
                  <select
                    className="select"
                    value={q.roles[i] ?? ''}
                    onChange={(e) => {
                      const roles = [...q.roles] as Quest['roles']
                      roles[i] = (e.target.value || null) as Role | null
                      update(q.id, { roles })
                    }}
                  >
                    {ROLE_OPTS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          {q.kind !== 'check' && <p className="tiny muted">Этот квест отмечается автоматически ({{ wake: 'по чек-ину', reading: 'по страницам', deal: 'по Делу дня', reels: 'по исповеди', bedtime: 'по исповеди', caffeine: 'вручную, кола после 14:00 — пропуск', number: 'по числу', check: '' }[q.kind]}).</p>}
          {q.enabled && (
            <button className="btn sm ghost" onClick={() => remove(q.id)}>
              Отключить квест
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QuestsEditor() {
  const quests = useStore((s) => s.data.quests)
  const addQuest = useStore((s) => s.addQuest)
  const today = gameDayOf(useNow())
  const [title, setTitle] = useState('')
  const mains = CHAPTERS.map((c) => quests.filter((q) => q.enabled && q.roles[c.id] === 'main').length)
  return (
    <Sub title="Квесты">
      <p className="small muted">Не больше 5 главных в день: лишние автоматически станут побочными. Квест, который был главным в прошлой главе, а теперь побочный, получает метку «база» и XP ×0.5.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        {CHAPTERS.map((c, i) => (
          <span key={c.id} className={`tag ${mains[i] > 5 ? 'ember' : ''}`}>
            {c.id === 0 ? 'Пролог' : c.roman}: {mains[i]} главных
          </span>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {[...quests]
          .sort((a, b) => a.order - b.order)
          .map((q) => (
            <QuestCard key={q.id} q={q} />
          ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          addQuest({ title: title.trim(), stat: 'will', kind: 'check', ifThen: 'Когда … → …', mini: '2 минуты', roles: ['side', 'side', 'side', 'side'], enabled: true }, today)
          setTitle('')
        }}
      >
        <input className="input" placeholder="Новый квест" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название нового квеста" maxLength={60} />
        <button className="btn sm primary" type="submit" disabled={!title.trim()}>
          Добавить
        </button>
      </form>
      <p className="tiny muted">Новый квест работает с сегодняшнего дня — прошлые дни не пересчитываются.</p>
    </Sub>
  )
}

// ---------- measurements ----------

function MeasurementsPage() {
  const data = useStore((s) => s.data)
  const setM = useStore((s) => s.setMeasurements)
  const today = gameDayOf(useNow())
  const finalOpen = today >= FINAL_MEASURE_FROM
  return (
    <Sub title="Замеры">
      <section className="stack">
        <h2>На старте</h2>
        <MeasurementsForm value={data.baseline} onChange={(m) => setM('baseline', m)} />
      </section>
      <section className="stack">
        <h2>Финал</h2>
        {finalOpen ? (
          <>
            <MeasurementsForm value={data.final} onChange={(m) => setM('final', m)} />
            <a className="btn primary" href="#/finale">
              Сравнить до и после
            </a>
          </>
        ) : (
          <p className="small muted">Финальные замеры откроются {formatDayRu(FINAL_MEASURE_FROM)}, в последнюю неделю арки.</p>
        )}
      </section>
    </Sub>
  )
}

// ---------- triggers ----------

function TriggersPage() {
  const slips = useStore((s) => s.data.slips)
  const r = analyzeTriggers(slips)
  const maxWd = Math.max(1, ...r.weekday)
  const maxT = Math.max(1, ...r.time.map((t) => t.count))
  return (
    <Sub title="Твои триггеры">
      {!r.enough ? (
        <div className="empty">
          Нужно хотя бы {TRIGGERS_MIN} записей «Слился», сейчас {r.total}. Чем честнее лог, тем точнее картина.
        </div>
      ) : (
        <>
          <div className="panel glow">
            <h2>{r.headline}</h2>
            <p className="small muted" style={{ marginTop: 6 }}>
              {r.total} срывов, из них {r.comebacks} отыграно камбэком.
            </p>
          </div>
          <div className="cols">
            <section className="panel stack">
              <h3>Почему</h3>
              {r.why.map((w) => (
                <BarRow key={w.key} label={w.label} value={w.count} max={r.why[0].count} />
              ))}
              <h3 style={{ marginTop: 8 }}>Что</h3>
              {r.what.map((w) => (
                <BarRow key={w.key} label={w.label} value={w.count} max={r.what[0].count} />
              ))}
            </section>
            <section className="panel stack">
              <h3>Время суток</h3>
              {r.time.map((t) => (
                <BarRow key={t.key} label={t.label} value={t.count} max={maxT} />
              ))}
              <h3 style={{ marginTop: 8 }}>День недели</h3>
              {r.weekday.map((c, i) => (
                <BarRow key={i} label={RU_WEEKDAYS[i]} value={c} max={maxWd} />
              ))}
            </section>
          </div>
        </>
      )}
      <section className="stack">
        <h2>Лог срывов</h2>
        {slips.length === 0 && <div className="empty">Пусто. Это либо сила, либо нечестность — ты знаешь, что из двух.</div>}
        <div className="panel kv small" style={{ display: slips.length ? 'grid' : 'none' }}>
          {[...slips]
            .sort((a, b) => b.at - a.at)
            .slice(0, 40)
            .map((s) => (
              <div key={s.id} style={{ display: 'contents' }}>
                <span>
                  <span className="muted num">{formatDayShort(s.day)}</span> {WHAT_LABEL[s.what]}, {WHY_LABEL[s.why].toLowerCase()}
                  {s.note ? <span className="muted">: {s.note}</span> : null}
                </span>
                <span style={{ textAlign: 'right' }}>{s.comebackAt ? '✅' : ''}</span>
              </div>
            ))}
        </div>
      </section>
    </Sub>
  )
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 28px', gap: 10, alignItems: 'center' }} className="small">
      <span>{label}</span>
      <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 3 }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: 'var(--c1)', borderRadius: '0 4px 4px 0' }} />
      </div>
      <span className="num tiny" style={{ textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

// ---------- reviews ----------

function ReviewsPage() {
  const reviews = useStore((s) => s.data.reviews)
  const game = useGame()
  const weeks = Object.values(game.bosses).filter((b) => b.done).sort((a, b) => b.week - a.week)
  return (
    <Sub title="Обзоры недель">
      {weeks.length === 0 && <div className="empty">Первый обзор — в воскресенье после исповеди.</div>}
      {weeks.map((b) => (
        <a key={b.week} className="list-btn" href={`#/review/${b.week}`}>
          <ScrollText aria-hidden />
          <span className="grow">
            Неделя {b.week}: {bossOf(b.week)} {b.won ? '— повержен' : '— выстоял'}
            <small>{reviews[b.week] ? `Сработало: ${reviews[b.week].worked || '—'}` : 'Ответы не записаны'}</small>
          </span>
          <ChevronRight size={18} color="var(--mist)" aria-hidden />
        </a>
      ))}
    </Sub>
  )
}

// ---------- books ----------

function BooksPage() {
  const data = useStore((s) => s.data)
  const addBook = useStore((s) => s.addBook)
  const updateBook = useStore((s) => s.updateBook)
  const setActive = useStore((s) => s.setActiveBook)
  const today = gameDayOf(useNow())
  const [title, setTitle] = useState('')
  const [total, setTotal] = useState('')
  const [cur, setCur] = useState('')
  const active = data.books.find((b) => b.id === data.activeBookId)
  return (
    <Sub title="Книги">
      <div className="grid-2">
        <div className="panel stack" style={{ gap: 4 }}>
          <span className="small muted">Книг за арку</span>
          <span className="num" style={{ fontSize: '1.6rem' }}>
            {booksFinishedInArc(data, ARC_START)}
          </span>
        </div>
        <div className="panel stack" style={{ gap: 4 }}>
          <span className="small muted">За год до арки</span>
          <span className="num" style={{ fontSize: '1.6rem' }}>
            {data.baseline.booksYear ?? '—'}
          </span>
        </div>
      </div>
      {active && (
        <section className="panel glow stack">
          <span className="small muted">Сейчас читаю</span>
          <h2>{active.title}</h2>
          <div className="bar ice">
            <i style={{ width: `${(active.current / Math.max(1, active.total)) * 100}%` }} />
          </div>
          <div className="row between small">
            <span className="num">
              {active.current} / {active.total} стр
            </span>
            <label className="row" style={{ gap: 6 }}>
              <span className="muted tiny">страница</span>
              <input className="input num" style={{ width: 96 }} type="number" min={0} max={active.total} value={active.current} onChange={(e) => updateBook(active.id, { current: Math.min(active.total, Math.max(0, Number(e.target.value) || 0)) })} />
            </label>
          </div>
          <p className="tiny muted">Страницы из квеста «Чтение» прибавляются сюда сами.</p>
        </section>
      )}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault()
          const t = Number(total)
          if (!title.trim() || !(t > 0)) return
          addBook(title.trim(), Math.round(t), Math.max(0, Math.round(Number(cur) || 0)), today)
          setTitle('')
          setTotal('')
          setCur('')
        }}
      >
        <h3>Новая книга</h3>
        <Field label="Название">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Всего страниц">
            <input className="input num" type="number" inputMode="numeric" min={1} value={total} onChange={(e) => setTotal(e.target.value)} />
          </Field>
          <Field label="Текущая страница">
            <input className="input num" type="number" inputMode="numeric" min={0} value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
        </div>
        <button className="btn primary" type="submit">
          Читаю её
        </button>
      </form>
      {data.books.length > 0 && (
        <section className="stack">
          <h2>Все книги</h2>
          {data.books.map((b) => (
            <div key={b.id} className="panel tight row between">
              <div>
                <div style={{ fontWeight: 700 }}>{b.title}</div>
                <div className="tiny muted">{b.finishedDay ? `дочитана ${formatDayRu(b.finishedDay)}` : `${b.current}/${b.total} стр`}</div>
              </div>
              {b.id !== data.activeBookId && !b.finishedDay && (
                <button className="btn sm ghost" onClick={() => setActive(b.id)}>
                  Читать
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </Sub>
  )
}

// ---------- pause ----------

function PauseHelp() {
  const url = `${window.location.origin}${window.location.pathname}#/pause?app=instagram`
  const say = useUi((s) => s.say)
  const steps = [
    'Открой приложение «Команды» на iPhone.',
    'Вкладка «Автоматизация» → «+» → «Приложение».',
    'Выбери Instagram (и отдельно TikTok), отметь «Открыто».',
    'Выбери «Выполнять сразу» и выключи «Уведомлять при запуске».',
    'Действие «Открыть URL» и вставь адрес ниже. Для TikTok замени instagram на tiktok.',
  ]
  return (
    <Sub title="Пауза перед рилсами">
      <p className="muted">Ничего не блокируется. При открытии Instagram сначала откроется Winter Arc: остаток лимита и 10 секунд вдоха. Дальше решаешь сам.</p>
      <ol className="stack" style={{ paddingLeft: 22, margin: 0 }}>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="panel stack">
        <code className="small" style={{ wordBreak: 'break-all', color: 'var(--pine)' }}>
          {url}
        </code>
        <div className="row wrap">
          <button
            className="btn sm"
            onClick={() => {
              navigator.clipboard?.writeText(url).then(
                () => say('Адрес скопирован'),
                () => say('Скопируй адрес вручную'),
              )
            }}
          >
            Скопировать адрес
          </button>
          <a className="btn sm ghost" href="#/pause?app=instagram">
            Проверить паузу
          </a>
        </div>
      </div>
      <p className="tiny muted">Лучше всего работает, когда Winter Arc добавлен на экран «Домой».</p>
    </Sub>
  )
}

// ---------- backup ----------

function Backup() {
  const data = useStore((s) => s.data)
  const importData = useStore((s) => s.importData)
  const resetAll = useStore((s) => s.resetAll)
  const say = useUi((s) => s.say)
  const ask = useUi((s) => s.confirm)
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string>()

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'winter-arc', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `winter-arc-${gameDayOf(new Date())}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <Sub title="Бэкап">
      <p className="muted">Данные живут на этом устройстве{' '}(а с аккаунтом — ещё и в твоей личной облачной копии). Раз в неделю сохраняй файл — например, в «Файлы» или облако.</p>
      <button className="btn primary block" onClick={exportJson}>
        <Download size={18} /> Скачать бэкап JSON
      </button>
      <div className="stack">
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const raw = JSON.parse(await f.text())
              if (!(await ask({ title: 'Загрузить бэкап?', body: 'Текущие данные на этом устройстве заменятся данными из файла. Сначала можно скачать свой бэкап.', ok: 'Заменить' }))) return
              importData(raw)
              setErr(undefined)
              say('Бэкап загружен')
            } catch (x) {
              setErr(x instanceof Error ? x.message : 'Файл не читается')
            } finally {
              e.target.value = ''
            }
          }}
        />
        <button className="btn ghost block" onClick={() => file.current?.click()}>
          Загрузить бэкап
        </button>
        {err && <p className="small" style={{ color: 'var(--hp)' }}>{err}</p>}
      </div>
      <div className="divider" />
      <button
        className="btn ghost block"
        style={{ color: 'var(--hp)' }}
        onClick={async () => {
          if (await ask({ title: 'Стереть всё?', body: 'Квесты, дни, замеры и задачи на этом устройстве исчезнут. Это нельзя отменить — сначала скачай бэкап.', ok: 'Стереть всё', danger: true })) resetAll()
        }}
      >
        Стереть всё и начать заново
      </button>
    </Sub>
  )
}

// ---------- debug ----------

function Debug() {
  const offset = useStore((s) => s.data.settings.debugOffsetDays)
  const setSettings = useStore((s) => s.setSettings)
  const now = useNow()
  const realToday = gameDayOf(new Date())
  const jump = (day: string) => {
    setSettings({ debugOffsetDays: diffDays(realToday, day) })
    refreshClock()
  }
  const presets: [string, string][] = [
    ['Сегодня', realToday],
    ['Пролог, день 1', ARC_START],
    ['Глава I', CHAPTERS[1].start],
    ['Глава II', CHAPTERS[2].start],
    ['Глава III', CHAPTERS[3].start],
    ['Финальная неделя', FINAL_MEASURE_FROM],
    ['После арки', '2027-03-01'],
  ]
  return (
    <Sub title="Отладка">
      <p className="small muted">Сдвигает «сегодня» на N дней, чтобы проверить главы и финал. Дни между реальной и сдвинутой датой оцениваются как обычно — после проверки верни сдвиг в 0 или сделай бэкап.</p>
      <Field label="Сдвиг, дней">
        <input
          className="input num"
          type="number"
          value={offset}
          onChange={(e) => {
            setSettings({ debugOffsetDays: Math.round(Number(e.target.value) || 0) })
            refreshClock()
          }}
        />
      </Field>
      <p className="small">
        Сейчас в игре: <span className="num">{formatDayRu(gameDayOf(now))}</span>, {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <div className="chips">
        {presets.map(([l, d]) => (
          <button key={l} className="chip" onClick={() => jump(d)}>
            {l}
          </button>
        ))}
      </div>
    </Sub>
  )
}
