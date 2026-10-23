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
