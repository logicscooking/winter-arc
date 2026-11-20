import { useState } from 'react'

import { MAX_ACTIVE_SKILLS, STATS, TEMPLATES, VALUE_MAX, checkValue, decodeTree, gameDayOf, materializeTree, templateTree, uid } from '../engine'
import type { SkillTemplate, StatId, TreeCode, ValueKind } from '../engine'
import { useStore } from '../store/store'
import { go, nowWithOffset } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chips, Field, Sheet } from '../components/ui'
import { Px } from '../pixel/Pixel'
import { StatChip, skillSprite } from '../components/skills'
import { AiButton, AiPreview, AiStatus } from '../components/ai'
import { treeTask } from '../ai/prompts'
import type { AiTree } from '../ai/prompts'
import { useAi, useAiOn } from '../ai/useAi'

/** One screen: template in 2 taps, or empty with the bridge question, or a friend's code */
export function SkillNew({ importMode }: { importMode?: boolean }) {
  const [pick, setPick] = useState<{ tree: TreeCode; tpl?: SkillTemplate; examples?: string[] } | null>(null)
  const [want, setWant] = useState('')
  const [block, setBlock] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<TreeCode | null>(null)
  const active = useStore((s) => (s.data.skills ?? []).filter((x) => x.status === 'active').length)

  return (
    <div className="stack-lg">
      <header>
        <p className="small muted page-sub">Думай навыками, а не целями: результат — следствие навыка. {active >= MAX_ACTIVE_SKILLS && 'В фокусе уже 3 — новый встанет в «Позже».'}</p>
      </header>

      {!importMode && (
        <>
          <section className="stack">
            <div className="section-title">
              <h2>Шаблоны</h2>
              <span className="small muted">тап → старт</span>
            </div>
            <div className="tpl-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="tpl" onClick={() => setPick({ tree: templateTree(t), tpl: t })}>
                  <Px name={skillSprite({ icon: t.icon, stat: t.stat })} size={36} />
                  <b>{t.title}</b>
                  <small>{t.pitch}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="panel stack bridge">
            <h3>Не знаешь, какой навык?</h3>
            <Field label="Чего хочешь?">
              <input className="input" value={want} onChange={(e) => setWant(e.target.value)} placeholder="Зарабатывать на дизайне 200 тысяч" />
            </Field>
            <Field label="Что мешает?">
              <input className="input" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Мало заказов, не умею продавать" />
            </Field>
            <p className="small">
              <b>Какой это навык?</b> <span className="muted">Что должно случиться в навыке, чтобы был результат: дизайнер → навык продаж.</span>
            </p>
            <button className="btn block" onClick={() => setPick({ tree: { v: 1, t: '', s: 'deal', tr: [{ t: 'Основа', n: [] }], g: [] } })}>
              Пустой навык
            </button>
          </section>
          <AiTreeBuilder onImport={(tree, examples) => setPick({ tree, examples })} />
          <a className="list-btn" href="#/skill-new?import=1">
            <Px name="gift" size={26} />
            <span className="grow">
              Дерево от друга
              <small>Вставить код и посмотреть превью</small>
            </span>
          </a>
        </>
      )}

      {importMode && (
        <section className="panel stack">
          <h3>Импорт дерева</h3>
          <textarea className="textarea code-text" value={code} onChange={(e) => (setCode(e.target.value), setErr(''), setPreview(null))} placeholder="Вставь код WA1.… или весь текст сообщения" />
          {err && <p className="err">{err}</p>}
          <button
            className="btn block"
            disabled={!code.trim()}
            onClick={async () => {
              try {
                setPreview(await decodeTree(code))
              } catch (e) {
                setErr((e as Error).message)
              }
            }}
          >
            Показать превью
          </button>
          {preview && (
            <div className="stack preview">
              <div className="row" style={{ gap: 10 }}>
                <Px name={skillSprite({ icon: preview.i, stat: preview.s })} size={32} />
                <b className="grow">{preview.t}</b>
                <StatChip stat={preview.s} />
              </div>
              {preview.tr.map((tr, i) => (
                <div key={i} className="small">
                  <b>{tr.t}</b>
                  <span className="muted"> · {tr.n.map((n) => n.t).join(', ') || 'без узлов'}</span>
                </div>
              ))}
              {!!preview.g?.length && <p className="tiny muted">Цели: {preview.g.length}</p>}
              <button className="btn primary block" onClick={() => setPick({ tree: preview })}>
                Добавить навык
              </button>
            </div>
          )}
        </section>
      )}

      {pick && <CreateSheet tree={pick.tree} tpl={pick.tpl} examples={pick.examples} bridge={{ want: want.trim(), block: block.trim() }} onClose={() => setPick(null)} />}
    </div>
  )
}

