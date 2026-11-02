// The crab: a 24×18 pixel Clawd, with a face, an outfit, and a prop in its right
// claw for what it is doing. Hats and signs reach above the grid (negative y)
// and props to its right (x up to 30): the bar leaves room for both.

import type { Activity, Outfit } from '../types'

const INK = '#1F1E1D'
export const CRAB_W = 24
export const CRAB_H = 18
// How far hats and signs reach above the grid.
export const CRAB_HEADROOM = 9

export type Face = 'normal' | 'happy' | 'sad' | 'sleep'

export type CrabLook = {
  face: Face
  // The prop in the right claw; null for none.
  prop: Activity | null
  outfit: Outfit
  isWaiting: boolean
  isDozing: boolean
}

type R = (x: number, y: number, w: number, h: number, c: string) => string

const rect: R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`

const FACES: Record<Face, (r: R) => string> = {
  normal: r => r(7, 6, 2, 2, INK) + r(15, 6, 2, 2, INK),
  // ^ ^
  happy: r => r(7, 7, 1, 1, INK) + r(8, 6, 1, 1, INK) + r(9, 7, 1, 1, INK) + r(15, 7, 1, 1, INK) + r(16, 6, 1, 1, INK) + r(17, 7, 1, 1, INK),
  // x x and a tear
  sad: r =>
    [[7, 5], [9, 5], [8, 6], [7, 7], [9, 7], [15, 5], [17, 5], [16, 6], [15, 7], [17, 7]].map(([x, y]) => r(x!, y!, 1, 1, INK)).join('') +
    `<g class="tear">${r(18, 8, 1, 2, '#82aaff')}</g>` +
    r(10, 10, 4, 1, INK),
  sleep: r => r(7, 7, 2, 1, INK) + r(15, 7, 2, 1, INK),
}

const OUTFITS: Record<Outfit, (r: R) => string> = {
  none: () => '',
  cap: r => r(6, 1, 12, 3, '#e63946') + r(15, 3, 7, 1, '#b71c2c') + r(11, 0, 2, 1, '#b71c2c'),
  sunglasses: r => r(5, 6, 14, 1, INK) + r(6, 6, 5, 3, INK) + r(13, 6, 5, 3, INK) + r(7, 7, 1, 1, '#fff') + r(14, 7, 1, 1, '#fff'),
  wizard: r =>
    [[11, -6, 2], [10, -5, 4], [10, -4, 4], [9, -3, 6], [9, -2, 6], [8, -1, 8], [8, 0, 8], [7, 1, 10]]
      .map(([x, y, w]) => r(x!, y!, w!, 1, '#5b3fa8'))
      .join('') +
    r(5, 2, 14, 2, '#5b3fa8') + r(7, 1, 10, 1, '#ffd700') + r(12, -3, 1, 1, '#ffd700') + r(10, -1, 1, 1, '#fff3b0'),
  pumpkin: r =>
    r(7, -2, 10, 6, '#ff8c1a') + r(10, -2, 1, 6, '#e06d00') + r(13, -2, 1, 6, '#e06d00') + r(11, -4, 2, 2, '#3a7d2c') +
    r(9, 0, 2, 1, INK) + r(14, 0, 2, 1, INK) + r(10, 2, 5, 1, INK),
  crown: r =>
    r(7, 1, 10, 3, '#ffd700') + r(7, -1, 2, 2, '#ffd700') + r(11, -2, 2, 3, '#ffd700') + r(15, -1, 2, 2, '#ffd700') +
    r(12, 2, 1, 1, '#ef5350') + r(8, 2, 1, 1, '#82aaff') + r(15, 2, 1, 1, '#addb67'),
}

// Props sit by the right claw (20..24, 7..11) and reach up and right of it.
const PROPS: Record<Activity, (r: R) => string> = {
  // A pencil, scribbling.
  think: r => r(28, 0, 2, 2, '#ff8fab') + r(27, 2, 2, 1, '#ffd166') + r(26, 3, 2, 1, '#ffd166') + r(25, 4, 2, 1, '#ffd166') + r(24, 5, 2, 1, '#ffd166') + r(23, 6, 1, 1, INK),
  // A magnifier.
  read: r =>
    r(25, 0, 3, 1, '#3a3a3c') + r(24, 1, 1, 3, '#3a3a3c') + r(28, 1, 1, 3, '#3a3a3c') + r(25, 4, 3, 1, '#3a3a3c') +
    r(25, 1, 3, 3, 'rgba(169,214,245,.75)') + r(25, 1, 1, 1, '#fff') + r(23, 5, 1, 1, '#7A4A26') + r(22, 6, 1, 1, '#7A4A26'),
  // A wrench.
  edit: r => r(24, -1, 1, 2, '#8E929A') + r(27, -1, 1, 2, '#8E929A') + r(24, 1, 4, 2, '#8E929A') + r(25, 3, 2, 5, '#8E929A'),
  // A tiny terminal with a blinking cursor.
  run: r =>
    r(22, -1, 9, 7, '#8E929A') + r(23, 0, 7, 5, INK) + r(24, 1, 1, 1, '#addb67') + r(25, 2, 1, 1, '#addb67') + r(24, 3, 1, 1, '#addb67') +
    `<g class="cur">${r(27, 3, 2, 1, '#addb67')}</g>`,
  // A globe.
  web: r => r(24, -1, 4, 1, '#82aaff') + r(23, 0, 6, 4, '#82aaff') + r(24, 4, 4, 1, '#82aaff') + r(25, -1, 1, 6, '#1d3b53') + r(23, 2, 6, 1, '#1d3b53'),
  // A speech bubble: handing work to a helper.
  agent: r => r(22, -2, 9, 6, '#f8f6f1') + r(23, 4, 2, 1, '#f8f6f1') + r(24, 0, 1, 1, INK) + r(26, 0, 1, 1, INK) + r(28, 0, 1, 1, INK),
  other: r => r(26, 1, 1, 3, '#ffd700') + r(25, 2, 3, 1, '#ffd700'),
}

// Held up in the right claw while Claude waits for your answer.
const SIGN = (r: R): string =>
  r(25, -1, 1, 8, '#7A4A26') + r(21, -9, 9, 8, '#fff8dc') + r(21, -9, 9, 1, '#e8d5b5') + r(25, -8, 2, 4, '#ef5350') + r(25, -3, 2, 1, '#ef5350')

const ZZZ = `<g class="zz"><text x="22" y="2" font-size="6" font-family="monospace" font-weight="700" fill="#d6deeb">z</text><text class="z2" x="26" y="-3" font-size="8" font-family="monospace" font-weight="700" fill="#d6deeb">Z</text></g>`

export const crabSvg = (x: number, y: number, color: string, cls: string, scale: number, look: CrabLook): string => {
  const r: R = (px, py, w, h, c) => rect(px, py, w, h, c)
  const body = r(4, 4, 16, 10, color) + FACES[look.face](r)
  // While waiting, the right claw is raised to hold the sign.
  const right = look.isWaiting ? r(21, 3, 4, 4, color) : r(20, 7, 4, 4, color)
  const claws = `<g class="cl">${r(0, 7, 4, 4, color)}</g><g class="cr">${right}</g>`
  const prop = look.isWaiting ? `<g class="sg">${SIGN(r)}</g>` : look.prop && !look.isDozing ? `<g class="pr">${PROPS[look.prop](r)}</g>` : ''
  const legsA = `<g class="la">${r(5, 14, 2, 4, color)}${r(13, 14, 2, 4, color)}</g>`
  const legsB = `<g class="lb">${r(9, 14, 2, 4, color)}${r(17, 14, 2, 4, color)}</g>`
  const extra = look.isDozing ? ZZZ : ''
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${scale})" shape-rendering="crispEdges"><g class="crab ${cls}"><g class="bd">${body}${OUTFITS[look.outfit](r)}${claws}${prop}</g>${legsA}${legsB}${extra}</g></g>`
}

