import { useState } from 'react'
import { ArrowLeft, Check, Crosshair, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import {
  EXTRA_XP,
  GOAL_META,
  MAX_MIDS,
  MAX_NODES,
  MAX_TRAITS,
  METRIC_EXAMPLES,
  PARENT_TYPE,
  RANKS,
  STAGE_NAMES,
  STATS,
  canRaise,
  cantStartPick,
  checkValue,
  checkedOn,
  childGoals,
  encodeTree,
  expectedTime,
  extraUsed,
  gameDayOf,
  goalBalance,
  goalIssues,
  goalsOf,
  isMetric,
  needsPivot,
  needsSplit,
  practicesToday,
  shortRuns,
  templateById,
  treeFromSkill,
  weekTicks,
  PRACTICE_LIMIT,
  FLOW,
  GOAL_XP,
} from '../engine'
import type { Goal, GoalType, SkillNode, StatId, Trait, TraitView, ValueKind } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset, reward, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chips, Field, Sheet } from '../components/ui'
import { PracticeSheet, RankBadge, SKILL_ICONS, SkillLevelBar, StagePips, StatChip, Strikes, ThemeCard, skillSprite, startFlowAndGo, useSkillView } from '../components/skills'
import { Px } from '../pixel/Pixel'
import { NextStepBlock, RankChanceCard, SkillCheckBlock, SplitBlock, StreakFlame, isStuck } from '../components/skillPlus'
import { AiButton } from '../components/ai'
import { useAiOn } from '../ai/useAi'

export function SkillScreen({ id, tab }: { id: string; tab?: string }) {
  const view = useSkillView(id)
  const data = useStore((s) => s.data)
  const addExtra = useStore((s) => s.addExtra)
  const setStatus = useStore((s) => s.setSkillStatus)
  const say = useUi((s) => s.say)
  const today = gameDayOf(useNow())
  const [edit, setEdit] = useState(false)
  const [share, setShare] = useState<string | null>(null)
  const [cant, setCant] = useState(false)
  if (!view) {
    return (
      <div className="stack-lg">
        <a className="back" href="#/deal">
          <ArrowLeft size={18} /> Путь
        </a>
        <div className="empty">Навык не найден.</div>
      </div>
    )
  }
  const s = view.skill
  const t = tab === 'goals' ? 'goals' : 'tree'
  const extra = extraUsed(data, s.id, today)
  const next = RANKS[Math.min(4, RANKS.indexOf(view.rank) + 1)]

  return (
    <div className="stack-lg">
      <div className="row between">
        <a className="back" href="#/deal">
          <ArrowLeft size={18} /> Путь
        </a>
        <div className="row" style={{ gap: 2 }}>
          <button
            className="icon-btn"
            aria-label="Поделиться деревом"
            onClick={async () => {
              const tree = treeFromSkill(useStore.getState().data, s.id)
              if (!tree) return
              const code = await encodeTree(tree)
              setShare(code)
            }}
          >
            <Share2 size={20} />
          </button>
          <button className="icon-btn" aria-label="Изменить навык" onClick={() => setEdit(true)}>
            <Pencil size={20} />
          </button>
        </div>
      </div>

      <section className="skill-head">
        <span className="skill-head-ico">
          <Px name={skillSprite(s)} size={56} />
        </span>
        <div className="grow stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: '1.6rem' }}>{s.title}</h1>
          <div className="row wrap" style={{ gap: 6 }}>
            <StatChip stat={s.stat} />
            {s.status === 'later' && <span className="tag">позже</span>}
            <Strikes n={view.strikes.strikes} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="num small">ур. {view.level}</span>
            <span className="grow">
              <SkillLevelBar view={view} />
            </span>
          </div>
          <span className="tiny muted">
            {view.rank === 'S' ? 'Высший ранг' : `ранг ${next} с ур. ${(RANKS.indexOf(view.rank) + 1) * 2 + 1 + view.strikes.drops * 2}`}
            {view.strikes.drops > 0 && ` · ранг упал на ${view.strikes.drops}: пропуски повторяющихся`}
          </span>
        </div>
        <RankBadge rank={view.rank} size="lg" />
      </section>

      <RankChanceCard view={view} />

      <blockquote className={`value-quote ${s.valueKind === 'pain' ? 'pain' : ''}`}>
        <small>{s.valueKind === 'pain' ? 'Боль, от которой ухожу' : 'Кайф'}</small>
        {s.value}
      </blockquote>
      <SkillCheckBlock skillId={s.id} />

      {s.status === 'active' ? (
        <div className="skill-actions">
          <button className="btn primary" onClick={() => startFlowAndGo(undefined, s.id)}>
            <Px name="play" size={20} /> Поток
          </button>
          <button className="btn ghost" onClick={() => setCant(true)}>
            Не могу начать
          </button>
          <button
            className="btn ghost"
            disabled={extra}
            onClick={(e) => {
              if (addExtra(s.id, nowWithOffset())) {
                reward(e.currentTarget, { xp: EXTRA_XP })
                say('Сделал больше плана — засчитано')
              }
            }}
            title="Раз в день на навык"
          >
            {extra ? 'Больше плана ✓' : `Больше плана +${EXTRA_XP}`}
          </button>
        </div>
      ) : (
        <button className="btn block" onClick={() => (setStatus(s.id, 'active') ? say('Навык в фокусе') : say('В фокусе уже 3 навыка. Сначала отложи один.'))}>
          Вернуть в фокус
        </button>
      )}

      <div className="seg-switch" role="tablist">
        <button role="tab" aria-pressed={t === 'tree'} onClick={() => go(`/skill/${s.id}`)}>
          Дерево
        </button>
        <button role="tab" aria-pressed={t === 'goals'} onClick={() => go(`/skill/${s.id}?tab=goals`)}>
          Цели
        </button>
      </div>

      {t === 'tree' ? <TreeTab traits={view.traits} skillId={s.id} /> : <GoalsTab skillId={s.id} />}
      {s.status === 'active' && <ThemeCard compact />}

      {edit && <SkillEdit id={s.id} onClose={() => setEdit(false)} />}
      {share && <ShareSheet code={share} title={s.title} onClose={() => setShare(null)} />}
      {cant && <CantStart skillId={s.id} onClose={() => setCant(false)} />}
    </div>
  )
}

