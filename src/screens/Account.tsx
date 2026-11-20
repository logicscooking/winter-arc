import { useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, CloudOff, History, LogIn, RefreshCw } from 'lucide-react'
import { SHARE_KEYS, SHARE_LABEL, shareSettings } from '../engine'
import { useStore } from '../store/store'
import { useUi } from '../store/ui'
import { cloudConfigured, ruError } from '../cloud/client'
import { useSocial } from '../cloud/state'
import { deviceLabel, listSnapshots, syncNow } from '../cloud/sync'
import { AuthForm } from '../components/AuthForm'
import { Field } from '../components/ui'
import { timeAgo } from './Party'

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stack-lg">
      <div>
        <a className="back" href="#/more">
          <ArrowLeft size={18} /> Ещё
        </a>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  )
}

function syncLine(sync: ReturnType<typeof useSocial.getState>['sync']): string {
  switch (sync.status) {
    case 'syncing':
      return 'Синхронизирую…'
    case 'offline':
      return 'Нет сети — изменения уйдут, когда появится связь'
    case 'error':
      return sync.error === 'schema_missing' ? 'Сервер ещё не настроен (нужен schema.sql)' : `Не вышло синхронизировать: ${ruError({ code: sync.error })}`
    case 'ok':
      return sync.at ? `Синхронизировано ${timeAgo(new Date(sync.at).toISOString())}` : 'Синхронизировано'
    default:
      return 'Ожидает синхронизации'
  }
}

/** Top row in «Ещё»: login prompt or the account with sync status */
export function AccountEntry() {
  const account = useSocial((s) => s.account)
  const sync = useSocial((s) => s.sync)
  if (!cloudConfigured) return null
  if (!account)
    return (
      <a className="list-btn accent" href="#/more/account">
        <LogIn aria-hidden />
        <span className="grow">
          Войти, чтобы играть с друзьями и синхронизировать
          <small>Пати, лента, «пнуть», телефон ↔ Мак. Только ник и пароль</small>
        </span>
        <ChevronRight size={18} color="var(--mist)" aria-hidden />
      </a>
    )
  return (
    <a className="list-btn" href="#/more/account">
      <span className="acc-ava" aria-hidden>
        {account.avatar}
      </span>
      <span className="grow">
        {account.display_name}
        <small>
          @{account.nick} · {syncLine(sync)}
        </small>
      </span>
      <ChevronRight size={18} color="var(--mist)" aria-hidden />
    </a>
  )
}

export function AccountPage() {
  const account = useSocial((s) => s.account)
  if (!cloudConfigured)
    return (
      <Sub title="Аккаунт">
        <div className="empty">В этой сборке нет адреса сервера. Приложение работает полностью локально.</div>
      </Sub>
    )
  if (!account)
    return (
      <Sub title="Аккаунт">
        <p className="muted">Аккаунт нужен для пати и для синхронизации телефона с Маком. Без него всё работает как раньше, данные остаются на устройстве.</p>
        <section className="panel">
          <AuthForm />
        </section>
      </Sub>
    )
  return <Signed />
}

