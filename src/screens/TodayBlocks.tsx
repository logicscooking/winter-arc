import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { blockAt, formatHM, gameDayOf, planBlocksOf, wakeTargetFor } from '../engine'
import type { GameState } from '../engine'
import { useStore } from '../store/store'
import { go, useNow } from '../store/hooks'
import { Px } from '../pixel/Pixel'
import { QuestRow } from '../components/QuestRow'
import { Help } from '../components/ui'
import { BLOCK_COLOR_VAR, ItemRow, PickBlockSheet, TransitionRow, blockIcon, fmtDur, useCheck } from './PlanDay'
import { todaySections, type DayProgress } from './todayItems'
import type { PlanItem } from './planItems'
import './plan.css'

const R = 38
const CIRC = 2 * Math.PI * R

/** Day progress: one ring for everything on «Сегодня» (rows + переходы), a 3-line legend */
export function DayRingCard({ progress }: { progress: DayProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const full = progress.total > 0 && progress.done === progress.total
  const lines: [string, [number, number], string][] = [
    ['Квесты', progress.quests, 'var(--pine)'],
    ['Дела', progress.tasks, 'var(--st-deal)'],
  ]
  if (progress.transitions[1]) lines.push(['Переходы', progress.transitions, 'var(--st-body)'])
  return (
    <section className="td-ring" aria-label={`Прогресс дня: ${pct}%`}>
      <div className={`td-ring-dial${full ? ' full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Прогресс дня">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle className="track" cx="50" cy="50" r={R} />
          <circle className="fill" cx="50" cy="50" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} />
        </svg>
        <b className="num">
          <span>
            {pct}
            <small>%</small>
          </span>
        </b>
      </div>
      <div className="td-ring-text">
        <b>
          {full ? 'День закрыт полностью' : `Сделано ${progress.done} из ${progress.total}`}
          <Help title="Прогресс дня" text={['Кольцо — всё, что в списке дня: квесты, дела и переходы перед блоками.', 'Мини-версия считается сделанной. Пропущенный квест выпадает из общего числа.']} />
        </b>
        <ul className="td-legend">
          {lines.map(([name, [d, t], c]) => (
            <li key={name}>
              <i style={{ background: c }} />
              {name}
              <span className="num">
                {d}/{t}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** «Сегодня»: the day's list grouped by plan blocks (or Утро · День · Вечер), the ring on top */
export function TodayBlocks({ game, locked }: { game: GameState; locked: boolean }) {
  const data = useStore((s) => s.data)
  const assignPlan = useStore((s) => s.assignPlan)
  const now = useNow()
  const today = gameDayOf(now)
  const { sections } = useMemo(() => todaySections(data, today), [data, today])
  const blocks = planBlocksOf(data.days[today])
  const current = blockAt(blocks, now.getHours() * 60 + now.getMinutes())
  const wt = wakeTargetFor(data, today)
  const [pickFor, setPickFor] = useState<PlanItem | null>(null)
  const check = useCheck(today, !locked, () => go('/plan'))

  const row = (it: PlanItem) => {
    if (it.kind === 'quest' && it.quest && it.plan && it.action !== 'open')
      return (
        <div id={`q-${it.id}`} key={it.key}>
          <QuestRow compact plan={it.plan} quest={it.quest} status={it.status} auto={!!it.auto} day={today} game={game} locked={locked} wakeTarget={wt} />
        </div>
      )
    return <ItemRow key={it.key} it={it} onCheck={check} onTap={() => setPickFor(it)} canCheck={!locked} badge />
  }

  return (
    <section className="stack" aria-label="Дела дня по блокам">
      <div className="section-title">
        <h2>
          <Px name="quests" size={24} /> {blocks.length ? 'По блокам' : 'Квесты и дела'}
          <Help
            title="Как отмечать"
            text={['Квадрат слева — выполнено. Тап по квесту — мини-версия или пропуск, по делу — в какой блок.', 'Ошибся — внизу появится «Отменить».', 'Пропустил главный — минус HP при закрытии дня.']}
          />
        </h2>
        <a className="small link-btn" href="#/plan">
          {blocks.length ? 'Блоки' : 'Разбить на блоки'}
        </a>
      </div>
      <div className="td-sections">
        {sections.map((s) => {
          const done = s.items.filter((it) => it.done).length
          const total = s.items.filter((it) => it.status !== 'skip').length
          const b = s.block
          return (
            <div key={s.id} className="stack" style={{ gap: 6 }}>
              {b && <TransitionRow day={today} block={b} isToday />}
              <article className={`td-sec${b ? ' block' : ''}${b && current?.id === b.id ? ' now' : ''}`} style={b ? ({ '--bc': BLOCK_COLOR_VAR[b.color ?? 'deal'] } as CSSProperties) : undefined}>
                <header className="td-sec-head">
                  <Px name={b ? blockIcon(b) : s.icon ?? 'star'} size={26} />
                  <span className="grow">
                    <b>{s.title}</b>
                    {!b && blocks.length > 0 && <small>вне блоков</small>}
                    {b && (
                      <small className="num">
                        {formatHM(b.start)}–{formatHM((b.start + b.dur) % 1440)} · {fmtDur(b.dur)}
                        {current?.id === b.id ? ' · сейчас' : ''}
                      </small>
                    )}
                  </span>
                  {total > 0 && <span className={`td-count${done >= total ? ' full' : ''}`}>{done}/{total}</span>}
                </header>
                {s.items.length > 0 ? (
                  <div className="td-sec-items">{s.items.map(row)}</div>
                ) : (
                  <button className="td-sec-empty link-btn" onClick={() => go('/plan')}>
                    Пусто — добавь дела в плане <ChevronRight size={14} aria-hidden />
                  </button>
                )}
              </article>
            </div>
          )
        })}
      </div>
      {pickFor && (
        <PickBlockSheet
          item={pickFor}
          blocks={blocks}
          current={data.days[today]?.assign?.[pickFor.key]}
          onPick={(id) => {
            assignPlan(today, pickFor.key, id)
            setPickFor(null)
          }}
          onNew={() => {
            setPickFor(null)
            go('/plan')
          }}
          onClose={() => setPickFor(null)}
        />
      )}
    </section>
  )
}
