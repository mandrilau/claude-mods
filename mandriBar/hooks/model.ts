// Settings, presets, progress, tool kinds and levels: the rules the drawing and
// the hooks share. Nothing here touches the engine.

import type { Activity, BarSettings, CrabPlace, Motion, Outfit, PanelStyle, Particles, PastRun, Run, Stats, Texture, TrackStyle } from '../types'

// ---------------------------------------------------------------------------
// Presets and settings

type Colors = Pick<BarSettings, 'accent' | 'done' | 'track' | 'track2' | 'panel' | 'panel2' | 'fill' | 'crab'>

export const PRESETS: Record<string, Colors> = {
  'night-owl': { accent: '#c792ea', done: '#addb67', track: '#0b2942', track2: '#1d3b53', panel: '#011627', panel2: '#0b2942', fill: '#14336b', crab: '#D97757' },
  claude: { accent: '#D97757', done: '#5fbf8f', track: '#2c2c2b', track2: '#3a2f2a', panel: '#1f1e1d', panel2: '#2c2c2b', fill: '#2b3a55', crab: '#D97757' },
  dracula: { accent: '#bd93f9', done: '#50fa7b', track: '#282a36', track2: '#44475a', panel: '#21222c', panel2: '#282a36', fill: '#2c2f5a', crab: '#ff79c6' },
  ocean: { accent: '#82aaff', done: '#7fdbca', track: '#1d2b3a', track2: '#173f6b', panel: '#0f1c2e', panel2: '#1d2b3a', fill: '#173f6b', crab: '#f78c6c' },
  mono: { accent: '#d6d6d6', done: '#ffffff', track: '#2a2a2a', track2: '#3a3a3a', panel: '#1a1a1a', panel2: '#2a2a2a', fill: '#3a3a3a', crab: '#bdbdbd' },
}
export const PRESET_LABEL: Record<string, string> = {
  'night-owl': 'Night Owl',
  claude: 'Claude',
  dracula: 'Dracula',
  ocean: 'Ocean',
  mono: 'Mono',
  custom: 'Custom',
}

export const MOTIONS: readonly Motion[] = ['walk', 'bounce', 'dance']
export const PARTICLES: readonly Particles[] = ['pixel', 'flames', 'balls', 'sparkles', 'none']
export const PARTICLE_LABEL: Record<Particles, string> = {
  pixel: 'Pixel dust',
  flames: 'Flames',
  balls: 'Ball trail',
  sparkles: 'Sparkles',
  none: 'None',
}
export const TEXTURES: readonly Texture[] = ['neon', 'smooth', 'stripes', 'liquid', 'matrix', 'segments']
export const TEXTURE_LABEL: Record<Texture, string> = {
  neon: 'Neon grid',
  smooth: 'Smooth glow',
  stripes: 'Candy stripes',
  liquid: 'Liquid wave',
  matrix: 'Matrix rain',
  segments: 'Segments',
}
export const TRACK_STYLES: readonly TrackStyle[] = ['solid', 'gradient', 'transparent']
export const PANEL_STYLES: readonly PanelStyle[] = ['none', 'solid', 'gradient']
export const OUTFITS: readonly Outfit[] = ['none', 'cap', 'sunglasses', 'wizard', 'pumpkin', 'crown']
export const OUTFIT_LABEL: Record<Outfit, string> = {
  none: 'None',
  cap: 'Cap',
  sunglasses: 'Sunglasses',
  wizard: 'Wizard hat',
  pumpkin: 'Pumpkin',
  crown: 'Crown',
}
// The level each outfit unlocks at; the pumpkin is also free all of October.
export const OUTFIT_LEVEL: Record<Outfit, number> = { none: 1, cap: 1, sunglasses: 2, wizard: 3, pumpkin: 4, crown: 5 }

export const DEFAULTS: BarSettings = {
  preset: 'night-owl',
  ...PRESETS['night-owl']!,
  motion: 'walk',
  particles: 'pixel',
  texture: 'neon',
  trackStyle: 'solid',
  panelStyle: 'none',
  crabPlace: 'on',
  outfit: 'none',
  sound: true,
  contextMeter: true,
  showStats: true,
}

