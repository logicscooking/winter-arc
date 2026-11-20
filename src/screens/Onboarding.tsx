import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ARC_START, WAKE_GOAL_MIN, addDays, formatDayShort, formatHM, gameDayOf, parseHM, wakeTarget } from '../engine'
import type { Measurements } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset } from '../store/hooks'
import { Field } from '../components/ui'
import { MeasurementsForm } from '../components/MeasurementsForm'

const AVATARS = ['🐺', '🦊', '🐻‍❄️', '🦉', '🐧', '🦌', '🐉', '🦅', '🗻', '🔥', '❄️', '🌑']

const RULES = [
  {
    title: 'HP и «не пропускай дважды»',
    body: [
      'У тебя 100 HP. Пропущенный главный квест снимает 10, тот же квест второй день подряд — 20.',
      'Один пропуск — случайность, два подряд — начало новой привычки. Мини-версия на 2 минуты спасает и HP, и серию.',
      'HP на нуле — падение: минус 20% ранга главы и половина осколков. Три идеальных дня возвращают тебя с 50 HP.',
    ],
  },
  {
    title: 'Слился → Камбэк',
    body: [
      'Сорвался — жми «Слился». Урон −10 HP сразу, без допросов.',
      'Дальше час на камбэк: 10 отжиманий, 2 страницы, стакан воды. Сделал — +5 HP, а срыв в логе становится отыгранным.',
      'Тянет, но ещё держишься — кнопка «Тяга»: 10 минут дыхания, и волна проходит.',
    ],
  },
  {
    title: 'Исповедь',
    body: [
      'Каждый вечер с 20:00 — 30 секунд: рилсы, сахар, кола, во сколько ляжешь.',
      'Исповедь закрывает день. Не было исповеди — −10 HP. Можно задним числом до 16:00 следующего дня.',
      'Никто ничего не блокирует. Честно признаться выгоднее, чем скрыть.',
    ],
  },
]

export function Onboarding() {
  const onboard = useStore((s) => s.onboard)
  const [step, setStep] = useState(0)
  const [nick, setNick] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [wake, setWake] = useState('08:30')
  const [m, setM] = useState<Measurements>({})
  const today = gameDayOf(nowWithOffset())
  const planStart = today > ARC_START ? today : ARC_START

  const planRows: [string, string][] = []
  if (parseHM(wake) > WAKE_GOAL_MIN) {
    for (let k = 0; k < 40; k += 2) {
      const t = wakeTarget(wake, planStart, addDays(planStart, k))
      if (t === WAKE_GOAL_MIN) {
        planRows.push([`с ${formatDayShort(addDays(planStart, k))}`, formatHM(t)])
        break
      }
      planRows.push([`${formatDayShort(addDays(planStart, k))}–${formatDayShort(addDays(planStart, k + 1))}`, formatHM(t)])
    }
  }

  const finish = () => {
    onboard({ nick: nick.trim() || 'Странник', avatar, usualWake: wake, onboardDay: today }, { ...m, wake: m.wake ?? wake })
    window.location.hash = '/today'
  }

  const total = 3 + RULES.length
  const next = () => (step < total - 1 ? setStep(step + 1) : finish())

  return (
    <div className="fullscreen">
      <div className="fullscreen-inner">
        <div className="row between" style={{ minHeight: 40 }}>
          {step > 0 ? (
            <button className="back" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={18} /> Назад
            </button>
          ) : (
            <span />
          )}
          <span className="num tiny muted">
            {step + 1}/{total}
          </span>
        </div>

        {step === 0 && (
          <>
            <div className="stack" style={{ gap: 10 }}>
              <div className="big-title">Winter Arc</div>
              <p className="muted">98 дней зимы: режим, тело, разум и своё дело. Боль дисциплины вместо боли сожаления.</p>
            </div>
            <Field label="Ник">
              <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Как тебя звать в арке" maxLength={24} autoFocus />
            </Field>
            <div className="field">
              <span>Аватар</span>
              <div className="chips" role="group" aria-label="Аватар">
                {AVATARS.map((a) => (
                  <button key={a} className="chip" style={{ fontSize: '1.4rem', width: 52, padding: 0 }} aria-pressed={avatar === a} onClick={() => setAvatar(a)}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="stack" style={{ gap: 10 }}>
              <h1>Во сколько встаёшь сейчас?</h1>
              <p className="muted">Цель — 07:00. Сдвигаемся на 30 минут каждые 2 дня, без рывков. Цель дня будет в квесте «Подъём».</p>
            </div>
            <Field label="Обычный подъём">
              <input className="input num" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            </Field>
            {planRows.length > 0 ? (
              <div className="panel kv small">
                {planRows.map(([d, t]) => (
                  <div key={d} style={{ display: 'contents' }}>
                    <span className="muted">{d}</span>
                    <span className="num" style={{ textAlign: 'right', color: t === '07:00' ? 'var(--ice)' : undefined }}>
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small" style={{ color: 'var(--ice)' }}>
                Ты уже встаёшь к 07:00. Цель — держать её каждый день, и в выходные тоже.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className="stack" style={{ gap: 10 }}>
              <h1>Замеры на старте</h1>
              <p className="muted">Всё необязательно, дозаполнишь в «Ещё → Замеры». В финале сравним до и после.</p>
            </div>
            <MeasurementsForm value={{ wake, ...m }} onChange={setM} />
          </>
        )}

        {step >= 3 && (
          <div className="stack-lg">
            <h1>{RULES[step - 3].title}</h1>
            {RULES[step - 3].body.map((p) => (
              <p key={p} style={{ color: 'var(--ink-2)', fontSize: '1.05rem' }}>
                {p}
              </p>
            ))}
          </div>
        )}

        <div className="grow" />
        <button className="btn primary block" onClick={next}>
          {step === total - 1 ? 'Начать арку' : step === 2 ? 'Дальше' : 'Дальше'}
        </button>
        {step === 2 && (
          <button className="btn ghost block" style={{ marginTop: -8 }} onClick={() => setStep(3)}>
            Заполню потом
          </button>
        )}
      </div>
    </div>
  )
}
