import type { ReactNode } from 'react'
import { TRANSITION_MIN, formatDayRu } from '../engine'
import { useStore } from '../store/store'
import type { DayKey } from '../engine'
import { Px } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'
import { useApplyTemplate } from './PlanDay'

interface Tip {
  icon: SpriteName
  text: ReactNode
}

/** «Как строить день»: one line per rule, the key part in bold */
const GROUPS: { title: string; icon: SpriteName; tips: Tip[] }[] = [
  {
    title: 'Работа',
    icon: 'hammer',
    tips: [
      { icon: 'clock', text: <><b>Не больше 5–6 часов</b> работы в день</> },
      { icon: 'moon', text: <><b>Не работать после 17:00</b></> },
      { icon: 'brain', text: <><b>Важные решения — до 17:00</b>, вечером не решаем</> },
      { icon: 'star', text: <><b>Самое трудное — в первый блок</b></> },
      { icon: 'dial', text: <><b>Блок 60–90 минут</b>, потом перерыв 10–15</> },
      { icon: 'trophy', text: <><b>Один главный приоритет</b> на блок</> },
    ],
  },
  {
    title: 'Вечер и сон',
    icon: 'moon',
    tips: [
      { icon: 'phone', text: <><b>Телефон отложить за 30 минут</b> до сна, лучше за 1–2 часа</> },
      { icon: 'campfire', text: <><b>Приглушённый свет за 2 часа</b> до сна</> },
      { icon: 'choco', text: <><b>Ужин за 3 часа</b> до сна</> },
    ],
  },
  {
    title: 'Тело',
    icon: 'run',
    tips: [
      { icon: 'boot', text: <><b>Прогулка: хотя бы 2 000 шагов</b> в день</> },
      { icon: 'sun', text: <><b>10 минут дневного света</b> утром</> },
    ],
  },
  {
    title: 'Кофеин',
    icon: 'coffee',
    tips: [{ icon: 'coffee', text: <><b>Кофе — только до 12:00</b></> }],
  },
]

export function PlanTips({ day, today, onApplied }: { day: DayKey; today: DayKey; onApplied: () => void }) {
  const apply = useApplyTemplate()
  const sex = useStore((s) => s.data.settings.morningFinal) === 'f' ? 'f' : 'm'
  const min = TRANSITION_MIN[sex]
  const transition: Tip = {
    icon: 'dumbbell',
    text:
      sex === 'f' ? (
        <>
          Перед каждым блоком — <b>переход: {min.squat} приседаний по Неумывакину + {min.push} отжиманий</b>
        </>
      ) : (
        <>
          Перед каждым блоком — <b>переход: {min.push} отжиманий + {min.squat} приседаний по Неумывакину</b>
        </>
      ),
  }
  const groups = GROUPS.map((g) => (g.title === 'Работа' ? { ...g, tips: [...g.tips, transition] } : g))
  return (
    <div className="stack-lg pd-tips">
      {groups.map((g) => (
        <section key={g.title} className="pd-tip-group">
          <h2>
            <Px name={g.icon} size={24} /> {g.title}
          </h2>
          <ul>
            {g.tips.map((t, i) => (
              <li key={i}>
                <Px name={t.icon} size={22} />
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn primary block" onClick={async () => (await apply(day, 'rules')) && onApplied()}>
          Собрать день по этим правилам
        </button>
        <p className="tiny muted center">
          {day === today ? 'На сегодня' : `На ${formatDayRu(day)}`}: работа до 17:00 и не больше 5 ч, прогулка, тихий вечер за 2 ч до сна.
        </p>
      </div>
    </div>
  )
}
