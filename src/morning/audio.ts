/**
 * «Утренняя инвестиция»: procedural ambient music and the timer sounds (Web Audio, no files, no licences).
 *
 * Music: slow pads on a calm progression in D (Dmaj9 → Bm9 → Gmaj7♯11 → Asus2), two detuned voices per
 * note, a soft root below, a low-pass whose cutoff drifts on a very slow LFO, a gentle «breath» on the
 * level, rare quiet bell notes from the pentatonic, all through a reverb made from a generated noise
 * impulse. Chords overlap with long attacks and releases, so nothing ever starts abruptly.
 * Chimes duck the music a little. The context is created on the first tap (iOS needs a gesture) and is
 * suspended while the app is in the background; the scheduler runs on the audio clock, so a pause never
 * makes it skip or pile up notes.
 */

const CHORDS: number[][] = [
  [62, 69, 76, 78, 81], // Dmaj9
  [59, 66, 73, 74, 78], // Bm9
  [55, 62, 66, 71, 73], // Gmaj7♯11
  [57, 64, 69, 71, 76], // Asus2
]
const BELLS = [86, 88, 90, 93, 95, 98] // D pentatonic, above the pad
const CHORD_SEC = 14
const ATTACK = 2.5
const RELEASE = 7
const LOOKAHEAD = 2.5

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Graph {
  ctx: BaseAudioContext
  /** pads go here: low-pass, then dry + reverb */
  pad: GainNode
  /** bells: mostly to the reverb */
  bell: GainNode
  /** fades in / out */
  music: GainNode
  /** ducks under the chimes */
  duck: GainNode
  /** timer sounds */
  sfx: GainNode
  reverb: ConvolverNode
}

function impulse(ctx: BaseAudioContext, seconds = 4.5): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  // a fixed seed: the same room on every device
  let seed = 0x2f6a47
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000) * 2 - 1
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = rnd() * (1 - i / len) ** 3
  }
  return buf
}

/** The whole graph on any context (also an OfflineAudioContext, to listen to it in a test page) */
export function buildGraph(ctx: BaseAudioContext, dest: AudioNode): Graph {
  // a limiter at the end: the level is set for phone speakers, the compressor keeps the peaks clean
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.005
  limiter.release.value = 0.25
  limiter.connect(dest)
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(limiter)
  const duck = ctx.createGain()
  duck.connect(master)
  const music = ctx.createGain()
  music.gain.value = 0
  music.connect(duck)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  reverb.connect(wet)
  wet.connect(music)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2200
  filter.Q.value = 0.4
  // the cutoff drifts 1700 … 2700 Hz once every ~25 s
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.04
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 500
  lfo.connect(lfoAmt)
  lfoAmt.connect(filter.frequency)
  lfo.start()

  const pad = ctx.createGain()
  pad.gain.value = 0.9
  // «breath»: ±12% on the pad level, a slower cycle than the filter so they never line up
  const breath = ctx.createOscillator()
  breath.frequency.value = 0.065
  const breathAmt = ctx.createGain()
  breathAmt.gain.value = 0.11
  breath.connect(breathAmt)
  breathAmt.connect(pad.gain)
  breath.start()
  pad.connect(filter)
  const dry = ctx.createGain()
  dry.gain.value = 0.6
  filter.connect(dry)
  dry.connect(music)
  const send = ctx.createGain()
  send.gain.value = 0.7
  filter.connect(send)
  send.connect(reverb)

  const bell = ctx.createGain()
  bell.gain.value = 1
  const bellDry = ctx.createGain()
  bellDry.gain.value = 0.25
  bell.connect(bellDry)
  bellDry.connect(music)
  bell.connect(reverb)

  const sfx = ctx.createGain()
  sfx.gain.value = 1
  sfx.connect(master)
  const sfxWet = ctx.createGain()
  sfxWet.gain.value = 0.35
  sfx.connect(sfxWet)
  // the chime tail rings in the same room, but not through the music fade
  const sfxRoom = ctx.createConvolver()
  sfxRoom.buffer = reverb.buffer
  sfxWet.connect(sfxRoom)
  sfxRoom.connect(master)

  return { ctx, pad, bell, music, duck, sfx, reverb }
}

