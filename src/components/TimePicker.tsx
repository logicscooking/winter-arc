/**
 * 24-hour time picker: hours 00–23 and minutes in steps, two native selects.
 * iOS shows <input type=time> in AM/PM when the device locale says so; selects are always 24h
 * and open the system wheel on a phone, so the time is one thumb-roll away.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function TimePicker({ value, onChange, label, step = 5, optional = false }: { value: string; onChange: (v: string) => void; label?: string; step?: number; optional?: boolean }) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  const h = m ? Math.min(23, Number(m[1])) : null
  const min = m ? Math.min(59, Number(m[2])) : null
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  // a time off the grid (07:12 from a check-in) stays selectable as is
  if (min !== null && !minutes.includes(min)) minutes.push(min), minutes.sort((a, b) => a - b)
  const set = (hh: number | null, mm: number) => onChange(hh === null ? '' : `${pad(hh)}:${pad(mm)}`)
  return (
    <div className="tpick" role="group" aria-label={label}>
      <select className="select input num" value={h === null ? '' : String(h)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value), min ?? 0)} aria-label={label ? `${label}: часы` : 'Часы'}>
        {(optional || h === null) && <option value="">—</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {pad(x)}
          </option>
        ))}
      </select>
      <span className="tpick-sep" aria-hidden>
        :
      </span>
      <select className="select input num" value={min === null ? '' : String(min)} disabled={h === null} onChange={(e) => set(h, Number(e.target.value))} aria-label={label ? `${label}: минуты` : 'Минуты'}>
        {h === null && <option value="">—</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {pad(x)}
          </option>
        ))}
      </select>
    </div>
  )
}
