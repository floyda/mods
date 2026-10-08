import type { On, PromptEditInput, RenderElement } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bar, clawCells, clawSvg } from '../hooks/claw'
import { costOf } from '../hooks/pricing'

const START = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const HANDOFF = '## Goal\n- Ship the cache mod.\n\n## Next step\n- Run the tests.'
const BAND = {
  plugin: 'cache-countdown',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const
const QUIET = { cacheTtl: '5m', whenAway: 'off' }

/** The engine beneath the mod, answering every call it makes and recording what it saw. */
function world(on: On, answer?: string, stored: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on, stored)
  const session = mock.session(on)
  const seen = {
    toasts: [] as string[],
    logs: [] as string[],
    status: undefined as string | undefined,
    asked: 0,
    compactions: 0,
    clears: 0,
    forks: 0,
    writes: [] as { path: string; text: string }[],
    opened: [] as string[],
    closed: [] as string[],
    entered: [] as string[],
    origins: [] as string[],
    box: '',
    sounds: [] as string[],
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 10,
      output_tokens: 500,
      cache_read_input_tokens: 170_000,
      cache_creation_input_tokens: 9_490,
    },
  }
  on('ui.toast', (_$, e) => (seen.toasts.push(e.text), { value: undefined }))
  on('ui.log', (_$, e) => (seen.logs.push(e.text), { value: undefined }))
  on('ui.status', (_$, e) => ((seen.status = e.text), { value: undefined }))
  on('ui.open', (_$, e) => (seen.opened.push(e.id), { value: { isPlaced: true as const } }))
  on('ui.close', (_$, e) => (seen.closed.push(e.id), { value: undefined }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('audio.play', (_$, e) => (seen.sounds.push(e.clip.asset ?? 'other'), { value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', { command: 'clear' }, () => ((seen.clears += 1), { text: '' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'abcdef12-3456' }))
  on('fs.write', (_$, e) => (seen.writes.push(e), { value: undefined }))
  on('prompt.fill', (_$, e) => ((seen.box = e.text), { isFilled: true }))
  on('prompt.read', () => ({ value: { text: seen.box, cursor: seen.box.length } }))
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_$, e) => {
    seen.entered.push(e.text)
    seen.origins.push(e.origin.kind)
    return { text: e.text, origin: e.origin }
  })
  on('session.compact', () => {
    seen.compactions += 1
    const summary = { role: 'user' as const, text: 'The summary.', toolUses: [] }
    return { messages: [summary], tokensBefore: 180_000, tokensAfter: 9_000 }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    seen.asked += 1
    const question = e.questions[0]?.question ?? ''
    return { result: { questions: e.questions, answers: { [question]: answer ?? '' } } }
  })
  on('model.fork', () => {
    seen.forks += 1
    const usage = { input_tokens: 8, output_tokens: 6_000, cache_read_input_tokens: 179_000, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true as const, text: HANDOFF, usage } }
  })
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'done',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: seen.usage,
    }
  })

  /** The text of every row a plugin appended to the conversation. */
  const appended = () =>
    session.appended().flatMap(row => row.message.content.flatMap(block => ('text' in block ? [block.text] : [])))

  return { clock, seen, appended }
}

async function start($: Engine) {
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
}

/** One main-thread model request: the cache is written and its countdown starts. */
async function request($: Engine) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  for await (const _chunk of stream) {
    // nothing streams beneath
  }
}

/** Every text the band draws on the terminal right now, joined. */
async function band($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.map(text => text.text).join(' ')
}

function submit($: Engine, text: string) {
  return $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
}

// The kit's engine raises prompt.edit as the composer does, though its typings leave the call out.
function type($: Engine, text: string) {
  const prompt = $.prompt as unknown as { edit: (e: PromptEditInput) => Promise<unknown> }
  return prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
}

