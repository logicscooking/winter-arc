import { useMemo, useState } from 'react'
import { Snowflake } from 'lucide-react'
import { ARC_START, computeState, formatDayRu, gameDayOf, isCompleted, marksFor, planFor, reelsLimitFor, uid, weekOf } from '../engine'
import type { AppData, Confession, DayKey, GameState, MarkStatus, SugarAnswer } from '../engine'
import { useStore } from '../store/store'
import { haptic, nowWithOffset, useFx } from '../store/hooks'
import { useUi } from '../store/ui'
import { Chips, Field, Sheet } from '../components/ui'
import { TimePicker } from '../components/TimePicker'

type Draft = Omit<Confession, 'at'>

/** Apply the confession to a copy of the data, so the sheet can preview the exact day result */
function applyDraft(data: AppData, day: DayKey, c: Draft, res: Record<string, MarkStatus>, freeze: boolean, at: number): AppData {
  const d = structuredClone(data)
  const log = (d.days[day] ??= { quests: {} })
  log.confession = { ...c, at }
  log.freeze = freeze || undefined
  for (const [id, s] of Object.entries(res)) if (!log.quests[id]) log.quests[id] = { status: s, at }
  if (c.sugar === 'outside') d.slips.push({ id: uid(), at, day, what: 'chocolate', why: 'other', retro: true })
  return d
}

function Summary({ before, after, day, onClose }: { before: GameState; after: GameState; day: DayKey; onClose: () => void }) {
  const r = after.days[day]
  const w = weekOf(day)
  const warmup = day < ARC_START
  const dmg = after.bosses[w]?.damage ?? 0
  const rows: [string, string, string][] = [
    ['XP за день', `+${r?.xp ?? 0}`, 'var(--gold)'],
    warmup ? ['HP', 'в разминке не тратится', 'var(--mist)'] : ['HP', `${after.hp - before.hp >= 0 ? '+' : ''}${after.hp - before.hp} → ${after.hp}`, after.hp >= before.hp ? 'var(--pine)' : 'var(--hp)'],
    ['Осколки', `${after.shards - before.shards >= 0 ? '+' : ''}${after.shards - before.shards} ❄`, 'var(--frost)'],
    ...(warmup ? [] : [['Урон боссу за неделю', `${dmg} / ${after.bosses[w]?.hp ?? 0}`, 'var(--ink)'] as [string, string, string]]),
  ]
  return (
    <div className="stack-lg">
      <div className="big-title">{r?.perfect ? 'Идеальный день' : r?.frozen ? 'День заморожен' : 'День закрыт'}</div>
      <div className="kv">
        {rows.map(([k, v, c]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span className="muted">{k}</span>
            <span className="num" style={{ color: c, textAlign: 'right' }}>
              {v}
            </span>
          </div>
        ))}
      </div>
      {after.fallen && !before.fallen && <p style={{ color: 'var(--hp)' }}>HP на нуле. Падение: 3 идеальных дня подряд вернут 50 HP.</p>}
      {!warmup && after.bosses[w]?.done && <p>{after.bosses[w].won ? `Босс «${after.bosses[w].name}» повержен: +15 ❄ и трофей.` : `Босс «${after.bosses[w].name}» выстоял. Новая неделя — новый бой.`}</p>}
      <button className="btn primary block" onClick={onClose}>
        Спокойной ночи
      </button>
    </div>
  )
}

