import { atom } from 'claude-code'

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

export const cache = atom({ plugin: 'vitals', key: 'cache' } as const, INITIAL_CACHE)
export const context = atom({ plugin: 'vitals', key: 'context' } as const, INITIAL_CONTEXT)
export const spend = atom({ plugin: 'vitals', key: 'spend' } as const, INITIAL_SPEND)
export const ccusage = atom({ plugin: 'vitals', key: 'ccusage' } as const, INITIAL_CCUSAGE)
export const outputs = atom({ plugin: 'vitals', key: 'outputs' } as const, [] as OutputRow[])
export const changes = atom({ plugin: 'vitals', key: 'changes' } as const, INITIAL_CHANGES)
export const tasks = atom({ plugin: 'vitals', key: 'tasks' } as const, INITIAL_TASKS)
export const activity = atom({ plugin: 'vitals', key: 'activity' } as const, INITIAL_ACTIVITY)
export const view = atom({ plugin: 'vitals', key: 'view' } as const, INITIAL_VIEW)
export const place = atom({ plugin: 'vitals', key: 'place' } as const, INITIAL_PLACE)
export const now = atom({ plugin: 'vitals', key: 'now' } as const, 0)
