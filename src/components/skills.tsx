import { useMemo, useState } from 'react'
import {
  CHAPTERS,
  FLOW,
  LEVEL_AT,
  PRACTICE_LIMIT,
  PRACTICE_XP,
  RANK_COLOR,
  STAGE_NAMES,
  THEME_MULT,
  activeSkills,
  chapterOf,
  frozenDays,
  gameDayOf,
  liveFlow,
  practiceImpact,
  practicesToday,
  setupDue,
  skillView,
  statName,
  themeOf,
} from '../engine'
import type { ChapterId, Rank, Skill, SkillView, StatId, Trend } from '../engine'
import { Px, STAT_SPRITE } from '../pixel/Pixel'
import type { SpriteName } from '../pixel/sprites'
import { SPRITES } from '../pixel/sprites'
import { useStore } from '../store/store'
import { go, nowWithOffset, refreshClock, reward, useFx, useGame, useNow } from '../store/hooks'
import { useUi } from '../store/ui'
import { Bar, Sheet, formatMMSS } from './ui'

export function skillSprite(s: Pick<Skill, 'icon' | 'stat'>): SpriteName {
  return s.icon && s.icon in SPRITES ? (s.icon as SpriteName) : STAT_SPRITE[s.stat]
}

export const SKILL_ICONS: SpriteName[] = ['run', 'dumbbell', 'speech', 'coin', 'code', 'pen', 'mic', 'book', 'brain', 'hammer', 'bolt', 'shield', 'star', 'fir']

export function RankBadge({ rank, size = 'md', dim }: { rank: Rank; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  return (
    <span className={`rank-badge ${size} ${dim ? 'dim' : ''}`} style={{ ['--rk' as string]: RANK_COLOR[rank] }} aria-label={`Ранг ${rank}`}>
      {rank}
    </span>
  )
}

/** 4 pixel pips: знакомство · практика · уверенно · мастер */
export function StagePips({ stage, potential }: { stage: number; potential?: number }) {
  return (
    <span className="pips" aria-label={`Ступень: ${STAGE_NAMES[stage]}`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= stage ? 'on' : potential !== undefined && i <= potential ? 'wait' : ''} />
      ))}
    </span>
  )
}

export function useSkillView(id: string | undefined): SkillView | null {
  const data = useStore((s) => s.data)
  const game = useGame()
  return useMemo(() => (id ? skillView(data, id, game.today, frozenDays(game)) : null), [data, game, id])
}

export function levelProgress(points: number, level: number): number {
  const lo = LEVEL_AT[level - 1] ?? 0
  const hi = LEVEL_AT[level]
  if (hi === undefined) return 1
  return (points - lo) / (hi - lo)
}

export function Strikes({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="strike-chip" title="Пропущенная неделя повторяющейся цели. 3 страйка — ранг вниз, 14 чистых дней снимают страйк">
      страйки {n}/3
    </span>
  )
}

/** multipliers a practice would get right now */
export function practiceMult(skillId: string): { flow: boolean; theme: boolean } {
  const d = useStore.getState().data
  const now = nowWithOffset()
  const f = liveFlow(d, now)
  return { flow: !!f, theme: themeOf(d, chapterOf(gameDayOf(now))) === skillId }
}

// ---------- practice sheet ----------

