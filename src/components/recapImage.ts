/**
 * «Итог недели» as one tall PNG for the Telegram group: the same content as the slides, drawn on a
 * canvas in the current theme's colours. No libraries.
 */
import { goalAmount, goalsTally, numbersLines, weekLabel } from '../engine'
import type { PubGoal, RecapView } from '../engine'

const W = 1080
const PAD = 64
const INNER = W - PAD * 2

interface Palette {
  bg: string
  surface: string
  surface2: string
  line: string
  ink: string
  ink2: string
  mist: string
  pine: string
  gold: string
  hp: string
  frost: string
  display: string
  text: string
}

function palette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d
  return {
    bg: v('--bg', '#0f1d17'),
    surface: v('--surface', '#1a2e25'),
    surface2: v('--surface-2', '#223a2f'),
    line: v('--line', '#34503f'),
    ink: v('--ink', '#f1f5ee'),
    ink2: v('--ink-2', '#c6d6cb'),
    mist: v('--mist', '#97b4a4'),
    pine: v('--pine', '#43d57a'),
    gold: v('--gold-mark', '#f2b84b'),
    hp: v('--hp', '#ff6474'),
    frost: v('--frost', '#8fd3ff'),
    display: 'Rubik, Nunito, system-ui, sans-serif',
    text: 'Nunito, system-ui, sans-serif',
  }
}

type Op = (c: CanvasRenderingContext2D, y: number) => void
interface Block {
  h: number
  draw: Op
}

