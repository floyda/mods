import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CWD, HOME } from './fixtures'
import { BAND_PROPS, edit, mountPane, paneText, PLUGIN, request, start, world } from './world'

async function drawBand($: Engine, isFullscreen: boolean): Promise<void> {
  const band = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND_PROPS,
    viewport: { columns: 200, rows: 60, isFullscreen },
  })
  await band.unmount()
}

describe('opening', () => {
  test('it opens itself in the fullscreen layout', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await drawBand($, true)
    expect(seen.opened).toEqual(['vitals'])
  })

  test('on the main screen it waits to be asked', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await drawBand($, false)
    expect(seen.opened).toEqual([])
  })

  test('with autoOpen off it stays shut', { options: { autoOpen: false } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await drawBand($, true)
    expect(seen.opened).toEqual([])
  })
})

describe('compact views', () => {
  test('inline above the prompt it draws one line for the cards', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    await clock.advance(1_000)
    const ui = await mountPane($, { placement: 'inline' })
    const text = (await ui.findAll({ type: 'Text' })).map(found => found.text).join(' | ')
    expect(text).toContain('Context 14% · Cache warm')
    expect(text).toContain('Today $38.90')
    expect(text).toContain('± 3 files')
    expect(await ui.find({ key: 'card-cache' })).toBeUndefined()
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    await ui.unmount()
  })

  test('on the desktop it draws the same line', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    expect(await paneText($, {}, 'desktop')).toContain('Context 14%')
  })
})

describe('folding', () => {
  test('folded cards stay folded the next session', async ($, on) => {
    const { clock } = world(on, undefined, { collapsed: ['cache', 'changes', 'deferred'] })
    await start($, clock)
    await request($)
    const text = await paneText($)
    expect(text).toContain('Cache')
    expect(text).not.toContain('hit 95%')
  })

  test('pressing a card’s title folds and unfolds it', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    const ui = await mountPane($)
    await ui.press({ key: 'toggle-cache' })
    expect(await ui.find({ type: 'Text', text: /hit 95%/ })).toBeUndefined()
    await ui.press({ key: 'toggle-cache' })
    expect(await ui.find({ type: 'Text', text: /hit 95%/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('narrow', () => {
  test('a narrow sidebar clips paths from the start and shrinks the bars', async ($, on) => {
    const { clock } = world(on, { HOME, TERM: 'xterm-kitty' })
    await start($, clock)
    await request($)
    await edit($, `${CWD}/src/a/really/long/directory/name/that/keeps/going/file.ts`)
    const ui = await mountPane($, { bodyColumns: 30 })
    expect((await ui.find({ key: 'cache-pill' }))?.props.columns).toBe(16)
    const clipped = await ui.find({ type: 'Text', text: /^…/ })
    expect(clipped).toBeDefined()
    expect([...(clipped?.text ?? '')].length).toBeLessThanOrEqual(26)
    await ui.unmount()
  })
})
