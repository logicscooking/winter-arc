/**
 * Mini chart for the Today and Персонаж tiles: 7 slots, one series, an optional goal line.
 * It never stands alone: the tile always carries the number and a word next to it.
 */
export function Spark({
  values,
  kind,
  goal,
  min,
  max,
  color = 'var(--c1)',
  label,
}: {
  values: (number | null)[]
  kind: 'line' | 'bar'
  goal?: number
  min?: number
  max?: number
  color?: string
  label: string
}) {
  const W = 140
  const H = 40
  const nums = values.filter((v): v is number => v !== null)
  let lo = min ?? Math.min(...nums, goal ?? Infinity)
  let hi = max ?? Math.max(...nums, goal ?? -Infinity)
  if (!Number.isFinite(lo)) lo = 0
  if (!Number.isFinite(hi)) hi = 1
  if (hi - lo < 1e-6) {
    hi += 1
    lo -= 1
  }
  const pad = 4
  const n = values.length
  const band = W / n
  const x = (i: number) => band * i + band / 2
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo))
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  })
  const last = values.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1)
  const bw = Math.min(12, band - 5)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {/* slot baseline so empty days still read as days */}
      {values.map((_, i) => (
        <rect key={`s${i}`} x={x(i) - 1.5} y={H - 2} width={3} height={2} rx={1} fill="var(--line)" />
      ))}
      {goal !== undefined && <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--gold-mark)" strokeWidth={1.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      {kind === 'bar' &&
        values.map((v, i) => {
          if (v === null || v <= 0) return null
          const top = y(Math.max(lo, v))
          const base = y(Math.max(lo, 0))
          return <rect key={i} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, base - top)} rx={2.5} fill={color} />
        })}
      {kind === 'line' && (
        <>
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => (v !== null && (i === last || (values[i - 1] == null && values[i + 1] == null)) ? <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={color} stroke="var(--surface)" strokeWidth={1.5} /> : null))}
        </>
      )}
    </svg>
  )
}
