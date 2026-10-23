import { describe, expect, test } from 'claude-code/testing'

import { HOME } from './fixtures'
import { mountPane, open, request, start, turnStart, world } from './world'

const blitsOf = (blits: readonly string[], key: string) => blits.filter(k => k === key).length

describe('animation', () => {
  test('the claw clacks while Claude works, at 4 frames a second', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await open($, clock)
    const ui = await mountPane($)
    await turnStart($)
    await clock.advance(10)
    const before = blitsOf(seen.blits, 'character')
    await clock.advance(1_000)
    const clacks = blitsOf(seen.blits, 'character') - before
    expect(clacks).toBeGreaterThanOrEqual(4)
    expect(clacks).toBeLessThanOrEqual(6)
    await ui.unmount()
  })

  test('closing the pane stops every picture', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await open($, clock)
    const ui = await mountPane($)
    await turnStart($)
    await clock.advance(500)
    expect(seen.blits.length).toBeGreaterThan(0)
    await $.command.run({ command: 'vitals' } as never)
    const after = seen.blits.length
    await clock.advance(2_000)
    expect(seen.blits.length).toBe(after)
    await ui.unmount()
  })

  test('with animations off nothing moves', { options: { animations: false } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await open($, clock)
    const ui = await mountPane($)
    await turnStart($)
    await clock.advance(2_000)
    expect(seen.blits).toEqual([])
    await ui.unmount()
  })

  test('in kitty the warm cache bar shimmers', async ($, on) => {
    const { clock, seen } = world(on, { HOME, TERM: 'xterm-kitty' })
    await start($, clock)
    await request($)
    await open($, clock)
    const ui = await mountPane($)
    await clock.advance(2_000)
    expect(blitsOf(seen.blits, 'cache-pill')).toBeGreaterThanOrEqual(6)
    await ui.unmount()
  })

  test('a content claw blinks', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await open($, clock)
    const ui = await mountPane($)
    await clock.advance(9_000)
    expect(blitsOf(seen.blits, 'character')).toBeGreaterThanOrEqual(3)
    await ui.unmount()
  })
})
