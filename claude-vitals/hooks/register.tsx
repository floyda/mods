import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'

import type { CcusageState, ChangeRow, ChangesState, GraphicsMode, OutputRow } from '../types'

import { cacheBarColumns } from './cards/cache'
import { compactTree } from './cards/compact'
import type { Actions, Kit } from './cards/kit'
import { ZED_MISSING, zedCandidates } from './editor'
import { lineCount, localDate, parseOffset } from './format'
import { Animator } from './graphics/animator'
import type { Animated, AnimatorHost } from './graphics/animator'
import { pickMode } from './graphics/mode'
import { paletteFor, themeOf } from './graphics/palette'
import { cachePill, characterPicture } from './graphics/pictures'
import { frameAt, frameIndex, spriteCells } from './graphics/sprite'
import { moodOf } from './mood'
import { moodInput, paneCards } from './pane'
import type { PaneData } from './pane'
import { celebrate, completed, saved, started, typed } from './sources/activity'
import { afterResponse, cacheView, resumed, withEngineTtl } from './sources/cache'
import {
  AFTER_TURN_GAP_MS,
  ccusageArgv,
  CCUSAGE_TIMEOUT_MS,
  compactDate,
  firstLine,
  parseBlocks,
  parseDaily,
  shiftDate,
} from './sources/ccusage'
import type { CcusageRun } from './sources/ccusage'
import { contextFrom, spendFrom } from './sources/context'
import {
  editFacts,
  EMPTY_TREE,
  GIT_TIMEOUT_MS,
  parseFirstLines,
  parseNumstat,
  recordEdit,
  UNTRACKED_LIMIT,
} from './sources/files'
import { tasksFrom } from './sources/tasks'
import * as S from './state'
import { Coalescer, Debouncer } from './throttle'

// The session's values, declared here: the engine lists what a module reads and writes from this file's own consts.
const cacheState = atom({ plugin: 'vitals', key: 'cache' } as const, S.INITIAL_CACHE)
const contextState = atom({ plugin: 'vitals', key: 'context' } as const, S.INITIAL_CONTEXT)
const spendState = atom({ plugin: 'vitals', key: 'spend' } as const, S.INITIAL_SPEND)
const ccusageState = atom({ plugin: 'vitals', key: 'ccusage' } as const, S.INITIAL_CCUSAGE)
const outputsState = atom({ plugin: 'vitals', key: 'outputs' } as const, [] as OutputRow[])
const changesState = atom({ plugin: 'vitals', key: 'changes' } as const, S.INITIAL_CHANGES)
const tasksState = atom({ plugin: 'vitals', key: 'tasks' } as const, S.INITIAL_TASKS)
const activityState = atom({ plugin: 'vitals', key: 'activity' } as const, S.INITIAL_ACTIVITY)
const viewState = atom({ plugin: 'vitals', key: 'view' } as const, S.INITIAL_VIEW)
const placeState = atom({ plugin: 'vitals', key: 'place' } as const, S.INITIAL_PLACE)
const nowState = atom({ plugin: 'vitals', key: 'now' } as const, 0)

const PANE = 'vitals'
const TITLE = 'Vitals'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// The module's own: set again by each load's `register`, so a reload starts them over.
const settings = {
  autoOpen: true,
  columns: 46,
  zedPath: '',
  ccusageCommand: 'pnpx ccusage',
  refreshMs: 300_000,
  graphics: 'auto',
  character: true,
  animations: true,
}
/** Where the pane last drew: the animator paints only into a docked pane, at its width. */
const site = { isDocked: false, width: 42 }
const animator = new Animator(PANE)
const recount = new Coalescer(2_000)
const changesSoon = new Debouncer(1_000)
let ticker: Timer | null = null
let usageTimer: Timer | null = null
let ticks = 0
let autoOpenTried = false

