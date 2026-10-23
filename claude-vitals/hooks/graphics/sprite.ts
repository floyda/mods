import type { Mood } from '../mood'
import { base64 } from './canvas'

/** One frame: 10 rows of 14 pixels, one character each ('.' transparent). */
export type Frame = readonly string[]

export const SPRITE_WIDTH = 14
export const SPRITE_HEIGHT = 10
/** On the terminal: two pixels a cell, one above the other. */
export const SPRITE_COLUMNS = 14
export const SPRITE_ROWS = 5

const BODY: Frame = [
  'OO..........OO',
  'O.O........O.O',
  '.OO........OO.',
  '..OO......OO..',
  '...OOOOOOOO...',
  '...OEOOOOEO...',
  '...OOOOOOOO...',
  '...OOOOOOOO...',
  '...O.O..O.O...',
  '..............',
]

// An overlay paints over a frame by row: '.' keeps the pixel, '_' clears it, any other letter paints it.
type Overlay = Record<number, string>
const SWEAT_A: Overlay = { 3: '............B.', 4: '............B.' }
const SWEAT_B: Overlay = { 4: '............B.', 5: '............B.' }
const FROST: Overlay = { 0: 'F............F', 9: '....F....F....' }
const MOTION: Overlay = { 1: 'M............M', 2: 'M............M' }
const CLAWS_SHUT: Overlay = { 0: '__..........__', 1: 'OOO........OOO' }
const EYES_SHUT: Overlay = { 5: '....K....K....' }
const SPARKLE_1: Overlay = { 0: '..S........S..', 9: '.S..........S.' }
const SPARKLE_2: Overlay = { 0: '....S....S....', 4: 'S............S' }
const SPARKLE_3: Overlay = { 6: '.S..........S.', 9: '...S......S...' }
const Z_LOW: Overlay = { 1: '.....ZZZ......', 2: '......Z.......', 3: '.....ZZZ......' }
const Z_HIGH: Overlay = { 0: '......ZZZ.....', 1: '.......Z......', 2: '......ZZZ.....' }
const Z_GONE: Overlay = { 0: '........Z.....' }

const COLORS: Record<string, number> = {
  O: 0xd97757,
  I: 0x9ccfff,
  E: 0x1b1b1b,
  K: 0x7a3a22,
  B: 0x4aa3ff,
  F: 0xffffff,
  M: 0xf3efe6,
  Z: 0xc9c6ff,
  S: 0xfbbf24,
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

const icy = (frame: Frame): Frame => frame.map(row => row.replaceAll('O', 'I'))
const COLD = paint(icy(BODY), FROST)
const SHIVER = COLD.map(row => `.${row.slice(0, -1)}`)

const FRAMES: Record<Mood, readonly Frame[]> = {
  content: [BODY, paint(BODY, EYES_SHUT)],
  cold: [COLD, SHIVER],
  sweating: [paint(BODY, SWEAT_A), paint(BODY, SWEAT_B)],
  working: [paint(BODY, MOTION), paint(BODY, CLAWS_SHUT)],
  celebrating: [paint(BODY, SPARKLE_1), paint(BODY, SPARKLE_2), paint(BODY, SPARKLE_3)],
  asleep: [paint(BODY, EYES_SHUT, Z_LOW), paint(BODY, EYES_SHUT, Z_HIGH), paint(BODY, EYES_SHUT, Z_GONE)],
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
