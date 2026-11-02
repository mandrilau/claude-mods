// Drawing: the bar above the prompt and the history chart, each one SVG so the
// desktop does not wrap its parts onto new lines.

import { CRAB_CSS, CRAB_H, CRAB_HEADROOM, CRAB_W, SIGN_HEADROOM, crabSvg } from './crab'
import type { CrabLook } from './crab'
import { KIND_COLOR, duration, expectedOf, isFailed, isIdle, progressOf, statsText } from './model'
import type { BarSettings, Particles, Run, Stats } from '../types'

const BAR_H = 16
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"


// The fill colour for a light theme: the dark one mixed most of the way to white.
const lighten = (hex: string, t = 0.72): string => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`
}

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// ---------------------------------------------------------------------------
// Particles: the fill is made of them. Every cell of the filled part holds one,
// sparse at the start and dense toward the crab, twinkling in four out-of-phase
// groups; near the crab more of them stream backward through the bar. A 1s
// life with negative delays keeps the stream steady across the once-a-second redraw.

// Deterministic noise so the fill does not reshuffle between redraws.
const noise = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v)
}

type Style = Exclude<Particles, 'none'>

const PALETTE: Record<Style, readonly string[]> = {
  pixel: ['#e8d5b5', '#c9b38f', '#f5e6c8', '#a89270', '#ffffff'],
  flames: ['#ffd166', '#ff9f1c', '#ff6b35', '#e63946', '#fff1a8'],
  balls: ['#ffffff', '#bde0fe', '#a2d2ff', '#cdb4db', '#ffc8dd'],
  sparkles: ['#fff8dc', '#ffd700', '#ffffff', '#fff3b0', '#ffe066'],
}

const STAR = 'M0,-1L.28,-.28L1,0L.28,.28L0,1L-.28,.28L-1,0L-.28,-.28Z'

const shape = (style: Style, size: number, color: string): string =>
  style === 'pixel'
    ? `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" fill="${color}" shape-rendering="crispEdges"/>`
    : style === 'sparkles'
      ? `<path d="${STAR}" transform="scale(${size / 2})" fill="${color}"/>`
      : `<circle r="${size / 2}" fill="${color}"/>`

// The size of one fill cell's particle, in px.
const CELL_SIZE: Record<Style, number> = { pixel: 2, flames: 2.2, balls: 2.4, sparkles: 3 }

// The fill's texture, in one colour `c` (the particle style's glow, or the bar
// colour without particles). Each returns what goes in <defs>, its CSS, and the
// shapes, all clipped to the filled part; the comet rides on top. Animations
// run in periods that divide one second, so the once-a-second redraw keeps them in phase.
type Tex = { defs: string; css: string; body: string }

// Neon: an even LED grid, every cell lit, dim at the start and bright toward
// the crab, with a brightness wave running toward the head.
const neon = (c: string, fillW: number, barY: number, isDone: boolean): Tex => {
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  const top = barY + (BAR_H - rows * CELL) / 2
  const out: string[] = []
  for (let col = 0; col < cols; col++) {
    const level = 0.18 + 0.72 * Math.pow((col + 1) / Math.max(1, cols), 1.6)
    const cells: string[] = []
    for (let r = 0; r < rows; r++) {
      cells.push(`<rect x="${col * CELL + 0.5}" y="${(top + r * CELL + 0.5).toFixed(1)}" width="2" height="2" rx=".5"/>`)
    }
    out.push(`<g class="w${col % 8}" fill="${c}" fill-opacity="${level.toFixed(2)}">${cells.join('')}</g>`)
  }
  const period = isDone ? 2 : 1
  const css =
    Array.from({ length: 8 }, (_, k) => `.w${k}{animation:wv ${period}s ease-in-out infinite ${(-(7 - k) / 8) * period}s}`).join('') +
    `@keyframes wv{0%,100%{opacity:1}50%{opacity:${isDone ? 0.75 : 0.45}}}`
  return { defs: '', css, body: out.join('') }
}