export const register: Register = (on, options) => {
  settings.autoOpen = options.autoOpen !== false
  settings.columns = Math.min(120, Math.max(30, Number(options.columns ?? 46) || 46))
  settings.zedPath = String(options.zedPath ?? '')
  settings.ccusageCommand = String(options.ccusageCommand ?? 'pnpx ccusage').trim() || 'pnpx ccusage'
  settings.refreshMs = Math.max(30, Number(options.ccusageRefreshSeconds ?? 300) || 300) * 1_000
  settings.graphics = String(options.graphics ?? 'auto')
  settings.character = options.character !== false
  settings.animations = options.animations !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vitals',
      description: 'Show or hide the claude-vitals sidebar: cache, context, usage, files and tasks',
    })
    const now = await $.clock.now()
    const home = (await $.env.get('HOME')) ?? null
    await update($, placeState, place => ({ ...place, cwd: e.cwd, home }))
    await update($, activityState, a => ({ ...a, lastActiveAt: now }))
    await restoreView($)
    ticker?.cancel()
    ticker = $.clock.every(1_000, () => void tick($))
    usageTimer?.cancel()
    usageTimer = $.clock.every(settings.refreshMs, () => void refreshUsage($, true))
    $.clock.after(0, () => void refreshAll($))
    return next(e)
  })

  on('command.run', { command: 'vitals' }, async $ => {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (pane?.isShown === true) {
      await $.ui.close({ id: PANE })
      animator.stop()
      return { text: 'Vitals sidebar closed.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, columns: settings.columns })
    $.clock.after(0, () => void refreshAll($))
    return { text: 'Vitals sidebar opened.' }
  })

  // Opened unasked only where it would be a sidebar: the fullscreen layout. The engine seats it from 144 columns.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!autoOpenTried && settings.autoOpen && e.viewport?.isFullscreen === true) {
      autoOpenTried = true
      void $.ui.open({ id: PANE, title: TITLE, columns: settings.columns })
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, spendState, () => spendFrom(e))
    if (e.changed.includes('context')) {
      recount.request(() => refreshContext($, 'summary'), (ms, fn) => $.clock.after(ms, fn))
    }
    return next(e)
  })

  // Every main-thread request reads and refreshes the cache: its countdown restarts from when it was sent.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const sentAt = await $.clock.now()
    const result = yield* next(e)
    const usage = result.usage
    if (usage !== null) await update($, cacheState, c => afterResponse(c, sentAt, usage))
    $.clock.after(0, () => void refreshTasks($))
    return result
  })

  // /clear starts a new conversation: nothing of it is cached yet, nothing edited, no tasks.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const now = await $.clock.now()
      await update($, cacheState, c => ({ ...c, lastRequestAt: null, tokens: 0, recent: [] }))
      await update($, outputsState, () => [])
      await update($, tasksState, () => S.INITIAL_TASKS)
      await update($, activityState, () => ({ ...S.INITIAL_ACTIVITY, lastActiveAt: now }))
    }
    return next(e)
  })

  // A model switch says the TTL outright, and the new model starts with nothing cached.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await update($, cacheState, c => ({ ...withEngineTtl(c, e.cache_ttl), lastRequestAt: null, model: e.to_model }))
    return next(e)
  })

  // A resumed session's cache is as warm as its last response is recent.
  on('classic.SessionStart', async ($, e, next) => {
    const seconds = e.seconds_since_last_response
    if (seconds !== undefined) {
      const at = (await $.clock.now()) - seconds * 1_000
      await update($, cacheState, c => (c.lastRequestAt === null ? resumed(c, at, e.context_tokens ?? 0, e.model ?? null) : c))
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      const now = await $.clock.now()
      await update($, activityState, a => started(a, now))
      $.clock.after(0, () => void animate($))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, activityState, a => completed(a, now))
      $.clock.after(0, () => void afterTurn($))
    }
    return next(e)
  })

  // Typing wakes the claw; at most one write a second.
  on('prompt.edit', async ($, e, next) => {
    const now = await $.clock.now()
    if (now - (await read($, activityState)).lastActiveAt >= 1_000) await update($, activityState, a => typed(a, now))
    return next(e)
  })

  // Observes every file Claude writes, the main loop's and each subagent's; never refuses one.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    if (!EDIT_TOOLS.has(tool) || ran.deny !== undefined || ran.isError === true) return ran
    const facts = editFacts(tool, e as unknown as Record<string, unknown>, ran.result)
    if (facts === null) return ran
    const now = await $.clock.now()
    const agent = e.agentId === undefined ? null : await agentName($, e.agentId)
    await update($, outputsState, rows => recordEdit(rows, facts, now, agent))
    await update($, activityState, a => saved(a, now))
    changesSoon.request(() => refreshChanges($), (ms, fn) => $.clock.after(ms, fn))
    return ran
  }).catch(($, e, next) => next(e))

  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (e.key === 'theme') await update($, viewState, v => ({ ...v, theme: themeOf(e.value) }))
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const data = await readPaneData($)
    const pal = paletteFor(data.view.theme)
    if (e.surface !== 'terminal' || e.props.placement === 'inline') {
      site.isDocked = false
      const { Box, Text } = $.ui.resolve(e)
      return compactTree({ Box, Text }, data, pal)
    }
    const ui = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns - 4)
    site.isDocked = true
    site.width = width
    const kit: Kit = { ui, pal, mode: data.view.mode, collapsed: data.view.collapsed, width, actions: actionsFor($, e.surface) }
    const { Box } = ui
    return (
      <Box flexDirection="column" backgroundColor={pal.pane}>
        {paneCards(kit, data, { showCharacter: settings.character, refreshMs: settings.refreshMs, isAnimated: settings.animations })}
      </Box>
    )
  })
}

