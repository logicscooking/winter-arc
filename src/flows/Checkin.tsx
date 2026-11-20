import { useState } from 'react'
import { formatHM, gameDayOf, nowHM, parseHM, questXp, wakeTargetFor } from '../engine'
import type { DayKey } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward } from '../store/hooks'
import { useUi } from '../store/ui'
import { Field, Rating, Sheet } from '../components/ui'

export function CheckinSheet({ day }: { day: DayKey }) {
  const close = useUi((s) => s.close)
  const data = useStore((s) => s.data)
  const save = useStore((s) => s.saveCheckin)
  const setAck = useStore((s) => s.setAck)
  const existing = data.days[day]?.checkin
  const [wake, setWake] = useState(existing?.wake ?? nowHM(nowWithOffset()))
  const [sleep, setSleep] = useState<number | undefined>(existing?.sleep)
  const [energy, setEnergy] = useState<number | undefined>(existing?.energy)
  const target = wakeTargetFor(data, day)
  const diff = target !== undefined ? parseHM(wake) - target : 0
  const onTarget = diff <= 30

  const dismiss = () => {
    if (!existing && day === gameDayOf(nowWithOffset())) setAck({ checkinSkipped: day })
    close()
  }

  const submit = (el: Element) => {
    if (!sleep || !energy) return
    save(day, { wake, sleep, energy }, nowWithOffset())
    if (!existing && onTarget && !data.days[day]?.quests.wake) reward(el, { xp: questXp('main', false, 'done'), shards: 3 })
    close()
  }

  return (
    <Sheet title="Доброе утро" onClose={dismiss}>
      <div className="stack-lg">
        <Field label="Во сколько встал">
          <input className="input num" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </Field>
        {target !== undefined && (
          <p className="small" style={{ marginTop: -10, color: onTarget ? 'var(--ice)' : 'var(--mist)' }}>
            Цель дня {formatHM(target)} ±30 мин.{' '}
            {onTarget ? (diff < -30 ? `Раньше цели на ${-diff} мин — засчитано.` : 'Подъём засчитан.') : diff > 0 && diff <= 60 ? 'Не попал, но засчитается мини-версия.' : `Позже цели на ${diff} мин.`}
          </p>
        )}
        <Rating label="Как спал" value={sleep} onChange={setSleep} />
        <Rating label="Энергия" value={energy} onChange={setEnergy} />
        <button className="btn primary block" disabled={!sleep || !energy} onClick={(e) => submit(e.currentTarget)}>
          Записать
        </button>
      </div>
    </Sheet>
  )
}
