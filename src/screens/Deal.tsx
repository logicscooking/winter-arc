import { useState } from 'react'
import { Check, ChevronRight, Crosshair, Plus, X } from 'lucide-react'
import {
  CHEST,
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
import { FlowButton, PracticeSheet, RankBadge, SkillLevelBar, Strikes, ThemeCard, skillSprite, startFlowAndGo } from '../components/skills'
import { Px } from '../pixel/Pixel'
import { RankChanceCard } from '../components/skillPlus'
import { MoneySheet } from '../components/Money'
import { Help } from '../components/ui'
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
              <h2>
                Навыки
                <Help
                  title="Навыки"
                  text={[
                    'Квесты держат уровень, навыки растут: практика → обратная связь → ступень.',
                    `В фокусе до ${MAX_ACTIVE_SKILLS} навыков, остальные ждут в «Позже». ▶ на карточке — поток на этот навык, XP ×2.`,
                  ]}
                />
              </h2>
              <span className="num small muted">
                {active.length}/{MAX_ACTIVE_SKILLS} в фокусе
              </span>
            </div>
            {active.length === 0 && (
              <div className="empty skill-empty">
                <Px name="fir" size={44} />
                <p>Первый навык — в 2 тапа.</p>
                <a className="btn primary" href="#/skill-new">
                  <Plus size={18} strokeWidth={3} aria-hidden /> Навык
                </a>
              </div>
            )}
            <div className="skill-list">
              {active.map((s) => (
                <SkillCard key={s.id} skill={s} theme={theme === s.id} view={skillView(data, s.id, today, frozen)} xp={game.skillXp[s.id] ?? 0} />
              ))}
            </div>
            {active.length >= MAX_ACTIVE_SKILLS && <p className="tiny muted">3 в фокусе — максимум.</p>}
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

const CHEST_NAME: Record<ChestType, string> = { repeat: 'Квесты', short: 'Задачи', mid: 'Навыки' }

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
        <h2>
          Сундуки дня
          <Help title="Сундуки дня" text={[`${CHEST.need} закрытых дела одного вида за день открывают сундук: квесты дня, задачи (проекты, Дело дня, свои) или практики навыков. Цели навыков тоже считаются.`, 'Внутри — одна из твоих наград магазина с редкостью: обычная, редкая или легендарная.']} />
        </h2>
        <span className="small muted">{CHEST.need} дела → сундук</span>
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
          Призы — твои награды с редкостью →
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
          <span className="small muted row" style={{ gap: 6 }}>
            Дело дня
            <Help
              title="Дело дня"
              text={[
                'Один шаг к деньгам на сегодня: задача проекта или узел навыка. Прицел у задачи или узла делает его Делом дня.',
                `Закрыл — XP Дела${dealPlan ? ` и квест «Дело дня» (+${questXp(dealPlan.role, dealPlan.base, 'done')} XP)` : ''}. Подзадачи по +${XP.subtask} XP. Практика на узле тоже закрывает квест.`,
                'Включи поток — всё, что закроешь внутри, даёт ×2 XP. До 90 минут, 3 потока в день, не после 22:00.',
              ]}
            />
          </span>
          {node && nodeSkill && (
            <h2>
              {nodeSkill.title} → {node.title}
            </h2>
          )}
          {deal ? (
            <>
              <h2>{deal.title}</h2>
              {parent && <span className="small muted">{parent.title}</span>}
              <span className="tiny muted num">+{taskXp(data.tasks, deal)} XP</span>
            </>
          ) : (
            !node && <p>{open ? 'Нажми прицел у задачи или узла навыка.' : projects.length ? 'Добавь задачу в проект и нажми прицел.' : 'Создай проект ниже или выбери узел навыка.'}</p>
          )}
        </div>
      </div>
      {(deal || node) && !locked && (!deal?.doneAt || !!node) && (
        <div style={{ marginTop: 12 }}>
          <FlowButton skillId={nodeSkill?.id} className="btn primary block" />
        </div>
      )}
      {node && !locked && (
        <div className="grid-2" style={{ marginTop: 10 }}>
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
          style={{ marginTop: 10 }}
          onClick={(e) => {
            if (!deal.doneAt) reward(e.currentTarget, { xp: taskXp(data.tasks, deal) + (dealPlan ? questXp(dealPlan.role, dealPlan.base, 'done') : 0), shards: dealPlan ? (dealPlan.role === 'main' ? 3 : 2) : 0 })
            toggle(deal.id, nowWithOffset())
          }}
        >
          <Check size={18} /> {deal.doneAt ? 'Закрыто. Вернуть?' : 'Закрыть Дело дня'}
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
      {projects.length === 0 && <div className="empty">Проект двигает к деньгам: «Портфолио», «Канал».</div>}
      <TaskTree scope="deal" roots={projects} pickDay={today} dealId={dealId} locked={false} />
      <div id="add-project">
        <AddTask scope="deal" parentId={null} placeholder="Новый проект" />
      </div>
    </>
  )
}
