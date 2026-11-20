import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Crown, Flame, Hand, Image as ImageIcon, KeyRound, LogIn, RefreshCw, Share2, ShieldCheck, Swords, Trash2, Users, WifiOff } from 'lucide-react'
import { NUDGES, REACTIONS, feedText, nudgeText, plural } from '../engine'
import type { PublicStats } from '../engine'
import { useToday } from '../store/hooks'
import { useUi } from '../store/ui'
import { useRoute } from '../store/hooks'
import { cloudConfigured, ruError } from '../cloud/client'
import { activePartyOf, useSocial } from '../cloud/state'
import type { FeedEvent, Member, Party as PartyT } from '../cloud/state'
import { createParty, deleteEvent, joinParty, leaveParty, markNudgesSeen, react, refreshParty, regenerateCode, sendNudge, setActiveParty, signedUrl } from '../cloud/party'
import { AuthForm } from '../components/AuthForm'
import { MiniGarland } from '../components/festive'
import { HpBar, Sheet } from '../components/ui'

export function Party() {
  const account = useSocial((s) => s.account)
  const parties = useSocial((s) => s.parties)
  const schemaMissing = useSocial((s) => s.schemaMissing)
  const route = useRoute()
  const code = route.query.get('code') ?? undefined

  if (!cloudConfigured) {
    return (
      <div className="stack-lg">
        <h1>Пати</h1>
        <div className="empty">Сервер для пати не настроен в этой сборке. Всё остальное работает как раньше.</div>
      </div>
    )
  }
  if (!account) return <PartyIntro />
  return (
    <div className="stack-lg">
      {schemaMissing && <SchemaBanner />}
      {parties.length === 0 ? <PartySetup initialCode={code} /> : <PartyHome initialCode={code} />}
    </div>
  )
}

function SchemaBanner() {
  return (
    <div className="card-calm small" role="status">
      <b>Сервер ещё не готов.</b> Таблицы пати не созданы — нужно один раз применить <code>supabase/schema.sql</code> в панели Supabase. Твои данные на устройстве в порядке.
    </div>
  )
}

// ---------- logged out ----------

function PartyIntro() {
  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <h1>Пати</h1>
        <p className="muted">Маленькая группа подотчётности: до 8 друзей, без рейтингов и посторонних.</p>
      </div>
      <div className="cols">
        <section className="panel stack-lg">
          <div className="stack" style={{ gap: 6 }}>
            <h2>Войти, чтобы играть с друзьями и синхронизировать</h2>
            <p className="small muted">Только ник и пароль: ни почты, ни телефона. Аккаунт нужен лишь для пати и синхронизации телефона с Маком — без него приложение работает как прежде.</p>
          </div>
          <AuthForm />
        </section>
        <section className="stack">
          <h3>Что видят друзья</h3>
          <ul className="privacy-list">
            <li>
              <Check size={16} aria-hidden /> Уровень, HP, гирлянду дня и серии «X из 7»
            </li>
            <li>
              <Check size={16} aria-hidden /> Бой с боссом недели и серию честности
            </li>
            <li>
              <Check size={16} aria-hidden /> Срывы — только категорию, и сразу камбэк ✅
            </li>
          </ul>
          <h3 style={{ marginTop: 6 }}>Что не уходит никуда</h3>
          <ul className="privacy-list off">
            <li>
              <ShieldCheck size={16} aria-hidden /> Текст исповеди, причины и заметки срывов
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden /> Замеры, вес, ответы недельных обзоров
            </li>
          </ul>
          <p className="tiny muted">Синхронизация между твоими устройствами хранит полную копию данных в облаке, но доступ к ней есть только у тебя.</p>
        </section>
      </div>
    </div>
  )
}

// ---------- no party yet ----------

