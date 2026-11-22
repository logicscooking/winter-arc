import type { GameState } from './replay'
import { addDays, parseDay, weekday } from './time'
import type { DayKey } from './types'

/**
 * «Серия»: closed days in a row. A day is closed when every main quest is done or mini (the same
 * «идеальный день» the replay uses). A frozen day keeps the run without adding to it; today never
 * breaks it while it is still open.
 */
export function dayStreak(game: Pick<GameState, 'days'>, today: DayKey): { run: number; best: number; todayDone: boolean } {
  let run = 0
  let best = 0
  for (const d of Object.keys(game.days).sort()) {
    if (d > today) break
    const r = game.days[d]
    if (r.perfect) best = Math.max(best, ++run)
    else if (d !== today && !r.frozen) run = 0
  }
  return { run, best, todayDone: !!game.days[today]?.perfect }
}

export type MonthCell = 'done' | 'frozen' | 'miss' | 'open' | 'future' | 'none'

const RU_MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

/** The calendar month of `today`: one cell per day (Monday-first `lead` blanks before the 1st) */
export function monthClosed(game: Pick<GameState, 'days'>, today: DayKey): { title: string; closed: number; past: number; lead: number; cells: { day: DayKey; state: MonthCell }[] } {
  const { y, m } = parseDay(today)
  const first = `${y}-${String(m).padStart(2, '0')}-01` as DayKey
  const cells: { day: DayKey; state: MonthCell }[] = []
  let closed = 0
  let past = 0
  for (let d = first; parseDay(d).m === m; d = addDays(d, 1)) {
    const r = game.days[d]
    let state: MonthCell
    if (d > today) state = 'future'
    else if (r?.perfect) state = 'done'
    else if (r?.frozen) state = 'frozen'
    else if (d === today) state = 'open'
    else state = r ? 'miss' : 'none'
    if (state === 'done') closed++
    if (d < today && r) past++
    else if (d === today && state === 'done') past++
    cells.push({ day: d, state })
  }
  return { title: `в ${RU_MONTHS_PREP[m - 1]}`, closed, past, lead: weekday(first), cells }
}
