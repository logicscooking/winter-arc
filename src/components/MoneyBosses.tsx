/**
 * v0.17 «Боссы месяца»: the ladder of five money bosses of the current game month.
 * On «Сегодня» (top of «Деньги», with «+ Заработал»), on «Герой» (with the month history)
 * and in «Пати → Деньги». Shown even before the first income: it is the main goal of the app.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MAIN_MONEY_BOSS, formatRub, formatUsd, gameDayOf, incomesOf, moneyLadder, moneyMonths, monthTitle, plural, replayStartOf } from '../engine'
import type { MoneyMonth } from '../engine'
import { useStore } from '../store/store'
import { useNow } from '../store/hooks'
import { MoneyBossSprite, Px } from '../pixel/Pixel'
import { MoneySheet } from './Money'
import { Help } from './ui'

const usdUp = (n: number) => formatUsd(Math.ceil(n))

export function MoneyBossesCard({ add, history }: { add?: boolean; history?: boolean }) {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const [sheet, setSheet] = useState(false)
  const L = moneyLadder(data, today)
  const empty = !incomesOf(data).some((x) => x.day.slice(0, 7) === L.month && x.day <= today)
  const t = L.target
  const pct = Math.round(L.progress * 100)
  return (
    <section className={`panel stack mboss-card${t ? '' : ' cleared'}`} aria-label="Боссы месяца">
      <div className="row between" style={{ gap: 8 }}>
        <h3 className="row" style={{ gap: 8 }}>
          <Px name="coin" size={22} /> Боссы месяца
        </h3>
        <span className="tiny muted">
          {monthTitle(L.month)} · {L.killed}/5{' '}
          <Help
            title="Боссы месяца"
            text={[
              'Каждый месяц пять боссов. HP — в долларах, урон — всё, что ты заработал в этом месяце (по курсу из «Ещё»).',
              'Убил — XP и WF, и так каждый месяц: 1-го числа боссы воскресают. Первая победа над главным ($10 000) — золотой костюм и титул «Десятка в месяц».',
              'Плюс 1 XP за каждые $10 заработка в «Деньги». Удалил запись — XP и победа пересчитаются.',
            ]}
          />
        </span>
      </div>

      {t ? (
        <div className="mboss-target">
          <span className="mboss-art">
            <MoneyBossSprite id={t.id} size={76} title={t.name} />
          </span>
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <span className="tiny muted">{t.main ? 'Главный босс месяца' : `Босс ${L.steps.findIndex((s) => s.boss === t) + 1} из 5`}</span>
            <b className="mboss-name">{t.name}</b>
            <div className="mboss-hp" role="progressbar" aria-label={`${t.name}: урон ${formatUsd(L.usd)} из ${formatUsd(t.usd)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i style={{ width: `${Math.max(L.usd > 0 ? 3 : 0, pct)}%` }} />
            </div>
            <span className="num mboss-dmg">
              <b>{formatUsd(L.usd)}</b> / {formatUsd(t.usd)} HP
            </span>
            <span className="tiny muted">
              осталось <b className="num">{usdUp(t.usd - L.usd)}</b> · награда +{t.xp} XP, +{t.shards} WF
            </span>
          </div>
        </div>
      ) : (
        <div className="mboss-target">
          <span className="mboss-art dead">
            <MoneyBossSprite id={MAIN_MONEY_BOSS.id} size={76} title={MAIN_MONEY_BOSS.name} />
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <b className="mboss-name gold">Все пятеро повержены</b>
            <span className="small">
              {formatUsd(L.usd)} за {monthTitle(L.month)}. Новые боссы — 1-го числа.
            </span>
          </div>
        </div>
      )}

      <ol className="mboss-ladder">
        {L.steps.map(({ boss, state }) => (
          <li key={boss.id} className={`mboss-step ${state}${boss.main ? ' main' : ''}`}>
            <MoneyBossSprite id={boss.id} size={30} />
            <span className="mboss-step-name">{boss.name}</span>
            <span className="num mboss-step-hp">{state === 'dead' ? '✓' : formatUsd(boss.usd)}</span>
          </li>
        ))}
      </ol>

      <div className={`mboss-goal${L.main.dead ? ' done' : ''}`}>
        <MoneyBossSprite id={MAIN_MONEY_BOSS.id} size={34} />
        <span className="grow">
          <span className="tiny mboss-goal-k">Главный босс месяца · {formatUsd(MAIN_MONEY_BOSS.usd)}</span>
          {L.main.dead ? (
            <b className="small">Убит в этом месяце. Ты в десятке.</b>
          ) : (
            <b className="small num">
              осталось {usdUp(L.main.left)} · {L.main.daysLeft} {plural(L.main.daysLeft, 'день', 'дня', 'дней')} до конца месяца
            </b>
          )}
          {!L.main.dead && <span className="tiny muted num">темп: {usdUp(L.main.perDay)} в день ≈ {formatRub(Math.ceil(L.main.perDay) * L.rate)}</span>}
        </span>
      </div>

      {empty && <p className="tiny muted">Запиши первый доход — каждый рубль бьёт босса. Курс: {L.rate} ₽ за $1.</p>}
      {add && (
        <button className="btn amber block" onClick={() => setSheet(true)}>
          <Plus size={18} strokeWidth={3} /> Заработал
        </button>
      )}
      {history && <MoneyHistory />}
      {sheet && <MoneySheet onClose={() => setSheet(false)} />}
    </section>
  )
}

function MoneyHistory() {
  const data = useStore((s) => s.data)
  const today = gameDayOf(useNow())
  const months: MoneyMonth[] = moneyMonths(data, replayStartOf(data), today)
  if (!months.length) return null
  return (
    <div className="mboss-history" aria-label="История месяцев">
      <span className="tiny muted">По месяцам</span>
      <div className="mboss-months">
        {months.map((m) => (
          <span key={m.month} className={`mboss-month${m.main ? ' main' : ''}${m.live ? ' live' : ''}`} title={`${monthTitle(m.month)}: ${formatUsd(m.usd)}`}>
            <b>{monthTitle(m.month).slice(0, 3)}</b>
            <span className="num">{m.killed}/5</span>
            <small>{m.main ? 'главный ✓' : m.live ? 'идёт' : 'главный выжил'}</small>
          </span>
        ))}
      </div>
    </div>
  )
}
