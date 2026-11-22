import { useState } from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { DUMP, DUMP_TEXT_MAX, EVENT_NOTE_MAX, EVENT_TITLE_MAX, JOURNAL_DONE, JOURNAL_PROMPTS, JOURNAL_TEXT_MAX, addDays, eventDayLabel, formatDayRu, journalAnswered, journalDays } from '../engine'
import type { CalEvent, DayKey } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset } from '../store/hooks'
import { useUi } from '../store/ui'
import { Px } from '../pixel/Pixel'
import { Field, Sheet } from './ui'
import { TimePicker } from './TimePicker'

// ---------- «Вечерний дневник» ----------

/**
 * 5 prompts of the evening diary. Each answer is saved as it is typed (blank removes it); the
 * quest closes by itself: 3 answers — done, 1–2 — mini. Past days are read-only below.
 */
export function JournalSheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  const saved = useStore((s) => s.data.days[day]?.journal)
  const setJournal = useStore((s) => s.setJournal)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(JOURNAL_PROMPTS.map((p) => [p.id, saved?.[p.id]?.text ?? ''])))
  const [past, setPast] = useState(false)
  const n = JOURNAL_PROMPTS.filter((p) => draft[p.id]?.trim()).length
  const write = (id: string, text: string) => {
    setDraft((d) => ({ ...d, [id]: text }))
    setJournal(day, id, text, nowWithOffset())
  }
  return (
    <Sheet title="Вечерний дневник" onClose={onClose}>
      <div className="stack">
        <p className="small jr-lead">
          <Lock size={14} aria-hidden />
          <span>Видишь только ты. {n >= JOURNAL_DONE ? 'Квест закрыт.' : `Ответь на ${JOURNAL_DONE} из 5 — квест закрыт, 1–2 — мини.`}</span>
          <span className={`jr-count num${n >= JOURNAL_DONE ? ' full' : ''}`}>{n}/5</span>
        </p>
        {JOURNAL_PROMPTS.map((p, i) => (
          <label key={p.id} className="field jr-q">
            <span>
              <i className="num">{i + 1}</i> {p.text}
            </span>
            <textarea className="textarea" rows={2} value={draft[p.id]} maxLength={JOURNAL_TEXT_MAX} onChange={(e) => write(p.id, e.target.value)} />
          </label>
        ))}
        <button className="btn primary block" onClick={onClose}>
          Готово
        </button>
        <button className="link-btn center" onClick={() => setPast(!past)} aria-expanded={past}>
          {past ? 'Скрыть прошлые записи' : 'Прошлые записи'}
        </button>
        {past && <PastEntries before={day} />}
      </div>
    </Sheet>
  )
}

/** Read-only diary and dumps of the past days, newest first, one day per fold */
function PastEntries({ before }: { before: DayKey }) {
  const days = useStore((s) => s.data.days)
  const list = journalDays({ days }, before)
  if (!list.length) return <p className="empty">Пока пусто. Записи появятся здесь со следующего дня.</p>
  return (
    <div className="stack" style={{ gap: 8 }}>
      {list.slice(0, 60).map((d) => {
        const log = days[d]
        return (
          <details key={d} className="jr-past">
            <summary>
              <b>{formatDayRu(d)}</b>
              <span className="tiny muted num">{journalAnswered(log)}/5{log.dump?.text ? ' · выброс' : ''}</span>
            </summary>
            {JOURNAL_PROMPTS.filter((p) => log.journal?.[p.id]?.text).map((p) => (
              <p key={p.id}>
                <span className="tiny muted">{p.text}</span>
                <br />
                {log.journal![p.id].text}
              </p>
            ))}
            {log.dump?.text && (
              <p>
                <span className="tiny muted">Выброс мыслей</span>
                <br />
                {log.dump.text}
              </p>
            )}
          </details>
        )
      })}
    </div>
  )
}

// ---------- «Выброс мыслей» ----------

