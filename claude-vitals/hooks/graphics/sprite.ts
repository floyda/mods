import type { Mood } from '../mood'
import { base64 } from './canvas'
import { ART, ART_COLORS, ART_SIZE } from './claw-art'

/** One frame: 32 rows of 32 pixels, one letter each ('.' transparent), drawn by tools/claw.py. */
export type Frame = readonly string[]

export const SPRITE_WIDTH = ART_SIZE
export const SPRITE_HEIGHT = ART_SIZE
/** On the terminal without pictures: the art halved to 16 × 16, two pixels a cell, one above the other. */
export const SPRITE_COLUMNS = ART_SIZE / 2
export const SPRITE_ROWS = ART_SIZE / 4

const COLORS = ART_COLORS
const DEFAULT = 0x01000000
const FRAMES: Record<Mood, readonly Frame[]> = ART

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
  return FRAMES[mood][frameIndex(mood, ms)] ?? FRAMES.content[0] ?? []
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

/** The art halved: each 2 × 2 block becomes its most common opaque colour, or transparent when mostly empty. */
export function halve(frame: Frame): Frame {
  const out: string[] = []
  for (let y = 0; y < frame.length; y += 2) {
    let row = ''
    for (let x = 0; x < (frame[0]?.length ?? 0); x += 2) {
      const block = [frame[y]?.[x], frame[y]?.[x + 1], frame[y + 1]?.[x], frame[y + 1]?.[x + 1]].filter(
        (mark): mark is string => mark !== undefined && mark !== '.',
      )
      if (block.length < 2) {
        row += '.'
        continue
      }
      const counts = new Map<string, number>()
      for (const mark of block) counts.set(mark, (counts.get(mark) ?? 0) + 1)
      row += [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '.'
    }
    out.push(row)
  }
  return out
}

/** The frame as a Raster's cells (the art halved, two pixels a cell with half blocks): `[codePoint, fg, bg]` each, base64. */
export function spriteCells(frame: Frame): string {
  const small = halve(frame)
  const words: number[] = []
  for (let row = 0; row < SPRITE_ROWS; row++) {
    for (let x = 0; x < SPRITE_COLUMNS; x++) {
      const top = COLORS[small[row * 2]?.[x] ?? '.']
      const bottom = COLORS[small[row * 2 + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom ?? DEFAULT, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }
  return base64(new Uint8Array(Uint32Array.from(words).buffer))
}
