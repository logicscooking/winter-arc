/**
 * v0.7 «Дерево»: the skill as a real RPG tree. Root (the skill) on top, a wire bus to the traits,
 * from every trait a vertical chain of nodes. Wires light up in the stage color as nodes grow;
 * a node that gained a stage «ignites». Layout is pure math on fixed columns, rendered as an SVG
 * of wires under absolutely placed buttons, so it stays crisp and tappable at 375 px.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Crosshair, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { MAX_NODES, MAX_TRAITS, PRACTICE_LIMIT, RANK_COLOR, STAGE_AT, STAGE_NAMES, formatDayShort, gameDayOf, needsPivot, practicesToday } from '../engine'
import type { NodeProgress, SkillNode, SkillView, Trait, TraitView } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Field, Sheet } from './ui'
import { PracticeSheet, RankBadge, StagePips, skillSprite } from './skills'
import { Px } from '../pixel/Pixel'
import './skilltree.css'

export const STAGE_COLOR = ['var(--line)', 'var(--frost)', 'var(--pine)', 'var(--st-mind)', 'var(--gold-mark)'] as const

// ---------- geometry ----------

const PAD = 6
const COL = 84
const GHOST_COL = 54
const ROOT = 78
const NODE = 58
const TRAIT_W = 76
const TRAIT_H = 50
const ROOT_Y = 46
const BUS_Y = 106
const TRAIT_Y = 142
const NODE_Y0 = TRAIT_Y + TRAIT_H / 2 + 22 + NODE / 2
const ROW = 98
const GHOST_NODE = 40

interface NodeSpot {
  node: SkillNode
  prog: NodeProgress
  x: number
  y: number
}
interface ColSpot {
  tv: TraitView
  x: number
  lit: boolean
  stage: number
  nodes: NodeSpot[]
  /** «+ узел» ghost centre, if the trait has room */
  ghostY?: number
}
interface Layout {
  w: number
  h: number
  rootX: number
  cols: ColSpot[]
  /** «+ характеристика» ghost x */
  ghostX?: number
}

function layout(view: SkillView): Layout {
  const traits = view.traits
  const ghost = traits.length < MAX_TRAITS
  const w = PAD * 2 + traits.length * COL + (ghost ? GHOST_COL : 0)
  const cols: ColSpot[] = traits.map((tv, i) => {
    const x = PAD + COL / 2 + i * COL
    const nodes = tv.nodes.map((n, k) => ({ ...n, x, y: NODE_Y0 + k * ROW }))
    const room = tv.nodes.length < MAX_NODES
    const n = tv.nodes.length
    const ghostY = n ? NODE_Y0 + (n - 1) * ROW + NODE / 2 + 30 + 14 + GHOST_NODE / 2 : TRAIT_Y + TRAIT_H / 2 + 16 + GHOST_NODE / 2
    const stage = tv.nodes.reduce((m, n) => Math.max(m, n.prog.stage), 0)
    return { tv, x, lit: stage > 0, stage, nodes, ghostY: room ? ghostY : undefined }
  })
  const rootX = traits.length ? (cols[0].x + cols[cols.length - 1].x) / 2 : w / 2
  const lastY = Math.max(TRAIT_Y + TRAIT_H / 2, ...cols.flatMap((c) => [...c.nodes.map((n) => n.y + NODE / 2 + 36), c.ghostY !== undefined ? c.ghostY + GHOST_NODE / 2 + 22 : 0]))
  return { w: Math.max(w, ROOT + PAD * 2), h: lastY + 8, rootX, cols, ghostX: ghost ? PAD + traits.length * COL + GHOST_COL / 2 : undefined }
}

/** one ring segment, i = 0..3, as an SVG arc path on a circle of radius r around (c, c) */
function arc(c: number, r: number, i: number, frac = 1): string {
  const gap = 14
  const a0 = -90 + i * 90 + gap / 2
  const a1 = a0 + (90 - gap) * Math.max(0, Math.min(1, frac))
  const p = (a: number) => [c + r * Math.cos((a * Math.PI) / 180), c + r * Math.sin((a * Math.PI) / 180)].map((v) => v.toFixed(2)).join(' ')
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
}

/** share of the way from the current stage to the next one */
function stageFrac(prog: NodeProgress): number {
  const lo = STAGE_AT[prog.stage]
  const hi = STAGE_AT[prog.stage + 1]
  if (hi === undefined) return 1
  return Math.max(0, Math.min(1, (prog.count - lo) / (hi - lo)))
}

