import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { paletteFor } from '../hooks/graphics/palette'
import { frameAt, spriteCells } from '../hooks/graphics/sprite'
import type { Mood } from '../hooks/mood'
import { CWD, usageFixture } from './fixtures'
import { edit, mountPane, paneText, request, start, turnComplete, turnStart, type, world } from './world'

const MINUTE = 60_000

/** The claw's cells as the pane draws them now. */
async function clawCells($: Engine): Promise<unknown> {
  const ui = await mountPane($)
  const found = await ui.find({ key: 'character' })
  await ui.unmount()
  return found?.props.cells
}

const drawn = (mood: Mood, ms: number) => spriteCells(frameAt(mood, ms))

describe('background tasks', () => {
  test('a running task shows what it does and for how long; finished ones are counted', async ($, on) => {
    const { clock, answers } = world(on)
    answers.agents = [{ id: 'a1', description: 'Fable review of transfer', type: 'general-purpose', status: 'running' }]
    await start($, clock)
    await clock.advance(81_000)
    const running = await paneText($)
    expect(running).toContain('Fable review of transfer')
    expect(running).toContain('1m 21s')

    answers.agents = [{ id: 'a1', description: 'Fable review of transfer', type: 'general-purpose', status: 'completed' }]
    await clock.advance(2_000)
    expect(await paneText($)).toContain('◇ 1 finished')
  })

  test('with none it says so', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    expect(await paneText($)).toContain('No background tasks')
  })
})

describe('the claw', () => {
  test('works while a turn runs', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await turnStart($)
    expect(await paneText($)).toContain('working')
    expect(await clawCells($)).toBe(drawn('working', clock.now()))
  })

  test('frosts over once the cache goes cold', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    await clock.advance(61 * MINUTE)
    expect(await paneText($)).toContain('cache cold')
    expect(await clawCells($)).toBe(drawn('cold', clock.now()))
  })

  test('sweats when the context passes 80%', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ percent: 84 })
    await start($, clock)
    expect(await paneText($)).toContain('context 84%')
  })

  test('sweats at a limit too, and says which', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ limits: [{ kind: 'five_hour', percentUsed: 91, resetsAt: '2026-10-21T16:00:00Z' }] })
    await start($, clock)
    expect(await paneText($)).toContain('limit 5h 91%')
  })

  test('celebrates a turn that saved a file, for four seconds', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await turnStart($)
    await edit($, `${CWD}/hooks/a.ts`)
    await turnComplete($)
    await clock.advance(10)
    expect(await clawCells($)).toBe(drawn('celebrating', clock.now()))
    await clock.advance(5_000)
    expect(await clawCells($)).toBe(drawn('content', clock.now()))
  })

  test('falls asleep after ten idle minutes and wakes when you type', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await clock.advance(10 * MINUTE)
    expect(await paneText($)).toContain('asleep')
    await type($, 'h')
    expect(await paneText($)).not.toContain('asleep')
  })

  test('the light theme draws the light palette', async ($, on) => {
    const { clock, answers } = world(on)
    answers.theme = 'light'
    await start($, clock)
    const ui = await mountPane($)
    expect((await ui.find({ key: 'card-header' }))?.props.backgroundColor).toBe(paletteFor('light').card)
    await ui.unmount()
  })

  test('with the claw turned off the header is text alone', { options: { character: false } }, async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const ui = await mountPane($)
    expect(await ui.find({ key: 'character' })).toBeUndefined()
    await ui.unmount()
  })
})
