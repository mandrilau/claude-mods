import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { CRAB_BOX_H, crewPane, crewStrip, summaryOf, visibleCrew } from './crew-view'
import { barSvg, barText, heightOf, historySvg, panelSvg } from './draw'
import {
  DEFAULTS,
  EMPTY_STATS,
  MOTIONS,
  OUTFITS,
  OUTFIT_LABEL,
  OUTFIT_LEVEL,
  PARTICLES,
  PARTICLE_LABEL,
  PRESETS,
  PRESET_LABEL,
  TEXTURES,
  TEXTURE_LABEL,
  addRun,
  cleanSettings,
  cleanStats,
  duration,
  expectedOf,
  isUnlocked,
  kindOf,
  levelOf,
  progressOf,
  statsText,
  toNextLevel,
} from './model'
import type { BarSettings, CrabPlace, CrewAgent, Motion, Outfit, PanelStyle, Particles, Run, Texture, TrackStyle } from '../types'

const SETTINGS_KEY = 'settings'
const STATS_KEY = 'stats'
const PANE = 'mandribar-settings'
const CREW_PANE = 'mandribar-crew'
// Crabs drawn at the end of the bar, at most; the rest are counted.
const MAX_CREW = 8
const CHIME = 'assets/chime.wav'
// A prompt longer than this gets a toast when it finishes.
const LONG_MS = 60000
const MAX_TICKS = 80

const run = atom({ plugin: 'mandribar', key: 'run' } as const, null, { shape: 'run-2' })
const now = atom({ plugin: 'mandribar', key: 'now' } as const, 0)
const settings = atom({ plugin: 'mandribar', key: 'settings' } as const, DEFAULTS, { shape: 'settings-7' })
const stats = atom({ plugin: 'mandribar', key: 'stats' } as const, EMPTY_STATS, { shape: 'stats-1' })
// The context window's fill in percent; -1 until known.
const context = atom({ plugin: 'mandribar', key: 'context' } as const, -1)
const isHidden = atom({ plugin: 'mandribar', key: 'isHidden' } as const, false)
const crewSelected = atom({ plugin: 'mandribar', key: 'crewSelected' } as const, '')
// Which colour the settings palette paints.
const paletteTarget = atom({ plugin: 'mandribar', key: 'paletteTarget' } as const, 'accent')

type ColorKey = 'accent' | 'done' | 'track' | 'track2' | 'panel' | 'panel2' | 'fill' | 'crab'

// The colours the palette can paint, each shown only while it is in use.
const COLOR_SLOTS: { key: ColorKey; label: string; shows: (s: BarSettings) => boolean }[] = [
  { key: 'accent', label: 'Bar (working)', shows: () => true },
  { key: 'done', label: 'Bar (finished)', shows: () => true },
  { key: 'fill', label: 'Fill base', shows: () => true },
  { key: 'crab', label: 'Crab', shows: () => true },
  { key: 'track', label: 'Bar background', shows: s => s.trackStyle !== 'transparent' },
  { key: 'track2', label: 'Bar background (gradient end)', shows: s => s.trackStyle === 'gradient' },
  { key: 'panel', label: 'Row background', shows: s => s.panelStyle !== 'none' },
  { key: 'panel2', label: 'Row background (gradient end)', shows: s => s.panelStyle === 'gradient' },
]

// A palette chip: the colour as a rounded square, ringed when it is the one in use.
const SWATCH = 24
const swatchSvg = (hex: string, isCurrent: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH}" height="${SWATCH}" viewBox="0 0 24 24"><title>${hex}</title>` +
  `<style>.c{transition:transform .12s;transform-origin:50% 50%}svg:hover .c{transform:scale(1.12)}</style>` +
  `<rect class="c" x="3" y="3" width="18" height="18" rx="5" fill="${hex}" stroke="${isCurrent ? '#ffffff' : 'rgba(255,255,255,.18)'}" stroke-width="${isCurrent ? 2 : 1}"/></svg>`

// Swatches, one row per family: neon, warm, cool, and dark ones for backgrounds.
const PALETTE: readonly (readonly string[])[] = [
  ['#c792ea', '#82aaff', '#7fdbca', '#addb67', '#ecc48d', '#f78c6c', '#ff5874', '#ef5350', '#d6deeb', '#637777'],
  ['#d97757', '#e8a27c', '#f5c542', '#ffd166', '#ff9f1c', '#ff6b35', '#e63946', '#b71c2c', '#7a4a26', '#5fbf8f'],
  ['#00e5ff', '#2ec4b6', '#4cc9f0', '#4361ee', '#3a0ca3', '#7209b7', '#b5179e', '#f72585', '#bd93f9', '#ff79c6'],
  ['#011627', '#0b2942', '#14336b', '#173f6b', '#1d3b53', '#1f1e1d', '#21222c', '#282a36', '#2c2c2b', '#1a1a1a'],
]

