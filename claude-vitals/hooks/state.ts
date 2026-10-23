import type {
  ActivityState,
  CacheState,
  CcusageState,
  ChangesState,
  ContextState,
  OutputRow,
  PlaceState,
  SpendState,
  TasksState,
  ViewState,
} from '../types'

/** Folded shut until opened: the Changes file list and the context's deferred rows. */
export const DEFAULT_COLLAPSED = ['changes', 'deferred']

export const INITIAL_CACHE: CacheState = {
  lastRequestAt: null,
  tokens: 0,
  model: null,
  ttl: '1h',
  ttlSource: 'default',
  recent: [],
}
export const INITIAL_CONTEXT: ContextState = {
  percent: null,
  tokens: null,
  window: null,
  rows: null,
  isExact: false,
  model: null,
}
export const INITIAL_SPEND: SpendState = { sessionUsd: null, limits: [] }
export const INITIAL_CCUSAGE: CcusageState = {
  status: 'idle',
  error: null,
  updatedAt: null,
  lastStartedAt: null,
  today: null,
  week: [0, 0, 0, 0, 0, 0, 0],
  block: null,
}
export const INITIAL_CHANGES: ChangesState = { status: 'pending', branch: null, files: [] }
export const INITIAL_TASKS: TasksState = { running: [], finished: 0 }
export const INITIAL_ACTIVITY: ActivityState = {
  isWorking: false,
  turnStartedAt: 0,
  lastActiveAt: 0,
  lastSaveAt: 0,
  celebrateUntil: 0,
}
export const INITIAL_VIEW: ViewState = {
  collapsed: DEFAULT_COLLAPSED,
  showAllOutputs: false,
  theme: 'dark',
  mode: 'text',
}
export const INITIAL_PLACE: PlaceState = { cwd: '', home: null, tzOffsetMin: 0 }
