import { dayStreak, gameDayOf, monthClosed } from '../engine'
import { Px } from '../pixel/Pixel'
import { useGame, useNow } from '../store/hooks'
import { Help } from './ui'

/** «Серия» on Today: closed days in a row, the month's closed days and a small calendar to keep it going */
export function StreakCard() {
  const game = useGame()
  const today = gameDayOf(useNow())
  const s = dayStreak(game, today)
  const m = monthClosed(game, today)
  return (
    <section className="streak-card" aria-label="Серия">
      <div className="streak-top">
        <Px name="flame" size={40} />
        <div className="grow">
          <div className="streak-run">
            <b className="num">{s.run}</b> {plural(s.run)} подряд
          </div>
          <small className="muted">
            Рекорд {s.best} · закрыто {m.title}: <b>{m.closed}</b>{m.past > 0 && ` из ${m.past}`}
          </small>
        </div>
        <Help
          title="Серия"
          text={[
            'День закрыт, когда все главные квесты сделаны или в мини.',
            'Заморозка держит серию, но не прибавляет. Сегодня серию не ломает, пока день не кончился.',
          ]}
        />
      </div>
      <p className={`streak-today ${s.todayDone ? 'done' : ''}`}>
        {s.todayDone ? `Сегодня закрыт ✓ Серия ${s.run}` : `Закрой главные квесты сегодня — серия станет ${s.run + 1}`}
      </p>
      <div className="streak-month" role="img" aria-label={`Закрыто ${m.title} ${m.closed} дней`}>
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
          <span key={d} className="wd">
            {d}
          </span>
        ))}
        {Array.from({ length: m.lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {m.cells.map((c) => (
          <span key={c.day} className={`cell ${c.state}${c.day === today ? ' today' : ''}`}>
            {Number(c.day.slice(8))}
          </span>
        ))}
      </div>
    </section>
  )
}

function plural(n: number) {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return 'день'
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дня'
  return 'дней'
}
