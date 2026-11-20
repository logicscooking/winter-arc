/**
 * Plinko juice: synthesized sounds (Web Audio, no files) and haptics.
 * The AudioContext is created on the throw tap (iOS needs a user gesture). Volume stays moderate:
 * the silent switch cannot be detected from the web.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null

/** Call from the tap handler before the ball falls */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.32
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; vol?: number; slideTo?: number } = {}) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = opts.type ?? 'sine'
  o.frequency.setValueAtTime(freq, start)
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur)
  const v = opts.vol ?? 0.5
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(v, start + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g)
  g.connect(master)
  o.start(start)
  o.stop(start + dur + 0.02)
}

/** Peg click: short glassy tick, a little higher with every row, louder on a harder hit (0..1) */
export function sfxPeg(row: number, rows: number, force = 0.7): void {
  if (!ctx) return
  const t = ctx.currentTime
  const f = 900 + (row / Math.max(1, rows)) * 700 + Math.random() * 60
  const k = 0.35 + 0.65 * Math.max(0, Math.min(1, force))
  tone(f, t, 0.05 + 0.02 * k, { type: 'triangle', vol: 0.32 * k })
  tone(f * 2.01, t, 0.03, { type: 'sine', vol: 0.12 * k })
}

/** Santa's «хо-хо»: two low hums with a vowel-ish overtone, then a tiny sleigh bell */
export function sfxHoHo(): void {
  if (!ctx) return
  const t = ctx.currentTime
  for (const [dt, f] of [
    [0, 150],
    [0.22, 135],
  ]) {
    tone(f, t + dt, 0.18, { type: 'sawtooth', vol: 0.08, slideTo: f * 0.85 })
    tone(f * 2, t + dt, 0.16, { type: 'sine', vol: 0.22, slideTo: f * 1.7 })
    tone(f * 4.1, t + dt, 0.1, { type: 'sine', vol: 0.05 })
  }
  sfxBell(0.48)
}

/** Sleigh bell: a few bright detuned pings */
export function sfxBell(delay = 0): void {
  if (!ctx) return
  const t = ctx.currentTime + delay
  for (let i = 0; i < 3; i++) {
    const f = 2350 + i * 170 + Math.random() * 80
    tone(f, t + i * 0.045, 0.22, { type: 'sine', vol: 0.12 })
    tone(f * 1.5, t + i * 0.045, 0.12, { type: 'triangle', vol: 0.05 })
  }
}

/** Santa dozes off: a soft falling yawn */
export function sfxYawn(): void {
  if (!ctx) return
  const t = ctx.currentTime
  tone(330, t, 0.7, { type: 'sine', vol: 0.12, slideTo: 170 })
}

/** Slot chime: richer the further from the centre (tier 1..5) */
export function sfxSlot(tier: number): void {
  if (!ctx) return
  const t = ctx.currentTime
  // C major-ish arpeggio, more notes for higher tiers
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
  const count = Math.min(notes.length, 1 + tier)
  for (let i = 0; i < count; i++) tone(notes[i], t + i * 0.055, 0.5 - i * 0.03, { type: i % 2 ? 'triangle' : 'sine', vol: 0.34 })
  tone(notes[0] / 2, t, 0.35, { type: 'sine', vol: 0.2 })
}

/** Jackpot fanfare on the edge slots */
export function sfxJackpot(): void {
  if (!ctx) return
  const t = ctx.currentTime + 0.25
  const seq: [number, number, number][] = [
    [523.25, 0, 0.14],
    [659.25, 0.12, 0.14],
    [783.99, 0.24, 0.14],
    [1046.5, 0.36, 0.5],
  ]
  for (const [f, dt, d] of seq) {
    tone(f, t + dt, d, { type: 'square', vol: 0.12 })
    tone(f, t + dt, d, { type: 'triangle', vol: 0.3 })
  }
  for (let i = 0; i < 6; i++) tone(2093 + i * 180, t + 0.4 + i * 0.05, 0.25, { type: 'sine', vol: 0.12 })
}

/** «Сделал»: a coin-like rising blip */
export function sfxDone(): void {
  if (!ctx) return
  const t = ctx.currentTime
  tone(880, t, 0.09, { type: 'square', vol: 0.1 })
  tone(1318.5, t + 0.08, 0.28, { type: 'triangle', vol: 0.3 })
}

// ---------- haptics ----------

let iosSwitch: HTMLLabelElement | null = null

/** iOS 18+ Safari has no navigator.vibrate, but toggling a native <input switch> gives a light tap */
function iosTap() {
  try {
    if (!iosSwitch) {
      const label = document.createElement('label')
      label.setAttribute('aria-hidden', 'true')
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.tabIndex = -1
      label.appendChild(input)
      document.body.appendChild(label)
      iosSwitch = label
    }
    iosSwitch.click()
  } catch {
    /* no haptics */
  }
}

/** Light tap on a peg or a stronger pattern on landing; falls back to the iOS switch trick */
export function buzz(pattern: number | number[] = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
      return
    }
  } catch {
    /* fall through */
  }
  const taps = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1
  for (let i = 0; i < taps; i++) setTimeout(iosTap, i * 90)
}