// ---------- tree ----------

function TreeTab({ traits, skillId }: { traits: TraitView[]; skillId: string }) {
  const addTrait = useStore((s) => s.addTrait)
  const [practice, setPractice] = useState<string | null>(null)
  const [insight, setInsight] = useState(false)
  const [editTrait, setEditTrait] = useState<Trait | null>(null)
  const [newTrait, setNewTrait] = useState('')
  return (
    <section className="stack-lg">
      <div className="row between">
        <p className="tiny muted grow">Навык → характеристики → узлы. Качаешь конкретный узел.</p>
        <button className="btn sm ghost" onClick={() => setInsight(true)} disabled={!traits.length}>
          <Plus size={16} /> Инсайт
        </button>
      </div>
      {traits.map((tv) => (
        <TraitCard key={tv.trait.id} tv={tv} skillId={skillId} onPractice={setPractice} onEdit={() => setEditTrait(tv.trait)} />
      ))}
      {traits.length < MAX_TRAITS && (
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!newTrait.trim()) return
            addTrait(skillId, newTrait.trim())
            setNewTrait('')
          }}
        >
          <input className="input" value={newTrait} onChange={(e) => setNewTrait(e.target.value)} placeholder={`Характеристика (${traits.length}/${MAX_TRAITS})`} />
          <button className="btn sm" type="submit" aria-label="Добавить характеристику">
            <Plus size={18} />
          </button>
        </form>
      )}
      {practice && <PracticeSheet nodeId={practice} onClose={() => setPractice(null)} />}
      {insight && <InsightSheet skillId={skillId} traits={traits.map((x) => x.trait)} onClose={() => setInsight(false)} />}
      {editTrait && <TraitSheet trait={editTrait} onClose={() => setEditTrait(null)} />}
    </section>
  )
}

