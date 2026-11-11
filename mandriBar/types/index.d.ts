export type Motion = 'walk' | 'bounce' | 'dance'

export type Particles = 'pixel' | 'flames' | 'balls' | 'sparkles' | 'none'

export type CrabPlace = 'on' | 'inside'

export type Texture = 'neon' | 'smooth' | 'stripes' | 'liquid' | 'matrix' | 'segments'

// The empty part of the bar, and the panel behind the whole row.
export type TrackStyle = 'solid' | 'gradient' | 'transparent'
export type PanelStyle = 'none' | 'solid' | 'gradient'

export type Outfit = 'none' | 'cap' | 'sunglasses' | 'wizard' | 'pumpkin' | 'crown'

// What the crab is doing, from the tool that runs; `think` between tools.
export type Activity = 'think' | 'read' | 'edit' | 'run' | 'web' | 'agent' | 'other'

export type BarSettings = {
  preset: string
  accent: string
  done: string
  track: string
  track2: string
  trackStyle: TrackStyle
  panel: string
  panel2: string
  panelStyle: PanelStyle
  fill: string
  crab: string
  motion: Motion
  particles: Particles
  texture: Texture
  crabPlace: CrabPlace
  outfit: Outfit
  sound: boolean
  contextMeter: boolean
  showStats: boolean
}

// A tool call on the bar: its kind and where the bar stood when it ran (0..1).
export type Tick = { kind: Activity; at: number }

// One prompt's run on the main loop; `endedAt` is 0 while it runs.
export type Run = {
  turnId: string
  startedAt: number
  endedAt: number
  tools: number
  reason: string
  activity: Activity
  ticks: Tick[]
  isWaiting: boolean
  lastEventAt: number
  // How long this prompt is expected to take, in seconds, from past prompts.
  expected: number
  // Where the bar reaches 95%, in seconds, from past prompts' long tail.
  horizon: number
}

// A finished prompt, for the history chart and the estimate.
export type PastRun = { secs: number; tools: number; reason: string; endedAt: number }

export type Stats = { prompts: number; finished: number; history: PastRun[] }

// mandriCrew's agents, read from its state to draw its crabs on this bar.
export type AgentStatus = 'running' | 'done' | 'failed'
export type ToolUse = { tool: string; detail: string; at: number }
export type CrewAgent = {
  id: string
  agentId: string
  toolUseId: string
  type: string
  description: string
  prompt: string
  status: AgentStatus
  startedAt: number
  endedAt: number
  promptId: string
  activity: Activity
  current: string
  tools: number
  recent: ToolUse[]
  result: string
}

declare module 'claude-code' {
  interface PluginState {
    mandribar: {
      run: Shaped<Run | null>
      now: number
      settings: Shaped<BarSettings>
      stats: Shaped<Stats>
      context: number
      isHidden: boolean
      crewSelected: string
      paletteTarget: string
    }
    // mandriCrew's values this mod reads (its own contract declares them too).
    mandricrew: {
      agents: Shaped<CrewAgent[]>
      promptId: string
      now: number
    }
  }
}
