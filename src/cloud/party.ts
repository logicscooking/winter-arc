/**
 * Party, feed, reactions, nudges, public stats and realtime. All calls go through RPC or RLS-guarded
 * tables (see supabase/schema.sql). Results are cached in the social store for offline display.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { buildPublicStats, computeState, detectFeedEvents, gameDayOf, shareSettings, statsSignature } from '../engine'
import type { FeedDraft, PublicStats } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset } from '../store/hooks'
import { todaySections } from '../screens/todayItems'
import { CloudError, errorCode, getClient } from './client'
import { activePartyOf, useSocial } from './state'
import type { FeedEvent, Member, Nudge, Party, Reaction } from './state'

const FEED_LIMIT = 60

function markSchema(e: unknown) {
  if (errorCode(e) === 'schema_missing') useSocial.setState({ schemaMissing: true })
}

// ---------- parties ----------

export async function refreshParties(): Promise<Party[]> {
  const acc = useSocial.getState().account
  if (!acc) return []
  const sb = await getClient()
  const { data, error } = await sb.from('party_members').select('joined_at, parties(id, name, code, owner, created_at)').eq('user_id', acc.id).order('joined_at')
  if (error) {
    markSchema(error)
    throw error
  }
  useSocial.setState({ schemaMissing: false })
  const parties = (data ?? []).map((r) => (r as unknown as { parties: Party }).parties).filter(Boolean)
  useSocial.setState((s) => {
    const active = parties.some((p) => p.id === s.activeParty) ? s.activeParty : parties[0]?.id
    return { parties, activeParty: active }
  })
  return parties
}

function rpcError(res: unknown): string | undefined {
  if (res && typeof res === 'object' && 'error' in res && typeof (res as { error: unknown }).error === 'string') return (res as { error: string }).error
  return undefined
}

export async function createParty(name: string): Promise<Party> {
  const sb = await getClient()
  const { data, error } = await sb.rpc('create_party', { p_name: name.trim() })
  if (error) throw error
  const party = data as Party
  await afterMembershipChange(party.id)
  return party
}

export async function joinParty(code: string): Promise<{ party: Party; already?: boolean }> {
  const sb = await getClient()
  const { data, error } = await sb.rpc('join_party', { p_code: code })
  if (error) throw error
  const err = rpcError(data)
  if (err) throw new CloudError(err === 'rate_limited' ? 'join_rate_limited' : err)
  const res = data as { party: Party; already?: boolean }
  await afterMembershipChange(res.party.id)
  return res
}

export async function leaveParty(partyId: string) {
  const sb = await getClient()
  const acc = useSocial.getState().account
  // remove my screenshots in this party first (storage can't be cleaned from SQL)
  if (acc) await removeMyChecks(sb, partyId, acc.id).catch(() => undefined)
  const { error } = await sb.rpc('leave_party', { p_party: partyId })
  if (error) throw error
  useSocial.setState((s) => {
    const members = { ...s.members }
    const feed = { ...s.feed }
    delete members[partyId]
    delete feed[partyId]
    return { members, feed, activeParty: s.activeParty === partyId ? undefined : s.activeParty }
  })
  await refreshParties()
  resubscribe()
}

export async function regenerateCode(partyId: string): Promise<string> {
  const sb = await getClient()
  const { data, error } = await sb.rpc('regenerate_party_code', { p_party: partyId })
  if (error) throw error
  useSocial.setState((s) => ({ parties: s.parties.map((p) => (p.id === partyId ? { ...p, code: String(data) } : p)) }))
  return String(data)
}

async function afterMembershipChange(partyId: string) {
  useSocial.setState({ activeParty: partyId })
  await refreshParties()
  await Promise.all([refreshParty(partyId), pushStats(true)])
  resubscribe()
  schedulePosting(500)
}

export function setActiveParty(id: string) {
  useSocial.setState({ activeParty: id })
  void refreshParty(id).catch(() => undefined)
  resubscribe()
}

// ---------- members, feed ----------

export async function refreshParty(partyId?: string) {
  const st = useSocial.getState()
  const id = partyId ?? activePartyOf(st)?.id
  if (!id || !st.account) return
  useSocial.setState({ loading: true })
  try {
    const sb = await getClient()
    const [mem, feed] = await Promise.all([
      sb.from('party_members').select('user_id, joined_at, profiles(id, nick, display_name, avatar)').eq('party_id', id).order('joined_at'),
      sb.from('feed_events').select('*').eq('party_id', id).order('created_at', { ascending: false }).limit(FEED_LIMIT),
    ])
    if (mem.error) throw mem.error
    if (feed.error) throw feed.error
    const members: Member[] = (mem.data ?? []).map((r) => {
      const p = (r as unknown as { profiles: { id: string; nick: string; display_name: string; avatar: string } | null }).profiles
      return { id: r.user_id as string, nick: p?.nick ?? '?', display_name: p?.display_name || p?.nick || 'Игрок', avatar: p?.avatar || '❄️', joined_at: r.joined_at as string }
    })
    const ids = members.map((m) => m.id)
    const events = (feed.data ?? []) as FeedEvent[]
    const [stats, reactions] = await Promise.all([
      ids.length ? sb.from('public_stats').select('user_id, payload, updated_at').in('user_id', ids) : Promise.resolve({ data: [], error: null }),
      events.length ? sb.from('reactions').select('event_id, user_id, emoji').in('event_id', events.map((e) => e.id)) : Promise.resolve({ data: [], error: null }),
    ])
    if (stats.error) throw stats.error
    if (reactions.error) throw reactions.error
    for (const s of stats.data ?? []) {
      const m = members.find((x) => x.id === s.user_id)
      if (m) {
        m.stats = s.payload as PublicStats
        m.stats_at = s.updated_at as string
      }
    }
    const byEvent: Record<number, Reaction[]> = {}
    for (const r of (reactions.data ?? []) as Reaction[]) (byEvent[r.event_id] ??= []).push(r)
    useSocial.setState((s) => ({
      members: { ...s.members, [id]: members },
      feed: { ...s.feed, [id]: events },
      reactions: { ...pruneReactions(s.reactions, s.feed, id), ...byEvent },
      schemaMissing: false,
    }))
  } catch (e) {
    markSchema(e)
    throw e
  } finally {
    useSocial.setState({ loading: false })
  }
}

function pruneReactions(all: Record<number, Reaction[]>, feed: Record<string, FeedEvent[]>, partyId: string) {
  const drop = new Set((feed[partyId] ?? []).map((e) => e.id))
  return Object.fromEntries(Object.entries(all).filter(([k]) => !drop.has(Number(k))))
}

export async function react(eventId: number, emoji: string | null) {
  const acc = useSocial.getState().account
  if (!acc) return
  const prev = useSocial.getState().reactions[eventId] ?? []
  const next = prev.filter((r) => r.user_id !== acc.id)
  if (emoji) next.push({ event_id: eventId, user_id: acc.id, emoji })
  useSocial.setState((s) => ({ reactions: { ...s.reactions, [eventId]: next } }))
  try {
    const sb = await getClient()
    const { error } = emoji
      ? await sb.from('reactions').upsert({ event_id: eventId, user_id: acc.id, emoji }, { onConflict: 'event_id,user_id' })
      : await sb.from('reactions').delete().eq('event_id', eventId).eq('user_id', acc.id)
    if (error) throw error
  } catch (e) {
    useSocial.setState((s) => ({ reactions: { ...s.reactions, [eventId]: prev } }))
    throw e
  }
}

export async function deleteEvent(ev: FeedEvent) {
  const sb = await getClient()
  const { error } = await sb.from('feed_events').delete().eq('id', ev.id)
  if (error) throw error
  if (ev.kind === 'check' && typeof ev.payload.path === 'string') await sb.storage.from('checks').remove([ev.payload.path]).catch(() => undefined)
  useSocial.setState((s) => ({ feed: { ...s.feed, [ev.party_id]: (s.feed[ev.party_id] ?? []).filter((x) => x.id !== ev.id) } }))
}

// ---------- nudges ----------

export async function sendNudge(to: string, kind: string) {
  const sb = await getClient()
  const { data, error } = await sb.rpc('send_nudge', { p_to: to, p_kind: kind })
  if (error) throw error
  const err = rpcError(data)
  if (err === 'rate_limited') {
    const retry = Date.parse(String((data as { retry_at?: string }).retry_at ?? ''))
    if (Number.isFinite(retry)) useSocial.setState((s) => ({ sentNudges: { ...s.sentNudges, [to]: retry - 3600_000 } }))
    throw new CloudError('nudge_rate_limited')
  }
  if (err) throw new CloudError(err)
  useSocial.setState((s) => ({ sentNudges: { ...s.sentNudges, [to]: Date.now() } }))
}

export async function loadNudges() {
  const acc = useSocial.getState().account
  if (!acc) return
  const sb = await getClient()
  const { data, error } = await sb.from('nudges').select('*').eq('to_user', acc.id).is('seen_at', null).order('created_at', { ascending: false }).limit(20)
  if (error) {
    markSchema(error)
    throw error
  }
  useSocial.setState({ nudges: ((data ?? []) as Nudge[]).map(withSender) })
}

function withSender(n: Nudge): Nudge {
  const all = Object.values(useSocial.getState().members).flat()
  const m = all.find((x) => x.id === n.from_user)
  return { ...n, from_name: m?.display_name ?? n.from_name ?? 'Друг', from_avatar: m?.avatar ?? n.from_avatar ?? '❄️' }
}

export async function markNudgesSeen(ids?: number[]) {
  const acc = useSocial.getState().account
  const list = useSocial.getState().nudges
  const target = ids ?? list.map((n) => n.id)
  if (!acc || !target.length) return
  useSocial.setState({ nudges: list.filter((n) => !target.includes(n.id)) })
  const sb = await getClient()
  await sb.from('nudges').update({ seen_at: new Date().toISOString() }).in('id', target).eq('to_user', acc.id)
}

// ---------- public stats ----------

let lastStatsSig = ''
let statsTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleStats(delay = 5000) {
  clearTimeout(statsTimer)
  statsTimer = setTimeout(() => void pushStats().catch(() => undefined), delay)
}

export async function pushStats(force = false) {
  const acc = useSocial.getState().account
  const data = useStore.getState().data
  if (!acc || !data.profile || data.settings.debugOffsetDays) return
  const now = nowWithOffset()
  const stats = buildPublicStats(data, computeState(data, now), now)
  // the same ring as on «Сегодня», so friends see exactly the same «Сделано X из Y»
  const p = todaySections(data, gameDayOf(now)).progress
  stats.prog = { d: p.done, t: p.total, a: p.areas }
  const sig = statsSignature(stats)
  if (!force && sig === lastStatsSig) return
  const sb = await getClient()
  const { error } = await sb.from('public_stats').upsert({ user_id: acc.id, payload: stats }, { onConflict: 'user_id' })
  if (error) {
    markSchema(error)
    throw error
  }
  lastStatsSig = sig
  // reflect myself immediately in the cached member lists
  useSocial.setState((s) => ({
    members: Object.fromEntries(Object.entries(s.members).map(([pid, list]) => [pid, list.map((m) => (m.id === acc.id ? { ...m, stats, stats_at: new Date().toISOString() } : m))])),
  }))
}

// ---------- feed posting ----------

let postTimer: ReturnType<typeof setTimeout> | undefined

export function schedulePosting(delay = 4000) {
  clearTimeout(postTimer)
  postTimer = setTimeout(() => void postFeedEvents().catch(() => undefined), delay)
}

export async function postFeedEvents() {
  const st = useSocial.getState()
  const acc = st.account
  const data = useStore.getState().data
  if (!acc || !st.parties.length || !data.profile || data.settings.debugOffsetDays || st.since === undefined) return
  const game = computeState(data, nowWithOffset())
  const sb = await getClient()
  for (const party of st.parties) {
    const me = st.members[party.id]?.find((m) => m.id === acc.id)
    const joined = me ? Date.parse(me.joined_at) : NaN
    const since = Math.max(st.since, Number.isFinite(joined) ? joined : st.since)
    const drafts = detectFeedEvents(data, game, { since, levelAtSince: st.levelAtSince ?? game.eloLevel, share: shareSettings(data) })
    const posted = new Set(st.posted[party.id] ?? [])
    const fresh = drafts.filter((d) => !posted.has(d.key))
    if (!fresh.length) continue
    const rows = fresh.map((d: FeedDraft) => ({ user_id: acc.id, party_id: party.id, kind: d.kind, key: d.key, payload: d.payload }))
    const { error } = await sb.from('feed_events').upsert(rows, { onConflict: 'party_id,user_id,key', ignoreDuplicates: true })
    if (error) {
      markSchema(error)
      throw error
    }
    useSocial.setState((s) => ({ posted: { ...s.posted, [party.id]: [...(s.posted[party.id] ?? []), ...fresh.map((d) => d.key)].slice(-400) } }))
  }
  void refreshParty().catch(() => undefined)
}

// ---------- weekly check («Воскресная сверка») ----------

async function removeMyChecks(sb: SupabaseClient, partyId: string, uid: string) {
  const { data } = await sb.storage.from('checks').list(`${partyId}/${uid}`, { limit: 100 })
  const paths = (data ?? []).map((f) => `${partyId}/${uid}/${f.name}`)
  if (paths.length) await sb.storage.from('checks').remove(paths)
}

export async function removeAllMyChecks() {
  const st = useSocial.getState()
  if (!st.account) return
  const sb = await getClient()
  for (const p of st.parties) await removeMyChecks(sb, p.id, st.account.id).catch(() => undefined)
}

/** Uploads the compressed screenshot to every party I'm in and posts it to the feed */
export async function uploadCheck(image: Blob, week: number) {
  const st = useSocial.getState()
  if (!st.account) throw new CloudError('not_authenticated')
  if (!st.parties.length) throw new CloudError('not_in_party')
  const sb = await getClient()
  for (const party of st.parties) {
    const path = `${party.id}/${st.account.id}/${week}.jpg`
    const up = await sb.storage.from('checks').upload(path, image, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' })
    if (up.error) throw up.error
    // re-upload replaces the old post so it rises to the top again
    await sb.from('feed_events').delete().eq('party_id', party.id).eq('user_id', st.account.id).eq('key', `check:${week}`)
    const { error } = await sb.from('feed_events').insert({ user_id: st.account.id, party_id: party.id, kind: 'check', key: `check:${week}`, payload: { week, path, v: Date.now() } })
    if (error) throw error
    signedCache.delete(path)
  }
  await refreshParty().catch(() => undefined)
}

const signedCache = new Map<string, { url: string; exp: number }>()

export async function signedUrl(path: string): Promise<string> {
  const hit = signedCache.get(path)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  const sb = await getClient()
  const { data, error } = await sb.storage.from('checks').createSignedUrl(path, 3600)
  if (error || !data) throw error ?? new CloudError('denied')
  signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 })
  return data.signedUrl
}

