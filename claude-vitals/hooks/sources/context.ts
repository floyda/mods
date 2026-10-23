import type { SessionUsage } from 'claude-code'

import type { ContextRow, ContextState, SpendState } from '../../types'


export function contextFrom(usage: Pick<SessionUsage, 'context'>, isExact: boolean, model: string | null): ContextState {
  const breakdown = usage.context.breakdown
  if (breakdown === undefined) {
    return {
      percent: usage.context.percent ?? null,
      tokens: usage.context.tokens ?? null,
      window: usage.context.window,
      rows: null,
      isExact: false,
      model,
    }
  }
  return {
    percent: breakdown.percentage,
    tokens: breakdown.totalTokens,
    window: breakdown.rawMaxTokens,
    rows: breakdown.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    isExact,
    model,
  }
}

export function spendFrom(usage: Pick<SessionUsage, 'rateLimits' | 'cost'>): SpendState {
  return {
    sessionUsd: usage.cost?.usd ?? null,
    limits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt ?? null })),
  }
}

export function splitRows(rows: readonly ContextRow[]): { shown: ContextRow[]; deferred: ContextRow[] } {
  return { shown: rows.filter(r => r.kind !== 'deferred'), deferred: rows.filter(r => r.kind === 'deferred') }
}

export type BarRun = { row: ContextRow; cells: number }

/** The text-mode bar: each used and buffer category at least one cell, in proportion; free space the rest. */
export function barRuns(rows: readonly ContextRow[], window: number, width: number): BarRun[] {
  const runs = rows
    .filter(row => row.kind === 'used' || row.kind === 'buffer')
    .map(row => ({ row, cells: Math.max(1, Math.round((row.tokens / window) * width)) }))
  let taken = runs.reduce((n, r) => n + r.cells, 0)
  while (taken > width) {
    const widest = runs.reduce((a, b) => (b.cells > a.cells ? b : a))
    if (widest.cells > 1) {
      widest.cells -= 1
    } else {
      runs.pop()
    }
    taken = runs.reduce((n, r) => n + r.cells, 0)
  }
  const free = rows.find(row => row.kind === 'free') ?? { name: 'Free space', tokens: 0, kind: 'free' as const }
  return [...runs, { row: free, cells: width - taken }]
}
