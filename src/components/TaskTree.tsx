import { useState, type FormEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Crosshair, Plus, Trash2 } from 'lucide-react'
import { MAX_DEPTH, childrenOf, depthOf, needsSplitHint, plural, taskXp } from '../engine'
import type { DayKey, Task, TaskScope } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward } from '../store/hooks'

interface Props {
  scope: TaskScope
  roots: Task[]
  /** day for picking the Deal of the day */
  pickDay?: DayKey
  dealId?: string
  locked?: boolean
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
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onBlur={() => !v && onDone?.()} aria-label={placeholder} />
      <button className="btn sm" type="submit" aria-label="Добавить">
        <Plus size={18} />
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
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const kids = childrenOf(tasks, t.id, t.scope)
  const isProject = t.scope === 'deal' && depth === 0
  const canAdd = depth + 1 <= MAX_DEPTH[t.scope]
  const canPick = props.pickDay && t.scope === 'deal' && depth >= 1 && !t.doneAt
  const picked = props.dealId === t.id

  const onTick = (el: HTMLElement) => {
    if (props.locked) return
    if (!t.doneAt) {
      const xp = taskXp(tasks, t)
      if (xp) reward(el, { xp })
    }
    toggle(t.id, nowWithOffset())
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
            <div className="node-title" onDoubleClick={() => setEditing(true)}>
              {t.title}
            </div>
          )}
          <div className="row wrap" style={{ gap: 6, marginTop: 2 }}>
            {picked && <span className="tag base">Дело дня</span>}
            {t.postponed > 0 && !t.doneAt && (
              <span className={`tag ${t.postponed >= 3 ? 'ember' : ''}`}>
                перенесено {t.postponed} {plural(t.postponed, 'раз', 'раза', 'раз')}
              </span>
            )}
            {!isProject && depth === 1 && t.scope === 'deal' && <span className="tiny muted">30 XP</span>}
          </div>
          {needsSplitHint(t) && (
            <p className="tiny" style={{ color: 'var(--amber)', marginTop: 4 }}>
              Третий перенос. Разбей на шаги по 15 минут или удали — честно.
            </p>
          )}
        </div>
        {!props.locked && (
          <div className="row" style={{ gap: 0 }}>
            {canPick && (
              <button className={`icon-btn ${picked ? 'deal-pick' : ''}`} onClick={() => setDeal(props.pickDay!, picked ? null : t.id)} aria-label={picked ? 'Убрать из Дела дня' : 'Сделать Делом дня'} title="Дело дня">
                <Crosshair size={18} />
              </button>
            )}
            {canAdd && (
              <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Добавить подзадачу" title="Подзадача">
                <Plus size={18} />
              </button>
            )}
            <button className="icon-btn" onClick={() => (kids.length === 0 || confirm(`Удалить «${t.title}» вместе с подзадачами?`)) && del(t.id)} aria-label="Удалить">
              <Trash2 size={16} />
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

export function TaskTree(props: Props) {
  const tasks = useStore((s) => s.data.tasks)
  return (
    <div className="tree">
      {props.roots.map((t) => (
        <Node key={t.id} t={t} props={props} depth={depthOf(tasks, t.id)} />
      ))}
    </div>
  )
}
