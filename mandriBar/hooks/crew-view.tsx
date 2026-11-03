// The crew's drawing: a crab card per agent, a strip of them for mandriBar's bar,
// and the details pane. Shared with mandriBar: keep mandriBar/hooks/crew-view.tsx
// an exact copy of this file.

import type { EngineInterface } from 'claude-code'

import { CRAB_CSS, crabSvg } from './crab'
import type { CrabLook } from './crab'
import type { CrewAgent, Outfit } from '../types'

const CRAB = '#D97757'
export const CRAB_BOX_W = 34
export const CRAB_BOX_H = 30
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

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
const STATUS_WORD = { running: 'Working', done: 'Done', failed: 'Failed' } as const

export const shortName = (a: CrewAgent): string => clip(a.type === 'general-purpose' ? 'agent' : a.type.replace(/^.*:/, ''), 9)

// The crabs worth showing: the latest batch of agents (those of the newest
// agent's prompt) plus any still working, while one works and for a minute after
// the last one ends. Background agents report in later turns, so a batch is never
// tied to the turn running now.
export const CREW_LINGER_MS = 60000
export const visibleCrew = (list: readonly CrewAgent[], at: number): CrewAgent[] => {
  const newest = list[list.length - 1]
  if (!newest) return []
  const batch = list.filter(a => a.promptId === newest.promptId || a.status === 'running')
  if (batch.some(a => a.status === 'running')) return batch
  const lastEnd = Math.max(...batch.map(a => a.endedAt))
  return at - lastEnd < CREW_LINGER_MS ? batch : []
}

export const summaryOf = (list: readonly CrewAgent[]): string => {
  const running = list.filter(a => a.status === 'running').length
  const n = `${list.length} agent${list.length === 1 ? '' : 's'}`
  return running ? `${n} · ${running} working` : `${n} · all done`
}

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// A tool's colour, by kind, for the activity timeline.
const toolColor = (tool: string): string =>
  /^(Read|Glob|Grep|LS|NotebookRead|ToolSearch)$/.test(tool)
    ? '#82aaff'
    : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)
      ? '#ecc48d'
      : /^(Bash|PowerShell|Monitor|BashOutput)$/.test(tool)
        ? '#addb67'
        : /^(WebFetch|WebSearch)$/.test(tool)
          ? '#7fdbca'
          : '#c792ea'

// The crab of one agent, its hover glow and its status dot, drawn at the origin of
// a CRAB_BOX_W × CRAB_BOX_H box. `uid` keeps its gradient's id apart from other crabs'.
const crabBody = (a: CrewAgent, at: number, uid: string): string => {
  const look: CrabLook = {
    face: a.status === 'done' ? 'happy' : a.status === 'failed' ? 'sad' : 'normal',
    prop: a.status === 'running' ? a.activity : null,
    outfit: outfitOf(a.type),
    isWaiting: false,
    isDozing: false,
  }
  const motion = a.status === 'running' ? 'walk' : a.status === 'failed' ? 'sad' : ''
  const tip = `${a.type}: ${a.description}\n${statusLine(a)}\n${runtime(a, at)} · ${a.tools} tool${a.tools === 1 ? '' : 's'}`
  const dot = STATUS_COLOR[a.status]
  return `<g class="cc"><title>${xml(tip)}</title>
<defs><radialGradient id="g${uid}"><stop offset="0" stop-color="${dot}" stop-opacity=".45"/><stop offset="1" stop-color="${dot}" stop-opacity="0"/></radialGradient></defs>
<ellipse class="hl" cx="14" cy="20" rx="16" ry="10" fill="url(#g${uid})"/>
<rect width="${CRAB_BOX_W}" height="${CRAB_BOX_H}" fill="transparent"/>
<g opacity="${a.status === 'failed' ? 0.75 : 1}">${crabSvg(2, 10, CRAB, motion, 1, look)}</g>
<circle${a.status === 'running' ? ' class="live"' : ''} cx="30" cy="27" r="3" fill="${dot}"/></g>`
}

const CREW_CSS = `${CRAB_CSS}
.hl{opacity:0;transition:opacity .15s}.cc:hover .hl{opacity:1}
.live{animation:lv 1s ease-in-out infinite}@keyframes lv{50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}`