function Signed() {
  const account = useSocial((s) => s.account)!
  const sync = useSocial((s) => s.sync)
  const data = useStore((s) => s.data)
  const setSettings = useStore((s) => s.setSettings)
  const importData = useStore((s) => s.importData)
  const ask = useUi((s) => s.confirm)
  const say = useUi((s) => s.say)
  const [name, setName] = useState(account.display_name)
  const [busy, setBusy] = useState<string>()
  const share = shareSettings(data)
  const snaps = listSnapshots()

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) say(ok)
    } catch (e) {
      say(ruError(e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Sub title="Аккаунт">
      <section className="panel stack">
        <div className="row">
          <span className="acc-ava lg" aria-hidden>
            {account.avatar}
          </span>
          <div className="grow">
            <div style={{ fontWeight: 800 }}>{account.display_name}</div>
            <div className="small muted num">@{account.nick}</div>
          </div>
        </div>
        <form
          className="row"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault()
            void run('name', async () => (await import('../cloud/auth')).updateProfile({ display_name: name, avatar: data.profile?.avatar }), 'Имя обновлено')
          }}
        >
          <div className="grow">
            <Field label="Имя для друзей">
              <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <button className="btn sm" type="submit" disabled={!name.trim() || name === account.display_name || busy === 'name'}>
            Сохранить
          </button>
        </form>
        <p className="tiny muted">Аватар берётся из профиля персонажа: {data.profile?.avatar ?? '❄️'}. Ник для входа сменить нельзя.</p>
      </section>

      <section className="panel stack">
        <h3>Синхронизация</h3>
        <div className="row">
          {sync.status === 'offline' || sync.status === 'error' ? <CloudOff size={18} color="var(--hp)" aria-hidden /> : <RefreshCw size={18} color="var(--pine)" aria-hidden className={sync.status === 'syncing' ? 'spin' : undefined} />}
          <span className="grow small">{syncLine(sync)}</span>
        </div>
        <p className="tiny muted">
          Это устройство: {deviceLabel()}. Изменения уходят через несколько секунд, а при открытии приложения подтягиваются с другого устройства. Если оба устройства меняли одно и то же, побеждает более позднее изменение, а прежняя версия сохраняется в снимок ниже.
        </p>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>
          Синхронизировать сейчас
        </button>
      </section>

      <section className="panel stack" aria-label="Что видит пати">
        <h3>Что уходит в ленту пати</h3>
        {SHARE_KEYS.map((k) => (
          <div key={k} className="switch-row">
            <span>
              <span style={{ fontWeight: 700 }}>{SHARE_LABEL[k].title}</span>
              <span className="tiny muted" style={{ display: 'block' }}>
                {SHARE_LABEL[k].hint}
              </span>
            </span>
            <button className="switch" role="switch" aria-checked={share[k]} aria-label={SHARE_LABEL[k].title} onClick={() => setSettings({ share: { ...share, [k]: !share[k] } })} />
          </div>
        ))}
        <p className="tiny muted">Уровень, HP, гирлянда дня и серии видны участникам пати всегда. Исповеди, замеры, причины срывов и заметки не уходят никогда.</p>
      </section>

      {snaps.length > 0 && (
        <section className="stack">
          <h2>Снимки до синхронизации</h2>
          <p className="small muted">Перед тем как данные с другого устройства что-то заменили, здесь сохранилась прежняя версия. Хранятся 3 последних.</p>
          {snaps.map((s) => (
            <div key={s.at} className="panel tight row between">
              <div className="row">
                <History size={18} color="var(--pine)" aria-hidden />
                <div>
                  <div style={{ fontWeight: 700 }}>{new Date(s.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="tiny muted">{s.reason}</div>
                </div>
              </div>
              <button
                className="btn sm ghost"
                onClick={async () => {
                  if (!(await ask({ title: 'Вернуть этот снимок?', body: 'Текущие данные заменятся снимком и уйдут на другие устройства. Сначала можно скачать бэкап в «Ещё → Бэкап».', ok: 'Вернуть' }))) return
                  importData(s.data)
                  say('Снимок восстановлен')
                }}
              >
                Вернуть
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <button
          className="btn ghost block"
          disabled={!!busy}
          onClick={async () => {
            if (!(await ask({ title: 'Выйти из аккаунта?', body: 'Данные останутся на этом устройстве, приложение продолжит работать. Пати и синхронизация вернутся после входа.', ok: 'Выйти' }))) return
            void run('out', async () => (await import('../cloud/auth')).signOut(), 'Ты вышел из аккаунта')
          }}
        >
          Выйти
        </button>
        <button
          className="btn ghost block"
          style={{ color: 'var(--hp)' }}
          disabled={!!busy}
          onClick={async () => {
            if (!(await ask({ title: 'Удалить аккаунт?', body: 'С сервера удалятся профиль, облачная копия, твои события, реакции, пинки и скрины сверки. Пати без тебя продолжат жить. Данные на этом устройстве останутся. Отменить нельзя.', ok: 'Удалить навсегда', danger: true }))) return
            void run('del', async () => (await import('../cloud/auth')).deleteAccount(), 'Аккаунт удалён')
          }}
        >
          {busy === 'del' ? 'Удаляю…' : 'Удалить аккаунт'}
        </button>
      </section>
    </Sub>
  )
}
