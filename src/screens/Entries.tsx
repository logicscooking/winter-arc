import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { JOURNAL_PROMPTS, RU_WEEKDAYS, addDays, formatDayRu, gameDayOf, journalAnswered, parseDay, weekday } from '../engine'
import type { DayKey, DayLog } from '../engine'
import { useStore } from '../store/store'
import { useNow } from '../store/hooks'
import { Px } from '../pixel/Pixel'

const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const SLEEP_WORD = ['', 'ужасно', 'плохо', 'так себе', 'хорошо', 'отлично']

const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (day: DayKey) => day.slice(0, 7)
const firstOf = (key: string) => `${key}-01` as DayKey
function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number)
  const t = y * 12 + (m - 1) + by
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}

/** What a day holds: diary, confession, dump, morning check-in */
export function entryKinds(log: DayLog | undefined) {
  return {
    journal: journalAnswered(log) > 0,
    confession: !!log?.confession,
    dump: !!log?.dump?.text?.trim(),
    checkin: !!log?.checkin,
  }
}
const hasEntry = (log: DayLog | undefined) => Object.values(entryKinds(log)).some(Boolean)

/**
 * «Все записи»: a month calendar of everything written down — the evening diary, the confession
 * (score, «Почему так?», «Что было главным»), the thought dump and the morning check-in.
 * Private and local: it only reads the own day log.
 */
export function Entries() {
  const days = useStore((s) => s.data.days)
  const today = gameDayOf(useNow())
  const [month, setMonth] = useState(monthKey(today))
  const [sel, setSel] = useState<DayKey>(() => {
    if (hasEntry(days[today])) return today
    return (
      Object.keys(days)
        .filter((d) => d <= today && hasEntry(days[d]))
        .sort()
        .at(-1) ?? today
    )
  })
  const first = firstOf(month)
  const cells: DayKey[] = []
  for (let d = first; monthKey(d) === month; d = addDays(d, 1)) cells.push(d)
  const { y, m } = parseDay(first)
  const count = cells.filter((d) => hasEntry(days[d])).length
  const log = days[sel]
  const k = entryKinds(log)

  return (
    <div className="stack-lg entries">
      <p className="small muted" style={{ marginTop: -4 }}>
        Дневник, исповеди, выброс мыслей и утренние чек-ины по дням. Видишь только ты, всё хранится на этом устройстве.
      </p>
      <section className="panel stack" aria-label="Календарь записей">
        <div className="row between">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            <ChevronLeft size={22} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>
              {RU_MONTHS[m - 1]} {y}
            </h2>
            <span className="tiny muted">{count ? `записей: ${count} ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'}` : 'нет записей'}</span>
          </div>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц" disabled={month >= monthKey(today)}>
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="ent-cal" role="grid" aria-label={`${RU_MONTHS[m - 1]} ${y}`}>
          {RU_WEEKDAYS.map((w) => (
            <span key={w} className="wd">
              {w}
            </span>
          ))}
          {Array.from({ length: weekday(first) }, (_, i) => (
            <span key={`l${i}`} />
          ))}
          {cells.map((d) => {
            const e = entryKinds(days[d])
            const any = e.journal || e.confession || e.dump || e.checkin
            return (
              <button
                key={d}
                className={`ent-cell${any ? ' has' : ''}${d === sel ? ' on' : ''}${d === today ? ' today' : ''}`}
                disabled={d > today}
                onClick={() => setSel(d)}
                aria-pressed={d === sel}
                aria-label={`${formatDayRu(d)}${any ? ': есть записи' : ''}`}
              >
                <b>{Number(d.slice(8))}</b>
                <span className="ent-dots" aria-hidden>
                  {e.journal && <i className="j" />}
                  {e.confession && <i className="c" />}
                  {e.dump && <i className="d" />}
                  {e.checkin && <i className="m" />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="ent-legend tiny muted">
          <span>
            <i className="j" /> дневник
          </span>
          <span>
            <i className="c" /> исповедь
          </span>
          <span>
            <i className="d" /> мысли
          </span>
          <span>
            <i className="m" /> утро
          </span>
        </div>
      </section>

      <section className="stack" aria-label={`Записи за ${formatDayRu(sel)}`}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          <h2>
            {RU_WEEKDAYS[weekday(sel)]}, {formatDayRu(sel)}
          </h2>
        </div>
        {!hasEntry(log) && <p className="small muted">В этот день ничего не записано.</p>}

        {k.checkin && log?.checkin && (
          <article className="panel ent-card">
            <h3>
              <Px name="sun" size={20} /> Утренний чек-ин
            </h3>
            <p className="small">
              Подъём <b className="num">{log.checkin.wake}</b> · сон <b>{SLEEP_WORD[log.checkin.sleep] ?? log.checkin.sleep}</b> ({log.checkin.sleep}/5) · энергия <b className="num">{log.checkin.energy}/5</b>
            </p>
            <p className="tiny muted">Восстановление после сна: {log.checkin.sleep + log.checkin.energy} из 10</p>
          </article>
        )}

        {k.confession && log?.confession && (
          <article className="panel ent-card">
            <h3>
              <Px name="owl" size={20} /> Исповедь
            </h3>
            {log.confession.dayScore !== undefined && (
              <p className="ent-score">
                Как прошёл день: <b className="num">{log.confession.dayScore}</b>
                <small>/10</small>
              </p>
            )}
            {!!log.confession.dayWhy?.trim() && (
              <div className="ent-qa">
                <span>Почему так?</span>
                <p>{log.confession.dayWhy}</p>
              </div>
            )}
            {!!log.confession.main?.trim() && (
              <div className="ent-qa">
                <span>Что было главным</span>
                <p>{log.confession.main}</p>
              </div>
            )}
          </article>
        )}

        {k.journal && log?.journal && (
          <article className="panel ent-card">
            <h3>
              <Px name="pen" size={20} /> Вечерний дневник
            </h3>
            {JOURNAL_PROMPTS.filter((p) => log.journal?.[p.id]?.text?.trim()).map((p) => (
              <div key={p.id} className="ent-qa">
                <span>{p.text}</span>
                <p>{log.journal![p.id].text}</p>
              </div>
            ))}
          </article>
        )}

        {k.dump && log?.dump && (
          <article className="panel ent-card">
            <h3>
              <Px name="speech" size={20} /> Выброс мыслей
            </h3>
            <p className="ent-text">{log.dump.text}</p>
          </article>
        )}
      </section>
    </div>
  )
}
