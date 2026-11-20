import { useState } from 'react'
import { ARC_START, confessionOpensAt, formatHM, gameDayOf, isConfessionOpen, parseHM, reelsLimitFor, wakeTargetFor } from '../engine'
import { useStore } from '../store/store'
import { go, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chart } from '../components/Chart'
import { Heatmap } from '../components/Heatmap'
import { PAGES_GOAL, PAGES_MIN, WAKE_GOAL, allDays, anyXp, hpValues, pagesValues, wakeValues, window7, xpValues } from '../store/trends'

export function Charts() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const now = useNow()
  const today = gameDayOf(now)
  const open = useUi((s) => s.open)
  const [range, setRange] = useState<'week' | 'all'>('week')
  const warmup = today < ARC_START

  const days = range === 'week' ? window7(data, today) : allDays(data, today)
  const future = (d: string) => d > today
  const val = (f: (d: string) => number | null | undefined) => days.map((d) => (future(d) ? null : (f(d) ?? null)))

  const wake = wakeValues(data, days, today)
  const wakeT = days.map((d) => wakeTargetFor(data, d) ?? null)
  const baseWake = data.baseline.wake ? parseHM(data.baseline.wake) : undefined
  const sleep = val((d) => data.days[d]?.checkin?.sleep)
  const energy = val((d) => data.days[d]?.checkin?.energy)
  const reels = val((d) => data.days[d]?.confession?.reelsMin)
  const limit = days.map((d) => reelsLimitFor(data, d))
  const pages = pagesValues(data, days, today)
  const hp = hpValues(game, days, today)
  const xpRaw = xpValues(game, days, today)
  const xp = anyXp(xpRaw) ? xpRaw : xpRaw.map(() => null)

  const checkinBtn = !data.days[today]?.checkin ? (
    <button className="btn sm primary" onClick={() => open({ kind: 'checkin', day: today })}>
      Утренний чек-ин
    </button>
  ) : undefined
  const confOpen = isConfessionOpen(today, now) && !data.days[today]?.confession
  const confessBtn = confOpen ? (
    <button className="btn sm primary" onClick={() => open({ kind: 'confession', day: today })}>
      Исповедь
    </button>
  ) : (
    <span className="tiny muted">Исповедь откроется в {formatHM(confessionOpensAt(today).getHours() * 60)}</span>
  )
  const toToday = (
    <button className="btn sm primary" onClick={() => go('/today')}>
      К квестам
    </button>
  )

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 12 }}>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <div className="seg-switch" role="group" aria-label="Период">
            <button aria-pressed={range === 'week'} onClick={() => setRange('week')}>
              7 дней
            </button>
            <button aria-pressed={range === 'all'} onClick={() => setRange('all')}>
              Всё время
            </button>
          </div>
        </div>
        {warmup && <p className="small muted">Разминка до 23 ноября тоже рисуется: каждая отметка — точка на графике.</p>}
      </header>
      <Heatmap />
      <div className="cols">
        <div className="stack-lg">
          <Chart
            title="Подъём"
            subtitle="Время из утреннего чек-ина"
            days={days}
            today={today}
            series={[{ name: 'Подъём', color: 'var(--c1)', kind: 'line' }]}
            values={[wake]}
            refs={[
              { name: 'Цель 07:00', style: 'goal', value: WAKE_GOAL },
              ...(wakeT.some((v) => v !== null && v !== WAKE_GOAL) ? [{ name: 'Цель дня', style: 'target' as const, values: wakeT }] : []),
              ...(baseWake !== undefined ? [{ name: `Было ${formatHM(baseWake)}`, style: 'base' as const, value: baseWake }] : []),
            ]}
            format={formatHM}
            tickUnit={30}
            empty={{ text: 'Отметь утренний чек-ин — тут появится первая точка', action: checkinBtn }}
          />
          <Chart
            title="Сон и энергия"
            subtitle="Оценки утреннего чек-ина, 1–5"
            days={days}
            today={today}
            series={[
              { name: 'Сон', color: 'var(--c1)', kind: 'line' },
              { name: 'Энергия', color: 'var(--c2)', kind: 'line' },
            ]}
            values={[sleep, energy]}
            yMin={1}
            yMax={5}
            empty={{ text: 'Оцени сон и энергию в утреннем чек-ине', action: checkinBtn }}
          />
          <Chart
            title="Рилсы"
            subtitle={`Минуты из исповеди. Красный — сверх лимита${data.baseline.screenMin ? `. До арки экран: ${data.baseline.screenMin} мин в день` : ''}`}
            days={days}
            today={today}
            series={[{ name: 'Рилсы, мин', color: 'var(--c1)', kind: 'bar', colorAt: (v, i) => (v > limit[i] ? 'var(--c-hp)' : 'var(--c1)') }]}
            values={[reels]}
            refs={[{ name: `Лимит ${data.settings.reelsLimit} мин`, style: 'goal', values: limit }]}
            yMin={0}
            empty={{ text: 'Закрой день исповедью — тут появится первый столбик', action: confessBtn }}
          />
        </div>
        <div className="stack-lg">
          <Chart
            title="Страницы в день"
            subtitle="Квест «Чтение»"
            days={days}
            today={today}
            series={[{ name: 'Страницы', color: 'var(--c1)', kind: 'bar' }]}
            values={[pages]}
            refs={[
              { name: `Цель ${PAGES_GOAL}`, style: 'goal', value: PAGES_GOAL },
              { name: `Минимум ${PAGES_MIN}`, style: 'target', value: PAGES_MIN },
            ]}
            yMin={0}
            empty={{ text: 'Запиши страницы в квесте «Чтение»', action: toToday }}
          />
          <Chart
            title="HP по дням"
            subtitle={warmup ? 'В разминке HP не тратится — линия стоит на 100' : 'На конец дня'}
            days={days}
            today={today}
            series={[{ name: 'HP', color: 'var(--c-hp)', kind: 'line' }]}
            values={[hp]}
            yMin={0}
            yMax={100}
          />
          <Chart
            title="XP по дням"
            subtitle="Квесты, задачи, исповедь, камбэки"
            days={days}
            today={today}
            series={[{ name: 'XP', color: 'var(--c-xp)', kind: 'bar' }]}
            values={[xp]}
            yMin={0}
            yMax={xp.some((v) => v) ? undefined : 100}
            empty={{ text: 'Отметь любой квест — тут вырастет первый столбик', action: toToday }}
          />
        </div>
      </div>
    </div>
  )
}
