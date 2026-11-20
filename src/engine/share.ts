/**
 * «Поделиться деревом»: a skill tree as a short code. Structure only: characteristics, nodes,
 * «как качать» and goal titles. Never practices, feedback, «Кайф», the bridge answers or scale points.
 * No backend: the code travels through any chat or the share sheet.
 */
import { MAX_NODES, MAX_TRAITS, goalsOf, nodesOf, traitsOf } from './skills'
import { STATS } from './levels'
import type { AppData, GoalType, StatId } from './types'

export interface TreeCode {
  v: 1
  t: string
  s: StatId
  i?: string
  tr: { t: string; p?: string; m?: string; n: { t: string; h?: string }[] }[]
  /** goals; `p` = index of the parent goal in this list */
  g?: { y: GoalType; t: string; p?: number; w?: number; sc?: { f: number; to: number; u?: string } }[]
}

export function treeFromSkill(data: AppData, skillId: string): TreeCode | null {
  const skill = (data.skills ?? []).find((s) => s.id === skillId)
  if (!skill) return null
  const goals = goalsOf(data, skillId).filter((g) => !g.doneAt)
  const index = new Map(goals.map((g, i) => [g.id, i]))
  return {
    v: 1,
    t: skill.title,
    s: skill.stat,
    ...(skill.icon ? { i: skill.icon } : {}),
    tr: traitsOf(data, skillId).map((tr) => ({
      t: tr.title,
      ...(tr.plus ? { p: tr.plus } : {}),
      ...(tr.minus ? { m: tr.minus } : {}),
      n: nodesOf(data, tr.id).map((n) => ({ t: n.title, ...(n.how ? { h: n.how } : {}) })),
    })),
    g: goals.map((g) => ({
      y: g.type,
      t: g.title,
      ...(g.parentId && index.has(g.parentId) ? { p: index.get(g.parentId) } : {}),
      ...(g.perWeek ? { w: g.perWeek } : {}),
      ...(g.scale ? { sc: { f: g.scale.from, to: g.scale.to, ...(g.scale.unit ? { u: g.scale.unit } : {}) } } : {}),
    })),
  }
}

const PREFIX_Z = 'WA1.'
const PREFIX_RAW = 'WA0.'

function toB64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encodeTree(tree: TreeCode): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(tree))
  if (typeof CompressionStream === 'undefined') return PREFIX_RAW + toB64url(bytes)
  return PREFIX_Z + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')))
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Decode and sanitize: anything malformed throws with a readable message */
export async function decodeTree(code: string): Promise<TreeCode> {
  const c = code.trim().replace(/\s+/g, '')
  const m = c.match(/WA[01]\.[A-Za-z0-9_-]+/)
  if (!m) throw new Error('Это не код дерева Winter Arc')
  let json: string
  try {
    const body = fromB64url(m[0].slice(4))
    json = new TextDecoder().decode(m[0].startsWith(PREFIX_Z) ? await pipe(body, new DecompressionStream('deflate-raw')) : body)
  } catch {
    throw new Error('Код повреждён: скопируй его целиком')
  }
  let raw: Partial<TreeCode>
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('Код повреждён: скопируй его целиком')
  }
  const title = str(raw.t, 60)
  if (!title || !Array.isArray(raw.tr)) throw new Error('В коде нет навыка')
  const stat = STATS.some((s) => s.id === raw.s) ? (raw.s as StatId) : 'mind'
  const types: GoalType[] = ['short', 'mid', 'long', 'repeat']
  return {
    v: 1,
    t: title,
    s: stat,
    ...(raw.i ? { i: str(raw.i, 20) } : {}),
    tr: raw.tr.slice(0, MAX_TRAITS).map((tr) => ({
      t: str(tr?.t, 60) || 'Характеристика',
      ...(str(tr?.p, 80) ? { p: str(tr.p, 80) } : {}),
      ...(str(tr?.m, 80) ? { m: str(tr.m, 80) } : {}),
      n: (Array.isArray(tr?.n) ? tr.n : []).slice(0, MAX_NODES).map((n) => ({ t: str(n?.t, 80) || 'Узел', ...(str(n?.h, 120) ? { h: str(n.h, 120) } : {}) })),
    })),
    g: (Array.isArray(raw.g) ? raw.g : [])
      .slice(0, 40)
      .filter((g) => g && types.includes(g.y) && str(g.t, 120))
      .map((g) => ({
        y: g.y,
        t: str(g.t, 120),
        ...(Number.isInteger(g.p) ? { p: g.p } : {}),
        ...(Number.isFinite(g.w) ? { w: Math.max(1, Math.min(7, Math.round(g.w!))) } : {}),
        ...(g.sc && Number.isFinite(g.sc.f) && Number.isFinite(g.sc.to) ? { sc: { f: g.sc.f, to: g.sc.to, ...(g.sc.u ? { u: str(g.sc.u, 12) } : {}) } } : {}),
      })),
  }
}