/** One chord: two detuned voices per note and a soft root an octave down */
export function scheduleChord(g: Graph, notes: number[], t: number) {
  const end = t + CHORD_SEC + RELEASE
  const voice = (freq: number, peak: number, type: OscillatorType, detune: number) => {
    const o = g.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    const v = g.ctx.createGain()
    v.gain.setValueAtTime(0, t)
    v.gain.linearRampToValueAtTime(peak, t + ATTACK)
    v.gain.setValueAtTime(peak, t + CHORD_SEC)
    v.gain.linearRampToValueAtTime(0, end)
    o.connect(v)
    v.connect(g.pad)
    o.start(t)
    o.stop(end + 0.05)
  }
  notes.forEach((n, i) => {
    const peak = 0.13 / (1 + i * 0.3)
    voice(hz(n), peak, 'sine', -6)
    voice(hz(n), peak * 0.55, 'triangle', 7)
  })
  voice(hz(notes[0] - 12), 0.12, 'triangle', 0)
}

function scheduleBell(g: Graph, midi: number, t: number, vol = 0.05) {
  for (const [mult, v, dur] of [
    [1, vol, 3.2],
    [2.0, vol * 0.25, 1.6],
  ] as const) {
    const o = g.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz(midi) * mult
    const e = g.ctx.createGain()
    e.gain.setValueAtTime(0.0001, t)
    e.gain.exponentialRampToValueAtTime(v, t + 0.02)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(e)
    e.connect(g.bell)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

// ---------- the live player ----------

let g: Graph | null = null
let timer: ReturnType<typeof setInterval> | undefined
let playing = false
let nextChord = 0
let chordN = 0
let nextBell = 0
let bellSeed = 7

function ctxOf(): AudioContext | null {
  return (g?.ctx as AudioContext | undefined) ?? null
}

function ensure(): Graph | null {
  try {
    const live = ctxOf()
    if (g && live && live.state !== 'closed') return g
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    const ctx = new AC()
    g = buildGraph(ctx, ctx.destination)
    return g
  } catch {
    g = null
    return null
  }
}

function resumeCtx() {
  const c = ctxOf()
  if (c && c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => {})
}

/** a 0.1 s silent WAV: playing it through an <audio> element moves iOS to the «playback» session */
function silentWav(): string {
  const n = 800
  const b = new Uint8Array(44 + n)
  const v = new DataView(b.buffer)
  const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44)
  let bin = ''
  b.forEach((x) => (bin += String.fromCharCode(x)))
  return 'data:audio/wav;base64,' + btoa(bin)
}

let keepAlive: HTMLAudioElement | null = null

/**
 * iOS plays Web Audio in the «ambient» session, which the silent switch mutes. Declaring a playback
 * session (Safari 16.4+) and looping a silent <audio> (older iOS) make the music play like a video does.
 */
function playbackSession() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch {
    /* not supported */
  }
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWav())
      keepAlive.loop = true
      keepAlive.setAttribute('playsinline', '')
    }
    if (keepAlive.paused) void keepAlive.play().catch(() => {})
  } catch {
    keepAlive = null
  }
}

/** Call from a tap handler: creates / resumes the context (iOS audio unlock) */
export function unlockMorningAudio(): void {
  playbackSession()
  if (ensure()) resumeCtx()
}

function tickScheduler() {
  if (!g || !playing) return
  const now = g.ctx.currentTime
  // after a long stall (should not happen: the context is suspended with the app) restart from now
  if (nextChord < now - 1) nextChord = now + 0.1
  while (nextChord < now + LOOKAHEAD) {
    scheduleChord(g, CHORDS[chordN % CHORDS.length], nextChord)
    chordN++
    nextChord += CHORD_SEC
  }
  if (nextBell < now - 1) nextBell = now + 4
  while (nextBell < now + LOOKAHEAD) {
    bellSeed = (Math.imul(bellSeed, 1103515245) + 12345) >>> 0
    scheduleBell(g, BELLS[bellSeed % BELLS.length], nextBell)
    nextBell += 6 + (bellSeed % 600) / 100
  }
}

function rampMusic(to: number, seconds: number) {
  if (!g) return
  const p = g.music.gain
  const t = g.ctx.currentTime
  p.cancelScheduledValues(t)
  p.setValueAtTime(p.value, t)
  p.linearRampToValueAtTime(to, t + seconds)
}

