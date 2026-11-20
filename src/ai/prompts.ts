/**
 * v0.5 «ИИ-помощник»: prompts and validators. The model is small (gpt-oss-20b on the free tier),
 * so prompts are short and strict, the answer must be JSON, and every field is checked and trimmed.
 * Only the listed inputs ever reach a prompt: skill title, characteristics, nodes, goals, «Кайф»
 * (skill check only) and plain numbers for the week. Never a nick, an id, confessions or notes.
 */
import { isMetric } from '../engine/skills'
import type { GoalType } from '../engine/types'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** A task: messages to send and a validator that returns null for an unusable answer */
export interface AiTask<T> {
  kind: string
  messages: ChatMessage[]
  validate: (raw: string) => T | null
}

// ---------- tolerant JSON ----------

/** First balanced `{…}` in the text (strings with braces inside are respected) */
function firstObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Cuts ```json fences, finds the first object, parses it. Trailing commas are forgiven. */
export function extractJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], text].filter((x): x is string => !!x)
  for (const c of candidates) {
    const obj = firstObject(c)
    if (!obj) continue
    for (const src of [obj, obj.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const v = JSON.parse(src)
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
      } catch {
        /* try the next form */
      }
    }
  }
  return null
}

// ---------- small field checks ----------

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/^[«"'\s-]+|[»"'\s]+$/g, '').trim() : '')

/** string within [min, max] after trimming; longer ones are cut at a word boundary */
export function text(v: unknown, min: number, max: number): string | null {
  let s = clean(v)
  if (s.length > max) {
    const cut = s.slice(0, max)
    const sp = cut.lastIndexOf(' ')
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s-]+$/, '')
  }
  return s.length >= min ? s : null
}

function strings(v: unknown, min: number, max: number, maxCount: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    const s = text(typeof x === 'object' && x ? ((x as Record<string, unknown>).t ?? (x as Record<string, unknown>).title ?? (x as Record<string, unknown>).name) : x, min, max)
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s)
    if (out.length >= maxCount) break
  }
  return out
}

/** the answer must be Russian: a stray English word («mismatch») is dropped */
const ru = (s: string | null): string | null => (s && /[а-яё]/i.test(s) ? s : null)

const SYS_BASE = 'Ты коуч в игре-трекере навыков. Пиши по-русски, коротко, конкретно, без воды и эмодзи. Отвечай ТОЛЬКО одним JSON-объектом без пояснений и без markdown.'

const sys = (rules: string): ChatMessage => ({ role: 'system', content: `${SYS_BASE}\n${rules}` })

// ---------- 1. «Проверить навык» ----------

export type Verdict = 'ok' | 'fix' | 'empty'
export const VERDICT_LABEL: Record<Verdict, string> = { ok: 'Ок', fix: 'Доработать', empty: 'Пусто' }
export const CHECK_POINTS = ['title', 'value', 'goals', 'scale'] as const
export type CheckPoint = (typeof CHECK_POINTS)[number]
export const CHECK_LABEL: Record<CheckPoint, string> = { title: 'Название', value: 'Кайф / Боль', goals: 'Цели', scale: 'Шкала' }

export interface SkillCheckInput {
  title: string
  valueKind: 'joy' | 'pain'
  value: string
  traits: { t: string; nodes: string[] }[]
  goals: { type: GoalType; title: string; scale?: string }[]
}

export interface SkillCheck {
  points: Record<CheckPoint, { v: Verdict; note: string }>
  /** «Как можно лучше»: a better «Кайф» / «Боль», 20–200 chars, if the model gave one */
  better?: string
}

function verdict(v: unknown): Verdict | null {
  const s = clean(v).toLowerCase()
  if (['ok', 'ок', 'хорошо', 'good'].includes(s)) return 'ok'
  if (['fix', 'доработать', 'улучшить', 'improve'].includes(s)) return 'fix'
  if (['empty', 'пусто', 'нет', 'none'].includes(s)) return 'empty'
  return null
}

const TYPE_RU: Record<GoalType, string> = { short: 'краткая', mid: 'средняя', long: 'долгая', repeat: 'повторяющаяся' }

export function skillCheckTask(i: SkillCheckInput): AiTask<SkillCheck> {
  const kind = i.valueKind === 'pain' ? 'Боль (от чего ухожу)' : 'Кайф (к чему иду)'
  const user = [
    `Навык: ${i.title.slice(0, 60)}`,
    `${kind}: ${i.value.slice(0, 200) || '—'}`,
    `Характеристики: ${i.traits.map((t) => `${t.t.slice(0, 40)} (${t.nodes.slice(0, 8).map((n) => n.slice(0, 40)).join(', ') || 'нет узлов'})`).join('; ') || '—'}`,
    `Цели: ${i.goals.map((g) => `${TYPE_RU[g.type]}: ${g.title.slice(0, 80)}${g.scale ? ` [шкала ${g.scale}]` : ''}`).join('; ') || '—'}`,
  ].join('\n')
  return {
    kind: 'check',
    messages: [
      sys(
        'Проверь навык по 4 пунктам и дай вердикт ok, fix или empty:\n' +
          'title — название это навык (умение), а не результат или метрика;\n' +
          'value — ощущение или сцена, конкретно, не клише вроде «для здоровья»;\n' +
          'goals — цели это действия руками, есть краткие (до 15 минут);\n' +
          'scale — у долгой цели есть числовая шкала.\n' +
          'note — одна фраза до 100 символов, что исправить. better — лучшая формулировка value от первого лица, 40–180 символов, сцена или ощущение.\n' +
          'Формат: {"title":{"v":"ok","note":"..."},"value":{"v":"fix","note":"..."},"goals":{"v":"ok","note":"..."},"scale":{"v":"empty","note":"..."},"better":"..."}',
      ),
      { role: 'user', content: user },
    ],
    validate: (raw) => {
      const o = extractJson(raw)
      if (!o) return null
      const points = {} as SkillCheck['points']
      for (const k of CHECK_POINTS) {
        const p = o[k]
        const v = verdict(p && typeof p === 'object' ? (p as Record<string, unknown>).v ?? (p as Record<string, unknown>).verdict : p)
        if (!v) return null
        const note = text(p && typeof p === 'object' ? (p as Record<string, unknown>).note : '', 0, 120) ?? ''
        points[k] = { v, note }
      }
      const better = text(o.better, 20, 200) ?? undefined
      return better ? { points, better } : { points }
    },
  }
}

// ---------- 2. «Собрать дерево ИИ» ----------

export interface AiTree {
  traits: { t: string; plus?: string; minus?: string; nodes: string[] }[]
  joy: string[]
}

export function treeTask(title: string): AiTask<AiTree> {
  return {
    kind: 'tree',
    messages: [
      sys(
        'Собери дерево навыка: 3–5 характеристик, в каждой 2–5 узлов. Узел — конкретный приём, который тренируют 15–30 минут, 2–6 обычных русских слов. Только реальные термины этой области, без выдуманных слов.\n' +
          'plus — что прокачивает характеристику, minus — что ей вредит, до 50 символов.\n' +
          'joy — 2 примера «Кайфа»: простая сцена от первого лица, 40–140 символов.\n' +
          'Пример для навыка «Плавание»: {"traits":[{"t":"Дыхание","plus":"выдох в воду","minus":"задержка воздуха","nodes":["Выдох носом под водой","Вдох на 3 гребка"]}],"joy":["Плыву 1 км без остановки и дышу ровно"]}\n' +
          'Формат: {"traits":[{"t":"...","plus":"...","minus":"...","nodes":["...","..."]}],"joy":["..."]}',
      ),
      { role: 'user', content: `Навык: ${title.slice(0, 60)}` },
    ],
    validate: (raw) => {
      const o = extractJson(raw)
      if (!o || !Array.isArray(o.traits)) return null
      const traits: AiTree['traits'] = []
      for (const tr of o.traits) {
        if (!tr || typeof tr !== 'object') continue
        const r = tr as Record<string, unknown>
        const t = ru(text(r.t ?? r.title ?? r.name, 2, 50))
        const nodes = strings(r.nodes, 2, 70, 5).filter((n) => ru(n))
        if (!t || nodes.length < 2 || traits.some((x) => x.t.toLowerCase() === t.toLowerCase())) continue
        const plus = ru(text(r.plus, 2, 60)) ?? undefined
        const minus = ru(text(r.minus, 2, 60)) ?? undefined
        traits.push({ t, ...(plus ? { plus } : {}), ...(minus ? { minus } : {}), nodes })
        if (traits.length >= 5) break
      }
      if (traits.length < 3) return null
      return { traits, joy: strings(o.joy, 20, 200, 3) }
    },
  }
}

// ---------- 3. «Разбить» ----------

export interface SplitInput {
  skill: string
  goal: { type: 'long' | 'mid'; title: string }
  /** titles of the goal's existing children, so the model does not repeat them */
  existing: string[]
}

export function splitTask(i: SplitInput): AiTask<string[]> {
  const toMid = i.goal.type === 'long'
  const rule = toMid
    ? 'Разбей долгую цель на 1–3 средних шага: каждый занимает от 15 минут до суток, это действие руками.'
    : 'Разбей среднюю цель на 1–3 кратких старта: каждый до 15 минут, конкретное действие руками («открыть», «написать», «выйти»), не метрика, без чисел денег и веса.'
  return {
    kind: 'split',
    messages: [
      sys(`${rule}\nКаждый пункт 3–80 символов, с глагола. Формат: {"items":["...","..."]}`),
      {
        role: 'user',
        content: `Навык: ${i.skill.slice(0, 60)}\n${toMid ? 'Долгая' : 'Средняя'} цель: ${i.goal.title.slice(0, 100)}${i.existing.length ? `\nУже есть: ${i.existing.slice(0, 5).map((e) => e.slice(0, 60)).join('; ')}` : ''}`,
      },
    ],
    validate: (raw) => {
      const o = extractJson(raw)
      if (!o) return null
      const taken = new Set(i.existing.map((e) => e.toLowerCase()))
      const items = strings(o.items ?? o.goals ?? o.steps, 3, 90, 5).filter((s) => !taken.has(s.toLowerCase()) && (toMid || !isMetric(s)))
      return items.length ? items.slice(0, 3) : null
    },
  }
}

// ---------- 4. «Следующий шаг» ----------

export interface NextStep {
  title: string
  minutes: number
}

export function nextStepTask(skill: string, goal: { type: GoalType; title: string }): AiTask<NextStep> {
  return {
    kind: 'next',
    messages: [
      sys(
        'Цель зависла: человек 3+ дня не может начать. Дай ОДИН минимальный старт до 15 минут: действие руками, такое простое, что нельзя не сделать. Не метрика.\n' +
          'title 3–80 символов, с глагола. minutes — целое от 1 до 15. Формат: {"title":"...","minutes":10}',
      ),
      { role: 'user', content: `Навык: ${skill.slice(0, 60)}\nЗависшая цель (${TYPE_RU[goal.type]}): ${goal.title.slice(0, 100)}` },
    ],
    validate: (raw) => {
      const o = extractJson(raw)
      if (!o) return null
      const title = text(o.title ?? o.step, 3, 90)
      if (!title || isMetric(title)) return null
      const m = o.minutes === undefined ? 10 : Math.round(Number(o.minutes))
      if (!Number.isFinite(m) || m < 1 || m > 15) return null
      return { title, minutes: m }
    },
  }
}

// ---------- 5. «Разбор недели» ----------

/** Only numbers. Skills are numbered, not named */
export interface WeekNumbers {
  week: number
  /** % of planned quests closed */
  questsPct: number
  perfectDays: number
  confessions: number
  xp: number
  bossWon: boolean | null
  skills: { n: number; xp: number; rank: string; practices: number }[]
}

export function weekTask(w: WeekNumbers): AiTask<string> {
  const lines = [
    `Неделя ${w.week} из 14`,
    `Квесты закрыты: ${w.questsPct}%`,
    `Идеальных дней: ${w.perfectDays} из 7`,
    `Исповедей: ${w.confessions} из 7`,
    `XP за неделю: ${w.xp}`,
    `Босс недели: ${w.bossWon === null ? 'бой идёт' : w.bossWon ? 'повержен' : 'выстоял'}`,
    ...w.skills.map((s) => `Навык ${s.n}: ранг ${s.rank}, XP ${s.xp}, практик ${s.practices}`),
  ]
  return {
    kind: 'week',
    messages: [
      sys('Сделай разбор недели по числам: 3–4 коротких предложения. Что получилось, где просадка, один конкретный совет на следующую неделю. Без оценок личности. Формат: {"text":"..."}'),
      { role: 'user', content: lines.join('\n') },
    ],
    validate: (raw) => {
      const o = extractJson(raw)
      const t = text(o?.text ?? o?.review, 40, 700)
      if (!t) return null
      const sentences = t.match(/[^.!?…]+[.!?…]+/g)?.map((s) => s.trim()) ?? [t]
      if (sentences.length < 2) return null
      return sentences.slice(0, 4).join(' ')
    },
  }
}
