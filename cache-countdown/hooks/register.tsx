import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, Timer } from 'claude-code'

import type { CacheBusy, CacheClock, CacheHandoff, CacheTtl, CacheTtlSource } from '../types'
import { bar, CLAW_COLUMNS, CLAW_ROWS, clawCells, clawSvg } from './claw'
import type { Mood } from './claw'
import { costOf, money } from './pricing'

const clock = atom({ plugin: 'cache-countdown', key: 'clock' } as const, {
  lastRequestAt: null,
  refreshedAt: null,
  tokens: 0,
  model: null,
})
const ttl = atom({ plugin: 'cache-countdown', key: 'ttl' } as const, {
  value: '1h',
  source: 'default',
})
const now = atom({ plugin: 'cache-countdown', key: 'now' } as const, 0)
const alerts = atom({ plugin: 'cache-countdown', key: 'alerts' } as const, {
  warnedFor: null,
  coldFor: null,
  askedFor: null,
  keptFor: null,
  awayFor: null,
})
const busy = atom({ plugin: 'cache-countdown', key: 'busy' } as const, null)
const isWorking = atom({ plugin: 'cache-countdown', key: 'isWorking' } as const, false)
const lastActivityAt = atom({ plugin: 'cache-countdown', key: 'lastActivityAt' } as const, 0)
const handoff = atom({ plugin: 'cache-countdown', key: 'handoff' } as const, null)

const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const LEARNED_TTL = 'learnedTtl'
// While the person is away, the handoff is written this long before the cache goes cold: its request still reads warm.
const AWAY_LEAD_MS = 60_000
const PANE = 'cache-handoff'

const SEND = 'Send with full context'
const RESUME = 'Resume from handoff'
const HAND_OFF = 'Hand off, then resume'
const HOLD = 'Hold my prompt'

const HANDOFF_PROMPT = `Write a handoff document for this session. Its prompt cache is about to expire, and the work may be restarted from this document alone: whoever reads it next has none of the conversation above. Write it for that reader.

Use these Markdown sections, in this order; leave a section out only if it would be empty:
## Goal: what the user is trying to achieve and why, in their words where the wording matters.
## Constraints and preferences: every instruction, preference and thing to avoid that the user stated.
## Current state: what is done, in progress, broken or unverified. Name files, branches, commands and their results.
## Decisions: what was decided and why; approaches tried and rejected, one line each.
## Key references: exact file paths, symbols, commands, URLs, IDs, versions and error messages still relevant.
## How to resume: the first steps to rebuild working context from cold: which files to re-read, which commands to run, what to check first.
## Next step: the single next action, concrete enough to start on at once.

Complete but terse: bullets over prose, no preamble, no closing remarks. Leave out file contents and tool output that can be read again from disk; point to them instead. Reply with the document only.`

type Busy = NonNullable<CacheBusy>

// The module's own: set again by each load's `register`, so a reload starts them over.
const config = {
  setting: 'auto',
  warnMs: 120_000,
  askWhenCold: true,
  hasSound: true,
  whenAway: 'handoff',
  awayMs: 180_000,
}
let isInteractive = true
let ticker: Timer | undefined
let refill: Timer | undefined