// ---------- realtime ----------

let partyChannel: RealtimeChannel | undefined
let meChannel: RealtimeChannel | undefined
let nudgeListener: ((n: Nudge) => void) | undefined

export function onNudge(fn: (n: Nudge) => void) {
  nudgeListener = fn
}

export async function resubscribe() {
  const st = useSocial.getState()
  const acc = st.account
  const sb = await getClient().catch(() => undefined)
  if (!sb) return
  if (partyChannel) await sb.removeChannel(partyChannel)
  partyChannel = undefined
  const party = activePartyOf(st)
  if (!acc || !party) return
  const pid = party.id
  partyChannel = sb
    .channel(`party-${pid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events', filter: `party_id=eq.${pid}` }, (p) => {
      const ev = p.new as FeedEvent
      useSocial.setState((s) => {
        const list = (s.feed[pid] ?? []).filter((x) => x.id !== ev.id && !(x.user_id === ev.user_id && x.key === ev.key))
        return { feed: { ...s.feed, [pid]: [ev, ...list].slice(0, FEED_LIMIT) } }
      })
      if (ev.kind === 'join') void refreshParty(pid).catch(() => undefined)
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_events' }, (p) => {
      const id = (p.old as { id?: number }).id
      if (id === undefined) return
      useSocial.setState((s) => ({ feed: { ...s.feed, [pid]: (s.feed[pid] ?? []).filter((x) => x.id !== id) } }))
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (p) => {
      const row = (p.eventType === 'DELETE' ? p.old : p.new) as Partial<Reaction>
      if (row.event_id === undefined || !row.user_id) return
      useSocial.setState((s) => {
        const list = (s.reactions[row.event_id!] ?? []).filter((r) => r.user_id !== row.user_id)
        if (p.eventType !== 'DELETE' && row.emoji) list.push(row as Reaction)
        return { reactions: { ...s.reactions, [row.event_id!]: list } }
      })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'public_stats' }, (p) => {
      const row = p.new as { user_id?: string; payload?: PublicStats; updated_at?: string }
      if (!row?.user_id) return
      useSocial.setState((s) => ({
        members: { ...s.members, [pid]: (s.members[pid] ?? []).map((m) => (m.id === row.user_id ? { ...m, stats: row.payload, stats_at: row.updated_at } : m)) },
      }))
    })
    .subscribe()
}

/** Personal channel: nudges to me + «pushed» pings between my devices */
export async function subscribeMe(onPing: () => void) {
  const acc = useSocial.getState().account
  const sb = await getClient()
  if (meChannel) await sb.removeChannel(meChannel)
  meChannel = undefined
  if (!acc) return undefined
  const ch = sb
    .channel(`me-${acc.id}`, { config: { broadcast: { self: false } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges', filter: `to_user=eq.${acc.id}` }, (p) => {
      const n = withSender(p.new as Nudge)
      useSocial.setState((s) => ({ nudges: [n, ...s.nudges.filter((x) => x.id !== n.id)] }))
      nudgeListener?.(n)
    })
    .on('broadcast', { event: 'pushed' }, () => onPing())
    .subscribe()
  meChannel = ch
  return (rev: number) => void ch.send({ type: 'broadcast', event: 'pushed', payload: { rev } })
}

export async function unsubscribeAll() {
  const sb = await getClient().catch(() => undefined)
  if (!sb) return
  if (partyChannel) await sb.removeChannel(partyChannel)
  if (meChannel) await sb.removeChannel(meChannel)
  partyChannel = meChannel = undefined
}
