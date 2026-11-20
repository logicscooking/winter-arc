import { Check, Crosshair } from 'lucide-react'
import { XP, childrenOf, gameDayOf, questXp, taskXp, planFor } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useNow } from '../store/hooks'
import { AddTask, TaskTree } from '../components/TaskTree'

export function Deal() {
  const data = useStore((s) => s.data)
  const toggle = useStore((s) => s.toggleTask)
  const now = useNow()
  const today = gameDayOf(now)
  const projects = childrenOf(data.tasks, null, 'deal')
  const dealId = data.days[today]?.dealTaskId
  const deal = dealId ? data.tasks.find((t) => t.id === dealId) : undefined
  const parent = deal?.parentId ? data.tasks.find((t) => t.id === deal.parentId) : undefined
  const locked = !!data.days[today]?.confession
  const dealPlan = planFor(data, today).find((p) => p.id === 'deal')
  const open = data.tasks.filter((t) => t.scope === 'deal' && t.parentId && !t.doneAt).length

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Дело</h1>
        <p className="muted">Проекты → задачи → подзадачи. Каждый день одна задача становится Делом дня — убийцей «потом».</p>
      </header>

      <section className={`panel ${deal ? 'glow' : ''}`}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Crosshair color="var(--gold)" aria-hidden style={{ marginTop: 2 }} />
          <div className="grow stack" style={{ gap: 6 }}>
            <span className="small muted">Дело дня</span>
            {deal ? (
              <>
                <h2>{deal.title}</h2>
                {parent && <span className="small muted">{parent.title}</span>}
                <p className="tiny muted">
                  Закрыл — +{taskXp(data.tasks, deal)} XP Дела{dealPlan ? ` и квест «Дело дня» (+${questXp(dealPlan.role, dealPlan.base, 'done')} XP)` : ''}. Подзадачи по +{XP.subtask} XP.
                </p>
              </>
            ) : (
              <p>{open ? 'Не выбрано. Нажми прицел у задачи ниже — она станет Делом дня.' : projects.length ? 'Добавь задачу в проект кнопкой «+», потом нажми прицел.' : 'Начни с проекта: впиши его ниже.'}</p>
            )}
          </div>
        </div>
        {deal && !locked && (
          <button
            className={`btn block ${deal.doneAt ? 'ghost' : 'amber'}`}
            style={{ marginTop: 14 }}
            onClick={(e) => {
              if (!deal.doneAt) reward(e.currentTarget, { xp: taskXp(data.tasks, deal) + (dealPlan ? questXp(dealPlan.role, dealPlan.base, 'done') : 0), shards: dealPlan ? (dealPlan.role === 'main' ? 3 : 2) : 0 })
              toggle(deal.id, nowWithOffset())
            }}
          >
            <Check size={18} /> {deal.doneAt ? 'Закрыто. Вернуть?' : 'Закрыть Дело дня'}
          </button>
        )}
      </section>

      <section>
        <div className="section-title">
          <h2>Проекты</h2>
          <span className="small muted">прицел = Дело дня</span>
        </div>
        {projects.length === 0 && <div className="empty">Проект — это то, что двигает тебя к деньгам или мечте. Например «Портфолио» или «Канал».</div>}
        <TaskTree scope="deal" roots={projects} pickDay={today} dealId={dealId} locked={false} />
        <AddTask scope="deal" parentId={null} placeholder="Новый проект" />
      </section>
    </div>
  )
}