export function ConfessionSheet({ day }: { day: DayKey }) {
  const close = useUi((s) => s.close)
  const data = useStore((s) => s.data)
  const save = useStore((s) => s.saveConfession)
  const plan = planFor(data, day)
  const marks = marksFor(data, day, plan)
  const enteredMin = data.pauses.filter((p) => p.day === day && p.result === 'entered').reduce((s, p) => s + (p.minutes ?? 0), 0)
  const boughtSugar = data.purchases.some((p) => p.day === day && (p.kind === 'chocolate' || p.kind === 'cola'))
  const limit = reelsLimitFor(data, day)
  const [draft, setDraft] = useState<Draft>({
    reelsMin: enteredMin,
    sugar: boughtSugar ? 'slot' : 'none',
    colaAfter14: false,
    bedtime: '23:00',
    main: '',
  })
  const [res, setRes] = useState<Record<string, MarkStatus>>({})
  const [freeze, setFreeze] = useState(false)
  const [done, setDone] = useState<{ before: GameState; after: GameState }>()
  const celebrate = useFx((s) => s.celebrate)
  const warmup = day < ARC_START
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const autoByConfession = new Set(['reels', 'bedtime', 'journal'])
  const open = plan.filter((p) => {
    const q = data.quests.find((x) => x.id === p.id)
    if (!q || autoByConfession.has(q.kind)) return false
    if (q.kind === 'caffeine' && draft.colaAfter14) return false
    return !isCompleted(marks[p.id].status)
  })

  const now = nowWithOffset()
  const before = useMemo(() => computeState(data, now), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => computeState(applyDraft(data, day, draft, res, freeze, now.getTime()), now), [data, day, draft, res, freeze]) // eslint-disable-line react-hooks/exhaustive-deps
  const pr = preview.days[day]
  const missedAfter = pr?.missedMain.length ?? 0
  const freezesAvail = before.freezes

  if (done) {
    return (
      <Sheet title={`Итог: ${formatDayRu(day)}`} onClose={close}>
        <Summary before={done.before} after={done.after} day={day} onClose={close} />
      </Sheet>
    )
  }

  const submit = () => {
    const at = nowWithOffset()
    const b = computeState(data, at)
    save(day, draft, res, freeze && missedAfter > 0, at)
    const after = computeState(useStore.getState().data, at)
    haptic([15, 40, 15])
    setDone({ before: b, after })
    const w = weekOf(day)
    if (!warmup && after.bosses[w]?.won && after.bosses[w]?.done && !b.bosses[w]?.done) celebrate({ kind: 'boss', title: `${after.bosses[w].name} повержен`, text: 'Трофей недели и +15 ❄ твои.' })
    else if (after.days[day]?.perfect) celebrate({ kind: 'perfect', title: 'Идеальный день', text: warmup ? 'Разминка закрыта на все главные.' : '+5 HP за все главные квесты.' })
  }

  const isLate = day !== gameDayOf(now)
  return (
    <Sheet title={isLate ? `Исповедь за ${formatDayRu(day)}` : 'Вечерняя исповедь'} onClose={close}>
      <div className="stack-lg">
        <div className="grid-2">
          <Field label={`Рилсы, мин (лимит ${limit})`}>
            <input className="input num" type="number" inputMode="numeric" min={0} max={1440} value={draft.reelsMin} onChange={(e) => set('reelsMin', Math.min(1440, Math.max(0, Number(e.target.value) || 0)))} />
          </Field>
          <Field label="Во сколько ляжешь">
            <TimePicker label="Во сколько ляжешь" value={draft.bedtime} onChange={(v) => v && set('bedtime', v)} />
          </Field>
        </div>
        <Chips<SugarAnswer>
          label="Сахар"
          options={[
            { id: 'none', label: 'Не было' },
            { id: 'slot', label: 'Только в слоте' },
            { id: 'outside', label: 'Вне слота' },
          ]}
          value={draft.sugar}
          onChange={(v) => set('sugar', v)}
        />
        {draft.sugar === 'outside' && <p className="small" style={{ color: 'var(--hp)', marginTop: -12 }}>{warmup ? 'Запишется как «Слился» — в разминке без урона.' : 'Засчитается как «Слился» задним числом: −10 HP.'}</p>}
        <Chips
          label="Кола после 14:00"
          options={[
            { id: 'no', label: 'Нет' },
            { id: 'yes', label: 'Да' },
          ]}
          value={draft.colaAfter14 ? 'yes' : 'no'}
          onChange={(v) => set('colaAfter14', v === 'yes')}
        />
        <Field label="Что сегодня было главным">
          <input className="input" value={draft.main} onChange={(e) => set('main', e.target.value)} placeholder="Одна строка" maxLength={140} />
        </Field>

        {open.length > 0 && (
          <section className="stack">
            <h3>Что не отмечено</h3>
            {open.map((p) => {
              const q = data.quests.find((x) => x.id === p.id)!
              return (
                <div key={p.id} className="stack" style={{ gap: 6 }}>
                  <div className="row between">
                    <span style={{ fontWeight: 700 }}>{q.title}</span>
                    {p.role === 'main' && <span className="tag ember">главный</span>}
                  </div>
                  <div className="chips">
                    {(
                      [
                        ['done', 'Сделал'],
                        ['mini', `Мини: ${q.mini}`],
                        ['skip', 'Пропуск'],
                      ] as [MarkStatus, string][]
                    ).map(([s, l]) => (
                      <button key={s} className="chip" aria-pressed={(res[p.id] ?? 'skip') === s} onClick={() => setRes((r) => ({ ...r, [p.id]: s }))}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {missedAfter > 0 && !warmup && (
          <button
            className="panel row"
            style={{ textAlign: 'left', borderColor: freeze ? 'var(--pine)' : undefined, opacity: freezesAvail ? 1 : 0.5 }}
            disabled={!freezesAvail}
            onClick={() => setFreeze(!freeze)}
            aria-pressed={freeze}
          >
            <Snowflake color="var(--frost)" aria-hidden />
            <div className="grow">
              <h3>Потратить заморозку?</h3>
              <p className="small muted">{freezesAvail ? `Защитит серии и HP за этот день. В запасе: ${freezesAvail}.` : 'Заморозок нет. Их дают за 7 идеальных дней подряд.'}</p>
            </div>
          </button>
        )}

        <div className="panel tight">
          <div className="kv small">
            <span className="muted">Итог дня</span>
            <span className="num" style={{ textAlign: 'right' }}>
              <span className="xp-v">+{pr?.xp ?? 0} XP</span>{' '}
              {!warmup && (
                <span style={{ color: preview.hp >= before.hp ? 'var(--pine)' : 'var(--hp)' }}>
                  {preview.hp - before.hp >= 0 ? '+' : ''}
                  {preview.hp - before.hp} HP
                </span>
              )}{' '}
              <span className="ice-v">
                {preview.shards - before.shards >= 0 ? '+' : ''}
                {preview.shards - before.shards} ❄
              </span>
            </span>
          </div>
        </div>
        <button className="btn primary block" onClick={submit}>
          Закрыть день
        </button>
      </div>
    </Sheet>
  )
}
