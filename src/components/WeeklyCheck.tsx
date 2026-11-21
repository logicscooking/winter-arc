import { useRef, useState } from 'react'
import { Camera, Check, Users } from 'lucide-react'
import { ruError } from '../cloud/client'
import { useSocial } from '../cloud/state'
import { compressImage } from '../cloud/image'
import { uploadCheck } from '../cloud/party'
import { useUi } from '../store/ui'
import { Help } from './ui'

/** «Воскресная сверка»: the Screen Time weekly report goes to the party, next to the confessions */
export function WeeklyCheck({ week }: { week: number }) {
  const account = useSocial((s) => s.account)
  const parties = useSocial((s) => s.parties)
  const posted = useSocial((s) => {
    const me = s.account?.id
    return Object.values(s.feed).some((list) => list.some((e) => e.user_id === me && e.key === `check:${week}`))
  })
  const say = useUi((s) => s.say)
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [preview, setPreview] = useState<string>()

  return (
    <section className="panel stack" aria-label="Воскресная сверка">
      <div className="row" style={{ gap: 10 }}>
        <Camera size={20} color="var(--pine)" aria-hidden />
        <h2 className="grow">Воскресная сверка</h2>
        {posted && (
          <span className="tag auto">
            <Check size={12} aria-hidden /> в ленте
          </span>
        )}
      </div>
      <p className="small muted">
        Скрин «Экранного времени» за неделю{' '}
        <Help title="Воскресная сверка" text={['Настройки → Экранное время → «Все действия» → «Неделя». Сделай скрин и загрузи сюда.', 'Пати увидит его рядом с твоими исповедями. 10 секунд — и врать бессмысленно.']} />
      </p>
      {!account || parties.length === 0 ? (
        <a className="list-btn" href="#/party">
          <Users aria-hidden />
          <span className="grow">
            {account ? 'Вступи в пати, чтобы сверяться' : 'Войти, чтобы играть с друзьями и синхронизировать'}
            <small>Сверка видна только участникам твоей пати</small>
          </span>
        </a>
      ) : (
        <>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setBusy(true)
              setErr(undefined)
              try {
                const img = await compressImage(f)
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old)
                  return URL.createObjectURL(img)
                })
                await uploadCheck(img, week)
                say('Сверка отправлена в пати')
              } catch (x) {
                setErr(ruError(x))
              } finally {
                setBusy(false)
              }
            }}
          />
          {preview && <img src={preview} alt="Скрин, который ушёл в пати" className="check-preview" />}
          {err && <p className="err">{err}</p>}
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => file.current?.click()}>
            <Camera size={18} aria-hidden /> {busy ? 'Отправляю…' : posted ? 'Заменить скрин' : 'Загрузить скрин'}
          </button>
          <p className="tiny muted">Картинка сжимается до 1280 px прямо на телефоне. Видят только участники пати.</p>
        </>
      )}
    </section>
  )
}
