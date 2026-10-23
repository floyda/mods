import type { SessionUsage } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { barRuns, contextFrom, spendFrom, splitRows } from '../hooks/sources/context'
import { Coalescer, Debouncer } from '../hooks/throttle'

const CATEGORIES = [
  { name: 'Messages', tokens: 83_600, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'Memory files', tokens: 30_000, color: 'claude', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 16_700, color: 'success', isDeferred: false, kind: 'used' },
  { name: 'Skills', tokens: 7_900, color: 'warning', isDeferred: false, kind: 'used' },
  { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  { name: 'Free space', tokens: 824_900, color: 'inactive', isDeferred: false, kind: 'free' },
  { name: 'MCP tools (deferred)', tokens: 38_300, color: 'inactive', isDeferred: true, kind: 'deferred' },
]

const USAGE = {
  startedAt: 0,
  context: {
    tokens: 141_600,
    window: 1_000_000,
    percent: 14,
    breakdown: { categories: CATEGORIES, totalTokens: 141_600, maxTokens: 1_000_000, rawMaxTokens: 1_000_000, percentage: 14, gridRows: [], model: 'claude-opus-5-5' },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' }, { kind: 'seven_day', percentUsed: 22 }],
  cost: { usd: 4.12 },
} as unknown as SessionUsage

/** A clock for the throttles: `after` queues, `advance` runs what falls due, letting each job settle. */
function scheduler() {
  let now = 0
  const queue: { at: number; fn: () => void; isCancelled: boolean }[] = []
  const after = (ms: number, fn: () => void) => {
    const timer = { at: now + ms, fn, isCancelled: false }
    queue.push(timer)
    return { cancel: () => void (timer.isCancelled = true) }
  }
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = queue.filter(t => !t.isCancelled && t.at <= until).sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      queue.splice(queue.indexOf(due), 1)
      now = due.at
      due.fn()
      await settle()
    }
    now = until
  }
  return { after, advance }
}

describe('context and spend', () => {
  test('the breakdown becomes rows, kept in the engine’s order', () => {
    const state = contextFrom(USAGE, false, 'claude-opus-5-5')
    expect(state.percent).toBe(14)
    expect(state.tokens).toBe(141_600)
    expect(state.window).toBe(1_000_000)
    expect(state.rows?.map(r => r.name)).toEqual(CATEGORIES.map(c => c.name))
    expect(state.isExact).toBe(false)
    expect(state.model).toBe('claude-opus-5-5')
  })

  test('without a breakdown it keeps the status line’s figures', () => {
    const plain = { ...USAGE, context: { tokens: 50_000, window: 200_000, percent: 25 } } as unknown as SessionUsage
    const state = contextFrom(plain, false, null)
    expect(state.rows).toBeNull()
    expect(state.percent).toBe(25)
    expect(state.window).toBe(200_000)
  })

  test('spend carries the session’s dollars and each limit window', () => {
    expect(spendFrom(USAGE)).toEqual({
      sessionUsd: 4.12,
      limits: [
        { kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' },
        { kind: 'seven_day', percentUsed: 22, resetsAt: null },
      ],
    })
    expect(spendFrom({ rateLimits: [] } as unknown as SessionUsage)).toEqual({ sessionUsd: null, limits: [] })
  })

  test('deferred rows are kept apart from the legend', () => {
    const { shown, deferred } = splitRows(contextFrom(USAGE, false, null).rows ?? [])
    expect(shown).toHaveLength(6)
    expect(deferred.map(r => r.name)).toEqual(['MCP tools (deferred)'])
  })

  test('the text bar gives each used category at least a cell and the rest to free space', () => {
    const runs = barRuns(contextFrom(USAGE, false, null).rows ?? [], 1_000_000, 42)
    expect(runs.map(r => r.cells)).toEqual([4, 1, 1, 1, 1, 34])
    expect(runs.reduce((n, r) => n + r.cells, 0)).toBe(42)
  })

  test('a bar with more categories than cells still fits its width', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, tokens: 10, kind: 'used' as const }))
    expect(barRuns(many, 1000, 10).reduce((n, r) => n + r.cells, 0)).toBe(10)
  })
})

describe('throttles', () => {
  test('the coalescer runs at once, then once more after its gap for everything asked meanwhile', async () => {
    const { after, advance } = scheduler()
    const ran: string[] = []
    const job = (name: string) => async () => void ran.push(name)
    const coalescer = new Coalescer(2000)
    coalescer.request(job('a'), after)
    await advance(0)
    coalescer.request(job('b'), after)
    coalescer.request(job('c'), after)
    await advance(1999)
    expect(ran).toEqual(['a'])
    await advance(1)
    expect(ran).toEqual(['a', 'c'])
  })

  test('the debouncer runs once things go quiet', async () => {
    const { after, advance } = scheduler()
    let runs = 0
    const debouncer = new Debouncer(1000)
    for (let i = 0; i < 3; i++) {
      debouncer.request(async () => void (runs += 1), after)
      await advance(500)
    }
    expect(runs).toBe(0)
    await advance(1000)
    expect(runs).toBe(1)
  })
})
