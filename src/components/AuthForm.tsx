import { useState } from 'react'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { useStore } from '../store/store'
import { nickProblem, ruError } from '../cloud/client'
import { Field } from './ui'

type Mode = 'signup' | 'login'

/** Nick + password. No e-mail, no recovery — said plainly before the account exists. */
export function AuthForm({ initial = 'signup', onDone }: { initial?: Mode; onDone?: () => void }) {
  const profile = useStore((s) => s.data.profile)
  const [mode, setMode] = useState<Mode>(initial)
  const [nick, setNick] = useState('')
  const [pass, setPass] = useState('')
  const [display, setDisplay] = useState(profile?.nick ?? '')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [touched, setTouched] = useState(false)

  const nickErr = nick ? nickProblem(nick) : undefined
  const passErr = mode === 'signup' && pass && pass.length < 8 ? 'Минимум 8 символов' : undefined
  const ready = !!nick && !!pass && !nickErr && !passErr

  const submit = async () => {
    setTouched(true)
    if (!ready) return
    setBusy(true)
    setErr(undefined)
    try {
      const auth = await import('../cloud/auth')
      if (mode === 'signup') await auth.signUp(nick, pass, display.trim() || nick, profile?.avatar)
      else await auth.signIn(nick, pass)
      onDone?.()
    } catch (e) {
      setErr(ruError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
    >
      <div className="seg-switch" role="tablist" aria-label="Вход или регистрация" style={{ alignSelf: 'flex-start' }}>
        <button type="button" role="tab" aria-selected={mode === 'signup'} aria-pressed={mode === 'signup'} onClick={() => (setMode('signup'), setErr(undefined))}>
          Новый аккаунт
        </button>
        <button type="button" role="tab" aria-selected={mode === 'login'} aria-pressed={mode === 'login'} onClick={() => (setMode('login'), setErr(undefined))}>
          Уже есть
        </button>
      </div>

      <Field label="Ник для входа">
        <input
          className="input"
          value={nick}
          onChange={(e) => setNick(e.target.value.toLowerCase().replace(/\s/g, ''))}
          placeholder="snow_wolf"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={!!nickErr}
        />
      </Field>
      {nickErr ? <p className="err">{nickErr}</p> : mode === 'signup' && <p className="tiny muted" style={{ marginTop: -6 }}>Латиница, цифры и _, от 3 до 20 символов. Друзья его не видят — им показывается имя.</p>}

      <Field label="Пароль">
        <div className="pass-wrap">
          <input
            className="input"
            type={show ? 'text' : 'password'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            aria-invalid={!!passErr}
          />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </Field>
      {passErr && <p className="err">{passErr}</p>}

      {mode === 'signup' && (
        <>
          <Field label="Имя для друзей">
            <input className="input" value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={24} placeholder="Как тебя зовут в пати" />
          </Field>
          <div className="warn-note" role="note">
            <AlertTriangle size={18} aria-hidden />
            <span>
              <b>Пароль не восстановить — запиши его.</b> Почты нет, поэтому сбросить его некому.
            </span>
          </div>
        </>
      )}

      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      {touched && !ready && !err && !nickErr && !passErr && <p className="err">Заполни ник и пароль</p>}

      <button className="btn primary block" type="submit" disabled={busy}>
        {busy ? (mode === 'signup' ? 'Создаю аккаунт…' : 'Вхожу…') : mode === 'signup' ? 'Создать аккаунт' : 'Войти'}
      </button>
    </form>
  )
}
