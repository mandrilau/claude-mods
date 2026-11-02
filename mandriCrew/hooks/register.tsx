import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { CRAB_BOX_H, CRAB_BOX_W, clip, crabCard, crewPane, shortName, statusLine, summaryOf } from './view'
import type { Activity, AgentStatus, CrewAgent, ToolUse } from '../types'

const PANE = 'mandricrew-details'
const MAX_AGENTS = 200
const MAX_RECENT = 12
const MAX_ROW = 10
const MAX_RESULT = 6000

const agents = atom({ plugin: 'mandricrew', key: 'agents' } as const, [], { shape: 'agents-1' })
const now = atom({ plugin: 'mandricrew', key: 'now' } as const, 0)
// The main-loop prompt running now: the row shows the agents it started.
const promptId = atom({ plugin: 'mandricrew', key: 'promptId' } as const, '')
const selected = atom({ plugin: 'mandricrew', key: 'selected' } as const, '')
const isHidden = atom({ plugin: 'mandricrew', key: 'isHidden' } as const, false)

// ---------------------------------------------------------------------------
// What an agent is doing, from its tool calls.

const kindOf = (tool: string): Activity => {
  if (/^(Read|Glob|Grep|LS|NotebookRead|ToolSearch)$/.test(tool)) return 'read'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit'
  if (/^(Bash|PowerShell|Monitor|BashOutput)$/.test(tool)) return 'run'
  if (/^(WebFetch|WebSearch)$/.test(tool) || /browser|chrome/i.test(tool)) return 'web'
  if (/^(Agent|Task|Workflow)$/.test(tool)) return 'agent'
  return 'other'
}

// The tool's main argument, short: the file, the command, the pattern or the URL.
const detailOf = (e: Record<string, unknown>): string => {
  for (const key of ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description', 'skill']) {
    const v = e[key]
    if (typeof v === 'string' && v.trim()) {
      const text = key === 'file_path' || key === 'path' ? (v.split('/').pop() ?? v) : v
      return clip(text.replace(/\s+/g, ' ').trim(), 60)
    }
  }
  return ''
}

// The engine's own word on an agent, for agents whose end no hook sees (a background run).
const statusFrom = (status: string): AgentStatus | null =>
  status === 'completed' || status === 'idle' ? 'done' : status === 'failed' || status === 'killed' ? 'failed' : null

const upsert = ($: EngineInterface, id: string, change: (a: CrewAgent) => CrewAgent) =>
  update($, agents, list => list.map(a => (a.id === id || a.agentId === id ? change(a) : a)))

const openDetails = async ($: EngineInterface, id: string) => {
  await update($, selected, () => id)
  await $.ui.open({ id: PANE, title: 'Agent details' })
}

