import { describe, expect, test } from 'claude-code/testing'

import { ccusageArgv, compactDate, familyOf, parseBlocks, parseDaily, shiftDate } from '../hooks/sources/ccusage'
import { BLOCKS_JSON, DAILY_JSON, NO_TODAY_JSON } from './fixtures'

describe('ccusage', () => {
  test('the daily report gives today, its model families and the week', () => {
    const figures = parseDaily(DAILY_JSON, '2026-10-21')
    expect(figures?.week).toEqual([12, 24, 18, 31, 44, 27, 38.9])
    expect(figures?.today).toEqual({
      usd: 38.9,
      byModel: [
        { family: 'Opus', usd: 31.2 },
        { family: 'Sonnet', usd: 6.1 },
        { family: 'Haiku', usd: 1.6 },
      ],
    })
  })

  test('a day with no usage yet reads $0, not a failure', () => {
    const figures = parseDaily(NO_TODAY_JSON, '2026-10-21')
    expect(figures?.today).toEqual({ usd: 0, byModel: [] })
    expect(figures?.week).toEqual([12, 24, 18, 31, 44, 27, 0])
  })

  test('output that is not the daily report is refused; a bad total leaves today out', () => {
    expect(parseDaily('not json', '2026-10-21')).toBeNull()
    expect(parseDaily('{"daily":"x"}', '2026-10-21')).toBeNull()
    const bad = JSON.stringify({ daily: [{ date: '2026-10-21', totalCost: 'lots' }] })
    expect(parseDaily(bad, '2026-10-21')?.today).toBeNull()
  })

  test('the active block gives its end, burn rate and projection', () => {
    expect(parseBlocks(BLOCKS_JSON)).toEqual({
      endsAt: Date.parse('2026-10-21T16:14:30.000Z'),
      costPerHour: 9.8,
      projectedUsd: 61,
    })
    expect(parseBlocks('{"blocks":[]}')).toBeNull()
    expect(parseBlocks('nope')).toBeUndefined()
  })

  test('model ids fold into families', () => {
    expect(familyOf('claude-opus-5-5')).toBe('Opus')
    expect(familyOf('claude-3-5-sonnet-20241022')).toBe('Sonnet')
    expect(familyOf('claude-fable-5-1')).toBe('Fable')
    expect(familyOf('gpt-5')).toBe('Other')
  })

  test('dates shift across months and compact for --since', () => {
    expect(shiftDate('2026-10-21', -6)).toBe('2026-10-15')
    expect(shiftDate('2026-11-02', -6)).toBe('2026-10-27')
    expect(compactDate('2026-10-15')).toBe('20261015')
  })

  test('the command is split on spaces and scoped to Claude Code', () => {
    expect(ccusageArgv('npx -y ccusage@20', ['daily', '--json'])).toEqual(['npx', '-y', 'ccusage@20', 'claude', 'daily', '--json'])
    expect(ccusageArgv('  ccusage ', ['blocks'])).toEqual(['ccusage', 'claude', 'blocks'])
  })
})