// Pure CSS, run by the compositor. Periods divide one second, so the
// once-a-second redraw of a running bar restarts them in phase.
export const CRAB_CSS = `
.crab g{transform-box:fill-box}
.walk .la{animation:st .5s steps(1) infinite}.walk .lb{animation:st .5s steps(1) infinite -.25s}
.walk .bd{animation:bob .5s steps(1) infinite -.125s}
.bounce{animation:hop .5s ease-in-out infinite}
.bounce .la,.bounce .lb{animation:st .25s steps(1) infinite}
.dance{transform-box:fill-box;transform-origin:50% 100%;animation:sway 1s ease-in-out infinite}
.dance .cl{animation:up .5s steps(1) infinite}.dance .cr{animation:up .5s steps(1) infinite -.25s}
.party{transform-box:fill-box;transform-origin:50% 100%;animation:victory 1s ease-in-out infinite}
.party .cl,.party .cr{animation:up .25s steps(1) infinite}.party .cr{animation-delay:-.125s}
.party .la,.party .lb{animation:st .25s steps(1) infinite}.party .lb{animation-delay:-.125s}
.sad{animation:droop 2s ease-in-out infinite}
.sad .tear{animation:drip 1s ease-in infinite}
.doze{animation:breathe 2s ease-in-out infinite}
.pr{transform-origin:0 100%;animation:wig .5s ease-in-out infinite}
.sg{transform-origin:20% 100%;animation:wave 1s ease-in-out infinite}
.cur{animation:blink 1s steps(1) infinite}
.zz text{animation:zz 2s ease-out infinite}.zz .z2{animation-delay:-1s}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes hop{50%{transform:translateY(-3px)}}
@keyframes sway{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes up{50%{transform:translateY(-3px)}}
@keyframes victory{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-5px) rotate(-10deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-5px) rotate(10deg)}}
@keyframes droop{50%{transform:translateY(1px)}}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(4px);opacity:0}}
@keyframes breathe{50%{transform:translateY(1px)}}
@keyframes wig{50%{transform:rotate(-12deg)}}
@keyframes wave{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes blink{50%{opacity:0}}
@keyframes zz{0%{transform:translate(0,2px);opacity:0}30%{opacity:1}100%{transform:translate(3px,-5px);opacity:0}}
@media (prefers-reduced-motion: reduce){.crab,.crab g,.crab text{animation:none!important}}`
