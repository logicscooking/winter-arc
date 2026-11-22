import { describe, expect, it, vi } from 'vitest'
import { AI_LIMIT, AI_URL, AiError, bumpUse, callModel, limitError, runTask, usedToday } from './client'
import type { AiDeps, AiUse } from './client'
import { extractJson, nextStepTask, skillCheckTask, splitTask, text, treeTask, weekTask } from './prompts'

const reply = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], user_tier: 'anonymous' }), { status, headers: { 'Content-Type': 'application/json' } })

function deps(over: Partial<AiDeps> = {}, answers: (Response | Error)[] = []): AiDeps & { calls: RequestInit[]; use?: AiUse } {
  const calls: RequestInit[] = []
  const st: { use?: AiUse } = {}
  let t = Date.parse('2026-11-20T12:00:00')
  const d = {
    calls,
    fetch: vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init!)
      const a = answers.shift()
      if (!a) throw new TypeError('network')
      if (a instanceof Error) throw a
      return a
    }) as unknown as typeof fetch,
    now: () => (t += 1000),
    online: () => true,
    getUse: () => st.use,
    setUse: (u: AiUse) => void (st.use = u),
    enabled: () => true,
    sleep: async () => undefined,
    ...over,
  }
  return Object.defineProperty(d, 'use', { get: () => st.use }) as AiDeps & { calls: RequestInit[]; use?: AiUse }
}

describe('extractJson', () => {
  it('cuts ```json fences and surrounding text', () => {
    expect(extractJson('Вот ответ:\n```json\n{"items":["a"]}\n```\nУдачи!')).toEqual({ items: ['a'] })
  })
  it('finds the first object, respecting braces inside strings', () => {
    expect(extractJson('blah {"text":"a {b} c","n":1} tail {"x":2}')).toEqual({ text: 'a {b} c', n: 1 })
  })
  it('forgives trailing commas and rejects garbage', () => {
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] })
    expect(extractJson('нет json')).toBeNull()
    expect(extractJson('[1,2]')).toBeNull()
    expect(extractJson(undefined)).toBeNull()
    expect(extractJson('{"a": ')).toBeNull()
  })
})

describe('text()', () => {
  it('trims quotes and whitespace, cuts long text on a word', () => {
    expect(text('  «Привет   мир»  ', 3, 50)).toBe('Привет мир')
    const t = text('слово '.repeat(40), 3, 50)!
    expect(t.length).toBeLessThanOrEqual(50)
    expect(t.endsWith(' ')).toBe(false)
    expect(text('ab', 3, 50)).toBeNull()
    expect(text(42, 1, 5)).toBeNull()
  })
})

describe('skill check validator', () => {
  const task = skillCheckTask({ title: 'Бег', valueKind: 'joy', value: 'для здоровья', traits: [{ t: 'База', nodes: ['Зона 2'] }], goals: [{ type: 'short', title: 'Выйти на 1 км' }] })
  it('sends only the skill fields', () => {
    const all = task.messages.map((m) => m.content).join('\n')
    expect(all).toContain('Бег')
    expect(all).toContain('Зона 2')
    expect(all).toContain('Выйти на 1 км')
  })
  it('accepts English and Russian verdicts, keeps «better» only when it fits', () => {
    const ok = task.validate(
      '```json\n{"title":{"v":"ok","note":"норм"},"value":{"v":"доработать","note":"клише"},"goals":{"v":"OK"},"scale":{"v":"empty","note":"нет шкалы"},"better":"Бегу утром по набережной, дыхание ровное, ноги лёгкие"}\n```',
    )
    expect(ok?.points.value.v).toBe('fix')
    expect(ok?.points.goals).toEqual({ v: 'ok', note: '' })
    expect(ok?.points.scale.v).toBe('empty')
    expect(ok?.better).toMatch(/^Бегу/)
    const short = task.validate('{"title":"ok","value":"fix","goals":"ok","scale":"ok","better":"коротко"}')
    expect(short).not.toBeNull()
    expect(short?.better).toBeUndefined()
  })
  it('rejects a missing point or an unknown verdict', () => {
    expect(task.validate('{"title":{"v":"ok"},"value":{"v":"ok"},"goals":{"v":"ok"}}')).toBeNull()
    expect(task.validate('{"title":{"v":"супер"},"value":{"v":"ok"},"goals":{"v":"ok"},"scale":{"v":"ok"}}')).toBeNull()
  })
})