// mandriCrew's agents and current prompt, read loosely: the crew mod may not be loaded.
const readCrew = async ($: EngineInterface): Promise<{ all: CrewAgent[]; current: CrewAgent[]; at: number }> => {
  const none = { value: undefined }
  const agents: { value?: unknown } = await $.state.get({ plugin: 'mandricrew', key: 'agents' } as const).catch(() => none)
  const tick: { value?: unknown } = await $.state.get({ plugin: 'mandricrew', key: 'now' } as const).catch(() => none)
  // A shaped value reads back wrapped as { shape, value }.
  const raw = agents.value && typeof agents.value === 'object' && 'value' in agents.value ? (agents.value as { value: unknown }).value : agents.value
  const all = Array.isArray(raw) ? (raw as CrewAgent[]) : []
  const current = visibleCrew(all, await $.clock.now())
  return { all, current, at: typeof tick.value === 'number' ? tick.value : 0 }
}

// The crew's crabs drawn into the bar's own SVG, in a strip above it: no row and no
// background of their own. The bar's drawing moves down to make room.
const CREW_TOP = CRAB_BOX_H + 2
const withCrew = (svg: string, W: number, H: number, crew: readonly CrewAgent[], at: number): string => {
  const strip = crewStrip(crew, at, W, MAX_CREW)
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const total = H + CREW_TOP
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}"><style>${strip.css}</style>${strip.body}<g transform="translate(0,${CREW_TOP})">${inner}</g></svg>`
}

const openCrew = async ($: EngineInterface, id: string) => {
  await update($, crewSelected, () => id)
  await $.ui.open({ id: CREW_PANE, title: 'Agent details' })
}

const save = async ($: EngineInterface, change: (s: BarSettings) => BarSettings): Promise<void> => {
  const next = cleanSettings(change(await read($, settings)))
  await update($, settings, () => next)
  await $.store.set(SETTINGS_KEY, next)
}

const readContext = async ($: EngineInterface): Promise<void> => {
  const usage = await $.session.usage().catch(() => null)
  const pct = usage?.context.percent
  if (typeof pct === 'number') await update($, context, () => pct)
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'mandriBar' })

