
import { ARC_START, ARC_WEEKS, FINAL_MEASURE_FROM, STATS, booksFinishedInArc, gameDayOf, levelOf, parseHM, questStreak } from '../engine'
import type { Measurements } from '../engine'
import { useStore } from '../store/store'
import { useGame, useNow } from '../store/hooks'
import { MEASURE_FIELDS, MeasurementsForm } from '../components/MeasurementsForm'

function delta(key: keyof Measurements, a?: number | string, b?: number | string): { text: string; good?: boolean } {
  if (a === undefined || b === undefined || a === '' || b === '') return { text: '' }
  const f = MEASURE_FIELDS.find((x) => x.key === key)!
  const na = typeof a === 'string' ? parseHM(a) : a
  const nb = typeof b === 'string' ? parseHM(b) : b
  const d = nb - na
  if (d === 0) return { text: '=' }
  const good = f.better === 'up' ? d > 0 : d < 0
  const text = f.better === 'time' ? `${d > 0 ? '+' : '−'}${Math.abs(d)} мин` : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)}`
  return { text, good }
}

export function Finale() {
  const data = useStore((s) => s.data)
  const setM = useStore((s) => s.setMeasurements)
  const setAck = useStore((s) => s.setAck)
  const game = useGame()
  const today = gameDayOf(useNow())
  const open = today >= FINAL_MEASURE_FROM
  const lvl = levelOf(game.xp)
  const bestQuests = data.quests
    .filter((q) => q.enabled)
    .map((q) => ({ q, s: questStreak(game, q.id) }))
    .sort((a, b) => b.s.best - a.s.best)
    .slice(0, 3)

  if (!open) {
    return (
      <div className="stack-lg">
        <div className="empty">Финал откроется 22 февраля, в последнюю неделю арки.</div>
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <p className="small muted page-sub">23 ноября → 28 февраля</p>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {(
          [
            ['Общий уровень', lvl.level],
            ['XP за арку', game.xp],
            ['Книг дочитано', booksFinishedInArc(data, ARC_START)],
            ['Боссов повержено', `${game.trophies.length}/${ARC_WEEKS}`],
            ['Лучшая серия честности', game.bestHonesty],
            ['Падений', game.falls.length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="panel tight stack" style={{ gap: 2 }}>
            <span className="tiny muted">{k}</span>
            <span className="num" style={{ fontSize: '1.4rem' }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="cols">
        <section className="stack">
          <h2>До и после</h2>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="muted tiny">
                  <th style={{ textAlign: 'left', padding: '4px 0' }}>Замер</th>
                  <th style={{ textAlign: 'right' }}>Ноябрь</th>
                  <th style={{ textAlign: 'right' }}>Февраль</th>
                  <th style={{ textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {MEASURE_FIELDS.map((f) => {
                  const a = data.baseline[f.key]
                  const b = data.final[f.key]
                  const d = delta(f.key, a, b)
                  return (
                    <tr key={f.key} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: '8px 0' }}>{f.label}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {a ?? '—'}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {b ?? '—'}
                      </td>
                      <td className="num tiny" style={{ textAlign: 'right', paddingLeft: 8, color: d.good === undefined ? 'var(--mist)' : d.good ? 'var(--pine)' : 'var(--hp)' }}>
                        {d.text}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <h3>Финальные замеры</h3>
          <MeasurementsForm value={data.final} onChange={(m) => setM('final', m)} />
        </section>

        <section className="stack">
          <h2>Статы</h2>
          {STATS.map((s) => (
            <div key={s.id} className="row between panel tight">
              <span>{s.name}</span>
              <span className="num">ур. {levelOf(game.xpByStat[s.id]).level}</span>
            </div>
          ))}
          <h2 style={{ marginTop: 8 }}>Лучшие серии</h2>
          {bestQuests.map(({ q, s }) => (
            <div key={q.id} className="row between panel tight">
              <span>{q.title}</span>
              <span className="num">{s.best}</span>
            </div>
          ))}
          <div className="panel glow stack" style={{ marginTop: 8 }}>
            <h3>Режим поддержки</h3>
            <p className="small muted">После арки держишь базу без HP и боссов: подъём, чтение, Дело. Весна — не повод сдаваться.</p>
            {data.ack.supportMode ? (
              <span className="tag auto" style={{ alignSelf: 'flex-start' }}>
                включён
              </span>
            ) : (
              <button className="btn primary" onClick={() => setAck({ supportMode: true, finaleSeen: true })}>
                Включить режим поддержки
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