export const register: Register = (on, options) => {
  config.setting = String(options.cacheTtl ?? 'auto')
  config.warnMs = Math.max(0, Number(options.warnSeconds ?? 120)) * 1000
  config.askWhenCold = options.askWhenCold !== false
  config.hasSound = options.sound !== false
  config.whenAway = String(options.whenAway ?? 'handoff')
  config.awayMs = Math.max(0, Number(options.awaySeconds ?? 180)) * 1000

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    await $.command.register({
      name: 'handoff',
      description: 'Write a handoff for this session (goal, state, decisions, how to resume) and offer to resume from it',
    })
    await settleTtl($)
    // The countdown lives in the band; take down any status line an earlier version pinned.
    $.ui.status(undefined)
    ticker?.cancel()
    ticker = $.clock.every(1000, () => void tick($))

    return next(e)
  })

  // The pane opens under the command, so it seats at any width; the handoff is written once the hook returned.
  on('command.run', { command: 'handoff' }, async $ => {
    if ((await read($, busy)) !== null) return { text: 'Already writing a handoff or resuming from one.' }
    await $.ui.open({ id: PANE, title: 'Handoff' })
    $.clock.after(0, () => void writeHandoff($, 'asked'))

    return { text: 'Writing a handoff for this session…' }
  })

  on('prompt.edit', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, lastActivityAt, () => at)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, isWorking, () => true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => false)

    return next(e)
  })

  // Every main-thread request reads and refreshes the cache: the countdown restarts from when it was sent.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const sentAt = await $.clock.now()
    const before = await read($, clock)
    const result = yield* next(e)
    const usage = result.usage
    if (usage !== null) {
      await learn($, before, sentAt, usage)
      const tokens =
        usage.input_tokens +
        usage.cache_read_input_tokens +
        usage.cache_creation_input_tokens +
        usage.output_tokens
      await update($, clock, () => ({ lastRequestAt: sentAt, refreshedAt: null, tokens, model: usage.model }))
    }

    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      await update($, clock, current => ({
        ...current,
        lastRequestAt: null,
        refreshedAt: null,
        tokens: result.tokensAfter ?? 0,
      }))
    }

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, clock, current => ({ ...current, lastRequestAt: null, refreshedAt: null, tokens: 0 }))
    }

    return next(e)
  })

  // A resumed session: its cache aged while it was away.
  on('classic.SessionStart', async ($, e, next) => {
    const seconds = e.seconds_since_last_response
    if (seconds !== undefined && (await read($, clock)).lastRequestAt === null) {
      const at = await $.clock.now()
      await update($, clock, current => ({
        ...current,
        lastRequestAt: at - seconds * 1000,
        tokens: e.context_tokens ?? 0,
        model: e.model ?? current.model,
      }))
    }

    return next(e)
  })

  // A model switch says the TTL outright, and the new model starts with nothing cached.
  on('classic.PostModelSwitch', async ($, e, next) => {
    if (config.setting === 'auto') await update($, ttl, () => ({ value: e.cache_ttl, source: 'engine' }))
    await update($, clock, current => ({ ...current, lastRequestAt: null, refreshedAt: null, model: e.to_model }))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const submittedAt = await $.clock.now()
    await update($, lastActivityAt, () => submittedAt)
    if (!config.askWhenCold || !isInteractive || e.turnId !== undefined) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return next(e)
    if (e.text.trimStart().startsWith('/')) return next(e)
    const current = await read($, clock)
    const { lastRequestAt, tokens } = current
    if (lastRequestAt === null) return next(e)
    const left = (await expiresAt($, current)) - (await $.clock.now())
    if (left > 0) return next(e)
    const done = await read($, alerts)
    if (done.askedFor === lastRequestAt || done.keptFor === lastRequestAt) return next(e)

    // Asked once per cold cache: whatever the answer, the next Enter goes through.
    await update($, alerts, a => ({ ...a, askedFor: lastRequestAt }))
    const written = await read($, handoff)
    const isReady = written !== null && written.writtenFor === lastRequestAt
    const cost = costOf(current.model, tokens, (await read($, ttl)).value)
    const price = cost ? ` (about ${money(cost.cold)} at API prices)` : ''
    const ready = isReady ? ` A handoff is ready: ${tokensText(written.tokens)} tokens.` : ''
    let choice = HOLD
    try {
      choice = await $.ui.ask(
        `The prompt cache went cold ${agoText(-left)}: this turn re-sends ${tokensText(tokens)} tokens uncached${price}.${ready} How should it go?`,
        { header: 'Cold cache', options: [isReady ? RESUME : HAND_OFF, SEND, HOLD] },
      )
    } catch {
      choice = HOLD
    }

    if (choice === SEND) return next(e)
    if (choice === RESUME || choice === HAND_OFF) {
      // Not under this hook: it holds the turn the prompt would start, and a command cannot run under it.
      $.clock.after(0, () => void handOffThenRefill($, e.text, isReady))
      return hold(
        $,
        e.text,
        isReady
          ? 'Resuming from the handoff first: your prompt waits in the box until it is done.'
          : 'Writing a handoff first: your prompt waits in the box until the session resumes from it.',
      )
    }

    return hold(
      $,
      e.text,
      'Held: the prompt cache is cold. Your prompt is back in the box: Enter sends it with full context, or choose in the band above (click it, or ctrl+x tab) first.',
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking) return next(e)
    const current = await read($, clock)
    const { lastRequestAt, tokens } = current
    if (lastRequestAt === null) return next(e)
    const ttlNow = (await read($, ttl)).value
    const left = (await expiresAt($, current)) - (await read($, now))
    const done = await read($, alerts)
    if (left <= 0 && done.keptFor === lastRequestAt) return next(e)
    const written = await read($, handoff)
    const isReady = written !== null && written.writtenFor === lastRequestAt
    const working = await read($, busy)
    const cost = costOf(current.model, tokens, ttlNow)
    const fraction = left / TTL_MS[ttlNow]
    const width = Math.max(8, Math.min(24, e.props.bodyColumns - 60))
    const { filled, empty } = bar(fraction, width)
    const tone = fraction > 0.25 ? 'success' : fraction > 0.1 ? 'warning' : 'error'
    const { Box, Button, Text } = $.ui.resolve(e)

    if (working === null && left > config.warnMs && !isReady) {
      return (
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>cache</Text>
          <Text>
            <Text color={tone}>{filled}</Text>
            <Text dimColor>{empty}</Text>
          </Text>
          <Text>{clockText(left)}</Text>
          <Text dimColor wrap="truncate-end">
            · {tokensText(tokens)} cached{cost ? ` · cold re-send ≈ ${money(cost.cold)}` : ''}
          </Text>
        </Box>
      )
    }

    const mood: Mood =
      working === 'handing-off' ? 'writing' : left <= 0 ? (isReady ? 'handoff' : 'cold') : 'warning'
    let claw = null
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      claw = <Raster key="claw" columns={CLAW_COLUMNS} rows={CLAW_ROWS} cells={clawCells(mood)} />
    } else if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      claw = <Svg source={clawSvg(mood)} alt={`The claw, ${mood}`} width={56} />
    }

    const headline =
      working === 'handing-off'
        ? 'Writing a handoff…'
        : working === 'resuming'
          ? 'Resuming from the handoff…'
          : left > 0
            ? `Prompt cache goes cold in ${clockText(left)}`
            : isReady
              ? `Cache went cold ${agoText(-left)} · handoff ready`
              : `Prompt cache went cold ${agoText(-left)}`
    const coldCost = cost ? ` (≈ ${money(cost.cold)} at API prices)` : ''
    const detail =
      isReady && written !== null
        ? `Resume with ${tokensText(written.tokens)} tokens instead of re-sending ${tokensText(tokens)}${coldCost}`
        : left > 0
          ? `${tokensText(tokens)} cached · cold, the next turn re-sends it${coldCost}`
          : `The next turn re-sends ${tokensText(tokens)} tokens uncached${coldCost}`
    const away =
      left > 0 && config.whenAway === 'handoff' && working === null && !isReady
        ? 'Away? A handoff is written a minute before it goes cold.'
        : null
    const keep = async () => {
      const { lastRequestAt: kept } = await read($, clock)
      await update($, alerts, a => ({ ...a, keptFor: kept }))
    }

    return (
      <Box flexDirection="row" columnGap={2}>
        {claw}
        <Box flexDirection="column">
          <Text color={left > 0 ? 'warning' : 'suggestion'} bold>
            {headline}
          </Text>
          {left > 0 && (
            <Text>
              <Text color={tone}>{filled}</Text>
              <Text dimColor>{empty}</Text>
            </Text>
          )}
          <Text dimColor wrap="truncate-end">
            {detail}
          </Text>
          {away !== null && <Text dimColor>{away}</Text>}
          {working === null && (
            <Box flexDirection="row" columnGap={1}>
              {isReady ? (
                <Button
                  key="resume"
                  hotkey="1"
                  variant="primary"
                  label="Resume from handoff"
                  onPress={async () => $.ui.toast((await resume($)).text)}
                />
              ) : (
                <Button
                  key="hand-off"
                  hotkey="1"
                  variant={left > 0 ? undefined : 'primary'}
                  label="Hand off now"
                  onPress={() => writeHandoff($, 'asked')}
                />
              )}
              {left <= 0 && <Button key="keep" hotkey="2" label="Keep full context" onPress={keep} />}
              {isReady && (
                <Button key="view" hotkey="3" label="View handoff" onPress={() => $.ui.open({ id: PANE, title: 'Handoff' })} />
              )}
            </Box>
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const written = await read($, handoff)
    const working = await read($, busy)
    if (working === 'handing-off') return <Text dimColor>Writing the handoff…</Text>
    if (written === null) return <Text dimColor>No handoff yet: /handoff writes one.</Text>

    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>
          {tokensText(written.tokens)} tokens · {written.path === null ? 'not saved to disk' : `saved to ${written.path}`}
        </Text>
        <Box flexDirection="row" columnGap={1}>
          <Button
            key="resume"
            hotkey="1"
            variant="primary"
            label={working === 'resuming' ? 'Resuming…' : 'Resume from this handoff'}
            onPress={async () => {
              const done = await resume($)
              $.ui.toast(done.text)
              if (done.isDone) await $.ui.close({ id: PANE })
            }}
          />
          <Button key="close" hotkey="2" role="dismiss" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Markdown text={written.text} />
      </Box>
    )
  })
}

