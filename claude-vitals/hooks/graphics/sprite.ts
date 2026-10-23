import type { Mood } from '../mood'
import { base64 } from './canvas'

/** One frame: 10 rows of 14 pixels, one character each ('.' transparent). */
export type Frame = readonly string[]

export const SPRITE_WIDTH = 16
export const SPRITE_HEIGHT = 11
/** On the terminal: two pixels a cell, one above the other. */
export const SPRITE_COLUMNS = 16
export const SPRITE_ROWS = 6

// Open pincers raised, a body lit along its top and shaded underneath, two eyes, four legs.
const BODY: Frame = [
  'O..O........O..O',
  'OO.O........O.OO',
  'OOOO........OOOO',
  '.OOO........OOO.',
  '..OO........OO..',
  '..OHHHHHHHHHHO..',
  '...OOEOOOOEOO...',
  '...OOEOOOOEOO...',
  '....DDDDDDDD....',
  '...O.O....O.O...',
  '..O..O....O..O..',
]

// An overlay paints over a frame by row: '.' keeps the pixel, '_' clears it, any other letter paints it.
type Overlay = Record<number, string>
const EYES_SHUT: Overlay = { 6: '.....O....O.....', 7: '.....K....K.....' }
const SWEAT_A: Overlay = { 5: '..............B.', 6: '..............B.' }
const SWEAT_B: Overlay = { 6: '..............B.', 7: '..............B.' }
const FROST: Overlay = { 0: 'F..F........F..F', 9: '......F..F......' }
const MOTION: Overlay = { 1: '....M......M....', 2: '....M......M....' }
const CLAWS_SHUT: Overlay = { 0: '_OO_........_OO_', 1: 'OOOO........OOOO' }
const SPARKLE_1: Overlay = { 0: '.......S........', 1: '......SSS.......', 2: '.......S........', 9: 'S..............S' }
const SPARKLE_2: Overlay = { 1: '.....S....S.....', 3: '....S......S....', 10: '.S............S.' }
const SPARKLE_3: Overlay = { 0: '....S......S....', 2: '.......SS.......', 8: 'S..............S' }
const Z_LEFT: Overlay = { 0: '....ZZZZZ.......', 1: '.......Z........', 2: '......Z.........', 3: '.....Z..........', 4: '....ZZZZZ.......' }
const Z_RIGHT: Overlay = { 0: '......ZZZZZ.....', 1: '.........Z......', 2: '........Z.......', 3: '.......Z........', 4: '......ZZZZZ.....' }

const COLORS: Record<string, number> = {
  O: 0xd97757,
  H: 0xeb9a78,
  D: 0xa8502f,
  E: 0x1b1b1b,
  K: 0x5a2a18,
  I: 0x8fc4f2,
  J: 0xc4e2ff,
  G: 0x5f93c4,
  F: 0xffffff,
  B: 0x4aa3ff,
  M: 0xf3efe6,
  S: 0xfbbf24,
  Z: 0xc9c6ff,
}
const DEFAULT = 0x01000000

function paint(base: Frame, ...overlays: Overlay[]): Frame {
  return base.map((row, y) =>
    overlays.reduce<string>((out, overlay) => {
      const over = overlay[y]
      if (over === undefined) return out
      return [...out]
        .map((pixel, x) => {
          const mark = over[x] ?? '.'
          return mark === '.' ? pixel : mark === '_' ? '.' : mark
        })
        .join('')
    }, row),
  )
}

/** Frozen: the body, its light and its shade each turn to ice. */
const icy = (frame: Frame): Frame => frame.map(row => row.replaceAll('O', 'I').replaceAll('H', 'J').replaceAll('D', 'G'))
const COLD = paint(icy(BODY), FROST)
const SHIVER = COLD.map(row => `.${row.slice(0, -1)}`)
const ASLEEP = paint(BODY, EYES_SHUT)

const FRAMES: Record<Mood, readonly Frame[]> = {
  content: [BODY, ASLEEP],
  cold: [COLD, SHIVER],
  sweating: [paint(BODY, SWEAT_A), paint(BODY, SWEAT_B)],
  working: [paint(BODY, MOTION), paint(BODY, CLAWS_SHUT)],
  celebrating: [paint(BODY, SPARKLE_1), paint(BODY, SPARKLE_2), paint(BODY, SPARKLE_3)],
  asleep: [paint(ASLEEP, Z_LEFT), paint(ASLEEP, Z_RIGHT), ASLEEP],
}

/** Frames a second for the moods that loop; content blinks and cold shivers on their own clocks. */
export const MOOD_FPS: Record<Mood, number> = {
  content: 0,
  cold: 0,
  sweating: 2,
  working: 4,
  celebrating: 6,
  asleep: 1,
}

const BLINK_EVERY_MS = 5_500
const BLINK_MS = 150
const SHIVER_EVERY_MS = 5_000
const SHIVER_MS = 200

function jitter(k: number): number {
  return ((Math.imul(k + 1, 2654435761) >>> 0) % 1501) - 750
}

/** Whether the content claw has its eyes shut at `ms`: one 150 ms blink every 4 to 7 s. */
export function isBlinking(ms: number): boolean {
  const k = Math.floor(ms / BLINK_EVERY_MS)
  const at = k * BLINK_EVERY_MS + BLINK_EVERY_MS / 2 + jitter(k)
  return Math.abs(ms - at) < BLINK_MS / 2
}

export function framesOf(mood: Mood): readonly Frame[] {
  return FRAMES[mood]
}

export function frameIndex(mood: Mood, ms: number): number {
  if (mood === 'content') return isBlinking(ms) ? 1 : 0
  if (mood === 'cold') return ms % SHIVER_EVERY_MS < SHIVER_MS ? 1 : 0
  return Math.floor((ms * MOOD_FPS[mood]) / 1000) % FRAMES[mood].length
}

export function frameAt(mood: Mood, ms: number): Frame {
  return FRAMES[mood][frameIndex(mood, ms)] ?? BODY
}

/** The frame as RGBA pixels, each sprite pixel `scale` × `scale`, transparent where '.'. */
export function spriteRgba(frame: Frame, scale: number): { rgba: string; width: number; height: number } {
  const width = SPRITE_WIDTH * scale
  const height = SPRITE_HEIGHT * scale
  const data = new Uint8Array(width * height * 4)
  frame.forEach((row, y) => {
    ;[...row].forEach((mark, x) => {
      const color = COLORS[mark]
      if (color === undefined) return
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const at = ((y * scale + dy) * width + x * scale + dx) * 4
          data[at] = (color >> 16) & 255
          data[at + 1] = (color >> 8) & 255
          data[at + 2] = color & 255
          data[at + 3] = 255
        }
      }
    })
  })
  return { rgba: base64(data), width, height }
}

/** The frame as a Raster's cells, two pixels a cell with half blocks: `[codePoint, fg, bg]` each, base64. */
export function spriteCells(frame: Frame): string {
  const words: number[] = []
  for (let row = 0; row < SPRITE_ROWS; row++) {
    for (let x = 0; x < SPRITE_COLUMNS; x++) {
      const top = COLORS[frame[row * 2]?.[x] ?? '.']
      const bottom = COLORS[frame[row * 2 + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom ?? DEFAULT, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }
  return base64(new Uint8Array(Uint32Array.from(words).buffer))
}
