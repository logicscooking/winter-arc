/**
 * «Покоритель зимы»: the arc's big finish. When 28 Feb closes, a hero who closed at least `need` of the
 * 98 arc days (closed = «идеальный день», the same rule as streak.ts dayStreak) gets the title, the
 * legendary «Венок весны», +300 XP and +50 ❄. The replay (replay.ts) pays it on the last arc day.
 */
export const CONQUEROR = { need: 70, xp: 300, shards: 50, title: 'Покоритель зимы' } as const

export interface ConquerorState {
  /** perfect arc days so far */
  closed: number
  need: number
  /** the arc ended with closed ≥ need */
  won: boolean
}