async function ttlMs($: EngineInterface) {
  return TTL_MS[(await read($, ttl)).value]
}

async function expiresAt($: EngineInterface, current: CacheClock) {
  return Math.max(current.lastRequestAt ?? 0, current.refreshedAt ?? 0) + (await ttlMs($))
}

function chime($: EngineInterface, kind: 'warn' | 'cold') {
  if (!config.hasSound) return
  const asset = kind === 'warn' ? 'sounds/warn.wav' : 'sounds/cold.wav'
  $.audio.play({ asset }).catch(() => undefined)
}

async function settleTtl($: EngineInterface) {
  const setting = config.setting
  if (setting === '5m' || setting === '1h') {
    await update($, ttl, () => ({ value: setting, source: 'setting' }))
    return
  }
  if ((await read($, ttl)).source === 'engine') return
  const learned = await $.store.get(LEARNED_TTL)
  const settled: { value: CacheTtl; source: CacheTtlSource } =
    learned === '5m' || learned === '1h'
      ? { value: learned, source: 'learned' }
      : { value: '1h', source: 'default' }
  await update($, ttl, () => settled)
}

// A main-thread request after a gap longer than 5 minutes says which TTL the cache runs on:
// most of the last context read back from cache means 1h, nearly all of it written afresh means 5m.
async function learn($: EngineInterface, before: CacheClock, sentAt: number, usage: ModelUsage) {
  if (config.setting !== 'auto' || before.lastRequestAt === null || before.tokens === 0) return
  const gap = sentAt - Math.max(before.lastRequestAt, before.refreshedAt ?? 0)
  if (gap < 5.5 * 60_000 || gap > 59 * 60_000) return
  const isHit = usage.cache_read_input_tokens >= before.tokens * 0.5
  const isMiss =
    usage.cache_read_input_tokens < before.tokens * 0.2 &&
    usage.cache_creation_input_tokens >= before.tokens * 0.5
  const seen: CacheTtl | null = isHit ? '1h' : isMiss ? '5m' : null
  if (seen === null) return
  await $.store.set(LEARNED_TTL, seen)
  if ((await read($, ttl)).source !== 'engine') {
    await update($, ttl, () => ({ value: seen, source: 'learned' }))
  }
}