// One crab as its own SVG, `scale` times its size.
export const crabCard = (a: CrewAgent, at: number, scale = 1): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CRAB_BOX_W * scale}" height="${CRAB_BOX_H * scale}" viewBox="0 0 ${CRAB_BOX_W} ${CRAB_BOX_H}">
<style>${CREW_CSS}</style>${crabBody(a, at, '0')}</svg>`

// Up to `max` crabs side by side, right-aligned in a strip `W` wide: for mandriBar
// to draw over its bar. Returns the shapes and their CSS, to go inside its SVG.
export const CREW_GAP = 4
export const crewStrip = (list: readonly CrewAgent[], at: number, W: number, max = 8): { css: string; body: string } => {
  const shown = list.slice(-max)
  const more = list.length - shown.length
  const step = CRAB_BOX_W + CREW_GAP
  const x0 = W - shown.length * step
  const crabs = shown.map((a, i) => `<g transform="translate(${x0 + i * step},0)">${crabBody(a, at, `s${i}`)}</g>`).join('')
  const plus = more > 0 ? `<text x="${x0 - 6}" y="${CRAB_BOX_H - 6}" text-anchor="end" font-family="${FONT}" font-size="11" fill="#8f9aa3">+${more}</text>` : ''
  return { css: CREW_CSS, body: plus + crabs }
}

// ---------------------------------------------------------------------------
// The details pane, drawn mostly as SVG cards so it reads as one designed page.

const PANE_W = 360

// The header: the crab large, its task, type and a status pill, then a stat row.
const headerSvg = (a: CrewAgent, at: number): string => {
  const color = STATUS_COLOR[a.status]
  const word = STATUS_WORD[a.status]
  const title = xml(clip(a.description, 34))
  const type = xml(clip(a.type, 30))
  const pillW = Math.round(word.length * 7 + 22)
  const stat = (x: number, label: string, value: string) =>
    `<text x="${x}" y="98" font-family="${FONT}" font-size="10" fill="#8f9aa3">${label}</text><text x="${x}" y="114" font-family="${FONT}" font-size="14" font-weight="600" fill="#e6e6e6">${xml(value)}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANE_W}" height="128" viewBox="0 0 ${PANE_W} 128">
<style>${CREW_CSS}</style>
<defs><linearGradient id="hb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2a3a"/><stop offset="1" stop-color="#14181f"/></linearGradient></defs>
<rect x=".5" y=".5" width="${PANE_W - 1}" height="127" rx="12" fill="url(#hb)" stroke="${color}" stroke-opacity=".35"/>
<g transform="translate(10,8) scale(2)">${crabBody(a, at, 'h')}</g>
<text x="86" y="30" font-family="${FONT}" font-size="15" font-weight="700" fill="#f2f2f2">${title}</text>
<text x="86" y="48" font-family="${FONT}" font-size="11" fill="#8f9aa3">${type}</text>
<rect x="86" y="56" width="${pillW}" height="18" rx="9" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-opacity=".6"/>
<circle${a.status === 'running' ? ' class="live"' : ''} cx="96" cy="65" r="3" fill="${color}"/>
<text x="104" y="69" font-family="${FONT}" font-size="11" font-weight="600" fill="${color}">${word}</text>
<line x1="12" y1="82" x2="${PANE_W - 12}" y2="82" stroke="#ffffff" stroke-opacity=".08"/>
${stat(16, 'TIME', runtime(a, at))}${stat(120, 'TOOL CALLS', String(a.tools))}${stat(224, 'NOW', a.status === 'running' ? clip(a.current || 'thinking', 16) : 'finished')}
</svg>`
}

// Recent tool calls as a timeline: a coloured dot per call by kind, newest first.
const ROW_H = 22
const timelineSvg = (a: CrewAgent, at: number): string => {
  const calls = [...a.recent].reverse()
  const H = Math.max(1, calls.length) * ROW_H + 8
  const rows = calls
    .map((u, i) => {
      const y = 4 + i * ROW_H
      const c = toolColor(u.tool)
      const line = i < calls.length - 1 ? `<line x1="14" y1="${y + 15}" x2="14" y2="${y + ROW_H + 7}" stroke="#ffffff" stroke-opacity=".12"/>` : ''
      return `${line}<circle cx="14" cy="${y + 11}" r="4.5" fill="${c}" fill-opacity="${i === 0 && a.status === 'running' ? 1 : 0.75}"/>
<text x="28" y="${y + 15}" font-family="${FONT}" font-size="12" font-weight="600" fill="#e6e6e6">${xml(u.tool)}</text>
<text x="${28 + u.tool.length * 7.4 + 6}" y="${y + 15}" font-family="${FONT}" font-size="11" fill="#8f9aa3">${xml(clip(u.detail, 30))}</text>
<text x="${PANE_W - 10}" y="${y + 15}" text-anchor="end" font-family="${FONT}" font-size="10" fill="#6b7680">${duration(at - u.at)} ago</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANE_W}" height="${H}" viewBox="0 0 ${PANE_W} ${H}">${rows}</svg>`
}

