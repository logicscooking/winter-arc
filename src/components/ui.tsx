import { useEffect, type ReactNode } from 'react'
import { Brain, Dumbbell, Hammer, Shield, X, Zap, type LucideIcon } from 'lucide-react'
import type { StatId } from '../engine'
import { useFx } from '../store/hooks'

export const STAT_ICON: Record<StatId, LucideIcon> = {
  energy: Zap,
  body: Dumbbell,
  mind: Brain,
  will: Shield,
  deal: Hammer,
}

export function StatIcon({ stat, size = 16 }: { stat: StatId; size?: number }) {
  const I = STAT_ICON[stat]
  return <I size={size} aria-hidden />
}

export function Bar({ value, kind = 'xp', label }: { value: number; kind?: 'xp' | 'ice'; label?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`bar ${kind}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <i style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function HpBar({ hp }: { hp: number }) {
  return (
    <div className="hp-seg" role="progressbar" aria-label="HP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hp}>
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, (hp - i * 10) / 10))
        return (
          <i key={i}>
            <b style={{ transform: `scaleX(${fill})` }} />
          </i>
        )
      })}
    </div>
  )
}

export function Sheet({ title, onClose, children, wide }: { title?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" style={wide ? { maxWidth: 680 } : undefined}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Rating({ value, onChange, max = 5, label }: { value?: number; onChange: (v: number) => void; max?: number; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="rating" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${max}, 1fr)` }}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value?: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function NumInput({ value, onChange, placeholder, min = 0, step }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; min?: number; step?: number }) {
  return (
    <input
      className="input num"
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  )
}

export function Floaters() {
  const items = useFx((s) => s.items)
  return (
    <div className="floaters" aria-live="polite">
      {items.map((f) => (
        <div key={f.id} className={`floater ${f.tone}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
    </div>
  )
}

export function Ring({ progress, size = 220, stroke = 8, color = 'var(--ice)', children }: { progress: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="timer-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--raised-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      {children}
    </div>
  )
}

export function formatMMSS(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
