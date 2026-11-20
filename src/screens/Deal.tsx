import { useState } from 'react'
import { Check, ChevronRight, Crosshair, Plus, X } from 'lucide-react'
import {
  CHEST,
  GOAL_META,
  MAX_ACTIVE_SKILLS,
  STATS,
  XP,
  activeSkills,
  chestsFor,
  childrenOf,
  frozenDays,
  gameDayOf,
  planFor,
  questXp,
  skillView,
  taskXp,
  themeOf,
  chapterOf,
} from '../engine'
import type { ChestType, Skill } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { AddTask, TaskTree } from '../components/TaskTree'
import { FlowChip, PracticeSheet, RankBadge, SkillLevelBar, Strikes, ThemeCard, skillSprite, startFlowAndGo } from '../components/skills'
import { Px } from '../pixel/Pixel'
import { RankChanceCard } from '../components/skillPlus'
import { MoneyCard, MoneySheet } from '../components/Money'
import { SkillTreeMini } from '../components/SkillTreeView'

/** «Путь»: skills (progression) on top, the Deal of the day and projects below */
export function Deal() {
  const data = useStore((s) => s.data)
  const game = useGame()
  const today = gameDayOf(useNow())
  const active = activeSkills(data)
  const later = (data.skills ?? []).filter((s) => s.status === 'later')
  const frozen = frozenDays(game)
  const theme = themeOf(data, chapterOf(today))
  const [filter, setFilter] = useState<'all' | 'skills' | 'deal'>('all')

  return (
    <div className="stack-lg">
      <p className="small muted page-sub">Квесты держат уровень. Навыки растут: практика → обратная связь → ступень.</p>
      <FlowChip />

      <div className="filter-row" role="group" aria-label="Что показать">
        {(
          [
            ['all', 'Все'],
            ['skills', 'Навыки'],
            ['deal', 'Дело'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className="fchip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <a className="fchip add" href="#/skill-new">
          <Plus size={18} strokeWidth={3} aria-hidden /> Навык
        </a>
      </div>

      <div className="cols">
        <div className="stack-lg" hidden={filter === 'deal'}>
          <section className="stack">
            <div className="section-title">
              <h2>Навыки</h2>
              <span className="num small muted">
                {active.length}/{MAX_ACTIVE_SKILLS} в фокусе
              </span>
            </div>
            {active.length === 0 && (
              <div className="empty skill-empty">
                <Px name="fir" size={44} />
                <p>Навык — это то, чего пока нет, а не талант. Значит, понятно, как качать. Первый ставится в 2 тапа.</p>
              </div>
            )}
            <div className="skill-list">
              {active.map((s) => (
                <SkillCard key={s.id} skill={s} theme={theme === s.id} view={skillView(data, s.id, today, frozen)} xp={game.skillXp[s.id] ?? 0} />
              ))}
            </div>
            {active.length >= MAX_ACTIVE_SKILLS && <p className="tiny muted">3 в фокусе — максимум. Новый навык встанет в «Позже».</p>}
            {later.length > 0 && (
              <details className="later">
                <summary>Позже · {later.length}</summary>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {later.map((s) => (
                    <a key={s.id} className="list-btn" href={`#/skill/${s.id}`}>
                      <Px name={skillSprite(s)} size={26} />
                      <span className="grow">
                        {s.title}
                        <small>выкинул 80% — оставил главное</small>
                      </span>
                      <ChevronRight size={18} color="var(--mist)" aria-hidden />
                    </a>
                  ))}
                </div>
              </details>
            )}
          </section>
          <ThemeCard />
          <Chests />
        </div>

        <div className="stack-lg" hidden={filter === 'skills'}>
          <DealOfDay />
          <section>
            <div className="section-title">
              <h2>Проекты</h2>
              <span className="small muted">прицел = Дело дня</span>
            </div>
            <Projects />
          </section>
          <MoneyCard />
        </div>
      </div>
      <DealFab />
    </div>
  )
}

/** «+»: a new skill, a project or an import */
function DealFab() {
  const [dial, setDial] = useState(false)
  const [money, setMoney] = useState(false)
  const addProject = () => {
    setDial(false)
    const el = document.getElementById('add-project')?.querySelector<HTMLInputElement>('input')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }
  return (
    <div className="fab-wrap">
      {dial && (
        <div className="fab-menu" role="menu">
          <a className="fab-item" role="menuitem" href="#/skill-new">
            <Px name="fir" size={22} /> Навык
          </a>
          <button className="fab-item" role="menuitem" onClick={addProject}>
            <Px name="hammer" size={22} /> Проект
          </button>
          <a className="fab-item" role="menuitem" href="#/skill-new?import=1">
            <Px name="gift" size={22} /> Импорт дерева
          </a>
          <button className="fab-item" role="menuitem" onClick={() => (setDial(false), setMoney(true))}>
            <Px name="coin" size={22} /> Заработал
          </button>
        </div>
      )}
      {money && <MoneySheet onClose={() => setMoney(false)} />}
      <button className={`fab round${dial ? ' on' : ''}`} onClick={() => setDial(!dial)} aria-expanded={dial} aria-label={dial ? 'Закрыть меню' : 'Добавить: навык, проект, импорт, доход'}>
        {dial ? <X size={28} strokeWidth={3} /> : <Plus size={30} strokeWidth={3} />}
      </button>
    </div>
  )
}

function SkillCard({ skill, view, theme, xp }: { skill: Skill; view: ReturnType<typeof skillView>; theme: boolean; xp: number }) {
  if (!view) return null
  return (
    <div className="skill-card">
      <span className="ear">Навык · {STATS.find((x) => x.id === skill.stat)?.name ?? 'Дело'}</span>
      <a className="skill-card-main" href={`#/skill/${skill.id}`}>
        <span className="skill-ico">
          <Px name={skillSprite(skill)} size={42} />
        </span>
        <span className="grow stack" style={{ gap: 5 }}>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <b className="skill-title">{skill.title}</b>
            {theme && <span className="tag warm">тема ×1,5</span>}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <span className="num small">ур. {view.level}</span>
            <span className="grow">
              <SkillLevelBar view={view} />
            </span>
          </span>
          <span className="tiny muted row" style={{ gap: 8 }}>
            <span>
              {view.practices} практ. · {xp} XP
            </span>
            <Strikes n={view.strikes.strikes} />
          </span>
          <RankChanceCard view={view} compact />
          <SkillTreeMini view={view} />
        </span>
        <RankBadge rank={view.rank} />
      </a>
      <button className="play-btn" aria-label={`Поток: ${skill.title}`} onClick={() => startFlowAndGo(undefined, skill.id)}>
        <Px name="play" size={24} />
      </button>
    </div>
  )
}

const CHEST_NAME: Record<ChestType, string> = { repeat: GOAL_META.repeat.name, short: GOAL_META.short.name, mid: GOAL_META.mid.name }

function Chests() {
  const data = useStore((s) => s.data)
  const openChest = useStore((s) => s.openChest)
  const say = useUi((s) => s.say)
  const today = gameDayOf(useNow())
  if (!(data.goals ?? []).length) return null
  const list = chestsFor(data, today)
  const hasPrizes = data.rewards.some((r) => r.rarity)
  return (
    <section className="stack">
      <div className="section-title">
        <h2>Сундуки дня</h2>
        <span className="small muted">{CHEST.need} цели типа → сундук</span>
      </div>
      <div className="chest-row">
        {list.map((c) => (
          <button
            key={c.type}
            className={`chest ${c.ready ? 'ready' : ''} ${c.opened ? 'opened' : ''}`}
            disabled={!c.ready}
            onClick={() => {
              const id = openChest(c.type, nowWithOffset())
              const got = useStore.getState().data.chests?.find((x) => x.id === id)
              say(got?.rewardTitle ? `Сундук: ${got.rewardTitle}${got.rarity === 'legendary' ? ' — легендарная!' : got.rarity === 'rare' ? ' — редкая!' : ''}` : 'Сундук пуст: отметь редкость у своих наград в магазине')
            }}
          >
            <Px name={c.opened ? 'gift' : 'chest'} size={30} />
            <span>{CHEST_NAME[c.type]}</span>
            <small className="num">{c.opened ? (c.opened.rewardTitle ?? 'пусто') : `${Math.min(c.count, CHEST.need)}/${CHEST.need}`}</small>
          </button>
        ))}
      </div>
      {!hasPrizes && (
        <a className="tiny muted" href="#/shop">
          Призы — твои награды из магазина с редкостью. Добавь редкость →
        </a>
      )}
    </section>
  )
}

function DealOfDay() {
  const data = useStore((s) => s.data)
  const toggle = useStore((s) => s.toggleTask)
  const setDealNode = useStore((s) => s.setDealNode)
  const now = useNow()
  const today = gameDayOf(now)
  const [practice, setPractice] = useState(false)
  const projects = childrenOf(data.tasks, null, 'deal')
  const dealId = data.days[today]?.dealTaskId
  const deal = dealId ? data.tasks.find((t) => t.id === dealId) : undefined
  const parent = deal?.parentId ? data.tasks.find((t) => t.id === deal.parentId) : undefined
  const nodeId = data.days[today]?.dealNodeId
  const node = nodeId ? data.nodes?.find((n) => n.id === nodeId) : undefined
  const nodeSkill = node && data.skills?.find((s) => s.id === node.skillId)
  const nodeDone = !!node && (data.practices ?? []).some((p) => p.nodeId === node.id && p.day === today)
  const locked = !!data.days[today]?.confession
  const dealPlan = planFor(data, today).find((p) => p.id === 'deal')
  const open = data.tasks.filter((t) => t.scope === 'deal' && t.parentId && !t.doneAt).length

  return (
    <section className={`panel ${deal || node ? 'glow' : ''}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Crosshair color="var(--gold)" aria-hidden style={{ marginTop: 2 }} />
        <div className="grow stack" style={{ gap: 6 }}>
          <span className="small muted">Дело дня</span>
          {node && nodeSkill && (
            <>
              <h2>
                Сегодня качаю: {nodeSkill.title} → {node.title}
              </h2>
              <p className="tiny muted">Практика на узле закроет квест «Дело дня».</p>
            </>
          )}
          {deal ? (
            <>
              <h2>{deal.title}</h2>
              {parent && <span className="small muted">{parent.title}</span>}
              <p className="tiny muted">
                Закрыл — +{taskXp(data.tasks, deal)} XP Дела{dealPlan ? ` и квест «Дело дня» (+${questXp(dealPlan.role, dealPlan.base, 'done')} XP)` : ''}. Подзадачи по +{XP.subtask} XP. В потоке ×2.
              </p>
            </>
          ) : (
            !node && <p>{open ? 'Не выбрано. Нажми прицел у задачи ниже или у узла навыка.' : projects.length ? 'Добавь задачу в проект кнопкой «+», потом нажми прицел.' : 'Проект ниже или узел навыка: прицел — и это Дело дня.'}</p>
          )}
        </div>
      </div>
      {node && !locked && (
        <div className="grid-2" style={{ marginTop: 12 }}>
          <button className={`btn ${nodeDone ? 'ghost' : 'amber'}`} onClick={() => setPractice(true)}>
            <Plus size={18} /> {nodeDone ? 'Ещё практика' : 'Практика'}
          </button>
          <button className="btn ghost" onClick={() => setDealNode(today, null)}>
            Снять узел
          </button>
        </div>
      )}
      {deal && !locked && (
        <button
          className={`btn block ${deal.doneAt ? 'ghost' : 'amber'}`}
          style={{ marginTop: 12 }}
          onClick={(e) => {
            if (!deal.doneAt) reward(e.currentTarget, { xp: taskXp(data.tasks, deal) + (dealPlan ? questXp(dealPlan.role, dealPlan.base, 'done') : 0), shards: dealPlan ? (dealPlan.role === 'main' ? 3 : 2) : 0 })
            toggle(deal.id, nowWithOffset())
          }}
        >
          <Check size={18} /> {deal.doneAt ? 'Закрыто. Вернуть?' : 'Закрыть Дело дня'}
        </button>
      )}
      {(deal || node) && !locked && (
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => startFlowAndGo(undefined, nodeSkill?.id)}>
          <Px name="play" size={20} /> Поток на Дело дня
        </button>
      )}
      {practice && node && <PracticeSheet nodeId={node.id} onClose={() => setPractice(false)} />}
    </section>
  )
}

function Projects() {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const projects = childrenOf(data.tasks, null, 'deal')
  const dealId = data.days[today]?.dealTaskId
  return (
    <>
      {projects.length === 0 && <div className="empty">Проект — это то, что двигает тебя к деньгам или мечте. Например «Портфолио» или «Канал».</div>}
      <TaskTree scope="deal" roots={projects} pickDay={today} dealId={dealId} locked={false} />
      <div id="add-project">
        <AddTask scope="deal" parentId={null} placeholder="Новый проект" />
      </div>
    </>
  )
}
