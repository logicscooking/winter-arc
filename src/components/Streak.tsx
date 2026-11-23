import { dayStreak, gameDayOf, monthClosed, plural } from '../engine'
import { Px } from '../pixel/Pixel'
import { useGame, useNow } from '../store/hooks'
import { Help } from './ui'

/** «Стрик» at the top of «Путь»: closed days in a row, big; the record, a nudge and this month's calendar */
export function StreakCard() {
  const game = useGame()
  const today = gameDayOf(useNow())
  const s = dayStreak(game, today)
  const m = monthClosed(game, today)
  const msg = s.todayDone
    ? `Сегодня закрыт ✓ Завтра серия станет ${s.run + 1}.`
    : s.run > 0
      ? `Не проеби серию: закрой главные квесты сегодня — будет ${s.run + 1}.`
      : 'Начни серию: закрой главные квесты сегодня.'
  const record = s.run > 0 && s.run >= s.best
  return (
    <section className={`streak-card big${s.run > 0 ? ' hot' : ''}`} aria-label={`Стрик: ${s.run} ${plural(s.run, 'день', 'дня', 'дней')} подряд`}>
      <div className="streak-top">
        <span className="streak-flame" aria-hidden>
          <Px name="flame" size={64} />
        </span>
        <div className="grow">
          <span className="streak-ear">Стрик выполненных дней</span>
          <div className="streak-run">
            <b className="num">{s.run}</b> {plural(s.run, 'день', 'дня', 'дней')} подряд
          </div>
          <small className="streak-best">{record ? 'Это твой рекорд 🔥' : `Рекорд — ${s.best} ${plural(s.best, 'день', 'дня', 'дней')}`}</small>
        </div>
        <Help
          title="Стрик"
          text={[
            'День выполнен, когда все главные квесты сделаны или в мини.',
            'Заморозка держит серию, но не прибавляет. Сегодня серию не ломает, пока день не кончился.',
          ]}
        />
      </div>
      <p className={`streak-today ${s.todayDone ? 'done' : ''}`}>{msg}</p>
      <div className="streak-month-head small">
        <b>Закрыто {m.title}</b>
        <span className="num">
          {m.past > 0 ? `${m.closed} из ${m.past} ${plural(m.past, 'дня', 'дней', 'дней')}` : m.closed}
        </span>
      </div>
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
