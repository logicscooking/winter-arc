import { useState } from 'react'
import { Check, Minus, X } from 'lucide-react'
import { BAR_LADDERS, BAR_STEP_BONUS, SHARDS, barMin, barStep, formatHM, questReward, questStreak, questXp, statusFromValue } from '../engine'
import type { DayKey, GameState, MarkStatus, PlannedQuest, Quest } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, reward, useFx } from '../store/hooks'
import { useUi } from '../store/ui'
import { Px, STAT_SPRITE, questSprite } from '../pixel/Pixel'

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

const STATUS_WORD: Record<MarkStatus, string> = { done: 'выполнено', mini: 'мини-версия', skip: 'пропуск' }

export function QuestRow({ plan, quest, status, auto, day, game, locked, wakeTarget }: Props) {
  const setMark = useStore((s) => s.setMark)
  const setValue = useStore((s) => s.setValue)
  const restoreMark = useStore((s) => s.restoreMark)
  const value = useStore((s) => s.data.days[day]?.quests[quest.id]?.value)
  const book = useStore((s) => s.data.books.find((b) => b.id === s.data.activeBookId))
  const open = useUi((s) => s.open)
  const say = useUi((s) => s.say)
  const [menu, setMenu] = useState(false)
  const [entry, setEntry] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const numeric = quest.kind === 'reading' || quest.kind === 'number'
  const streak = questStreak(game, quest.id)
  const bars = useStore((s) => s.data.bars)
  const ladder = BAR_LADDERS[quest.id]
  const step = ladder ? barStep({ bars }, quest.id, day) : 0
  const barNorm = ladder && bars?.some((b) => b.questId === quest.id) ? ladder.steps[step] : undefined
  const doneXp = Math.round(questXp(plan.role, plan.base, 'done') * (1 + BAR_STEP_BONUS * step))
  const completed = status === 'done' || status === 'mini'

  /** every change to a mark gets an undo */
  const withUndo = (text: string, fn: () => void) => {
    const prev = useStore.getState().data.days[day]?.quests[quest.id]
    const snapshot = prev ? { ...prev } : undefined
    fn()
    say(text, () => restoreMark(day, quest.id, snapshot))
  }

  /** XP floaters + the reward card (stat progress, ❄, CRITICAL, «Судьба») */
  const celebrate = (el: Element, s: MarkStatus, at: number) => {
    const r0 = questReward(day, plan, s)
    const r = s === 'done' ? { ...r0, xp: Math.round(r0.xp * (1 + BAR_STEP_BONUS * step)) } : r0
    const z = useStore.getState().data.days[day]?.destiny
    const destiny = z?.ref === 'quest' && z.id === quest.id && at >= z.startedAt && at <= z.startedAt + z.minutes * 60_000 ? SHARDS.destiny : 0
    reward(el, { xp: r.xp })
    useFx.getState().showPop({ title: quest.title, stat: plan.stat, fromXp: game.xpByStat[plan.stat], xp: r.xp, shards: r.shards, crit: r.crit, destiny })
  }

  const complete = (el: Element, s: MarkStatus) => {
    const now = nowWithOffset()
    withUndo(s === 'mini' ? `Мини-версия: ${quest.title}` : `Готово: ${quest.title}`, () => setMark(day, quest.id, s, now))
    celebrate(el, s, now.getTime())
    setMenu(false)
  }

  const onCheck = (el: HTMLElement) => {
    if (locked) return
    if (completed) {
      if (!auto) withUndo(`Отметка снята: ${quest.title}`, () => setMark(day, quest.id, null, nowWithOffset()))
      else setMenu(true)
      return
    }
    if (numeric) {
      setEntry(true)
      setMenu(false)
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
        say('Отметится сам по вечерней исповеди')
        return
    }
    complete(el, 'done')
  }

  const saveValue = (el: Element) => {
    const v = Number(draft)
    if (!Number.isFinite(v) || v < 0) return
    const prevStatus = status
    const now = nowWithOffset()
    withUndo(v > 0 ? `Записано: ${v} ${quest.unit ?? ''}`.trim() : 'Значение стёрто', () => setValue(day, quest.id, v, now))
    const s = statusFromValue(quest, v, barMin({ bars }, quest.id, day))
    if (s && s !== prevStatus) celebrate(el, s, now.getTime())
    setEntry(false)
  }

  const cls = ['quest', plan.role, status ?? '', completed ? 'done' : ''].join(' ')
  let hint: string | null = null
  if (quest.kind === 'wake' && wakeTarget !== undefined) hint = `цель ${formatHM(wakeTarget)} ±30 мин`
  if (quest.kind === 'reading') hint = value ? `${value} стр${book ? ` · ${book.title}` : ''}` : `${book ? `${book.title} · ` : ''}${barNorm && step > 0 ? `планка ${barNorm.norm}` : `мин ${quest.min ?? 10}, цель ${quest.goal ?? 25} стр`}`
  if (quest.id === 'workout' && barNorm && !completed) hint = barNorm.norm
  if (quest.kind === 'number') hint = value ? `${value} ${quest.unit ?? ''}` : `цель ${quest.goal ?? quest.min} ${quest.unit ?? ''}`
  if (quest.kind === 'reels' || quest.kind === 'bedtime') hint = 'отметится по исповеди'
  if (quest.kind === 'deal' && !completed) hint = 'закрой Дело дня'

  return (
    <div className={cls}>
      <span className="q-icon">
        <Px name={questSprite(quest)} size={32} />
      </span>
      <button className="quest-body" onClick={() => !locked && setMenu(!menu)} disabled={locked} aria-expanded={menu} aria-label={`${quest.title}: варианты — мини-версия, пропуск`} style={{ cursor: locked ? 'default' : 'pointer' }}>
        <div className="quest-title">{quest.title}</div>
        <div className="quest-sub">
          <span className="xp-chip" title="XP за выполнение">
            <Px name={STAT_SPRITE[quest.stat]} size={14} />+{doneXp}
          </span>
          {plan.role === 'main' && (
            <span className="ice-chip" title="Осколки за выполнение">
              <Px name="shard" size={14} />+{SHARDS.main}
            </span>
          )}
          {streak.last7 > 0 && (
            <span className="streak-chip" title={`Серия: ${streak.current}, лучшая ${streak.best}`} aria-label={`${streak.last7} из последних 7 дней`}>
              <Px name="flame" size={14} />
              {streak.last7}/7
            </span>
          )}
          {plan.base && <span className="tag base">база ×0.5</span>}
          {barNorm && step > 0 && <span className="tag bar-tag">планка {step} · +{step * 10}%</span>}
          {auto && status && <span className="tag auto">авто</span>}
          {hint && <span>{hint}</span>}
        </div>
      </button>
      <button
        className="check"
        onClick={(e) => onCheck(e.currentTarget)}
        aria-label={`${quest.title}: ${status ? STATUS_WORD[status] : 'отметить'}`}
        aria-pressed={completed}
        disabled={locked && !status}
      >
        <span>
          {status === 'done' && <Check size={22} strokeWidth={3.5} />}
          {status === 'mini' && <Minus size={22} strokeWidth={3.5} />}
          {status === 'skip' && <X size={20} strokeWidth={3.5} />}
        </span>
      </button>
      {entry && (
        <form
          className="quest-extra"
          onSubmit={(e) => {
            e.preventDefault()
            saveValue(e.currentTarget)
          }}
        >
          <input
            className="input num"
            style={{ width: 110 }}
            type="number"
            inputMode="numeric"
            min={0}
            max={quest.kind === 'reading' ? 2000 : 200000}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            aria-label={quest.unit ?? 'значение'}
            placeholder={quest.unit}
          />
          {(quest.kind === 'reading' ? [quest.min ?? 10, quest.goal ?? 25] : [quest.goal ?? quest.min ?? 0]).filter(Boolean).map((n) => (
            <button key={n} type="button" className="chip" onClick={() => setDraft(String(n))}>
              {n}
            </button>
          ))}
          <button className="btn sm primary" type="submit" disabled={draft === ''}>
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
            Серия {streak.current}, лучшая {streak.best} · {streak.last7} из {streak.active7 || 7} за неделю
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            {status !== 'done' && !numeric && quest.kind !== 'deal' && (
              <button className="btn sm primary" onClick={(e) => complete(e.currentTarget, 'done')}>
                Сделал · +{doneXp} XP
              </button>
            )}
            {numeric && (
              <button
                className="btn sm primary"
                onClick={() => {
                  setEntry(true)
                  setDraft(value ? String(value) : '')
                }}
              >
                Ввести {quest.unit}
              </button>
            )}
            {status !== 'mini' && (
              <button className="btn sm" onClick={(e) => complete(e.currentTarget, 'mini')}>
                Мини: {quest.mini}
              </button>
            )}
            {status !== 'skip' && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  withUndo(`Пропуск: ${quest.title}`, () => setMark(day, quest.id, 'skip', nowWithOffset()))
                  setMenu(false)
                }}
              >
                Пропуск
              </button>
            )}
            {status && !auto && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  withUndo(`Отметка снята: ${quest.title}`, () => setMark(day, quest.id, null, nowWithOffset()))
                  setMenu(false)
                }}
              >
                Снять отметку
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
