import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CcusageBlock, CcusageState, CcusageToday, ModelSpend } from '../../types'
import { localDate } from '../format'
import * as S from '../state'

export const CCUSAGE_TIMEOUT_MS = 20_000
/** After a turn, ccusage runs again only once this long has passed since it last started. */
export const AFTER_TURN_GAP_MS = 30_000
const DAY_MS = 86_400_000
const FAMILIES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'] as const

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function familyOf(model: string): string {
  const id = model.toLowerCase()
  const family = FAMILIES.find(name => id.includes(name))
  return family === undefined ? 'Other' : family.charAt(0).toUpperCase() + family.slice(1)
}

/** A calendar date `days` away: shiftDate('2026-10-21', -6) is '2026-10-15'. */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** '2026-10-15' → '20261015', as --since takes it. */
export function compactDate(date: string): string {
  return date.replaceAll('-', '')
}

export type DailyFigures = { today: CcusageToday | null; week: number[] }

/** ccusage's daily report → today's spend by model family and the last seven days; null if it is not that report. */
export function parseDaily(json: string, today: string): DailyFigures | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!isRecord(data) || !Array.isArray(data.daily)) return null
  const days = data.daily.filter(isRecord)
  const costOn = new Map<string, number>()
  for (const day of days) {
    const cost = num(day.totalCost)
    if (typeof day.date === 'string' && cost !== null) costOn.set(day.date, cost)
  }
  const week = [-6, -5, -4, -3, -2, -1, 0].map(offset => costOn.get(shiftDate(today, offset)) ?? 0)
  const entry = days.find(day => day.date === today)
  if (entry === undefined) return { today: { usd: 0, byModel: [] }, week }
  const usd = num(entry.totalCost)
  if (usd === null) return { today: null, week }
  const sums = new Map<string, number>()
  const parts = Array.isArray(entry.modelBreakdowns) ? entry.modelBreakdowns.filter(isRecord) : []
  for (const part of parts) {
    const cost = num(part.cost)
    if (typeof part.modelName !== 'string' || cost === null) continue
    const family = familyOf(part.modelName)
    sums.set(family, (sums.get(family) ?? 0) + cost)
  }
  const byModel: ModelSpend[] = [...sums]
    .map(([family, sum]) => ({ family, usd: Math.round(sum * 100) / 100 }))
    .filter(spend => spend.usd >= 0.01)
    .sort((a, b) => b.usd - a.usd)
  return { today: { usd, byModel }, week }
}

/** ccusage's blocks report → the active 5-hour block; null with none active; undefined if it is not that report. */
export function parseBlocks(json: string): CcusageBlock | null | undefined {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!isRecord(data) || !Array.isArray(data.blocks)) return undefined
  const active = data.blocks.filter(isRecord).find(b => b.isActive === true && b.isGap !== true)
  if (active === undefined) return null
  const endsAt = typeof active.endTime === 'string' ? Date.parse(active.endTime) : Number.NaN
  if (Number.isNaN(endsAt)) return undefined
  const costPerHour = isRecord(active.burnRate) ? num(active.burnRate.costPerHour) : null
  const projected = isRecord(active.projection) ? num(active.projection.totalCost) : null
  return { endsAt, costPerHour: costPerHour ?? 0, projectedUsd: projected ?? num(active.costUSD) ?? 0 }
}

export function ccusageArgv(command: string, report: readonly string[]): string[] {
  return [...command.split(/\s+/).filter(part => part !== ''), 'claude', ...report]
}

export type CcusageRun = { isOk: true; stdout: string } | { isOk: false; status: 'missing' | 'failed'; error: string }

function firstLine(text: string): string | null {
  const line = text
    .split('\n')
    .map(part => part.trim())
    .find(part => part !== '')
  return line === undefined ? null : line.slice(0, 120)
}

/** One ccusage report. A run that cannot start is `missing`; one that exits non-zero or times out is `failed`. */
export async function runCcusage($: EngineInterface, command: string, report: readonly string[]): Promise<CcusageRun> {
  const startedAt = await $.clock.now()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(ccusageArgv(command, report), { timeoutMs: CCUSAGE_TIMEOUT_MS })
    if (exitCode !== 0) return { isOk: false, status: 'failed', error: firstLine(stderr) ?? `exit code ${exitCode}` }
    return { isOk: true, stdout }
  } catch {
    const took = (await $.clock.now()) - startedAt
    if (took >= CCUSAGE_TIMEOUT_MS - 1000) return { isOk: false, status: 'failed', error: 'timed out after 20s' }
    return { isOk: false, status: 'missing', error: 'not found' }
  }
}

let isRunning = false

/** Reads today's spend, the week and the active block into the ccusage atom; the last good figures stay while it runs. */
export async function refreshCcusage($: EngineInterface, command: string): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const now = await $.clock.now()
    const { tzOffsetMin } = await read($, S.place)
    await update($, S.ccusage, (s): CcusageState => ({ ...s, status: s.status === 'ok' ? 'ok' : 'running', lastStartedAt: now }))
    const today = localDate(now, tzOffsetMin)
    const since = compactDate(shiftDate(today, -6))
    const daily = await runCcusage($, command, ['daily', '--json', '--breakdown', '--offline', '--since', since])
    if (!daily.isOk) {
      await update($, S.ccusage, (s): CcusageState => ({ ...s, status: daily.status, error: daily.error }))
      return
    }
    const figures = parseDaily(daily.stdout, today)
    if (figures === null) {
      await update($, S.ccusage, (s): CcusageState => ({ ...s, status: 'failed', error: 'unexpected output from ccusage daily' }))
      return
    }
    const blocks = await runCcusage($, command, ['blocks', '--active', '--json', '--offline'])
    const block = blocks.isOk ? (parseBlocks(blocks.stdout) ?? null) : null
    await update($, S.ccusage, (s): CcusageState => ({
      ...s,
      status: 'ok',
      error: null,
      updatedAt: now,
      today: figures.today,
      week: figures.week,
      block,
    }))
  } finally {
    isRunning = false
  }
}
