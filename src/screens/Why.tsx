import { useEffect, useSyncExternalStore } from 'react'
import { Px } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'

// ---------- «seen» flag: per device, survives without storage (private mode) for the session ----------

const KEY = 'wa-why-seen'
let memSeen = false
const subs = new Set<() => void>()

function readSeen(): boolean {
  if (memSeen) return true
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  memSeen = true
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* private mode: the memory flag is enough for this session */
  }
  subs.forEach((f) => f())
}

/** [seen, dismiss]: the Today card hides forever after the memo is opened or ✕ */
export function useWhySeen(): [boolean, () => void] {
  const seen = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    readSeen,
  )
  return [seen, markSeen]
}

// ---------- the memo ----------

const HOW: { icon: SpriteName; lead: string; text: string }[] = [
  { icon: 'quests', lead: 'Квесты дня.', text: 'Сделал — Эло дня и WF-поинты. Молчание и срывы — минус Эло.' },
  { icon: 'sun', lead: 'Утренняя инвестиция.', text: '15 минут разминки — заряд на весь день.' },
  { icon: 'hammer', lead: 'Дело дня.', text: 'Один шаг к деньгам. Включи поток — 90 минут без отвлечений.' },
  { icon: 'fir', lead: 'Навыки.', text: 'То, что приносит деньги. Качаются практикой с честной обратной связью.' },
  { icon: 'campfire', lead: 'Пати.', text: 'Друзья видят прогресс, соревнуемся, дуэли и лидерборд заработка.' },
  { icon: 'shard', lead: 'WF тратишь', text: 'на награды в магазине, которые назначил себе сам.' },
  { icon: 'plinko', lead: 'Плинко.', text: 'Не знаешь, чем заняться — шар выберет маленькое полезное дело.' },
]

/** «Ещё → Зачем мы здесь»: the one-minute memo about the arc */
export function Why() {
  useEffect(() => markSeen(), [])
  return (
    <article className="stack-lg why" aria-label="Зачем мы здесь">
      <section className="why-hero">
        <div className="why-art" aria-hidden>
          <Px name="fir" size={40} />
          <Px name="wolf" size={60} />
          <Px name="snowman" size={40} />
        </div>
        <p className="why-lede">
          Winter Arc — 98 дней зимы, с 23 ноября по 28 февраля. Качаем себя, как персонажа в игре.
        </p>
      </section>

      <section className="panel why-goal">
        <Px name="coin" size={40} />
        <div className="stack" style={{ gap: 6 }}>
          <p className="why-goal-main">Главная цель: к концу зимы начать зарабатывать $10 000 в месяц.</p>
          <p className="small muted">Сон, тело, фокус и навыки — топливо для этой цели.</p>
        </div>
      </section>

      <section className="stack">
        <h2>Как это работает:</h2>
        <ol className="why-list">
          {HOW.map((h, i) => (
            <li key={h.lead}>
              <span className="why-num num" aria-hidden>
                {i + 1}
              </span>
              <Px name={h.icon} size={30} />
              <span className="grow">
                <b>{h.lead}</b> {h.text}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel why-rule">
        <Px name="flame" size={34} />
        <p>
          <b>Правило арки: не идеально, а каждый день.</b> Пропуск — не провал, а повод вернуться завтра.
        </p>
      </section>

      <a className="btn primary block" href="#/today">
        К квестам
      </a>
    </article>
  )
}
