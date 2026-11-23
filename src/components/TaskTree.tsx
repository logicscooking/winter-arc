import { useState, type FormEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Crosshair, MoreHorizontal, Pencil, Plus, Sun, Trash2 } from 'lucide-react'
import { MAX_DEPTH, childrenOf, depthOf, needsSplitHint, plural, projectTasksFor, taskXp } from '../engine'
import type { DayKey, Task, TaskScope } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward } from '../store/hooks'
import { useUi } from '../store/ui'

interface Props {
  scope: TaskScope
  roots: Task[]
  /** day for picking the Deal of the day */
  pickDay?: DayKey
  dealId?: string
  locked?: boolean
  /** v0.10: project tasks that show up on «Сегодня» for pickDay (filled by TaskTree) */
  onToday?: Set<string>
}

export function AddTask({ scope, parentId, placeholder, onDone, autoFocus }: { scope: TaskScope; parentId: string | null; placeholder: string; onDone?: () => void; autoFocus?: boolean }) {
  const [v, setV] = useState('')
  const add = useStore((s) => s.addTask)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = v.trim()
    if (!t) return onDone?.()
    add(scope, parentId, t, nowWithOffset())
    setV('')
  }
  return (
    <form onSubmit={submit} className="row" style={{ padding: '4px 0' }}>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onBlur={() => !v && onDone?.()} aria-label={placeholder} maxLength={120} enterKeyHint="done" />
      <button className="btn sm primary" type="submit" aria-label="Добавить" disabled={!v.trim()} style={{ minWidth: 48 }}>
        <Plus size={20} />
      </button>
    </form>
  )
}