/** v0.5 «Собрать дерево ИИ»: when no template fits. Only the skill title goes out */
function AiTreeBuilder({ onImport }: { onImport: (tree: TreeCode, examples: string[]) => void }) {
  const on = useAiOn()
  const [title, setTitle] = useState('')
  const [stat, setStat] = useState<StatId>('mind')
  const { st, run, reset } = useAi<AiTree>()
  if (!on) return null
  const start = () => title.trim().length >= 2 && void run(treeTask(title.trim()))
  return (
    <section className="panel stack">
      <h3>Шаблона нет? ИИ соберёт дерево</h3>
      <p className="tiny muted">3–5 характеристик, узлы, что повышает и понижает, примеры «Кайфа». Уходит только название навыка.</p>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например «Гитара» или «Публичные выступления»" maxLength={60} aria-label="Название навыка для ИИ" />
        <AiButton onClick={start} disabled={title.trim().length < 2 || st.phase === 'loading'}>
          Собрать
        </AiButton>
      </div>
      <AiStatus st={st} onRetry={start} onCancel={reset} />
      {st.phase === 'done' && (
        <AiPreview
          title={`Дерево «${title.trim()}»`}
          ms={st.ms}
          onCancel={reset}
          applyLabel="Импортировать"
          onApply={() => {
            const tree: TreeCode = { v: 1, t: title.trim(), s: stat, tr: st.value.traits.map((t) => ({ t: t.t, ...(t.plus ? { p: t.plus } : {}), ...(t.minus ? { m: t.minus } : {}), n: t.nodes.map((n) => ({ t: n })) })), g: [] }
            onImport(tree, st.value.joy)
            reset()
          }}
        >
          {st.value.traits.map((t) => (
            <div key={t.t} className="ai-trait">
              <b>{t.t}</b>
              {(t.plus || t.minus) && (
                <span className="pm">
                  {t.plus && <span className="plus">+ {t.plus}</span>}
                  {t.minus && <span className="minus">− {t.minus}</span>}
                </span>
              )}
              <span className="small muted">{t.nodes.join(' · ')}</span>
            </div>
          ))}
          {st.value.joy.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <span className="tiny muted">Примеры «Кайфа»</span>
              {st.value.joy.map((j) => (
                <span key={j} className="small">
                  «{j}»
                </span>
              ))}
            </div>
          )}
          <Chips label="Стат-покровитель" options={STATS.map((s) => ({ id: s.id, label: s.name }))} value={stat} onChange={setStat} />
        </AiPreview>
      )}
    </section>
  )
}

function CreateSheet({ tree, tpl, examples: aiExamples, bridge, onClose }: { tree: TreeCode; tpl?: SkillTemplate; examples?: string[]; bridge: { want: string; block: string }; onClose: () => void }) {
  const createSkill = useStore((s) => s.createSkill)
  const deleteSkill = useStore((s) => s.deleteSkill)
  const say = useUi((s) => s.say)
  const [title, setTitle] = useState(tree.t)
  const [stat, setStat] = useState<StatId>(tree.s)
  const [kind, setKind] = useState<ValueKind>('joy')
  const [value, setValue] = useState(tpl?.joy[0] ?? aiExamples?.find((x) => checkValue(x).ok) ?? '')
  const [touched, setTouched] = useState(false)
  const check = checkValue(value, kind)
  const examples = tpl ? (kind === 'joy' ? tpl.joy : tpl.pain) : kind === 'joy' && aiExamples?.length ? aiExamples : kind === 'joy' ? ['Закрываю ноутбук в шесть, а сделано больше, чем за весь прошлый день'] : ['Каждое воскресенье тошнит от мысли, что неделя опять прошла впустую']

  const create = () => {
    if (!check.ok || !title.trim()) {
      setTouched(true)
      return
    }
    const now = nowWithOffset()
    const m = materializeTree(tree, { uid, now: now.getTime(), today: gameDayOf(now), value, valueKind: kind, status: 'active', order: 0, title, stat, templateId: tpl?.id, bridge })
    const status = createSkill(m)
    const text = status === 'later' ? 'Навык в «Позже»: в фокусе уже 3' : `Навык «${m.skill.title}» в фокусе`
    // an AI tree can be rolled back right away
    if (aiExamples) say(text, () => (deleteSkill(m.skill.id), go('/skill-new')))
    else say(text)
    onClose()
    go(`/skill/${m.skill.id}`)
  }

  return (
    <Sheet title={tpl ? tpl.title : tree.t || 'Новый навык'} onClose={onClose}>
      <div className="stack-lg">
        <button className="btn primary block" onClick={create}>
          Начать навык
        </button>
        <Field label="Название">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например «Продажи»" />
        </Field>
        <div className="stack" style={{ gap: 8 }}>
          <div className="seg-switch">
            <button aria-pressed={kind === 'joy'} onClick={() => (setKind('joy'), tpl && setValue(tpl.joy[0]))}>
              Кайф: к чему
            </button>
            <button aria-pressed={kind === 'pain'} onClick={() => (setKind('pain'), tpl && setValue(tpl.pain[0]))}>
              Боль: от чего
            </button>
          </div>
          <textarea className="textarea" value={value} maxLength={VALUE_MAX + 20} onChange={(e) => (setValue(e.target.value), setTouched(true))} placeholder={kind === 'joy' ? 'Что почувствуешь, когда навык есть? Где ты, что видишь?' : 'Какая боль уже есть? Когда она приходит?'} />
          <div className="row between tiny muted">
            <span>{check.ok ? '✓ конкретно' : touched || value ? check.reason : 'Ощущение или сцена, 20–200 символов'}</span>
            <span className="num">{value.trim().length}/200</span>
          </div>
          {!check.ok && (touched || value) && <p className="tiny" style={{ color: 'var(--ink-2)' }}>{check.hint}</p>}
          <div className="examples">
            {examples.map((x) => (
              <button key={x} className="example" onClick={() => setValue(x)}>
                «{x}»
              </button>
            ))}
          </div>
        </div>
        <Chips label="Стат-покровитель: туда идёт XP" options={STATS.map((s) => ({ id: s.id, label: s.name }))} value={stat} onChange={setStat} />
        {tpl && (
          <p className="tiny muted">
            В шаблоне {tpl.traits.length} характеристики, {tpl.traits.reduce((s, t) => s + t.nodes.length, 0)} узлов и по одной цели каждого типа. Всё редактируется.
          </p>
        )}
      </div>
    </Sheet>
  )
}