const HEX = /^#[0-9a-fA-F]{6}$/

// What the store holds may be from an older version or hand-edited: keep only valid fields.
export const cleanSettings = (raw: unknown): BarSettings => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<BarSettings>
  const hex = (x: unknown, d: string) => (typeof x === 'string' && HEX.test(x) ? x : d)
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  return {
    preset: typeof v.preset === 'string' && v.preset in PRESET_LABEL ? v.preset : DEFAULTS.preset,
    accent: hex(v.accent, DEFAULTS.accent),
    done: hex(v.done, DEFAULTS.done),
    track: hex(v.track, DEFAULTS.track),
    track2: hex(v.track2, DEFAULTS.track2),
    trackStyle: TRACK_STYLES.includes(v.trackStyle as TrackStyle) ? (v.trackStyle as TrackStyle) : DEFAULTS.trackStyle,
    panel: hex(v.panel, DEFAULTS.panel),
    panel2: hex(v.panel2, DEFAULTS.panel2),
    panelStyle: PANEL_STYLES.includes(v.panelStyle as PanelStyle) ? (v.panelStyle as PanelStyle) : DEFAULTS.panelStyle,
    fill: hex(v.fill, DEFAULTS.fill),
    crab: hex(v.crab, DEFAULTS.crab),
    motion: MOTIONS.includes(v.motion as Motion) ? (v.motion as Motion) : DEFAULTS.motion,
    particles: PARTICLES.includes(v.particles as Particles) ? (v.particles as Particles) : DEFAULTS.particles,
    texture: TEXTURES.includes(v.texture as Texture) ? (v.texture as Texture) : DEFAULTS.texture,
    crabPlace: v.crabPlace === 'inside' ? 'inside' : ('on' as CrabPlace),
    outfit: OUTFITS.includes(v.outfit as Outfit) ? (v.outfit as Outfit) : DEFAULTS.outfit,
    sound: bool(v.sound, DEFAULTS.sound),
    contextMeter: bool(v.contextMeter, DEFAULTS.contextMeter),
    showStats: bool(v.showStats, DEFAULTS.showStats),
  }
}

export const EMPTY_STATS: Stats = { prompts: 0, finished: 0, history: [] }
const HISTORY = 30

export const cleanStats = (raw: unknown): Stats => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Stats>
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
  const history = Array.isArray(v.history)
    ? v.history
        .filter((h): h is PastRun => !!h && typeof h === 'object' && typeof (h as PastRun).secs === 'number')
        .map(h => ({ secs: Math.max(0, h.secs), tools: n(h.tools), reason: String(h.reason ?? ''), endedAt: n(h.endedAt) }))
        .slice(-HISTORY)
    : []
  return { prompts: n(v.prompts), finished: n(v.finished), history }
}

export const addRun = (s: Stats, past: PastRun): Stats => ({
  prompts: s.prompts + 1,
  finished: s.finished + (past.reason === 'answer' ? 1 : 0),
  history: [...s.history, past].slice(-HISTORY),
})

// ---------------------------------------------------------------------------
// Levels: one every ten finished prompts.

export const levelOf = (finished: number): number => 1 + Math.floor(finished / 10)
export const toNextLevel = (finished: number): number => 10 - (finished % 10)

export const isUnlocked = (outfit: Outfit, level: number, month: number): boolean =>
  level >= OUTFIT_LEVEL[outfit] || (outfit === 'pumpkin' && month === 9)

// ---------------------------------------------------------------------------
// Tool kinds: what the crab holds and the colour of the tool's tick.

export const kindOf = (tool: string): Activity => {
  if (/^(Read|Glob|Grep|LS|NotebookRead|ToolSearch|TaskGet|TaskList)$/.test(tool)) return 'read'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit'
  if (/^(Bash|PowerShell|Monitor|BashOutput|KillShell)$/.test(tool)) return 'run'
  if (/^(WebFetch|WebSearch)$/.test(tool) || /browser|chrome/i.test(tool)) return 'web'
  if (/^(Agent|Task|Workflow)$/.test(tool)) return 'agent'
  return 'other'
}

