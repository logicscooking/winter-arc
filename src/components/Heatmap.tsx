import { useMemo, useState } from 'react'
import { ARC_START, RU_WEEKDAYS, formatDayRu, heatmap, weekday } from '../engine'
import type { HeatCell } from '../engine'
import { useStore } from '../store/store'
import { useGame } from '../store/hooks'

/** v0.5: XP heat map of the arc, 14 weeks × 7 days; tap a cell to see the day and its XP */
export function Heatmap() {
  const game = useGame()
  const onboard = useStore((s) => s.data.profile?.onboardDay)
  const h = useMemo(() => heatmap(game.xpByDay, game.today, onboard), [game, onboard])
  const [sel, setSel] = useState<HeatCell | null>(null)
  const pick = (c: HeatCell) => setSel(sel?.day === c.day ? null : c)
  const label = (c: HeatCell) => `${RU_WEEKDAYS[weekday(c.day)]}, ${formatDayRu(c.day)}${c.warmup ? ' · разминка' : ''}: ${c.future ? 'ещё впереди' : `${c.xp} очков`}`
  const cellBtn = (c: HeatCell) => (
    <button
      key={c.day}
      className={`heat-cell l${c.level} ${c.future ? 'future' : ''} ${c.day === game.today ? 'today' : ''} ${sel?.day === c.day ? 'sel' : ''}`}
      onClick={() => pick(c)}
      aria-label={label(c)}
      aria-pressed={sel?.day === c.day}
    />
  )
  return (
    <section className="panel stack heat" aria-label="Тепловая карта активности">
      <div className="row between">
        <div>
          <h3>Тепловая карта арки</h3>
          <span className="tiny muted">98 дней с {formatDayRu(ARC_START)}, цвет — очки сфер за день</span>
        </div>
        <span className="num small">{h.total} очков</span>
      </div>
      <div className="heat-wrap">
        <div className="heat-days" aria-hidden>
          {RU_WEEKDAYS.map((d, i) => (
            <span key={d}>{i % 2 === 0 ? d : ''}</span>
          ))}
        </div>
        <div className="heat-grid" role="grid" aria-label="14 недель по 7 дней">
          {h.weeks.map((w, i) => (
            <div key={i} className="heat-col" role="row" aria-label={`Неделя ${i + 1}`}>
              {w.map(cellBtn)}
            </div>
          ))}
        </div>
      </div>
      {h.warmup.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          <span className="tiny muted">Разминка</span>
          <div className="heat-row">{h.warmup.map(cellBtn)}</div>
        </div>
      )}
      <div className="row between">
        <p className="small heat-sel" aria-live="polite">
          {sel ? label(sel) : 'Тапни клетку — покажу день и очки'}
        </p>
        <span className="heat-legend" aria-hidden>
          меньше
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`heat-cell l${l}`} />
          ))}
          больше
        </span>
      </div>
    </section>
  )
}
