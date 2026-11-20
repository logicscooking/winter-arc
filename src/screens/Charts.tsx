import { useState } from 'react'
import { ARC_END, ARC_START, daysRange, formatHM, gameDayOf, parseHM, reelsLimitFor, wakeTargetFor, weekDays, weekOf } from '../engine'
import { useStore } from '../store/store'
import { useGame, useNow } from '../store/hooks'
import { Chart } from '../components/Chart'

// Two-series palette validated for the dark surface (#0b1322): L-band, chroma, CVD ΔE 8.9, contrast ≥ 3:1
const C1 = '#1ba6bd'
const C2 = '#9479ea'
const HP_C = '#e8553f'
const XP_C = '#d8952a'

export function Charts() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  const [range, setRange] = useState<'week' | 'arc'>('week')

  if (today < ARC_START) {
    return (
      <div className="stack-lg">
        <h1>Графики</h1>
        <div className="empty">Графики оживут 23 ноября, с первым днём пролога.</div>
      </div>
    )
  }
  const last = today > ARC_END ? ARC_END : today
  const days = range === 'week' ? weekDays(weekOf(last)) : daysRange(ARC_START, last)
  const val = (f: (d: string) => number | null | undefined) => days.map((d) => (d > last ? null : (f(d) ?? null)))

  const wake = val((d) => (data.days[d]?.checkin ? parseHM(data.days[d].checkin!.wake) : null))
  const wakeT = days.map((d) => wakeTargetFor(data, d) ?? null)
  const sleep = val((d) => data.days[d]?.checkin?.sleep)
  const energy = val((d) => data.days[d]?.checkin?.energy)
  const reels = val((d) => data.days[d]?.confession?.reelsMin)
  const limit = days.map((d) => reelsLimitFor(data, d))
  const pages = val((d) => data.days[d]?.quests.reading?.value ?? (data.days[d]?.confession ? 0 : null))
  const hp = val((d) => game.hpByDay[d])
  const xp = val((d) => game.xpByDay[d] ?? (d <= last ? 0 : null))

  return (
    <div className="stack-lg">
      <header className="row between wrap">
        <h1>Графики</h1>
        <div className="seg-switch" role="group" aria-label="Период">
          <button aria-pressed={range === 'week'} onClick={() => setRange('week')}>
            Неделя
          </button>
          <button aria-pressed={range === 'arc'} onClick={() => setRange('arc')}>
            Вся арка
          </button>
        </div>
      </header>
      <div className="cols">
        <div className="stack-lg">
          <Chart title="Подъём" subtitle="Время по чек-ину, пунктир — цель дня" days={days} series={[{ name: 'Подъём', color: C1, kind: 'line' }]} values={[wake]} reference={{ name: 'Цель', values: wakeT }} format={formatHM} tickUnit={30} />
          <Chart
            title="Сон и энергия"
            subtitle="Оценки утреннего чек-ина, 1–5"
            days={days}
            series={[
              { name: 'Сон', color: C1, kind: 'line' },
              { name: 'Энергия', color: C2, kind: 'line' },
            ]}
            values={[sleep, energy]}
            yMin={1}
            yMax={5}
          />
          <Chart
            title="Рилсы"
            subtitle="Минуты по исповеди. Пунктир — лимит с купленными минутами, красный столбик — сверх лимита"
            days={days}
            series={[{ name: 'Рилсы, мин', color: C1, kind: 'bar', colorAt: (v, i) => (v > limit[i] ? HP_C : C1) }]}
            values={[reels]}
            reference={{ name: 'Лимит', values: limit }}
            yMin={0}
          />
        </div>
        <div className="stack-lg">
          <Chart title="Страницы в день" subtitle="Квест «Чтение»: минимум 10, цель 25" days={days} series={[{ name: 'Страницы', color: C1, kind: 'bar' }]} values={[pages]} reference={{ name: 'Цель', values: days.map(() => 25) }} yMin={0} />
          <Chart title="HP по дням" subtitle="На конец дня" days={days} series={[{ name: 'HP', color: HP_C, kind: 'line' }]} values={[hp]} yMin={0} yMax={100} />
          <Chart title="XP по дням" subtitle="Квесты, задачи, исповедь, камбэки" days={days} series={[{ name: 'XP', color: XP_C, kind: 'bar' }]} values={[xp]} yMin={0} />
        </div>
      </div>
    </div>
  )
}
