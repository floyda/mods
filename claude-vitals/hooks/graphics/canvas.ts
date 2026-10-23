import type { Rgb } from './palette'

/** Pixels painted per terminal cell: the terminal scales the picture down to its own cells. */
export const CELL_W = 16
export const CELL_H = 32

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64. */
export function base64(bytes: Uint8Array): string {
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

/** How much of a pixel a shape covers, from its signed distance to the edge (negative inside). */
export function coverage(distance: number): number {
  return Math.min(1, Math.max(0, 0.5 - distance))
}

function roundRectDistance(px: number, py: number, x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** An RGBA picture, transparent until painted. */
export class Canvas {
  readonly data: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4)
  }

  /** Paints `color` over one pixel at `alpha` (0 to 1), source over. */
  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const at = (y * this.width + x) * 4
    const a = Math.min(1, alpha)
    const under = (this.data[at + 3] ?? 0) / 255
    const out = a + under * (1 - a)
    for (let c = 0; c < 3; c++) {
      const src = color[c] ?? 0
      const dst = this.data[at + c] ?? 0
      this.data[at + c] = out === 0 ? 0 : Math.round((src * a + dst * under * (1 - a)) / out)
    }
    this.data[at + 3] = Math.round(out * 255)
  }

  /** A rounded bar (its radius half its shorter side), anti-aliased; `paint` colours each pixel column, null skips it. */
  pill(x: number, y: number, w: number, h: number, paint: (px: number) => Rgb | null, alpha = 1): void {
    const r = Math.min(w, h) / 2
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px++) {
        const color = paint(px)
        if (color === null) continue
        this.blend(px, py, color, coverage(roundRectDistance(px + 0.5, py + 0.5, x, y, w, h, r)) * alpha)
      }
    }
  }

  /** A ring between two radii, anti-aliased; `paint` colours it by turn, 0 to 1 clockwise from 12 o'clock. */
  ring(cx: number, cy: number, outer: number, inner: number, paint: (turn: number) => Rgb): void {
    const top = Math.max(0, Math.floor(cy - outer - 1))
    const bottom = Math.min(this.height, Math.ceil(cy + outer + 1))
    const left = Math.max(0, Math.floor(cx - outer - 1))
    const right = Math.min(this.width, Math.ceil(cx + outer + 1))
    for (let py = top; py < bottom; py++) {
      for (let px = left; px < right; px++) {
        const dx = px + 0.5 - cx
        const dy = py + 0.5 - cy
        const distance = Math.hypot(dx, dy)
        const cover = coverage(Math.max(distance - outer, inner - distance))
        if (cover <= 0) continue
        const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1
        this.blend(px, py, paint(turn), cover)
      }
    }
  }

  toBase64(): string {
    return base64(this.data)
  }
}
