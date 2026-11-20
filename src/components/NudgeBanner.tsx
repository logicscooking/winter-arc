import { useEffect, useState } from 'react'
import { Hand, X } from 'lucide-react'
import { nudgeText } from '../engine'
import { useSocial } from '../cloud/state'
import type { Nudge } from '../cloud/state'
import { markNudgesSeen } from '../cloud/party'
import { onIncomingNudge } from '../cloud/boot'
import { go } from '../store/hooks'

/** A friend nudged you: a banner at the top until you open the party or dismiss it */
export function NudgeBanner({ hidden }: { hidden?: boolean }) {
  const nudges = useSocial((s) => s.nudges)
  const [fresh, setFresh] = useState<Nudge>()
  useEffect(() => onIncomingNudge((n) => setFresh(n)), [])
  const n = fresh && nudges.some((x) => x.id === fresh.id) ? fresh : nudges[0]
  const [dismissed, setDismissed] = useState<number>()
  if (hidden || !n || dismissed === n.id) return null
  const more = nudges.length - 1
  return (
    <div className="nudge-banner" role="status" aria-live="polite" key={n.id}>
      <span className="nudge-ava" aria-hidden>
        {n.from_avatar}
      </span>
      <button className="grow nudge-main" onClick={() => go('/party')}>
        <span className="nudge-title">
          <Hand size={14} aria-hidden /> {n.from_name} пнул тебя
        </span>
        <span className="nudge-text">
          «{nudgeText(n.kind)}»{more > 0 ? ` и ещё ${more}` : ''}
        </span>
      </button>
      <button
        className="icon-btn"
        aria-label="Скрыть"
        onClick={() => {
          setDismissed(n.id)
          void markNudgesSeen([n.id]).catch(() => undefined)
        }}
      >
        <X size={18} />
      </button>
    </div>
  )
}