function actionsFor($: EngineInterface, surface: RenderSurface): Actions {
  return {
    toggle: id => void toggle($, id),
    open: (path, line) => void openFile($, path, line, surface),
    refreshUsage: () => void refreshUsage($, true),
    exactContext: () => void refreshContext($, 'full'),
    toggleAllOutputs: () => void update($, viewState, v => ({ ...v, showAllOutputs: !v.showAllOutputs })),
  }
}

/** Folds or unfolds a card, and keeps the folded set for the next session. */
async function toggle($: EngineInterface, id: string): Promise<void> {
  await update($, viewState, v => ({
    ...v,
    collapsed: v.collapsed.includes(id) ? v.collapsed.filter(other => other !== id) : [...v.collapsed, id],
  }))
  await $.store.set('collapsed', (await read($, viewState)).collapsed)
}

async function restoreView($: EngineInterface): Promise<void> {
  const stored = await $.store.get('collapsed')
  const collapsed = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : S.DEFAULT_COLLAPSED
  const rows = await $.config.list().catch(() => [])
  const theme = themeOf(rows.find(row => row.key === 'theme')?.value)
  const mode = await detectMode($, settings.graphics)
  await update($, viewState, v => ({ ...v, collapsed, theme, mode }))
}

/** The machine's zone, so "today" and reset times are local: `date +%z`, as ccusage itself reads it. */
async function readZone($: EngineInterface): Promise<void> {
  try {
    const { stdout } = await $.process.run(['date', '+%z'], { timeoutMs: 5_000 })
    const tzOffsetMin = parseOffset(stdout)
    await update($, placeState, place => ({ ...place, tzOffsetMin }))
  } catch {
    // Keep UTC.
  }
}

async function refreshAll($: EngineInterface): Promise<void> {
  await readZone($)
  await Promise.all([refreshContext($, 'summary'), refreshFiles($), refreshTasks($), refreshUsage($, false)])
}

async function refreshFiles($: EngineInterface): Promise<void> {
  await refreshChanges($)
  await checkDeleted($)
}

/** ccusage now, or (unless forced) only once 30 s have passed since it last started. */
async function refreshUsage($: EngineInterface, isForced: boolean): Promise<void> {
  const { lastStartedAt } = await read($, ccusageState)
  const now = await $.clock.now()
  if (!isForced && lastStartedAt !== null && now - lastStartedAt < AFTER_TURN_GAP_MS) return
  await refreshCcusage($)
}

async function afterTurn($: EngineInterface): Promise<void> {
  await Promise.all([refreshUsage($, false), refreshFiles($), refreshTasks($)])
  await animate($)
}

async function refreshTasks($: EngineInterface): Promise<void> {
  const list = await $.agent.list().catch(() => null)
  if (list === null) return
  const now = await $.clock.now()
  let finishedNow = 0
  await update($, tasksState, prev => {
    const next = tasksFrom(list, prev, now)
    finishedNow = next.finishedNow
    return next.state
  })
  if (finishedNow > 0) await update($, activityState, a => celebrate(a, now))
}

async function agentName($: EngineInterface, id: string): Promise<string> {
  const agent = (await $.agent.list().catch(() => [])).find(one => one.id === id)
  return agent?.name ?? agent?.type ?? 'agent'
}

async function isShown($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown)
}

/** Once a second: the countdown's clock while the pane shows, running tasks every other second, and the animations. */
async function tick($: EngineInterface): Promise<void> {
  ticks += 1
  const shown = await isShown($)
  if (shown) {
    const now = await $.clock.now()
    await update($, nowState, () => now)
  }
  if ((await read($, tasksState)).running.length > 0 && ticks % 2 === 0) await refreshTasks($)
  await animate($, shown)
}

