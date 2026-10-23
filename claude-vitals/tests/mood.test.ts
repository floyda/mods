import { describe, expect, test } from 'claude-code/testing'

import {
  frameAt,
  frameIndex,
  framesOf,
  isBlinking,
  SMALL_HEIGHT,
  SMALL_WIDTH,
  smallFrameAt,
  smallFramesOf,
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
  test('every frame of every mood is 32 × 32', () => {
    for (const mood of MOODS) {
      for (const frame of framesOf(mood)) {
        expect(frame).toHaveLength(SPRITE_HEIGHT)
        for (const row of frame) expect([...row]).toHaveLength(SPRITE_WIDTH)
      }
    }
    expect(SPRITE_WIDTH).toBe(32)
  })

  test('text mode has a small claw for every frame, 12 × 8, in step with the large one', () => {
    for (const mood of MOODS) {
      expect(smallFramesOf(mood)).toHaveLength(framesOf(mood).length)
      for (const frame of smallFramesOf(mood)) {
        expect(frame).toHaveLength(SMALL_HEIGHT)
        for (const row of frame) expect([...row]).toHaveLength(SMALL_WIDTH)
      }
    }
    expect([SMALL_WIDTH, SMALL_HEIGHT]).toEqual([12, 8])
    expect(smallFrameAt('working', 250)).toBe(smallFramesOf('working')[frameIndex('working', 250)])
  })

  test('each mood looks like itself', () => {
    const has = (mood: Mood, i: number, mark: string) => framesOf(mood)[i]?.join('').includes(mark) === true
    expect(has('content', 0, 'E')).toBe(true)
    expect(has('content', 1, 'E')).toBe(false)
    expect(has('cold', 0, 'O')).toBe(false)
    expect(has('cold', 0, 'F')).toBe(true)
    expect(framesOf('working')[1]).not.toEqual(framesOf('working')[0])
    expect(has('sweating', 0, 'B')).toBe(true)
    expect(framesOf('celebrating').every((_, i) => has('celebrating', i, 'S'))).toBe(true)
    expect(has('asleep', 0, 'Z')).toBe(true)
    expect(has('asleep', 0, 'K')).toBe(true)
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
    const picture = spriteRgba(frameAt('content', 0), 4)
    expect(picture.width).toBe(128)
    expect(picture.height).toBe(128)
    expect(picture.rgba).toHaveLength(Math.ceil((128 * 128 * 4) / 3) * 4)
    // Text mode: its own 12 × 8 art, two pixels a cell: 12 columns × 4 rows.
    expect(spriteCells(smallFrameAt('content', 0))).toHaveLength(Math.ceil((12 * 4 * 12) / 3) * 4)
  })
})