// ---------- tree → store records ----------

import type { SkillTemplate } from './templates'
import type { DayKey, Goal, Skill, SkillNode, Trait, ValueKind } from './types'

export function templateTree(t: SkillTemplate): TreeCode {
  return {
    v: 1,
    t: t.title,
    s: t.stat,
    i: t.icon,
    tr: t.traits.map((tr) => ({ t: tr.title, ...(tr.plus ? { p: tr.plus } : {}), ...(tr.minus ? { m: tr.minus } : {}), n: tr.nodes.map((n) => ({ t: n.t, ...(n.how ? { h: n.how } : {}) })) })),
    g: [
      { y: 'long', t: t.goals.long.title, ...(t.goals.long.scale ? { sc: { f: t.goals.long.scale.from, to: t.goals.long.scale.to, u: t.goals.long.scale.unit } } : {}) },
      { y: 'mid', t: t.goals.mid, p: 0 },
      { y: 'short', t: t.goals.short, p: 1 },
      { y: 'repeat', t: t.goals.repeat.title, w: t.goals.repeat.perWeek },
    ],
  }
}

export interface Materialized {
  skill: Skill
  traits: Trait[]
  nodes: SkillNode[]
  goals: Goal[]
}

export function materializeTree(
  tree: TreeCode,
  o: { uid: () => string; now: number; today: DayKey; value: string; valueKind: ValueKind; status: Skill['status']; order: number; title?: string; stat?: Skill['stat']; templateId?: string; bridge?: Skill['bridge'] },
): Materialized {
  const skill: Skill = {
    id: o.uid(),
    title: (o.title ?? tree.t).trim() || tree.t,
    stat: o.stat ?? tree.s,
    ...(tree.i ? { icon: tree.i } : {}),
    value: o.value.trim(),
    valueKind: o.valueKind,
    status: o.status,
    ...(o.bridge && (o.bridge.want || o.bridge.block) ? { bridge: o.bridge } : {}),
    ...(o.templateId ? { templateId: o.templateId } : {}),
    createdAt: o.now,
    order: o.order,
  }
  const traits: Trait[] = []
  const nodes: SkillNode[] = []
  tree.tr.forEach((tr, i) => {
    const trait: Trait = { id: o.uid(), skillId: skill.id, title: tr.t, ...(tr.p ? { plus: tr.p } : {}), ...(tr.m ? { minus: tr.m } : {}), order: i }
    traits.push(trait)
    tr.n.forEach((n, j) => nodes.push({ id: o.uid(), skillId: skill.id, traitId: trait.id, title: n.t, ...(n.h ? { how: n.h } : {}), order: j, createdAt: o.now }))
  })
  const ids: string[] = []
  const goals: Goal[] = []
  ;(tree.g ?? []).forEach((g, i) => {
    const id = o.uid()
    ids.push(id)
    const parent = g.p !== undefined && g.p < i ? ids[g.p] : undefined
    goals.push({
      id,
      skillId: skill.id,
      type: g.y,
      title: g.t,
      ...(parent ? { parentId: parent } : {}),
      createdAt: o.now,
      order: i,
      since: o.today,
      ...(g.y === 'short' || g.y === 'repeat' ? { checks: [] } : {}),
      ...(g.y === 'repeat' ? { perWeek: g.w ?? 3 } : {}),
      ...(g.y === 'long' && g.sc ? { scale: { from: g.sc.f, to: g.sc.to, ...(g.sc.u ? { unit: g.sc.u } : {}), points: [{ day: o.today, value: g.sc.f, at: o.now }] } } : {}),
    })
  })
  return { skill, traits, nodes, goals }
}
