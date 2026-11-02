// The crew's drawing: a crab card per agent and the details pane. Shared with
// mandriBar, which draws the same crabs at the right end of its bar: keep
// mandriBar/hooks/crew-view.tsx an exact copy of this file.

import type { EngineInterface } from 'claude-code'

import { CRAB_CSS, crabSvg } from './crab'
import type { CrabLook } from './crab'
import type { CrewAgent, Outfit } from '../types'

const CRAB = '#D97757'
export const CRAB_BOX_W = 34
export const CRAB_BOX_H = 30

export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)

// Each agent type gets a look of its own.
const OUTFIT_OF: Record<string, Outfit> = { Explore: 'cap', Plan: 'wizard', 'claude-code-guide': 'sunglasses' }
const outfitOf = (type: string): Outfit => OUTFIT_OF[type] ?? (type.includes('heavy') || type.includes('fable') ? 'crown' : 'none')

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export const runtime = (a: CrewAgent, at: number): string => duration((a.endedAt || at) - a.startedAt)

export const statusLine = (a: CrewAgent): string =>
  a.status === 'done' ? 'Done' : a.status === 'failed' ? 'Failed' : a.current ? `Working: ${a.current}` : 'Thinking'

export const STATUS_COLOR = { running: '#82aaff', done: '#addb67', failed: '#ef5350' } as const

export const shortName = (a: CrewAgent): string => clip(a.type === 'general-purpose' ? 'agent' : a.type.replace(/^.*:/, ''), 9)

export const summaryOf = (list: readonly CrewAgent[]): string => {
  const running = list.filter(a => a.status === 'running').length
  const n = `${list.length} agent${list.length === 1 ? '' : 's'}`
  return running ? `${n} · ${running} working` : `${n} · all done`
}

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// One crab: its own interactive SVG, so the tooltip and the hover glow work.
export const crabCard = (a: CrewAgent, at: number, scale = 1): string => {
  const look: CrabLook = {
    face: a.status === 'done' ? 'happy' : a.status === 'failed' ? 'sad' : 'normal',
    prop: a.status === 'running' ? a.activity : null,
    outfit: outfitOf(a.type),
    isWaiting: false,
    isDozing: false,
  }
  const motion = a.status === 'running' ? 'walk' : a.status === 'failed' ? 'sad' : ''
  const tip = `${a.type}: ${a.description}\n${statusLine(a)}\n${runtime(a, at)} · ${a.tools} tool${a.tools === 1 ? '' : 's'}\nClick its name for details`
  const dot = STATUS_COLOR[a.status]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CRAB_BOX_W * scale}" height="${CRAB_BOX_H * scale}" viewBox="0 0 ${CRAB_BOX_W} ${CRAB_BOX_H}">
<title>${xml(tip)}</title>
<style>${CRAB_CSS}
.hl{opacity:0;transition:opacity .15s}svg:hover .hl{opacity:1}
.live{animation:lv 1s ease-in-out infinite}@keyframes lv{50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}</style>
<defs><radialGradient id="g"><stop offset="0" stop-color="${dot}" stop-opacity=".45"/><stop offset="1" stop-color="${dot}" stop-opacity="0"/></radialGradient></defs>
<ellipse class="hl" cx="14" cy="20" rx="16" ry="10" fill="url(#g)"/>
<rect width="${CRAB_BOX_W}" height="${CRAB_BOX_H}" fill="transparent"/>
<g opacity="${a.status === 'failed' ? 0.75 : 1}">${crabSvg(2, 10, CRAB, motion, 1, look)}</g>
<circle${a.status === 'running' ? ' class="live"' : ''} cx="30" cy="27" r="3" fill="${dot}"/>
</svg>`
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// The details pane: the picked agent in full, and every other agent to switch to.
export const crewPane = (
  $: EngineInterface,
  ui: Ui,
  surface: string,
  list: readonly CrewAgent[],
  id: string,
  at: number,
  pick: (id: string) => void,
) => {
  const { Box, Text, Button } = ui
  const a = list.find(x => x.id === id || x.agentId === id) ?? list[list.length - 1]
  if (!a) return <Text dimColor>No agents yet. When Claude starts subagents, they show up here.</Text>
  const now = Math.max(at, a.startedAt)
  const isDesktop = surface !== 'terminal' && 'Svg' in ui
  const others = list.slice(-20).reverse()
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        {isDesktop && 'Svg' in ui && <ui.Svg source={crabCard(a, now, 2)} alt={`${a.type} crab`} width={CRAB_BOX_W * 2} height={CRAB_BOX_H * 2} />}
        <Box flexDirection="column">
          <Text bold>{a.description}</Text>
          <Text dimColor>{a.type}</Text>
          <Text color={STATUS_COLOR[a.status]}>{statusLine(a)}</Text>
        </Box>
      </Box>
      <Text>
        {runtime(a, now)} · {a.tools} tool call{a.tools === 1 ? '' : 's'}
        {a.endedAt ? ' · finished' : ' · running'}
      </Text>
      {a.agentId && <Button key="crew-transcript" label="Open its transcript" onPress={() => void $.ui.view({ agentId: a.agentId })} />}

      <Text bold>Recent activity</Text>
      {a.recent.length === 0 ? (
        <Text dimColor>No tool calls seen yet.</Text>
      ) : (
        <Box flexDirection="column">
          {[...a.recent].reverse().map((u, i) => (
            <Text key={`crew-use-${i}`} wrap="truncate-end">
              <Text dimColor>{duration(now - u.at)} ago </Text>
              {u.tool} <Text dimColor>{u.detail}</Text>
            </Text>
          ))}
        </Box>
      )}

      <Text bold>Prompt</Text>
      <Text>{clip(a.prompt || '(not seen)', 4000)}</Text>

      <Text bold>Result</Text>
      <Text dimColor={!a.result}>{a.result || (a.status === 'running' ? 'Still working…' : 'No report seen.')}</Text>

      {others.length > 1 && <Text bold>All agents</Text>}
      {others.length > 1 &&
        others.map(o => (
          <Button
            key={`crew-pick-${o.id}`}
            label={`${o.status === 'running' ? '●' : o.status === 'done' ? '✓' : '✗'} ${o.type}: ${clip(o.description, 40)}`}
            plain
            dimColor={o.id !== a.id}
            onPress={() => pick(o.id)}
          />
        ))}
    </Box>
  )
}
