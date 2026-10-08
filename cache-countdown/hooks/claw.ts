// The claw: 14×10 pixels, drawn two pixels a cell with half blocks on the terminal and as rects on the desktop.

export type Mood = 'warm' | 'warning' | 'cold' | 'handoff' | 'writing'

export const CLAW_COLUMNS = 14
export const CLAW_ROWS = 5

const BODY = [
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

// Each overlay paints over the body: '.' leaves the pixel as it is.
const SWEAT = { 3: '............B.', 4: '............B.' }
const FROST = { 0: 'F............F', 9: '....F....F....' }
const NOTE = { 1: '..........NNN.', 2: '..........NLN.', 3: '..........NNN.', 4: '..........NLN.' }

const COLORS: Record<string, number> = {
  O: 0xd97757,
  I: 0x9ccfff,
  E: 0x1b1b1b,
  B: 0x4aa3ff,
  F: 0xffffff,
  N: 0xf3efe6,
  L: 0x8a8a8a,
}
const DEFAULT = 0x01000000

function pixels(mood: Mood): string[] {
  const isIcy = mood === 'cold' || mood === 'handoff'
  const overlays: Record<number, string>[] = []
  if (mood === 'warning') overlays.push(SWEAT)
  if (isIcy) overlays.push(FROST)
  if (mood === 'handoff' || mood === 'writing') overlays.push(NOTE)

  return BODY.map((row, y) => {
    let out = isIcy ? row.replaceAll('O', 'I') : row
    for (const overlay of overlays) {
      const paint = overlay[y]
      if (paint === undefined) continue
      out = [...out].map((pixel, x) => (paint[x] === '.' ? pixel : paint[x])).join('')
    }
    return out
  })
}

/** The claw as a Raster's cells: `[codePoint, foreground, background]` per cell, base64. */
export function clawCells(mood: Mood): string {
  const grid = pixels(mood)
  const words: number[] = []
  for (let row = 0; row < CLAW_ROWS; row++) {
    for (let x = 0; x < CLAW_COLUMNS; x++) {
      const top = COLORS[grid[row * 2]?.[x] ?? '.']
      const bottom = COLORS[grid[row * 2 + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom ?? DEFAULT, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }

  return base64(new Uint8Array(Uint32Array.from(words).buffer))
}

/** The claw as an SVG of `scale`-pixel squares, for surfaces that draw SVG. */
export function clawSvg(mood: Mood, scale = 4): string {
  const rects = pixels(mood).flatMap((row, y) =>
    [...row].flatMap((pixel, x) => {
      const color = COLORS[pixel]
      if (color === undefined) return []
      const hex = `#${color.toString(16).padStart(6, '0')}`
      return [`<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${hex}"/>`]
    }),
  )
  const width = CLAW_COLUMNS * scale
  const height = CLAW_ROWS * 2 * scale

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

const PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A bar `width` cells long, filled to `fraction` in eighths of a cell. */
export function bar(fraction: number, width: number) {
  const eighths = Math.round(Math.min(1, Math.max(0, fraction)) * width * 8)
  const full = Math.floor(eighths / 8)
  const partial = PARTIAL[eighths % 8] ?? ''
  const filled = '█'.repeat(full) + partial

  return { filled, empty: '░'.repeat(Math.max(0, width - full - (partial ? 1 : 0))) }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }

  return out
}
