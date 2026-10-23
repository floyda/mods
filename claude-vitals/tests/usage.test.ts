import { describe, expect, test } from 'claude-code/testing'

import { usageFixture } from './fixtures'
import { mountPane, paneText, start, turnComplete, turnStart, world } from './world'

const dailyRuns = (runs: string[][]) => runs.filter(run => run.includes('ccusage') && run.includes('daily')).length

describe('the Usage card', () => {
  test('shows the session, today by model, the 5-hour block and the limits', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    const text = await paneText($)
    for (const part of ['$4.12', '$38.90', 'Opus $31.20', 'Sonnet $6.10', 'Haiku $1.60', '2h14m', '$9.80/h', '~$61.00', 'Limit 5h', '46%', '17:00', 'Limit 7d', '22%', 'Mon']) {
      expect(text).toContain(part)
    }
    expect(seen.runs).toContainEqual(['pnpx', 'ccusage', 'claude', 'daily', '--json', '--breakdown', '--offline', '--since', '20261015'])
    expect(seen.runs).toContainEqual(['pnpx', 'ccusage', 'claude', 'blocks', '--active', '--json', '--offline'])
  })

  test('without ccusage it says how to get it, keeps the engine’s figures, and Retry tries again', async ($, on) => {
    const { clock, answers } = world(on)
    answers.ccusage = 'missing'
    await start($, clock)
    const text = await paneText($)
    expect(text).toContain('ccusage not found · npm i -g ccusage')
    expect(text).toContain('$4.12')
    expect(text).toContain('Limit 5h')

    answers.ccusage = 'ok'
    const ui = await mountPane($)
    await ui.press({ key: 'retry' })
    await ui.unmount()
    expect(await paneText($)).toContain('$38.90')
  })

  test('a failing ccusage shows its first error line', async ($, on) => {
    const { clock, answers } = world(on)
    answers.ccusage = 'failed'
    await start($, clock)
    expect(await paneText($)).toContain('ccusage failed: Error: no usage data found')
  })

  test('on an API key there are no limit rows', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ limits: [] })
    await start($, clock)
    expect(await paneText($)).not.toContain('Limit 5h')
  })

  test('after a turn ccusage runs again only once 30 seconds have passed; r runs it at once', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    expect(dailyRuns(seen.runs)).toBe(1)

    await turnStart($)
    await turnComplete($)
    await clock.advance(10)
    expect(dailyRuns(seen.runs)).toBe(1)

    await clock.advance(30_000)
    await turnStart($, 't2')
    await turnComplete($, 't2')
    await clock.advance(10)
    expect(dailyRuns(seen.runs)).toBe(2)

    const ui = await mountPane($)
    await ui.press({ key: 'refresh' })
    await ui.unmount()
    expect(dailyRuns(seen.runs)).toBe(3)
  })
})