// A gradient brightening toward the crab: the base of the other textures too.
const ramp = (id: string, c: string, from: number, to: number): string =>
  `<linearGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${from}"/><stop offset=".7" stop-color="${c}" stop-opacity="${(from + to) / 2}"/><stop offset="1" stop-color="${c}" stop-opacity="${to}"/></linearGradient>`

const smooth = (c: string, fillW: number, barY: number): Tex => ({
  defs: ramp('sf', c, 0.35, 0.95),
  css: '',
  body: `<rect x="0" y="${barY}" width="${fillW}" height="${BAR_H}" fill="url(#sf)"/>`,
})

// Candy stripes: diagonal bands that scroll toward the crab, a barber pole.
const stripes = (c: string, fillW: number, barY: number, isDone: boolean): Tex => ({
  defs:
    ramp('sr', c, 0.25, 0.6) +
    `<pattern id="sp" width="12" height="${BAR_H}" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)"><rect width="6" height="${BAR_H}" fill="${c}" fill-opacity=".55"/></pattern>`,
  css: isDone ? '' : '.stp{animation:stp 1s linear infinite}@keyframes stp{to{transform:translateX(12px)}}@media (prefers-reduced-motion: reduce){.stp{animation:none}}',
  body:
    `<rect x="0" y="${barY}" width="${fillW}" height="${BAR_H}" fill="url(#sr)"/>` +
    `<rect class="stp" x="-24" y="${barY}" width="${fillW + 24}" height="${BAR_H}" fill="url(#sp)"/>`,
})

// Liquid: the fill as liquid, two waves rolling on its surface and bubbles rising.
const liquid = (c: string, fillW: number, barY: number, isDone: boolean): Tex => {
  const wave = (y: number, amp: number) => {
    let d = `M-40 ${y}`
    for (let x = -40; x < fillW + 40; x += 20) d += ` q5 ${-amp} 10 0 t10 0`
    return d + ` L${fillW + 40} ${barY + BAR_H} L-40 ${barY + BAR_H}Z`
  }
  const bubbles: string[] = []
  const n = Math.min(14, Math.floor(fillW / 18))
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) * fillW) / Math.max(1, n) + (noise(i, 3) - 0.5) * 8
    bubbles.push(`<circle class="bb" cx="${x.toFixed(1)}" cy="${barY + BAR_H - 2}" r="${(0.8 + noise(i, 9) * 0.9).toFixed(2)}" style="animation-delay:-${noise(i, 4).toFixed(2)}s"/>`)
  }
  return {
    defs: ramp('lq', c, 0.35, 0.75),
    css: isDone
      ? ''
      : `.lw1{animation:lw 1s linear infinite}.lw2{animation:lw 1s linear infinite reverse}@keyframes lw{to{transform:translateX(20px)}}
.bb{fill:#fff;fill-opacity:.55;animation:bb 1s ease-in infinite}@keyframes bb{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-${BAR_H - 5}px);opacity:0}}
@media (prefers-reduced-motion: reduce){.lw1,.lw2,.bb{animation:none}}`,
    body:
      `<path class="lw2" d="${wave(barY + 3.5, 2)}" fill="${c}" fill-opacity=".3"/>` +
      `<path class="lw1" d="${wave(barY + 4.5, 2.5)}" fill="url(#lq)"/>` +
      (isDone ? '' : bubbles.join('')),
  }
}

// Matrix rain: columns of tiny glowing characters falling through the fill.
const GLYPHS = '01<>/*+=#$%&'
const matrix = (c: string, fillW: number, barY: number, isDone: boolean): Tex => {
  const cols: string[] = []
  for (let x = 2, i = 0; x < fillW - 2; x += 6, i++) {
    const level = 0.35 + 0.65 * Math.pow(x / Math.max(1, fillW), 1.4)
    const chars = [0, 1, 2]
      .map(k => {
        const ch = GLYPHS[Math.floor(noise(i, k) * GLYPHS.length)] ?? '0'
        return `<text x="${x}" y="${barY - 2 + k * 6}" fill="${k === 2 ? '#ffffff' : c}" fill-opacity="${k === 2 ? 0.9 : 0.4 + k * 0.25}">${xml(ch)}</text>`
      })
      .join('')
    cols.push(`<g class="mr" style="animation-delay:-${noise(i, 7).toFixed(2)}s" opacity="${level.toFixed(2)}">${chars}</g>`)
  }
  return {
    defs: ramp('mx', c, 0.08, 0.3),
    css: `.mr text{font:700 5.5px monospace}${isDone ? '' : '.mr{animation:mr 1s linear infinite}@keyframes mr{0%{transform:translateY(-8px)}100%{transform:translateY(' + (BAR_H + 2) + 'px)}}@media (prefers-reduced-motion: reduce){.mr{animation:none}}'}`,
    body: `<rect x="0" y="${barY}" width="${fillW}" height="${BAR_H}" fill="url(#mx)"/>${cols.join('')}`,
  }
}