/** Starts, changes or stops the moving pictures: the claw in its mood, and the warm cache pill in pixel mode. */
async function animate($: EngineInterface, shown?: boolean): Promise<void> {
  const isOn = shown ?? (await isShown($))
  if (!isOn || !settings.animations || !site.isDocked) {
    animator.stop()
    return
  }
  const d = await readPaneData($)
  const list: Animated[] = []
  const isPixels = d.view.mode === 'pixels'
  if (settings.character) {
    const mood = moodOf(moodInput(d))
    list.push({
      key: 'character',
      frame: ms => {
        const frame = frameAt(mood, ms)
        return {
          sig: `${mood}:${frameIndex(mood, ms)}`,
          blit: isPixels ? { kind: 'image', source: characterPicture(frame).source } : { kind: 'raster', cells: spriteCells(frame) },
        }
      },
    })
  }
  if (isPixels && !d.view.collapsed.includes('cache') && cacheView(d.cache, d.now).status === 'warm') {
    const pal = paletteFor(d.view.theme)
    const columns = cacheBarColumns(site.width)
    list.push({
      key: 'cache-pill',
      frame: ms => ({
        sig: String(Math.floor(ms / 125)),
        blit: { kind: 'image', source: cachePill(cacheView(d.cache, ms), pal, columns, ms).source },
      }),
    })
  }
  animator.set(animatorHost($), list)
}

// Everything below calls the engine. The engine follows `$` only into functions declared in this file,
// so the reading and running live here and the modules beside it stay pure.

function animatorHost($: EngineInterface): AnimatorHost {
  return {
    every: (ms, fn) => $.clock.every(ms, fn),
    now: () => $.clock.now(),
    blit: args => $.ui.blit(args),
  }
}

/** Pictures where the terminal draws them (kitty, Ghostty; tmux passes none through), else coloured text. */
async function detectMode($: EngineInterface, setting: string): Promise<GraphicsMode> {
  if (setting === 'pixels' || setting === 'text') return setting
  const [term, kittyWindowId, termProgram, tmux] = await Promise.all([
    $.env.get('TERM'),
    $.env.get('KITTY_WINDOW_ID'),
    $.env.get('TERM_PROGRAM'),
    $.env.get('TMUX'),
  ])
  return pickMode(setting, { term, kittyWindowId, termProgram, tmux })
}

/** Every value the pane draws from. Read while drawing, it subscribes the pane to each. */
async function readPaneData($: EngineInterface): Promise<PaneData> {
  const [cache, context, spend, ccusage, outputs, changes, tasks, activity, view, place, tick] = await Promise.all([
    read($, cacheState),
    read($, contextState),
    read($, spendState),
    read($, ccusageState),
    read($, outputsState),
    read($, changesState),
    read($, tasksState),
    read($, activityState),
    read($, viewState),
    read($, placeState),
    read($, nowState),
  ])
  const now = Math.max(tick, await $.clock.now())
  return { cache, context, spend, ccusage, outputs, changes, tasks, activity, view, place, now }
}

/** Re-reads the window's breakdown (and the status line's figures) into the context and spend atoms. */
async function refreshContext($: EngineInterface, detail: 'summary' | 'full'): Promise<void> {
  try {
    const [usage, model] = await Promise.all([$.session.usage({ breakdown: detail, columns: 46 }), $.session.model()])
    await update($, contextState, () => contextFrom(usage, detail === 'full', model))
    await update($, spendState, () => spendFrom(usage))
  } catch {
    // No session bound yet, or the count failed: the last figures stand.
  }
}

/** One ccusage report. A run that cannot start is `missing`; one that exits non-zero or times out is `failed`. */
async function runCcusage($: EngineInterface, report: readonly string[]): Promise<CcusageRun> {
  const startedAt = await $.clock.now()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(ccusageArgv(settings.ccusageCommand, report), {
      timeoutMs: CCUSAGE_TIMEOUT_MS,
    })
    if (exitCode !== 0) return { isOk: false, status: 'failed', error: firstLine(stderr) ?? `exit code ${exitCode}` }
    return { isOk: true, stdout }
  } catch {
    const took = (await $.clock.now()) - startedAt
    if (took >= CCUSAGE_TIMEOUT_MS - 1000) return { isOk: false, status: 'failed', error: 'timed out after 20s' }
    return { isOk: false, status: 'missing', error: 'not found' }
  }
}

let isCcusageRunning = false

