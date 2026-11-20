import { formatDayRu, plural } from '../engine'
import type { DayKey } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { HpBar } from '../components/ui'

export function MissedDays({ days }: { days: DayKey[] }) {
  const game = useGame()
  const setAck = useStore((s) => s.setAck)
  const total = days.reduce((s, d) => s + (game.days[d]?.closeHpDelta ?? 0), 0)
  const n = days.length
  return (
    <div className="fullscreen">
      <div className="fullscreen-inner">
        <div className="stack" style={{ gap: 8, marginTop: '8vh' }}>
          <span className="chapter-name">Пока тебя не было</span>
          <div className="big-title">
            Пропущено {n} {plural(n, 'день', 'дня', 'дней')}
          </div>
          <p className="muted">Без исповеди день закрывается сам: всё неотмеченное — пропуск, плюс −10 HP за молчание. Это просто счёт, не приговор.</p>
        </div>
        <div className="panel stack">
          {days.slice(-7).map((d) => (
            <div key={d} className="row between">
              <span>{formatDayRu(d)}</span>
              <span className="num small" style={{ color: 'var(--ember)' }}>
                {game.days[d]?.closeHpDelta ? `${game.days[d].closeHpDelta} HP` : game.days[d]?.hpEnd === 0 ? 'в падении' : '0 HP'}
              </span>
            </div>
          ))}
          {n > 7 && <p className="tiny muted">и ещё {n - 7} раньше</p>}
          <div className="divider" />
          <div className="row between">
            <span className="muted">Всего</span>
            <span className="num" style={{ color: 'var(--ember)' }}>
              {total} HP
            </span>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <span className="muted small">HP сейчас</span>
            <span className="num hp-v">{game.hp}</span>
          </div>
          <HpBar hp={game.hp} />
          {game.fallen && <p className="small" style={{ color: 'var(--ember)' }}>Это падение. Три идеальных дня подряд — и ты снова в игре с 50 HP.</p>}
        </div>
        <div className="grow" />
        <button className="btn primary block" onClick={() => setAck({ missedThrough: days[days.length - 1] })}>
          Погнали дальше
        </button>
      </div>
    </div>
  )
}