// Segments: separate rounded blocks lit one by one, like a battery meter; the newest pulses.
const SEG_W = 9
const SEG_GAP = 2
const segments = (c: string, fillW: number, barY: number, isDone: boolean): Tex => {
  const out: string[] = []
  const n = Math.floor(fillW / (SEG_W + SEG_GAP))
  for (let i = 0; i < n; i++) {
    const level = 0.35 + 0.6 * Math.pow((i + 1) / Math.max(1, n), 1.3)
    const isNewest = i === n - 1 && !isDone
    out.push(`<rect${isNewest ? ' class="sg1"' : ''} x="${i * (SEG_W + SEG_GAP) + 2}" y="${barY + 3}" width="${SEG_W}" height="${BAR_H - 6}" rx="2" fill="${c}" fill-opacity="${level.toFixed(2)}"/>`)
  }
  return {
    defs: '',
    css: '.sg1{animation:sg1 .5s ease-in-out infinite}@keyframes sg1{50%{fill-opacity:.25}}@media (prefers-reduced-motion: reduce){.sg1{animation:none}}',
    body: out.join(''),
  }
}

const textureOf = (s: BarSettings, c: string, fillW: number, barY: number, isDone: boolean): Tex => {
  switch (s.texture) {
    case 'neon':
      return neon(c, fillW, barY, isDone)
    case 'stripes':
      return stripes(c, fillW, barY, isDone)
    case 'liquid':
      return liquid(c, fillW, barY, isDone)
    case 'matrix':
      return matrix(c, fillW, barY, isDone)
    case 'segments':
      return segments(c, fillW, barY, isDone)
    default:
      return smooth(c, fillW, barY)
  }
}

// The empty part of the bar: one colour, two blending left to right, or none.
const trackOf = (s: BarSettings, barY: number, BAR_W: number): { defs: string; body: string } => {
  if (s.trackStyle === 'transparent') return { defs: '', body: '' }
  const fill = s.trackStyle === 'gradient' ? 'url(#tg)' : s.track
  return {
    defs: s.trackStyle === 'gradient' ? `<linearGradient id="tg"><stop offset="0" stop-color="${s.track}"/><stop offset="1" stop-color="${s.track2}"/></linearGradient>` : '',
    body: `<rect x="0" y="${barY}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${fill}"/>`,
  }
}

