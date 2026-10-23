import type { SessionUsage } from 'claude-code'

// Canned engine answers for the tests. ccusage's shapes are 20.0.40's own; the figures are made up.

const day = (date: string, totalCost: number, modelBreakdowns: unknown[] = []) => ({
  date,
  inputTokens: 1_000,
  outputTokens: 2_000,
  cacheCreationTokens: 3_000,
  cacheReadTokens: 4_000,
  totalTokens: 10_000,
  totalCost,
  modelsUsed: [],
  modelBreakdowns,
})

const model = (modelName: string, cost: number) => ({
  modelName,
  cost,
  inputTokens: 10,
  outputTokens: 20,
  cacheCreationTokens: 30,
  cacheReadTokens: 40,
})

const WEEK = [
  day('2026-10-15', 12),
  day('2026-10-16', 24),
  day('2026-10-17', 18),
  day('2026-10-18', 31),
  day('2026-10-19', 44),
  day('2026-10-20', 27),
]

export const DAILY_JSON = JSON.stringify({
  daily: [
    ...WEEK,
    day('2026-10-21', 38.9, [
      model('claude-opus-5-5', 25.2),
      model('claude-opus-4-6', 6.0),
      model('claude-sonnet-4-6', 6.1),
      model('claude-haiku-4-5', 1.6),
    ]),
  ],
  totals: { totalCost: 194.9 },
})

export const NO_TODAY_JSON = JSON.stringify({ daily: WEEK, totals: { totalCost: 156 } })

const block = (startTime: string, endTime: string, isActive: boolean) => ({
  id: startTime,
  startTime,
  endTime,
  actualEndTime: startTime,
  isActive,
  isGap: false,
  entries: 10,
  costUSD: 12.3,
  models: ['claude-opus-5-5'],
  burnRate: { costPerHour: 9.8, tokensPerMinute: 1_000, tokensPerMinuteForIndicator: 100 },
  projection: { remainingMinutes: 134, totalCost: 61, totalTokens: 1_000_000 },
  tokenCounts: { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 },
  totalTokens: 10,
})

export const BLOCKS_JSON = JSON.stringify({
  blocks: [
    block('2026-10-21T05:00:00.000Z', '2026-10-21T10:00:00.000Z', false),
    block('2026-10-21T11:14:30.000Z', '2026-10-21T16:14:30.000Z', true),
  ],
})

export const NUMSTAT = '120\t4\thooks/register.tsx\n88\t0\thooks/usage.ts\n'

export const DIFF_U0 = [
  'diff --git a/hooks/register.tsx b/hooks/register.tsx',
  'index 1111111..2222222 100644',
  '--- a/hooks/register.tsx',
  '+++ b/hooks/register.tsx',
  '@@ -40,0 +41,3 @@ export const register',
  '+one',
  '@@ -90 +93 @@',
  'diff --git a/new.ts b/new.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.ts',
  '@@ -0,0 +1,2 @@',
  '+a',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
  '',
].join('\n')

export const HOME = '/Users/me'
export const CWD = '/Users/me/Workspace/mods'
/** 14:00 UTC on Wednesday 21 October 2026: 15:00 in the zone `date +%z` reports (+0100). */
export const START = Date.parse('2026-10-21T14:00:00Z')

export const CATEGORIES = [
  { name: 'Messages', tokens: 83_600, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'Memory files', tokens: 30_000, color: 'claude', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 16_700, color: 'success', isDeferred: false, kind: 'used' },
  { name: 'Skills', tokens: 7_900, color: 'warning', isDeferred: false, kind: 'used' },
  { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  { name: 'Free space', tokens: 824_900, color: 'inactive', isDeferred: false, kind: 'free' },
  { name: 'MCP tools (deferred)', tokens: 38_300, color: 'inactive', isDeferred: true, kind: 'deferred' },
]

export type LimitFixture = { kind: string; percentUsed: number; resetsAt?: string }

export const LIMITS: LimitFixture[] = [
  { kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' },
  { kind: 'seven_day', percentUsed: 22, resetsAt: '2026-10-26T08:00:00Z' },
]

/** `$.session.usage()` as the engine answers it, with the window `percent` full. */
export function usageFixture(options: { percent?: number; limits?: LimitFixture[]; costUsd?: number } = {}): SessionUsage {
  const percent = options.percent ?? 14
  const tokens = percent * 10_000
  return {
    startedAt: START - 3_600_000,
    context: {
      tokens,
      window: 1_000_000,
      percent,
      breakdown: {
        categories: CATEGORIES,
        totalTokens: tokens,
        maxTokens: 1_000_000,
        rawMaxTokens: 1_000_000,
        percentage: percent,
        gridRows: [],
        model: 'claude-opus-5-5',
      },
    },
    rateLimits: options.limits ?? LIMITS,
    cost: { usd: options.costUsd ?? 4.12 },
  } as unknown as SessionUsage
}

/** One main-thread response: 180k tokens re-sent next turn, 95% of input read from cache. */
export const STEP_USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 500,
  cache_read_input_tokens: 170_000,
  cache_creation_input_tokens: 9_490,
}

/** The patch an Edit returns in these tests: +2 −1, first change at line 12. */
export const EDIT_HUNK = { oldStart: 10, oldLines: 4, newStart: 10, newLines: 5, lines: [' a', ' b', '-c', '+C', '+D', ' e'] }
