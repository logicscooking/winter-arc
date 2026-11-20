import { useEffect, useState } from 'react'
import { ARC_START, COMEBACK_WINDOW_MS, HP, PRESET_SWAPS, SHARDS, WHAT_LABEL, WHY_LABEL, XP, gameDayOf } from '../engine'
import type { SlipWhat, SlipWhy } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chips, Field, Ring, Sheet, formatMMSS } from '../components/ui'

const WHATS = (Object.keys(WHAT_LABEL) as SlipWhat[]).map((id) => ({ id, label: WHAT_LABEL[id] }))
const WHYS = (Object.keys(WHY_LABEL) as SlipWhy[]).map((id) => ({ id, label: WHY_LABEL[id] }))

export const SWAPS = PRESET_SWAPS

export function SlipFlow() {
  const close = useUi((s) => s.close)
  const open = useUi((s) => s.open)
  const addSlip = useStore((s) => s.addSlip)
  const [what, setWhat] = useState<SlipWhat>()
  const [why, setWhy] = useState<SlipWhy>()
  const [note, setNote] = useState('')
  const warmup = gameDayOf(nowWithOffset()) < ARC_START

  const submit = (el: Element) => {
    if (!what || !why) return
    const id = addSlip(what, why, note.trim(), nowWithOffset())
    if (!warmup) reward(el, { hp: HP.slip })
    open({ kind: 'comeback', slipId: id })
  }

  return (
    <Sheet title="Слился" onClose={close}>
      <div className="stack-lg">
        <p className="small muted">{warmup ? 'Разминка: срыв запишется в лог триггеров, HP не снимется. Камбэк всё равно даст XP.' : 'Признаться выгоднее, чем скрыть: урон сразу, но камбэк в течение часа вернёт половину.'}</p>
        <Chips label="Что" options={WHATS} value={what} onChange={setWhat} />
        <Chips label="Почему" options={WHYS} value={why} onChange={setWhy} />
        <Field label="Заметка (необязательно)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что было перед этим" />
        </Field>
        <button className="btn danger block" disabled={!what || !why} onClick={(e) => submit(e.currentTarget)}>
          {warmup ? 'Признаться' : 'Признаться, −10 HP'}
        </button>
      </div>
    </Sheet>
  )
}

export function ComebackFlow({ slipId }: { slipId: string }) {
  const close = useUi((s) => s.close)
  const slip = useStore((s) => s.data.slips.find((x) => x.id === slipId))
  const defaultSwap = useStore((s) => s.data.settings.defaultSwap)
  const comeback = useStore((s) => s.comeback)
  const [, force] = useState(0)
  const [swap, setSwap] = useState<string>(SWAPS.includes(defaultSwap) ? defaultSwap : SWAPS[0])
  const [custom, setCustom] = useState('')
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  if (!slip) return null
  const left = slip.at + COMEBACK_WINDOW_MS - nowWithOffset().getTime()
  const expired = left <= 0 && !slip.comebackAt

  const done = (el: Element) => {
    const s = swap === 'custom' ? custom.trim() || 'Своя замена' : swap
    comeback(slip.id, s, nowWithOffset())
    reward(el, { hp: slip.day < ARC_START ? undefined : HP.comeback, shards: SHARDS.comeback, xp: XP.comeback })
    setTimeout(close, 700)
  }

  return (
    <Sheet title="Камбэк" onClose={close}>
      <div className="stack-lg">
        {slip.comebackAt ? (
          <p>Камбэк засчитан ✅ Срыв в логе отмечен как отыгранный.</p>
        ) : expired ? (
          <p className="muted">Час прошёл. Камбэк уже не засчитать, но следующий шаг всё равно твой.</p>
        ) : (
          <>
            <Ring progress={left / COMEBACK_WINDOW_MS} color="var(--hp)">
              <div className="center">
                <div className="t">{formatMMSS(left)}</div>
                <div className="tiny muted">на камбэк</div>
              </div>
            </Ring>
            <Chips
              label="2-минутная замена"
              options={[...SWAPS.map((s) => ({ id: s, label: s })), { id: 'custom', label: 'Своя' }]}
              value={swap}
              onChange={setSwap}
            />
            {swap === 'custom' && <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Что сделаешь за 2 минуты" autoFocus />}
            <button className="btn primary block" onClick={(e) => done(e.currentTarget)}>
              {slip.day < ARC_START ? 'Сделал: +2 ❄, +5 XP Воли' : 'Сделал: +5 HP, +2 ❄, +5 XP Воли'}
            </button>
            <button className="btn ghost block" onClick={close}>
              Сделаю позже (таймер на «Сегодня»)
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
