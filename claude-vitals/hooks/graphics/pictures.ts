import type { ContextRow } from '../../types'
import type { CacheView } from '../sources/cache'
import { Canvas, CELL_H, CELL_W } from './canvas'
import { categoryColor, heat, mix, rgb } from './palette'
import type { Palette, Rgb } from './palette'
import { spriteRgba } from './sprite'
import type { Frame } from './sprite'

export type Picture = {
  key: string
  columns: number
  rows: number
  alt: string
  source: { rgba: string; width: number; height: number }
}

export const RING_COLUMNS = 10
/** The claw as a picture: three rows, beside the header's three lines; the art is square, so about seven columns. */
export const CHARACTER_COLUMNS = 7
export const CHARACTER_ROWS = 3
export const RING_ROWS = 5
const MEMO_LIMIT = 64
const memo = new Map<string, Picture>()

/** Each picture is painted once per distinct input. */
function remember(signature: string, make: () => Picture): Picture {
  const hit = memo.get(signature)
  if (hit !== undefined) return hit
  if (memo.size >= MEMO_LIMIT) memo.clear()
  const made = make()
  memo.set(signature, made)
  return made
}

function pictureOf(key: string, columns: number, rows: number, alt: string, canvas: Canvas): Picture {
  return { key, columns, rows, alt, source: { rgba: canvas.toBase64(), width: canvas.width, height: canvas.height } }
}

/** Teal while more than a quarter of the TTL is left, amber under a quarter, red under a tenth. */
export function cacheColor(pal: Palette, fraction: number): string {
  return fraction > 0.25 ? pal.teal : fraction > 0.1 ? pal.amber : pal.red
}

/** A donut of the used and buffer categories, clockwise from 12 o'clock, on a dark track. */
export function ringPicture(rows: readonly ContextRow[], max: number, pal: Palette, alt: string): Picture {
  const signature = `ring|${pal.theme}|${max}|${rows.map(r => `${r.name}:${r.tokens}:${r.kind}`).join(',')}`
  return remember(signature, () => {
    const width = RING_COLUMNS * CELL_W
    const height = RING_ROWS * CELL_H
    const canvas = new Canvas(width, height)
    const arcs: { from: number; to: number; color: Rgb }[] = []
    let at = 0
    for (const row of rows) {
      if (row.kind !== 'used' && row.kind !== 'buffer') continue
      const size = max > 0 ? row.tokens / max : 0
      arcs.push({ from: at, to: at + size, color: rgb(categoryColor(pal, row)) })
      at += size
    }
    const track = rgb(pal.track)
    const outer = Math.min(width, height) / 2 - 4
    canvas.ring(width / 2, height / 2, outer, outer * 0.68, turn => arcs.find(a => turn >= a.from && turn < a.to)?.color ?? track)
    return pictureOf('ring', RING_COLUMNS, RING_ROWS, alt, canvas)
  })
}

export type PillOptions = {
  key: string
  columns: number
  /** How much of the pill is filled, 0 to 1. */
  fraction: number
  /** The fill's colour along its length, 0 to 1. */
  color: (t: number) => string
  alt: string
  /** Where a soft highlight sits along the fill, 0 to 1; null for none. */
  shimmerAt?: number | null
  /** The fill's opacity, 0 to 1. */
  glow?: number
}

/** A rounded bar one cell tall: a dark track, filled from the left. */
export function pillPicture(pal: Palette, o: PillOptions): Picture {
  const shimmer = o.shimmerAt ?? null
  const glow = o.glow ?? 1
  const signature = [
    'pill', pal.theme, o.key, o.columns, o.fraction.toFixed(3), shimmer === null ? '-' : shimmer.toFixed(2), glow.toFixed(2), o.color(0), o.color(1),
  ].join('|')
  const make = () => {
    const width = o.columns * CELL_W
    const height = CELL_H
    const canvas = new Canvas(width, height)
    const bar = Math.round(height * 0.45)
    const top = (height - bar) / 2
    const track = rgb(pal.track)
    canvas.pill(0, top, width, bar, () => track)
    const fillTo = Math.min(1, Math.max(0, o.fraction)) * width
    canvas.pill(
      0,
      top,
      width,
      bar,
      px => {
        if (px >= fillTo) return null
        const t = px / width
        const lift = shimmer === null ? 0 : 0.35 * Math.max(0, 1 - Math.abs(t - shimmer) * 8)
        return rgb(mix(o.color(t), '#ffffff', lift))
      },
      glow,
    )
    return pictureOf(o.key, o.columns, 1, o.alt, canvas)
  }
  // An animation frame is drawn once and gone: keeping it would push the still pictures out of the memo.
  return shimmer !== null || glow !== 1 ? make() : remember(signature, make)
}

/** The cache pill: the TTL left, coloured by urgency; animated, a highlight sweeps it every 3 s and it pulses in the last 2 minutes. */
export function cachePill(view: CacheView, pal: Palette, columns: number, ms: number | null): Picture {
  const base = cacheColor(pal, view.fraction)
  const isAnimated = ms !== null && view.status === 'warm'
  const shimmerAt = isAnimated ? ((ms % 3_000) / 3_000) * 1.4 - 0.2 : null
  const glow = isAnimated && view.leftMs < 120_000 ? 0.65 + 0.35 * (0.5 + 0.5 * Math.cos((2 * Math.PI * ms) / 1_000)) : 1
  return pillPicture(pal, {
    key: 'cache-pill',
    columns,
    fraction: view.fraction,
    color: t => mix(base, pal.text, t * 0.15),
    alt: `${Math.round(view.fraction * 100)}% of the TTL left`,
    shimmerAt,
    glow,
  })
}

/** A rate-limit window: filled to its share used, a heat gradient along its length. */
export function limitPill(pal: Palette, kind: string, percent: number): Picture {
  return pillPicture(pal, {
    key: `limit-${kind}`,
    columns: 10,
    fraction: percent / 100,
    color: t => heat(pal, t),
    alt: `${Math.round(percent)}% used`,
  })
}

/** Seven rounded bars, oldest first, today bright. */
export function sparkPicture(pal: Palette, week: readonly number[]): Picture {
  const signature = `spark|${pal.theme}|${week.join(',')}`
  return remember(signature, () => {
    const columns = 8
    const rows = 2
    const width = columns * CELL_W
    const height = rows * CELL_H
    const canvas = new Canvas(width, height)
    const max = Math.max(0, ...week)
    const slot = width / Math.max(1, week.length)
    const barWidth = slot * 0.55
    week.forEach((value, i) => {
      const isToday = i === week.length - 1
      const barHeight = Math.max(barWidth, max === 0 ? 0 : (value / max) * (height - 6))
      const color = rgb(isToday ? pal.amber : mix(pal.track, pal.amber, 0.45))
      canvas.pill(i * slot + (slot - barWidth) / 2, height - 3 - barHeight, barWidth, barHeight, () => color)
    })
    return pictureOf('spark', columns, rows, week.map(v => `$${Math.round(v)}`).join(' '), canvas)
  })
}

/** The claw at 4 pixels an art pixel (128 × 128), transparent around it; the terminal scales it into its cells. */
export function characterPicture(frame: Frame): Picture {
  return remember(`character|${frame.join('/')}`, () => ({
    key: 'character',
    columns: CHARACTER_COLUMNS,
    rows: CHARACTER_ROWS,
    alt: 'claw',
    source: spriteRgba(frame, 4),
  }))
}