describe('tree validator', () => {
  const task = treeTask('Гитара')
  it('keeps 3–5 traits with 2–5 nodes, drops broken ones, cuts extras', () => {
    const traits = Array.from({ length: 7 }, (_, i) => ({ t: `Хар ${i}`, plus: 'практика', nodes: ['Узел a', 'Узел b', 'Узел c', 'Узел d', 'Узел e', 'Узел f'] }))
    traits[1].nodes = ['одинокий']
    const v = task.validate(JSON.stringify({ traits, joy: ['Играю у костра, все поют, пальцы сами находят аккорды', 'коротко'] }))!
    expect(v.traits).toHaveLength(5)
    expect(v.traits.some((t) => t.t === 'Хар 1')).toBe(false)
    expect(v.traits.every((t) => t.nodes.length >= 2 && t.nodes.length <= 5)).toBe(true)
    expect(v.joy).toHaveLength(1)
  })
  it('accepts node objects and rejects fewer than 3 traits', () => {
    const v = task.validate('{"traits":[{"title":"Аа","nodes":[{"t":"раз раз"},{"title":"два два"}]},{"name":"Бб","nodes":["хват","бой"]},{"t":"Вв","nodes":["аа","бб"],"minus":"mismatch"}]}')
    expect(v?.traits.map((t) => t.t)).toEqual(['Аа', 'Бб', 'Вв'])
    expect(v?.traits[2].minus).toBeUndefined()
    expect(task.validate('{"traits":[{"t":"Аа","nodes":["аа","бб"]},{"t":"Ok","nodes":["аа","бб"]},{"t":"Вв","nodes":["aa","bb"]}]}')).toBeNull()
    expect(task.validate('{"joy":[]}')).toBeNull()
  })
})

describe('split validator', () => {
  it('mid → shorts: no metrics, no duplicates, at most 3', () => {
    const task = splitTask({ skill: 'Продажи', goal: { type: 'mid', title: 'Первые 10 клиентов' }, existing: ['Написать 1 сообщение'] })
    const v = task.validate('{"items":["Написать 1 сообщение","Заработать 50 000 ₽","Открыть список контактов","Набросать оффер в 3 строки","Позвонить другу","Ещё пункт"]}')
    expect(v).toEqual(['Открыть список контактов', 'Набросать оффер в 3 строки', 'Позвонить другу'])
    expect(task.validate('{"items":["Похудеть на 5 кг"]}')).toBeNull()
  })
  it('long → mids allows numbers', () => {
    const task = splitTask({ skill: 'Бег', goal: { type: 'long', title: '10 км' }, existing: [] })
    expect(task.validate('{"items":["Пробежать 3 км без остановки"]}')).toEqual(['Пробежать 3 км без остановки'])
  })
})

describe('next step validator', () => {
  const task = nextStepTask('Английский', { type: 'short', title: '30 минут сериала' })
  it('one action up to 15 minutes', () => {
    expect(task.validate('{"title":"Открыть приложение и пройти 1 урок","minutes":5}')).toEqual({ title: 'Открыть приложение и пройти 1 урок', minutes: 5 })
    expect(task.validate('{"title":"Открыть учебник"}')).toEqual({ title: 'Открыть учебник', minutes: 10 })
    expect(task.validate('{"title":"Позаниматься","minutes":40}')).toBeNull()
    expect(task.validate('{"title":"Заработать 100 $","minutes":5}')).toBeNull()
  })
})

describe('week validator', () => {
  const task = weekTask({ week: 2, questsPct: 71, perfectDays: 3, confessions: 6, xp: 640, skills: [{ n: 1, xp: 120, rank: 'C', practices: 9 }] })
  it('sends only numbers, no skill names', () => {
    const user = task.messages[1].content
    expect(user).toContain('71%')
    expect(user).toContain('Навык 1: ранг C, XP 120, практик 9')
  })
  it('keeps 2–4 sentences', () => {
    const v = task.validate('{"text":"Квесты на 71%, это крепко. Идеальных дней три. Исповеди почти каждый день. Серия держится. Лишнее предложение."}')
    expect(v?.match(/[.!?]/g)).toHaveLength(4)
    expect(task.validate('{"text":"Одно предложение без точки и длинное достаточно чтобы пройти"}')).toBeNull()
  })
})

