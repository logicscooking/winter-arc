import { useMemo, useState } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import {
  ARC_START,
  MONEY_NOTE_MAX,
  MONEY_SOURCE_MAX,
  addDays,
  childrenOf,
  formatDayShort,
  formatRub,
  gameDayOf,
  incomesOf,
  moneyBoard,
  moneyShareOn,
  moneyTotals,
  moneyXpDelta,
  parseAmount,
  safeMoney,
} from '../engine'
import type { AppData, Income, MoneyPeriod } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset, reward, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import type { Member } from '../cloud/state'
import { Field, Help, Sheet } from './ui'
import { HeroAva } from './HeroAva'
import { Px } from '../pixel/Pixel'
import './money.css'

const QUICK = [500, 1000, 5000, 10000]

/** «12500» → «12 500» while typing; parseAmount strips the spaces back */
const groupDigits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export function incomeLabel(data: Pick<AppData, 'tasks'>, x: Income): string {
  if (x.projectId) return data.tasks.find((t) => t.id === x.projectId)?.title ?? 'Проект'
  return x.source || 'Без источника'
}

// ---------- «+ Заработал» ----------

export function MoneySheet({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s.data)
  const addIncome = useStore((s) => s.addIncome)
  const say = useUi((s) => s.say)
  const today = gameDayOf(useNow())
  const projects = childrenOf(data.tasks, null, 'deal')
  const [raw, setRaw] = useState('')
  const [projectId, setProjectId] = useState<string | undefined>()
  const [own, setOwn] = useState(false)
  const [source, setSource] = useState('')
  const [day, setDay] = useState(today)
  const [note, setNote] = useState('')
  const amount = parseAmount(raw)
  const xp = amount ? moneyXpDelta(data, day, amount) : 0
  const dayHas = incomesOf(data).some((x) => x.day === day)
  const bad = raw.trim() !== '' && !amount

  const save = (el: Element) => {
    if (!amount) return
    const id = addIncome({ amount, day, ...(projectId ? { projectId } : own && source.trim() ? { source: source.trim() } : {}), note }, nowWithOffset())
    if (!id) {
      say('Не получилось: проверь сумму и дату')
      return
    }
    if (xp > 0) reward(el, { xp })
    say(`Записано: ${formatRub(amount)}`)
    onClose()
  }

  const dayChips: { id: string; label: string }[] = [
    { id: today, label: 'Сегодня' },
    { id: addDays(today, -1), label: 'Вчера' },
    { id: addDays(today, -2), label: 'Позавчера' },
  ]

  return (
    <Sheet title="Заработал" onClose={onClose}>
      <form
        className="stack-lg money-form"
        onSubmit={(e) => {
          e.preventDefault()
          save(e.currentTarget.querySelector('button[type=submit]') ?? e.currentTarget)
        }}
      >
        <label className={`money-amount ${bad ? 'bad' : ''}`}>
          <input
            aria-label="Сумма в рублях"
            className="num"
            inputMode="numeric"
            autoComplete="off"
            value={raw}
            onChange={(e) => setRaw(groupDigits(e.target.value))}
            placeholder="0"
            autoFocus
            aria-invalid={bad}
          />
          <b aria-hidden>₽</b>
        </label>
        <div className="chips" role="group" aria-label="Быстрая сумма">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip" aria-pressed={amount === q} onClick={() => setRaw(groupDigits(String(q)))}>
              {formatRub(q)}
            </button>
          ))}
        </div>
        {bad && <p className="err">Целое число рублей, от 1 до 10 млн.</p>}

        <div className="field">
          <span>Откуда</span>
          <div className="chips" role="group" aria-label="Источник">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={projectId === p.id}
                onClick={() => {
                  setProjectId(projectId === p.id ? undefined : p.id)
                  setOwn(false)
                }}
              >
                {p.title.slice(0, 28)}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              aria-pressed={own}
              onClick={() => {
                setOwn(!own)
                setProjectId(undefined)
              }}
            >
              Своё
            </button>
          </div>
          {own && <input className="input" value={source} maxLength={MONEY_SOURCE_MAX} onChange={(e) => setSource(e.target.value)} placeholder="Заказ, клиент, подработка" autoFocus />}
          {!projects.length && <span className="tiny muted">Можно без источника.</span>}
        </div>

        <div className="field">
          <span>Когда</span>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="chips" role="group" aria-label="День">
              {dayChips.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={day === c.id} onClick={() => setDay(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <input className="input money-date" type="date" value={day} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDay(e.target.value)} aria-label="Дата" />
          </div>
        </div>

        <Field label="Заметка — видишь только ты">
          <input className="input" value={note} maxLength={MONEY_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="За что, что сработало" />
        </Field>

        <button className="btn amber block" type="submit" disabled={!amount}>
          <Px name="coin" size={20} /> {amount ? `Записать ${formatRub(amount)}` : 'Записать'}
          {xp > 0 && <span className="money-xp num">+{xp} XP</span>}
        </button>
        <p className="tiny muted center">
          {amount && xp === 0 && dayHas ? 'XP за этот день уже есть.' : 'XP — раз в день, по сумме дня.'}{' '}
          <Help title="XP за заработок" text={['XP в «Дело» — раз в день, по порядку суммы дня: 100 ₽ — 5 XP, 1 000 ₽ — 10, 10 000 ₽ — 15, от 100 000 ₽ — 20.', 'Записи за день складываются. XP добавится, только когда сумма дня перейдёт на новый порядок. Фармить незачем.']} />
        </p>
      </form>
    </Sheet>
  )
}

// ---------- opt-in ----------

export function MoneyShareRow() {
  const on = useStore((s) => moneyShareOn(s.data))
  const setSettings = useStore((s) => s.setSettings)
  return (
    <div className="switch-row">
      <span>
        <span style={{ fontWeight: 700 }}>Показывать заработок в пати</span>
        <span className="tiny muted" style={{ display: 'block' }}>
          Только суммы, без записей и заметок
        </span>
      </span>
      <button className="switch" role="switch" aria-checked={on} aria-label="Показывать заработок в пати" onClick={() => setSettings({ moneyShare: !on })} />
    </div>
  )
}

// ---------- Пати → Деньги: totals and entries ----------

export function MoneyCard() {
  const data = useStore((s) => s.data)
  const del = useStore((s) => s.deleteIncome)
  const confirm = useUi((s) => s.confirm)
  const today = gameDayOf(useNow())
  const [add, setAdd] = useState(false)
  const [all, setAll] = useState(false)
  const t = moneyTotals(data, today)
  const list = useMemo(() => [...incomesOf(data)].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.at - a.at)), [data])
  const shown = all ? list : list.slice(0, 4)
  return (
    <section>
      <div className="section-title">
        <h2>Мой заработок</h2>
      </div>
      <div className="panel money-card stack">
        <div className="money-totals">
          <div>
            <span className="tiny muted">Неделя</span>
            <b className="num">{formatRub(t.week)}</b>
          </div>
          <div>
            <span className="tiny muted">{today < ARC_START ? 'Арка · разминка' : 'Арка'}</span>
            <b className="num">{formatRub(t.arc)}</b>
          </div>
        </div>
        <button className="btn amber block" onClick={() => setAdd(true)}>
          <Plus size={18} strokeWidth={3} /> Заработал
        </button>
        {list.length === 0 ? (
          <p className="small muted">Первые 500 ₽ тоже считаются.</p>
        ) : (
          <ul className="money-list">
            {shown.map((x) => (
              <li key={x.id} className="money-row">
                <span className="money-row-main">
                  <b className="num">{formatRub(x.amount)}</b>
                  <span className="tiny muted">
                    {incomeLabel(data, x)} · {x.day === today ? 'сегодня' : formatDayShort(x.day)}
                  </span>
                  {x.note && (
                    <span className="tiny money-note">
                      <Lock size={11} aria-label="приватно" /> {x.note}
                    </span>
                  )}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Удалить ${formatRub(x.amount)}`}
                  onClick={async () => {
                    if (await confirm({ title: `Удалить ${formatRub(x.amount)}?`, body: 'Запись уйдёт и с другого устройства. XP за день пересчитается.', ok: 'Удалить', danger: true })) del(x.id)
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > 4 && (
          <button className="link-btn" onClick={() => setAll(!all)}>
            {all ? 'Свернуть' : `Все записи · ${list.length}`}
          </button>
        )}
        <MoneyShareRow />
      </div>
      {add && <MoneySheet onClose={() => setAdd(false)} />}
    </section>
  )
}

// ---------- Пати: leaderboard ----------

const MEDAL = ['🥇', '🥈', '🥉']

export function MoneyBoard({ members, meId }: { members: Member[]; meId: string }) {
  const data = useStore((s) => s.data)
  const setSettings = useStore((s) => s.setSettings)
  const today = gameDayOf(useNow())
  const [period, setPeriod] = useState<MoneyPeriod>('week')
  const on = moneyShareOn(data)
  const mine = moneyTotals(data, today)
  const entries = members.map((m) =>
    m.id === meId
      ? { id: m.id, name: m.display_name, me: true, money: on ? { week: mine.week, arc: mine.arc } : null }
      : { id: m.id, name: m.display_name, money: safeMoney(m.stats?.money, today) },
  )
  if (!entries.some((e) => e.me)) entries.unshift({ id: meId, name: 'Ты', me: true, money: on ? { week: mine.week, arc: mine.arc } : null })
  const rows = moneyBoard(entries, period)
  const quiet = rows.filter((r) => !r.money && !r.me).length
  return (
    <section className="panel stack money-board" aria-label="Заработано">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <Px name="coin" size={26} />
          <h3>Лидерборд</h3>
        </span>
        <div className="seg-switch" role="group" aria-label="Период">
          <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
            Неделя
          </button>
          <button aria-pressed={period === 'arc'} onClick={() => setPeriod('arc')}>
            Арка
          </button>
        </div>
      </div>
      <ol className="board">
        {rows
          .filter((r) => r.money || r.me)
          .map((r) => (
            <li key={r.id} className={`board-row ${r.me ? 'me' : ''} ${r.place && r.place <= 3 ? `p${r.place}` : ''} ${r.money ? '' : 'hidden'}`}>
              <span className="board-place num" aria-label={r.place ? `${r.place} место` : 'без места'}>
                {r.place ? (r.place <= 3 ? MEDAL[r.place - 1] : r.place) : '—'}
              </span>
              <HeroAva userId={r.id} size={38} />
              <span className="board-name grow">
                {r.name}
                {r.me && <span className="tag">ты</span>}
              </span>
              {r.money ? (
                <b className="board-sum num">{formatRub(r.value ?? 0)}</b>
              ) : (
                <>
                  <span className="board-hidden-tag tiny muted">
                    <Lock size={12} aria-hidden /> скрыто
                  </span>
                  <button className="btn sm board-show" onClick={() => setSettings({ moneyShare: true })}>
                    Показать друзьям
                  </button>
                </>
              )}
            </li>
          ))}
      </ol>
      <p className="tiny muted">
        {period === 'week' ? 'С понедельника' : 'Вся арка с разминкой'}
        {quiet > 0 ? ` · ещё ${quiet} скрывают` : ''} · друзья видят только сумму
      </p>
    </section>
  )
}
