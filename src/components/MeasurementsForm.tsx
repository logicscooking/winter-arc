import type { Measurements } from '../engine'
import { Field, NumInput } from './ui'

export const MEASURE_FIELDS: { key: keyof Measurements; label: string; unit?: string; better: 'up' | 'down' | 'time' }[] = [
  { key: 'wake', label: 'Обычное время подъёма', better: 'time' },
  { key: 'screenMin', label: 'Экранное время в день', unit: 'мин', better: 'down' },
  { key: 'colaWeek', label: 'Кола в неделю', unit: 'банок', better: 'down' },
  { key: 'chocoWeek', label: 'Шоколад в неделю', unit: 'шт', better: 'down' },
  { key: 'pushups', label: 'Макс. отжиманий', unit: 'раз', better: 'up' },
  { key: 'plankSec', label: 'Планка', unit: 'сек', better: 'up' },
  { key: 'pullups', label: 'Подтягиваний', unit: 'раз', better: 'up' },
  { key: 'waistCm', label: 'Талия', unit: 'см', better: 'down' },
  { key: 'morningFeel', label: 'Самочувствие утром, 1–10', better: 'up' },
  { key: 'booksYear', label: 'Книг за последний год', better: 'up' },
]

export function MeasurementsForm({ value, onChange }: { value: Measurements; onChange: (m: Measurements) => void }) {
  return (
    <div className="grid-2">
      {MEASURE_FIELDS.map((f) => (
        <Field key={f.key} label={f.unit ? `${f.label}, ${f.unit}` : f.label}>
          {f.key === 'wake' ? (
            <input className="input num" type="time" value={value.wake ?? ''} onChange={(e) => onChange({ ...value, wake: e.target.value || undefined })} />
          ) : (
            <NumInput value={value[f.key] as number | undefined} onChange={(v) => onChange({ ...value, [f.key]: v })} min={0} />
          )}
        </Field>
      ))}
    </div>
  )
}