function PartySetup({ initialCode }: { initialCode?: string }) {
  const account = useSocial((s) => s.account)!
  const [name, setName] = useState(`Пати ${account.display_name || account.nick}`.slice(0, 32))
  const [code, setCode] = useState(initialCode ?? '')
  const [busy, setBusy] = useState<'create' | 'join'>()
  const [err, setErr] = useState<{ where: 'create' | 'join'; text: string }>()
  const say = useUi((s) => s.say)

  const run = async (where: 'create' | 'join') => {
    setBusy(where)
    setErr(undefined)
    try {
      if (where === 'create') {
        const p = await createParty(name)
        say(`Пати создана, код ${p.code}`)
      } else {
        const r = await joinParty(code)
        say(r.already ? 'Ты уже в этой пати' : `Ты в пати «${r.party.name}»`)
      }
    } catch (e) {
      setErr({ where, text: ruError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <h1>Пати</h1>
        <p className="muted">
          Ты вошёл как <b>{account.display_name}</b> <span className="num">@{account.nick}</span>. Осталось собрать команду.
        </p>
      </div>
      <div className="cols">
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void run('join')
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <KeyRound size={20} color="var(--pine)" aria-hidden />
            <h2>Вступить по коду</h2>
          </div>
          <p className="small muted">Код вида SNOW-4821 даст друг, который создал пати.</p>
          <input className="input num code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SNOW-4821" aria-label="Код пати" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} />
          {err?.where === 'join' && <p className="err">{err.text}</p>}
          <button className="btn primary" type="submit" disabled={!code.trim() || !!busy}>
            {busy === 'join' ? 'Вступаю…' : 'Вступить'}
          </button>
        </form>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void run('create')
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <Users size={20} color="var(--pine)" aria-hidden />
            <h2>Создать пати</h2>
          </div>
          <p className="small muted">До 8 человек. Код можно отправить в любой мессенджер.</p>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Название пати" />
          {err?.where === 'create' && <p className="err">{err.text}</p>}
          <button className="btn" type="submit" disabled={!name.trim() || !!busy}>
            {busy === 'create' ? 'Создаю…' : 'Создать'}
          </button>
        </form>
      </div>
    </>
  )
}

// ---------- party ----------

function PartyHome({ initialCode }: { initialCode?: string }) {
  const st = useSocial()
  const party = activePartyOf(st)!
  const members = st.members[party.id] ?? []
  const feed = st.feed[party.id] ?? []
  const nudges = st.nudges
  const [nudgeTo, setNudgeTo] = useState<Member>()
  const [showJoin, setShowJoin] = useState(!!initialCode)
  const [err, setErr] = useState<string>()

  useEffect(() => {
    refreshParty(party.id).then(
      () => setErr(undefined),
      (e) => setErr(ruError(e)),
    )
  }, [party.id])

  // opening the party means the nudges are seen
  useEffect(() => {
    if (!nudges.length) return
    const t = setTimeout(() => void markNudgesSeen().catch(() => undefined), 2500)
    return () => clearTimeout(t)
  }, [nudges.length])

  const me = st.account!
  const sorted = [...members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0))

  return (
    <>
      <div className="party-head">
        <div className="grow">
          <h1>{party.name}</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            {members.length} {plural(members.length, 'участник', 'участника', 'участников')} из 8
          </p>
        </div>
        <button className="icon-btn" aria-label="Обновить" onClick={() => refreshParty(party.id).then(() => setErr(undefined), (e) => setErr(ruError(e)))}>
          <RefreshCw size={18} className={st.loading ? 'spin' : undefined} />
        </button>
      </div>

      {st.parties.length > 1 && (
        <div className="chips" role="tablist" aria-label="Мои пати">
          {st.parties.map((p) => (
            <button key={p.id} className="chip" role="tab" aria-selected={p.id === party.id} aria-pressed={p.id === party.id} onClick={() => setActiveParty(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {err && !st.schemaMissing && (
        <div className="card-calm small row" role="status">
          <WifiOff size={16} aria-hidden /> <span className="grow">{err} Показаны последние сохранённые данные.</span>
        </div>
      )}

      {nudges.length > 0 && (
        <section className="nudge-list" aria-label="Тебя пнули">
          {nudges.slice(0, 4).map((n) => (
            <div key={n.id} className="nudge-row">
              <span className="nudge-ava" aria-hidden>
                {n.from_avatar}
              </span>
              <span className="grow">
                <b>{n.from_name}</b> пнул: «{nudgeText(n.kind)}»
              </span>
              <span className="tiny muted">{timeAgo(n.created_at)}</span>
            </div>
          ))}
        </section>
      )}

      <div className="cols">
        <section className="stack">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>Команда</h2>
          </div>
          <div className="members">
            {sorted.map((m) => (
              <MemberCard key={m.id} m={m} isMe={m.id === me.id} owner={party.owner === m.id} onNudge={() => setNudgeTo(m)} />
            ))}
            {members.length === 0 && <div className="empty">Загружаю участников…</div>}
          </div>
          <CodeCard party={party} isOwner={party.owner === me.id} />
        </section>
        <section className="stack">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>Лента</h2>
          </div>
          <Feed events={feed} members={members} meId={me.id} />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn sm ghost" onClick={() => setShowJoin(true)}>
              Вступить в ещё одну пати
            </button>
            <LeaveButton party={party} />
          </div>
        </section>
      </div>

      {nudgeTo && <NudgeSheet to={nudgeTo} onClose={() => setNudgeTo(undefined)} />}
      {showJoin && (
        <Sheet title="Ещё одна пати" onClose={() => setShowJoin(false)}>
          <PartySetupInline initialCode={initialCode} onDone={() => setShowJoin(false)} />
        </Sheet>
      )}
    </>
  )
}

function PartySetupInline({ initialCode, onDone }: { initialCode?: string; onDone: () => void }) {
  const [code, setCode] = useState(initialCode ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const say = useUi((s) => s.say)
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(undefined)
        try {
          const r = await joinParty(code)
          say(r.already ? 'Ты уже в этой пати' : `Ты в пати «${r.party.name}»`)
          onDone()
        } catch (x) {
          setErr(ruError(x))
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="small muted">Можно состоять максимум в 3 пати. События ленты уходят во все.</p>
      <input className="input num code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SNOW-4821" aria-label="Код пати" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} />
      {err && <p className="err">{err}</p>}
      <button className="btn primary" type="submit" disabled={!code.trim() || busy}>
        {busy ? 'Вступаю…' : 'Вступить'}
      </button>
    </form>
  )
}

function LeaveButton({ party }: { party: PartyT }) {
  const ask = useUi((s) => s.confirm)
  const say = useUi((s) => s.say)
  return (
    <button
      className="btn sm ghost"
      style={{ color: 'var(--hp)' }}
      onClick={async () => {
        if (!(await ask({ title: `Выйти из «${party.name}»?`, body: 'Твои события и скрины сверки из этой пати удалятся. Вернуться можно по коду.', ok: 'Выйти из пати', danger: true }))) return
        try {
          await leaveParty(party.id)
          say('Ты вышел из пати')
        } catch (e) {
          say(ruError(e))
        }
      }}
    >
      Выйти из пати
    </button>
  )
}

function CodeCard({ party, isOwner }: { party: PartyT; isOwner: boolean }) {
  const say = useUi((s) => s.say)
  const ask = useUi((s) => s.confirm)
  const link = `${window.location.origin}${window.location.pathname}#/party?code=${party.code}`
  const text = `Вступай в мою пати «${party.name}» в Winter Arc. Код: ${party.code}`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  return (
    <section className="panel code-card" aria-label="Код приглашения">
      <div className="grow">
        <span className="small muted">Код приглашения</span>
        <div className="party-code num">{party.code}</div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className="btn sm"
          onClick={() =>
            navigator.clipboard?.writeText(party.code).then(
              () => say('Код скопирован'),
              () => say('Скопируй код вручную'),
            )
          }
        >
          <Copy size={16} aria-hidden /> Копировать
        </button>
        {canShare && (
          <button className="btn sm primary" onClick={() => navigator.share({ title: 'Winter Arc', text, url: link }).catch(() => undefined)}>
            <Share2 size={16} aria-hidden /> Поделиться
          </button>
        )}
        {isOwner && (
          <button
            className="btn sm ghost"
            onClick={async () => {
              if (!(await ask({ title: 'Новый код?', body: 'Старый код перестанет работать. Те, кто уже в пати, останутся.', ok: 'Сменить код' }))) return
              try {
                const c = await regenerateCode(party.id)
                say(`Новый код: ${c}`)
              } catch (e) {
                say(ruError(e))
              }
            }}
          >
            Сменить
          </button>
        )}
      </div>
    </section>
  )
}

// ---------- member ----------

function MemberCard({ m, isMe, owner, onNudge }: { m: Member; isMe: boolean; owner: boolean; onNudge: () => void }) {
  const today = useToday()
  const s = m.stats
  const fresh = s?.day === today
  const sent = useSocial((st) => st.sentNudges[m.id])
  const cooling = sent !== undefined && Date.now() - sent < 3600_000
  return (
    <article className={`member ${isMe ? 'me' : ''}`} aria-label={m.display_name}>
      <div className="member-top">
        <span className="member-ava" aria-hidden>
          {m.avatar}
        </span>
        <div className="grow">
          <div className="member-name">
            {m.display_name}
            {isMe && <span className="tag">ты</span>}
            {owner && <Crown size={14} color="var(--gold)" aria-label="создатель пати" />}
          </div>
          <div className="tiny muted">{s ? (fresh ? `обновлено ${timeAgo(m.stats_at ?? new Date(s.at).toISOString())}` : 'сегодня ещё не заходил') : 'ещё нет данных'}</div>
        </div>
        {s && (
          <div className="member-lvl" aria-label={`Уровень ${s.level}`}>
            <span className="num">{s.level}</span>
            <small>ур.</small>
          </div>
        )}
      </div>

      {s && <MemberStats s={s} fresh={fresh} />}

      {!isMe && (
        <button className="btn sm ghost nudge-btn" onClick={onNudge} disabled={cooling} aria-label={`Пнуть ${m.display_name}`}>
          <Hand size={16} aria-hidden /> {cooling ? 'Пнул, жди час' : 'Пнуть'}
        </button>
      )}
    </article>
  )
}

function MemberStats({ s, fresh }: { s: PublicStats; fresh: boolean }) {
  const bulbs = useMemo(
    () =>
      s.bulbs.split('').map((c, i) => ({
        id: String(i),
        main: c === 'M' || c === 'm',
        on: fresh && (c === 'M' || c === 'S'),
      })),
    [s.bulbs, fresh],
  )
  const lit = bulbs.filter((b) => b.on).length
  const bossLeft = s.boss ? Math.max(0, s.boss.hp - s.boss.damage) : 0
  return (
    <div className="member-body">
      <div className="member-row">
        <span className="k">HP</span>
        <div className="grow">{s.warmup ? <span className="tiny muted">разминка — HP не тратится</span> : <HpBar hp={s.hp} />}</div>
        <span className="num small hp-v">{s.warmup ? '—' : s.fallen ? 'падение' : s.hp}</span>
      </div>
      <div className="member-row">
        <span className="k">День</span>
        <div className="grow">
          <MiniGarland bulbs={bulbs} />
        </div>
        <span className="num small">
          {fresh ? lit : 0}/{bulbs.length}
        </span>
      </div>
      {s.mains.length > 0 && (
        <ul className="member-mains">
          {s.mains.map((q) => (
            <li key={q.t}>
              <span className="grow">{q.t}</span>
              <span className="num">{q.n} из 7</span>
            </li>
          ))}
        </ul>
      )}
      <div className="member-foot">
        <span className="pill" title="Дни подряд с исповедью">
          <Flame size={14} aria-hidden /> честность {s.honesty} {plural(s.honesty, 'день', 'дня', 'дней')}
        </span>
        {fresh && s.confessed && (
          <span className="pill ok">
            <Check size={14} aria-hidden /> исповедь
          </span>
        )}
      </div>
      {s.boss && !s.warmup && (
        <div className="member-boss">
          <div className="row between tiny">
            <span>
              <Swords size={13} aria-hidden /> {s.boss.name}
            </span>
            <span className="num muted">{s.boss.won ? 'повержен' : `${bossLeft} / ${s.boss.hp}`}</span>
          </div>
          <div className="boss-bar thin">
            <i className={s.boss.won ? 'won' : ''} style={{ width: `${s.boss.hp ? (s.boss.won ? 100 : (bossLeft / s.boss.hp) * 100) : 0}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function NudgeSheet({ to, onClose }: { to: Member; onClose: () => void }) {
  const say = useUi((s) => s.say)
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()
  return (
    <Sheet title={`Пнуть: ${to.display_name}`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">Он увидит это в приложении. Одного друга можно пнуть раз в час.</p>
        <div className="nudge-presets">
          {NUDGES.map((n) => (
            <button
              key={n.kind}
              className="btn"
              disabled={!!busy}
              onClick={async () => {
                setBusy(n.kind)
                setErr(undefined)
                try {
                  await sendNudge(to.id, n.kind)
                  say(`Пнул: «${n.text}»`)
                  onClose()
                } catch (e) {
                  setErr(ruError(e))
                } finally {
                  setBusy(undefined)
                }
              }}
            >
              {busy === n.kind ? 'Отправляю…' : n.text}
            </button>
          ))}
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </Sheet>
  )
}

// ---------- feed ----------

function Feed({ events, members, meId }: { events: FeedEvent[]; members: Member[]; meId: string }) {
  const reactions = useSocial((s) => s.reactions)
  const say = useUi((s) => s.say)
  const [photo, setPhoto] = useState<string>()

  // a comeback joins its slip: one line «слился → камбэк ✅»
  const comebacks = new Map<string, FeedEvent>()
  for (const e of events) if (e.kind === 'comeback' && typeof e.payload.slip === 'string') comebacks.set(`${e.user_id}|${e.payload.slip}`, e)
  const slipKeys = new Set(events.filter((e) => e.kind === 'slip').map((e) => `${e.user_id}|${e.key}`))
  const shown = events.filter((e) => !(e.kind === 'comeback' && slipKeys.has(`${e.user_id}|${e.payload.slip}`)))

  if (!shown.length) return <div className="empty">Пока тихо. Первое закрытое дело, идеальный день или честный срыв появятся здесь.</div>

  return (
    <>
      <ol className="feed">
        {shown.map((e) => {
          const who = members.find((m) => m.id === e.user_id)
          const cb = e.kind === 'slip' ? comebacks.get(`${e.user_id}|${e.key}`) : undefined
          const list = reactions[e.id] ?? []
          const mine = list.find((r) => r.user_id === meId)?.emoji
          return (
            <li key={e.id} className={`feed-item k-${e.kind} ${cb ? 'won' : ''}`}>
              <span className="feed-ava" aria-hidden>
                {who?.avatar ?? '❄️'}
              </span>
              <div className="grow stack" style={{ gap: 6 }}>
                <div>
                  <span className="feed-who">{e.user_id === meId ? 'Ты' : who?.display_name ?? 'Бывший участник'}</span>
                  <span className="tiny muted"> · {timeAgo(e.created_at)}</span>
                </div>
                <p className="feed-text">{feedText(e.kind, e.payload, cb?.payload)}</p>
                {e.kind === 'check' && typeof e.payload.path === 'string' && <CheckThumb path={e.payload.path} v={String(e.payload.v ?? '')} onOpen={setPhoto} />}
                <div className="react-row" role="group" aria-label="Реакции">
                  {REACTIONS.map((emo) => {
                    const n = list.filter((r) => r.emoji === emo).length
                    return (
                      <button
                        key={emo}
                        className="react"
                        aria-pressed={mine === emo}
                        aria-label={`${emo}${n ? `, ${n}` : ''}`}
                        onClick={() => react(e.id, mine === emo ? null : emo).catch((x) => say(ruError(x)))}
                      >
                        <span aria-hidden>{emo}</span>
                        {n > 0 && <span className="num">{n}</span>}
                      </button>
                    )
                  })}
                  {e.user_id === meId && e.kind !== 'join' && (
                    <button className="react del" aria-label="Удалить событие" onClick={() => deleteEvent(e).catch((x) => say(ruError(x)))}>
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {photo && (
        <Sheet title="Сверка" onClose={() => setPhoto(undefined)} wide>
          <img src={photo} alt="Скрин отчёта «Экранное время»" className="check-full" />
        </Sheet>
      )}
    </>
  )
}

function CheckThumb({ path, v, onOpen }: { path: string; v: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    signedUrl(path).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [path, v])
  if (failed)
    return (
      <span className="tiny muted row" style={{ gap: 6 }}>
        <ImageIcon size={14} aria-hidden /> Скрин недоступен офлайн
      </span>
    )
  return (
    <button className="check-thumb" onClick={() => url && onOpen(url)} aria-label="Открыть скрин сверки">
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="tiny muted">Загружаю скрин…</span>}
    </button>
  )
}

// ---------- utils ----------

export function timeAgo(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'только что'
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`
  if (s < 2 * 86400) return 'вчера'
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function PartyLoginLink() {
  return (
    <a className="list-btn" href="#/party">
      <LogIn aria-hidden />
      <span className="grow">
        Войти, чтобы играть с друзьями и синхронизировать
        <small>Пати, лента, «пнуть», телефон ↔ Мак</small>
      </span>
    </a>
  )
}
