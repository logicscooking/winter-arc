/**
 * Supabase is optional: without an account the app is fully local. The SDK is loaded lazily,
 * only when there is a session or the user opens the login form, so the offline app stays light.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

export const cloudConfigured = !!URL_ && !!KEY

/** Nick → synthetic e-mail for Supabase Auth. `.invalid` is a reserved TLD: no mail can ever go out. */
export const EMAIL_DOMAIN = 'winter-arc.invalid'
export const nickToEmail = (nick: string) => `${nick.trim().toLowerCase()}@${EMAIL_DOMAIN}`
export const NICK_RE = /^[a-z0-9_]{3,20}$/

export function nickProblem(nick: string): string | undefined {
  const n = nick.trim().toLowerCase()
  if (n.length < 3) return 'Ник — минимум 3 символа'
  if (n.length > 20) return 'Ник — максимум 20 символов'
  if (!NICK_RE.test(n)) return 'Только латиница, цифры и _'
  return undefined
}

const projectRef = (() => {
  try {
    return URL_ ? new URL(URL_).hostname.split('.')[0] : ''
  } catch {
    return ''
  }
})()

/** Cheap check without loading the SDK: is there a stored session? */
export function hasStoredSession(): boolean {
  if (!cloudConfigured) return false
  try {
    return !!localStorage.getItem(`sb-${projectRef}-auth-token`)
  } catch {
    return false
  }
}

let clientP: Promise<SupabaseClient> | undefined

export function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new CloudError('not_configured'))
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    }),
  )
  return clientP
}

// ---------- errors ----------

export class CloudError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

const MESSAGES: Record<string, string> = {
  not_configured: 'Сервер не настроен: нет адреса Supabase в .env',
  offline: 'Нет связи с сервером. Проверь интернет — приложение работает и без него.',
  invalid_credentials: 'Неверный ник или пароль',
  user_already_exists: 'Этот ник уже занят — выбери другой',
  weak_password: 'Пароль — минимум 8 символов',
  over_request_rate_limit: 'Слишком много попыток. Подожди пару минут',
  over_email_send_rate_limit: 'Слишком много попыток. Подожди пару минут',
  rate_limited: 'Слишком много попыток. Попробуй позже',
  join_rate_limited: 'Слишком много неверных кодов. Попробуй через час',
  invalid_code: 'Такого кода нет. Проверь буквы и цифры',
  party_full: 'В пати уже 8 человек — мест нет',
  too_many_parties: 'Можно состоять максимум в 3 пати',
  bad_name: 'Название пати — от 1 до 32 символов',
  no_profile: 'Профиль не создан. Выйди и войди снова',
  not_authenticated: 'Сессия истекла — войди снова',
  not_owner: 'Это может только создатель пати',
  not_in_party: 'Вы больше не в одной пати',
  nudge_rate_limited: 'Его уже пинали за последний час',
  schema_missing: 'Сервер ещё не готов: нужно применить supabase/schema.sql',
  denied: 'Нет доступа',
  too_big: 'Слишком большой файл',
  bad_image: 'Не получилось прочитать картинку',
  nick_mismatch: 'Ник не совпадает с логином',
}

export function ruError(e: unknown): string {
  const code = errorCode(e)
  if (MESSAGES[code]) return MESSAGES[code]
  if (e instanceof CloudError && e.message !== e.code) return e.message
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return msg && msg.length < 140 ? `Ошибка: ${msg}` : 'Что-то пошло не так. Попробуй ещё раз'
}

/** Normalises auth, PostgREST, storage and network errors to one short code */
export function errorCode(e: unknown): string {
  if (!e) return 'unknown'
  if (e instanceof CloudError) return e.code
  const o = e as { code?: unknown; error_code?: unknown; status?: unknown; name?: unknown; message?: unknown; statusCode?: unknown }
  const message = typeof o.message === 'string' ? o.message : ''
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (o.name === 'AuthRetryableFetchError' || /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(message)) return 'offline'
  const code = typeof o.code === 'string' ? o.code : typeof o.error_code === 'string' ? o.error_code : ''
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883') return 'schema_missing'
  if (code === '42501') return 'denied'
  if (code === 'P0001') {
    const m = message.trim()
    if (MESSAGES[m]) return m
  }
  if (code && MESSAGES[code]) return code
  if (/Invalid login credentials/i.test(message)) return 'invalid_credentials'
  if (/already registered/i.test(message)) return 'user_already_exists'
  if (/Password should be/i.test(message)) return 'weak_password'
  if (o.status === 429 || o.statusCode === '429') return 'rate_limited'
  if (o.statusCode === '413' || /exceeded the maximum allowed size/i.test(message)) return 'too_big'
  if (MESSAGES[message.trim()]) return message.trim()
  return code || 'unknown'
}

export const isOffline = (e: unknown) => errorCode(e) === 'offline'