/** Reads today's spend, the week and the active block into the ccusage atom; the last good figures stay while it runs. */
async function refreshCcusage($: EngineInterface): Promise<void> {
  if (isCcusageRunning) return
  isCcusageRunning = true
  try {
    const now = await $.clock.now()
    const { tzOffsetMin } = await read($, placeState)
    await update($, ccusageState, (s): CcusageState => ({ ...s, status: s.status === 'ok' ? 'ok' : 'running', lastStartedAt: now }))
    const today = localDate(now, tzOffsetMin)
    const since = compactDate(shiftDate(today, -6))
    const daily = await runCcusage($, ['daily', '--json', '--breakdown', '--offline', '--since', since])
    if (!daily.isOk) {
      await update($, ccusageState, (s): CcusageState => ({ ...s, status: daily.status, error: daily.error }))
      return
    }
    const figures = parseDaily(daily.stdout, today)
    if (figures === null) {
      await update($, ccusageState, (s): CcusageState => ({ ...s, status: 'failed', error: 'unexpected output from ccusage daily' }))
      return
    }
    const blocks = await runCcusage($, ['blocks', '--active', '--json', '--offline'])
    const block = blocks.isOk ? (parseBlocks(blocks.stdout) ?? null) : null
    await update($, ccusageState, (s): CcusageState => ({
      ...s,
      status: 'ok',
      error: null,
      updatedAt: now,
      today: figures.today,
      week: figures.week,
      block,
    }))
  } finally {
    isCcusageRunning = false
  }
}

/** Reads the repository's uncommitted changes (and the branch) into the changes atom. */
async function refreshChanges($: EngineInterface): Promise<void> {
  const git = (args: string[]) => $.process.run(['git', ...args], { timeoutMs: GIT_TIMEOUT_MS })
  try {
    const top = await git(['rev-parse', '--show-toplevel'])
    if (top.exitCode !== 0) {
      await update($, changesState, (): ChangesState => ({ status: 'not-git', branch: null, files: [] }))
      return
    }
    const root = top.stdout.trim()
    const branch = (await git(['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim() || null
    const hasHead = (await git(['rev-parse', '--verify', '-q', 'HEAD'])).exitCode === 0
    const base = hasHead ? 'HEAD' : EMPTY_TREE
    const stats = parseNumstat((await git(['diff', '--numstat', base])).stdout)
    const firsts = parseFirstLines((await git(['diff', '-U0', '--no-color', '--no-ext-diff', base])).stdout)
    const untracked = (await git(['ls-files', '--others', '--exclude-standard'])).stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '')
    const files: ChangeRow[] = stats.map(stat => ({
      path: `${root}/${stat.path}`,
      added: stat.added,
      removed: stat.removed,
      line: firsts.get(stat.path) ?? 1,
    }))
    for (const relative of untracked.slice(0, UNTRACKED_LIMIT)) {
      const text = await $.fs.read(`${root}/${relative}`).catch(() => '')
      files.push({ path: `${root}/${relative}`, added: lineCount(typeof text === 'string' ? text : ''), removed: 0, line: 1 })
    }
    await update($, changesState, (): ChangesState => ({ status: 'ok', branch, files }))
  } catch {
    await update($, changesState, (current): ChangesState => ({ ...current, status: 'timeout' }))
  }
}

/** Marks Outputs rows whose file is gone. */
async function checkDeleted($: EngineInterface): Promise<void> {
  const rows = await read($, outputsState)
  const gone = new Set<string>()
  for (const row of rows) {
    const exists = await $.fs.exists(row.path).catch(() => true)
    if (!exists) gone.add(row.path)
  }
  if (rows.every(row => row.isDeleted === gone.has(row.path))) return
  await update($, outputsState, list => list.map(row => ({ ...row, isDeleted: gone.has(row.path) })))
}

/** Opens `path` at `line` in Zed; false when no candidate ran. */
async function openInZed($: EngineInterface, path: string, line: number): Promise<boolean> {
  for (const zed of zedCandidates(settings.zedPath)) {
    try {
      const { exitCode } = await $.process.run([zed, `${path}:${line}`], { timeoutMs: 10_000 })
      if (exitCode === 0) return true
    } catch {
      // Not there: try the next.
    }
  }
  return false
}

/** Opens the file in Zed, or says why it could not and puts the path on the clipboard. */
async function openFile($: EngineInterface, path: string, line: number, surface: RenderSurface): Promise<void> {
  if (await openInZed($, path, line)) return
  $.ui.toast(ZED_MISSING)
  await $.ui.copy({ text: path, surface }).catch(() => undefined)
}