describe('countdown', () => {
  test('counts down in the band, then warns, then goes cold, with no status line', { options: { cacheTtl: '1h', whenAway: 'off' } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(1000)
    expect(await band($)).toContain('59:59')

    await clock.advance(HOUR - 121_000)
    expect(await band($)).toContain('Prompt cache goes cold in 2:00')
    expect(seen.toasts).toContain('Prompt cache goes cold in 2:00.')
    expect(seen.sounds).toEqual(['sounds/warn.wav'])

    await clock.advance(121_000)
    expect(await band($)).toContain('Prompt cache went cold 1s ago')
    expect(seen.status).toBeUndefined()
    expect(seen.toasts.at(-1)).toBe('Prompt cache went cold: the next turn re-sends 180k tokens uncached.')
    expect(seen.sounds).toEqual(['sounds/warn.wav', 'sounds/cold.wav'])
  })

  test('the band is a slim bar while warm, the claw while warning and once cold', { options: QUIET }, async ($, on) => {
    const { clock } = world(on)
    await start($)
    await request($)
    await clock.advance(MINUTE)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: '4:00' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /cold re-send ≈ \$0\.90/ })).toBeDefined()
      expect(await ui.find({ key: 'claw' })).toBeUndefined()
      await ui.unmount()
    }

    await clock.advance(3 * MINUTE + 30_000)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await terminal.find({ key: 'claw' })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /goes cold in 0:30/ })).toBeDefined()
    expect(await terminal.find({ key: 'hand-off' })).toBeDefined()
    await terminal.unmount()
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desktop.find({ type: 'Svg' })).toBeDefined()
    await desktop.unmount()

    await clock.advance(40_000)
    const cold = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await cold.find({ type: 'Text', text: /went cold 10s ago/ })).toBeDefined()
    expect(await cold.find({ key: 'hand-off' })).toBeDefined()
    expect(await cold.find({ key: 'keep' })).toBeDefined()
    await cold.unmount()
  })

  test('Keep full context takes the band down and lets the next prompt through unasked', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(6 * MINUTE)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'keep' })
    expect(await ui.find({ key: 'hand-off' })).toBeUndefined()
    await ui.unmount()

    await submit($, 'carry on')
    expect(seen.asked).toBe(0)
    expect(seen.entered).toEqual(['carry on'])
  })
})

describe('handoff while away', () => {
  test('a minute before it goes cold, an idle session writes a handoff over the warm cache', { options: { cacheTtl: '5m' } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(4 * MINUTE)
    expect(seen.forks).toBe(1)
    expect(seen.writes[0]?.path).toMatch(/^\/work\/\.claude\/handoffs\/.*-abcdef12\.md$/)
    expect(seen.writes[0]?.text).toContain('## Next step')
    expect(seen.logs.at(-1)).toMatch(/handoff written while you were away: 6k tokens, saved to \/work/)

    // Its request read the session back from cache, so the cache is warm for another five minutes.
    await clock.advance(1000)
    expect(await band($)).toContain('Prompt cache goes cold in 4:59')

    await clock.advance(5 * MINUTE)
    expect(seen.forks).toBe(1)
    expect(await band($)).toContain('handoff ready')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(await ui.find({ key: 'view' })).toBeDefined()
    await ui.unmount()
  })

  test('typing in the prompt box means you are not away', { options: { cacheTtl: '5m' } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(3 * MINUTE + 30_000)
    await type($, 'half a thought')
    await clock.advance(30_000)
    expect(seen.forks).toBe(0)
  })

  test('whenAway off never writes one', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    expect(seen.forks).toBe(0)
  })
})

describe('sending into a cold cache', () => {
  test('a warm cache sends without asking', { options: { cacheTtl: '1h' } }, async ($, on) => {
    const { clock, seen } = world(on, 'Send with full context')
    await start($)
    await request($)
    await clock.advance(30 * MINUTE)
    await submit($, 'next step')
    expect(seen.asked).toBe(0)
    expect(seen.entered).toEqual(['next step'])
  })

  test('Resume from handoff clears, hands the model the handoff, and leaves the prompt for Enter', { options: { cacheTtl: '5m' } }, async ($, on) => {
    const { clock, seen, appended } = world(on, 'Resume from handoff')
    await start($)
    await request($)
    await clock.advance(15 * MINUTE)
    const held = await submit($, 'next step')
    expect(held.drop).toBe('Resuming from the handoff first: your prompt waits in the box until it is done.')

    await clock.advance(1000)
    expect(seen.clears).toBe(1)
    expect(seen.compactions).toBe(0)
    expect(appended()).toHaveLength(1)
    expect(appended()[0]).toContain('resumed from a handoff')
    expect(appended()[0]).toContain(HANDOFF)
    expect(seen.toasts.at(-1)).toBe(
      'Resumed from the handoff: 180k → 6k tokens. Your prompt is in the box: press Enter to send it.',
    )
    expect(seen.entered).toEqual([])
    expect(seen.box).toBe('next step')
    expect(await band($)).toBe('')
  })

  test('Hand off, then resume writes the handoff on the spot when none is ready', { options: QUIET }, async ($, on) => {
    const { clock, seen, appended } = world(on, 'Hand off, then resume')
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    const held = await submit($, 'next step')
    expect(held.drop).toBe('Writing a handoff first: your prompt waits in the box until the session resumes from it.')

    await clock.advance(1000)
    expect(seen.forks).toBe(1)
    expect(seen.clears).toBe(1)
    expect(appended()[0]).toContain(HANDOFF)
    expect(seen.box).toBe('next step')
  })

  test('Send with full context sends the prompt as typed', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on, 'Send with full context')
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    const entered = await submit($, 'next step')
    expect(seen.asked).toBe(1)
    expect(entered.text).toBe('next step')
    expect(seen.origins).toEqual(['composer'])
  })

  test('Hold my prompt drops it back into the box, and the next Enter goes through', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on, 'Hold my prompt')
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    const held = await submit($, 'next step')
    expect(held.drop).toMatch(/^Held: the prompt cache is cold/)
    expect(seen.box).toBe('next step')
    expect(seen.entered).toEqual([])

    const sent = await submit($, 'next step')
    expect(seen.asked).toBe(1)
    expect(sent.text).toBe('next step')
  })

  test('slash commands are never held', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on, 'Hold my prompt')
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    await submit($, '/handoff')
    expect(seen.asked).toBe(0)
  })

  test('askWhenCold off never asks', { options: { ...QUIET, askWhenCold: false } }, async ($, on) => {
    const { clock, seen } = world(on, 'Hold my prompt')
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    await submit($, 'next step')
    expect(seen.asked).toBe(0)
    expect(seen.entered).toEqual(['next step'])
  })
})

