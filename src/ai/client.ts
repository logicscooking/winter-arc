/**
 * v0.5 «ИИ-помощник» transport: Pollinations anonymous tier, OpenAI-compatible, no key, free.
 * Client-side limits: 30 requests a day and a gap between requests. The task asked for at least 15 s;
 * the free tier itself answers once per 45 s per IP (402 FREE_LIMIT), so the gap is 45 s.
 * A 45 s timeout, one retry for an invalid answer (after the gap) or for a FREE_LIMIT reply.
 * The request body carries only the prompt messages: no nick, no id, no headers with personal data.
 */
import type { AiTask, ChatMessage } from './prompts'

export const AI_URL = 'https://text.pollinations.ai/openai'
export const AI_MODEL = 'openai'
export const AI_LIMIT = { gapMs: 45_000, perDay: 30, timeoutMs: 45_000, maxWaitMs: 50_000 } as const

export type AiErrorCode = 'off' | 'offline' | 'cooldown' | 'daily' | 'busy' | 'timeout' | 'bad'

export class AiError extends Error {
  code: AiErrorCode
  /** for «cooldown»: seconds to wait */
  wait?: number
  constructor(code: AiErrorCode, wait?: number) {
    super(code)
    this.code = code
    this.wait = wait
  }
}

export function aiErrorText(e: unknown): string {
  const code = e instanceof AiError ? e.code : 'busy'
  switch (code) {
    case 'off':
      return 'ИИ-помощник выключен. Включи его в «Ещё».'
    case 'offline':
      return 'Нет сети. ИИ работает только онлайн, остальное приложение — как обычно.'
    case 'cooldown':
      return `Бесплатный ИИ отвечает раз в 45 секунд. Подожди ${(e as AiError).wait ?? 45} с.`
    case 'daily':
      return `Лимит ${AI_LIMIT.perDay} запросов в день исчерпан. Завтра снова.`
    case 'timeout':
      return 'ИИ не ответил за 45 секунд. Попробуй через минуту.'
    case 'bad':
      return 'ИИ не справился, попробуй ещё раз.'
    default:
      return 'ИИ занят, попробуй через минуту.'
  }
}

// ---------- limits (pure) ----------

export interface AiUse {
  /** local calendar day of the counter, YYYY-MM-DD */
  day: string
  n: number
  /** ms of the last request */
  last: number
}

const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** null if a request may go now, otherwise the reason */
export function limitError(use: AiUse | undefined, now: number): AiError | null {
  if (!use) return null
  const gap = now - use.last
  if (gap >= 0 && gap < AI_LIMIT.gapMs) return new AiError('cooldown', Math.ceil((AI_LIMIT.gapMs - gap) / 1000))
  if (use.day === localDay(now) && use.n >= AI_LIMIT.perDay) return new AiError('daily')
  return null
}

export function bumpUse(use: AiUse | undefined, now: number): AiUse {
  const day = localDay(now)
  return { day, n: use?.day === day ? use.n + 1 : 1, last: now }
}

export const usedToday = (use: AiUse | undefined, now: number) => (use?.day === localDay(now) ? use.n : 0)

// ---------- transport ----------

export interface AiDeps {
  fetch: typeof fetch
  now: () => number
  online: () => boolean
  getUse: () => AiUse | undefined
  setUse: (u: AiUse) => void
  enabled: () => boolean
  timeoutMs?: number
  /** endpoint; dev uses a same-origin proxy because the free tier asks localhost pages for a Turnstile token */
  url?: string
  /** waits before a retry (tests pass an instant one) */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** 402 FREE_LIMIT from the free tier: «Retry after 15s» */
export class RateLimited extends AiError {
  retryMs: number
  constructor(retryMs: number) {
    super('busy')
    this.retryMs = retryMs
  }
}

export const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), rej(new AiError('timeout'))), { once: true })
  })

/** One HTTP call → the assistant text. 429 / 5xx / network → «busy», abort → «timeout». */
export async function callModel(messages: ChatMessage[], deps: Pick<AiDeps, 'fetch' | 'timeoutMs' | 'url'>, outer?: AbortSignal): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? AI_LIMIT.timeoutMs)
  const onOuter = () => ctrl.abort()
  outer?.addEventListener('abort', onOuter)
  try {
    let res: Response
    try {
      res = await deps.fetch(deps.url ?? AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: AI_MODEL, messages }),
        signal: ctrl.signal,
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
      })
    } catch (e) {
      if (ctrl.signal.aborted) throw new AiError('timeout')
      void e
      throw new AiError('busy')
    }
    if (res.status === 402 || res.status === 429) {
      const txt = await res.text().catch(() => '')
      const sec = Number(txt.match(/retry after (\d+)\s*s/i)?.[1] ?? res.headers.get('retry-after') ?? NaN)
      throw new RateLimited(Number.isFinite(sec) ? sec * 1000 : AI_LIMIT.gapMs)
    }
    if (!res.ok) throw new AiError('busy')
    let body: unknown
    try {
      body = await res.json()
    } catch {
      if (ctrl.signal.aborted) throw new AiError('timeout')
      throw new AiError('bad')
    }
    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new AiError('bad')
    return content
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuter)
  }
}

export interface AiRun<T> {
  value: T
  ms: number
  attempts: number
}

/**
 * Runs a task: checks the switch, the network and the limits, calls the model, validates.
 * One retry: after an invalid answer (waiting out the gap) or after a FREE_LIMIT reply (waiting what
 * the server asks, up to 50 s). Each attempt counts towards the daily limit. Then «bad» / «busy».
 */
export async function runTask<T>(task: AiTask<T>, deps: AiDeps, signal?: AbortSignal): Promise<AiRun<T>> {
  if (!deps.enabled()) throw new AiError('off')
  if (!deps.online()) throw new AiError('offline')
  const lim = limitError(deps.getUse(), deps.now())
  if (lim) throw lim
  const sleep = deps.sleep ?? defaultSleep
  const t0 = deps.now()
  let wait = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      const u = deps.getUse()
      if (u && u.day === bumpUse(u, deps.now()).day && u.n >= AI_LIMIT.perDay) throw new AiError('daily')
      if (wait > AI_LIMIT.maxWaitMs) throw new AiError('busy')
      if (wait > 0) await sleep(wait, signal)
    }
    deps.setUse(bumpUse(deps.getUse(), deps.now()))
    let raw: string
    try {
      raw = await callModel(task.messages, deps, signal)
    } catch (e) {
      if (e instanceof RateLimited && attempt === 1) {
        wait = e.retryMs + 1000
        continue
      }
      throw e
    }
    const value = task.validate(raw)
    if (value !== null) return { value, ms: deps.now() - t0, attempts: attempt }
    wait = AI_LIMIT.gapMs
  }
  throw new AiError('bad')
}