// Every agent of the session as a row of small crabs, the picked one ringed.
const rosterSvg = (list: readonly CrewAgent[], pickedId: string, at: number): string => {
  const step = CRAB_BOX_W + 8
  const perRow = Math.max(1, Math.floor((PANE_W - 8) / step))
  const rows = Math.ceil(list.length / perRow)
  const H = rows * (CRAB_BOX_H + 10) + 4
  const body = list
    .map((a, i) => {
      const x = 4 + (i % perRow) * step
      const y = 4 + Math.floor(i / perRow) * (CRAB_BOX_H + 10)
      const ring = a.id === pickedId ? `<rect x="-3" y="-3" width="${CRAB_BOX_W + 6}" height="${CRAB_BOX_H + 6}" rx="8" fill="#ffffff" fill-opacity=".06" stroke="#ffffff" stroke-opacity=".35"/>` : ''
      return `<g transform="translate(${x},${y})">${ring}${crabBody(a, at, `r${i}`)}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANE_W}" height="${H}" viewBox="0 0 ${PANE_W} ${H}"><style>${CREW_CSS}</style>${body}</svg>`
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// The details pane: the picked agent in full, and every agent of the session to switch to.
export function crewPane(
  $: EngineInterface,
  ui: Ui,
  surface: string,
  list: readonly CrewAgent[],
  id: string,
  at: number,
  pick: (id: string) => void,
) {
  const { Box, Text, Button } = ui
  const a = list.find(x => x.id === id || x.agentId === id) ?? list[list.length - 1]
  if (!a) return <Text dimColor>No agents yet. When Claude starts subagents, they show up here.</Text>
  const now = Math.max(at, a.startedAt)
  const isDesktop = surface !== 'terminal' && 'Svg' in ui
  const recent = list.slice(-20)
  const picker =
    recent.length > 1 && 'Select' in ui ? (
      <ui.Select
        key="crew-pick"
        label="Agent "
        value={a.id}
        options={[...recent].reverse().map(o => ({
          value: o.id,
          label: `${o.status === 'running' ? '●' : o.status === 'done' ? '✓' : '✗'} ${o.type}: ${clip(o.description, 40)}`,
        }))}
        onSelect={value => pick(value)}
      />
    ) : null

  if (!isDesktop || !('Svg' in ui)) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{a.description}</Text>
        <Text dimColor>
          {a.type} · {STATUS_WORD[a.status]} · {runtime(a, now)} · {a.tools} tools
        </Text>
        {picker}
        <Text bold>Prompt</Text>
        <Text>{clip(a.prompt || '(not seen)', 4000)}</Text>
        <Text bold>Result</Text>
        <Text dimColor={!a.result}>{a.result || (a.status === 'running' ? 'Still working…' : 'No report seen.')}</Text>
      </Box>
    )
  }

  const { Svg } = ui
  return (
    <Box flexDirection="column" gap={1}>
      <Svg source={headerSvg(a, now)} alt={`${a.type}: ${a.description}, ${statusLine(a)}`} width={PANE_W} height={128} isInteractive />
      {a.agentId && <Button key="crew-transcript" label="Open its transcript" variant="primary" onPress={() => void $.ui.view({ agentId: a.agentId })} />}

      {recent.length > 1 && <Text bold>Crew</Text>}
      {recent.length > 1 && <Svg source={rosterSvg(recent, a.id, now)} alt={summaryOf(recent)} width={PANE_W} isInteractive />}
      {picker}

      <Text bold>Recent activity</Text>
      {a.recent.length === 0 ? (
        <Text dimColor>No tool calls seen yet.</Text>
      ) : (
        <Svg source={timelineSvg(a, now)} alt={`${a.recent.length} recent tool calls`} width={PANE_W} />
      )}

      <Text bold>Prompt</Text>
      <Box borderStyle="round" borderDimColor paddingX={1}>
        <Text>{clip(a.prompt || '(not seen)', 4000)}</Text>
      </Box>

      <Text bold>Result</Text>
      <Box borderStyle="round" borderColor={a.result ? STATUS_COLOR[a.status] : undefined} borderDimColor={!a.result} paddingX={1}>
        <Text dimColor={!a.result}>{a.result || (a.status === 'running' ? 'Still working…' : 'No report seen.')}</Text>
      </Box>
    </Box>
  )
}