export function StageRing({ prog, size = NODE }: { prog: NodeProgress; size?: number }) {
  const c = size / 2
  const r = c - 4
  const color = STAGE_COLOR[Math.max(1, prog.stage)]
  return (
    <svg className="st-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => {
        const seg = i + 1
        const full = seg <= prog.stage
        const next = seg === prog.stage + 1
        const wait = !full && seg <= prog.potential
        return (
          <g key={i}>
            <path d={arc(c, r, i)} className="st-ring-track" />
            {full && <path d={arc(c, r, i)} className="st-ring-fill" style={{ stroke: color }} />}
            {!full && wait && <path d={arc(c, r, i)} className="st-ring-wait" />}
            {next && !wait && prog.count > STAGE_AT[prog.stage] && <path d={arc(c, r, i, stageFrac(prog))} className="st-ring-fill part" style={{ stroke: STAGE_COLOR[seg] }} />}
          </g>
        )
      })}
    </svg>
  )
}

// ---------- the tree ----------

type Pending = { kind: 'node'; traitId: string } | { kind: 'trait' } | null

export function SkillTreeView({ view, onEditTrait }: { view: SkillView; onEditTrait: (t: Trait) => void }) {
  const L = useMemo(() => layout(view), [view])
  const wrap = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [traitId, setTraitId] = useState<string | null>(null)
  const [practice, setPractice] = useState<string | null>(null)
  const [adding, setAdding] = useState<Pending>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // fit the whole tree, but never smaller than readable; the user can zoom in and pan
  const fit = avail ? Math.max(0.78, Math.min(1, avail / L.w)) : 1
  const z = zoom ?? fit
  const canvasW = Math.max(L.w * z, avail)
  const ox = (canvasW - L.w * z) / 2

  // ignite: nodes whose stage grew since the last render of this tree
  const stages = useMemo(() => new Map(view.traits.flatMap((t) => t.nodes.map((n) => [n.node.id, n.prog.stage] as const))), [view])
  const sig = [...stages].map(([k, v]) => `${k}:${v}`).join('|')
  const prev = useRef<Map<string, number> | null>(null)
  const [fx, setFx] = useState<{ up: Set<string>; lit: Set<string> } | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = stages
    if (!before) return
    const up = new Set<string>()
    const lit = new Set<string>()
    for (const [id, s] of stages) {
      const was = before.get(id) ?? 0
      if (s > was) up.add(id)
      if (s > 0 && was === 0) lit.add(id)
    }
    if (up.size) setFx({ up, lit })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  useEffect(() => {
    if (!fx) return
    const t = setTimeout(() => setFx(null), 1900)
    return () => clearTimeout(t)
  }, [fx])

  const node = nodeId ? view.traits.flatMap((t) => t.nodes).find((n) => n.node.id === nodeId) : undefined
  const trait = traitId ? view.traits.find((t) => t.trait.id === traitId) : undefined
  const lit = view.traits.reduce((s, t) => s + t.nodes.filter((n) => n.prog.stage > 0).length, 0)
  const total = view.traits.reduce((s, t) => s + t.nodes.length, 0)
  const zoomStep = (d: number) => setZoom(Math.max(0.6, Math.min(1.4, Math.round((z + d) * 100) / 100)))

  return (
    <section className="stack st-wrap" aria-label="Дерево навыка">
      <div className="row between" style={{ gap: 8 }}>
        <p className="tiny muted grow">
          Зажжено <b className="num">{lit}</b> из <b className="num">{total}</b> узлов. Тапни узел — практика и отзыв.
        </p>
        <div className="st-zoom" role="group" aria-label="Масштаб">
          <button className="icon-btn" onClick={() => zoomStep(-0.15)} aria-label="Отдалить" disabled={z <= 0.6}>
            <Minus size={16} />
          </button>
          <button className="st-zoom-v num" onClick={() => setZoom(null)} aria-label="Вписать дерево">
            {Math.round(z * 100)}%
          </button>
          <button className="icon-btn" onClick={() => zoomStep(0.15)} aria-label="Приблизить" disabled={z >= 1.4}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="st-canvas" ref={wrap}>
        <div className="st-sizer" style={{ width: canvasW, height: L.h * z }}>
          <div className="st-plane" style={{ width: L.w, height: L.h, transform: `translate(${ox}px, 0) scale(${z})` }}>
            <Wires L={L} fx={fx} />
            <RootTile view={view} x={L.rootX} />
            {L.cols.map((c) => (
              <div key={c.tv.trait.id}>
                <button
                  className={`st-trait ${c.lit ? 'lit' : ''}`}
                  style={{ left: c.x - TRAIT_W / 2, top: TRAIT_Y - TRAIT_H / 2, width: TRAIT_W, height: TRAIT_H, ['--sc' as string]: STAGE_COLOR[Math.max(1, Math.round(c.tv.level))] }}
                  onClick={() => setTraitId(c.tv.trait.id)}
                  aria-label={`Характеристика «${c.tv.trait.title}», уровень ${c.tv.level.toFixed(1)}`}
                >
                  <span className="st-trait-t">{c.tv.trait.title}</span>
                  <span className="st-trait-l num">{c.tv.level.toFixed(1)}</span>
                </button>
                {c.nodes.map((n) => (
                  <NodeTile key={n.node.id} n={n} ignite={!!fx?.up.has(n.node.id)} late={!!fx?.lit.has(n.node.id)} onOpen={() => setNodeId(n.node.id)} />
                ))}
                {c.ghostY !== undefined && (
                  <button
                    className="st-ghost node"
                    style={{ left: c.x - GHOST_NODE / 2, top: c.ghostY - GHOST_NODE / 2, width: GHOST_NODE, height: GHOST_NODE }}
                    onClick={() => setAdding({ kind: 'node', traitId: c.tv.trait.id })}
                    aria-label={`Добавить узел в «${c.tv.trait.title}»`}
                  >
                    <Plus size={18} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
            {L.ghostX !== undefined && (
              <button
                className="st-ghost trait"
                style={{ left: L.ghostX - 22, top: TRAIT_Y - 22, width: 44, height: 44 }}
                onClick={() => setAdding({ kind: 'trait' })}
                aria-label="Добавить характеристику"
              >
                <Plus size={20} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="st-legend" aria-label="Ступени узла">
        {STAGE_NAMES.map((name, i) => (
          <span key={name} className="row" style={{ gap: 5 }}>
            <i style={{ background: i ? STAGE_COLOR[i] : 'transparent', borderColor: i ? STAGE_COLOR[i] : 'var(--mist)' }} />
            <span className="tiny">
              {name} <span className="muted num">{STAGE_AT[i]}</span>
            </span>
          </span>
        ))}
      </div>

      {node && (
        <NodeSheet
          node={node.node}
          prog={node.prog}
          onClose={() => setNodeId(null)}
          onPractice={() => {
            setNodeId(null)
            setPractice(node.node.id)
          }}
        />
      )}
      {trait && (
        <TraitInfo
          tv={trait}
          onClose={() => setTraitId(null)}
          onNode={(id) => {
            setTraitId(null)
            setNodeId(id)
          }}
          onEdit={() => {
            setTraitId(null)
            onEditTrait(trait.trait)
          }}
          onAdd={() => {
            setTraitId(null)
            setAdding({ kind: 'node', traitId: trait.trait.id })
          }}
        />
      )}
      {practice && <PracticeSheet nodeId={practice} onClose={() => setPractice(null)} />}
      {adding && <AddSheet skillId={view.skill.id} pending={adding} traits={view.traits.map((t) => t.trait)} onClose={() => setAdding(null)} />}
    </section>
  )
}

function Wires({ L, fx }: { L: Layout; fx: { up: Set<string>; lit: Set<string> } | null }) {
  type Seg = { key: string; d: string; color?: string; grow?: boolean; ghost?: boolean; late?: boolean }
  const base: Seg[] = []
  const lit: Seg[] = []
  const rootBottom = ROOT_Y + ROOT / 2
  const anyLit = L.cols.some((c) => c.lit)
  base.push({ key: 'stem', d: `M ${L.rootX} ${rootBottom} V ${BUS_Y}` })
  if (anyLit) lit.push({ key: 'stem', d: `M ${L.rootX} ${rootBottom} V ${BUS_Y}`, color: 'var(--pine)' })
  for (const c of L.cols) {
    const d = `M ${L.rootX} ${BUS_Y} H ${c.x} V ${TRAIT_Y - TRAIT_H / 2}`
    base.push({ key: `b${c.tv.trait.id}`, d })
    const fresh = !!fx && c.nodes.some((n) => fx.lit.has(n.node.id)) && c.nodes.filter((n) => n.prog.stage > 0).every((n) => fx.lit.has(n.node.id))
    if (c.lit) lit.push({ key: `b${c.tv.trait.id}`, d, color: 'var(--pine)', grow: fresh })
    let top = TRAIT_Y + TRAIT_H / 2
    for (const n of c.nodes) {
      const dn = `M ${c.x} ${top} V ${n.y - NODE / 2}`
      base.push({ key: `n${n.node.id}`, d: dn })
      if (n.prog.stage > 0) lit.push({ key: `n${n.node.id}`, d: dn, color: STAGE_COLOR[n.prog.stage], grow: !!fx?.lit.has(n.node.id), late: fresh })
      top = n.y + NODE / 2 + 30
    }
    if (c.ghostY !== undefined) base.push({ key: `g${c.tv.trait.id}`, d: `M ${c.x} ${top} V ${c.ghostY - GHOST_NODE / 2}`, ghost: true })
  }
  if (L.ghostX !== undefined) base.push({ key: 'gt', d: `M ${L.cols.length ? L.cols[L.cols.length - 1].x : L.rootX} ${BUS_Y} H ${L.ghostX} V ${TRAIT_Y - 22}`, ghost: true })
  return (
    <svg className="st-wires" width={L.w} height={L.h} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden shapeRendering="crispEdges">
      {base.map((s) => (
        <path key={s.key} d={s.d} className={s.ghost ? 'st-w ghost' : 'st-w track'} />
      ))}
      {lit.map((s) => (
        <g key={`l${s.key}`} className={`st-lit ${s.grow ? 'grow' : ''} ${s.late ? 'late' : ''}`} style={{ ['--wc' as string]: s.color }}>
          <path d={s.d} className="st-w fill" pathLength={1} />
          <path d={s.d} className="st-w shine" pathLength={1} />
        </g>
      ))}
    </svg>
  )
}

function RootTile({ view, x }: { view: SkillView; x: number }) {
  return (
    <div className="st-root" style={{ left: x - ROOT / 2, top: ROOT_Y - ROOT / 2, width: ROOT, height: ROOT, ['--rk' as string]: RANK_COLOR[view.rank] }} aria-label={`${view.skill.title}: ур. ${view.level}, ранг ${view.rank}`}>
      <Px name={skillSprite(view.skill)} size={46} />
      <span className="st-root-rank">
        <RankBadge rank={view.rank} size="sm" />
      </span>
      <span className="st-root-lvl num">ур. {view.level}</span>
    </div>
  )
}

function NodeTile({ n, ignite, late, onOpen }: { n: NodeSpot; ignite: boolean; late: boolean; onOpen: () => void }) {
  const s = n.prog.stage
  return (
    <>
      <button
        className={`st-node s${s} ${ignite ? 'ignite' : ''} ${late ? 'late' : ''} ${n.prog.needsFeedback ? 'wait' : ''}`}
        style={{ left: n.x - NODE / 2, top: n.y - NODE / 2, width: NODE, height: NODE, ['--sc' as string]: STAGE_COLOR[Math.max(1, s)] }}
        onClick={onOpen}
        aria-label={`Узел «${n.node.title}»: ${STAGE_NAMES[s]}, практик ${n.prog.count}`}
      >
        <StageRing prog={n.prog} />
        <span className="st-node-ico">
          <Px name={s === 0 ? 'lock' : s === 4 ? 'trophy' : 'star'} size={s === 0 ? 22 : 26} />
        </span>
        {n.prog.count > 0 && <span className="st-node-n num">{n.prog.count}</span>}
      </button>
      <span className="st-label" style={{ left: n.x - COL / 2 + 2, top: n.y + NODE / 2 + 3, width: COL - 4 }}>
        {n.node.title}
      </span>
    </>
  )
}

// ---------- sheets ----------

const TREND = { better: 'лучше', same: 'так же', worse: 'хуже' } as const

function NodeSheet({ node, prog, onClose, onPractice }: { node: SkillNode; prog: NodeProgress; onClose: () => void; onPractice: () => void }) {
  const data = useStore((s) => s.data)
  const setDealNode = useStore((s) => s.setDealNode)
  const updateNode = useStore((s) => s.updateNode)
  const deleteNode = useStore((s) => s.deleteNode)
  const confirm = useUi((s) => s.confirm)
  const today = gameDayOf(useNow())
  const used = practicesToday(data, node.id, today)
  const isDeal = data.days[today]?.dealNodeId === node.id
  const trait = data.traits?.find((t) => t.id === node.traitId)
  const [pivot, setPivot] = useState('')
  const last = (data.practices ?? [])
    .filter((p) => p.nodeId === node.id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
  return (
    <Sheet title="Узел" onClose={onClose}>
      <div className="stack-lg">
        <div className="row" style={{ gap: 14 }}>
          <span className={`st-node big s${prog.stage}`} style={{ ['--sc' as string]: STAGE_COLOR[Math.max(1, prog.stage)] }} aria-hidden>
            <StageRing prog={prog} size={72} />
            <span className="st-node-ico">
              <Px name={prog.stage === 0 ? 'lock' : prog.stage === 4 ? 'trophy' : 'star'} size={30} />
            </span>
          </span>
          <div className="grow stack" style={{ gap: 4 }}>
            <b style={{ fontSize: '1.1rem' }}>{node.title}</b>
            <span className="tiny muted">{trait?.title}</span>
            <span className="row" style={{ gap: 8 }}>
              <StagePips stage={prog.stage} potential={prog.potential} />
              <span className="small" style={{ fontWeight: 800 }}>
                {STAGE_NAMES[prog.stage]}
              </span>
            </span>
          </div>
        </div>
        <div className="st-facts">
          <span>
            <b className="num">{prog.count}</b>
            <small>практик</small>
          </span>
          <span>
            <b className="num">
              {prog.feedback}/{prog.count}
            </b>
            <small>с отзывом</small>
          </span>
          <span>
            <b className="num">{prog.stage >= 4 ? '★' : prog.toNext}</b>
            <small>{prog.stage >= 4 ? 'мастер' : `до «${STAGE_NAMES[prog.stage + 1]}»`}</small>
          </span>
        </div>
        {prog.needsFeedback && <p className="node-hint">Ступень ждёт отзывов: {prog.feedback}/{prog.count}, нужно у половины практик.</p>}
        {node.how && <p className="small card-calm">Как качать: {node.how}</p>}
        {needsPivot(node, prog) && (
          <div className="pivot-card">
            <b>3 раза без прогресса</b>
            <p className="small">Ищи другой путь.</p>
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
              <button className="btn sm" type="submit" aria-label="Сохранить">
                <Check size={18} />
              </button>
            </form>
          </div>
        )}
        {node.pivot && <p className="small muted">Пробую иначе: {node.pivot}</p>}
        {last.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 800 }}>
              Обратная связь
            </span>
            {last.map((p) => (
              <div key={p.id} className="st-fb">
                <span className="tiny muted num">{formatDayShort(p.day)}</span>
                {p.trend && <span className={`tag st-tr ${p.trend}`}>{TREND[p.trend]}</span>}
                <span className="small grow">{p.note?.trim() || <i className="muted">без отзыва</i>}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn primary block" disabled={used >= PRACTICE_LIMIT} onClick={onPractice}>
          <Plus size={18} strokeWidth={3} /> {used >= PRACTICE_LIMIT ? `Лимит ${PRACTICE_LIMIT} в день` : 'практика'}
        </button>
        <div className="grid-2">
          <button className={`btn sm ${isDeal ? 'amber' : 'ghost'}`} style={{ whiteSpace: 'nowrap' }} onClick={() => setDealNode(today, isDeal ? null : node.id)}>
            <Crosshair size={16} /> {isDeal ? 'Дело дня' : 'Сегодня качаю'}
          </button>
          <button
            className="btn sm ghost"
            onClick={async () => {
              if (await confirm({ title: `Удалить «${node.title}»?`, body: 'Практики узла тоже удалятся. XP за них уйдёт.', ok: 'Удалить', danger: true })) {
                deleteNode(node.id)
                onClose()
              }
            }}
          >
            <Trash2 size={16} /> Удалить
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function TraitInfo({ tv, onClose, onNode, onEdit, onAdd }: { tv: TraitView; onClose: () => void; onNode: (id: string) => void; onEdit: () => void; onAdd: () => void }) {
  return (
    <Sheet title="Характеристика" onClose={onClose}>
      <div className="stack-lg">
        <div className="row between" style={{ gap: 10 }}>
          <b style={{ fontSize: '1.15rem' }}>{tv.trait.title}</b>
          <span className="st-trait-l num big">{tv.level.toFixed(1)}</span>
        </div>
        <div className="st-pm">
          <div className="plus">
            <small>Что повышает</small>
            {tv.trait.plus || <i className="muted">не задано</i>}
          </div>
          <div className="minus">
            <small>Что понижает</small>
            {tv.trait.minus || <i className="muted">не задано</i>}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {tv.nodes.map(({ node, prog }) => (
            <button key={node.id} className="list-btn st-list-node" onClick={() => onNode(node.id)}>
              <span className={`st-node mini s${prog.stage}`} style={{ ['--sc' as string]: STAGE_COLOR[Math.max(1, prog.stage)] }} aria-hidden>
                <StageRing prog={prog} size={38} />
              </span>
              <span className="grow">
                {node.title}
                <small>
                  {STAGE_NAMES[prog.stage]} · {prog.count}
                </small>
              </span>
            </button>
          ))}
          {!tv.nodes.length && <p className="small muted">Пока без узлов.</p>}
        </div>
        <div className="grid-2">
          <button className="btn ghost" onClick={onEdit}>
            <Pencil size={16} /> Изменить
          </button>
          <button className="btn" onClick={onAdd} disabled={tv.nodes.length >= MAX_NODES}>
            <Plus size={16} strokeWidth={3} /> узел
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function AddSheet({ skillId, pending, traits, onClose }: { skillId: string; pending: NonNullable<Pending>; traits: Trait[]; onClose: () => void }) {
  const addNode = useStore((s) => s.addNode)
  const addTrait = useStore((s) => s.addTrait)
  const say = useUi((s) => s.say)
  const [title, setTitle] = useState('')
  const [how, setHow] = useState('')
  const isNode = pending.kind === 'node'
  const trait = isNode ? traits.find((t) => t.id === pending.traitId) : undefined
  return (
    <Sheet title={isNode ? 'Новый узел' : 'Новая характеристика'} onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          if (isNode) addNode(skillId, pending.traitId, title.trim(), how.trim() || undefined, nowWithOffset())
          else addTrait(skillId, title.trim())
          say(isNode ? 'Узел на ветке' : 'Новая ветка дерева')
          onClose()
        }}
      >
        {trait && <p className="small muted">Ветка «{trait.title}»</p>}
        <Field label={isNode ? 'Конкретный узел' : `Характеристика (${traits.length + 1}/${MAX_TRAITS})`}>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNode ? 'Например «Темп 6:30 на 3 км»' : 'Например «Выносливость»'} maxLength={60} />
        </Field>
        {isNode && (
          <Field label="Как качать (необязательно)">
            <input className="input" value={how} onChange={(e) => setHow(e.target.value)} placeholder="Ролик, книга, совет" maxLength={120} />
          </Field>
        )}
        <button className="btn primary block" type="submit" disabled={!title.trim()}>
          Добавить
        </button>
      </form>
    </Sheet>
  )
}

// ---------- mini preview for the skill card ----------

/** A small silhouette: root dot, a bus, every trait a column of node dots lit in stage colors */
export function SkillTreeMini({ view }: { view: SkillView }) {
  const traits = view.traits
  if (!traits.length) return null
  const D = 7
  const GX = 13
  const GY = 9
  const rows = Math.min(4, Math.max(1, ...traits.map((t) => t.nodes.length)))
  const w = 12 + traits.length * GX
  const h = 12 + rows * GY
  const lit = traits.reduce((s, t) => s + t.nodes.filter((n) => n.prog.stage > 0).length, 0)
  const total = traits.reduce((s, t) => s + t.nodes.length, 0)
  return (
    <span className="st-mini" aria-label={`Дерево: зажжено ${lit} из ${total} узлов`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
        <rect x={1} y={1} width={D + 1} height={D + 1} fill={RANK_COLOR[view.rank]} />
        <rect x={D + 2} y={4} width={w - D - 4} height={2} fill="var(--line)" />
        {traits.map((t, i) => {
          const x = 12 + i * GX
          const anyLit = t.nodes.some((n) => n.prog.stage > 0)
          return (
            <g key={t.trait.id}>
              <rect x={x + 2} y={4} width={2} height={h - 8} fill={anyLit ? 'var(--pine)' : 'var(--line)'} />
              {t.nodes.slice(0, rows).map((n, k) => (
                <rect key={n.node.id} x={x} y={10 + k * GY} width={6} height={6} fill={n.prog.stage ? STAGE_COLOR[n.prog.stage] : 'var(--surface-3)'} stroke={n.prog.stage ? 'none' : 'var(--line)'} />
              ))}
            </g>
          )
        })}
      </svg>
      <span className="tiny muted num">
        {lit}/{total} узлов
      </span>
    </span>
  )
}
