import { describe, expect, test } from 'claude-code/testing'

import { costOf } from '../hooks/pricing'
import { afterResponse, cacheView, hitRatio, resumed, withEngineTtl } from '../hooks/sources/cache'
import { INITIAL_CACHE } from '../hooks/state'

const T0 = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 500,
  cache_read_input_tokens: 170_000,
  cache_creation_input_tokens: 9_490,
}
const cents = (usd: number | null) => (usd === null ? null : Math.round(usd * 100) / 100)

describe('cache', () => {
  test('a response starts the countdown and prices the next turn', () => {
    const state = afterResponse(INITIAL_CACHE, T0, USAGE)
    expect(state.lastRequestAt).toBe(T0)
    expect(state.tokens).toBe(180_000)
    expect(state.recent).toEqual([{ read: 170_000, input: 179_500 }])

    const view = cacheView(state, T0 + 7 * MINUTE + 50_000)
    expect(view.status).toBe('warm')
    expect(view.leftMs).toBe(3_130_000)
    expect(view.ttl).toBe('1h')
    expect(Math.round((view.hit ?? 0) * 100)).toBe(95)
    expect(cents(view.warmUsd)).toBe(0.04)
    expect(cents(view.coldUsd)).toBe(1.44)
  })

  test('it goes cold when the TTL runs out', () => {
    const view = cacheView(afterResponse(INITIAL_CACHE, T0, USAGE), T0 + HOUR)
    expect(view.status).toBe('cold')
    expect(view.leftMs).toBe(0)
    expect(view.fraction).toBe(0)
  })

  test('before any response there is nothing to count', () => {
    const view = cacheView(INITIAL_CACHE, T0)
    expect(view.status).toBe('none')
    expect(view.hit).toBeNull()
  })

  test('the hit ratio covers the last five responses', () => {
    let state = afterResponse(INITIAL_CACHE, T0, { ...USAGE, cache_read_input_tokens: 0, input_tokens: 100, cache_creation_input_tokens: 0 })
    for (let i = 1; i <= 5; i++) {
      state = afterResponse(state, T0 + i * 1000, { ...USAGE, cache_read_input_tokens: 50, input_tokens: 50, cache_creation_input_tokens: 0 })
    }
    expect(state.recent).toHaveLength(5)
    expect(hitRatio(state)).toBe(0.5)
  })

  test('the TTL is learned from hits and misses after a pause, and the engine’s word wins', () => {
    const first = afterResponse({ ...INITIAL_CACHE, ttl: '5m' }, T0, USAGE)
    const hitAfterPause = afterResponse(first, T0 + 20 * MINUTE, USAGE)
    expect(hitAfterPause.ttl).toBe('1h')
    expect(hitAfterPause.ttlSource).toBe('learned')

    const missAfterPause = afterResponse(first, T0 + 10 * MINUTE, { ...USAGE, cache_read_input_tokens: 0 })
    expect(missAfterPause.ttl).toBe('5m')

    const told = withEngineTtl(first, '5m')
    expect(afterResponse(told, T0 + 30 * MINUTE, USAGE).ttl).toBe('5m')
  })

  test('a resumed session starts from its last response', () => {
    const state = resumed(INITIAL_CACHE, T0 - 5 * MINUTE, 90_000, 'claude-opus-5-5')
    expect(cacheView(state, T0).leftMs).toBe(55 * MINUTE)
    expect(state.tokens).toBe(90_000)
  })

  test('a model the price table does not know has no price', () => {
    expect(costOf('some-other-model', 1000, '1h')).toBeNull()
    expect(cacheView(afterResponse(INITIAL_CACHE, T0, { ...USAGE, model: 'x' }), T0).warmUsd).toBeNull()
  })
})
