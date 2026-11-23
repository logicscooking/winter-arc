import { ELO, formatDayRu, plural } from '../engine'
import type { DayKey } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'
import { EloBlock } from '../components/Elo'

export function MissedDays({ days }: { days: DayKey[] }) {
  const game = useGame()
  const setAck = useStore((s) => s.setAck)
  const total = days.reduce((s, d) => s + (game.days[d]?.eloLoss ?? 0), 0)
  const n = days.length
  return (
    <div className="fullscreen">
      <div className="fullscreen-inner">
        <div className="stack" style={{ gap: 8, marginTop: '8vh' }}>
          <span className="chapter-name">Пока тебя не было</span>
          <div className="big-title">
            Пропущено {n} {plural(n, 'день', 'дня', 'дней')}
          </div>
          <p className="muted">Без исповеди день закрывается сам: всё неотмеченное — пропуск, плюс {ELO.noConfession} Эло за молчание. Это просто счёт, не приговор.</p>
        </div>
        <div className="panel stack">
          {days.slice(-7).map((d) => {
            const r = game.days[d]
            const net = (r?.eloGain ?? 0) + (r?.eloLoss ?? 0)
            return (
              <div key={d} className="row between">
                <span>{formatDayRu(d)}</span>
                <span className="num small" style={{ color: net < 0 ? 'var(--hp)' : 'var(--pine)' }}>
                  {net > 0 ? '+' : net < 0 ? '−' : ''}
                  {Math.abs(net)} Эло
                </span>
              </div>
            )
          })}
          {n > 7 && <p className="tiny muted">и ещё {n - 7} раньше</p>}
          <div className="divider" />
          <div className="row between">
            <span className="muted">Штрафы всего</span>
            <span className="num" style={{ color: 'var(--hp)' }}>
              −{Math.abs(total)} Эло
            </span>
          </div>
        </div>
        <EloBlock elo={game.elo} size={52} />
        <div className="grow" />
        <button className="btn primary block" onClick={() => setAck({ missedThrough: days[days.length - 1] })}>
          Погнали дальше
        </button>
      </div>
    </div>
  )
}
