import { useState } from 'react'
import { ARC_START, ELO_FLOORS, confessionOpensAt, eloLevel, formatHM, formatRub, formatUsd, gameDayOf, incomeByDay, isConfessionOpen, monthEarned, parseHM, reelsLimitFor, wakeTargetFor } from '../engine'
import { useStore } from '../store/store'
import { go, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chart } from '../components/Chart'
import { Heatmap } from '../components/Heatmap'
import { PAGES_GOAL, PAGES_MIN, WAKE_GOAL, allDays, eloValues, pagesValues, wakeValues, window7 } from '../store/trends'

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
  const elo = eloValues(game, days, today)
  const nextFloor = ELO_FLOORS[eloLevel(game.elo).level] as number | undefined
  // «Заработано»: $ by «Курс $» when it is set, else ₽; bars per day + the running total of the calendar month
  const rate = monthEarned(data, today).usd !== undefined ? Number(data.settings.usdRate) : undefined
  const conv = (rub: number) => (rate ? Math.floor(rub / rate) : rub)
  const earnedDay = incomeByDay(data, days)
  const monthRun: (number | null)[] = []
  {
    // the month total of the first shown day starts from the incomes before it in the same month
    const first = days[0]
    let run = first ? incomeByDay(data, Array.from({ length: Number(first.slice(8)) - 1 }, (_, i) => `${first.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)).reduce((a, b) => a + b, 0) : 0
    days.forEach((d, i) => {
      if (i > 0 && d.slice(8) === '01') run = 0
      run += earnedDay[i]
      monthRun.push(future(d) ? null : conv(run))
    })
  }
  const earned = earnedDay.map((v, i) => (future(days[i]) ? null : conv(v)))
  const fmtMoney = (v: number) => (rate ? formatUsd(v) : formatRub(v))
  const anyMoney = earnedDay.some((v) => v > 0) || monthRun.some((v) => !!v)

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
            title="Эло по дням"
            subtitle={warmup ? 'В разминке Эло не меняется — линия стоит на 1000' : 'На конец дня: +0–15 за закрытый день, −10 за молчание, −5 за «Слился»'}
            days={days}
            today={today}
            series={[{ name: 'Эло', color: 'var(--c1)', kind: 'line' }]}
            values={[elo]}
            refs={nextFloor ? [{ name: `Ур. ${eloLevel(game.elo).level + 1} с ${nextFloor}`, style: 'goal', value: nextFloor }] : undefined}
          />
          <Chart
            title={`Заработано${rate ? ', $' : ', ₽'}`}
            subtitle={`Столбики — доход дня, линия — сумма с начала месяца. Сейчас за месяц: ${fmtMoney(monthRun.filter((v): v is number => v !== null).at(-1) ?? 0)}`}
            days={days}
            today={today}
            series={[
              { name: 'За день', color: 'var(--c2)', kind: 'bar' },
              { name: 'С начала месяца', color: 'var(--gold-mark)', kind: 'line' },
            ]}
            values={[earned, monthRun]}
            yMin={0}
            format={fmtMoney}
            empty={anyMoney ? undefined : { text: 'Запиши доход кнопкой «+» → «Заработал»', action: toToday }}
          />
        </div>
      </div>
    </div>
  )
}
