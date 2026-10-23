import { describe, expect, test } from 'claude-code/testing'

import { CWD } from './fixtures'
import { edit, mountPane, paneText, start, turnComplete, turnStart, world, ZED_APP } from './world'

const A = `${CWD}/hooks/a.ts`

describe('the Outputs card', () => {
  test('an edit adds a row with its counts, newest first', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await edit($, `${CWD}/hooks/b.ts`)
    await edit($, A)
    const text = await paneText($)
    expect(text).toContain('hooks/a.ts')
    expect(text).toContain('+2')
    expect(text).toContain('−1')
    expect(text.indexOf('hooks/a.ts')).toBeLessThan(text.indexOf('hooks/b.ts'))
  })

  test('pressing a row opens Zed at the changed line', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    await edit($, A)
    const ui = await mountPane($)
    await ui.press({ key: `out-open:${A}` })
    await ui.unmount()
    expect(seen.runs).toContainEqual(['zed', `${A}:12`])
  })

  test('the app’s own CLI is the fallback', async ($, on) => {
    const { clock, seen, answers } = world(on)
    answers.zed = 'app'
    await start($, clock)
    await edit($, A)
    const ui = await mountPane($)
    await ui.press({ key: `out-open:${A}` })
    await ui.unmount()
    expect(seen.runs).toContainEqual([ZED_APP, `${A}:12`])
    expect(seen.toasts).toEqual([])
  })

  test('without Zed it says so and copies the path', async ($, on) => {
    const { clock, seen, answers } = world(on)
    answers.zed = 'none'
    await start($, clock)
    await edit($, A)
    const ui = await mountPane($)
    await ui.press({ key: `out-open:${A}` })
    await ui.unmount()
    expect(seen.toasts).toEqual(['Zed not found: set its path in vitals settings'])
    expect(seen.copied).toEqual([A])
  })

  test('a file deleted since it was edited is dimmed and cannot be opened', async ($, on) => {
    const { clock, answers } = world(on)
    await start($, clock)
    await turnStart($)
    await edit($, A)
    answers.gone.add(A)
    await turnComplete($)
    await clock.advance(10)
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Text', text: /deleted/ })).toBeDefined()
    expect(await ui.find({ key: `out-open:${A}` })).toBeUndefined()
    await ui.unmount()
  })

  test('five rows show; the rest wait behind Show N more', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    for (let i = 1; i <= 7; i++) await edit($, `${CWD}/f${i}.ts`)
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Text', text: 'Show 2 more' })).toBeDefined()
    await ui.press({ key: 'more-outputs' })
    expect(await ui.find({ type: 'Text', text: 'Show fewer' })).toBeDefined()
    expect(await ui.find({ key: `out-open:${CWD}/f1.ts` })).toBeDefined()
    await ui.unmount()
  })

  test('a subagent’s edit carries its name', async ($, on) => {
    const { clock, answers } = world(on)
    answers.agents = [{ id: 'a1', name: 'reviewer', description: 'Review', type: 'general-purpose', status: 'running' }]
    await start($, clock)
    await edit($, A, 'a1')
    expect(await paneText($)).toContain('reviewer')
  })
})

describe('the Changes card', () => {
  test('sums the uncommitted changes, and unfolds into files that open at their first hunk', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    const ui = await mountPane($)
    const summary = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
    expect(summary).toContain('files uncommitted')
    expect(summary).toContain('+211')
    expect(summary).toContain('−4')
    expect(await ui.find({ key: `chg-open:${CWD}/hooks/register.tsx` })).toBeUndefined()

    await ui.press({ key: 'toggle-changes' })
    await ui.press({ key: `chg-open:${CWD}/hooks/register.tsx` })
    await ui.unmount()
    expect(seen.runs).toContainEqual(['zed', `${CWD}/hooks/register.tsx:41`])
  })

  test('git that does not answer in time is said so', async ($, on) => {
    const { clock, answers } = world(on)
    answers.git = 'hang'
    await start($, clock)
    expect(await paneText($)).toContain('git timed out')
  })

  test('outside a repository it says so, and the header leaves the branch out', async ($, on) => {
    const { clock, answers } = world(on)
    answers.git = 'none'
    await start($, clock)
    const text = await paneText($)
    expect(text).toContain('not a git repo')
    expect(text).not.toContain('main ·')
  })
})