function TraitCard({ tv, skillId, onPractice, onEdit }: { tv: TraitView; skillId: string; onPractice: (id: string) => void; onEdit: () => void }) {
  const addNode = useStore((s) => s.addNode)
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  return (
    <div className="trait-card">
      <button className="trait-head" onClick={onEdit} aria-label={`Изменить «${tv.trait.title}»`}>
        <span className="trait-lvl num">{tv.level.toFixed(1)}</span>
        <span className="grow">
          <b>{tv.trait.title}</b>
          {(tv.trait.plus || tv.trait.minus) && (
            <span className="pm">
              {tv.trait.plus && <span className="plus">+ {tv.trait.plus}</span>}
              {tv.trait.minus && <span className="minus">− {tv.trait.minus}</span>}
            </span>
          )}
        </span>
        <Pencil size={14} color="var(--mist)" />
      </button>
      <div className="node-list">
        {tv.nodes.map(({ node, prog }) => (
          <NodeRow key={node.id} node={node} prog={prog} onPractice={() => onPractice(node.id)} />
        ))}
      </div>
      {tv.nodes.length < MAX_NODES &&
        (adding ? (
          <form
            className="row"
            style={{ gap: 8, padding: '0 10px 10px' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) addNode(skillId, tv.trait.id, title.trim(), undefined, nowWithOffset())
              setTitle('')
              setAdding(false)
            }}
          >
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Конкретный узел" />
            <button className="btn sm" type="submit">
              <Check size={18} />
            </button>
          </form>
        ) : (
          <button className="add-node" onClick={() => setAdding(true)}>
            <Plus size={16} /> узел
          </button>
        ))}
    </div>
  )
}