function Node({ t, props, depth }: { t: Task; props: Props; depth: number }) {
  const tasks = useStore((s) => s.data.tasks)
  const toggle = useStore((s) => s.toggleTask)
  const del = useStore((s) => s.deleteTask)
  const rename = useStore((s) => s.renameTask)
  const setDeal = useStore((s) => s.setDeal)
  const setPick = useStore((s) => s.setPick)
  const pickedToday = useStore((s) => !!(props.pickDay && s.data.days[props.pickDay]?.picks?.[t.id]))
  const say = useUi((s) => s.say)
  const confirm = useUi((s) => s.confirm)
  const [adding, setAdding] = useState(false)
  const [actions, setActions] = useState(false)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const kids = childrenOf(tasks, t.id, t.scope)
  const isProject = t.scope === 'deal' && depth === 0
  const canAdd = depth + 1 <= MAX_DEPTH[t.scope]
  const canPick = props.pickDay && t.scope === 'deal' && depth >= 1 && !t.doneAt
  const picked = props.dealId === t.id
  const canToday = !!props.pickDay && t.scope === 'deal' && depth >= 1 && !t.doneAt && !picked
  const shownToday = !!props.onToday?.has(t.id)

  const onTick = (el: HTMLElement) => {
    if (props.locked) return
    const wasDone = !!t.doneAt
    if (!wasDone) {
      const xp = taskXp(tasks, t)
      if (xp) reward(el, { xp })
    }
    toggle(t.id, nowWithOffset())
    say(wasDone ? `Вернул: ${t.title}` : `Готово: ${t.title}`, () => toggle(t.id, nowWithOffset()))
  }

  const remove = async () => {
    const ok = await confirm({
      title: isProject ? 'Удалить проект?' : 'Удалить задачу?',
      body: kids.length ? `«${t.title}» и все подзадачи (${descCount(tasks, t.id)}) исчезнут. Очки сферы за уже закрытые пропадут.` : `«${t.title}» исчезнет из списка.`,
      ok: 'Удалить',
      danger: true,
    })
    if (ok) del(t.id)
  }

  return (
    <div>
      <div className={`node ${t.doneAt ? 'done' : ''} ${isProject ? 'project' : ''}`}>
        {isProject ? (
          <button className="tick" onClick={() => setOpen(!open)} aria-label={open ? 'Свернуть' : 'Развернуть'}>
            {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        ) : (
          <button className="tick" onClick={(e) => onTick(e.currentTarget)} aria-label={t.doneAt ? 'Вернуть' : 'Выполнено'} aria-pressed={!!t.doneAt}>
            <span>{t.doneAt && <Check size={14} strokeWidth={3} />}</span>
          </button>
        )}
        <div className="grow" style={{ padding: '6px 0' }}>
          {editing ? (
            <input
              className="input"
              defaultValue={t.title}
              autoFocus
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v) rename(t.id, v)
                setEditing(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <div className="node-title">{t.title}</div>
          )}
          <div className="row wrap" style={{ gap: 6, marginTop: 2 }}>
            {picked && <span className="tag base">Дело дня</span>}
            {!picked && pickedToday && <span className="tag today-tag">на сегодня</span>}
            {!picked && !pickedToday && shownToday && !t.doneAt && <span className="tag">в «Сегодня»</span>}
            {t.postponed > 0 && !t.doneAt && (
              <span className={`tag ${t.postponed >= 3 ? 'ember' : ''}`}>
                перенесено {t.postponed} {plural(t.postponed, 'раз', 'раза', 'раз')}
              </span>
            )}
            {!isProject && depth === 1 && t.scope === 'deal' && <span className="tiny muted">+30 к сфере</span>}
          </div>
          {needsSplitHint(t) && (
            <p className="tiny" style={{ color: 'var(--gold)', marginTop: 4 }}>
              Третий перенос. Разбей на шаги по 15 минут или удали — честно.
            </p>
          )}
        </div>
        {!props.locked && (
          <div className="row" style={{ gap: 0 }}>
            {canToday && (
              <button
                className={`icon-btn ${pickedToday ? 'today-pick' : ''}`}
                onClick={() => {
                  setPick(props.pickDay!, t.id, !pickedToday, nowWithOffset())
                  say(pickedToday ? `Убрано с «Сегодня»: ${t.title}` : `На сегодня: ${t.title}`, () => useStore.getState().setPick(props.pickDay!, t.id, pickedToday, nowWithOffset()))
                }}
                aria-label={pickedToday ? 'Убрать с «Сегодня»' : 'На сегодня'}
                aria-pressed={pickedToday}
                title="На сегодня"
              >
                <Sun size={19} />
              </button>
            )}
            {canPick && (
              <button className={`icon-btn ${picked ? 'deal-pick' : ''}`} onClick={() => setDeal(props.pickDay!, picked ? null : t.id)} aria-label={picked ? 'Убрать из Дела дня' : 'Сделать Делом дня'} aria-pressed={picked} title="Дело дня">
                <Crosshair size={19} />
              </button>
            )}
            {isProject && canAdd && (
              <button
                className="icon-btn"
                onClick={() => {
                  setAdding(true)
                  setOpen(true)
                }}
                aria-label={`Добавить задачу в «${t.title}»`}
                title="Задача"
              >
                <Plus size={20} />
              </button>
            )}
            <button className="icon-btn" onClick={() => setActions(!actions)} aria-label={`Действия: ${t.title}`} aria-expanded={actions}>
              <MoreHorizontal size={19} />
            </button>
          </div>
        )}
        {actions && !props.locked && (
          <div className="node-actions">
            {canAdd && (
              <button
                className="btn sm"
                onClick={() => {
                  setAdding(true)
                  setOpen(true)
                  setActions(false)
                }}
              >
                <Plus size={16} /> {isProject ? 'Задача' : 'Подзадача'}
              </button>
            )}
            <button
              className="btn sm ghost"
              onClick={() => {
                setEditing(true)
                setActions(false)
              }}
            >
              <Pencil size={15} /> Переименовать
            </button>
            <button
              className="btn sm ghost"
              style={{ color: 'var(--hp)' }}
              onClick={() => {
                setActions(false)
                remove()
              }}
            >
              <Trash2 size={15} /> Удалить
            </button>
          </div>
        )}
      </div>
      {(open || !isProject) && (kids.length > 0 || adding) && (
        <div className="node-children">
          {kids.map((k) => (
            <Node key={k.id} t={k} props={props} depth={depth + 1} />
          ))}
          {adding && <AddTask scope={t.scope} parentId={t.id} placeholder={isProject ? 'Задача проекта' : 'Подзадача'} onDone={() => setAdding(false)} autoFocus />}
        </div>
      )}
    </div>
  )
}

function descCount(tasks: Task[], id: string): number {
  const kids = tasks.filter((t) => t.parentId === id)
  return kids.reduce((s, k) => s + 1 + descCount(tasks, k.id), 0)
}

export function TaskTree(props: Props) {
  const tasks = useStore((s) => s.data.tasks)
  const days = useStore((s) => s.data.days)
  const onToday = props.pickDay && props.scope === 'deal' ? new Set(projectTasksFor({ tasks, days }, props.pickDay).map((t) => t.id)) : undefined
  const p = onToday ? { ...props, onToday } : props
  return (
    <div className="tree">
      {props.roots.map((t) => (
        <Node key={t.id} t={t} props={p} depth={depthOf(tasks, t.id)} />
      ))}
    </div>
  )
}
