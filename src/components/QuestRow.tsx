import { useState } from 'react'
import { Check, Minus, MoreHorizontal, X } from 'lucide-react'
import { formatHM, questShards, questStreak, questXp, statusFromValue } from '../engine'
import type { DayKey, GameState, MarkStatus, PlannedQuest, Quest } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, reward } from '../store/hooks'
import { useUi } from '../store/ui'
import { StatIcon } from './ui'

interface Props {
  plan: PlannedQuest
  quest: Quest
  status?: MarkStatus
  auto: boolean
  day: DayKey
  game: GameState
  locked: boolean
  wakeTarget?: number
}

export function QuestRow({ plan, quest, status, auto, day, game, locked, wakeTarget }: Props) {
  const setMark = useStore((s) => s.setMark)
  const setValue = useStore((s) => s.setValue)
  const value = useStore((s) => s.data.days[day]?.quests[quest.id]?.value)
  const book = useStore((s) => s.data.books.find((b) => b.id === s.data.activeBookId))
  const open = useUi((s) => s.open)
  const say = useUi((s) => s.say)
  const [menu, setMenu] = useState(false)
  const [entry, setEntry] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const numeric = quest.kind === 'reading' || quest.kind === 'number'
  const streak = questStreak(game, quest.id)
  const doneXp = questXp(plan.role, plan.base, 'done')

  const complete = (el: Element, s: MarkStatus) => {
    setMark(day, quest.id, s, nowWithOffset())
    reward(el, { xp: questXp(plan.role, plan.base, s), shards: questShards(plan.role, s) })
    setMenu(false)
  }

  const onCheck = (el: HTMLElement) => {
    if (locked) return
    if (status === 'done' || status === 'mini') {
      if (!auto) setMark(day, quest.id, null, nowWithOffset())
      else setMenu(true)
      return
    }
    if (numeric) {
      setEntry(true)
      setDraft(value ? String(value) : '')
      return
    }
    switch (quest.kind) {
      case 'wake':
        open({ kind: 'checkin', day })
        return
      case 'deal':
        say('Выбери Дело дня и закрой его — квест отметится сам')
        go('/deal')
        return
      case 'reels':
      case 'bedtime':
        say('Отметится по вечерней исповеди')
        return
    }
    complete(el, 'done')
  }

  const saveValue = (el: Element) => {
    const v = Number(draft)
    if (!Number.isFinite(v)) return
    const prevStatus = status
    setValue(day, quest.id, v, nowWithOffset())
    const s = statusFromValue(quest, v)
    if (s && s !== prevStatus) reward(el, { xp: questXp(plan.role, plan.base, s), shards: questShards(plan.role, s) })
    setEntry(false)
  }

  const cls = ['quest', plan.role, status ?? '', status === 'done' || status === 'mini' ? 'done' : ''].join(' ')
  let hint: string | null = null
  if (quest.kind === 'wake' && wakeTarget !== undefined) hint = `цель ${formatHM(wakeTarget)} ±30`
  if (quest.kind === 'reading') hint = value ? `${value} стр${book ? `, ${book.title}` : ''}` : book ? book.title : 'мин 10, цель 25'
  if (quest.kind === 'number' && value) hint = `${value} ${quest.unit ?? ''}`
  if (quest.kind === 'reels' || quest.kind === 'bedtime') hint = 'по исповеди'

  return (
    <div className={cls}>
      <button className="check" onClick={(e) => onCheck(e.currentTarget)} aria-label={`${quest.title}: ${status === 'done' ? 'выполнено' : status === 'mini' ? 'мини-версия' : status === 'skip' ? 'пропуск' : 'отметить'}`} aria-pressed={status === 'done' || status === 'mini'} disabled={locked && !status}>
        <span>
          {status === 'done' && <Check size={17} strokeWidth={3} />}
          {status === 'mini' && <Minus size={17} strokeWidth={3} />}
          {status === 'skip' && <X size={15} strokeWidth={3} />}
        </span>
      </button>
      <div className="grow" onClick={() => !locked && setMenu(!menu)} style={{ cursor: locked ? 'default' : 'pointer', padding: '4px 0' }}>
        <div className="quest-title">{quest.title}</div>
        <div className="quest-sub">
          <StatIcon stat={quest.stat} size={13} />
          {plan.base && <span className="tag base">база ×0.5</span>}
          {auto && status && <span className="tag auto">авто</span>}
          {hint && <span>{hint}</span>}
          {!hint && <span>{doneXp} XP</span>}
        </div>
      </div>
      <div className="row" style={{ gap: 0 }}>
        {streak.last7 > 0 && (
          <span className="streak" title={`Серия: ${streak.current}, лучшая ${streak.best}`}>
            {streak.last7}
            <span className="muted">/7</span>
          </span>
        )}
        {!locked && (
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Варианты" aria-expanded={menu}>
            <MoreHorizontal size={18} />
          </button>
        )}
      </div>
      {entry && (
        <form
          className="quest-extra"
          onSubmit={(e) => {
            e.preventDefault()
            saveValue(e.currentTarget)
          }}
        >
          <input className="input num" style={{ width: 120 }} type="number" inputMode="numeric" min={0} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={quest.unit ?? 'значение'} placeholder={quest.unit} />
          {quest.kind === 'reading' &&
            [10, 25].map((n) => (
              <button key={n} type="button" className="chip" onClick={() => setDraft(String(n))}>
                {n}
              </button>
            ))}
          <button className="btn sm primary" type="submit">
            Записать
          </button>
          <button className="btn sm ghost" type="button" onClick={() => setEntry(false)}>
            Отмена
          </button>
        </form>
      )}
      {menu && !entry && (
        <div className="quest-extra" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <p className="small" style={{ color: 'var(--ink-2)' }}>
            {quest.ifThen}
          </p>
          <p className="tiny muted">
            Серия {streak.current}, лучшая {streak.best}, {streak.last7} из {streak.active7 || 7} за неделю
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            {status !== 'done' && !numeric && quest.kind !== 'deal' && (
              <button className="btn sm primary" onClick={(e) => complete(e.currentTarget, 'done')}>
                Сделал (+{doneXp} XP)
              </button>
            )}
            {numeric && (
              <button className="btn sm primary" onClick={() => { setEntry(true); setDraft(value ? String(value) : '') }}>
                Ввести {quest.unit}
              </button>
            )}
            {status !== 'mini' && (
              <button className="btn sm" onClick={(e) => complete(e.currentTarget, 'mini')}>
                Мини: {quest.mini}
              </button>
            )}
            {status !== 'skip' && (
              <button className="btn sm ghost" onClick={() => { setMark(day, quest.id, 'skip', nowWithOffset()); setMenu(false) }}>
                Пропуск
              </button>
            )}
            {status && !auto && (
              <button className="btn sm ghost" onClick={() => { setMark(day, quest.id, null, nowWithOffset()); setMenu(false) }}>
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