describe('/handoff', () => {
  test('opens the pane, writes the handoff into it, and resumes from it on request', { options: QUIET }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    const out = await $.command.run({
      command: 'handoff',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
    expect(out.text).toBe('Writing a handoff for this session…')
    expect(seen.opened).toEqual(['cache-handoff'])
    await clock.settle()
    expect(seen.toasts.at(-1)).toBe('Handoff ready: 6k tokens.')

    const pane = await $.ui.mount({
      plugin: 'cache-countdown',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'cache-handoff',
      props: { title: 'Handoff', bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } },
    } as never)
    expect(await pane.find({ type: 'Markdown' })).toBeDefined()
    await pane.press({ key: 'resume' })
    expect(seen.clears).toBe(1)
    expect(seen.toasts.at(-1)).toBe('Resumed from the handoff: 180k → 6k tokens.')
    expect(seen.closed).toEqual(['cache-handoff'])
    await pane.unmount()
  })
})

describe('learning the TTL', () => {
  test('a hit after a ten-minute gap means a 1h cache', { options: { whenAway: 'off' } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    seen.usage = { ...seen.usage, cache_read_input_tokens: 179_000, cache_creation_input_tokens: 800 }
    await request($)
    await clock.advance(1000)
    expect(await band($)).toContain('59:59')
  })

  test('a miss after a ten-minute gap means a 5m cache', { options: { whenAway: 'off' } }, async ($, on) => {
    const { clock, seen } = world(on)
    await start($)
    await request($)
    await clock.advance(10 * MINUTE)
    seen.usage = { ...seen.usage, cache_read_input_tokens: 3_000, cache_creation_input_tokens: 176_000 }
    await request($)
    await clock.advance(1000)
    expect(await band($)).toContain('4:59')
  })

  test('a TTL learned in an earlier session is used from the start', async ($, on) => {
    const { clock, seen } = world(on, undefined, { learnedTtl: '5m' })
    await start($)
    await request($)
    await clock.advance(1000)
    expect(await band($)).toContain('4:59')
  })

  test('the setting wins over what was learned', { options: { cacheTtl: '1h' } }, async ($, on) => {
    const { clock, seen } = world(on, undefined, { learnedTtl: '5m' })
    await start($)
    await request($)
    await clock.advance(1000)
    expect(await band($)).toContain('59:59')
  })
})

describe('drawing and prices', () => {
  test('the bar fills in eighths of a cell', () => {
    expect(bar(0.5, 10)).toEqual({ filled: '█████', empty: '░░░░░' })
    expect(bar(0.55, 10)).toEqual({ filled: '█████▌', empty: '░░░░' })
    expect(bar(0, 4)).toEqual({ filled: '', empty: '░░░░' })
  })

  test('the claw is 14×5 cells on the terminal and an SVG elsewhere', () => {
    expect(clawCells('warm')).toHaveLength(Math.ceil((14 * 5 * 12) / 3) * 4)
    expect(clawCells('cold')).not.toBe(clawCells('warm'))
    expect(clawSvg('handoff')).toMatch(/^<svg [^>]*width="56" height="40"/)
  })

  test('re-caching is priced at the write rate of the TTL, reads at the model’s own rate', () => {
    expect(costOf('claude-opus-5-5', 1_000_000, '5m')).toEqual({ warm: 0.2, cold: 5 })
    expect(costOf('claude-opus-5-5', 1_000_000, '1h')?.cold).toBe(8)
    const cents = (usd: number | undefined) => Math.round((usd ?? 0) * 100)
    expect(cents(costOf('claude-sonnet-5-5', 1_000_000, '5m')?.warm)).toBe(20)
    expect(cents(costOf('claude-fable-5-1', 1_000_000, '5m')?.warm)).toBe(25)
    expect(costOf('some-other-model', 1_000_000, '5m')).toBeNull()
  })
})
