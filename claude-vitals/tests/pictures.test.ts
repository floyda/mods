import { describe, expect, test } from 'claude-code/testing'

import { paletteFor } from '../hooks/graphics/palette'
import { cacheColor, cachePill, characterPicture, limitPill, ringPicture, sparkPicture } from '../hooks/graphics/pictures'
import type { Picture } from '../hooks/graphics/pictures'
import { frameAt } from '../hooks/graphics/sprite'
import type { CacheView } from '../hooks/sources/cache'
import type { ContextRow } from '../types'

const DARK = paletteFor('dark')
const ROWS: ContextRow[] = [
  { name: 'Messages', tokens: 83_600, kind: 'used' },
  { name: 'Free space', tokens: 916_400, kind: 'free' },
]
const WARM: CacheView = { status: 'warm', leftMs: 3_000_000, fraction: 0.83, hit: 0.95, ttl: '1h', tokens: 180_000, warmUsd: 0.04, coldUsd: 1.44 }
const COLD: CacheView = { ...WARM, status: 'cold', leftMs: 0, fraction: 0 }
const shape = (p: Picture) => [p.key, p.columns, p.rows, p.source.width, p.source.height]

describe('pictures', () => {
  test('the context ring is 10 × 5 cells of 160 × 160 pixels, made once per input', () => {
    const ring = ringPicture(ROWS, 1_000_000, DARK, '8% used')
    expect(shape(ring)).toEqual(['ring', 10, 5, 160, 160])
    expect(ringPicture(ROWS, 1_000_000, DARK, '8% used')).toBe(ring)
    expect(ringPicture(ROWS, 1_000_000, paletteFor('light'), '8% used')).not.toBe(ring)
  })

  test('the cache pill shimmers only while warm and animated', () => {
    const still = cachePill(WARM, DARK, 30, null)
    expect(shape(still)).toEqual(['cache-pill', 30, 1, 480, 32])
    expect(cachePill(WARM, DARK, 30, 1_000).source.rgba).not.toBe(still.source.rgba)
    expect(cachePill(COLD, DARK, 30, 1_000)).toBe(cachePill(COLD, DARK, 30, null))
  })

  test('limit pills, the sparkline and the claw come out their sizes', () => {
    expect(shape(limitPill(DARK, 'five_hour', 46))).toEqual(['limit-five_hour', 10, 1, 160, 32])
    expect(shape(sparkPicture(DARK, [12, 24, 18, 31, 44, 27, 38.9]))).toEqual(['spark', 8, 2, 128, 64])
    expect(shape(characterPicture(frameAt('content', 0)))).toEqual(['character', 14, 5, 112, 80])
  })

  test('the cache colour moves teal, amber, red as the TTL runs down', () => {
    expect(cacheColor(DARK, 0.5)).toBe(DARK.teal)
    expect(cacheColor(DARK, 0.2)).toBe(DARK.amber)
    expect(cacheColor(DARK, 0.05)).toBe(DARK.red)
  })
})