/** Free text, private, a bonus: it never counts in the ring, +2 XP Разума once a day */
export function DumpSheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  const saved = useStore((s) => s.data.days[day]?.dump?.text ?? '')
  const setDump = useStore((s) => s.setDump)
  const [text, setText] = useState(saved)
  return (
    <Sheet title="Выброс мыслей" onClose={onClose}>
      <div className="stack">
        <p className="small jr-lead">
          <Lock size={14} aria-hidden />
          <span>Если есть вайб: всё, что крутится в голове, без порядка и цензуры. Видишь только ты. Бонус +{DUMP.xp} XP Разума раз в день.</span>
        </p>
        <textarea
          className="textarea"
          rows={8}
          autoFocus
          value={text}
          maxLength={DUMP_TEXT_MAX}
          placeholder="Пиши как есть…"
          onChange={(e) => {
            setText(e.target.value)
            setDump(day, e.target.value, nowWithOffset())
          }}
        />
        <button className="btn primary block" onClick={onClose}>
          Готово
        </button>
      </div>
    </Sheet>
  )
}

// ---------- «Разное»: events ----------

/** «+ Событие» and editing one: title, day, an optional 24h time, a note */
export function EventSheet({ today, event, onClose }: { today: DayKey; event?: CalEvent; onClose: () => void }) {
  const addEvent = useStore((s) => s.addEvent)
  const updateEvent = useStore((s) => s.updateEvent)
  const deleteEvent = useStore((s) => s.deleteEvent)
  const say = useUi((s) => s.say)
  const confirm = useUi((s) => s.confirm)
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState<DayKey>(event?.date ?? today)
  const [time, setTime] = useState(event?.time ?? '')
  const [note, setNote] = useState(event?.note ?? '')
  const chips = [0, 1, 2].map((i) => addDays(today, i))
  const ok = !!title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date)
  return (
    <Sheet title={event ? 'Событие' : 'Новое событие'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ok) return
          const x = { title: title.trim(), date, time: time || undefined, note: note.trim() || undefined }
          if (event) updateEvent(event.id, x, nowWithOffset())
          else if (!addEvent(x, nowWithOffset())) return
          say(`${event ? 'Сохранено' : 'Добавлено'}: ${x.title} · ${eventDayLabel(date, today)}${x.time ? ` ${x.time}` : ''}`)
          onClose()
        }}
      >
        <Field label="Что">
          <input className="input" value={title} maxLength={EVENT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Созвон, встреча, врач" autoFocus={!event} />
        </Field>
        <div className="field">
          <span>Когда</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="chips" role="group" aria-label="День">
              {chips.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={date === d} onClick={() => setDate(d)}>
                  {eventDayLabel(d, today).replace(/^./, (c) => c.toUpperCase())}
                </button>
              ))}
            </div>
            <input className="input money-date" type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Дата" />
          </div>
        </div>
        <div className="field">
          <span>Время · можно без него</span>
          <div className="row" style={{ gap: 10 }}>
            <TimePicker value={time} onChange={setTime} label="Время события" optional />
            {time && (
              <button type="button" className="btn sm ghost" onClick={() => setTime('')}>
                Без времени
              </button>
            )}
          </div>
        </div>
        <Field label="Заметка — видишь только ты">
          <input className="input" value={note} maxLength={EVENT_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Ссылка, адрес, что взять" />
        </Field>
        <button className="btn primary block" type="submit" disabled={!ok}>
          <Px name="clock" size={20} /> {event ? 'Сохранить' : 'Добавить событие'}
        </button>
        {event && (
          <button
            type="button"
            className="btn ghost block"
            onClick={async () => {
              if (!(await confirm({ title: 'Удалить событие?', body: event.title, ok: 'Удалить', danger: true }))) return
              deleteEvent(event.id)
              say(`Удалено: ${event.title}`)
              onClose()
            }}
          >
            <Trash2 size={17} aria-hidden /> Удалить
          </button>
        )}
      </form>
    </Sheet>
  )
}

/** checkbox of a today's event: no XP (events are not habits), it counts in the ring */
export function useToggleEvent() {
  const toggle = useStore((s) => s.toggleEvent)
  const say = useUi((s) => s.say)
  return (ev: CalEvent) => {
    const was = !!ev.doneAt
    toggle(ev.id, nowWithOffset())
    say(was ? `Вернул: ${ev.title}` : `Готово: ${ev.title}`, () => useStore.getState().toggleEvent(ev.id, nowWithOffset()))
  }
}
