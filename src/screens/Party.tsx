import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Crown, Hand, Image as ImageIcon, LogIn, RefreshCw, Share2, ShieldCheck, Trash2, WifiOff } from 'lucide-react'
import { NUDGES, REACTIONS, feedText, levelOf, nudgeText, plural } from '../engine'
import type { Outfit, PublicStats } from '../engine'
import { useToday } from '../store/hooks'
import { useUi } from '../store/ui'
import { useRoute } from '../store/hooks'
import { cloudConfigured, ruError } from '../cloud/client'
import { activePartyOf, useSocial } from '../cloud/state'
import type { FeedEvent, Member, Party as PartyT } from '../cloud/state'
import { createParty, deleteEvent, joinParty, leaveParty, markNudgesSeen, react, refreshParty, regenerateCode, sendNudge, setActiveParty, signedUrl } from '../cloud/party'
import { AuthForm } from '../components/AuthForm'
import { HeroAva, useUserOutfit } from '../components/HeroAva'
import { Bar, HpBar, Sheet } from '../components/ui'
import { RankBadge } from '../components/skills'
import { RANKS } from '../engine'
import type { Rank } from '../engine'
import { BossSprite, PixelAvatar, Px } from '../pixel/Pixel'
import { DuelArea, useDuelReconcile } from '../components/Duels'

