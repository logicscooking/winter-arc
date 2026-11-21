/**
 * v0.5 «Дуэли в пати»: the button on a friend's card, the incoming challenge, the duel plate,
 * and the reconciliation that marks acceptance and settles finished duels once.
 */
import { useEffect, useMemo } from 'react'
import { Swords } from 'lucide-react'
import {
  DUEL,
  acceptedFrom,
  activeDuels,
  addDays,
  canChallenge,
  duelEnd,
  duelScores,
  duelStatus,
  gameDayOf,
  incomingChallenges,
  isDayClosed,
  newDuel,
  opponentOf,
  readyToSettle,
  safeDuels,
  settle,
  uid,
} from '../engine'
import type { Duel, DuelPub, GameState } from '../engine'
import { pushStats } from '../cloud/party'
import type { Member } from '../cloud/state'
import { useStore } from '../store/store'
import { nowWithOffset, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'

const push = () => void pushStats(true).catch(() => useUi.getState().say('Дуэль сохранена. Друг увидит её, когда появится сеть'))

/** all friends' validated duels by user id */
export function useTheirDuels(members: Member[]): (userId: string) => DuelPub[] | undefined {
  return useMemo(() => {
    const map = new Map(members.map((m) => [m.id, safeDuels(m.stats?.duels)]))
    return (id: string) => map.get(id)
  }, [members])
}

/** Marks acceptance seen in the friend's payload and settles finished duels, once per duel */
export function useDuelReconcile(members: Member[], meId: string) {
  const duels = useStore((s) => s.data.duels)
  const patch = useStore((s) => s.patchDuel)
  const game = useGame()
  const theirsOf = useTheirDuels(members)
  useEffect(() => {
    if (!duels?.length) return
    const now = nowWithOffset()
    const today = gameDayOf(now)
    const data = useStore.getState().data
    let changed = false
    for (const d of duels) {
      if (d.result || d.declined) continue
      const other = opponentOf(d, meId)
      const member = members.find((m) => m.id === other)
      if (!member) continue
      const theirs = theirsOf(other)
      const pub = theirs?.find((p) => p.id === d.id)
      if (pub && !d.acceptedAt) {
        patch(d.id, { acceptedAt: now.getTime() })
        changed = true
      }
      if ((pub || d.acceptedAt) && readyToSettle(d, isDayClosed(data, duelEnd(d), now), member.stats?.day, today)) {
        patch(d.id, { result: settle(duelScores(game, d), pub?.sc ?? [], today, now.getTime()) })
        changed = true
      }
    }
    if (changed) push()
  }, [duels, members, meId, game, patch, theirsOf])
}

function DuelPlate({ d, game, theirs, name, now, meId }: { d: Duel; game: GameState; theirs: DuelPub[] | undefined; name: string; now: number; meId: string }) {
  const removeDuel = useStore((s) => s.removeDuel)
  const status = duelStatus(d, theirs, now, game.today)
  const mine = duelScores(game, d)
  const pub = theirs?.find((p) => p.id === d.id)
  const their = pub?.sc ?? []
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
  const me = d.result?.me ?? sum(mine)
  const them = d.result?.them ?? sum(their)
  const dayN = Math.min(d.days, Math.max(0, Math.round((Date.parse(game.today) - Date.parse(d.start)) / 86400_000) + 1))
  let head: string
  switch (status) {
    case 'pending':
      head = `Ждём ответа · ещё ${Math.max(1, Math.ceil((d.createdAt + DUEL.acceptMs - now) / 3600_000))} ч`
      break
    case 'expired':
      head = 'Вызов истёк: друг не принял за 24 часа'
      break
    case 'soon':
      head = 'Принято · старт завтра'
      break
    case 'running':
      head = `День ${dayN} из ${d.days}`
      break
    case 'ended':
      head = 'Окно закрыто · ждём итог друга'
      break
    case 'done':
      head = d.result!.outcome === 'win' ? `Победа! +${DUEL.xp} XP и +${DUEL.shards} ❄` : d.result!.outcome === 'draw' ? 'Ничья' : 'Поражение. Реванш?'
      break
    default:
      head = ''
  }
  const outcome = d.result?.outcome
  return (
    <div className={`duel-plate s-${status} ${outcome ? `o-${outcome}` : ''}`}>
      <div className="duel-head">
        <Swords size={16} aria-hidden />
        <span className="grow">
          <b>Дуэль</b> · {head}
        </span>
        {(status === 'expired' || status === 'pending') && d.by === meId && (
          <button className="link-btn" onClick={() => removeDuel(d.id)}>
            {status === 'expired' ? 'Убрать' : 'Отменить'}
          </button>
        )}
      </div>
      {status !== 'pending' && status !== 'expired' && (
        <>
          <div className="duel-score" aria-label={`Счёт: ты ${me}, ${name} ${them}`}>
            <span className={me > them ? 'lead' : ''}>
              Ты <b className="num">{me}</b>
            </span>
            <span className="vs">:</span>
            <span className={them > me ? 'lead' : ''}>
              <b className="num">{them}</b> {name}
            </span>
          </div>
          <div className="duel-days" aria-hidden>
            {Array.from({ length: d.days }, (_, i) => (
              <span key={i} className={addDays(d.start, i) === game.today ? 'now' : ''}>
                <i className="mine">{mine[i] ?? '·'}</i>
                <i className="their">{their[i] ?? '·'}</i>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Everything about duels with one friend: a row in Пати → Дуэли */
export function DuelArea({ friend, meId, members }: { friend: Member; meId: string; members: Member[] }) {
  const duels = useStore((s) => s.data.duels)
  const putDuel = useStore((s) => s.putDuel)
  const game = useGame()
  const nowD = useNow()
  const now = nowD.getTime()
  const say = useUi((s) => s.say)
  const confirm = useUi((s) => s.confirm)
  const theirsOf = useTheirDuels(members)
  const theirs = theirsOf(friend.id) ?? []
  const name = friend.display_name
  const incoming = incomingChallenges(friend.id, theirs, duels, meId, now)
  const withFriend = (duels ?? []).filter((d) => opponentOf(d, meId) === friend.id && !d.declined)
  const shown = withFriend.filter((d) => {
    const s = duelStatus(d, theirs, now, game.today)
    return s !== 'done' || (d.result && addDays(d.result.day, DUEL.keepDays) >= game.today)
  })
  const check = canChallenge(duels, meId, friend.id, theirs, theirsOf, now, game.today)

  const challenge = async () => {
    if (!check.ok) return say(check.reason)
    const ok = await confirm({
      title: `Дуэль с ${name}?`,
      body: `3 дня с завтрашнего, кто закроет больше квестов дня. У ${name} 24 часа, чтобы принять. Победа: +${DUEL.xp} XP и +${DUEL.shards} ❄.`,
      ok: 'Вызвать',
    })
    if (!ok) return
    const t = nowWithOffset()
    putDuel(newDuel(`${meId.slice(0, 8)}-${uid()}`, meId, friend.id, gameDayOf(t), t.getTime()))
    say(`Вызов отправлен: ${name} увидит его в «Дуэлях»`)
    push()
  }

  return (
    <div className="duel-area">
      {incoming.map((p) => (
        <div key={p.id} className="duel-plate s-incoming">
          <div className="duel-head">
            <Swords size={16} aria-hidden />
            <span className="grow">
              <b>{name}</b> вызывает на дуэль: {p.days} дня с {p.start.slice(8)}.{p.start.slice(5, 7)}, кто закроет больше квестов
            </span>
          </div>
          <div className="grid-2">
            <button
              className="btn sm ghost"
              onClick={() => {
                putDuel({ ...acceptedFrom(p, nowWithOffset().getTime()), acceptedAt: undefined, declined: true })
                push()
              }}
            >
              Отказаться
            </button>
            <button
              className="btn sm primary"
              onClick={() => {
                const t = nowWithOffset().getTime()
                if (activeDuels(duels, theirsOf, meId, t, game.today).length >= DUEL.maxActive) return say(`У тебя уже ${DUEL.maxActive} дуэли. Доиграй одну`)
                putDuel(acceptedFrom(p, t))
                say('Дуэль принята. Старт завтра')
                push()
              }}
            >
              Принять
            </button>
          </div>
        </div>
      ))}
      {shown.map((d) => (
        <DuelPlate key={d.id} d={d} game={game} theirs={theirs} name={name} now={now} meId={meId} />
      ))}
      {!incoming.length && !shown.some((d) => ['pending', 'soon', 'running', 'ended'].includes(duelStatus(d, theirs, now, game.today))) && (
        <button className="btn sm ghost duel-btn" onClick={challenge} title={check.ok ? 'Вызвать на дуэль' : check.reason} aria-disabled={!check.ok}>
          <Swords size={16} aria-hidden /> Дуэль
        </button>
      )}
    </div>
  )
}
