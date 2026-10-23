import { describe, expect, test } from 'claude-code/testing'

import { paletteFor } from '../hooks/graphics/palette'
import { cachePill, ringPicture } from '../hooks/graphics/pictures'
import { afterResponse, cacheView } from '../hooks/sources/cache'
import type { CacheView } from '../hooks/sources/cache'
import { INITIAL_CACHE } from '../hooks/state'
import type { ContextRow } from '../types'
import { CWD, HOME, START, STEP_USAGE } from './fixtures'
import { edit, mountPane, open, paneText, request, start, world } from './world'

const DARK = paletteFor('dark')

describe('after /clear', () => {
  test('the new conversation starts with no cached prompt and no edited files', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    await edit($, `${CWD}/hooks/a.ts`)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: undefined } as never)
    const text = await paneText($)
    expect(text).toContain('– waiting for the first response')
    expect(text).toContain('No files edited yet')
  })
})

describe('the animated cache pill', () => {
  test('a redraw paints the frame the animator would, not a still one', async ($, on) => {
    const { clock } = world(on, { HOME, TERM: 'xterm-kitty' })
    await start($, clock)
    await request($)
    await open($, clock)
    const animating = await mountPane($)
    await clock.advance(1_500)
    await animating.unmount()
    // A redraw now, at the clock's time, must show the animator's frame for this moment.
    const ui = await mountPane($)
    const now = clock.now()
    const view = cacheView(afterResponse(INITIAL_CACHE, START + 10, STEP_USAGE), now)
    const drawn = (await ui.find({ key: 'cache-pill' }))?.props.source as { rgba: string } | undefined
    expect(drawn?.rgba).toBe(cachePill(view, DARK, 32, now).source.rgba)
    await ui.unmount()
  })
})

describe('the picture memo', () => {
  test('animation frames do not evict the still pictures', () => {
    const rows: ContextRow[] = [
      { name: 'Messages', tokens: 83_600, kind: 'used' },
      { name: 'Free space', tokens: 916_400, kind: 'free' },
    ]
    const ring = ringPicture(rows, 1_000_000, DARK, 'ring')
    const warm: CacheView = { status: 'warm', leftMs: 3_000_000, fraction: 0.83, hit: 0.95, ttl: '1h', tokens: 1, warmUsd: null, coldUsd: null }
    for (let i = 0; i < 100; i++) cachePill({ ...warm, fraction: 0.5 + i / 1000 }, DARK, 30, i * 125)
    expect(ringPicture(rows, 1_000_000, DARK, 'ring')).toBe(ring)
  })
})