// mandriBar draws these crabs at the end of its own bar while its bar shows:
// this row then stays out of the way. Read loosely, as mandriBar may not be loaded.
const isOnBar = async ($: EngineInterface): Promise<boolean> => {
  const none = { value: undefined }
  const barNow: { value?: unknown } = await $.state.get({ plugin: 'mandribar', key: 'now' } as const).catch(() => none)
  const barHidden: { value?: unknown } = await $.state.get({ plugin: 'mandribar', key: 'isHidden' } as const).catch(() => none)
  return typeof barNow.value === 'number' && barNow.value > 0 && barHidden.value !== true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mandriCrew', description: 'Show the details of the agents Claude started' })
    // While any crab works: tick its clock, and take the engine's word for agents that ended unseen.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        const infos = await $.agent.list().catch(() => [])
        const ended = new Map<string, AgentStatus>()
        for (const info of infos) {
          const s = statusFrom(info.status)
          if (s) ended.set(info.id, s)
        }
        if (ended.size) {
          await update($, agents, all =>
            all.map(a => {
              const s = a.status === 'running' && a.agentId ? ended.get(a.agentId) : undefined
              return s ? { ...a, status: s, endedAt: at, current: '' } : a
            }),
          )
        }
        await update($, now, () => at)
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'mandriCrew' }, async $ => {
    const list = await read($, agents)
    const pick = (await read($, selected)) || list[list.length - 1]?.id || ''
    await openDetails($, pick)
    return { text: list.length ? 'Agent details opened.' : 'No agents yet: they show up here when Claude starts one.' }
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await update($, promptId, () => e.turnId)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const at = await $.clock.now()
    const prompt = await read($, promptId)
    const agent: CrewAgent = {
      id: started.agentId ?? e.tool_use_id,
      agentId: started.agentId ?? '',
      toolUseId: e.tool_use_id,
      type: e.subagentType || 'agent',
      description: e.description || 'Subagent',
      prompt: e.prompt,
      status: 'running',
      startedAt: at,
      endedAt: 0,
      promptId: prompt,
      activity: 'think',
      current: '',
      tools: 0,
      recent: [],
      result: '',
    }
    await update($, agents, list => [...list.filter(a => a.id !== agent.id), agent].slice(-MAX_AGENTS))
    await update($, now, () => at)
    await update($, isHidden, () => false)
    return started
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      const detail = detailOf(e as unknown as Record<string, unknown>)
      const use: ToolUse = { tool: e.tool, detail, at }
      await upsert($, agentId, a => ({
        ...a,
        tools: a.tools + 1,
        activity: kindOf(e.tool),
        current: detail ? `${e.tool} ${detail}` : e.tool,
        recent: [...a.recent, use].slice(-MAX_RECENT),
      }))
    }
    const result = await next(e)
    if (agentId) await upsert($, agentId, a => ({ ...a, activity: 'think', current: '' }))

    // The Agent call answers with the agent's final report, unless it only launched a background run.
    if (e.tool === 'Agent' && result.deny === undefined) {
      const text = typeof result.text === 'string' ? result.text : ''
      const isLaunch = /\b(running in the background|launched|async)\b/i.test(text.slice(0, 200))
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map(a =>
          a.toolUseId !== e.tool_use_id
            ? a
            : {
                ...a,
                result: isLaunch ? a.result : clip(text, MAX_RESULT),
                ...(isLaunch || a.status !== 'running'
                  ? {}
                  : { status: result.isError ? ('failed' as const) : ('done' as const), endedAt: at, current: '' }),
              },
        ),
      )
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await upsert($, agentId, a =>
        a.status !== 'running' ? a : { ...a, status: e.reason === 'answer' ? 'done' : 'failed', endedAt: at, current: '' },
      )
      await update($, now, () => at)
    }
    return next(e)
  })

  // Its own row, only when mandriBar is not drawing the crabs on its bar.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const prompt = await read($, promptId)
    const list = (await read($, agents)).filter(a => a.promptId === prompt)
    if (list.length === 0 || e.props.hasSurvey || (await read($, isHidden)) || (await isOnBar($))) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt))
    const shown = list.slice(-MAX_ROW)
    const dismiss = <Button key="mandricrew-hide" label="✕" plain role="dismiss" onPress={() => update($, isHidden, () => true)} />

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-end" gap={1}>
            <Text dimColor>{summaryOf(list)}</Text>
            {list.length > shown.length && <Text dimColor>+{list.length - shown.length}</Text>}
            {shown.map(a => (
              <Box key={`mandricrew-${a.id}`} flexDirection="column" alignItems="center">
                <Svg source={crabCard(a, at)} alt={`${a.type}: ${a.description}, ${statusLine(a)}`} width={CRAB_BOX_W} height={CRAB_BOX_H} isInteractive />
                <Button key={`mandricrew-open-${a.id}`} label={shortName(a)} plain dimColor={a.status !== 'running'} onPress={() => void openDetails($, a.id)} />
              </Box>
            ))}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="flex-end" gap={1}>
          <Text dimColor>{summaryOf(list)}</Text>
          {shown.map(a => (
            <Button
              key={`mandricrew-open-${a.id}`}
              label={`${a.status === 'running' ? '●' : a.status === 'done' ? '✓' : '✗'} ${shortName(a)}`}
              plain
              onPress={() => void openDetails($, a.id)}
            />
          ))}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const list = await read($, agents)
    const id = await read($, selected)
    const at = await read($, now)
    return crewPane($, ui, e.surface, list, id, at, pick => void update($, selected, () => pick))
  })
}
