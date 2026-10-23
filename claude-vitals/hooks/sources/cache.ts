import type { CacheState, CacheTtl } from '../../types'
import { costOf } from '../pricing'

export const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const RECENT = 5

/** A main-thread response's token counts, as `turn.step` reports them. */
export type StepUsage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type CacheStatus = 'none' | 'warm' | 'cold'

export type CacheView = {
  status: CacheStatus
  leftMs: number
  /** The share of the TTL left, 0 to 1. */
  fraction: number
  hit: number | null
  ttl: CacheTtl
  tokens: number
  warmUsd: number | null
  coldUsd: number | null
}

/**
 * The cache after a main-thread response. After a pause longer than five minutes, a response that still
 * read from cache means a 1 h TTL; one that read nothing back and wrote afresh within the hour means 5 m.
 */
export function afterResponse(state: CacheState, sentAt: number, usage: StepUsage): CacheState {
  let { ttl, ttlSource } = state
  const gap = state.lastRequestAt === null ? null : sentAt - state.lastRequestAt
  if (ttlSource !== 'engine' && gap !== null && gap > TTL_MS['5m']) {
    if (usage.cache_read_input_tokens > 0) {
      ttl = '1h'
      ttlSource = 'learned'
    } else if (gap < TTL_MS['1h'] && usage.cache_creation_input_tokens > 0) {
      ttl = '5m'
      ttlSource = 'learned'
    }
  }
  const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return {
    lastRequestAt: sentAt,
    tokens: input + usage.output_tokens,
    model: usage.model,
    ttl,
    ttlSource,
    recent: [...state.recent, { read: usage.cache_read_input_tokens, input }].slice(-RECENT),
  }
}

export function withEngineTtl(state: CacheState, ttl: CacheTtl): CacheState {
  return { ...state, ttl, ttlSource: 'engine' }
}

export function resumed(state: CacheState, at: number, tokens: number, model: string | null): CacheState {
  return { ...state, lastRequestAt: at, tokens, model: model ?? state.model }
}

/** Cache reads over all input tokens across the recent responses; null before any. */
export function hitRatio(state: CacheState): number | null {
  const input = state.recent.reduce((sum, r) => sum + r.input, 0)
  if (input === 0) return null
  return state.recent.reduce((sum, r) => sum + r.read, 0) / input
}

export function cacheView(state: CacheState, now: number): CacheView {
  if (state.lastRequestAt === null) {
    return { status: 'none', leftMs: 0, fraction: 0, hit: null, ttl: state.ttl, tokens: 0, warmUsd: null, coldUsd: null }
  }
  const ttlMs = TTL_MS[state.ttl]
  const left = state.lastRequestAt + ttlMs - now
  const cost = costOf(state.model, state.tokens, state.ttl)
  return {
    status: left > 0 ? 'warm' : 'cold',
    leftMs: Math.max(0, left),
    fraction: Math.min(1, Math.max(0, left / ttlMs)),
    hit: hitRatio(state),
    ttl: state.ttl,
    tokens: state.tokens,
    warmUsd: cost?.warm ?? null,
    coldUsd: cost?.cold ?? null,
  }
}