function NodeRow({ node, prog, onPractice }: { node: SkillNode; prog: TraitView['nodes'][number]['prog']; onPractice: () => void }) {
  const data = useStore((s) => s.data)
  const setDealNode = useStore((s) => s.setDealNode)
  const updateNode = useStore((s) => s.updateNode)
  const deleteNode = useStore((s) => s.deleteNode)
  const confirm = useUi((s) => s.confirm)
  const today = gameDayOf(useNow())
  const used = practicesToday(data, node.id, today)
  const isDeal = data.days[today]?.dealNodeId === node.id
  const [pivot, setPivot] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <div className={`node-row ${isDeal ? 'deal' : ''}`}>
      <div className="node-main">
        <button className="node-title-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="node-name">{node.title}</span>
          <span className="node-meta">
            <StagePips stage={prog.stage} potential={prog.potential} />
            <span>
              {STAGE_NAMES[prog.stage]} · {prog.count}
              {prog.toNext > 0 && !prog.needsFeedback ? ` · ещё ${prog.toNext}` : ''}
            </span>
          </span>
        </button>
        <button className="btn sm primary practice-btn" disabled={used >= PRACTICE_LIMIT} onClick={onPractice} aria-label={`Практика: ${node.title}`}>
          <Plus size={16} /> практика
        </button>
      </div>
      {prog.needsFeedback && <p className="node-hint">Ступень ждёт обратной связи: отзыв нужен хотя бы у половины практик ({prog.feedback}/{prog.count}).</p>}
      {needsPivot(node, prog) && (
        <div className="pivot-card">
          <b>3 раза без прогресса</b>
          <p className="small">Привычка говорит «делай как всегда», игра говорит «ищи другой путь».</p>
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!pivot.trim()) return
              updateNode(node.id, { pivot: pivot.trim(), pivotAt: nowWithOffset().getTime() })
              setPivot('')
            }}
          >
            <input className="input" value={pivot} onChange={(e) => setPivot(e.target.value)} placeholder="Что попробую иначе" />
            <button className="btn sm" type="submit">
              <Check size={18} />
            </button>
          </form>
        </div>
      )}
      {open && (
        <div className="node-more">
          {node.how && <p className="small">Как качать: {node.how}</p>}
          {node.pivot && <p className="small muted">Пробую иначе: {node.pivot}</p>}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={`btn sm ${isDeal ? 'amber' : 'ghost'}`} onClick={() => setDealNode(today, isDeal ? null : node.id)}>
              <Crosshair size={16} /> {isDeal ? 'Дело дня' : 'Сегодня качаю'}
            </button>
            <button
              className="btn sm ghost"
              onClick={async () => {
                if (await confirm({ title: `Удалить «${node.title}»?`, body: 'Практики узла тоже удалятся. XP за них уйдёт.', ok: 'Удалить', danger: true })) deleteNode(node.id)
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InsightSheet({ skillId, traits, onClose }: { skillId: string; traits: Trait[]; onClose: () => void }) {
  const addNode = useStore((s) => s.addNode)
  const say = useUi((s) => s.say)
  const [title, setTitle] = useState('')
  const [src, setSrc] = useState('')
  const [trait, setTrait] = useState(traits[0]?.id)
  return (
    <Sheet title="Инсайт в дерево" onClose={onClose}>
      <div className="stack-lg">
        <p className="small muted">Новое из ролика или книги кладёшь на нужную ветку — и его можно качать.</p>
        <Field label="Что узнал (узел)">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например «Называть цену и молчать»" autoFocus />
        </Field>
        <Field label="Откуда или как качать">
          <input className="input" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Ролик, книга, совет" />
        </Field>
        <Chips label="Ветка" options={traits.map((t) => ({ id: t.id, label: t.title }))} value={trait} onChange={setTrait} />
        <button
          className="btn primary block"
          disabled={!title.trim() || !trait}
          onClick={() => {
            addNode(skillId, trait!, title.trim(), src.trim() || undefined, nowWithOffset())
            say('Узел добавлен в дерево')
            onClose()
          }}
        >
          Добавить узел
        </button>
      </div>
    </Sheet>
  )
}

function TraitSheet({ trait, onClose }: { trait: Trait; onClose: () => void }) {
  const update = useStore((s) => s.updateTrait)
  const del = useStore((s) => s.deleteTrait)
  const confirm = useUi((s) => s.confirm)
  const [t, setT] = useState(trait.title)
  const [plus, setPlus] = useState(trait.plus ?? '')
  const [minus, setMinus] = useState(trait.minus ?? '')
  return (
    <Sheet title="Характеристика" onClose={onClose}>
      <div className="stack-lg">
        <Field label="Название">
          <input className="input" value={t} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Field label="Что повышает (+)">
          <input className="input" value={plus} onChange={(e) => setPlus(e.target.value)} placeholder="необязательно" maxLength={80} />
        </Field>
        <Field label="Что понижает (−)">
          <input className="input" value={minus} onChange={(e) => setMinus(e.target.value)} placeholder="необязательно" maxLength={80} />
        </Field>
        <div className="grid-2">
          <button
            className="btn ghost"
            onClick={async () => {
              if (await confirm({ title: `Удалить «${trait.title}»?`, body: 'Узлы и их практики тоже удалятся.', ok: 'Удалить', danger: true })) {
                del(trait.id)
                onClose()
              }
            }}
          >
            Удалить
          </button>
          <button
            className="btn primary"
            onClick={() => {
              update(trait.id, { title: t.trim() || trait.title, plus: plus.trim() || undefined, minus: minus.trim() || undefined })
              onClose()
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ---------- goals ----------

function GoalsTab({ skillId }: { skillId: string }) {
  const data = useStore((s) => s.data)
  const goals = goalsOf(data, skillId)
  const issues = goalIssues(goals)
  const bal = goalBalance(goals)
  const [add, setAdd] = useState<{ type?: GoalType; parentId?: string } | null>(null)
  const roots = goals.filter((g) => g.type !== 'repeat' && (!g.parentId || !goals.some((p) => p.id === g.parentId)))
  const repeats = goals.filter((g) => g.type === 'repeat')
  const pct = (n: number) => (bal.total ? Math.round((n / bal.total) * 100) : 0)
  return (
    <section className="stack-lg">
      <div className="balance">
        <div className="balance-bar" aria-label="Баланс целей">
          <i className="s" style={{ flex: bal.short || 0.001 }} />
          <i className="m" style={{ flex: bal.mid || 0.001 }} />
          <i className="l" style={{ flex: bal.long || 0.001 }} />
        </div>
        <div className="row between tiny muted num">
          <span>краткие {pct(bal.short)}%</span>
          <span>средние {pct(bal.mid)}%</span>
          <span>долгие {pct(bal.long)}%</span>
        </div>
        <p className="tiny muted">{bal.hint ?? 'Ориентир: 60% кратких, 30% средних, 10% долгих.'}</p>
      </div>
      {roots.map((g) => (
        <GoalNode key={g.id} goal={g} goals={goals} issues={issues} depth={0} onAdd={setAdd} />
      ))}
      {repeats.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>Повторяющиеся</h3>
          {repeats.map((g) => (
            <GoalNode key={g.id} goal={g} goals={goals} issues={issues} depth={0} onAdd={setAdd} />
          ))}
        </div>
      )}
      {!goals.length && <div className="empty">Цели — действия, а не метрики. Начни с краткой: минимальный старт на 15 минут.</div>}
      <button className="btn block" onClick={() => setAdd({})}>
        <Plus size={18} /> Цель
      </button>
      {add && <GoalSheet skillId={skillId} preset={add} onClose={() => setAdd(null)} />}
    </section>
  )
}

const TYPE_TAG: Record<GoalType, string> = { short: 'краткая', mid: 'средняя', long: 'долгая', repeat: 'повтор' }

function GoalNode({ goal, goals, issues, depth, onAdd }: { goal: Goal; goals: Goal[]; issues: Record<string, string>; depth: number; onAdd: (p: { type?: GoalType; parentId?: string }) => void }) {
  const toggle = useStore((s) => s.toggleGoal)
  const updateGoal = useStore((s) => s.updateGoal)
  const addGoal = useStore((s) => s.addGoal)
  const del = useStore((s) => s.deleteGoal)
  const addPoint = useStore((s) => s.addScalePoint)
  const confirm = useUi((s) => s.confirm)
  const say = useUi((s) => s.say)
  const today = gameDayOf(useNow())
  const [point, setPoint] = useState('')
  const [simpler, setSimpler] = useState('')
  const [mode, setMode] = useState<'split' | 'raise' | null>(null)
  const [ai, setAi] = useState<'split' | 'next' | null>(null)
  const aiOn = useAiOn()
  const skillTitle = useStore((s) => s.data.skills?.find((x) => x.id === goal.skillId)?.title ?? '')
  const stuck = isStuck(goal, goals, today)
  const kids = childGoals(goals, goal.id)
  const daily = goal.type === 'short' || goal.type === 'repeat'
  const done = daily ? checkedOn(goal, today) : !!goal.doneAt
  const runs = goal.type === 'short' ? shortRuns(goal, today) : null
  const eta = goal.type === 'long' && goal.scale ? expectedTime(goal) : null

  const onCheck = async (el: Element) => {
    if (!done) reward(el, { xp: GOAL_XP[goal.type] })
    toggle(goal.id, nowWithOffset())
    if (!done && goal.type === 'long') {
      if (await confirm({ title: 'Долгая цель закрыта!', body: 'Удержать уровень? Сделаем повторяющуюся цель, чтобы навык не откатился.', ok: 'Удержать' }))
        addGoal({ skillId: goal.skillId, type: 'repeat', title: `Держать: ${goal.title}`, perWeek: 2 }, nowWithOffset())
    }
  }

  return (
    <div className={`goal-node d${depth}`}>
      <div className={`goal-row t-${goal.type} ${done ? 'done' : ''}`}>
        <button className="goal-check" aria-pressed={done} aria-label={done ? 'Снять отметку' : 'Закрыть'} onClick={(e) => onCheck(e.currentTarget)}>
          <span>{done && <Check size={16} />}</span>
        </button>
        <div className="grow stack" style={{ gap: 3 }}>
          <span className="goal-title">{goal.title}</span>
          <span className="tiny muted row wrap" style={{ gap: 6 }}>
            <span className={`gtag t-${goal.type}`}>{TYPE_TAG[goal.type]}</span>
            <span>+{GOAL_XP[goal.type]} XP</span>
            {goal.type === 'repeat' && (
              <span className="num">
                {weekTicks(goal, today)}/{goal.perWeek} на неделе
              </span>
            )}
            {runs && runs.doneRun > 1 && <span className="num">серия {runs.doneRun}</span>}
            {goal.type === 'repeat' && <StreakFlame goal={goal} />}
            {goal.type !== 'long' && isMetric(goal.title) && <span className="metric-warn">метрика?</span>}
          </span>
        </div>
        <button
          className="icon-btn"
          aria-label="Удалить цель"
          onClick={async () => {
            if (await confirm({ title: 'Удалить цель?', body: goal.title, ok: 'Удалить', danger: true })) del(goal.id)
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {issues[goal.id] && <p className="goal-issue">{issues[goal.id]}</p>}

      {aiOn && !ai && !done && (goal.type === 'long' || goal.type === 'mid') && (
        <div className="row wrap" style={{ gap: 8, paddingLeft: 44 }}>
          <AiButton onClick={() => setAi('split')}>Разбить</AiButton>
          {goal.type === 'mid' && stuck && <AiButton onClick={() => setAi('next')}>Следующий шаг</AiButton>}
        </div>
      )}
      {goal.type === 'mid' && stuck && !aiOn && !done && <p className="goal-issue">Завис 3+ дня: добавь краткий старт до 15 минут.</p>}
      {ai === 'split' && <SplitBlock goal={goal} skillTitle={skillTitle} onClose={() => setAi(null)} />}
      {ai === 'next' && <NextStepBlock goal={goal} skillTitle={skillTitle} onClose={() => setAi(null)} />}

      {eta && (
        <div className="eta">
          <div className="row between">
            <span className="small">
              Шкала: <b className="num">{'current' in eta ? eta.current : (goal.scale!.points.at(-1)?.value ?? goal.scale!.from)}</b> → {goal.scale!.to} {goal.scale!.unit}
            </span>
          </div>
          {'base' in eta ? (
            <p className="small">
              Ожидаемый срок: <b className="num">≈ {eta.base} / {eta.good} / {eta.ideal} дн.</b>
              <span className="tiny muted" style={{ display: 'block' }}>
                базовый темп / хороший ×1,5 / идеальный ×2. Не успел — не провал, а повод разобраться почему.
              </span>
            </p>
          ) : (
            <p className="tiny muted">{eta.reason}</p>
          )}
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              const v = Number(point.replace(',', '.'))
              if (!point || !Number.isFinite(v)) return
              addPoint(goal.id, v, nowWithOffset())
              setPoint('')
              say('Замер записан')
            }}
          >
            <input className="input num" inputMode="decimal" value={point} onChange={(e) => setPoint(e.target.value)} placeholder={`Замер сегодня, ${goal.scale!.unit ?? ''}`} />
            <button className="btn sm" type="submit">
              <Check size={18} />
            </button>
          </form>
        </div>
      )}

      {goal.type === 'short' && (needsSplit(goal, today) || canRaise(goal, today)) && (
        <div className="goal-prompt">
          {needsSplit(goal, today) ? (
            <>
              <b>Слишком крупно. Разбить?</b>
              <p className="tiny muted">3 дня подряд в пролёте. Сделай старт таким, что нельзя не сделать.</p>
            </>
          ) : (
            <>
              <b>Стала привычкой. Поднять?</b>
              <p className="tiny muted">7+ раз подряд. Замени на следующую, посложнее, или сделай её средней.</p>
            </>
          )}
          {mode ? (
            <form
              className="row"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!simpler.trim()) return
                updateGoal(goal.id, { archived: true })
                addGoal({ skillId: goal.skillId, type: 'short', title: simpler.trim(), parentId: goal.parentId }, nowWithOffset())
                setMode(null)
                setSimpler('')
              }}
            >
              <input className="input" autoFocus value={simpler} onChange={(e) => setSimpler(e.target.value)} placeholder={mode === 'split' ? 'Проще: «выйти на 1 км»' : 'Следующая, сложнее'} />
              <button className="btn sm" type="submit">
                <Check size={18} />
              </button>
            </form>
          ) : (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => setMode(needsSplit(goal, today) ? 'split' : 'raise')}>
                {needsSplit(goal, today) ? 'Сделать проще' : 'Заменить сложнее'}
              </button>
              {aiOn && needsSplit(goal, today) && !ai && <AiButton onClick={() => setAi('next')}>Следующий шаг</AiButton>}
              {canRaise(goal, today) && (
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    // a short promoted to mid needs its own short
                    updateGoal(goal.id, { type: 'mid', checks: undefined, since: undefined })
                    say('Теперь это средняя. Ей нужна своя краткая')
                    onAdd({ type: 'short', parentId: goal.id })
                  }}
                >
                  В средние
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {kids.length > 0 && (
        <div className="goal-kids">
          {kids.map((k) => (
            <GoalNode key={k.id} goal={k} goals={goals} issues={issues} depth={depth + 1} onAdd={onAdd} />
          ))}
        </div>
      )}
      {(goal.type === 'long' && kids.filter((k) => k.type === 'mid').length < MAX_MIDS) || goal.type === 'mid' ? (
        <button className="add-node sub" onClick={() => onAdd({ type: goal.type === 'long' ? 'mid' : 'short', parentId: goal.id })}>
          <Plus size={14} /> {goal.type === 'long' ? 'средняя' : 'краткая'}
        </button>
      ) : null}
    </div>
  )
}

function GoalSheet({ skillId, preset, onClose }: { skillId: string; preset: { type?: GoalType; parentId?: string }; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const addGoal = useStore((s) => s.addGoal)
  const goals = goalsOf(data, skillId)
  const [type, setType] = useState<GoalType>(preset.type ?? 'short')
  const [title, setTitle] = useState('')
  const [parentId, setParentId] = useState<string | undefined>(preset.parentId)
  const [perWeek, setPerWeek] = useState(3)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [unit, setUnit] = useState('')
  const parentType = PARENT_TYPE[type]
  const parents = parentType ? goals.filter((g) => g.type === parentType && !g.doneAt) : []
  const metric = isMetric(title)
  const scaleOk = type !== 'long' || (from === '' && to === '') || (Number.isFinite(Number(from)) && Number.isFinite(Number(to)) && from !== '' && to !== '' && Number(from) !== Number(to))

  const save = () => {
    const now = nowWithOffset()
    const day = gameDayOf(now)
    const scale = type === 'long' && from !== '' && to !== '' ? { from: Number(from), to: Number(to), ...(unit.trim() ? { unit: unit.trim() } : {}), points: [{ day, value: Number(from), at: now.getTime() }] } : undefined
    addGoal({ skillId, type, title: title.trim(), ...(parentId && parents.some((p) => p.id === parentId) ? { parentId } : {}), ...(type === 'repeat' ? { perWeek } : {}), ...(scale ? { scale } : {}) }, now)
    onClose()
  }

  return (
    <Sheet title="Новая цель" onClose={onClose}>
      <div className="stack-lg">
        <div className="type-grid" role="group" aria-label="Тип цели">
          {(['short', 'mid', 'long', 'repeat'] as GoalType[]).map((t) => (
            <button key={t} className={`type-tile t-${t}`} aria-pressed={type === t} onClick={() => setType(t)}>
              <b>{GOAL_META[t].name}</b>
              <small>{GOAL_META[t].time}</small>
              <small className="num">+{GOAL_XP[t]} XP</small>
            </button>
          ))}
        </div>
        <p className="tiny muted">{GOAL_META[type].hint}</p>
        <Field label="Цель — действие руками">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'long' ? 'Пробежать 10 км без остановки' : type === 'repeat' ? 'Пробежка в зоне 2' : METRIC_EXAMPLES[0]} autoFocus />
        </Field>
        {metric && (
          <div className="metric-hint">
            <b>Это метрика. Какое действие к ней ведёт?</b>
            <span className="tiny">
              Например: {METRIC_EXAMPLES.slice(0, 2).map((x) => `«${x}»`).join(', ')}. {type === 'long' ? 'Метрику можно положить в шкалу ниже.' : ''}
            </span>
          </div>
        )}
        {parents.length > 0 && (
          <Chips label={type === 'mid' ? 'Шаг к долгой' : 'Старт для средней'} options={parents.map((p) => ({ id: p.id, label: p.title.slice(0, 32) }))} value={parentId} onChange={(v) => setParentId(parentId === v ? undefined : v)} />
        )}
        {type === 'repeat' && <Chips label="Раз в неделю" options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: String(n), label: String(n) }))} value={String(perWeek)} onChange={(v) => setPerWeek(Number(v))} />}
        {type === 'long' && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="small" style={{ fontWeight: 800, color: 'var(--ink-2)' }}>
              Шкала (необязательно): по ней считается ожидаемый срок
            </span>
            <div className="scale-grid">
              <input className="input num" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="сейчас" aria-label="Сейчас" />
              <input className="input num" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} placeholder="цель" aria-label="Цель" />
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="км, кг…" aria-label="Единица" />
            </div>
            <p className="tiny muted">Шкала может идти вниз (вес) или вверх (км, подписчики). Жёсткого дедлайна нет: только ожидаемый срок.</p>
          </div>
        )}
        <button className="btn primary block" disabled={!title.trim() || !scaleOk} onClick={save}>
          Добавить цель
        </button>
      </div>
    </Sheet>
  )
}

// ---------- edit / share / can't start ----------

function SkillEdit({ id, onClose }: { id: string; onClose: () => void }) {
  const skill = useStore((s) => s.data.skills?.find((x) => x.id === id))!
  const update = useStore((s) => s.updateSkill)
  const setStatus = useStore((s) => s.setSkillStatus)
  const del = useStore((s) => s.deleteSkill)
  const confirm = useUi((s) => s.confirm)
  const say = useUi((s) => s.say)
  const [title, setTitle] = useState(skill.title)
  const [value, setValue] = useState(skill.value)
  const [kind, setKind] = useState<ValueKind>(skill.valueKind ?? 'joy')
  const [stat, setStat] = useState<StatId>(skill.stat)
  const [icon, setIcon] = useState(skill.icon)
  const check = checkValue(value, kind)
  return (
    <Sheet title="Навык" onClose={onClose}>
      <div className="stack-lg">
        <Field label="Название">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="seg-switch">
          <button aria-pressed={kind === 'joy'} onClick={() => setKind('joy')}>
            Кайф
          </button>
          <button aria-pressed={kind === 'pain'} onClick={() => setKind('pain')}>
            Боль
          </button>
        </div>
        <textarea className="textarea" value={value} maxLength={220} onChange={(e) => setValue(e.target.value)} />
        {!check.ok && (
          <p className="err">
            {check.reason} {check.hint}
          </p>
        )}
        <Chips label="Стат-покровитель" options={STATS.map((s) => ({ id: s.id, label: s.name }))} value={stat} onChange={setStat} />
        <div className="icon-pick" role="group" aria-label="Иконка">
          {SKILL_ICONS.map((i) => (
            <button key={i} aria-pressed={icon === i} onClick={() => setIcon(i)} aria-label={i}>
              <Px name={i} size={26} />
            </button>
          ))}
        </div>
        <button
          className="btn primary block"
          disabled={!check.ok || !title.trim()}
          onClick={() => {
            update(id, { title: title.trim(), value: value.trim(), valueKind: kind, stat, icon })
            onClose()
          }}
        >
          Сохранить
        </button>
        <div className="grid-2">
          <button
            className="btn ghost"
            onClick={() => {
              const ok = setStatus(id, skill.status === 'active' ? 'later' : 'active')
              say(ok ? (skill.status === 'active' ? 'Навык в «Позже»' : 'Навык в фокусе') : 'В фокусе уже 3 навыка')
              onClose()
            }}
          >
            {skill.status === 'active' ? 'В «Позже»' : 'В фокус'}
          </button>
          <button
            className="btn ghost"
            style={{ color: 'var(--hp)' }}
            onClick={async () => {
              if (await confirm({ title: `Удалить «${skill.title}»?`, body: 'Дерево, практики и цели удалятся, XP за них уйдёт. Можно вместо этого убрать в «Позже».', ok: 'Удалить', danger: true })) {
                del(id)
                go('/deal')
              }
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function ShareSheet({ code, title, onClose }: { code: string; title: string; onClose: () => void }) {
  const say = useUi((s) => s.say)
  const text = `Моё дерево навыка «${title}» для Winter Arc. Импорт: Путь → Импорт дерева.\n${code}`
  return (
    <Sheet title="Поделиться деревом" onClose={onClose}>
      <div className="stack-lg">
        <p className="small muted">В коде только структура: характеристики, узлы и цели. Практики, отзывы и «Кайф» остаются у тебя.</p>
        <textarea className="textarea code-text" readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
        <div className="grid-2">
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code)
                say('Код скопирован')
              } catch {
                say('Выдели код и скопируй вручную')
              }
            }}
          >
            Копировать
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({ title: `Дерево «${title}»`, text })
                } catch {
                  /* cancelled */
                }
              } else {
                try {
                  await navigator.clipboard.writeText(text)
                  say('Текст скопирован')
                } catch {
                  say('Выдели код и скопируй вручную')
                }
              }
            }}
          >
            Отправить
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function CantStart({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const toggle = useStore((s) => s.toggleGoal)
  const addGoal = useStore((s) => s.addGoal)
  const today = gameDayOf(useNow())
  const skill = data.skills?.find((s) => s.id === skillId)
  const pick = cantStartPick(data, skillId, today, templateById(skill?.templateId)?.cantStart)
  return (
    <Sheet title="Не могу начать" onClose={onClose}>
      <div className="stack-lg">
        <p className="small muted">Одна краткая цель не дольше 15 минут. Начал — самое трудное позади.</p>
        {pick ? (
          <div className="now-card calm">
            <div className="now-head">
              <span className="now-icon">
                <Px name="flame" size={28} />
              </span>
              <h2 className="grow" style={{ fontSize: '1.1rem' }}>
                {pick.title}
              </h2>
            </div>
          </div>
        ) : (
          <div className="empty">Добавь в дерево хотя бы один узел.</div>
        )}
        <button
          className="btn primary block"
          disabled={!pick}
          onClick={() => {
            if (pick && !pick.goalId) addGoal({ skillId, type: 'short', title: pick.title }, nowWithOffset())
            onClose()
            startFlowAndGo(FLOW.quickMin, skillId)
          }}
        >
          <Px name="play" size={20} /> Поток на 15 минут
        </button>
        {pick?.goalId && (
          <button
            className="btn ghost block"
            onClick={() => {
              toggle(pick.goalId!, nowWithOffset())
              onClose()
            }}
          >
            Уже сделал
          </button>
        )}
      </div>
    </Sheet>
  )
}
