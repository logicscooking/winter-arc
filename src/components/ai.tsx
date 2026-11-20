import { useEffect, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { AI_LIMIT, usedToday } from '../ai/client'
import type { AiState } from '../ai/useAi'
import { useStore } from '../store/store'
import { useUi } from '../store/ui'
import { Sheet } from './ui'

/** «ИИ думает… 12 с» / error with «Ещё раз» */
export function AiStatus<T>({ st, onRetry, onCancel }: { st: AiState<T>; onRetry: () => void; onCancel: () => void }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (st.phase !== 'loading') return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [st.phase])
  if (st.phase === 'loading')
    return (
      <div className="ai-status" role="status" aria-live="polite">
        <span className="ai-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="grow">ИИ думает… {Math.floor((Date.now() - st.since) / 1000)} с</span>
        <button className="link-btn" onClick={onCancel}>
          Отмена
        </button>
      </div>
    )
  if (st.phase === 'error')
    return (
      <div className="ai-status err-box" role="alert">
        <span className="grow">{st.text}</span>
        <button className="link-btn" onClick={onRetry}>
          Ещё раз
        </button>
        <button className="link-btn" onClick={onCancel}>
          Закрыть
        </button>
      </div>
    )
  return null
}

/** Preview card with «Применить» / «Отмена» */
export function AiPreview({ title, children, onApply, onCancel, applyLabel = 'Применить', ms, disabled }: { title: string; children: ReactNode; onApply?: () => void; onCancel: () => void; applyLabel?: string; ms?: number; disabled?: boolean }) {
  return (
    <section className="ai-preview" aria-label={title}>
      <div className="ai-preview-head">
        <Sparkles size={16} aria-hidden />
        <b className="grow">{title}</b>
        {ms !== undefined && <span className="tiny muted num">{(ms / 1000).toFixed(1)} с</span>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {children}
      </div>
      <p className="tiny muted">Это черновик от бесплатного ИИ. Проверь и поправь под себя.</p>
      <div className={onApply ? 'grid-2' : ''}>
        <button className="btn ghost" onClick={onCancel}>
          Отмена
        </button>
        {onApply && (
          <button className="btn primary" onClick={onApply} disabled={disabled}>
            {applyLabel}
          </button>
        )}
      </div>
    </section>
  )
}

export function AiButton({ children, onClick, disabled, block }: { children: ReactNode; onClick: () => void; disabled?: boolean; block?: boolean }) {
  return (
    <button className={`btn sm ai-btn ${block ? 'block' : ''}`} onClick={onClick} disabled={disabled}>
      <Sparkles size={15} aria-hidden /> {children}
    </button>
  )
}

export const AI_CONSENT =
  'ИИ-помощник бесплатный и работает без ключа через сторонний сервис Pollinations. По кнопке туда уходит только то, что нужно для ответа: название навыка, характеристики, узлы, цели, «Кайф» при проверке навыка и голые числа недели для разбора. Ник, id, исповеди, срывы, замеры, заметки и отзывы к практикам не уходят никогда. Ответ — черновик: ты видишь его до применения и можешь отменить. Бесплатный ИИ отвечает не чаще раза в 45 секунд, до 30 запросов в день.'

/** Settings block: off by default, turning on goes through the consent screen */
export function AiSettings() {
  const ai = useStore((s) => s.data.settings.ai)
  const use = useStore((s) => s.data.settings.aiUse)
  const setSettings = useStore((s) => s.setSettings)
  const say = useUi((s) => s.say)
  const [consent, setConsent] = useState(false)
  const on = !!ai?.on
  return (
    <section className="panel stack" aria-label="ИИ-помощник">
      <div className="switch-row">
        <span>
          <span style={{ fontWeight: 700 }}>ИИ-помощник</span>
          <span className="tiny muted" style={{ display: 'block' }}>
            {on ? `Сегодня ${usedToday(use, Date.now())}/${AI_LIMIT.perDay} запросов. Бесплатно, без ключа` : 'Проверит навык, соберёт дерево, разобьёт цель. Выключен'}
          </span>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={on}
          aria-label="ИИ-помощник"
          onClick={() => {
            if (on) {
              setSettings({ ai: { on: false, ...(ai?.consentAt ? { consentAt: ai.consentAt } : {}) } })
              say('ИИ-помощник выключен')
            } else setConsent(true)
          }}
        />
      </div>
      {consent && (
        <Sheet title="Включить ИИ-помощник?" onClose={() => setConsent(false)}>
          <div className="stack-lg">
            <p className="small" style={{ color: 'var(--ink-2)' }}>
              {AI_CONSENT}
            </p>
            <div className="grid-2">
              <button className="btn ghost" onClick={() => setConsent(false)}>
                Не сейчас
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setSettings({ ai: { on: true, consentAt: Date.now() } })
                  setConsent(false)
                  say('ИИ-помощник включён')
                }}
              >
                Включить
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  )
}
