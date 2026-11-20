import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PublicStats } from '../engine'

export interface Party {
  id: string
  name: string
  code: string
  owner: string | null
  created_at: string
}

export interface Member {
  id: string
  nick: string
  display_name: string
  avatar: string
  joined_at: string
  stats?: PublicStats
  stats_at?: string
}

export interface FeedEvent {
  id: number
  user_id: string
  party_id: string
  kind: string
  key: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Reaction {
  event_id: number
  user_id: string
  emoji: string
}

export interface Nudge {
  id: number
  from_user: string
  to_user: string
  party_id: string | null
  kind: string
  created_at: string
  seen_at: string | null
  /** filled locally for display */
  from_name?: string
  from_avatar?: string
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'offline' | 'error'

export interface Account {
  id: string
  nick: string
  display_name: string
  avatar: string
}

interface Social {
  account?: Account
  parties: Party[]
  activeParty?: string
  members: Record<string, Member[]>
  feed: Record<string, FeedEvent[]>
  reactions: Record<number, Reaction[]>
  /** unseen nudges sent to me */
  nudges: Nudge[]
  /** my outgoing nudges: user id → ms of the last one (for the 60-min cooldown hint) */
  sentNudges: Record<string, number>
  /** feed posting window: only things after this moment are announced */
  since?: number
  levelAtSince?: number
  /** dedupe keys already posted, per party */
  posted: Record<string, string[]>
  sync: { status: SyncStatus; at?: number; error?: string }
  /** the server tables are missing (schema.sql not applied yet) */
  schemaMissing?: boolean
  loading?: boolean
}

export const SOCIAL_KEY = 'winter-arc-social-v1'

const initial = (): Social => ({
  // explicit undefined: zustand merges, so missing keys would survive a reset
  account: undefined,
  activeParty: undefined,
  since: undefined,
  levelAtSince: undefined,
  schemaMissing: undefined,
  loading: undefined,
  parties: [],
  members: {},
  feed: {},
  reactions: {},
  nudges: [],
  sentNudges: {},
  posted: {},
  sync: { status: 'off' },
})

export const useSocial = create<Social & { reset: () => void }>()(
  persist(
    (set) => ({
      ...initial(),
      reset: () => set(initial()),
    }),
    {
      name: SOCIAL_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // cached for offline display; status flags are runtime-only
      partialize: (s) => ({
        account: s.account,
        parties: s.parties,
        activeParty: s.activeParty,
        members: s.members,
        feed: Object.fromEntries(Object.entries(s.feed).map(([k, v]) => [k, v.slice(0, 60)])),
        reactions: s.reactions,
        sentNudges: s.sentNudges,
        since: s.since,
        levelAtSince: s.levelAtSince,
        posted: s.posted,
      }),
    },
  ),
)

export const activePartyOf = (s: Pick<Social, 'parties' | 'activeParty'>): Party | undefined =>
  s.parties.find((p) => p.id === s.activeParty) ?? s.parties[0]