export function PracticeSheet({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const addPractice = useStore((s) => s.addPractice)
  const say = useUi((s) => s.say)
  const game = useGame()
  const now = useNow()
  const node = data.nodes?.find((n) => n.id === nodeId)
  const skill = data.skills?.find((s) => s.id === node?.skillId)
  const trait = data.traits?.find((t) => t.id === node?.traitId)
  const [note, setNote] = useState('')
  const [trend, setTrend] = useState<Trend | undefined>()
  if (!node || !skill) return null
  const used = practicesToday(data, node.id, gameDayOf(now))
  const full = note.trim().length >= 3
  const m = practiceMult(skill.id)
  const xp = Math.round((full ? PRACTICE_XP.full : PRACTICE_XP.half) * (m.flow ? FLOW.mult : 1) * (m.theme ? THEME_MULT : 1))

  const save = (el: Element) => {
    const t = nowWithOffset()
    const id = addPractice(node.id, note, trend, t)
    if (!id) {
      say(`Лимит: ${PRACTICE_LIMIT} практики на узел в день`)
      return
    }
    const imp = practiceImpact(useStore.getState().data, id)
    reward(el, { xp })
    useFx.getState().showPop({ title: node.title, stat: skill.stat, fromXp: game.xpByStat[skill.stat], xp, shards: 0, crit: false, impact: imp?.text, flow: m.flow, theme: m.theme })
    onClose()
  }

  return (
    <Sheet title="Практика" onClose={onClose}>
      <div className="stack-lg">
        <div className="row" style={{ gap: 10 }}>
          <Px name={skillSprite(skill)} size={34} />
          <div className="grow">
            <div style={{ fontWeight: 900 }}>{node.title}</div>
            <div className="tiny muted">
              {skill.title} → {trait?.title}
            </div>
          </div>
        </div>
        {node.how && <p className="small card-calm">Как качать: {node.how}</p>}
        <div className="field">
          <span>Как прошло</span>
          <div className="seg-switch" role="group" aria-label="Как прошло">
            {(
              [
                ['better', 'лучше'],
                ['same', 'так же'],
                ['worse', 'хуже'],
              ] as [Trend, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={trend === k} onClick={() => setTrend(trend === k ? undefined : k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Одна строка обратной связи</span>
          <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Что получилось лучше / что сломалось" autoFocus />
        </label>
        {!full && <p className="tiny muted">Без строки засчитается половина XP, и ступень узла не растёт, пока отзыв меньше чем у половины практик.</p>}
        <button className="btn primary block" disabled={used >= PRACTICE_LIMIT} onClick={(e) => save(e.currentTarget)}>
          {used >= PRACTICE_LIMIT ? `Лимит ${PRACTICE_LIMIT} в день на узел` : full ? `Записать практику +${xp} XP` : `Записать без отзыва · +${xp} XP`}
        </button>
        <p className="tiny muted center">
          {used}/{PRACTICE_LIMIT} сегодня{m.flow ? ' · поток ×2' : ''}
          {m.theme ? ' · тема сезона ×1,5' : ''}
        </p>
      </div>
    </Sheet>
  )
}

// ---------- season theme + «завязка» ----------

export function ThemeCard({ compact }: { compact?: boolean }) {
  const data = useStore((s) => s.data)
  const setTheme = useStore((s) => s.setTheme)
  const today = gameDayOf(useNow())
  const ch = chapterOf(today)
  const due = setupDue(today)
  const skills = activeSkills(data)
  const cur = themeOf(data, ch)
  const curSkill = data.skills?.find((s) => s.id === cur)
  const [pick, setPick] = useState(false)

  const chooser = (chapter: ChapterId, selected?: string) => (
    <div className="chips" role="group" aria-label="Навык-тема">
      {skills.map((s) => (
        <button key={s.id} className="chip" aria-pressed={selected === s.id} onClick={() => (setTheme(chapter, selected === s.id ? null : s.id), setPick(false))}>
          {s.title}
        </button>
      ))}
    </div>
  )

  if (due && !themeOf(data, due.next) && skills.length) {
    const next = CHAPTERS[due.next]
    return (
      <section className="panel stack setup-card">
        <div className="row" style={{ gap: 10 }}>
          <Px name="owl" size={30} />
          <div className="grow">
            <span className="tiny muted">Завязка · {due.daysLeft === 0 ? 'глава кончается сегодня' : `до конца главы ${due.daysLeft} дн.`}</span>
            <h3>
              Глава {next.roman}: «{next.name}»
            </h3>
          </div>
        </div>
        <p className="small">
          Босс главы — <b>{due.boss}</b>. Выбери навык-тему заранее: его практики дадут ×1,5 XP всю главу.
        </p>
        {chooser(due.next)}
      </section>
    )
  }
  if (compact) return null
  if (!skills.length && !curSkill) return null
  return (
    <section className="panel tight stack theme-card">
      <div className="row between">
        <span className="row" style={{ gap: 8 }}>
          <Px name="star" size={22} />
          <span>
            <span className="tiny muted">Тема сезона · {CHAPTERS[ch].name}</span>
            <b style={{ display: 'block' }}>{curSkill ? `${curSkill.title} · ×1,5 XP` : 'не выбрана'}</b>
          </span>
        </span>
        <button className="link-btn" onClick={() => setPick(!pick)}>
          {curSkill ? 'Сменить' : 'Выбрать'}
        </button>
      </div>
      {(pick || (!curSkill && skills.length > 0)) && chooser(ch, cur)}
    </section>
  )
}

// ---------- flow ----------

export function FlowChip() {
  const data = useStore((s) => s.data)
  const now = useNow()
  const f = liveFlow(data, now)
  if (!f) return null
  const cap = Math.min(f.minutes ?? FLOW.maxMin, FLOW.maxMin) * 60_000
  const skill = data.skills?.find((s) => s.id === f.skillId)
  return (
    <a className="flow-chip" href="#/flow">
      <Px name="play" size={22} />
      <span className="grow">
        Поток идёт{skill ? `: ${skill.title}` : ''}
        <small>×2 XP · осталось {formatMMSS(f.startedAt + cap - now.getTime())}</small>
      </span>
    </a>
  )
}

export function startFlowAndGo(minutes?: number, skillId?: string) {
  const r = useStore.getState().startFlow(nowWithOffset(), minutes, skillId)
  if (!r.ok) {
    useUi.getState().say(r.reason)
    return
  }
  refreshClock()
  go('/flow')
}

export function StatChip({ stat }: { stat: StatId }) {
  return (
    <span className="stat-chip">
      <Px name={STAT_SPRITE[stat]} size={14} /> {statName(stat)}
    </span>
  )
}

export function SkillLevelBar({ view }: { view: SkillView }) {
  return <Bar value={levelProgress(view.points, view.level)} label={`${view.skill.title}: до уровня ${view.level + 1}`} />
}
