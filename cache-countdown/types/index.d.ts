export type CacheTtl = '5m' | '1h'

/** Where the TTL in force came from. */
export type CacheTtlSource = 'setting' | 'engine' | 'learned' | 'default'

export type CacheClock = {
  /** When the main thread's last model request went out (ms); null before the first, after a resume, a compaction or a /clear. */
  lastRequestAt: number | null
  /** When a handoff's request last read the session back from cache, restarting its TTL; null when none has. */
  refreshedAt: number | null
  /** Tokens the next request re-sends: what a cold turn has to cache again. */
  tokens: number
  /** The model that answered the last request, for its prices. */
  model: string | null
}

/** Each field holds the `lastRequestAt` it was last done for, so a new request re-arms it. */
export type CacheAlerts = {
  warnedFor: number | null
  coldFor: number | null
  /** Asked once at submit for this cold cache: the next prompt goes through whatever the answer. */
  askedFor: number | null
  /** The person chose to keep the full context: no band, no question. */
  keptFor: number | null
  /** A handoff was tried while the person was away. */
  awayFor: number | null
}

export type CacheHandoff = {
  /** Where it was saved, or null when the write failed. */
  path: string | null
  text: string
  tokens: number
  /** The `lastRequestAt` of the conversation it hands off. */
  writtenFor: number | null
  at: number
}

export type CacheBusy = 'handing-off' | 'resuming' | null

declare module 'claude-code' {
  interface PluginState {
    'cache-countdown': {
      clock: CacheClock
      ttl: { value: CacheTtl; source: CacheTtlSource }
      now: number
      alerts: CacheAlerts
      busy: CacheBusy
      isWorking: boolean
      lastActivityAt: number
      handoff: CacheHandoff | null
    }
  }
}
