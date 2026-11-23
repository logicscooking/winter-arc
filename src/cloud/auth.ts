import type { SupabaseClient, User } from '@supabase/supabase-js'
import { computeState, eloLevel } from '../engine'
import { useStore } from '../store/store'
import { nowWithOffset } from '../store/hooks'
import { CloudError, errorCode, getClient, nickProblem, nickToEmail } from './client'
import { useSocial } from './state'
import type { Account } from './state'
import { forgetServer } from './sync'
import { removeAllMyChecks, unsubscribeAll } from './party'
import { startServices, stopServices } from './boot'

function localIdentity() {
  const p = useStore.getState().data.profile
  return { display: (p?.nick ?? '').trim().slice(0, 24), avatar: p?.avatar || '❄️' }
}

/** Reads my profile row; creates it from the local profile if it is missing */
async function ensureProfile(sb: SupabaseClient, user: User, nick: string, display?: string, avatar?: string): Promise<Account> {
  const { data, error } = await sb.from('profiles').select('id, nick, display_name, avatar').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return data as Account
  const id = localIdentity()
  const row = { id: user.id, nick, display_name: (display ?? id.display ?? nick).slice(0, 24) || nick, avatar: avatar ?? id.avatar }
  const ins = await sb.from('profiles').insert(row)
  if (ins.error) throw ins.error
  return row
}

async function signedIn(account: Account) {
  const prev = useSocial.getState()
  const fresh = prev.account?.id !== account.id
  const data = useStore.getState().data
  const level = data.profile ? eloLevel(computeState(data, nowWithOffset()).elo).level : 1
  useSocial.setState({
    account,
    ...(fresh || prev.since === undefined ? { since: Date.now(), levelAtSince: level, posted: {}, parties: [], members: {}, feed: {}, reactions: {} } : {}),
  })
  await startServices()
}

export async function signUp(nickRaw: string, password: string, display?: string, avatar?: string) {
  const nick = nickRaw.trim().toLowerCase()
  const bad = nickProblem(nick)
  if (bad) throw new CloudError('bad_nick', bad)
  if (password.length < 8) throw new CloudError('weak_password')
  const sb = await getClient()
  const { data, error } = await sb.auth.signUp({ email: nickToEmail(nick), password, options: { data: { nick } } })
  if (error) throw error
  // with e-mail confirmation off GoTrue returns a session; without it the nick is taken (obfuscated reply)
  if (!data.session || !data.user) throw new CloudError('user_already_exists')
  let account: Account
  try {
    account = await ensureProfile(sb, data.user, nick, display, avatar)
  } catch (e) {
    if (errorCode(e) !== 'schema_missing') throw e
    useSocial.setState({ schemaMissing: true })
    account = { id: data.user.id, nick, display_name: display ?? nick, avatar: avatar ?? '❄️' }
  }
  await signedIn(account)
}

export async function signIn(nickRaw: string, password: string) {
  const nick = nickRaw.trim().toLowerCase()
  if (nickProblem(nick)) throw new CloudError('invalid_credentials')
  const sb = await getClient()
  const { data, error } = await sb.auth.signInWithPassword({ email: nickToEmail(nick), password })
  if (error) throw error
  let account: Account
  try {
    account = await ensureProfile(sb, data.user, nick)
  } catch (e) {
    if (errorCode(e) !== 'schema_missing') throw e
    useSocial.setState({ schemaMissing: true })
    account = { id: data.user.id, nick, display_name: nick, avatar: '❄️' }
  }
  await signedIn(account)
}

/** Restores the session on start; returns false if there is none */
export async function resumeSession(): Promise<boolean> {
  const sb = await getClient()
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user) {
    if (useSocial.getState().account) clearLocalAccount()
    return false
  }
  const cached = useSocial.getState().account
  const nick = (user.email ?? '').split('@')[0]
  let account: Account = cached?.id === user.id ? cached : { id: user.id, nick, display_name: nick, avatar: '❄️' }
  try {
    account = await ensureProfile(sb, user, nick)
  } catch (e) {
    if (errorCode(e) === 'schema_missing') useSocial.setState({ schemaMissing: true })
    // offline: keep the cached account and carry on
  }
  await signedIn(account)
  return true
}

export async function updateProfile(patch: { display_name?: string; avatar?: string }) {
  const acc = useSocial.getState().account
  if (!acc) return
  const sb = await getClient()
  const clean = { ...patch, ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim().slice(0, 24) } : {}) }
  const { error } = await sb.from('profiles').update(clean).eq('id', acc.id)
  if (error) throw error
  useSocial.setState({ account: { ...acc, ...clean } })
}

function clearLocalAccount() {
  stopServices()
  forgetServer()
  useSocial.getState().reset()
}

export async function signOut() {
  await unsubscribeAll()
  try {
    const sb = await getClient()
    await sb.auth.signOut({ scope: 'local' })
  } finally {
    clearLocalAccount()
  }
}

export async function deleteAccount() {
  const sb = await getClient()
  await removeAllMyChecks()
  const { error } = await sb.rpc('delete_my_account')
  if (error) throw error
  await unsubscribeAll()
  await sb.auth.signOut({ scope: 'local' }).catch(() => undefined)
  clearLocalAccount()
}
