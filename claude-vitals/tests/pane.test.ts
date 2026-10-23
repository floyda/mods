import { describe, expect, test } from 'claude-code/testing'

import { HOME } from './fixtures'
import { mountPane, open, paneText, request, start, world } from './world'

const MINUTE = 60_000

describe('the pane', () => {
  test('/vitals opens the sidebar, and closes it again', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await open($, clock)
    expect(seen.opened).toEqual(['vitals'])
    await $.command.run({ command: 'vitals' } as never)
    expect(seen.closed).toEqual(['vitals'])
  })

  test('the header names the model, the branch and the folder', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const text = await paneText($)
    expect(text).toContain('Opus 5.5')
    expect(text).toContain('main · ~/Workspace/mods')
  })

  test('before the first response the cache waits', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    expect(await paneText($)).toContain('– waiting for the first response')
  })

  test('the cache counts down and prices the next turn, then goes cold', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    await clock.advance(7 * MINUTE + 50_000)
    const warm = await paneText($)
    expect(warm).toContain('1h TTL')
    expect(warm).toContain('52:10')
    expect(warm).toContain('hit 95%')
    expect(warm).toContain('$0.04')
    expect(warm).toContain('$1.44')

    await clock.advance(53 * MINUTE)
    const cold = await paneText($)
    expect(cold).toContain('cache cold')
    expect(cold).not.toContain('52:10')
  })

  test('the claw is half-block cells in text mode and a picture in kitty', async ($, on) => {
    const { clock } = world(on, { HOME, TERM: 'xterm-kitty' })
    await start($, clock)
    const ui = await mountPane($)
    expect((await ui.find({ key: 'character' }))?.type).toBe('Image')
    await ui.unmount()
  })

  test('in text mode the claw is a Raster', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const ui = await mountPane($)
    expect((await ui.find({ key: 'character' }))?.type).toBe('Raster')
    await ui.unmount()
  })
})