export const KIND_COLOR: Record<Activity, string> = {
  think: '#d6deeb',
  read: '#82aaff',
  edit: '#ecc48d',
  run: '#addb67',
  web: '#7fdbca',
  agent: '#c792ea',
  other: '#d6deeb',
}

export const KIND_LABEL: Record<Activity, string> = {
  think: 'thinking',
  read: 'reading',
  edit: 'editing',
  run: 'running',
  web: 'browsing',
  agent: 'delegating',
  other: 'working',
}

// ---------------------------------------------------------------------------
// Progress. A prompt has no known length, and lengths spread from seconds to
// an hour, so the bar moves on a log scale of time: as far from 10s to 100s as
// from 100s to 1000s. It is calibrated by past prompts: the typical one (the
// median) and the long tail (the horizon, where the bar reaches 95%). Each tool
// call counts as a couple of seconds of work. The rest fills when the turn ends.

const DEFAULT_EXPECTED = 45

const DEFAULT_HORIZON = 15 * 60

// The finished prompts' durations, sorted, from the last 30.
const pastSecs = (history: readonly PastRun[]): number[] =>
  history.filter(h => h.reason === 'answer').slice(-30).map(h => h.secs).sort((a, b) => a - b)

// The median of the last finished prompts, in seconds; a default until there are five.
export const expectedOf = (history: readonly PastRun[]): number => {
  const secs = pastSecs(history)
  if (secs.length < 5) return DEFAULT_EXPECTED
  const mid = secs[Math.floor(secs.length / 2)] ?? DEFAULT_EXPECTED
  return Math.max(8, Math.min(600, mid))
}

// Where the bar reaches 95%: half again past the 90th-percentile prompt, at least
// 10 minutes and three typical prompts, at most 3 hours.
export const horizonOf = (history: readonly PastRun[]): number => {
  const secs = pastSecs(history)
  if (secs.length < 5) return DEFAULT_HORIZON
  const p90 = secs[Math.min(secs.length - 1, Math.floor(secs.length * 0.9))] ?? DEFAULT_HORIZON
  return Math.max(600, 3 * expectedOf(history), Math.min(3 * 3600, p90 * 1.5))
}

export const progressOf = (r: Run, at: number): number => {
  // A finished prompt fills the bar; a stopped or failed one stays where it ended.
  if (r.endedAt && r.reason === 'answer') return 1
  const end = r.endedAt || at
  const secs = Math.max(0, (end - r.startedAt) / 1000) + r.tools * 2
  const scale = Math.max(4, r.expected) / 3
  const horizon = Math.max(r.horizon || DEFAULT_HORIZON, r.expected * 2)
  const p = (0.95 * Math.log1p(secs / scale)) / Math.log1p(horizon / scale)
  // Past the horizon it creeps toward 98%, never quite full until the turn ends.
  const tail = secs > horizon ? 0.03 * (1 - Math.exp(-(secs - horizon) / horizon)) : 0
  return Math.max(0.02, Math.min(0.95, p) + tail)
}

// No tool event for this long while running: the crab dozes.
export const IDLE_MS = 45000

export const isIdle = (r: Run, at: number): boolean => !r.endedAt && !r.isWaiting && at - r.lastEventAt > IDLE_MS

export const duration = (secs: number): string => {
  const s = Math.max(0, Math.round(secs))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export const elapsed = (r: Run, at: number): string => duration(((r.endedAt || at) - r.startedAt) / 1000)

export const isFailed = (r: Run): boolean => r.reason === 'aborted' || r.reason === 'error' || r.reason === 'refusal'

const statusWord = (r: Run, at: number): string => {
  if (r.endedAt) return r.reason === 'aborted' ? 'stopped' : isFailed(r) ? 'error' : 'done'
  if (r.isWaiting) return 'waiting for you'
  if (isIdle(r, at)) return 'dozing'
  return KIND_LABEL[r.activity]
}

export const statsText = (r: Run, at: number): string => {
  const parts = [r.endedAt ? statusWord(r, at) : `${Math.round(progressOf(r, at) * 100)}% ${statusWord(r, at)}`, elapsed(r, at)]
  if (r.tools) parts.push(`${r.tools} tool${r.tools === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
