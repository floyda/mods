import { describe, expect, test } from 'claude-code/testing'

import {
  ago,
  clipEnd,
  clipStart,
  count,
  countdown,
  displayPath,
  filledCells,
  homePath,
  lineCount,
  localDate,
  modelName,
  money,
  padEnd,
  parseOffset,
  resetLabel,
  share,
  span,
  sparkline,
  tokens,
} from '../hooks/format'

const START = Date.parse('2026-10-21T14:00:00Z')

describe('format', () => {
  test('token counts read as /context prints them', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(7_900)).toBe('7.9k')
    expect(tokens(30_000)).toBe('30k')
    expect(tokens(141_600)).toBe('141.6k')
    expect(tokens(999_950)).toBe('1M')
    expect(tokens(1_000_000)).toBe('1M')
    expect(tokens(1_250_000)).toBe('1.3M')
  })

  test('money and counts group thousands', () => {
    expect(money(0)).toBe('$0.00')
    expect(money(4.124)).toBe('$4.12')
    expect(money(1204.5)).toBe('$1,204.50')
    expect(money(0.004)).toBe('<$0.01')
    expect(count(44)).toBe('44')
    expect(count(1204)).toBe('1,204')
    expect(count(1_234_567)).toBe('1,234,567')
  })

  test('shares, countdowns, spans and ages', () => {
    expect(share(83_600, 1_000_000)).toBe('8.4%')
    expect(share(1, 0)).toBe('–')
    expect(countdown(3_130_000)).toBe('52:10')
    expect(countdown(5_000)).toBe('0:05')
    expect(countdown(-1)).toBe('0:00')
    expect(span(8_040_000)).toBe('2h14m')
    expect(span(81_000)).toBe('1m 21s')
    expect(span(45_000)).toBe('45s')
    expect(ago(30_000)).toBe('just now')
    expect(ago(120_000)).toBe('2m ago')
    expect(ago(3 * 3_600_000)).toBe('3h ago')
  })

  test('local dates and reset labels follow the zone offset', () => {
    expect(localDate(START, 60)).toBe('2026-10-21')
    expect(localDate(Date.parse('2026-10-21T23:30:00Z'), 60)).toBe('2026-10-22')
    expect(resetLabel('2026-10-21T16:00:00Z', START, 60)).toBe('17:00')
    expect(resetLabel('2026-10-26T08:00:00Z', START, 60)).toBe('Mon')
    expect(resetLabel('garbage', START, 0)).toBe('')
    expect(parseOffset('+0100')).toBe(60)
    expect(parseOffset('-0530')).toBe(-330)
    expect(parseOffset('nope')).toBe(0)
  })

  test('paths are shown relative, under ~, or whole', () => {
    expect(displayPath('/work/hooks/a.ts', '/work', '/Users/me')).toBe('hooks/a.ts')
    expect(displayPath('/Users/me/x/y.ts', '/work', '/Users/me')).toBe('~/x/y.ts')
    expect(displayPath('/etc/hosts', '/work', null)).toBe('/etc/hosts')
    expect(homePath('/Users/me/Workspace/mods', '/Users/me')).toBe('~/Workspace/mods')
    expect(homePath('/Users/me', '/Users/me')).toBe('~')
    expect(homePath('/work', null)).toBe('/work')
  })

  test('clipping keeps the end of a path and the start of a sentence', () => {
    expect(clipStart('hooks/register.tsx', 10)).toBe('…ister.tsx')
    expect(clipStart('short', 10)).toBe('short')
    expect(clipEnd('Fable review of transfer', 10)).toBe('Fable rev…')
    expect(padEnd('ab', 4)).toBe('ab  ')
    expect(padEnd('abcdef', 4)).toBe('abcdef')
  })

  test('sparklines, filled cells and line counts', () => {
    expect(sparkline([12, 24, 18, 31, 44, 27, 38.9])).toBe('▃▅▄▆█▅▇')
    expect(sparkline([0, 0])).toBe('▁▁')
    expect(filledCells(0.46, 10)).toBe(5)
    expect(filledCells(2, 10)).toBe(10)
    expect(filledCells(-1, 10)).toBe(0)
    expect(lineCount('')).toBe(0)
    expect(lineCount('a\nb\n')).toBe(2)
    expect(lineCount('a\nb')).toBe(2)
  })

  test('model ids read as names', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
    expect(modelName('gpt-x')).toBe('gpt-x')
    expect(modelName(null)).toBe('Claude')
  })
})