/** Fade the music in (call from a tap the first time) */
export function startMusic(): void {
  if (!ensure() || !g) return
  resumeCtx()
  if (!playing) {
    playing = true
    const now = g.ctx.currentTime
    nextChord = Math.max(nextChord, now + 0.05)
    nextBell = Math.max(nextBell, now + 5)
    tickScheduler()
    clearInterval(timer)
    timer = setInterval(tickScheduler, 500)
  }
  rampMusic(1, 2)
}

/** Fade out; the notes already playing ring out under the fade */
export function stopMusic(seconds = 1.6): void {
  if (!playing) return
  playing = false
  clearInterval(timer)
  timer = undefined
  rampMusic(0, seconds)
}

export const musicPlaying = () => playing

/** The app went to the background: quiet down, then freeze the audio clock */
export function suspendAudio(): void {
  const c = ctxOf()
  if (!c || c.state !== 'running') return
  rampMusic(0, 0.25)
  setTimeout(() => {
    if (document.visibilityState === 'hidden') void c.suspend().catch(() => {})
  }, 300)
}

/** Back in the foreground: resume and bring the music back if it was on */
export function resumeAudio(): void {
  const c = ctxOf()
  if (!c) return
  resumeCtx()
  if (playing) {
    rampMusic(1, 2.5)
    if (keepAlive?.paused) void keepAlive.play().catch(() => {})
  }
  // iOS may keep the context «interrupted» until the next tap
  if (c.state !== 'running') window.addEventListener('pointerdown', resumeCtx, { once: true, capture: true })
}

/** Close everything when the player is left */
export function releaseAudio(): void {
  stopMusic(0.8)
  keepAlive?.pause()
}

// ---------- timer sounds ----------

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  if (!g) return
  const o = g.ctx.createOscillator()
  const e = g.ctx.createGain()
  o.type = type
  o.frequency.value = freq
  e.gain.setValueAtTime(0.0001, start)
  e.gain.exponentialRampToValueAtTime(vol, start + 0.006)
  e.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(e)
  e.connect(g.sfx)
  o.start(start)
  o.stop(start + dur + 0.05)
}

function duck() {
  if (!g) return
  const p = g.duck.gain
  const t = g.ctx.currentTime
  p.cancelScheduledValues(t)
  p.setValueAtTime(p.value, t)
  p.linearRampToValueAtTime(0.5, t + 0.08)
  p.setValueAtTime(0.5, t + 0.9)
  p.linearRampToValueAtTime(1, t + 2.4)
}

const ready = () => !!g && (g.ctx as AudioContext).state === 'running'

/** 3-2-1: a soft wooden tick, a touch higher on «1» */
export function sfxTick(n: number): void {
  if (!ready()) return
  const t = g!.ctx.currentTime
  const f = n <= 1 ? 1320 : 990
  tone(f, t, 0.07, 0.16)
  tone(f * 2.02, t, 0.03, 0.04, 'triangle')
}

/** The exercise is over: a two-note bell, the music steps aside */
export function sfxChime(): void {
  if (!ready()) return
  duck()
  const t = g!.ctx.currentTime
  tone(hz(74), t, 1.8, 0.26)
  tone(hz(74) * 2.76, t, 0.6, 0.03)
  tone(hz(81), t + 0.14, 2.2, 0.22)
  tone(hz(81) * 2.0, t + 0.14, 0.9, 0.04)
}

/** Prep is over / «Погнали»: a short soft rise */
export function sfxGo(): void {
  if (!ready()) return
  const t = g!.ctx.currentTime
  tone(hz(69), t, 0.18, 0.12, 'triangle')
  tone(hz(76), t + 0.09, 0.3, 0.14)
}

/** Program finished: a slow D major arpeggio */
export function sfxFinish(): void {
  if (!ready()) return
  duck()
  const t = g!.ctx.currentTime
  ;[62, 66, 69, 74, 78].forEach((m, i) => tone(hz(m), t + i * 0.13, 2.4 - i * 0.2, 0.2 - i * 0.015))
  tone(hz(50), t, 2.6, 0.14)
}