describe('limits', () => {
  it('a gap of at least 15 s (45 s: the free tier rate) and 30 a day', () => {
    expect(AI_LIMIT.gapMs).toBeGreaterThanOrEqual(15_000)
    const t = Date.parse('2026-11-20T12:00:00')
    let u = bumpUse(undefined, t)
    expect(limitError(u, t + 5000)?.code).toBe('cooldown')
    expect(limitError(u, t + 5000)?.wait).toBe((AI_LIMIT.gapMs - 5000) / 1000)
    expect(limitError(u, t + AI_LIMIT.gapMs)).toBeNull()
    for (let i = 1; i < AI_LIMIT.perDay; i++) u = bumpUse(u, t + i * 60_000)
    expect(u.n).toBe(30)
    expect(limitError(u, t + 3600_000)?.code).toBe('daily')
    expect(usedToday(u, t + 3600_000)).toBe(30)
    // next day the counter resets
    expect(limitError(u, t + 86400_000)).toBeNull()
    expect(bumpUse(u, t + 86400_000).n).toBe(1)
  })
})

describe('transport', () => {
  const task = nextStepTask('Бег', { type: 'short', title: 'Выйти на пробежку' })

  it('posts the OpenAI body to Pollinations with no personal data', async () => {
    const d = deps({}, [reply('{"title":"Надеть кроссовки и выйти","minutes":5}')])
    const r = await runTask(task, d)
    expect(r.value.title).toBe('Надеть кроссовки и выйти')
    expect(r.attempts).toBe(1)
    expect((d.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(AI_URL)
    const body = JSON.parse(String(d.calls[0].body))
    expect(Object.keys(body).sort()).toEqual(['messages', 'model'])
    expect(body.model).toBe('openai')
    expect(d.calls[0].credentials).toBe('omit')
    expect(d.use?.n).toBe(1)
  })

  it('retries once on an invalid answer, then gives up with «bad»', async () => {
    const ok = deps({}, [reply('не json'), reply('{"title":"Выйти за дверь","minutes":3}')])
    expect((await runTask(task, ok)).attempts).toBe(2)
    expect(ok.use?.n).toBe(2)
    const bad = deps({}, [reply('мусор'), reply('{"x":1}')])
    await expect(runTask(task, bad)).rejects.toMatchObject({ code: 'bad' })
  })

  it('a FREE_LIMIT 402 waits what the server asks and retries once', async () => {
    const waits: number[] = []
    const limited = () => new Response('{"error":{"code":"FREE_LIMIT","message":"Free limit reached: 1 reply every 45 seconds per IP. Retry after 15s"}}', { status: 402 })
    const d = deps({ sleep: async (ms) => void waits.push(ms) }, [limited(), reply('{"title":"Выйти за дверь","minutes":2}')])
    expect((await runTask(task, d)).attempts).toBe(2)
    expect(waits).toEqual([16_000])
    await expect(runTask(task, deps({}, [limited(), limited()]))).rejects.toMatchObject({ code: 'busy' })
  })

  it('an invalid answer is retried after the gap', async () => {
    const waits: number[] = []
    await runTask(task, deps({ sleep: async (ms) => void waits.push(ms) }, [reply('мусор'), reply('{"title":"Выйти за дверь"}')]))
    expect(waits).toEqual([AI_LIMIT.gapMs])
  })

  it('429, 5xx and network errors are «busy»', async () => {
    await expect(runTask(task, deps({}, [reply('', 429), reply('', 429)]))).rejects.toMatchObject({ code: 'busy' })
    await expect(runTask(task, deps({}, [reply('', 502)]))).rejects.toMatchObject({ code: 'busy' })
    await expect(runTask(task, deps({}, [new TypeError('Failed to fetch')]))).rejects.toMatchObject({ code: 'busy' })
  })

  it('off, offline and the local limit stop before any request', async () => {
    const off = deps({ enabled: () => false })
    await expect(runTask(task, off)).rejects.toMatchObject({ code: 'off' })
    const offline = deps({ online: () => false })
    await expect(runTask(task, offline)).rejects.toMatchObject({ code: 'offline' })
    const d = deps({}, [reply('{"title":"Выйти за дверь"}')])
    await runTask(task, d)
    await expect(runTask(task, d)).rejects.toMatchObject({ code: 'cooldown' })
    expect(d.calls).toHaveLength(1)
  })

  it('times out with an AbortController', async () => {
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init!.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))))
    await expect(callModel([], { fetch: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toBeInstanceOf(AiError)
    await expect(callModel([], { fetch: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' })
  })
})