async function withBusy<T>($: EngineInterface, kind: Busy, work: () => Promise<T>) {
  await update($, busy, () => kind)
  try {
    return await work()
  } finally {
    await update($, busy, () => null)
  }
}

// The handoff is one question over the session as the main thread last sent it: while the cache is warm,
// that request reads it back from cache, which also restarts the cache's TTL.
async function writeHandoff($: EngineInterface, reason: 'away' | 'asked'): Promise<CacheHandoff | null> {
  if ((await read($, busy)) !== null) return null

  return withBusy($, 'handing-off', async () => {
    const before = await read($, clock)
    const sentAt = await $.clock.now()
    const reply = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!reply.isAnswered) {
      $.ui.toast(`Could not write a handoff: ${reply.reason}`, { timeoutMs: 10_000 })
      return null
    }
    const text = reply.text.trim()
    const written: CacheHandoff = {
      path: await saveHandoff($, text, sentAt),
      text,
      tokens: reply.usage.output_tokens,
      writtenFor: before.lastRequestAt,
      at: sentAt,
    }
    await update($, handoff, () => written)
    if (before.lastRequestAt !== null && reply.usage.cache_read_input_tokens >= before.tokens * 0.5) {
      await update($, clock, current => ({ ...current, refreshedAt: sentAt }))
    }
    const where = written.path === null ? '' : `, saved to ${written.path}`
    $.ui.log(
      `cache-countdown: handoff written${reason === 'away' ? ' while you were away' : ''}: ${tokensText(written.tokens)} tokens${where}`,
    )
    if (reason === 'asked') $.ui.toast(`Handoff ready: ${tokensText(written.tokens)} tokens.`)

    return written
  })
}

async function saveHandoff($: EngineInterface, text: string, at: number) {
  try {
    const root = await $.session.root()
    const session = (await $.session.id()).slice(0, 8)
    const stamp = new Date(at).toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const path = `${root}/.claude/handoffs/${stamp}-${session}.md`
    await $.fs.write(path, `${text}\n`)
    return path
  } catch {
    return null
  }
}