export function Party() {
  const account = useSocial((s) => s.account)
  const parties = useSocial((s) => s.parties)
  const schemaMissing = useSocial((s) => s.schemaMissing)
  const route = useRoute()
  const code = route.query.get('code') ?? undefined

  if (!cloudConfigured) {
    return (
      <div className="stack-lg">
        <PageHead title="Пати" />
        <div className="panel feed-empty">
          <PartyScene />
          <p className="small muted">Сервер для пати не настроен в этой сборке. Всё остальное работает как раньше.</p>
        </div>
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

function PageHead({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div>
      {kicker && <div className="chapter-name">{kicker}</div>}
      <h1 style={kicker ? { marginTop: 4 } : undefined}>{title}</h1>
      {sub && (
        <p className="muted" style={{ marginTop: 8 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

// a little camp: three heroes around the fire
const CAMP: Outfit[] = [
  { hat: 'ushanka', coat: 'puffer', colors: { hat: 'blue', coat: 'blue' }, hair: 'blond', skin: 'mid' },
  { hat: 'beanie', scarf: 'scarf', colors: { hat: 'red', scarf: 'gold' }, hair: 'brown', skin: 'light' },
  { hat: 'earmuffs', scarf: 'longscarf', colors: { hat: 'purple', scarf: 'green' }, hair: 'black', skin: 'tan' },
]

function PartyScene({ me }: { me?: Outfit }) {
  return (
    <div className="party-scene" aria-hidden>
      <PixelAvatar outfit={CAMP[0]} size={58} />
      <PixelAvatar outfit={me ?? CAMP[1]} size={70} />
      <Px name="campfire" size={46} className="scene-fire" />
      <PixelAvatar outfit={CAMP[2]} size={58} />
    </div>
  )
}

// ---------- logged out ----------

function PartyIntro() {
  return (
    <div className="stack-lg">
      <PageHead kicker="Пати" title="Собери команду" sub="До 8 друзей, без рейтингов и посторонних. Видно уровень, HP и закрытые квесты." />
      <PartyScene />
      <div className="cols">
        <section className="panel stack-lg">
          <div className="stack" style={{ gap: 6 }}>
            <h2>Войти</h2>
            <p className="small muted">Только ник и пароль: ни почты, ни телефона. Аккаунт нужен для пати и синхронизации телефона с Маком.</p>
          </div>
          <AuthForm />
        </section>
        <section className="panel stack">
          <h3>Что видят друзья</h3>
          <ul className="privacy-list">
            <li>
              <Check size={16} aria-hidden /> Героя, уровень, HP, квесты дня и серии «X из 7»
            </li>
            <li>
              <Check size={16} aria-hidden /> Бой с боссом недели и серию честности
            </li>
            <li>
              <Check size={16} aria-hidden /> Срывы — только категорию, и сразу камбэк ✅
            </li>
          </ul>
          <div className="divider" />
          <h3>Что не уходит никуда</h3>
          <ul className="privacy-list off">
            <li>
              <ShieldCheck size={16} aria-hidden /> Текст исповеди, причины и заметки срывов
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden /> Замеры, вес, ответы недельных обзоров
            </li>
          </ul>
          <p className="tiny muted">Синхронизация хранит полную копию данных в облаке, но доступ к ней есть только у тебя.</p>
        </section>
      </div>
    </div>
  )
}

// ---------- no party yet ----------

function PartySetup({ initialCode }: { initialCode?: string }) {
  const account = useSocial((s) => s.account)!
  const myOutfit = useUserOutfit(account.id)
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
      <PageHead
        kicker="Пати"
        title="Собери команду"
        sub={
          <>
            Ты вошёл как <b style={{ color: 'var(--ink)' }}>{account.display_name}</b> <span className="num">@{account.nick}</span>
          </>
        }
      />
      <PartyScene me={myOutfit} />
      <div className="cols">
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void run('join')
          }}
        >
          <div className="setup-head">
            <span className="q-icon">
              <Px name="lock" size={28} />
            </span>
            <div className="grow">
              <h2>Вступить по коду</h2>
              <p className="tiny muted">Код даст друг, который создал пати</p>
            </div>
          </div>
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
          <div className="setup-head">
            <span className="q-icon">
              <Px name="campfire" size={28} />
            </span>
            <div className="grow">
              <h2>Создать пати</h2>
              <p className="tiny muted">До 8 человек, код — в мессенджер</p>
            </div>
          </div>
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
  useDuelReconcile(members, me.id)

  return (
    <>
      <div className="party-head">
        <div className="grow">
          <div className="chapter-name">
            Пати · {members.length} из 8
          </div>
          <h1 style={{ marginTop: 4 }}>{party.name}</h1>
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
              <HeroAva userId={n.from_user} size={36} />
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
              <MemberCard key={m.id} m={m} isMe={m.id === me.id} owner={party.owner === m.id} onNudge={() => setNudgeTo(m)} meId={me.id} members={members} />
            ))}
            {members.length === 0 && <div className="empty">Загружаю участников…</div>}
          </div>
          <CodeCard party={party} isOwner={party.owner === me.id} />
        </section>
        <section className="stack">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>Лента</h2>
          </div>
          <Feed events={feed} members={members} meId={me.id} party={party} />
          <div className="party-actions">
            <button className="btn sm ghost" onClick={() => setShowJoin(true)}>
              Ещё одна пати
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

/** Share the invite (system sheet) or copy it */
function useInvite(party: PartyT) {
  const say = useUi((s) => s.say)
  const link = `${window.location.origin}${window.location.pathname}#/party?code=${party.code}`
  const text = `Вступай в мою пати «${party.name}» в Winter Arc. Код: ${party.code}`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const copy = (what: string, ok: string) =>
    navigator.clipboard?.writeText(what).then(
      () => say(ok),
      () => say('Скопируй код вручную'),
    ) ?? say('Скопируй код вручную')
  return {
    canShare,
    copyCode: () => copy(party.code, 'Код скопирован'),
    share: () => (canShare ? navigator.share({ title: 'Winter Arc', text, url: link }).catch(() => undefined) : copy(`${text}\n${link}`, 'Приглашение скопировано')),
  }
}

function CodeCard({ party, isOwner }: { party: PartyT; isOwner: boolean }) {
  const say = useUi((s) => s.say)
  const ask = useUi((s) => s.confirm)
  const inv = useInvite(party)
  return (
    <section className="panel code-card" aria-label="Код приглашения">
      <div className="code-head">
        <div className="grow">
          <div className="chapter-name">Код приглашения</div>
          <div className="party-code num">{party.code}</div>
        </div>
        {isOwner && (
          <button
            className="link-btn small"
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
      <div className={`code-actions ${inv.canShare ? '' : 'one'}`}>
        <button className={`btn sm ${inv.canShare ? '' : 'primary'}`} onClick={inv.copyCode}>
          <Copy size={16} aria-hidden /> Копировать
        </button>
        {inv.canShare && (
          <button className="btn sm primary" onClick={inv.share}>
            <Share2 size={16} aria-hidden /> Поделиться
          </button>
        )}
      </div>
    </section>
  )
}

// ---------- member ----------

function MemberCard({ m, isMe, owner, onNudge, meId, members }: { m: Member; isMe: boolean; owner: boolean; onNudge: () => void; meId: string; members: Member[] }) {
  const today = useToday()
  const outfit = useUserOutfit(m.id)
  const s = m.stats
  const fresh = s?.day === today
  const sent = useSocial((st) => st.sentNudges[m.id])
  const cooling = sent !== undefined && Date.now() - sent < 3600_000
  const lvl = s ? levelOf(s.xp) : undefined
  const hp = s ? (s.warmup ? 100 : s.fallen ? 0 : s.hp) : 0
  const updated = s ? (fresh ? `обновлено ${timeAgo(m.stats_at ?? new Date(s.at).toISOString())}` : 'сегодня ещё не заходил') : 'ещё нет данных'
  return (
    <article className={`member ${isMe ? 'me' : ''} ${s?.fallen && !s.warmup ? 'fallen' : ''}`} aria-label={m.display_name}>
      <div className="member-top">
        <span className="profile-ava member-ava">
          <PixelAvatar outfit={outfit} size={64} title={`Герой ${m.display_name}`} />
        </span>
        <div className="meters">
          <div className="member-name">
            <span className="member-nick">{m.display_name}</span>
            {isMe && <span className="tag">ты</span>}
            {owner && <Crown size={15} color="var(--gold-mark)" aria-label="создатель пати" />}
          </div>
          {s && lvl ? (
            <>
              <div className="member-badges">
                <span className="lvl-badge">УР {s.level}</span>
                <span className="streak-chip" title="Дни подряд с исповедью" aria-label={`Честность: ${s.honesty} ${plural(s.honesty, 'день', 'дня', 'дней')} подряд`}>
                  <Px name="flame" size={16} /> честность {s.honesty}
                </span>
              </div>
              <span className="meter">
                <Px name="heart" size={18} />
                <HpBar hp={hp} />
                {s.warmup ? <span className="tag warm">разминка</span> : <span className="num hp-v">{s.fallen ? 'падение' : `${hp}/100`}</span>}
              </span>
              <span className="meter">
                <Px name="star" size={18} />
                <Bar value={lvl.progress} label="Опыт до следующего уровня" />
                <span className="num">
                  {lvl.into}/{lvl.span}
                </span>
              </span>
            </>
          ) : (
            <span className="tiny muted">Герой ещё не прислал статы</span>
          )}
        </div>
      </div>

      {s && <MemberDay s={s} fresh={fresh} />}

      {s?.boss && !s.warmup && <MemberBoss boss={s.boss} />}

      {!isMe && <DuelArea friend={m} meId={meId} members={members} />}

      <div className="member-foot">
        <span className="tiny muted grow">{updated}</span>
        {!isMe && (
          <button className="btn sm" onClick={onNudge} disabled={cooling} aria-label={`Пнуть ${m.display_name}`}>
            <Hand size={16} aria-hidden /> {cooling ? 'Пнул, жди час' : 'Пнуть'}
          </button>
        )}
      </div>
    </article>
  )
}

function MemberDay({ s, fresh }: { s: PublicStats; fresh: boolean }) {
  const bulbs = s.bulbs.split('')
  const lit = fresh ? bulbs.filter((c) => c === 'M' || c === 'S').length : 0
  if (!bulbs.length && !s.mains.length) return null
  return (
    <div className="member-day">
      <div className="member-day-head">
        <Px name="quests" size={18} />
        <span className="grow">Квесты дня</span>
        {fresh && s.confessed && (
          <span className="tag auto">
            <Check size={11} aria-hidden strokeWidth={4} /> исповедь
          </span>
        )}
        <span className="num">
          {lit}/{bulbs.length}
        </span>
      </div>
      {bulbs.length > 0 && (
        <div className="day-seg" style={{ gridTemplateColumns: `repeat(${bulbs.length}, 1fr)` }} role="img" aria-label={`Закрыто ${lit} из ${bulbs.length}`}>
          {bulbs.map((c, i) => (
            <i key={i} className={`${c === 'M' || c === 'm' ? 'main' : ''} ${fresh && (c === 'M' || c === 'S') ? 'on' : ''}`} />
          ))}
        </div>
      )}
      {s.mains.length > 0 && (
        <ul className="member-mains">
          {s.mains.map((q) => (
            <li key={q.t}>
              <span className="grow">{q.t}</span>
              <span className={`num ${q.n >= 5 ? 'xp-v' : ''}`}>{q.n} из 7</span>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(s.skills) && s.skills.length > 0 && (
        <div className="member-skills" aria-label="Навыки">
          {s.skills.slice(0, 3).map((k) => (
            <span key={k.t} className="member-skill">
              <RankBadge rank={(RANKS as readonly string[]).includes(k.r) ? (k.r as Rank) : 'D'} size="sm" />
              {String(k.t).slice(0, 40)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function MemberBoss({ boss }: { boss: NonNullable<PublicStats['boss']> }) {
  const left = Math.max(0, boss.hp - boss.damage)
  return (
    <div className="member-boss">
      <span className="boss-mini">{boss.won ? <Px name="trophy" size={24} /> : <BossSprite name={boss.name} size={26} />}</span>
      <div className="grow stack" style={{ gap: 5 }}>
        <div className="row between tiny" style={{ gap: 8 }}>
          <span className="boss-name">{boss.name}</span>
          <span className="num muted">{boss.won ? 'повержен' : `${left}/${boss.hp}`}</span>
        </div>
        <div className="boss-bar thin">
          <i className={boss.won ? 'won' : ''} style={{ width: `${boss.hp ? (boss.won ? 100 : (left / boss.hp) * 100) : 0}%` }} />
        </div>
      </div>
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

function FeedEmpty({ party, alone }: { party: PartyT; alone: boolean }) {
  const inv = useInvite(party)
  return (
    <div className="panel feed-empty">
      <div className="feed-empty-art" aria-hidden>
        <Px name="fir" size={40} />
        <Px name="campfire" size={56} />
        <Px name="snowman" size={40} />
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <h3>Пока тихо</h3>
        <p className="small muted">{alone ? 'Позови друзей — поделись кодом. Их дела, идеальные дни и камбэки появятся здесь.' : 'Первое закрытое дело, идеальный день или честный срыв появятся здесь.'}</p>
      </div>
      {alone && (
        <button className="btn primary" onClick={inv.share}>
          <Share2 size={16} aria-hidden /> Позвать друзей
        </button>
      )}
    </div>
  )
}

function Feed({ events, members, meId, party }: { events: FeedEvent[]; members: Member[]; meId: string; party: PartyT }) {
  const reactions = useSocial((s) => s.reactions)
  const say = useUi((s) => s.say)
  const [photo, setPhoto] = useState<string>()

  // a comeback joins its slip: one line «слился → камбэк ✅»
  const comebacks = new Map<string, FeedEvent>()
  for (const e of events) if (e.kind === 'comeback' && typeof e.payload.slip === 'string') comebacks.set(`${e.user_id}|${e.payload.slip}`, e)
  const slipKeys = new Set(events.filter((e) => e.kind === 'slip').map((e) => `${e.user_id}|${e.key}`))
  const shown = events.filter((e) => !(e.kind === 'comeback' && slipKeys.has(`${e.user_id}|${e.payload.slip}`)))

  if (!shown.length) return <FeedEmpty party={party} alone={members.length <= 1} />

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
              <HeroAva userId={e.user_id} size={40} />
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