function wrap(c: CanvasRenderingContext2D, text: string, font: string, width: number): string[] {
  c.font = font
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (c.measureText(next).width <= width) line = next
      else {
        if (line) out.push(line)
        // a single word longer than the line is cut by characters
        let w = word
        while (c.measureText(w).width > width && w.length > 1) {
          let i = w.length
          while (i > 1 && c.measureText(w.slice(0, i)).width > width) i--
          out.push(w.slice(0, i))
          w = w.slice(i)
        }
        line = w
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : ['']
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.roundRect(x, y, w, h, r)
}

/** Draws the deck and returns the PNG */
export async function renderRecapPng(v: RecapView): Promise<Blob> {
  try {
    await document.fonts?.ready
  } catch {
    /* fonts are a nicety */
  }
  const p = palette()
  const canvas = document.createElement('canvas')
  const m = canvas.getContext('2d')!
  const f = {
    kicker: `800 30px ${p.display}`,
    title: `900 64px ${p.display}`,
    h: `800 40px ${p.display}`,
    big: `900 120px ${p.display}`,
    body: `700 34px ${p.text}`,
    bodyB: `900 34px ${p.text}`,
    small: `700 28px ${p.text}`,
  }
  const blocks: Block[] = []
  const text = (s: string, font: string, color: string, width = INNER, lh = 46, x = PAD): Block => {
    const lines = wrap(m, s, font, width)
    return {
      h: lines.length * lh,
      draw: (c, y) => {
        c.font = font
        c.fillStyle = color
        lines.forEach((l, i) => c.fillText(l, x, y + i * lh + lh * 0.75))
      },
    }
  }
  const gap = (h: number): Block => ({ h, draw: () => undefined })
  /** a rounded card around inner blocks */
  const card = (inner: Block[], accent?: string): Block => {
    const h = inner.reduce((s, b) => s + b.h, 0) + 72
    return {
      h,
      draw: (c, y) => {
        roundRect(c, PAD - 24, y, INNER + 48, h, 36)
        c.fillStyle = p.surface
        c.fill()
        c.lineWidth = 4
        c.strokeStyle = accent ?? p.line
        c.stroke()
        let yy = y + 36
        for (const b of inner) {
          b.draw(c, yy)
          yy += b.h
        }
      },
    }
  }
  const head = (s: string, color = p.ink) => text(s, f.h, color, INNER - 16, 56, PAD + 8)

  // header
  blocks.push(text('WINTER ARC · ИТОГ НЕДЕЛИ', f.kicker, p.gold, INNER, 40))
  blocks.push(gap(8))
  blocks.push(text(weekLabel(v.week), f.title, p.ink, INNER, 76))
  if (v.name) blocks.push(text(v.name, f.body, p.mist))
  blocks.push(gap(36))

  if (v.ai) {
    blocks.push(card([head('Вывод', p.frost), gap(6), text(v.ai, f.body, p.ink2, INNER - 16, 46, PAD + 8)], p.frost))
    blocks.push(gap(28))
  }

  // goals
  const t = goalsTally(v.goals.map((g) => ({ done: !!g.d, target: g.n, progress: g.p })))
  const goalRows: Block[] = [head(v.goals.length ? `Цели · ${t.done} из ${t.total}` : 'Цели · не ставил'), gap(10)]
  for (const g of v.goals) goalRows.push(goalRow(m, g, p, f))
  blocks.push(card(goalRows))
  blocks.push(gap(28))

  // numbers
  if (v.num) {
    const n = v.num
    const lines = numbersLines(n).slice(1)
    blocks.push(
      card([
        head('Цифры недели'),
        {
          h: 150,
          draw: (c, y) => {
            c.font = f.big
            c.fillStyle = p.pine
            c.fillText(`${n.pct}%`, PAD + 8, y + 118)
            const w = c.measureText(`${n.pct}%`).width
            c.font = f.body
            c.fillStyle = p.ink2
            c.fillText('дни выполнены', PAD + 36 + w, y + 72)
            c.fillStyle = p.mist
            c.fillText(n.perfect ? `идеальных ${n.perfect} · за ${n.days} дн` : `за ${n.days} дн`, PAD + 36 + w, y + 116)
          },
        },
        gap(8),
        ...lines.map((l) => text(l, f.body, p.ink2, INNER - 16, 48, PAD + 8)),
      ]),
    )
    blocks.push(gap(28))
  }

  if (v.insights.length) {
    blocks.push(card([head('Лучшие инсайты', p.gold), gap(6), ...v.insights.flatMap((s, i) => [text(`${i + 1}. ${s}`, f.body, p.ink, INNER - 16, 46, PAD + 8), gap(12)])]))
    blocks.push(gap(28))
  }
  if (v.fails.length) {
    blocks.push(
      card([
        head('Провал и почему', p.hp),
        gap(6),
        ...v.fails.flatMap((x) => [text(x.what || 'Провал', f.bodyB, p.ink, INNER - 16, 46, PAD + 8), ...(x.why ? [text(`→ ${x.why}`, f.body, p.ink2, INNER - 40, 46, PAD + 32)] : []), gap(14)]),
      ]),
    )
    blocks.push(gap(28))
  }
  if (v.next.length) {
    blocks.push(card([head('План на следующую неделю', p.pine), gap(6), ...v.next.map((x) => text(`•  ${x.title}${x.target ? ` — ${goalAmount(x.target, x.unit)}` : ''}`, f.body, p.ink, INNER - 16, 50, PAD + 8))]))
    blocks.push(gap(28))
  }
  blocks.push(text('winter arc · 98 дней зимы', f.small, p.mist))

  const height = PAD + blocks.reduce((s, b) => s + b.h, 0) + PAD
  canvas.width = W
  canvas.height = Math.min(16000, Math.ceil(height))
  const c = canvas.getContext('2d')!
  c.fillStyle = p.bg
  c.fillRect(0, 0, W, canvas.height)
  let y = PAD
  for (const b of blocks) {
    b.draw(c, y)
    y += b.h
  }
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Не получилось нарисовать картинку'))), 'image/png'))
}

function goalRow(m: CanvasRenderingContext2D, g: PubGoal, p: Palette, f: Record<string, string>): Block {
  m.font = f.bodyB
  const amountW = g.n ? Math.min(INNER * 0.45, m.measureText(`${g.p ?? 0}/${goalAmount(g.n, g.u)}`).width + 24) : 0
  const titleW = INNER - 100 - amountW
  const lines = wrap(m, g.t, f.body, titleW)
  const lh = 44
  const h = Math.max(64, lines.length * lh + 20) + (g.n ? 22 : 0)
  return {
    h,
    draw: (c, y) => {
      const cx = PAD + 30
      const cy = y + 30
      c.beginPath()
      c.arc(cx, cy, 22, 0, Math.PI * 2)
      if (g.d) {
        c.fillStyle = p.pine
        c.fill()
        c.strokeStyle = p.bg
        c.lineWidth = 6
        c.beginPath()
        c.moveTo(cx - 10, cy)
        c.lineTo(cx - 2, cy + 8)
        c.lineTo(cx + 11, cy - 8)
        c.stroke()
      } else if (g.p) {
        c.strokeStyle = p.gold
        c.lineWidth = 5
        c.stroke()
        c.beginPath()
        c.moveTo(cx, cy)
        c.arc(cx, cy, 22, -Math.PI / 2, Math.PI / 2)
        c.fillStyle = p.gold
        c.fill()
      } else {
        c.strokeStyle = p.mist
        c.lineWidth = 5
        c.stroke()
        c.beginPath()
        c.moveTo(cx - 8, cy - 8)
        c.lineTo(cx + 8, cy + 8)
        c.moveTo(cx + 8, cy - 8)
        c.lineTo(cx - 8, cy + 8)
        c.stroke()
      }
      c.font = f.body
      c.fillStyle = g.d ? p.ink : g.p ? p.ink : p.ink2
      lines.forEach((l, i) => c.fillText(l, PAD + 76, y + 18 + i * lh + lh * 0.55))
      if (g.n) {
        c.font = f.bodyB
        c.fillStyle = g.d ? p.pine : g.p ? p.gold : p.mist
        const s = `${g.p ?? 0}/${goalAmount(g.n, g.u)}`
        c.textAlign = 'right'
        c.fillText(s.length > 24 ? s.slice(0, 24) + '…' : s, PAD + INNER - 8, y + 44)
        c.textAlign = 'left'
        const bw = INNER - 84
        const by = y + h - 26
        roundRect(c, PAD + 76, by, bw, 10, 5)
        c.fillStyle = p.surface2
        c.fill()
        const fill = bw * (g.d ? 1 : Math.min(1, (g.p ?? 0) / g.n))
        if (fill > 0) {
          roundRect(c, PAD + 76, by, Math.max(10, fill), 10, 5)
          c.fillStyle = g.d ? p.pine : p.gold
          c.fill()
        }
      }
    },
  }
}
