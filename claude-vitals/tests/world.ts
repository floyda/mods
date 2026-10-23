import type { AgentInfo, On, ProcessRunResult, PromptEditInput, RenderElement, SessionUsage } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BLOCKS_JSON, CWD, DAILY_JSON, DIFF_U0, EDIT_HUNK, HOME, NUMSTAT, START, STEP_USAGE, usageFixture } from './fixtures'

export const PLUGIN = 'vitals'
export const ZED_APP = '/Applications/Zed.app/Contents/MacOS/cli'
export const PANE_PROPS = {
  title: 'Vitals',
  isFocused: false,
  bodyColumns: 46,
  placement: 'dock' as 'dock' | 'inline',
  scroll: { offset: 0, bodyRows: 80 },
  view: {},
}
export const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}
export const VIEWPORT = { columns: 200, rows: 80, isFullscreen: true }

export type Answers = {
  usage: SessionUsage
  model: string
  agents: AgentInfo[]
  ccusage: 'ok' | 'missing' | 'failed'
  /** `hang`: every git call fails as a timed-out run does. */
  git: 'repo' | 'none' | 'hang'
  zed: 'path' | 'app' | 'none'
  theme: string
  /** Paths that no longer exist. */
  gone: Set<string>
}

type Clock = { advance: (ms: number) => Promise<void>; now: () => number }

function ran(stdout: string, exitCode = 0, stderr = ''): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }
}

/** The host's commands as these tests have them: date, ccusage, git and Zed. */
function answerRun(argv: readonly string[], a: Answers): { value: ProcessRunResult } | { deny: string } {
  const [exe = '', ...args] = argv
  const line = args.join(' ')
  if (exe === 'date') return ran('+0100\n')
  if (exe === 'ccusage') {
    if (a.ccusage === 'missing') return { deny: 'spawn ccusage ENOENT' }
    if (a.ccusage === 'failed') return ran('', 1, 'Error: no usage data found\n')
    return ran(args.includes('daily') ? DAILY_JSON : BLOCKS_JSON)
  }
  if (exe === 'git') {
    if (a.git === 'hang') return { deny: 'git timed out' }
    if (a.git === 'none') return ran('', 128, 'fatal: not a git repository')
    if (line === 'rev-parse --show-toplevel') return ran(`${CWD}\n`)
    if (line.startsWith('symbolic-ref')) return ran('main\n')
    if (line.startsWith('rev-parse --verify')) return ran('abc123\n')
    if (line.startsWith('diff --numstat')) return ran(NUMSTAT)
    if (line.startsWith('diff -U0')) return ran(DIFF_U0)
    if (line.startsWith('ls-files')) return ran('notes.md\n')
    return ran('')
  }
  if (exe === 'zed') return a.zed === 'path' ? ran('') : { deny: 'spawn zed ENOENT' }
  if (exe === ZED_APP) return a.zed === 'app' ? ran('') : { deny: `spawn ${ZED_APP} ENOENT` }
  return { deny: `unexpected command ${exe}` }
}

/** The engine beneath the mod, answering every call it makes and recording what it saw. */
export function world(on: On, env: Record<string, string> = { HOME, TERM: 'xterm-256color' }, stored: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on, stored)
  mock.env(on, env)
  mock.session(on)
  const seen = {
    opened: [] as string[],
    closed: [] as string[],
    panes: new Set<string>(),
    toasts: [] as string[],
    copied: [] as string[],
    blits: [] as string[],
    runs: [] as string[][],
    counts: [] as string[],
  }
  const answers: Answers = {
    usage: usageFixture(),
    model: 'claude-opus-5-5',
    agents: [],
    ccusage: 'ok',
    git: 'repo',
    zed: 'path',
    theme: 'dark',
    gone: new Set(),
  }

  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', (_$, e) => {
    seen.opened.push(e.id)
    seen.panes.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    seen.closed.push(e.id)
    seen.panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...seen.panes].map(id => ({ id, title: 'Vitals', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.blit', (_$, e) => {
    seen.blits.push(e.key)
    return { value: {} }
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    seen.copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', (_$, e) => {
    seen.counts.push(e.breakdown ?? 'none')
    return { value: answers.usage }
  })
  on('session.model', () => ({ value: answers.model }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('agent.list', () => ({ value: answers.agents }))
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'string', value: answers.theme, provider: { kind: 'user' }, isLocked: false }] as never,
  }))
  on('fs.read', () => ({ value: 'one\ntwo\nthree\n' }))
  on('fs.exists', (_$, e) => ({ value: !answers.gone.has(e.path) }))
  on('process.run', (_$, e) => {
    seen.runs.push([...e.argv])
    return answerRun(e.argv, answers) as never
  })
  on('tool.call', (_$, e) => {
    const input = e as unknown as Record<string, unknown>
    if (String(e.tool) !== 'Edit') return { result: {} } as never
    const result = { filePath: input.file_path, oldString: 'c', newString: 'C\nD', originalFile: '', structuredPatch: [EDIT_HUNK], userModified: false, replaceAll: false }
    return { result } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'done', toolUses: [], stopReason: 'end_turn' as const, usage: STEP_USAGE }
  })

  return { clock, seen, answers }
}

/** The session starts, and the work it puts off (counting, git, ccusage) runs. */
export async function start($: Engine, clock: Clock): Promise<void> {
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await clock.advance(10)
}

export async function open($: Engine, clock: Clock): Promise<void> {
  await $.command.run({ command: 'vitals' } as never)
  await clock.advance(10)
}

/** One main-thread model request. */
export async function request($: Engine, turnId = 't1'): Promise<void> {
  for await (const _chunk of $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', messageCount: 3 })) {
    // nothing streams beneath
  }
}

export function turnStart($: Engine, turnId = 't1') {
  return $.turn.start({ text: 'go', turnId })
}

export function turnComplete($: Engine, turnId = 't1') {
  return $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId, reason: 'answer' })
}

/** Claude edits `path` (+2 −1 at line 12), as the main loop or as subagent `agentId`. */
export function edit($: Engine, path: string, agentId?: string) {
  const input = { tool: 'Edit', file_path: path, old_string: 'c', new_string: 'C\nD', ...(agentId === undefined ? {} : { agentId }) }
  return $.tool.call(input as never)
}

/** The engine measures the window again. */
export function measure($: Engine, percent: number) {
  return $.session.measure({ context: { tokens: percent * 10_000, window: 1_000_000, percent }, rateLimits: [], cost: { usd: 4.12 }, changed: ['context'] })
}

// The kit's engine raises prompt.edit as the composer does, though its typings leave the call out.
export function type($: Engine, text: string) {
  const prompt = $.prompt as unknown as { edit: (e: PromptEditInput) => Promise<unknown> }
  return prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
}

export function mountPane($: Engine, props: Partial<typeof PANE_PROPS> = {}, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'vitals', props: { ...PANE_PROPS, ...props }, viewport: VIEWPORT })
}

/** Every text the pane draws now, joined with ' | '. */
export async function paneText($: Engine, props: Partial<typeof PANE_PROPS> = {}, surface: 'terminal' | 'desktop' = 'terminal'): Promise<string> {
  const ui = await mountPane($, props, surface)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.map(found => found.text).join(' | ')
}