const playChime = ($: EngineInterface) => void $.audio.play({ asset: CHIME }, { gain: 0.6 }).catch(() => undefined)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const storedSettings = await $.store.get(SETTINGS_KEY).catch(() => undefined)
    await update($, settings, () => cleanSettings(storedSettings ?? DEFAULTS))
    const storedStats = await $.store.get(STATS_KEY).catch(() => undefined)
    await update($, stats, () => cleanStats(storedStats ?? EMPTY_STATS))
    await $.command.register({
      name: 'mandribar',
      description: 'Customise the mandriBar progress bar: colours, particles, crab, outfit and sound',
    })
    void readContext($)
    // Ticks the clock while a prompt runs, and reads the context fill every few seconds; quiet otherwise.
    let beat = 0
    $.clock.every(1000, () => {
      void (async () => {
        const r = await read($, run)
        if (!r || r.endedAt) return
        const at = await $.clock.now()
        await update($, now, () => at)
        if (++beat % 5 === 0) await readContext($)
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'mandribar' }, async $ => {
    await openPane($)
    return { text: 'mandriBar settings opened.' }
  })

  // Main-loop turns only: a subagent's turn is part of the prompt that started it.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const at = await $.clock.now()
      const expected = expectedOf((await read($, stats)).history)
      await update($, run, () => ({
        turnId: e.turnId,
        startedAt: at,
        endedAt: 0,
        tools: 0,
        reason: '',
        activity: 'think' as const,
        ticks: [],
        isWaiting: false,
        lastEventAt: at,
        expected,
      }))
      await update($, now, () => at)
      await update($, isHidden, () => false)
    }
    return next(e)
  })

  // Each tool call: the crab picks up its prop and the bar gets a notch.
  on('tool.call', async ($, e, next) => {
    const kind = kindOf(e.tool)
    const at = await $.clock.now()
    await update($, run, r =>
      r && !r.endedAt
        ? {
            ...r,
            tools: r.tools + 1,
            activity: kind,
            lastEventAt: at,
            ticks: [...r.ticks, { kind, at: progressOf(r, at) }].slice(-MAX_TICKS),
          }
        : r,
    )
    const result = await next(e)
    const after = await $.clock.now()
    await update($, run, r => (r && !r.endedAt ? { ...r, isWaiting: false, activity: 'think' as const, lastEventAt: after } : r))
    return result
  })

  // A call put to you for approval: the crab holds up its sign until the tool runs or the turn ends.
  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === 'ask' && e.approver === 'person') {
      await update($, run, r => (r && !r.endedAt ? { ...r, isWaiting: true } : r))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const r = await read($, run)
      if (r && r.turnId === e.turnId && !r.endedAt) {
        const at = await $.clock.now()
        await update($, run, () => ({ ...r, endedAt: at, reason: e.reason, isWaiting: false }))
        await update($, now, () => at)

        const before = await read($, stats)
        const after = addRun(before, { secs: (at - r.startedAt) / 1000, tools: r.tools, reason: e.reason, endedAt: at })
        await update($, stats, () => after)
        await $.store.set(STATS_KEY, after).catch(() => undefined)

        const s = await read($, settings)
        const won = e.reason === 'answer'
        if (won && s.sound) playChime($)

        const level = levelOf(after.finished)
        if (level > levelOf(before.finished)) {
          const unlocked = OUTFITS.find(o => OUTFIT_LEVEL[o] === level)
          $.ui.toast(`mandriBar: your crab reached level ${level}!${unlocked ? ` New outfit: ${OUTFIT_LABEL[unlocked]}.` : ''}`)
        } else if (at - r.startedAt > LONG_MS) {
          const word = won ? 'Done' : e.reason === 'aborted' ? 'Stopped' : 'Ended with an error'
          $.ui.toast(`mandriBar: ${word} in ${duration((at - r.startedAt) / 1000)} · ${r.tools} tools`)
        }
        void readContext($)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, run)
    if (r === null || e.props.hasSurvey || (await read($, isHidden))) return next(e)
    // Draw this row with the other mods' bands beneath it; the engine's own placeholder is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const s = await read($, settings)
    const at = Math.max(await read($, now), r.startedAt)
    const pct = await read($, context)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const gear = <Button key="mandribar-gear" label="⚙" plain onPress={() => void openPane($)} />
    const dismiss = <Button key="mandribar-hide" label="✕" plain role="dismiss" onPress={() => update($, isHidden, () => true)} />

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const sinceEnd = r.endedAt ? (await $.clock.now()) - r.endedAt : Infinity
      const crew = (await readCrew($)).current
      const shown = crew.slice(-MAX_CREW)
      const crewAt = Math.max(at, ...crew.map(a => a.startedAt))
      // The desktop draws about 8.6px per reported column; ⚙ and ✕ take about 84px. The bar takes the rest.
      const width = Math.max(180, Math.min(2400, Math.floor((e.props.bodyColumns || 100) * 8.6) - 84))
      const barH = heightOf(s)
      const bar = barSvg(s, r, at, width, pct < 0 ? null : pct, sinceEnd)
      const hasCrew = shown.length > 0
      const source = hasCrew ? withCrew(bar, width, barH, crew, crewAt) : bar
      const svgH = barH + (hasCrew ? CREW_TOP : 0)
      const crewButton = hasCrew ? (
        <Button key="mandribar-crew" label={`🦀 ${crew.length}`} plain onPress={() => void openCrew($, crew[crew.length - 1]?.id ?? '')} />
      ) : null
      // The row's panel sits behind it, drawn first and placed absolutely, so the row draws over it.
      const hasPanel = s.panelStyle !== 'none'
      const rowW = width + 84
      const rowH = svgH + 8
      return (
        <Box flexDirection="column">
          <Box flexDirection="column">
          {hasPanel && (
            <Box position="absolute" top={0} left={0}>
              <Svg source={panelSvg(s, rowW, rowH)} alt="" width={rowW} height={rowH} />
            </Box>
          )}
          <Box position="relative" flexDirection="row" alignItems="center" gap={1} paddingX={hasPanel ? 1 : 0} paddingY={hasPanel ? 0.5 : 0}>
            <Svg
              source={source}
              alt={`Prompt progress: ${statsText(r, at)}${hasCrew ? `; ${summaryOf(crew)}` : ''}`}
              width={width}
              height={svgH}
              isInteractive={hasCrew || undefined}
            />
            {crewButton}
            {gear}
            {dismiss}
          </Box>
          </Box>
          {below}
        </Box>
      )
    }

    const width = Math.max(6, Math.min(60, e.props.bodyColumns - 40))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={r.endedAt ? s.done : s.accent}>{barText(r, at, width)}</Text>
          {s.showStats && <Text dimColor>{statsText(r, at)}</Text>}
          {gear}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })

  // The details of one of mandriCrew's agents, opened from its crab on the bar.
  on('ui.render', { component: 'Pane', requestId: CREW_PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { all, at } = await readCrew($)
    const id = await read($, crewSelected)
    return crewPane($, ui, e.surface, all, id, Math.max(at, await $.clock.now()), pick => void update($, crewSelected, () => pick))
  })

  // The settings pane: your crab's level, live previews, past prompts, then every option.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const s = await read($, settings)
    const st = await read($, stats)
    if (!('Input' in ui) || !('Select' in ui)) {
      return <Text>Open the mandriBar settings in the desktop app or the terminal.</Text>
    }
    const { Input, Select } = ui
    const level = levelOf(st.finished)
    const month = new Date(await $.clock.now()).getMonth()

    const slots = COLOR_SLOTS.filter(c => c.shows(s))
    const picked = await read($, paletteTarget)
    const target: ColorKey = slots.find(c => c.key === picked)?.key ?? 'accent'
    const current = s[target]
    const setColor = (hex: string) => save($, prev => ({ ...prev, [target]: hex, preset: 'custom' }))
    const onOff = (key: string, label: string, value: boolean, set: (v: boolean) => void, yes = 'On', no = 'Off') => (
      <Select
        key={key}
        label={`${label} `}
        value={value ? 'on' : 'off'}
        options={[
          { value: 'on', label: yes },
          { value: 'off', label: no },
        ]}
        onSelect={v => set(v === 'on')}
      />
    )

    const base: Run = {
      turnId: 'preview',
      startedAt: 0,
      endedAt: 0,
      tools: 5,
      reason: '',
      activity: 'edit',
      ticks: [
        { kind: 'read', at: 0.08 },
        { kind: 'read', at: 0.16 },
        { kind: 'run', at: 0.3 },
        { kind: 'edit', at: 0.45 },
        { kind: 'edit', at: 0.55 },
      ],
      isWaiting: false,
      lastEventAt: 13000,
      expected: 30,
    }
    const previews: [string, Run, number][] = [
      ['Working', base, Infinity],
      ['Waiting for you', { ...base, activity: 'run', isWaiting: true }, Infinity],
      ['Finished', { ...base, endedAt: 18000, reason: 'answer' }, 0],
      ['Stopped', { ...base, endedAt: 9000, reason: 'aborted' }, Infinity],
    ]
    const isDesktop = e.surface !== 'terminal' && 'Svg' in ui

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>
          Level {level} crab · {st.finished} finished prompts · {toNextLevel(st.finished)} to level {level + 1}
        </Text>
        {isDesktop ? (
          <Box flexDirection="column" gap={1}>
            {previews.map(([label, r, since]) => (
              <Box key={`mandribar-prev-${label}`} flexDirection="column">
                <Text dimColor>{label}</Text>
                <ui.Svg source={barSvg(s, r, 14000, 340, 42, since)} alt={`${label} preview`} width={340} height={heightOf(s)} />
              </Box>
            ))}
            <Text bold>Past prompts</Text>
            <ui.Svg source={historySvg(st, s, 340)} alt="Past prompts" width={340} height={70} />
          </Box>
        ) : (
          <Text color={s.accent}>{barText(base, 14000, 30)}</Text>
        )}
        <Select
          key="mandribar-preset"
          label="Preset "
          value={s.preset}
          options={Object.keys(PRESET_LABEL).map(k => ({ value: k, label: PRESET_LABEL[k] ?? k }))}
          onSelect={value => {
            const p = PRESETS[value]
            if (p) void save($, prev => ({ ...prev, ...p, preset: value }))
          }}
        />
        <Select
          key="mandribar-track-style"
          label="Bar background "
          value={s.trackStyle}
          options={[
            { value: 'solid', label: 'Solid colour' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'transparent', label: 'Transparent' },
          ]}
          onSelect={value => void save($, prev => ({ ...prev, trackStyle: value as TrackStyle }))}
        />
        <Select
          key="mandribar-panel-style"
          label="Row background "
          value={s.panelStyle}
          options={[
            { value: 'none', label: 'None' },
            { value: 'solid', label: 'Solid colour' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          onSelect={value => void save($, prev => ({ ...prev, panelStyle: value as PanelStyle }))}
        />

        <Text bold>Colours</Text>
        <Select
          key="mandribar-palette-target"
          label="Colour for "
          value={target}
          options={COLOR_SLOTS.filter(c => c.shows(s)).map(c => ({ value: c.key, label: c.label }))}
          onSelect={value => void update($, paletteTarget, () => value)}
        />
        <Box flexDirection="column" gap={1}>
          {PALETTE.map((row, i) => (
            <Box key={`mandribar-palette-row-${i}`} flexDirection="row" gap={1}>
              {row.map(hex => (
                <Box key={`mandribar-swatch-${hex}`} flexDirection="column" alignItems="center">
                  {isDesktop && 'Svg' in ui ? (
                    <ui.Svg source={swatchSvg(hex, hex === current)} alt={hex} width={SWATCH} height={SWATCH} isInteractive />
                  ) : (
                    <Text color={hex}>██</Text>
                  )}
                  <Button key={`mandribar-pick-${hex}`} label={hex === current ? '✓' : '·'} plain onPress={() => void setColor(hex)} />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Text>
          <Text color={current}>████</Text> {current}
        </Text>
        <Input
          key={`mandribar-hex-${target}`}
          label="Custom "
          placeholder="#rrggbb"
          value={current}
          submitLabel="apply"
          onSubmit={value => {
            const v = value.trim()
            const hex = /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : null
            if (hex) void setColor(hex.toLowerCase())
            else $.ui.toast(`"${v}" is not a colour: use #rrggbb`)
          }}
        />

        <Select
          key="mandribar-particles"
          label="Particles "
          value={s.particles}
          options={PARTICLES.map(v => ({ value: v, label: PARTICLE_LABEL[v] }))}
          onSelect={value => void save($, prev => ({ ...prev, particles: value as Particles }))}
        />
        <Select
          key="mandribar-texture"
          label="Fill "
          value={s.texture}
          options={TEXTURES.map(t => ({ value: t, label: TEXTURE_LABEL[t] }))}
          onSelect={value => void save($, prev => ({ ...prev, texture: value as Texture }))}
        />
        <Select
          key="mandribar-crab-place"
          label="Crab position "
          value={s.crabPlace}
          options={[
            { value: 'on', label: 'Standing on the bar' },
            { value: 'inside', label: 'Inside the bar' },
          ]}
          onSelect={value => void save($, prev => ({ ...prev, crabPlace: value as CrabPlace }))}
        />
        <Select
          key="mandribar-outfit"
          label="Outfit "
          value={s.outfit}
          options={OUTFITS.map(o => ({
            value: o,
            label: isUnlocked(o, level, month) ? OUTFIT_LABEL[o] : `${OUTFIT_LABEL[o]} 🔒 level ${OUTFIT_LEVEL[o]}`,
          }))}
          onSelect={value => {
            const o = value as Outfit
            if (isUnlocked(o, level, month)) void save($, prev => ({ ...prev, outfit: o }))
            else $.ui.toast(`${OUTFIT_LABEL[o]} unlocks at level ${OUTFIT_LEVEL[o]}.`)
          }}
        />
        <Select
          key="mandribar-motion"
          label="Crab motion "
          value={s.motion}
          options={MOTIONS.map(m => ({ value: m, label: m[0]!.toUpperCase() + m.slice(1) }))}
          onSelect={value => void save($, prev => ({ ...prev, motion: value as Motion }))}
        />
        {onOff('mandribar-sound', 'Finish sound', s.sound, v => void save($, prev => ({ ...prev, sound: v })))}
        <Button key="mandribar-test-sound" label="Play the finish sound" onPress={() => playChime($)} />
        {onOff('mandribar-context', 'Context meter', s.contextMeter, v => void save($, prev => ({ ...prev, contextMeter: v })))}
        {onOff('mandribar-stats', 'Stats', s.showStats, v => void save($, prev => ({ ...prev, showStats: v })), 'Show status, time and tools', 'Bar and crab only')}
        <Button key="mandribar-reset" label="Reset to Night Owl" onPress={() => void save($, () => DEFAULTS)} />
      </Box>
    )
  })
}
