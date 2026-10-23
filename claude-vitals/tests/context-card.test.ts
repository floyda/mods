import { describe, expect, test } from 'claude-code/testing'

import { HOME, usageFixture } from './fixtures'
import { measure, mountPane, paneText, start, world } from './world'

describe('the Context card', () => {
  test('lists each category with its tokens and share, and keeps the deferred tools folded', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const text = await paneText($)
    for (const part of ['14%', '140k / 1M', 'Messages', '83.6k', '8.4%', 'Free space', '824.9k', '82.5%', 'estimate']) {
      expect(text).toContain(part)
    }
    expect(text).toContain('deferred tools 38.3k')
    expect(text).not.toContain('MCP tools (deferred)')
  })

  test('the deferred row unfolds its tools', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const ui = await mountPane($)
    await ui.press({ key: 'toggle-deferred' })
    expect(await ui.find({ type: 'Text', text: /MCP tools \(deferred\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('f counts exactly, as /context does', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    expect(await paneText($)).toContain('estimate')
    const ui = await mountPane($)
    await ui.press({ key: 'exact' })
    await ui.unmount()
    expect(seen.counts).toContain('full')
    expect(await paneText($)).not.toContain('estimate')
  })

  test('in kitty the ring replaces the bar', async ($, on) => {
    const { clock } = world(on, { HOME, TERM: 'xterm-kitty' })
    await start($, clock)
    const ui = await mountPane($)
    expect((await ui.find({ key: 'ring' }))?.type).toBe('Image')
    await ui.unmount()
  })

  test('new measurements recount at most once every 2 seconds', async ($, on) => {
    const { clock, seen, answers } = world(on)
    await start($, clock)
    const before = seen.counts.filter(c => c === 'summary').length
    answers.usage = usageFixture({ percent: 30 })
    await measure($, 30)
    await measure($, 30)
    await measure($, 30)
    await clock.advance(10)
    expect(seen.counts.filter(c => c === 'summary').length).toBe(before + 1)
    await clock.advance(2_000)
    expect(seen.counts.filter(c => c === 'summary').length).toBe(before + 2)
    expect(await paneText($)).toContain('30%')
  })
})
