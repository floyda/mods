import type { Mood } from '../mood'
import { base64 } from './canvas'
import { ART, ART_COLORS, ART_SIZE, ART_SMALL, SMALL_SIZE } from './claw-art'

/** One frame: 32 rows of 32 pixels, one letter each ('.' transparent), drawn by tools/claw.py. */
export type Frame = readonly string[]

export const SPRITE_WIDTH = ART_SIZE
export const SPRITE_HEIGHT = ART_SIZE
/** Text mode's own claw (the terminal cannot scale a picture): 12 × 8 pixels, two a cell, one above the other. */
export const SMALL_WIDTH = SMALL_SIZE[0]
export const SMALL_HEIGHT = SMALL_SIZE[1]
export const SPRITE_COLUMNS = SMALL_WIDTH
export const SPRITE_ROWS = SMALL_HEIGHT / 2

const COLORS = ART_COLORS
const DEFAULT = 0x01000000
const FRAMES: Record<Mood, readonly Frame[]> = ART
const SMALL_FRAMES: Record<Mood, readonly Frame[]> = ART_SMALL

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

export function smallFramesOf(mood: Mood): readonly Frame[] {
  return SMALL_FRAMES[mood]
}

/** Text mode's claw at `ms`: the same frame of the mood as the picture shows. */
export function smallFrameAt(mood: Mood, ms: number): Frame {
  return SMALL_FRAMES[mood][frameIndex(mood, ms)] ?? SMALL_FRAMES.content[0] ?? []
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

/** A small frame as a Raster's cells, two pixels a cell with half blocks: `[codePoint, fg, bg]` each, base64. */
export function spriteCells(small: Frame): string {
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