// The panel behind the whole row: a rounded card in one colour or a gradient.
export const panelSvg = (s: BarSettings, W: number, H: number): string => {
  const fill = s.panelStyle === 'gradient' ? 'url(#pg)' : s.panel
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="pg"><stop offset="0" stop-color="${s.panel}"/><stop offset="1" stop-color="${s.panel2}"/></linearGradient></defs>
<rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="${fill}"/>
</svg>`
}

// The comet at the head of the fill: a soft streak, a pulsing glow, and particles
// flowing back from the head in one tight line, evenly spaced.
const GLOW: Record<Style, string> = { pixel: '#f5e6c8', flames: '#ff9f1c', balls: '#a2d2ff', sparkles: '#ffd700' }
const COMET_LEN = 72

const cometCss = (style: Style): string => `
@keyframes fl{0%{transform:translateX(0) scale(1);opacity:0}10%{opacity:1}100%{transform:translateX(-${COMET_LEN}px) scale(.3);opacity:0}}
.fl{animation:fl 1s linear infinite}
.fl.sp{animation-name:fls}
@keyframes fls{0%{transform:translateX(0) scale(.4) rotate(0);opacity:0}15%{transform:translateX(-8px) scale(1.2) rotate(30deg);opacity:1}100%{transform:translateX(-${COMET_LEN}px) scale(.2) rotate(120deg);opacity:0}}
@keyframes pulse{0%,100%{opacity:.8;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
.hd{transform-box:fill-box;transform-origin:50% 50%;animation:pulse .5s ease-in-out infinite}
@keyframes flick{0%,100%{opacity:.95}50%{opacity:.6}}
.st{animation:flick ${style === 'flames' ? '.25' : '.5'}s ease-in-out infinite}`

const cometDefs = (style: Style): string => `
<linearGradient id="cg"><stop offset="0" stop-color="${GLOW[style]}" stop-opacity="0"/><stop offset="1" stop-color="${GLOW[style]}" stop-opacity=".9"/></linearGradient>
<radialGradient id="hg"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${GLOW[style]}" stop-opacity=".9"/><stop offset="1" stop-color="${GLOW[style]}" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

const comet = (style: Style, head: number, barY: number, p: number): string => {
  const cy = barY + BAR_H / 2
  const len = Math.max(0, Math.min(COMET_LEN, head))
  const n = Math.round(8 + p * 8)
  const colors = PALETTE[style]
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const y = cy + (noise(i, 5) - 0.5) * 4
    const color = colors[i % colors.length] ?? colors[0]!
    const size = CELL_SIZE[style] * 1.6
    parts.push(`<g transform="translate(${head.toFixed(1)},${y.toFixed(1)})"><g class="pt fl${style === 'sparkles' ? ' sp' : ''}" style="animation-delay:-${(i / n).toFixed(2)}s">${shape(style, size, color)}</g></g>`)
  }
  return `<rect class="st" x="${(head - len).toFixed(1)}" y="${cy - 3}" width="${len.toFixed(1)}" height="6" rx="3" fill="url(#cg)" filter="url(#glow)"/>` +
    `<g filter="url(#glow)">${parts.join('')}</g>` +
    `<circle class="hd pt" cx="${head.toFixed(1)}" cy="${cy}" r="5.5" fill="url(#hg)"/>`
}

// The finish: particles fly out from the crab in every direction, once.
const burst = (style: Style, cx: number, cy: number): string => {
  const colors = PALETTE[style]
  const css: string[] = []
  const out: string[] = []
  const n = 18
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2
    const dist = 12 + noise(i, 11) * 10
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist * 0.7
    const k = `b-${i}`
    css.push(`@keyframes ${k}{0%{transform:translate(0,0) scale(1.2);opacity:1}100%{transform:translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.2);opacity:0}}.${k}{animation:${k} .9s cubic-bezier(.2,.7,.3,1) forwards}`)
    const color = colors[i % colors.length] ?? colors[0]!
    out.push(`<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})"><g class="pt ${k}">${shape(style, 3.5, color)}</g></g>`)
  }
  return `<style>${css.join('')}</style>${out.join('')}`
}

const PARTICLE_CSS = '@media (prefers-reduced-motion: reduce){.pt{display:none}[class^=w]{animation:none}}'



// ---------------------------------------------------------------------------
// Layout. The crab stands on the bar or sits inside it (smaller); either way
// it is drawn in front, with room above for its hat, sign and hop.

const INSIDE_SCALE = 0.75
const METER_H = 3
const METER_GAP = 3

const scaleOf = (s: BarSettings): number => (s.crabPlace === 'inside' ? INSIDE_SCALE : 1)

// Room above the crab: a hat needs the most, the sign a little; then as little as the crab's hop.
const headroomOf = (s: BarSettings): number => (s.outfit === 'none' ? SIGN_HEADROOM : CRAB_HEADROOM)

const barYOf = (s: BarSettings): number =>
  s.crabPlace === 'inside' ? Math.ceil(headroomOf(s) * INSIDE_SCALE + 4) : headroomOf(s) + CRAB_H - 6 + 1

export const heightOf = (s: BarSettings): number => barYOf(s) + BAR_H + 1 + (s.contextMeter ? METER_GAP + METER_H : 0)

const meterColor = (pct: number): string => (pct >= 85 ? '#ef5350' : pct >= 60 ? '#ecc48d' : '#7fdbca')

export const barSvg = (s: BarSettings, r: Run, at: number, W: number, context: number | null, sinceEnd = Infinity): string => {
  const H = heightOf(s)
  const stats = s.showStats ? statsText(r, at) : ''
  const statsW = stats ? Math.round(stats.length * 6.2) + 12 : 0
  const BAR_W = Math.max(60, W - statsW - 4)
  const p = progressOf(r, at)
  const fillW = Math.round(BAR_W * p)
  const isDone = r.endedAt > 0
  const failed = isDone && isFailed(r)
  const won = isDone && r.reason === 'answer'
  const dozing = isIdle(r, at)
  const color = failed ? '#ef5350' : isDone ? s.done : s.accent
  const barY = barYOf(s)
  const style = s.particles === 'none' ? null : s.particles
  const justEnded = sinceEnd < 1500

  const look: CrabLook = {
    face: won ? 'happy' : failed ? 'sad' : dozing ? 'sleep' : 'normal',
    prop: isDone ? null : r.activity,
    outfit: s.outfit,
    isWaiting: !isDone && r.isWaiting,
    isDozing: dozing,
  }
  const motion = won ? 'party' : failed ? 'sad' : dozing ? 'doze' : r.isWaiting ? '' : s.motion

  const scale = scaleOf(s)
  const crabW = CRAB_W * scale
  const crabH = CRAB_H * scale
  const crabX = Math.max(0, Math.min(BAR_W - crabW, fillW - crabW / 2))
  const crabY = s.crabPlace === 'inside' ? barY + (BAR_H - crabH) / 2 - 1 : barY - CRAB_H + 6
  // The comet's head sits just behind the crab.
  const head = Math.max(0, s.crabPlace === 'inside' ? crabX + 3 : fillW - 2)

  // The fill: its base colour, the texture in the particle style's glow (or the
  // bar colour without particles), and the comet at the head.
  const tex = textureOf(s, isDone || !style ? color : GLOW[style], fillW, barY, isDone)
  const track = trackOf(s, barY, BAR_W)
  const fill =
    `<g clip-path="url(#fc)"><rect class="fb" x="0" y="${barY}" width="${fillW}" height="${BAR_H}"/>${tex.body}<rect x="0" y="${barY}" width="${fillW}" height="${BAR_H}" fill="url(#gl)"/>` +
    (isDone ? '' : style ? comet(style, head, barY, p) : `<rect class="sh" x="-40" y="${barY}" width="40" height="${BAR_H}" fill="url(#shg)"/>`) +
    '</g>'

  // One line per tool call, top to bottom of the bar, coloured by kind, where the bar stood when it ran.
  const ticks = r.ticks
    .map(t => {
      const x = Math.max(2, Math.min(BAR_W - 2, Math.round(t.at * BAR_W)))
      return `<rect x="${x - 0.5}" y="${barY + 3}" width="1" height="${BAR_H - 6}" rx=".5" fill="${KIND_COLOR[t.kind]}" fill-opacity=".7"/>`
    })
    .join('')

  // At the finish: a light sweeps the bar once and the particles burst from the crab.
  const sweep = won && justEnded ? `<rect class="sw" x="-60" y="${barY}" width="60" height="${BAR_H}" fill="url(#shg)" clip-path="url(#bc)"/>` : ''
  const fx = style && won && justEnded ? burst(style, crabX + crabW / 2, crabY + crabH / 2) : ''

  const meterY = barY + BAR_H + METER_GAP
  const pct = context ?? 0
  const meter = s.contextMeter
    ? `<rect x="0" y="${meterY}" width="${BAR_W}" height="${METER_H}" rx="${METER_H / 2}" fill="${s.trackStyle === 'transparent' ? s.fill : s.track}"/>` +
      (context === null ? '' : `<rect x="0" y="${meterY}" width="${Math.round((BAR_W * Math.min(100, pct)) / 100)}" height="${METER_H}" rx="${METER_H / 2}" fill="${meterColor(pct)}"/>`)
    : ''
  const meterText = s.contextMeter && s.showStats && context !== null
    ? `<text class="m" x="${W}" y="${meterY + METER_H + 1}" text-anchor="end" font-family="${FONT}" font-size="9">${Math.round(pct)}% context</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.m{fill:#6b6b68}.fb{fill:${lighten(s.fill)}}@media (prefers-color-scheme: dark){.m{fill:#8f9aa3}.fb{fill:${s.fill}}}
.sh{animation:shm 1s linear infinite}
@keyframes shm{to{transform:translateX(${fillW + 40}px)}}
.sw{animation:swp .9s ease-out forwards}
@keyframes swp{to{transform:translateX(${BAR_W + 60}px)}}
.wt{animation:wt 1s ease-in-out infinite}
@keyframes wt{50%{stroke-opacity:.15}}
@media (prefers-reduced-motion: reduce){.sh,.sw{animation:none;opacity:0}.wt{animation:none}}
${CRAB_CSS}
${tex.css}
${style && !isDone ? cometCss(style) : ''}
${PARTICLE_CSS}
</style>
<defs>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
<linearGradient id="shg"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
${style ? cometDefs(style) : ''}
${tex.defs}
${track.defs}
<filter id="cs" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".65"/></filter>
<clipPath id="fc"><rect x="0" y="${barY}" width="${fillW}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath>
<clipPath id="bc"><rect x="0" y="${barY}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath>
</defs>
${track.body}
${fill}
${ticks}
${sweep}
<rect${!isDone && r.isWaiting ? ' class="wt"' : ''} x=".5" y="${barY + 0.5}" width="${BAR_W - 1}" height="${BAR_H - 1}" rx="${(BAR_H - 1) / 2}" fill="none" stroke="${color}" stroke-opacity=".6"/>
${meter}
${fx}
<g filter="url(#cs)">${crabSvg(crabX, crabY, s.crab, motion, scale, look)}</g>
${stats ? `<text class="m" x="${W}" y="${barY + BAR_H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(stats)}</text>` : ''}
${meterText}
</svg>`
}

// The history chart: one column per past prompt, its height the time it took.
export const historySvg = (stats: Stats, s: BarSettings, W: number): string => {
  const H = 70
  const list = stats.history.slice(-24)
  const max = Math.max(10, ...list.map(h => h.secs))
  const colW = list.length ? Math.min(14, (W - 4) / list.length) : 14
  const cols = list
    .map((h, i) => {
      const hgt = Math.max(2, Math.round(((H - 22) * h.secs) / max))
      const fill = h.reason === 'answer' ? s.done : h.reason === 'aborted' ? '#ecc48d' : '#ef5350'
      return `<rect x="${(i * colW + 1).toFixed(1)}" y="${H - 14 - hgt}" width="${Math.max(2, colW - 3).toFixed(1)}" height="${hgt}" rx="1.5" fill="${fill}" opacity=".9"><title>${duration(h.secs)} · ${h.tools} tools</title></rect>`
    })
    .join('')
  const label = list.length
    ? `last ${list.length} prompts · typical ${duration(expectedOf(stats.history))} · longest ${duration(max)}`
    : 'No prompts yet: the chart fills as you work.'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.m{fill:#6b6b68}@media (prefers-color-scheme: dark){.m{fill:#8f9aa3}}</style>
<rect x="0" y="${H - 14}" width="${W}" height="1" fill="${s.track}"/>
${cols}
<text class="m" x="0" y="${H - 2}" font-family="${FONT}" font-size="10">${xml(label)}</text>
</svg>`
}

// The terminal: block characters and the crab as a glyph at the head.
export const barText = (r: Run, at: number, width: number): string => {
  const filled = Math.round(width * progressOf(r, at))
  return '█'.repeat(Math.max(0, filled - 1)) + '▣' + '░'.repeat(Math.max(0, width - filled))
}