function resumeText(written: CacheHandoff) {
  const saved = written.path === null ? '' : ` It is also saved at ${written.path}.`

  return `This conversation was resumed from a handoff, written when the previous session's prompt cache was about to go cold, so that session's conversation is not in your context. The handoff below is the state of the work; re-read the files it points to before relying on their details.${saved}

${written.text}`
}

// A resume starts the conversation afresh (/clear: the old transcript stays on disk for --resume)
// and hands the model the handoff as its first row, one the person does not see as typed.
async function resume($: EngineInterface) {
  const written = await read($, handoff)
  if (written === null) return { isDone: false, text: 'There is no handoff to resume from.' }
  if ((await read($, busy)) !== null) return { isDone: false, text: 'Already writing a handoff or resuming from one.' }

  return withBusy($, 'resuming', async () => {
    const before = await read($, clock)
    try {
      await $.command.run({ command: 'clear' })
      const appended = await $.session.append({
        message: { type: 'user', content: [{ type: 'text', text: resumeText(written) }] },
      })
      if ('deny' in appended && appended.deny !== undefined) {
        return { isDone: false, text: `Cleared, but the handoff was refused: ${appended.deny}` }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { isDone: false, text: `Could not resume: ${reason}` }
    }
    await update($, clock, () => ({ lastRequestAt: null, refreshedAt: null, tokens: written.tokens, model: before.model }))
    await update($, handoff, () => null)

    return {
      isDone: true,
      text: `Resumed from the handoff: ${tokensText(before.tokens)} → ${tokensText(written.tokens)} tokens.`,
    }
  })
}

// The prompt waits in the box for Enter, so it reaches the model as the person's own.
async function handOffThenRefill($: EngineInterface, text: string, isReady: boolean) {
  if (!isReady && (await writeHandoff($, 'asked')) === null) {
    $.ui.toast('Your prompt is still in the box: Enter sends it with full context.', { timeoutMs: 10_000 })
    return
  }
  const done = await resume($)
  if (!done.isDone) {
    $.ui.toast(`${done.text} Your prompt is still in the box: Enter sends it with full context.`, {
      timeoutMs: 10_000,
    })
    return
  }
  refill?.cancel()
  const box = await $.prompt.read()
  if (box.text === '') await $.prompt.fill({ text, mode: 'replace' })
  $.ui.toast(`${done.text} Your prompt is in the box: press Enter to send it.`, { timeoutMs: 10_000 })
}

async function tick($: EngineInterface) {
  const current = await read($, clock)
  const { lastRequestAt, tokens } = current
  if (lastRequestAt === null) return
  const at = await $.clock.now()
  const left = (await expiresAt($, current)) - at
  const written = await read($, handoff)
  const isReady = written !== null && written.writtenFor === lastRequestAt
  await update($, now, () => at)
  if ((await read($, isWorking)) || (await read($, busy)) !== null) return

  const done = await read($, alerts)
  if (left <= 0 && done.coldFor !== lastRequestAt) {
    await update($, alerts, a => ({ ...a, coldFor: lastRequestAt, warnedFor: lastRequestAt }))
    $.ui.toast(
      isReady
        ? 'Prompt cache went cold: a handoff is ready to resume from.'
        : `Prompt cache went cold: the next turn re-sends ${tokensText(tokens)} tokens uncached.`,
      { timeoutMs: 10_000 },
    )
    chime($, 'cold')
  } else if (left > 0 && left <= config.warnMs && done.warnedFor !== lastRequestAt) {
    await update($, alerts, a => ({ ...a, warnedFor: lastRequestAt }))
    $.ui.toast(`Prompt cache goes cold in ${clockText(left)}.`, { timeoutMs: 8_000 })
    chime($, 'warn')
  }

  const isAway = at - (await read($, lastActivityAt)) >= config.awayMs
  if (
    config.whenAway === 'handoff' &&
    left > 0 &&
    left <= AWAY_LEAD_MS &&
    isAway &&
    !isReady &&
    done.awayFor !== lastRequestAt
  ) {
    await update($, alerts, a => ({ ...a, awayFor: lastRequestAt }))
    void writeHandoff($, 'away')
  }
}

async function hold($: EngineInterface, text: string, reason: string) {
  await $.prompt.fill({ text, mode: 'replace' })
  // The composer may clear itself once the drop lands: put the prompt back if so.
  refill?.cancel()
  refill = $.clock.after(250, () => {
    void $.prompt.read().then(box => (box.text === '' ? $.prompt.fill({ text, mode: 'replace' }) : undefined))
  })

  return { drop: reason }
}

function clockText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function agoText(ms: number) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
}

function tokensText(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`

  return String(tokens)
}
