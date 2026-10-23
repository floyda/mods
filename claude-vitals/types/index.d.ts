export type Theme = 'dark' | 'light'
export type GraphicsMode = 'pixels' | 'text'
export type CacheTtl = '5m' | '1h'
export type TtlSource = 'engine' | 'learned' | 'default'

export type CacheState = {
  /** When the main thread's last model request went out (ms); null before the first. */
  lastRequestAt: number | null
  /** Prompt tokens the next request re-sends. */
  tokens: number
  /** The model that answered the last request, for its prices. */
  model: string | null
  ttl: CacheTtl
  ttlSource: TtlSource
  /** The last five main-thread responses: tokens read from cache, and all input tokens. */
  recent: { read: number; input: number }[]
}

export type CategoryKind = 'used' | 'free' | 'buffer' | 'deferred'
export type ContextRow = { name: string; tokens: number; kind: CategoryKind }
export type ContextState = {
  percent: number | null
  tokens: number | null
  window: number | null
  /** The /context categories, or null when no breakdown was counted. */
  rows: ContextRow[] | null
  isExact: boolean
  model: string | null
}

export type LimitRow = { kind: string; percentUsed: number; resetsAt: string | null }
export type SpendState = { sessionUsd: number | null; limits: LimitRow[] }

export type ModelSpend = { family: string; usd: number }
export type CcusageToday = { usd: number; byModel: ModelSpend[] }
export type CcusageBlock = { endsAt: number; costPerHour: number; projectedUsd: number }
export type CcusageStatus = 'idle' | 'running' | 'ok' | 'missing' | 'failed'
export type CcusageState = {
  status: CcusageStatus
  /** Why the last run failed: its first stderr line, or what was wrong with its output. */
  error: string | null
  /** When the figures shown were read (ms). */
  updatedAt: number | null
  /** When the last run started (ms), for the after-turn gap. */
  lastStartedAt: number | null
  today: CcusageToday | null
  /** The last seven days' totals, oldest first, today last. */
  week: number[]
  block: CcusageBlock | null
}

export type OutputRow = {
  /** Absolute path. */
  path: string
  added: number
  removed: number
  /** The first changed line of the most recent edit. */
  line: number
  at: number
  /** The subagent that made the most recent edit; null for the main loop. */
  agent: string | null
  isDeleted: boolean
}
export type ChangeRow = { path: string; added: number; removed: number; line: number }
export type ChangesStatus = 'pending' | 'ok' | 'not-git' | 'timeout'
export type ChangesState = { status: ChangesStatus; branch: string | null; files: ChangeRow[] }

export type TaskRow = { id: string; description: string; firstSeenAt: number }
export type TasksState = { running: TaskRow[]; finished: number }

export type ActivityState = {
  isWorking: boolean
  turnStartedAt: number
  lastActiveAt: number
  lastSaveAt: number
  celebrateUntil: number
}

export type ViewState = {
  /** Card ids folded shut, plus 'deferred' for the context's deferred rows. */
  collapsed: string[]
  showAllOutputs: boolean
  theme: Theme
  mode: GraphicsMode
}

export type PlaceState = { cwd: string; home: string | null; tzOffsetMin: number }

declare module 'claude-code' {
  interface PluginState {
    vitals: {
      cache: CacheState
      context: ContextState
      spend: SpendState
      ccusage: CcusageState
      outputs: OutputRow[]
      changes: ChangesState
      tasks: TasksState
      activity: ActivityState
      view: ViewState
      place: PlaceState
      now: number
    }
  }
}
