import type { Measurements } from '../engine'
import { Field, NumInput } from './ui'
import { TimePicker } from './TimePicker'

export const MEASURE_FIELDS: { key: keyof Measurements; label: string; unit?: string; better: 'up' | 'down' | 'time' }[] = [
  { key: 'wake', label: 'Обычное время подъёма', better: 'time' },
  { key: 'screenMin', label: 'Экранное время в день', unit: 'мин', better: 'down' },
  { key: 'colaWeek', label: 'Кола в неделю', unit: 'банок', better: 'down' },
  { key: 'chocoWeek', label: 'Шоколад в неделю', unit: 'шт', better: 'down' },
  { key: 'pushups', label: 'Макс. отжиманий', unit: 'раз', better: 'up' },
  { key: 'pullups', label: 'Подтягиваний', unit: 'раз', better: 'up' },
  { key: 'morningFeel', label: 'Самочувствие утром, 1–10', better: 'up' },
  { key: 'mood', label: 'Состояние, 1–10', better: 'up' },
  { key: 'incomeMonth', label: 'Заработок в месяц', unit: '₽', better: 'up' },
  { key: 'bodyShape', label: 'Форма тела, 1–10', better: 'up' },
  { key: 'procrastination', label: 'Прокрастинация, 1–10', better: 'down' },
  { key: 'backgroundLoad', label: 'Чувство фоновой загруженности, 1–10', better: 'down' },
  { key: 'sleepRecovery', label: 'Восстановление после сна, 1–10', better: 'up' },
]

export function MeasurementsForm({ value, onChange }: { value: Measurements; onChange: (m: Measurements) => void }) {
  return (
    <div className="grid-2">
      {MEASURE_FIELDS.map((f) => (
        <Field key={f.key} label={f.unit ? `${f.label}, ${f.unit}` : f.label}>
          {f.key === 'wake' ? (
            <TimePicker label={f.label} optional value={value.wake ?? ''} onChange={(v) => onChange({ ...value, wake: v || undefined })} />
          ) : (
            <NumInput value={value[f.key] as number | undefined} onChange={(v) => onChange({ ...value, [f.key]: v })} min={0} />
          )}
        </Field>
      ))}
    </div>
  )
}
