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
  /**
   * The cache writes split by TTL, as the API reports them. Not in the engine's types: read where a
   * response carries it, and absent (or null) otherwise.
   */
  cache_creation?: CacheWrites | null
}

export type CacheWrites = { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }

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

/** The TTL a response's cache writes used: the one most of its written tokens went to; null when it wrote none. */
export function writtenTtl(writes: CacheWrites | null | undefined): CacheTtl | null {
  const hour = writes?.ephemeral_1h_input_tokens ?? 0
  const five = writes?.ephemeral_5m_input_tokens ?? 0
  if (hour === 0 && five === 0) return null
  return hour >= five ? '1h' : '5m'
}

/**
 * The cache after a main-thread response. Its writes say the TTL outright. Without them, and with nothing
 * better known, a pause longer than five minutes teaches it: a response that still read from cache means
 * a 1 h TTL; one that read nothing back and wrote afresh within the hour means 5 m.
 */
export function afterResponse(state: CacheState, sentAt: number, usage: StepUsage): CacheState {
  let { ttl, ttlSource } = state
  const gap = state.lastRequestAt === null ? null : sentAt - state.lastRequestAt
  const written = writtenTtl(usage.cache_creation)
  if (written !== null) {
    ttl = written
    ttlSource = 'written'
  } else if ((ttlSource === 'default' || ttlSource === 'learned') && gap !== null && gap > TTL_MS['5m']) {
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

export function withWrittenTtl(state: CacheState, ttl: CacheTtl): CacheState {
  return { ...state, ttl, ttlSource: 'written' }
}

/**
 * The TTL of the main thread's latest response that wrote to the cache, from the end of a transcript
 * (JSON lines; a first line cut short is skipped). Null when none in `text` wrote.
 */
export function ttlFromTranscript(text: string): CacheTtl | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (!line.includes('"assistant"') || !line.includes('ephemeral_')) continue
    let entry: { type?: unknown; isSidechain?: unknown; message?: { usage?: { cache_creation?: CacheWrites | null } } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== 'assistant' || entry.isSidechain === true) continue
    const ttl = writtenTtl(entry.message?.usage?.cache_creation)
    if (ttl !== null) return ttl
  }
  return null
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
