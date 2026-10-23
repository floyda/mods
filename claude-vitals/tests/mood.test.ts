import { describe, expect, test } from 'claude-code/testing'

import {
  frameAt,
  frameIndex,
  framesOf,
  isBlinking,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  spriteCells,
  spriteRgba,
} from '../hooks/graphics/sprite'
import { limitName, moodLabel, moodOf } from '../hooks/mood'
import type { Mood, MoodInput } from '../hooks/mood'

const NOW = 50_000_000
const MINUTE = 60_000
const BASE: MoodInput = {
  cache: 'warm',
  contextPercent: 14,
  limits: [],
  isWorking: false,
  celebrateUntil: 0,
  lastActiveAt: NOW,
  now: NOW,
}
const MOODS: Mood[] = ['cold', 'sweating', 'working', 'celebrating', 'asleep', 'content']

describe('mood', () => {
  test('the most urgent mood wins: cold, sweating, working, celebrating, asleep, content', () => {
    expect(moodOf({ ...BASE, cache: 'cold', contextPercent: 95, isWorking: true })).toBe('cold')
    expect(moodOf({ ...BASE, contextPercent: 80, isWorking: true })).toBe('sweating')
    expect(moodOf({ ...BASE, limits: [{ kind: 'five_hour', percentUsed: 85 }] })).toBe('sweating')
    expect(moodOf({ ...BASE, contextPercent: 79.9 })).toBe('content')
    expect(moodOf({ ...BASE, isWorking: true, celebrateUntil: NOW + 1 })).toBe('working')
    expect(moodOf({ ...BASE, celebrateUntil: NOW + 1, lastActiveAt: NOW - 11 * MINUTE })).toBe('celebrating')
    expect(moodOf({ ...BASE, lastActiveAt: NOW - 10 * MINUTE })).toBe('asleep')
    expect(moodOf({ ...BASE, cache: 'none' })).toBe('content')
    expect(moodOf(BASE)).toBe('content')
  })

  test('the label says why', () => {
    const cold = { ...BASE, cache: 'cold' as const }
    expect(moodLabel('cold', cold)).toBe('cache cold')
    expect(moodLabel('sweating', { ...BASE, contextPercent: 84 })).toBe('context 84%')
    expect(
      moodLabel('sweating', { ...BASE, contextPercent: 20, limits: [{ kind: 'five_hour', percentUsed: 91 }] }),
    ).toBe('limit 5h 91%')
    expect(moodLabel('working', BASE)).toBe('working')
    expect(moodLabel('asleep', BASE)).toBe('asleep')
    expect(moodLabel('celebrating', BASE)).toBeNull()
    expect(moodLabel('content', BASE)).toBeNull()
    expect(limitName('seven_day')).toBe('7d')
    expect(limitName('spend_limit')).toBe('spend')
    expect(limitName('other')).toBe('other')
  })
})

describe('sprite', () => {
  test('every frame of every mood is 14 × 10', () => {
    for (const mood of MOODS) {
      for (const frame of framesOf(mood)) {
        expect(frame).toHaveLength(SPRITE_HEIGHT)
        for (const row of frame) expect([...row]).toHaveLength(SPRITE_WIDTH)
      }
    }
  })

  test('each mood looks like itself', () => {
    expect(framesOf('cold')[0]?.join('')).not.toContain('O')
    expect(framesOf('working')[1]?.[0]).toBe('..............')
    expect(framesOf('asleep')[0]?.[5]).toBe('...OKOOOOKO...')
    expect(framesOf('sweating')[0]?.join('')).toContain('B')
    expect(framesOf('celebrating').every(frame => frame.join('').includes('S'))).toBe(true)
  })

  test('working clacks at 4 fps; cold shivers for 200 ms every 5 s', () => {
    expect(frameIndex('working', 0)).toBe(0)
    expect(frameIndex('working', 250)).toBe(1)
    expect(frameIndex('working', 500)).toBe(0)
    expect(frameIndex('cold', 100)).toBe(1)
    expect(frameIndex('cold', 300)).toBe(0)
    expect(frameIndex('cold', 5_100)).toBe(1)
  })

  test('content blinks once every 4 to 7 seconds', () => {
    const starts: number[] = []
    let was = false
    for (let ms = 0; ms < 60_000; ms += 25) {
      const is = isBlinking(ms)
      if (is && !was) starts.push(ms)
      was = is
    }
    expect(starts.length).toBeGreaterThanOrEqual(8)
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0)
      expect(gap).toBeGreaterThanOrEqual(3_900)
      expect(gap).toBeLessThanOrEqual(7_100)
    }
    expect(frameAt('content', starts[0] ?? 0)).toBe(framesOf('content')[1])
  })

  test('pictures and cells come out the expected sizes', () => {
    const picture = spriteRgba(frameAt('content', 0), 8)
    expect(picture.width).toBe(112)
    expect(picture.height).toBe(80)
    expect(picture.rgba).toHaveLength(Math.ceil((112 * 80 * 4) / 3) * 4)
    expect(spriteCells(frameAt('content', 0))).toHaveLength(1120)
  })
})
