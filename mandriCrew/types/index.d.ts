export type Outfit = 'none' | 'cap' | 'sunglasses' | 'wizard' | 'pumpkin' | 'crown'

// What an agent is doing, from the tool it runs; `think` between tools.
export type Activity = 'think' | 'read' | 'edit' | 'run' | 'web' | 'agent' | 'other'

export type AgentStatus = 'running' | 'done' | 'failed'

// One tool call of an agent, for its recent-activity list.
export type ToolUse = { tool: string; detail: string; at: number }

export type CrewAgent = {
  // The spawn's agent id, or the Agent call's id until one is known.
  id: string
  agentId: string
  toolUseId: string
  type: string
  description: string
  prompt: string
  status: AgentStatus
  startedAt: number
  endedAt: number
  // The main-loop prompt it belongs to: the row shows the current prompt's agents.
  promptId: string
  activity: Activity
  current: string
  tools: number
  recent: ToolUse[]
  result: string
}

declare module 'claude-code' {
  interface PluginState {
    mandricrew: {
      agents: Shaped<CrewAgent[]>
      now: number
      promptId: string
      selected: string
      isHidden: boolean
    }
    // mandriBar's values this mod reads (its own contract declares them too).
    mandribar: {
      now: number
      isHidden: boolean
    }
  }
}
