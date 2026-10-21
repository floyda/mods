# claude-vitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also load the `plugin-authoring` skill before the first task: it is the mod API's guide, and its `types/claude-code.d.ts` is the authority on every signature used here.

**Goal:** Build `claude-vitals`, a Claude Code mod that docks a live sidebar beside the conversation showing prompt-cache state, context use, spend and today's usage (via ccusage), edited files and uncommitted changes (openable in Zed), and background tasks, drawn with pixel graphics in kitty and Ghostty, with a pixel claw character that reacts to the session.

**Architecture:** One hooks module (`hooks/register.tsx`) wires engine events to small sources (`hooks/sources/*`), each of which writes one `$.state` atom. One `Pane` render hook reads the atoms and composes pure card functions (`hooks/cards/*`). Pictures (ring, pills, sparkline, character) are RGBA buffers painted by `hooks/graphics/*` and drawn as `Image` elements in pixel mode, or as coloured `Text` and `Raster` cells in text mode. An animator repaints keyed pictures with `$.ui.blit`.

**Tech Stack:** Claude Code mod API (function hooks, Claude Code 2.1.29x), TypeScript 5 (strict, JSX via `h`), `claude plugin test` / `claude plugin validate`, ccusage 20 (`npx`-installable CLI), git, Zed's CLI.

**Spec:** `docs/superpowers/specs/2026-10-21-claude-vitals-design.md`

## Global Constraints

- Work in the repository root on branch `claude-vitals`. The mod is the folder `claude-vitals/` beside `cache-countdown/`. Plugin name `claude-vitals`, command `/vitals`, pane id `vitals`, pane title `Vitals`.
- A hooks module has no Node and no DOM. Every file is an ES module named `.ts`/`.tsx`. No `import()`. JSX compiles against the global `h`. Elements come from `$.ui.resolve(e)`, never globals.
- `$.state` references are literal: `atom({ plugin: 'claude-vitals', key: '<key>' } as const, initial)`, with every key declared in `types/index.d.ts`.
- `$.env.get` takes string literals only: `'HOME'`, `'TERM'`, `'TERM_PROGRAM'`, `'KITTY_WINDOW_ID'`, `'TMUX'`.
- No run-time dependency on cache-countdown. Code taken from it (the price table, the claw sprite, base64) is copied.
- Editor: Zed only. Lookup order: the `zedPath` setting, `zed` on PATH, `/Applications/Zed.app/Contents/MacOS/cli`. Invocation: `<zed> /abs/path:LINE`.
- ccusage invocation: `<ccusageCommand split on whitespace> claude daily --json --breakdown --offline --since YYYYMMDD` and `<…> claude blocks --active --json --offline`. Timeout 20 s each. `--offline` uses ccusage's bundled prices, so no network fetch on every refresh (verified against ccusage 20.0.40: about 1.2 s per call).
- Timings:
  - context recount: at most once per 2 s
  - Changes refresh: debounced 1 s after an edit
  - ccusage after a turn: at most once per 30 s
  - ccusage background refresh: `ccusageRefreshSeconds`, default 300
  - git calls: 5 s timeout each
  - celebration: 4 s
  - asleep after 10 min idle
  - sweating at 80% or more
  - animation tick: 125 ms (8 fps), only while the pane is shown, docked and `animations` is on
- Layout: the pane asks for 46 columns. A mod-initiated open docks from 144 columns, a person's from 110 (the engine enforces this). Card bodies are `bodyColumns - 4` wide. Outputs show 5 rows, then `Show N more`.
- Colours come from `hooks/graphics/palette.ts` only (24-bit hex), never theme keys, so pictures and text agree.
- UI copy, exactly:
  - `ccusage not found · npm i -g ccusage`
  - `ccusage failed: <first stderr line>`
  - `Zed not found: set its path in claude-vitals settings`
  - `not a git repo`
  - `git timed out`
  - `No files edited yet`
  - `No uncommitted changes`
  - `No background tasks`
  - `– waiting for the first response`
  - `Show N more` / `Show fewer`
  - `updated 2m ago`
- Commands, from the repo root:
  - test: `claude plugin test claude-vitals`
  - validate: `claude plugin validate claude-vitals`
  - type-check: `npx -y -p typescript@5 tsc -p claude-vitals`
- End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Known deviation from the spec: when a ccusage field is missing, the spec asks for one debug-log line naming it. The mod API has no debug-log call, so the line is only omitted from the card. Everything else follows the spec.

## Review Focus

1. **kitty inside tmux** (`KITTY_WINDOW_ID` inherited, `TMUX` set): tmux passes no graphics, so `auto` must choose text mode, not pictures that show as alt text. Test in Task 2.
2. **Renamed or moved files in `git diff --numstat`** (`src/{old.ts => new.ts}`): the Changes row must show and open the new path, not a path with braces. Test in Task 7.
3. **First ccusage run of the day** (no entry for today yet): Today reads `$0.00` with the week's sparkline. It is not a failure. Test in Task 6.
4. **A file Claude edited and later deleted:** its Outputs row is dimmed, marked `deleted`, and pressing it does nothing. It must not launch Zed on a missing path. Test in Task 14.
5. **A sidebar dragged narrow** (`bodyColumns` 30): long paths clip from the start, bars shrink to at least 8 cells, and nothing in the tree throws. Test in Task 17.

---

## File map

```
.claude-plugin/marketplace.json            modify: add the claude-vitals entry (Task 18)
claude-vitals/
  .claude-plugin/plugin.json               manifest + userConfig (Task 1)
  .gitignore                               .claude-plugin/types/ (Task 1)
  tsconfig.json                            extends the laid types' tsconfig (Task 1)
  types/index.d.ts                         state contract (Task 1)
  hooks/hooks.json                         { "modules": ["./register.tsx"] } (Task 1)
  hooks/register.tsx                       placeholder (Task 1); the whole wiring (Task 11)
  hooks/state.ts                           atoms and their initial values (Task 1)
  hooks/format.ts                          text formatting (Task 1)
  hooks/graphics/palette.ts                palettes, heat ramp, category colours (Task 2)
  hooks/graphics/mode.ts                   pixels or text from the environment (Task 2)
  hooks/graphics/canvas.ts                 RGBA canvas, pill, ring, base64 (Task 2)
  hooks/mood.ts                            vitals → mood and label (Task 3)
  hooks/graphics/sprite.ts                 claw frames, RGBA and Raster cells (Task 3)
  hooks/pricing.ts                         price table, copied from cache-countdown (Task 4)
  hooks/sources/cache.ts                   cache state and view (Task 4)
  hooks/sources/context.ts                 context and spend from session.usage (Task 5)
  hooks/throttle.ts                        Coalescer, Debouncer (Task 5)
  hooks/sources/ccusage.ts                 run and parse ccusage (Task 6)
  hooks/sources/files.ts                   edits from tool results; git changes (Task 7)
  hooks/sources/tasks.ts                   background agents (Task 8)
  hooks/sources/activity.ts                working, typing, saving, celebrating (Task 8)
  hooks/editor.ts                          Zed lookup and open (Task 9)
  hooks/graphics/pictures.ts               ring, pills, sparkline, claw pictures (Task 10)
  hooks/graphics/animator.ts               frame clock and blits (Task 10)
  hooks/pane.tsx                           reads atoms, composes cards (Task 11; a card added in each of 12–15)
  hooks/cards/kit.tsx                      Kit, card(), line(), text(), bars, pictures (Task 11)
  hooks/cards/header.tsx                   header + claw + mood label (Task 11)
  hooks/cards/cache.tsx                    Cache card (Task 11)
  hooks/cards/compact.tsx                  the one-line view: inline, and other surfaces (Task 11)
  hooks/cards/context.tsx                  Context card (Task 12)
  hooks/cards/usage.tsx                    Usage card (Task 13)
  hooks/cards/files.tsx                    Outputs and Changes cards (Task 14)
  hooks/cards/tasks.tsx                    Background tasks card (Task 15)
  tests/fixtures.ts                        canned answers: ccusage JSON (6), git (7), engine (11)
  tests/world.ts                           the mocked engine beneath the mod, and helpers (Task 11)
  tests/format.test.ts (1), graphics.test.ts (2), mood.test.ts (3), cache.test.ts (4),
  context.test.ts (5), ccusage.test.ts (6), files.test.ts (7), sources.test.ts (8),
  editor.test.ts (9), pictures.test.ts (10), pane.test.ts (11), context-card.test.ts (12),
  usage.test.ts (13), outputs.test.ts (14), character.test.ts (15), animation.test.ts (16),
  layout.test.ts (17)
```

---

### Task 1: Scaffold, state contract and formatting

**Files:**
- Create: `claude-vitals/.claude-plugin/plugin.json`, `claude-vitals/.gitignore`, `claude-vitals/tsconfig.json`, `claude-vitals/hooks/hooks.json`, `claude-vitals/types/index.d.ts`, `claude-vitals/hooks/state.ts`, `claude-vitals/hooks/format.ts`, `claude-vitals/hooks/register.tsx`
- Test: `claude-vitals/tests/format.test.ts`

**Interfaces:**
- Produces:
  - **`types/index.d.ts` types:** `Theme`, `GraphicsMode`, `CacheTtl`, `TtlSource`, `CacheState`, `CategoryKind`, `ContextRow`, `ContextState`, `LimitRow`, `SpendState`, `ModelSpend`, `CcusageToday`, `CcusageBlock`, `CcusageStatus`, `CcusageState`, `OutputRow`, `ChangeRow`, `ChangesStatus`, `ChangesState`, `TaskRow`, `TasksState`, `ActivityState`, `ViewState`, `PlaceState`.
  - **`hooks/state.ts` atoms:** `cache`, `context`, `spend`, `ccusage`, `outputs`, `changes`, `tasks`, `activity`, `view`, `place`, `now`.
  - **`hooks/state.ts` initial values:** `INITIAL_CACHE`, `INITIAL_CONTEXT`, `INITIAL_SPEND`, `INITIAL_CCUSAGE`, `INITIAL_CHANGES`, `INITIAL_TASKS`, `INITIAL_ACTIVITY`, `INITIAL_VIEW`, `INITIAL_PLACE`, `DEFAULT_COLLAPSED`.
  - **`hooks/format.ts`:**
    - `tokens(n): string`
    - `count(n): string`
    - `money(usd): string`
    - `share(part, whole): string`
    - `countdown(ms): string`
    - `span(ms): string`
    - `ago(ms): string`
    - `localDate(ms, offsetMin): string`
    - `resetLabel(iso, now, offsetMin): string`
    - `parseOffset(text): number`
    - `displayPath(path, cwd, home): string`
    - `homePath(path, home): string`
    - `clipStart(text, width): string`
    - `clipEnd(text, width): string`
    - `padEnd(text, width): string`
    - `sparkline(values): string`
    - `filledCells(fraction, width): number`
    - `modelName(id): string`
    - `lineCount(text): number`

- [ ] **Step 1: Write the manifest, hooks.json, tsconfig and .gitignore**

`claude-vitals/.claude-plugin/plugin.json`:

```json
{
  "name": "claude-vitals",
  "version": "0.1.0",
  "description": "A live sidebar of the session's vitals: prompt cache, context, spend and today's usage, edited files you can open in Zed, background tasks, and a pixel claw that reacts to it all.",
  "author": { "name": "Andy Floyd" },
  "types": "./types/index.d.ts",
  "userConfig": {
    "autoOpen": {
      "type": "boolean",
      "title": "Open on session start",
      "description": "Open the sidebar when a session starts in the fullscreen layout at 144 columns or wider.",
      "default": true
    },
    "columns": {
      "type": "number",
      "title": "Sidebar width",
      "description": "Columns the docked sidebar asks for. A width you drag it to wins.",
      "default": 46
    },
    "zedPath": {
      "type": "string",
      "title": "Zed CLI path",
      "description": "Full path to Zed's command-line tool. Empty: zed on PATH, then /Applications/Zed.app/Contents/MacOS/cli.",
      "default": ""
    },
    "ccusageCommand": {
      "type": "string",
      "title": "ccusage command",
      "description": "How to run ccusage, for example: npx -y ccusage@20",
      "default": "ccusage"
    },
    "ccusageRefreshSeconds": {
      "type": "number",
      "title": "ccusage refresh (seconds)",
      "description": "How often usage figures refresh in the background. They also refresh after each turn, at most every 30 seconds.",
      "default": 300
    },
    "graphics": {
      "type": "string",
      "title": "Graphics",
      "description": "auto: pixel pictures in kitty and Ghostty, coloured text elsewhere. pixels or text forces one.",
      "options": ["auto", "pixels", "text"],
      "default": "auto"
    },
    "character": {
      "type": "boolean",
      "title": "Show the claw",
      "description": "The pixel claw in the header, reacting to the session.",
      "default": true
    },
    "animations": {
      "type": "boolean",
      "title": "Animations",
      "description": "Animate the claw and the cache bar. Off draws still frames.",
      "default": true
    }
  }
}
```

`claude-vitals/hooks/hooks.json`:

```json
{ "modules": ["./register.tsx"] }
```

`claude-vitals/tsconfig.json`:

```json
{
  "extends": "./.claude-plugin/types/tsconfig.json"
}
```

`claude-vitals/.gitignore`:

```
.claude-plugin/types/
```

- [ ] **Step 2: Lay the API types for the editor and tsc**

The engine writes `.claude-plugin/types/` itself whenever it loads the mod from a watched folder. Until then, copy cache-countdown's set. It is gitignored, and the engine overwrites it with its own build's types on the first load.

Run: `cp -R cache-countdown/.claude-plugin/types claude-vitals/.claude-plugin/types && ls claude-vitals/.claude-plugin/types`
Expected: `claude-code  claude-code-mcp  claude-code-tools  tsconfig.json` (and a `.gitignore`).

- [ ] **Step 3: Write the state contract**

`claude-vitals/types/index.d.ts`:

```ts
export type Theme = 'dark' | 'light'
export type GraphicsMode = 'pixels' | 'text'
export type CacheTtl = '5m' | '1h'
export type TtlSource = 'engine' | 'learned' | 'default'

export type CacheState = {
  /** When the main thread's last model request went out (ms); null before the first. */
  lastRequestAt: number | null
  /** Prompt tokens the next request re-sends. */
  tokens: number
  /** The model that answered the last request, for its prices. */
  model: string | null
  ttl: CacheTtl
  ttlSource: TtlSource
  /** The last five main-thread responses: tokens read from cache, and all input tokens. */
  recent: { read: number; input: number }[]
}

export type CategoryKind = 'used' | 'free' | 'buffer' | 'deferred'
export type ContextRow = { name: string; tokens: number; kind: CategoryKind }
export type ContextState = {
  percent: number | null
  tokens: number | null
  window: number | null
  /** The /context categories, or null when no breakdown was counted. */
  rows: ContextRow[] | null
  isExact: boolean
  model: string | null
}

export type LimitRow = { kind: string; percentUsed: number; resetsAt: string | null }
export type SpendState = { sessionUsd: number | null; limits: LimitRow[] }

export type ModelSpend = { family: string; usd: number }
export type CcusageToday = { usd: number; byModel: ModelSpend[] }
export type CcusageBlock = { endsAt: number; costPerHour: number; projectedUsd: number }
export type CcusageStatus = 'idle' | 'running' | 'ok' | 'missing' | 'failed'
export type CcusageState = {
  status: CcusageStatus
  /** Why the last run failed: its first stderr line, or what was wrong with its output. */
  error: string | null
  /** When the figures shown were read (ms). */
  updatedAt: number | null
  /** When the last run started (ms), for the after-turn gap. */
  lastStartedAt: number | null
  today: CcusageToday | null
  /** The last seven days' totals, oldest first, today last. */
  week: number[]
  block: CcusageBlock | null
}

export type OutputRow = {
  /** Absolute path. */
  path: string
  added: number
  removed: number
  /** The first changed line of the most recent edit. */
  line: number
  at: number
  /** The subagent that made the most recent edit; null for the main loop. */
  agent: string | null
  isDeleted: boolean
}
export type ChangeRow = { path: string; added: number; removed: number; line: number }
export type ChangesStatus = 'pending' | 'ok' | 'not-git' | 'timeout'
export type ChangesState = { status: ChangesStatus; branch: string | null; files: ChangeRow[] }

export type TaskRow = { id: string; description: string; firstSeenAt: number }
export type TasksState = { running: TaskRow[]; finished: number }

export type ActivityState = {
  isWorking: boolean
  turnStartedAt: number
  lastActiveAt: number
  lastSaveAt: number
  celebrateUntil: number
}

export type ViewState = {
  /** Card ids folded shut, plus 'deferred' for the context's deferred rows. */
  collapsed: string[]
  showAllOutputs: boolean
  theme: Theme
  mode: GraphicsMode
}

export type PlaceState = { cwd: string; home: string | null; tzOffsetMin: number }

declare module 'claude-code' {
  interface PluginState {
    'claude-vitals': {
      cache: CacheState
      context: ContextState
      spend: SpendState
      ccusage: CcusageState
      outputs: OutputRow[]
      changes: ChangesState
      tasks: TasksState
      activity: ActivityState
      view: ViewState
      place: PlaceState
      now: number
    }
  }
}
```

- [ ] **Step 4: Write the atoms**

`claude-vitals/hooks/state.ts`:

```ts
import { atom } from 'claude-code'

import type {
  ActivityState,
  CacheState,
  CcusageState,
  ChangesState,
  ContextState,
  OutputRow,
  PlaceState,
  SpendState,
  TasksState,
  ViewState,
} from '../types'

/** Folded shut until opened: the Changes file list and the context's deferred rows. */
export const DEFAULT_COLLAPSED = ['changes', 'deferred']

export const INITIAL_CACHE: CacheState = {
  lastRequestAt: null,
  tokens: 0,
  model: null,
  ttl: '1h',
  ttlSource: 'default',
  recent: [],
}
export const INITIAL_CONTEXT: ContextState = {
  percent: null,
  tokens: null,
  window: null,
  rows: null,
  isExact: false,
  model: null,
}
export const INITIAL_SPEND: SpendState = { sessionUsd: null, limits: [] }
export const INITIAL_CCUSAGE: CcusageState = {
  status: 'idle',
  error: null,
  updatedAt: null,
  lastStartedAt: null,
  today: null,
  week: [0, 0, 0, 0, 0, 0, 0],
  block: null,
}
export const INITIAL_CHANGES: ChangesState = { status: 'pending', branch: null, files: [] }
export const INITIAL_TASKS: TasksState = { running: [], finished: 0 }
export const INITIAL_ACTIVITY: ActivityState = {
  isWorking: false,
  turnStartedAt: 0,
  lastActiveAt: 0,
  lastSaveAt: 0,
  celebrateUntil: 0,
}
export const INITIAL_VIEW: ViewState = {
  collapsed: DEFAULT_COLLAPSED,
  showAllOutputs: false,
  theme: 'dark',
  mode: 'text',
}
export const INITIAL_PLACE: PlaceState = { cwd: '', home: null, tzOffsetMin: 0 }

export const cache = atom({ plugin: 'claude-vitals', key: 'cache' } as const, INITIAL_CACHE)
export const context = atom({ plugin: 'claude-vitals', key: 'context' } as const, INITIAL_CONTEXT)
export const spend = atom({ plugin: 'claude-vitals', key: 'spend' } as const, INITIAL_SPEND)
export const ccusage = atom({ plugin: 'claude-vitals', key: 'ccusage' } as const, INITIAL_CCUSAGE)
export const outputs = atom({ plugin: 'claude-vitals', key: 'outputs' } as const, [] as OutputRow[])
export const changes = atom({ plugin: 'claude-vitals', key: 'changes' } as const, INITIAL_CHANGES)
export const tasks = atom({ plugin: 'claude-vitals', key: 'tasks' } as const, INITIAL_TASKS)
export const activity = atom({ plugin: 'claude-vitals', key: 'activity' } as const, INITIAL_ACTIVITY)
export const view = atom({ plugin: 'claude-vitals', key: 'view' } as const, INITIAL_VIEW)
export const place = atom({ plugin: 'claude-vitals', key: 'place' } as const, INITIAL_PLACE)
export const now = atom({ plugin: 'claude-vitals', key: 'now' } as const, 0)
```

- [ ] **Step 5: Write the failing formatting tests**

`claude-vitals/tests/format.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  ago,
  clipEnd,
  clipStart,
  count,
  countdown,
  displayPath,
  filledCells,
  homePath,
  lineCount,
  localDate,
  modelName,
  money,
  padEnd,
  parseOffset,
  resetLabel,
  share,
  span,
  sparkline,
  tokens,
} from '../hooks/format'

const START = Date.parse('2026-10-21T14:00:00Z')

describe('format', () => {
  test('token counts read as /context prints them', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(7_900)).toBe('7.9k')
    expect(tokens(30_000)).toBe('30k')
    expect(tokens(141_600)).toBe('141.6k')
    expect(tokens(999_950)).toBe('1M')
    expect(tokens(1_000_000)).toBe('1M')
    expect(tokens(1_250_000)).toBe('1.3M')
  })

  test('money and counts group thousands', () => {
    expect(money(0)).toBe('$0.00')
    expect(money(4.124)).toBe('$4.12')
    expect(money(1204.5)).toBe('$1,204.50')
    expect(money(0.004)).toBe('<$0.01')
    expect(count(44)).toBe('44')
    expect(count(1204)).toBe('1,204')
    expect(count(1_234_567)).toBe('1,234,567')
  })

  test('shares, countdowns, spans and ages', () => {
    expect(share(83_600, 1_000_000)).toBe('8.4%')
    expect(share(1, 0)).toBe('–')
    expect(countdown(3_130_000)).toBe('52:10')
    expect(countdown(5_000)).toBe('0:05')
    expect(countdown(-1)).toBe('0:00')
    expect(span(8_040_000)).toBe('2h14m')
    expect(span(81_000)).toBe('1m 21s')
    expect(span(45_000)).toBe('45s')
    expect(ago(30_000)).toBe('just now')
    expect(ago(120_000)).toBe('2m ago')
    expect(ago(3 * 3_600_000)).toBe('3h ago')
  })

  test('local dates and reset labels follow the zone offset', () => {
    expect(localDate(START, 60)).toBe('2026-10-21')
    expect(localDate(Date.parse('2026-10-21T23:30:00Z'), 60)).toBe('2026-10-22')
    expect(resetLabel('2026-10-21T16:00:00Z', START, 60)).toBe('17:00')
    expect(resetLabel('2026-10-26T08:00:00Z', START, 60)).toBe('Mon')
    expect(resetLabel('garbage', START, 0)).toBe('')
    expect(parseOffset('+0100')).toBe(60)
    expect(parseOffset('-0530')).toBe(-330)
    expect(parseOffset('nope')).toBe(0)
  })

  test('paths are shown relative, under ~, or whole', () => {
    expect(displayPath('/work/hooks/a.ts', '/work', '/Users/me')).toBe('hooks/a.ts')
    expect(displayPath('/Users/me/x/y.ts', '/work', '/Users/me')).toBe('~/x/y.ts')
    expect(displayPath('/etc/hosts', '/work', null)).toBe('/etc/hosts')
    expect(homePath('/Users/me/Workspace/mods', '/Users/me')).toBe('~/Workspace/mods')
    expect(homePath('/Users/me', '/Users/me')).toBe('~')
    expect(homePath('/work', null)).toBe('/work')
  })

  test('clipping keeps the end of a path and the start of a sentence', () => {
    expect(clipStart('hooks/register.tsx', 10)).toBe('…ister.tsx')
    expect(clipStart('short', 10)).toBe('short')
    expect(clipEnd('Fable review of transfer', 10)).toBe('Fable rev…')
    expect(padEnd('ab', 4)).toBe('ab  ')
    expect(padEnd('abcdef', 4)).toBe('abcdef')
  })

  test('sparklines, filled cells and line counts', () => {
    expect(sparkline([12, 24, 18, 31, 44, 27, 38.9])).toBe('▃▅▄▆█▅▇')
    expect(sparkline([0, 0])).toBe('▁▁')
    expect(filledCells(0.46, 10)).toBe(5)
    expect(filledCells(2, 10)).toBe(10)
    expect(filledCells(-1, 10)).toBe(0)
    expect(lineCount('')).toBe(0)
    expect(lineCount('a\nb\n')).toBe(2)
    expect(lineCount('a\nb')).toBe(2)
  })

  test('model ids read as names', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
    expect(modelName('gpt-x')).toBe('gpt-x')
    expect(modelName(null)).toBe('Claude')
  })
})
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/format`, or the hooks module is missing.

- [ ] **Step 7: Write format.ts**

`claude-vitals/hooks/format.ts`:

```ts
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BLOCKS = '▁▂▃▄▅▆▇█'

function oneDecimal(x: number): string {
  const text = x.toFixed(1)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Token counts as /context prints them: 950, 7.9k, 141.6k, 1M. */
export function tokens(n: number): string {
  if (n >= 999_950) return `${oneDecimal(n / 1_000_000)}M`
  if (n >= 1000) return `${oneDecimal(n / 1000)}k`
  return String(Math.round(n))
}

/** A whole number with thousands separators: 1,204. */
export function count(n: number): string {
  const whole = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `-${whole}` : whole
}

/** Dollars: $4.12, $1,204.50, <$0.01. */
export function money(usd: number): string {
  if (usd > 0 && usd < 0.005) return '<$0.01'
  const cents = Math.round(usd * 100)
  return `$${count(Math.floor(cents / 100))}.${pad2(cents % 100)}`
}

/** A part of a whole as a percentage with one decimal: 8.4%. */
export function share(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–'
}

/** A countdown in minutes and seconds: 52:10. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

/** A length of time: 2h14m, 1m 21s, 45s. */
export function span(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${pad2(m)}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

/** How long ago: just now, 2m ago, 3h ago. */
export function ago(ms: number): string {
  if (ms < MINUTE) return 'just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`
  return `${Math.floor(ms / HOUR)}h ago`
}

/** The local calendar date of `ms` in a zone `offsetMin` minutes ahead of UTC: 2026-10-21. */
export function localDate(ms: number, offsetMin: number): string {
  return new Date(ms + offsetMin * MINUTE).toISOString().slice(0, 10)
}

/** When a limit resets, in local time: 17:00 if today, else the weekday (Mon). */
export function resetLabel(iso: string, now: number, offsetMin: number): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const local = new Date(at + offsetMin * MINUTE)
  if (localDate(at, offsetMin) === localDate(now, offsetMin)) {
    return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`
  }
  return WEEKDAYS[local.getUTCDay()] ?? ''
}

/** `date +%z` output to minutes: +0100 → 60, -0530 → -330, anything else 0. */
export function parseOffset(text: string): number {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (match === null) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/** A path with the home directory shortened to ~. */
export function homePath(path: string, home: string | null): string {
  if (home === null) return path
  if (path === home) return '~'
  return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path
}

/** A path for display: relative under `cwd`, else under ~, else whole. */
export function displayPath(path: string, cwd: string, home: string | null): string {
  if (cwd !== '' && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  return homePath(path, home)
}

/** Keeps the end of text too long for `width`: …ister.tsx. */
export function clipStart(text: string, width: number): string {
  const chars = [...text]
  if (chars.length <= width) return text
  return width <= 1 ? '…' : `…${chars.slice(chars.length - width + 1).join('')}`
}

/** Keeps the start of text too long for `width`: Fable rev…. */
export function clipEnd(text: string, width: number): string {
  const chars = [...text]
  if (chars.length <= width) return text
  return width <= 1 ? '…' : `${chars.slice(0, width - 1).join('')}…`
}

/** Pads with spaces to `width` characters; longer text is left as it is. */
export function padEnd(text: string, width: number): string {
  const length = [...text].length
  return length >= width ? text : text + ' '.repeat(width - length)
}

/** One block per value, scaled to the largest: ▃▅▄▆█▅▇. */
export function sparkline(values: readonly number[]): string {
  const max = Math.max(0, ...values)
  return values
    .map(v => BLOCKS[max === 0 ? 0 : Math.min(7, Math.round((v / max) * 7))] ?? '▁')
    .join('')
}

/** How many of `width` cells a share fills: 0.46 of 10 → 5. */
export function filledCells(fraction: number, width: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * width)
}

/** claude-opus-5-5 → Opus 5.5; an id it does not know, as given. */
export function modelName(id: string | null): string {
  if (id === null) return 'Claude'
  const match = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(id.toLowerCase())
  if (match === null) return id
  const family = match[1] ?? ''
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return match[3] === undefined ? `${name} ${match[2]}` : `${name} ${match[2]}.${match[3]}`
}

/** Lines in a text: '' → 0, 'a\nb\n' → 2. */
export function lineCount(text: string): number {
  if (text === '') return 0
  const breaks = text.split('\n').length - 1
  return text.endsWith('\n') ? breaks : breaks + 1
}
```

- [ ] **Step 8: Write a placeholder hooks module so the mod loads**

`claude-vitals/hooks/register.tsx` (Tasks 11–16 replace its body):

```tsx
import type { Register } from 'claude-code'

const PANE = 'vitals'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vitals',
      description: 'Show or hide the claude-vitals sidebar: cache, context, usage, files and tasks',
    })
    return next(e)
  })

  on('command.run', { command: 'vitals' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Vitals' })
    return { text: 'Vitals sidebar opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>claude-vitals</Text>
  })
}
```

- [ ] **Step 9: Run the tests, validate and type-check**

Run: `claude plugin test claude-vitals`
Expected: PASS. All 8 format tests pass.

Run: `claude plugin validate claude-vitals`
Expected: `✔ Validation passed`. The report lists hooks `session.start, command.run{command=vitals}, ui.render{component=Pane, requestId=vitals}`.

Run: `npx -y -p typescript@5 tsc -p claude-vitals`
Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add claude-vitals
git commit -m "claude-vitals: scaffold, state contract and formatting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Palette, graphics mode and the RGBA canvas

**Files:**
- Create: `claude-vitals/hooks/graphics/palette.ts`, `claude-vitals/hooks/graphics/mode.ts`, `claude-vitals/hooks/graphics/canvas.ts`
- Test: `claude-vitals/tests/graphics.test.ts`

**Interfaces:**
- Consumes: `Theme`, `GraphicsMode` from `types/index.d.ts`.
- Produces:
  - **`palette.ts`:**
    - `type Rgb = readonly [number, number, number]`
    - `type Palette` with fields `theme`, `pane`, `card`, `border`, `text`, `dim`, `track`, `teal`, `amber`, `red`, `green`, `violet`, `blue`, `clay`, `selection`, all hex strings except `theme`
    - `paletteFor(theme): Palette`
    - `themeOf(value: unknown): Theme`
    - `rgb(hex): Rgb`
    - `hex(rgb): string`
    - `mix(a, b, t): string`
    - `heat(p, t): string`
    - `categoryColor(p, row: { name: string; kind: string }): string`
    - `familyColor(p, family): string`
  - **`mode.ts`:**
    - `type ModeEnv = { term?: string; kittyWindowId?: string; termProgram?: string; tmux?: string }`
    - `pickMode(setting: string, env: ModeEnv): GraphicsMode`
    - `detectMode($, setting): Promise<GraphicsMode>`
  - **`canvas.ts`:**
    - `CELL_W = 16`, `CELL_H = 32`
    - `class Canvas { width; height; data: Uint8Array; blend(x, y, color, alpha); pill(x, y, w, h, paint: (px) => Rgb | null, alpha?); ring(cx, cy, outer, inner, paint: (turn) => Rgb); toBase64() }`
    - `coverage(d): number`
    - `base64(bytes): string`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/graphics.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { base64, Canvas, coverage } from '../hooks/graphics/canvas'
import { pickMode } from '../hooks/graphics/mode'
import { categoryColor, familyColor, heat, hex, mix, paletteFor, rgb, themeOf } from '../hooks/graphics/palette'

function pixel(canvas: Canvas, x: number, y: number): number[] {
  const at = (y * canvas.width + x) * 4
  return [...canvas.data.slice(at, at + 4)]
}

describe('palette', () => {
  test('the theme setting picks the palette', () => {
    expect(themeOf('light')).toBe('light')
    expect(themeOf('light-daltonized')).toBe('light')
    expect(themeOf('dark')).toBe('dark')
    expect(themeOf(undefined)).toBe('dark')
    expect(paletteFor('light').theme).toBe('light')
    expect(paletteFor('dark').theme).toBe('dark')
  })

  test('colours convert and mix', () => {
    expect(rgb('#ff8000')).toEqual([255, 128, 0])
    expect(hex([255, 128, 0])).toBe('#ff8000')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 3)).toBe('#ffffff')
  })

  test('the heat ramp runs green, amber, red', () => {
    const p = paletteFor('dark')
    expect(heat(p, 0)).toBe(p.green)
    expect(heat(p, 0.5)).toBe(p.amber)
    expect(heat(p, 1)).toBe(p.red)
    expect(heat(p, 2)).toBe(p.red)
  })

  test('context categories get /context-like colours; free is the track; unknown is grey', () => {
    const p = paletteFor('dark')
    expect(categoryColor(p, { name: 'Messages', kind: 'used' })).toBe('#5b8def')
    expect(categoryColor(p, { name: 'MCP tools (deferred)', kind: 'deferred' })).toBe(
      categoryColor(p, { name: 'MCP tools', kind: 'used' }),
    )
    expect(categoryColor(p, { name: 'Free space', kind: 'free' })).toBe(p.track)
    expect(categoryColor(p, { name: 'Something new', kind: 'used' })).toBe(p.dim)
    expect(familyColor(p, 'Opus')).toBe(p.clay)
    expect(familyColor(p, 'Other')).toBe(p.dim)
  })
})

describe('graphics mode', () => {
  test('auto draws pixels in kitty and Ghostty, text elsewhere and under tmux', () => {
    expect(pickMode('auto', { term: 'xterm-kitty' })).toBe('pixels')
    expect(pickMode('auto', { kittyWindowId: '3' })).toBe('pixels')
    expect(pickMode('auto', { termProgram: 'ghostty' })).toBe('pixels')
    expect(pickMode('auto', { term: 'xterm-256color', termProgram: 'Apple_Terminal' })).toBe('text')
    expect(pickMode('auto', { kittyWindowId: '3', tmux: '/tmp/tmux-501/default,1,0' })).toBe('text')
    expect(pickMode('pixels', {})).toBe('pixels')
    expect(pickMode('text', { term: 'xterm-kitty' })).toBe('text')
  })
})

describe('canvas', () => {
  test('base64 uses the standard alphabet and padding', () => {
    expect(base64(Uint8Array.of(77, 97, 110))).toBe('TWFu')
    expect(base64(Uint8Array.of(255))).toBe('/w==')
    expect(base64(Uint8Array.of(255, 255))).toBe('//8=')
  })

  test('coverage is whole inside an edge, none outside, half on it', () => {
    expect(coverage(-2)).toBe(1)
    expect(coverage(2)).toBe(0)
    expect(coverage(0)).toBe(0.5)
  })

  test('a pill paints only where its paint says, with rounded ends', () => {
    const canvas = new Canvas(40, 10)
    canvas.pill(0, 0, 40, 10, x => (x < 20 ? [255, 0, 0] : null))
    expect(pixel(canvas, 10, 5)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, 30, 5)[3]).toBe(0)
    expect(pixel(canvas, 0, 0)[3]).toBe(0)
  })

  test('a ring paints its arcs clockwise from 12 o’clock and leaves the hole empty', () => {
    const canvas = new Canvas(100, 100)
    canvas.ring(50, 50, 48, 30, turn => (turn < 0.25 ? [255, 0, 0] : [0, 0, 255]))
    expect(pixel(canvas, 70, 12)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, 30, 88)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, 50, 50)[3]).toBe(0)
  })

  test('toBase64 encodes width × height × 4 bytes', () => {
    expect(new Canvas(3, 2).toBase64()).toHaveLength(32)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/graphics/canvas`.

- [ ] **Step 3: Write palette.ts**

`claude-vitals/hooks/graphics/palette.ts`:

```ts
import type { Theme } from '../../types'

export type Rgb = readonly [number, number, number]

export type Palette = {
  theme: Theme
  pane: string
  card: string
  border: string
  text: string
  dim: string
  track: string
  teal: string
  amber: string
  red: string
  green: string
  violet: string
  blue: string
  clay: string
  selection: string
}

const DARK: Palette = {
  theme: 'dark',
  pane: '#111110',
  card: '#1a1a18',
  border: '#3d3d3a',
  text: '#e8e6dc',
  dim: '#8d8b83',
  track: '#2c2c29',
  teal: '#2dd4bf',
  amber: '#e3b341',
  red: '#f85149',
  green: '#3fb950',
  violet: '#d2a8ff',
  blue: '#7aa2f7',
  clay: '#d97757',
  selection: '#24324a',
}

const LIGHT: Palette = {
  theme: 'light',
  pane: '#faf9f5',
  card: '#ffffff',
  border: '#d3d1c7',
  text: '#1f1e1b',
  dim: '#6b6a64',
  track: '#e6e4dc',
  teal: '#0f9488',
  amber: '#b7791f',
  red: '#d1242f',
  green: '#1a7f37',
  violet: '#8250df',
  blue: '#0969da',
  clay: '#c15f3c',
  selection: '#ddf4ff',
}

// Close to /context's default colours, keyed by the category's name with " (deferred)" taken off.
const CATEGORIES: Record<Theme, Record<string, string>> = {
  dark: {
    Messages: '#5b8def',
    'Memory files': '#e0703f',
    'System tools': '#3fae7f',
    Skills: '#d9a03a',
    'System prompt': '#9a9890',
    'MCP tools': '#8a8880',
    'MCP server instructions': '#8a8880',
    'Custom agents': '#b392f0',
    'Autocompact buffer': '#77756e',
  },
  light: {
    Messages: '#2f6fd6',
    'Memory files': '#c4572a',
    'System tools': '#2b8a62',
    Skills: '#b7791f',
    'System prompt': '#7a786f',
    'MCP tools': '#8a8880',
    'MCP server instructions': '#8a8880',
    'Custom agents': '#8250df',
    'Autocompact buffer': '#a8a69e',
  },
}

const FAMILIES: Record<Theme, Record<string, string>> = {
  dark: { Sonnet: '#a78bfa', Haiku: '#34d399', Fable: '#60a5fa', Mythos: '#f472b6' },
  light: { Sonnet: '#8250df', Haiku: '#1a7f37', Fable: '#0969da', Mythos: '#bf3989' },
}

const clamp = (t: number) => Math.min(1, Math.max(0, t))

export function paletteFor(theme: Theme): Palette {
  return theme === 'light' ? LIGHT : DARK
}

/** The `theme` setting's value to a palette: any theme named light is light, the rest dark. */
export function themeOf(value: unknown): Theme {
  return typeof value === 'string' && value.toLowerCase().includes('light') ? 'light' : 'dark'
}

export function rgb(color: string): Rgb {
  const n = Number.parseInt(color.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hex(color: Rgb): string {
  return `#${color.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** `a` blended toward `b` by `t`, 0 to 1. */
export function mix(a: string, b: string, t: number): string {
  const from = rgb(a)
  const to = rgb(b)
  const k = clamp(t)
  return hex([from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k])
}

/** The heat ramp for anything filling toward a limit: green at 0, amber at 0.5, red at 1. */
export function heat(p: Palette, t: number): string {
  const k = clamp(t)
  return k <= 0.5 ? mix(p.green, p.amber, k * 2) : mix(p.amber, p.red, (k - 0.5) * 2)
}

export function categoryColor(p: Palette, row: { name: string; kind: string }): string {
  if (row.kind === 'free') return p.track
  const table = CATEGORIES[p.theme]
  const named = table[row.name.replace(/\s*\(deferred\)$/i, '')]
  if (named !== undefined) return named
  return row.kind === 'buffer' ? (table['Autocompact buffer'] ?? p.dim) : p.dim
}

export function familyColor(p: Palette, family: string): string {
  return family === 'Opus' ? p.clay : (FAMILIES[p.theme][family] ?? p.dim)
}
```

- [ ] **Step 4: Write mode.ts**

`claude-vitals/hooks/graphics/mode.ts`:

```ts
import type { EngineInterface } from 'claude-code'

import type { GraphicsMode } from '../../types'

export type ModeEnv = { term?: string; kittyWindowId?: string; termProgram?: string; tmux?: string }

/** Pictures where the terminal draws them (kitty, Ghostty; tmux passes none through), else coloured text. */
export function pickMode(setting: string, env: ModeEnv): GraphicsMode {
  if (setting === 'pixels' || setting === 'text') return setting
  if ((env.tmux ?? '') !== '') return 'text'
  const isKitty = env.term === 'xterm-kitty' || (env.kittyWindowId ?? '') !== ''
  const isGhostty = (env.termProgram ?? '').toLowerCase() === 'ghostty'
  return isKitty || isGhostty ? 'pixels' : 'text'
}

export async function detectMode($: EngineInterface, setting: string): Promise<GraphicsMode> {
  if (setting === 'pixels' || setting === 'text') return setting
  const [term, kittyWindowId, termProgram, tmux] = await Promise.all([
    $.env.get('TERM'),
    $.env.get('KITTY_WINDOW_ID'),
    $.env.get('TERM_PROGRAM'),
    $.env.get('TMUX'),
  ])
  return pickMode(setting, { term, kittyWindowId, termProgram, tmux })
}
```

- [ ] **Step 5: Write canvas.ts**

`claude-vitals/hooks/graphics/canvas.ts`:

```ts
import type { Rgb } from './palette'

/** Pixels painted per terminal cell: the terminal scales the picture down to its own cells. */
export const CELL_W = 16
export const CELL_H = 32

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64. */
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

/** How much of a pixel a shape covers, from its signed distance to the edge (negative inside). */
export function coverage(distance: number): number {
  return Math.min(1, Math.max(0, 0.5 - distance))
}

function roundRectDistance(px: number, py: number, x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** An RGBA picture, transparent until painted. */
export class Canvas {
  readonly data: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4)
  }

  /** Paints `color` over one pixel at `alpha` (0 to 1), source over. */
  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const at = (y * this.width + x) * 4
    const a = Math.min(1, alpha)
    const under = (this.data[at + 3] ?? 0) / 255
    const out = a + under * (1 - a)
    for (let c = 0; c < 3; c++) {
      const src = color[c] ?? 0
      const dst = this.data[at + c] ?? 0
      this.data[at + c] = out === 0 ? 0 : Math.round((src * a + dst * under * (1 - a)) / out)
    }
    this.data[at + 3] = Math.round(out * 255)
  }

  /** A rounded bar (its radius half its shorter side), anti-aliased; `paint` colours each pixel column, null skips it. */
  pill(x: number, y: number, w: number, h: number, paint: (px: number) => Rgb | null, alpha = 1): void {
    const r = Math.min(w, h) / 2
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px++) {
        const color = paint(px)
        if (color === null) continue
        this.blend(px, py, color, coverage(roundRectDistance(px + 0.5, py + 0.5, x, y, w, h, r)) * alpha)
      }
    }
  }

  /** A ring between two radii, anti-aliased; `paint` colours it by turn, 0 to 1 clockwise from 12 o'clock. */
  ring(cx: number, cy: number, outer: number, inner: number, paint: (turn: number) => Rgb): void {
    const top = Math.max(0, Math.floor(cy - outer - 1))
    const bottom = Math.min(this.height, Math.ceil(cy + outer + 1))
    const left = Math.max(0, Math.floor(cx - outer - 1))
    const right = Math.min(this.width, Math.ceil(cx + outer + 1))
    for (let py = top; py < bottom; py++) {
      for (let px = left; px < right; px++) {
        const dx = px + 0.5 - cx
        const dy = py + 0.5 - cy
        const distance = Math.hypot(dx, dy)
        const cover = coverage(Math.max(distance - outer, inner - distance))
        if (cover <= 0) continue
        const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1
        this.blend(px, py, paint(turn), cover)
      }
    }
  }

  toBase64(): string {
    return base64(this.data)
  }
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS (format and graphics suites).

- [ ] **Step 7: Commit**

```bash
git add claude-vitals/hooks/graphics claude-vitals/tests/graphics.test.ts
git commit -m "claude-vitals: palettes, graphics mode and the RGBA canvas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The claw sprite and its moods

**Files:**
- Create: `claude-vitals/hooks/mood.ts`, `claude-vitals/hooks/graphics/sprite.ts`
- Test: `claude-vitals/tests/mood.test.ts`

**Interfaces:**
- Consumes: `base64` from `hooks/graphics/canvas.ts`.
- Produces:
  - **`mood.ts`:**
    - `type Mood = 'cold' | 'sweating' | 'working' | 'celebrating' | 'asleep' | 'content'`
    - `type MoodInput = { cache: 'none' | 'warm' | 'cold'; contextPercent: number | null; limits: readonly { kind: string; percentUsed: number }[]; isWorking: boolean; celebrateUntil: number; lastActiveAt: number; now: number }`
    - `SWEAT_PERCENT = 80`, `ASLEEP_MS = 600_000`
    - `moodOf(input): Mood`
    - `moodLabel(mood, input): string | null`
    - `limitName(kind): string`
  - **`sprite.ts`:**
    - `type Frame = readonly string[]`
    - `SPRITE_WIDTH = 14`, `SPRITE_HEIGHT = 10`, `SPRITE_COLUMNS = 14`, `SPRITE_ROWS = 5`
    - `MOOD_FPS`
    - `framesOf(mood)`
    - `frameIndex(mood, ms): number`
    - `frameAt(mood, ms): Frame`
    - `isBlinking(ms): boolean`
    - `spriteRgba(frame, scale): { rgba: string; width: number; height: number }`
    - `spriteCells(frame): string`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/mood.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  frameAt,
  frameIndex,
  framesOf,
  isBlinking,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  spriteCells,
  spriteRgba,
} from '../hooks/graphics/sprite'
import { limitName, moodLabel, moodOf } from '../hooks/mood'
import type { Mood, MoodInput } from '../hooks/mood'

const NOW = 50_000_000
const MINUTE = 60_000
const BASE: MoodInput = {
  cache: 'warm',
  contextPercent: 14,
  limits: [],
  isWorking: false,
  celebrateUntil: 0,
  lastActiveAt: NOW,
  now: NOW,
}
const MOODS: Mood[] = ['cold', 'sweating', 'working', 'celebrating', 'asleep', 'content']

describe('mood', () => {
  test('the most urgent mood wins: cold, sweating, working, celebrating, asleep, content', () => {
    expect(moodOf({ ...BASE, cache: 'cold', contextPercent: 95, isWorking: true })).toBe('cold')
    expect(moodOf({ ...BASE, contextPercent: 80, isWorking: true })).toBe('sweating')
    expect(moodOf({ ...BASE, limits: [{ kind: 'five_hour', percentUsed: 85 }] })).toBe('sweating')
    expect(moodOf({ ...BASE, contextPercent: 79.9 })).toBe('content')
    expect(moodOf({ ...BASE, isWorking: true, celebrateUntil: NOW + 1 })).toBe('working')
    expect(moodOf({ ...BASE, celebrateUntil: NOW + 1, lastActiveAt: NOW - 11 * MINUTE })).toBe('celebrating')
    expect(moodOf({ ...BASE, lastActiveAt: NOW - 10 * MINUTE })).toBe('asleep')
    expect(moodOf({ ...BASE, cache: 'none' })).toBe('content')
    expect(moodOf(BASE)).toBe('content')
  })

  test('the label says why', () => {
    const cold = { ...BASE, cache: 'cold' as const }
    expect(moodLabel('cold', cold)).toBe('cache cold')
    expect(moodLabel('sweating', { ...BASE, contextPercent: 84 })).toBe('context 84%')
    expect(
      moodLabel('sweating', { ...BASE, contextPercent: 20, limits: [{ kind: 'five_hour', percentUsed: 91 }] }),
    ).toBe('limit 5h 91%')
    expect(moodLabel('working', BASE)).toBe('working')
    expect(moodLabel('asleep', BASE)).toBe('asleep')
    expect(moodLabel('celebrating', BASE)).toBeNull()
    expect(moodLabel('content', BASE)).toBeNull()
    expect(limitName('seven_day')).toBe('7d')
    expect(limitName('spend_limit')).toBe('spend')
    expect(limitName('other')).toBe('other')
  })
})

describe('sprite', () => {
  test('every frame of every mood is 14 × 10', () => {
    for (const mood of MOODS) {
      for (const frame of framesOf(mood)) {
        expect(frame).toHaveLength(SPRITE_HEIGHT)
        for (const row of frame) expect([...row]).toHaveLength(SPRITE_WIDTH)
      }
    }
  })

  test('each mood looks like itself', () => {
    expect(framesOf('cold')[0]?.join('')).not.toContain('O')
    expect(framesOf('working')[1]?.[0]).toBe('..............')
    expect(framesOf('asleep')[0]?.[5]).toBe('...OKOOOOKO...')
    expect(framesOf('sweating')[0]?.join('')).toContain('B')
    expect(framesOf('celebrating').every(frame => frame.join('').includes('S'))).toBe(true)
  })

  test('working clacks at 4 fps; cold shivers for 200 ms every 5 s', () => {
    expect(frameIndex('working', 0)).toBe(0)
    expect(frameIndex('working', 250)).toBe(1)
    expect(frameIndex('working', 500)).toBe(0)
    expect(frameIndex('cold', 100)).toBe(1)
    expect(frameIndex('cold', 300)).toBe(0)
    expect(frameIndex('cold', 5_100)).toBe(1)
  })

  test('content blinks once every 4 to 7 seconds', () => {
    const starts: number[] = []
    let was = false
    for (let ms = 0; ms < 60_000; ms += 25) {
      const is = isBlinking(ms)
      if (is && !was) starts.push(ms)
      was = is
    }
    expect(starts.length).toBeGreaterThanOrEqual(8)
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0)
      expect(gap).toBeGreaterThanOrEqual(3_900)
      expect(gap).toBeLessThanOrEqual(7_100)
    }
    expect(frameAt('content', starts[0] ?? 0)).toBe(framesOf('content')[1])
  })

  test('pictures and cells come out the expected sizes', () => {
    const picture = spriteRgba(frameAt('content', 0), 8)
    expect(picture.width).toBe(112)
    expect(picture.height).toBe(80)
    expect(picture.rgba).toHaveLength(Math.ceil((112 * 80 * 4) / 3) * 4)
    expect(spriteCells(frameAt('content', 0))).toHaveLength(1120)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/graphics/sprite`.

- [ ] **Step 3: Write mood.ts**

`claude-vitals/hooks/mood.ts`:

```ts
export type Mood = 'cold' | 'sweating' | 'working' | 'celebrating' | 'asleep' | 'content'

export type MoodInput = {
  cache: 'none' | 'warm' | 'cold'
  contextPercent: number | null
  limits: readonly { kind: string; percentUsed: number }[]
  isWorking: boolean
  celebrateUntil: number
  lastActiveAt: number
  now: number
}

export const SWEAT_PERCENT = 80
export const ASLEEP_MS = 10 * 60_000

/** The claw's mood: the first of these that applies. */
export function moodOf(input: MoodInput): Mood {
  if (input.cache === 'cold') return 'cold'
  const isFull = (input.contextPercent ?? 0) >= SWEAT_PERCENT
  if (isFull || input.limits.some(limit => limit.percentUsed >= SWEAT_PERCENT)) return 'sweating'
  if (input.isWorking) return 'working'
  if (input.now < input.celebrateUntil) return 'celebrating'
  if (input.now - input.lastActiveAt >= ASLEEP_MS) return 'asleep'
  return 'content'
}

export function limitName(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  if (kind === 'spend_limit') return 'spend'
  return kind
}

/** Why the claw looks as it does, beside it in the header; null when there is nothing to say. */
export function moodLabel(mood: Mood, input: MoodInput): string | null {
  if (mood === 'cold') return 'cache cold'
  if (mood === 'working') return 'working'
  if (mood === 'asleep') return 'asleep'
  if (mood !== 'sweating') return null
  const context = input.contextPercent ?? 0
  const worst = [...input.limits].sort((a, b) => b.percentUsed - a.percentUsed)[0]
  if (worst !== undefined && worst.percentUsed >= SWEAT_PERCENT && worst.percentUsed >= context) {
    return `limit ${limitName(worst.kind)} ${Math.round(worst.percentUsed)}%`
  }
  return `context ${Math.round(context)}%`
}
```

- [ ] **Step 4: Write sprite.ts**

`claude-vitals/hooks/graphics/sprite.ts`. The body and the sweat and frost overlays are copied from cache-countdown's `claw.ts`:

```ts
import type { Mood } from '../mood'
import { base64 } from './canvas'

/** One frame: 10 rows of 14 pixels, one character each ('.' transparent). */
export type Frame = readonly string[]

export const SPRITE_WIDTH = 14
export const SPRITE_HEIGHT = 10
/** On the terminal: two pixels a cell, one above the other. */
export const SPRITE_COLUMNS = 14
export const SPRITE_ROWS = 5

const BODY: Frame = [
  'OO..........OO',
  'O.O........O.O',
  '.OO........OO.',
  '..OO......OO..',
  '...OOOOOOOO...',
  '...OEOOOOEO...',
  '...OOOOOOOO...',
  '...OOOOOOOO...',
  '...O.O..O.O...',
  '..............',
]

// An overlay paints over a frame by row: '.' keeps the pixel, '_' clears it, any other letter paints it.
type Overlay = Record<number, string>
const SWEAT_A: Overlay = { 3: '............B.', 4: '............B.' }
const SWEAT_B: Overlay = { 4: '............B.', 5: '............B.' }
const FROST: Overlay = { 0: 'F............F', 9: '....F....F....' }
const MOTION: Overlay = { 1: 'M............M', 2: 'M............M' }
const CLAWS_SHUT: Overlay = { 0: '__..........__', 1: 'OOO........OOO' }
const EYES_SHUT: Overlay = { 5: '....K....K....' }
const SPARKLE_1: Overlay = { 0: '..S........S..', 9: '.S..........S.' }
const SPARKLE_2: Overlay = { 0: '....S....S....', 4: 'S............S' }
const SPARKLE_3: Overlay = { 6: '.S..........S.', 9: '...S......S...' }
const Z_LOW: Overlay = { 1: '.....ZZZ......', 2: '......Z.......', 3: '.....ZZZ......' }
const Z_HIGH: Overlay = { 0: '......ZZZ.....', 1: '.......Z......', 2: '......ZZZ.....' }
const Z_GONE: Overlay = { 0: '........Z.....' }

const COLORS: Record<string, number> = {
  O: 0xd97757,
  I: 0x9ccfff,
  E: 0x1b1b1b,
  K: 0x7a3a22,
  B: 0x4aa3ff,
  F: 0xffffff,
  M: 0xf3efe6,
  Z: 0xc9c6ff,
  S: 0xfbbf24,
}
const DEFAULT = 0x01000000

function paint(base: Frame, ...overlays: Overlay[]): Frame {
  return base.map((row, y) =>
    overlays.reduce((out, overlay) => {
      const over = overlay[y]
      if (over === undefined) return out
      return [...out]
        .map((pixel, x) => {
          const mark = over[x] ?? '.'
          return mark === '.' ? pixel : mark === '_' ? '.' : mark
        })
        .join('')
    }, row),
  )
}

const icy = (frame: Frame): Frame => frame.map(row => row.replaceAll('O', 'I'))
const COLD = paint(icy(BODY), FROST)
const SHIVER = COLD.map(row => `.${row.slice(0, -1)}`)

const FRAMES: Record<Mood, readonly Frame[]> = {
  content: [BODY, paint(BODY, EYES_SHUT)],
  cold: [COLD, SHIVER],
  sweating: [paint(BODY, SWEAT_A), paint(BODY, SWEAT_B)],
  working: [paint(BODY, MOTION), paint(BODY, CLAWS_SHUT)],
  celebrating: [paint(BODY, SPARKLE_1), paint(BODY, SPARKLE_2), paint(BODY, SPARKLE_3)],
  asleep: [paint(BODY, EYES_SHUT, Z_LOW), paint(BODY, EYES_SHUT, Z_HIGH), paint(BODY, EYES_SHUT, Z_GONE)],
}

/** Frames a second for the moods that loop; content blinks and cold shivers on their own clocks. */
export const MOOD_FPS: Record<Mood, number> = {
  content: 0,
  cold: 0,
  sweating: 2,
  working: 4,
  celebrating: 6,
  asleep: 1,
}

const BLINK_EVERY_MS = 5_500
const BLINK_MS = 150
const SHIVER_EVERY_MS = 5_000
const SHIVER_MS = 200

function jitter(k: number): number {
  return ((Math.imul(k + 1, 2654435761) >>> 0) % 1501) - 750
}

/** Whether the content claw has its eyes shut at `ms`: one 150 ms blink every 4 to 7 s. */
export function isBlinking(ms: number): boolean {
  const k = Math.floor(ms / BLINK_EVERY_MS)
  const at = k * BLINK_EVERY_MS + BLINK_EVERY_MS / 2 + jitter(k)
  return Math.abs(ms - at) < BLINK_MS / 2
}

export function framesOf(mood: Mood): readonly Frame[] {
  return FRAMES[mood]
}

export function frameIndex(mood: Mood, ms: number): number {
  if (mood === 'content') return isBlinking(ms) ? 1 : 0
  if (mood === 'cold') return ms % SHIVER_EVERY_MS < SHIVER_MS ? 1 : 0
  return Math.floor((ms * MOOD_FPS[mood]) / 1000) % FRAMES[mood].length
}

export function frameAt(mood: Mood, ms: number): Frame {
  return FRAMES[mood][frameIndex(mood, ms)] ?? BODY
}

/** The frame as RGBA pixels, each sprite pixel `scale` × `scale`, transparent where '.'. */
export function spriteRgba(frame: Frame, scale: number): { rgba: string; width: number; height: number } {
  const width = SPRITE_WIDTH * scale
  const height = SPRITE_HEIGHT * scale
  const data = new Uint8Array(width * height * 4)
  frame.forEach((row, y) => {
    ;[...row].forEach((mark, x) => {
      const color = COLORS[mark]
      if (color === undefined) return
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const at = ((y * scale + dy) * width + x * scale + dx) * 4
          data[at] = (color >> 16) & 255
          data[at + 1] = (color >> 8) & 255
          data[at + 2] = color & 255
          data[at + 3] = 255
        }
      }
    })
  })
  return { rgba: base64(data), width, height }
}

/** The frame as a Raster's cells, two pixels a cell with half blocks: `[codePoint, fg, bg]` each, base64. */
export function spriteCells(frame: Frame): string {
  const words: number[] = []
  for (let row = 0; row < SPRITE_ROWS; row++) {
    for (let x = 0; x < SPRITE_COLUMNS; x++) {
      const top = COLORS[frame[row * 2]?.[x] ?? '.']
      const bottom = COLORS[frame[row * 2 + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom ?? DEFAULT, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }
  return base64(new Uint8Array(Uint32Array.from(words).buffer))
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/mood.ts claude-vitals/hooks/graphics/sprite.ts claude-vitals/tests/mood.test.ts
git commit -m "claude-vitals: the claw sprite and its moods" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cache state and next-turn pricing

**Files:**
- Create: `claude-vitals/hooks/pricing.ts`, `claude-vitals/hooks/sources/cache.ts`
- Test: `claude-vitals/tests/cache.test.ts`

**Interfaces:**
- Consumes: `CacheState`, `CacheTtl` from types. `INITIAL_CACHE` from `hooks/state.ts`.
- Produces:
  - **`pricing.ts`:**
    - `costOf(model: string | null, tokens: number, ttl: CacheTtl): { warm: number; cold: number } | null`
  - **`sources/cache.ts`:**
    - `TTL_MS`
    - `type StepUsage`
    - `type CacheStatus = 'none' | 'warm' | 'cold'`
    - `type CacheView = { status; leftMs; fraction; hit: number | null; ttl; tokens; warmUsd: number | null; coldUsd: number | null }`
    - `afterResponse(state, sentAt, usage): CacheState`
    - `withEngineTtl(state, ttl): CacheState`
    - `resumed(state, at, tokens, model): CacheState`
    - `hitRatio(state): number | null`
    - `cacheView(state, now): CacheView`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/cache.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { costOf } from '../hooks/pricing'
import { afterResponse, cacheView, hitRatio, resumed, withEngineTtl } from '../hooks/sources/cache'
import { INITIAL_CACHE } from '../hooks/state'

const T0 = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 500,
  cache_read_input_tokens: 170_000,
  cache_creation_input_tokens: 9_490,
}
const cents = (usd: number | null) => (usd === null ? null : Math.round(usd * 100) / 100)

describe('cache', () => {
  test('a response starts the countdown and prices the next turn', () => {
    const state = afterResponse(INITIAL_CACHE, T0, USAGE)
    expect(state.lastRequestAt).toBe(T0)
    expect(state.tokens).toBe(180_000)
    expect(state.recent).toEqual([{ read: 170_000, input: 179_500 }])

    const view = cacheView(state, T0 + 7 * MINUTE + 50_000)
    expect(view.status).toBe('warm')
    expect(view.leftMs).toBe(3_130_000)
    expect(view.ttl).toBe('1h')
    expect(Math.round((view.hit ?? 0) * 100)).toBe(95)
    expect(cents(view.warmUsd)).toBe(0.04)
    expect(cents(view.coldUsd)).toBe(1.44)
  })

  test('it goes cold when the TTL runs out', () => {
    const view = cacheView(afterResponse(INITIAL_CACHE, T0, USAGE), T0 + HOUR)
    expect(view.status).toBe('cold')
    expect(view.leftMs).toBe(0)
    expect(view.fraction).toBe(0)
  })

  test('before any response there is nothing to count', () => {
    const view = cacheView(INITIAL_CACHE, T0)
    expect(view.status).toBe('none')
    expect(view.hit).toBeNull()
  })

  test('the hit ratio covers the last five responses', () => {
    let state = afterResponse(INITIAL_CACHE, T0, { ...USAGE, cache_read_input_tokens: 0, input_tokens: 100, cache_creation_input_tokens: 0 })
    for (let i = 1; i <= 5; i++) {
      state = afterResponse(state, T0 + i * 1000, { ...USAGE, cache_read_input_tokens: 50, input_tokens: 50, cache_creation_input_tokens: 0 })
    }
    expect(state.recent).toHaveLength(5)
    expect(hitRatio(state)).toBe(0.5)
  })

  test('the TTL is learned from hits and misses after a pause, and the engine’s word wins', () => {
    const first = afterResponse({ ...INITIAL_CACHE, ttl: '5m' }, T0, USAGE)
    const hitAfterPause = afterResponse(first, T0 + 20 * MINUTE, USAGE)
    expect(hitAfterPause.ttl).toBe('1h')
    expect(hitAfterPause.ttlSource).toBe('learned')

    const missAfterPause = afterResponse(first, T0 + 10 * MINUTE, { ...USAGE, cache_read_input_tokens: 0 })
    expect(missAfterPause.ttl).toBe('5m')

    const told = withEngineTtl(first, '5m')
    expect(afterResponse(told, T0 + 30 * MINUTE, USAGE).ttl).toBe('5m')
  })

  test('a resumed session starts from its last response', () => {
    const state = resumed(INITIAL_CACHE, T0 - 5 * MINUTE, 90_000, 'claude-opus-5-5')
    expect(cacheView(state, T0).leftMs).toBe(55 * MINUTE)
    expect(state.tokens).toBe(90_000)
  })

  test('a model the price table does not know has no price', () => {
    expect(costOf('some-other-model', 1000, '1h')).toBeNull()
    expect(cacheView(afterResponse(INITIAL_CACHE, T0, { ...USAGE, model: 'x' }), T0).warmUsd).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/pricing`.

- [ ] **Step 3: Write pricing.ts (copied from cache-countdown)**

`claude-vitals/hooks/pricing.ts`:

```ts
import type { CacheTtl } from '../types'

// API list prices, USD per million input tokens, and each model's cache-read rate as a share of it.
// Most specific first: the first prefix the model id contains wins.
const PRICES: readonly [prefix: string, input: number, read: number][] = [
  ['claude-fable-5-1', 10, 0.025],
  ['claude-mythos-5-1', 10, 0.025],
  ['claude-fable-5', 10, 0.1],
  ['claude-opus-5-5', 4, 0.05],
  ['claude-opus-5', 5, 0.1],
  ['claude-opus-4', 5, 0.1],
  ['claude-sonnet-5', 2, 0.1],
  ['claude-sonnet-4-6', 3, 0.1],
  ['claude-haiku-5-5', 0.1, 0.1],
  ['claude-haiku-4-5', 1, 0.1],
]

// Writing to the cache costs 1.25× input on the 5-minute TTL, 2× on the 1-hour.
const WRITE: Record<CacheTtl, number> = { '5m': 1.25, '1h': 2 }

/** The next turn's prompt, read back from a warm cache and written to it afresh. */
export function costOf(model: string | null, tokens: number, ttl: CacheTtl): { warm: number; cold: number } | null {
  if (model === null || tokens === 0) return null
  const id = model.toLowerCase()
  const price = PRICES.find(([prefix]) => id.includes(prefix))
  if (price === undefined) return null
  const [, input, read] = price
  const perToken = input / 1_000_000
  return { warm: tokens * perToken * read, cold: tokens * perToken * WRITE[ttl] }
}
```

- [ ] **Step 4: Write sources/cache.ts**

`claude-vitals/hooks/sources/cache.ts`:

```ts
import type { CacheState, CacheTtl } from '../../types'
import { costOf } from '../pricing'

export const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const RECENT = 5

/** A main-thread response's token counts, as `turn.step` reports them. */
export type StepUsage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type CacheStatus = 'none' | 'warm' | 'cold'

export type CacheView = {
  status: CacheStatus
  leftMs: number
  /** The share of the TTL left, 0 to 1. */
  fraction: number
  hit: number | null
  ttl: CacheTtl
  tokens: number
  warmUsd: number | null
  coldUsd: number | null
}

/**
 * The cache after a main-thread response. After a pause longer than five minutes, a response that still
 * read from cache means a 1 h TTL; one that read nothing back and wrote afresh within the hour means 5 m.
 */
export function afterResponse(state: CacheState, sentAt: number, usage: StepUsage): CacheState {
  let { ttl, ttlSource } = state
  const gap = state.lastRequestAt === null ? null : sentAt - state.lastRequestAt
  if (ttlSource !== 'engine' && gap !== null && gap > TTL_MS['5m']) {
    if (usage.cache_read_input_tokens > 0) {
      ttl = '1h'
      ttlSource = 'learned'
    } else if (gap < TTL_MS['1h'] && usage.cache_creation_input_tokens > 0) {
      ttl = '5m'
      ttlSource = 'learned'
    }
  }
  const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return {
    lastRequestAt: sentAt,
    tokens: input + usage.output_tokens,
    model: usage.model,
    ttl,
    ttlSource,
    recent: [...state.recent, { read: usage.cache_read_input_tokens, input }].slice(-RECENT),
  }
}

export function withEngineTtl(state: CacheState, ttl: CacheTtl): CacheState {
  return { ...state, ttl, ttlSource: 'engine' }
}

export function resumed(state: CacheState, at: number, tokens: number, model: string | null): CacheState {
  return { ...state, lastRequestAt: at, tokens, model: model ?? state.model }
}

/** Cache reads over all input tokens across the recent responses; null before any. */
export function hitRatio(state: CacheState): number | null {
  const input = state.recent.reduce((sum, r) => sum + r.input, 0)
  if (input === 0) return null
  return state.recent.reduce((sum, r) => sum + r.read, 0) / input
}

export function cacheView(state: CacheState, now: number): CacheView {
  if (state.lastRequestAt === null) {
    return { status: 'none', leftMs: 0, fraction: 0, hit: null, ttl: state.ttl, tokens: 0, warmUsd: null, coldUsd: null }
  }
  const ttlMs = TTL_MS[state.ttl]
  const left = state.lastRequestAt + ttlMs - now
  const cost = costOf(state.model, state.tokens, state.ttl)
  return {
    status: left > 0 ? 'warm' : 'cold',
    leftMs: Math.max(0, left),
    fraction: Math.min(1, Math.max(0, left / ttlMs)),
    hit: hitRatio(state),
    ttl: state.ttl,
    tokens: state.tokens,
    warmUsd: cost?.warm ?? null,
    coldUsd: cost?.cold ?? null,
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/pricing.ts claude-vitals/hooks/sources/cache.ts claude-vitals/tests/cache.test.ts
git commit -m "claude-vitals: cache state, TTL learning and next-turn prices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Context and spend, and the throttles

**Files:**
- Create: `claude-vitals/hooks/sources/context.ts`, `claude-vitals/hooks/throttle.ts`
- Test: `claude-vitals/tests/context.test.ts`

**Interfaces:**
- Consumes: `SessionUsage`, `SessionMeasureInput`, `EngineInterface` from `'claude-code'`. Atoms `S.context`, `S.spend`.
- Produces:
  - **`sources/context.ts`:**
    - `contextFrom(usage: Pick<SessionUsage, 'context'>, isExact, model): ContextState`
    - `spendFrom(usage: Pick<SessionUsage, 'rateLimits' | 'cost'>): SpendState`
    - `splitRows(rows): { shown: ContextRow[]; deferred: ContextRow[] }`
    - `type BarRun = { row: ContextRow; cells: number }`
    - `barRuns(rows, window, width): BarRun[]`
    - `refreshContext($, detail: 'summary' | 'full'): Promise<void>`
  - **`throttle.ts`:**
    - `type After = (ms: number, fn: () => void) => { cancel: () => void }`
    - `class Coalescer { constructor(gapMs); request(job, after) }`
    - `class Debouncer { constructor(quietMs); request(job, after) }`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/context.test.ts`:

```ts
import type { SessionUsage } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { barRuns, contextFrom, spendFrom, splitRows } from '../hooks/sources/context'
import { Coalescer, Debouncer } from '../hooks/throttle'

const CATEGORIES = [
  { name: 'Messages', tokens: 83_600, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'Memory files', tokens: 30_000, color: 'claude', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 16_700, color: 'success', isDeferred: false, kind: 'used' },
  { name: 'Skills', tokens: 7_900, color: 'warning', isDeferred: false, kind: 'used' },
  { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  { name: 'Free space', tokens: 824_900, color: 'inactive', isDeferred: false, kind: 'free' },
  { name: 'MCP tools (deferred)', tokens: 38_300, color: 'inactive', isDeferred: true, kind: 'deferred' },
]

const USAGE = {
  startedAt: 0,
  context: {
    tokens: 141_600,
    window: 1_000_000,
    percent: 14,
    breakdown: { categories: CATEGORIES, totalTokens: 141_600, maxTokens: 1_000_000, rawMaxTokens: 1_000_000, percentage: 14, gridRows: [], model: 'claude-opus-5-5' },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' }, { kind: 'seven_day', percentUsed: 22 }],
  cost: { usd: 4.12 },
} as unknown as SessionUsage

/** A clock for the throttles: `after` queues, `advance` runs what falls due, letting each job settle. */
function scheduler() {
  let now = 0
  const queue: { at: number; fn: () => void; isCancelled: boolean }[] = []
  const after = (ms: number, fn: () => void) => {
    const timer = { at: now + ms, fn, isCancelled: false }
    queue.push(timer)
    return { cancel: () => void (timer.isCancelled = true) }
  }
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = queue.filter(t => !t.isCancelled && t.at <= until).sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      queue.splice(queue.indexOf(due), 1)
      now = due.at
      due.fn()
      await settle()
    }
    now = until
  }
  return { after, advance }
}

describe('context and spend', () => {
  test('the breakdown becomes rows, kept in the engine’s order', () => {
    const state = contextFrom(USAGE, false, 'claude-opus-5-5')
    expect(state.percent).toBe(14)
    expect(state.tokens).toBe(141_600)
    expect(state.window).toBe(1_000_000)
    expect(state.rows?.map(r => r.name)).toEqual(CATEGORIES.map(c => c.name))
    expect(state.isExact).toBe(false)
    expect(state.model).toBe('claude-opus-5-5')
  })

  test('without a breakdown it keeps the status line’s figures', () => {
    const plain = { ...USAGE, context: { tokens: 50_000, window: 200_000, percent: 25 } } as unknown as SessionUsage
    const state = contextFrom(plain, false, null)
    expect(state.rows).toBeNull()
    expect(state.percent).toBe(25)
    expect(state.window).toBe(200_000)
  })

  test('spend carries the session’s dollars and each limit window', () => {
    expect(spendFrom(USAGE)).toEqual({
      sessionUsd: 4.12,
      limits: [
        { kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' },
        { kind: 'seven_day', percentUsed: 22, resetsAt: null },
      ],
    })
    expect(spendFrom({ rateLimits: [] } as unknown as SessionUsage)).toEqual({ sessionUsd: null, limits: [] })
  })

  test('deferred rows are kept apart from the legend', () => {
    const { shown, deferred } = splitRows(contextFrom(USAGE, false, null).rows ?? [])
    expect(shown).toHaveLength(6)
    expect(deferred.map(r => r.name)).toEqual(['MCP tools (deferred)'])
  })

  test('the text bar gives each used category at least a cell and the rest to free space', () => {
    const runs = barRuns(contextFrom(USAGE, false, null).rows ?? [], 1_000_000, 42)
    expect(runs.map(r => r.cells)).toEqual([4, 1, 1, 1, 1, 34])
    expect(runs.reduce((n, r) => n + r.cells, 0)).toBe(42)
  })

  test('a bar with more categories than cells still fits its width', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, tokens: 10, kind: 'used' as const }))
    expect(barRuns(many, 1000, 10).reduce((n, r) => n + r.cells, 0)).toBe(10)
  })
})

describe('throttles', () => {
  test('the coalescer runs at once, then once more after its gap for everything asked meanwhile', async () => {
    const { after, advance } = scheduler()
    const ran: string[] = []
    const job = (name: string) => async () => void ran.push(name)
    const coalescer = new Coalescer(2000)
    coalescer.request(job('a'), after)
    await advance(0)
    coalescer.request(job('b'), after)
    coalescer.request(job('c'), after)
    await advance(1999)
    expect(ran).toEqual(['a'])
    await advance(1)
    expect(ran).toEqual(['a', 'c'])
  })

  test('the debouncer runs once things go quiet', async () => {
    const { after, advance } = scheduler()
    let runs = 0
    const debouncer = new Debouncer(1000)
    for (let i = 0; i < 3; i++) {
      debouncer.request(async () => void (runs += 1), after)
      await advance(500)
    }
    expect(runs).toBe(0)
    await advance(1000)
    expect(runs).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/sources/context`.

- [ ] **Step 3: Write throttle.ts**

`claude-vitals/hooks/throttle.ts`:

```ts
export type After = (ms: number, fn: () => void) => { cancel: () => void }

/** Runs a job at most once per `gapMs`: what is asked while one runs or during the gap after it runs once, when the gap ends. */
export class Coalescer {
  private isBusy = false
  private pending: (() => Promise<void>) | null = null

  constructor(private readonly gapMs: number) {}

  request(job: () => Promise<void>, after: After): void {
    if (this.isBusy) {
      this.pending = job
      return
    }
    this.isBusy = true
    after(0, () => {
      void job()
        .catch(() => undefined)
        .finally(() => {
          after(this.gapMs, () => {
            this.isBusy = false
            const next = this.pending
            this.pending = null
            if (next !== null) this.request(next, after)
          })
        })
    })
  }
}

/** Runs a job once no request has come for `quietMs`. */
export class Debouncer {
  private timer: { cancel: () => void } | null = null

  constructor(private readonly quietMs: number) {}

  request(job: () => Promise<void>, after: After): void {
    this.timer?.cancel()
    this.timer = after(this.quietMs, () => {
      this.timer = null
      void job().catch(() => undefined)
    })
  }
}
```

- [ ] **Step 4: Write sources/context.ts**

`claude-vitals/hooks/sources/context.ts`:

```ts
import { update } from 'claude-code'
import type { EngineInterface, SessionUsage } from 'claude-code'

import type { ContextRow, ContextState, SpendState } from '../../types'
import * as S from '../state'

const PANE_COLUMNS = 46

export function contextFrom(usage: Pick<SessionUsage, 'context'>, isExact: boolean, model: string | null): ContextState {
  const breakdown = usage.context.breakdown
  if (breakdown === undefined) {
    return {
      percent: usage.context.percent ?? null,
      tokens: usage.context.tokens ?? null,
      window: usage.context.window,
      rows: null,
      isExact: false,
      model,
    }
  }
  return {
    percent: breakdown.percentage,
    tokens: breakdown.totalTokens,
    window: breakdown.rawMaxTokens,
    rows: breakdown.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    isExact,
    model,
  }
}

export function spendFrom(usage: Pick<SessionUsage, 'rateLimits' | 'cost'>): SpendState {
  return {
    sessionUsd: usage.cost?.usd ?? null,
    limits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt ?? null })),
  }
}

export function splitRows(rows: readonly ContextRow[]): { shown: ContextRow[]; deferred: ContextRow[] } {
  return { shown: rows.filter(r => r.kind !== 'deferred'), deferred: rows.filter(r => r.kind === 'deferred') }
}

export type BarRun = { row: ContextRow; cells: number }

/** The text-mode bar: each used and buffer category at least one cell, in proportion; free space the rest. */
export function barRuns(rows: readonly ContextRow[], window: number, width: number): BarRun[] {
  const runs = rows
    .filter(row => row.kind === 'used' || row.kind === 'buffer')
    .map(row => ({ row, cells: Math.max(1, Math.round((row.tokens / window) * width)) }))
  let taken = runs.reduce((n, r) => n + r.cells, 0)
  while (taken > width) {
    const widest = runs.reduce((a, b) => (b.cells > a.cells ? b : a))
    if (widest.cells > 1) {
      widest.cells -= 1
    } else {
      runs.pop()
    }
    taken = runs.reduce((n, r) => n + r.cells, 0)
  }
  const free = rows.find(row => row.kind === 'free') ?? { name: 'Free space', tokens: 0, kind: 'free' as const }
  return [...runs, { row: free, cells: width - taken }]
}

/** Re-reads the window's breakdown (and the status line's figures) into the context and spend atoms. */
export async function refreshContext($: EngineInterface, detail: 'summary' | 'full'): Promise<void> {
  try {
    const [usage, model] = await Promise.all([
      $.session.usage({ breakdown: detail, columns: PANE_COLUMNS }),
      $.session.model(),
    ])
    await update($, S.context, () => contextFrom(usage, detail === 'full', model))
    await update($, S.spend, () => spendFrom(usage))
  } catch {
    // No session bound yet, or the count failed: the last figures stand.
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/sources/context.ts claude-vitals/hooks/throttle.ts claude-vitals/tests/context.test.ts
git commit -m "claude-vitals: context and spend from the engine, and the throttles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: ccusage — run it and read its reports

**Files:**
- Create: `claude-vitals/hooks/sources/ccusage.ts`, `claude-vitals/tests/fixtures.ts`
- Test: `claude-vitals/tests/ccusage.test.ts`

**Interfaces:**
- Consumes: `localDate` from `hooks/format.ts`. Atoms `S.ccusage`, `S.place`.
- Produces:
  - **Constants:** `CCUSAGE_TIMEOUT_MS = 20_000`, `AFTER_TURN_GAP_MS = 30_000`
  - **Pure helpers:**
    - `familyOf(model): string`
    - `shiftDate(date, days): string`
    - `compactDate(date): string`
  - **Parsers:**
    - `type DailyFigures = { today: CcusageToday | null; week: number[] }`
    - `parseDaily(json, today): DailyFigures | null`
    - `parseBlocks(json): CcusageBlock | null | undefined`
  - **Running ccusage:**
    - `ccusageArgv(command, report): string[]`
    - `type CcusageRun = { isOk: true; stdout: string } | { isOk: false; status: 'missing' | 'failed'; error: string }`
    - `runCcusage($, command, report): Promise<CcusageRun>`
    - `refreshCcusage($, command): Promise<void>`
  - **`tests/fixtures.ts`:** `DAILY_JSON`, `NO_TODAY_JSON`, `BLOCKS_JSON`. Later tasks add more exports.

The JSON shapes below were captured from ccusage 20.0.40 (`claude daily --json --breakdown --offline`, `claude blocks --active --json --offline`). The figures are invented.

- [ ] **Step 1: Write the fixtures**

`claude-vitals/tests/fixtures.ts`:

```ts
// Canned engine answers for the tests. ccusage's shapes are 20.0.40's own; the figures are made up.

const day = (date: string, totalCost: number, modelBreakdowns: unknown[] = []) => ({
  date,
  inputTokens: 1_000,
  outputTokens: 2_000,
  cacheCreationTokens: 3_000,
  cacheReadTokens: 4_000,
  totalTokens: 10_000,
  totalCost,
  modelsUsed: [],
  modelBreakdowns,
})

const model = (modelName: string, cost: number) => ({
  modelName,
  cost,
  inputTokens: 10,
  outputTokens: 20,
  cacheCreationTokens: 30,
  cacheReadTokens: 40,
})

const WEEK = [
  day('2026-10-15', 12),
  day('2026-10-16', 24),
  day('2026-10-17', 18),
  day('2026-10-18', 31),
  day('2026-10-19', 44),
  day('2026-10-20', 27),
]

export const DAILY_JSON = JSON.stringify({
  daily: [
    ...WEEK,
    day('2026-10-21', 38.9, [
      model('claude-opus-5-5', 25.2),
      model('claude-opus-4-6', 6.0),
      model('claude-sonnet-4-6', 6.1),
      model('claude-haiku-4-5', 1.6),
    ]),
  ],
  totals: { totalCost: 194.9 },
})

export const NO_TODAY_JSON = JSON.stringify({ daily: WEEK, totals: { totalCost: 156 } })

const block = (startTime: string, endTime: string, isActive: boolean) => ({
  id: startTime,
  startTime,
  endTime,
  actualEndTime: startTime,
  isActive,
  isGap: false,
  entries: 10,
  costUSD: 12.3,
  models: ['claude-opus-5-5'],
  burnRate: { costPerHour: 9.8, tokensPerMinute: 1_000, tokensPerMinuteForIndicator: 100 },
  projection: { remainingMinutes: 134, totalCost: 61, totalTokens: 1_000_000 },
  tokenCounts: { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 },
  totalTokens: 10,
})

export const BLOCKS_JSON = JSON.stringify({
  blocks: [
    block('2026-10-21T05:00:00.000Z', '2026-10-21T10:00:00.000Z', false),
    block('2026-10-21T11:14:30.000Z', '2026-10-21T16:14:30.000Z', true),
  ],
})
```

- [ ] **Step 2: Write the failing tests**

`claude-vitals/tests/ccusage.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { ccusageArgv, compactDate, familyOf, parseBlocks, parseDaily, shiftDate } from '../hooks/sources/ccusage'
import { BLOCKS_JSON, DAILY_JSON, NO_TODAY_JSON } from './fixtures'

describe('ccusage', () => {
  test('the daily report gives today, its model families and the week', () => {
    const figures = parseDaily(DAILY_JSON, '2026-10-21')
    expect(figures?.week).toEqual([12, 24, 18, 31, 44, 27, 38.9])
    expect(figures?.today).toEqual({
      usd: 38.9,
      byModel: [
        { family: 'Opus', usd: 31.2 },
        { family: 'Sonnet', usd: 6.1 },
        { family: 'Haiku', usd: 1.6 },
      ],
    })
  })

  test('a day with no usage yet reads $0, not a failure', () => {
    const figures = parseDaily(NO_TODAY_JSON, '2026-10-21')
    expect(figures?.today).toEqual({ usd: 0, byModel: [] })
    expect(figures?.week).toEqual([12, 24, 18, 31, 44, 27, 0])
  })

  test('output that is not the daily report is refused; a bad total leaves today out', () => {
    expect(parseDaily('not json', '2026-10-21')).toBeNull()
    expect(parseDaily('{"daily":"x"}', '2026-10-21')).toBeNull()
    const bad = JSON.stringify({ daily: [{ date: '2026-10-21', totalCost: 'lots' }] })
    expect(parseDaily(bad, '2026-10-21')?.today).toBeNull()
  })

  test('the active block gives its end, burn rate and projection', () => {
    expect(parseBlocks(BLOCKS_JSON)).toEqual({
      endsAt: Date.parse('2026-10-21T16:14:30.000Z'),
      costPerHour: 9.8,
      projectedUsd: 61,
    })
    expect(parseBlocks('{"blocks":[]}')).toBeNull()
    expect(parseBlocks('nope')).toBeUndefined()
  })

  test('model ids fold into families', () => {
    expect(familyOf('claude-opus-5-5')).toBe('Opus')
    expect(familyOf('claude-3-5-sonnet-20241022')).toBe('Sonnet')
    expect(familyOf('claude-fable-5-1')).toBe('Fable')
    expect(familyOf('gpt-5')).toBe('Other')
  })

  test('dates shift across months and compact for --since', () => {
    expect(shiftDate('2026-10-21', -6)).toBe('2026-10-15')
    expect(shiftDate('2026-11-02', -6)).toBe('2026-10-27')
    expect(compactDate('2026-10-15')).toBe('20261015')
  })

  test('the command is split on spaces and scoped to Claude Code', () => {
    expect(ccusageArgv('npx -y ccusage@20', ['daily', '--json'])).toEqual(['npx', '-y', 'ccusage@20', 'claude', 'daily', '--json'])
    expect(ccusageArgv('  ccusage ', ['blocks'])).toEqual(['ccusage', 'claude', 'blocks'])
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/sources/ccusage`.

- [ ] **Step 4: Write sources/ccusage.ts**

`claude-vitals/hooks/sources/ccusage.ts`:

```ts
import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CcusageBlock, CcusageToday, ModelSpend } from '../../types'
import { localDate } from '../format'
import * as S from '../state'

export const CCUSAGE_TIMEOUT_MS = 20_000
/** After a turn, ccusage runs again only once this long has passed since it last started. */
export const AFTER_TURN_GAP_MS = 30_000
const DAY_MS = 86_400_000
const FAMILIES = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'] as const

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function familyOf(model: string): string {
  const id = model.toLowerCase()
  const family = FAMILIES.find(name => id.includes(name))
  return family === undefined ? 'Other' : family.charAt(0).toUpperCase() + family.slice(1)
}

/** A calendar date `days` away: shiftDate('2026-10-21', -6) is '2026-10-15'. */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** '2026-10-15' → '20261015', as --since takes it. */
export function compactDate(date: string): string {
  return date.replaceAll('-', '')
}

export type DailyFigures = { today: CcusageToday | null; week: number[] }

/** ccusage's daily report → today's spend by model family and the last seven days; null if it is not that report. */
export function parseDaily(json: string, today: string): DailyFigures | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!isRecord(data) || !Array.isArray(data.daily)) return null
  const days = data.daily.filter(isRecord)
  const costOn = new Map<string, number>()
  for (const day of days) {
    const cost = num(day.totalCost)
    if (typeof day.date === 'string' && cost !== null) costOn.set(day.date, cost)
  }
  const week = [-6, -5, -4, -3, -2, -1, 0].map(offset => costOn.get(shiftDate(today, offset)) ?? 0)
  const entry = days.find(day => day.date === today)
  if (entry === undefined) return { today: { usd: 0, byModel: [] }, week }
  const usd = num(entry.totalCost)
  if (usd === null) return { today: null, week }
  const sums = new Map<string, number>()
  const parts = Array.isArray(entry.modelBreakdowns) ? entry.modelBreakdowns.filter(isRecord) : []
  for (const part of parts) {
    const cost = num(part.cost)
    if (typeof part.modelName !== 'string' || cost === null) continue
    const family = familyOf(part.modelName)
    sums.set(family, (sums.get(family) ?? 0) + cost)
  }
  const byModel: ModelSpend[] = [...sums]
    .map(([family, sum]) => ({ family, usd: Math.round(sum * 100) / 100 }))
    .filter(spend => spend.usd >= 0.01)
    .sort((a, b) => b.usd - a.usd)
  return { today: { usd, byModel }, week }
}

/** ccusage's blocks report → the active 5-hour block; null with none active; undefined if it is not that report. */
export function parseBlocks(json: string): CcusageBlock | null | undefined {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!isRecord(data) || !Array.isArray(data.blocks)) return undefined
  const active = data.blocks.filter(isRecord).find(b => b.isActive === true && b.isGap !== true)
  if (active === undefined) return null
  const endsAt = typeof active.endTime === 'string' ? Date.parse(active.endTime) : Number.NaN
  if (Number.isNaN(endsAt)) return undefined
  const costPerHour = isRecord(active.burnRate) ? num(active.burnRate.costPerHour) : null
  const projected = isRecord(active.projection) ? num(active.projection.totalCost) : null
  return { endsAt, costPerHour: costPerHour ?? 0, projectedUsd: projected ?? num(active.costUSD) ?? 0 }
}

export function ccusageArgv(command: string, report: readonly string[]): string[] {
  return [...command.split(/\s+/).filter(part => part !== ''), 'claude', ...report]
}

export type CcusageRun = { isOk: true; stdout: string } | { isOk: false; status: 'missing' | 'failed'; error: string }

function firstLine(text: string): string | null {
  const line = text
    .split('\n')
    .map(part => part.trim())
    .find(part => part !== '')
  return line === undefined ? null : line.slice(0, 120)
}

/** One ccusage report. A run that cannot start is `missing`; one that exits non-zero or times out is `failed`. */
export async function runCcusage($: EngineInterface, command: string, report: readonly string[]): Promise<CcusageRun> {
  const startedAt = await $.clock.now()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(ccusageArgv(command, report), { timeoutMs: CCUSAGE_TIMEOUT_MS })
    if (exitCode !== 0) return { isOk: false, status: 'failed', error: firstLine(stderr) ?? `exit code ${exitCode}` }
    return { isOk: true, stdout }
  } catch {
    const took = (await $.clock.now()) - startedAt
    if (took >= CCUSAGE_TIMEOUT_MS - 1000) return { isOk: false, status: 'failed', error: 'timed out after 20s' }
    return { isOk: false, status: 'missing', error: 'not found' }
  }
}

let isRunning = false

/** Reads today's spend, the week and the active block into the ccusage atom; the last good figures stay while it runs. */
export async function refreshCcusage($: EngineInterface, command: string): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const now = await $.clock.now()
    const { tzOffsetMin } = await read($, S.place)
    await update($, S.ccusage, s => ({ ...s, status: s.status === 'ok' ? 'ok' : 'running', lastStartedAt: now }))
    const today = localDate(now, tzOffsetMin)
    const since = compactDate(shiftDate(today, -6))
    const daily = await runCcusage($, command, ['daily', '--json', '--breakdown', '--offline', '--since', since])
    if (!daily.isOk) {
      await update($, S.ccusage, s => ({ ...s, status: daily.status, error: daily.error }))
      return
    }
    const figures = parseDaily(daily.stdout, today)
    if (figures === null) {
      await update($, S.ccusage, s => ({ ...s, status: 'failed', error: 'unexpected output from ccusage daily' }))
      return
    }
    const blocks = await runCcusage($, command, ['blocks', '--active', '--json', '--offline'])
    const block = blocks.isOk ? (parseBlocks(blocks.stdout) ?? null) : null
    await update($, S.ccusage, s => ({
      ...s,
      status: 'ok',
      error: null,
      updatedAt: now,
      today: figures.today,
      week: figures.week,
      block,
    }))
  } finally {
    isRunning = false
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS. `runCcusage` and `refreshCcusage` are exercised through the hooks in Task 13.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/sources/ccusage.ts claude-vitals/tests/fixtures.ts claude-vitals/tests/ccusage.test.ts
git commit -m "claude-vitals: run ccusage and read its daily and block reports" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Edited files and uncommitted changes

**Files:**
- Create: `claude-vitals/hooks/sources/files.ts`
- Modify: `claude-vitals/tests/fixtures.ts` (append `NUMSTAT`, `DIFF_U0`)
- Test: `claude-vitals/tests/files.test.ts`

**Interfaces:**
- Consumes: `lineCount` from `hooks/format.ts`. Atoms `S.outputs`, `S.changes`.
- Produces:
  - **Constants:** `EMPTY_TREE`, `GIT_TIMEOUT_MS = 5000`, `OUTPUT_LIMIT = 200`
  - **Edits:**
    - `type EditFacts = { path; added; removed; line }`
    - `patchFacts(hunks): { added; removed; line }`
    - `editFacts(tool, input: Record<string, unknown>, result: unknown): EditFacts | null`
    - `recordEdit(rows, facts, at, agent): OutputRow[]`
  - **Git parsing:**
    - `parseNumstat(text): { path; added; removed }[]`
    - `parseFirstLines(diff): Map<string, number>`
  - **Refreshers:**
    - `refreshChanges($): Promise<void>`
    - `checkDeleted($): Promise<void>`

- [ ] **Step 1: Append the git fixtures**

Add to the end of `claude-vitals/tests/fixtures.ts`:

```ts
export const NUMSTAT = '120\t4\thooks/register.tsx\n88\t0\thooks/usage.ts\n'

export const DIFF_U0 = [
  'diff --git a/hooks/register.tsx b/hooks/register.tsx',
  'index 1111111..2222222 100644',
  '--- a/hooks/register.tsx',
  '+++ b/hooks/register.tsx',
  '@@ -40,0 +41,3 @@ export const register',
  '+one',
  '@@ -90 +93 @@',
  'diff --git a/new.ts b/new.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.ts',
  '@@ -0,0 +1,2 @@',
  '+a',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
  '',
].join('\n')
```

- [ ] **Step 2: Write the failing tests**

`claude-vitals/tests/files.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { editFacts, EMPTY_TREE, parseFirstLines, parseNumstat, patchFacts, recordEdit } from '../hooks/sources/files'
import { DIFF_U0, NUMSTAT } from './fixtures'

const HUNK = { oldStart: 10, oldLines: 4, newStart: 10, newLines: 5, lines: [' a', ' b', '-c', '+C', '+D', ' e'] }
const LATER = { oldStart: 40, oldLines: 1, newStart: 41, newLines: 2, lines: [' x', '+y', '\\ No newline at end of file'] }

describe('edits', () => {
  test('a patch counts its lines and finds its first change', () => {
    expect(patchFacts([HUNK, LATER])).toEqual({ added: 3, removed: 1, line: 12 })
    expect(patchFacts([])).toEqual({ added: 0, removed: 0, line: 1 })
  })

  test('Edit and Write results become facts', () => {
    expect(
      editFacts('Edit', { file_path: '/w/a.ts', old_string: 'c', new_string: 'C\nD' }, { filePath: '/w/a.ts', structuredPatch: [HUNK] }),
    ).toEqual({ path: '/w/a.ts', added: 2, removed: 1, line: 12 })
    expect(
      editFacts('Write', { file_path: '/w/new.ts', content: 'a\nb\nc\n' }, { type: 'create', filePath: '/w/new.ts', structuredPatch: [], originalFile: null }),
    ).toEqual({ path: '/w/new.ts', added: 3, removed: 0, line: 1 })
    expect(
      editFacts('Write', { file_path: '/w/a.ts', content: 'x' }, { type: 'update', filePath: '/w/a.ts', structuredPatch: [HUNK], originalFile: 'old' }),
    ).toEqual({ path: '/w/a.ts', added: 2, removed: 1, line: 12 })
  })

  test('without a patch an edit counts its strings', () => {
    expect(editFacts('Edit', { file_path: '/w/a.ts', old_string: 'one', new_string: 'one\ntwo' }, {})).toEqual({
      path: '/w/a.ts',
      added: 2,
      removed: 1,
      line: 1,
    })
  })

  test('a notebook edit is one change; other tools and missing paths are nothing', () => {
    expect(editFacts('NotebookEdit', { notebook_path: '/w/n.ipynb', new_source: 'x' }, {})).toEqual({
      path: '/w/n.ipynb',
      added: 1,
      removed: 0,
      line: 1,
    })
    expect(editFacts('Bash', { command: 'ls' }, {})).toBeNull()
    expect(editFacts('Edit', {}, {})).toBeNull()
  })

  test('edits to one file add up; the newest edit comes first', () => {
    let rows = recordEdit([], { path: '/w/a.ts', added: 2, removed: 1, line: 12 }, 1, null)
    rows = recordEdit(rows, { path: '/w/b.ts', added: 5, removed: 0, line: 1 }, 2, 'reviewer')
    rows = recordEdit(rows, { path: '/w/a.ts', added: 1, removed: 1, line: 40 }, 3, null)
    expect(rows.map(r => [r.path, r.added, r.removed, r.line, r.agent])).toEqual([
      ['/w/a.ts', 3, 2, 40, null],
      ['/w/b.ts', 5, 0, 1, 'reviewer'],
    ])
  })
})

describe('git', () => {
  test('numstat reads counts, binaries as zero, and renames as their new path', () => {
    const text = `${NUMSTAT}-\t-\tlogo.png\n3\t1\tsrc/{old.ts => new.ts}\n2\t2\told/a.ts => new/a.ts\n1\t0\tsrc/{sub => }/x.ts\n`
    expect(parseNumstat(text)).toEqual([
      { path: 'hooks/register.tsx', added: 120, removed: 4 },
      { path: 'hooks/usage.ts', added: 88, removed: 0 },
      { path: 'logo.png', added: 0, removed: 0 },
      { path: 'src/new.ts', added: 3, removed: 1 },
      { path: 'new/a.ts', added: 2, removed: 2 },
      { path: 'src/x.ts', added: 1, removed: 0 },
    ])
  })

  test('the first hunk of each file gives the line to open at', () => {
    const firsts = parseFirstLines(DIFF_U0)
    expect(firsts.get('hooks/register.tsx')).toBe(41)
    expect(firsts.get('new.ts')).toBe(1)
    expect(firsts.has('gone.ts')).toBe(false)
  })

  test('the empty tree is git’s well-known id', () => {
    expect(EMPTY_TREE).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/sources/files`.

- [ ] **Step 4: Write sources/files.ts**

`claude-vitals/hooks/sources/files.ts`:

```ts
import { read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ChangeRow, OutputRow } from '../../types'
import { lineCount } from '../format'
import * as S from '../state'

/** The tree with nothing in it: what a repository with no commits yet is compared against. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
export const GIT_TIMEOUT_MS = 5_000
export const OUTPUT_LIMIT = 200
const UNTRACKED_LIMIT = 50

export type EditFacts = { path: string; added: number; removed: number; line: number }
type Hunk = { newStart: number; lines: readonly string[] }
type Json = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function hunksOf(value: unknown): Hunk[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const { newStart, lines } = item as Json
    if (typeof newStart !== 'number' || !Array.isArray(lines)) return []
    return [{ newStart, lines: lines.filter((line): line is string => typeof line === 'string') }]
  })
}

/** Lines added and removed, and the new file's line of the first change. */
export function patchFacts(hunks: readonly Hunk[]): { added: number; removed: number; line: number } {
  let added = 0
  let removed = 0
  let line = 0
  for (const hunk of hunks) {
    let context = 0
    for (const text of hunk.lines) {
      if (text.startsWith('+') || text.startsWith('-')) {
        if (line === 0) line = hunk.newStart + context
        if (text.startsWith('+')) added += 1
        else removed += 1
      } else if (text.startsWith(' ')) {
        context += 1
      }
    }
  }
  return { added, removed, line: Math.max(1, line) }
}

/** What one file-writing tool call changed, from its input and the result the tool returned. */
export function editFacts(tool: string, input: Json, result: unknown): EditFacts | null {
  const output: Json = typeof result === 'object' && result !== null ? (result as Json) : {}
  if (tool === 'NotebookEdit') {
    const path = str(input.notebook_path)
    return path === null ? null : { path, added: 1, removed: 0, line: 1 }
  }
  if (tool !== 'Edit' && tool !== 'Write' && tool !== 'MultiEdit') return null
  const path = str(input.file_path) ?? str(output.filePath)
  if (path === null) return null
  const hunks = hunksOf(output.structuredPatch)
  if (hunks.length > 0) return { path, ...patchFacts(hunks) }
  if (tool === 'Write') {
    return output.type === 'update'
      ? { path, added: 0, removed: 0, line: 1 }
      : { path, added: lineCount(str(input.content) ?? ''), removed: 0, line: 1 }
  }
  return { path, added: lineCount(str(input.new_string) ?? ''), removed: lineCount(str(input.old_string) ?? ''), line: 1 }
}

/** The Outputs list after an edit: the file's counts add up and it moves to the top. */
export function recordEdit(rows: readonly OutputRow[], facts: EditFacts, at: number, agent: string | null): OutputRow[] {
  const before = rows.find(row => row.path === facts.path)
  const row: OutputRow = {
    path: facts.path,
    added: (before?.added ?? 0) + facts.added,
    removed: (before?.removed ?? 0) + facts.removed,
    line: facts.line,
    at,
    agent,
    isDeleted: false,
  }
  return [row, ...rows.filter(other => other.path !== facts.path)].slice(0, OUTPUT_LIMIT)
}

function renamedTo(path: string): string {
  const braced = path.replace(/\{[^{}]* => ([^{}]*)\}/, '$1').replace('//', '/')
  if (braced !== path) return braced
  const arrow = path.indexOf(' => ')
  return arrow === -1 ? path : path.slice(arrow + 4)
}

/** `git diff --numstat` → path, lines added, lines removed; a binary file counts as nothing; a rename as its new path. */
export function parseNumstat(text: string): { path: string; added: number; removed: number }[] {
  return text.split('\n').flatMap(line => {
    const [added = '', removed = '', ...rest] = line.split('\t')
    if (rest.length === 0) return []
    return [{ path: renamedTo(rest.join('\t')), added: Number(added) || 0, removed: Number(removed) || 0 }]
  })
}

/** `git diff -U0` → each file's first changed line in the working copy. */
export function parseFirstLines(diff: string): Map<string, number> {
  const firsts = new Map<string, number>()
  let file: string | null = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = null
    } else if (line.startsWith('+++ ')) {
      const target = line.slice(4)
      file = target === '/dev/null' ? null : target.replace(/^b\//, '')
    } else {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (hunk !== null && file !== null && !firsts.has(file)) firsts.set(file, Math.max(1, Number(hunk[1])))
    }
  }
  return firsts
}

/** Reads the repository's uncommitted changes (and the branch) into the changes atom. */
export async function refreshChanges($: EngineInterface): Promise<void> {
  const git = (args: string[]) => $.process.run(['git', ...args], { timeoutMs: GIT_TIMEOUT_MS })
  try {
    const top = await git(['rev-parse', '--show-toplevel'])
    if (top.exitCode !== 0) {
      await update($, S.changes, () => ({ status: 'not-git', branch: null, files: [] }))
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
    await update($, S.changes, () => ({ status: 'ok', branch, files }))
  } catch {
    await update($, S.changes, current => ({ ...current, status: 'timeout' }))
  }
}

/** Marks Outputs rows whose file is gone. */
export async function checkDeleted($: EngineInterface): Promise<void> {
  const rows = await read($, S.outputs)
  const gone = new Set<string>()
  for (const row of rows) {
    const exists = await $.fs.exists(row.path).catch(() => true)
    if (!exists) gone.add(row.path)
  }
  if (rows.every(row => row.isDeleted === gone.has(row.path))) return
  await update($, S.outputs, list => list.map(row => ({ ...row, isDeleted: gone.has(row.path) })))
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/sources/files.ts claude-vitals/tests/fixtures.ts claude-vitals/tests/files.test.ts
git commit -m "claude-vitals: edited files from tool results, uncommitted changes from git" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Background tasks and activity

**Files:**
- Create: `claude-vitals/hooks/sources/tasks.ts`, `claude-vitals/hooks/sources/activity.ts`
- Test: `claude-vitals/tests/sources.test.ts`

**Interfaces:**
- Consumes: `AgentInfo` from `'claude-code'`; `TasksState`, `ActivityState` from types.
- Produces:
  - **`tasks.ts`:** `tasksFrom(list, prev, now): { state: TasksState; finishedNow: number }`
  - **`activity.ts`:**
    - `CELEBRATE_MS = 4000`
    - `started(a, now)`
    - `completed(a, now)`
    - `typed(a, now)`
    - `saved(a, now)`
    - `celebrate(a, now)`
    - Each of these returns `ActivityState`.

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/sources.test.ts`:

```ts
import type { AgentInfo } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { celebrate, CELEBRATE_MS, completed, saved, started, typed } from '../hooks/sources/activity'
import { tasksFrom } from '../hooks/sources/tasks'
import { INITIAL_ACTIVITY, INITIAL_TASKS } from '../hooks/state'

const agent = (id: string, status: AgentInfo['status'], description = 'Review the transfer check'): AgentInfo => ({
  id,
  description,
  type: 'general-purpose',
  status,
})

describe('background tasks', () => {
  test('running agents keep the time they were first seen; finished ones are counted', () => {
    const first = tasksFrom([agent('a', 'running'), agent('b', 'completed')], INITIAL_TASKS, 1_000)
    expect(first.state).toEqual({
      running: [{ id: 'a', description: 'Review the transfer check', firstSeenAt: 1_000 }],
      finished: 1,
    })
    expect(first.finishedNow).toBe(0)

    const later = tasksFrom([agent('a', 'running'), agent('b', 'completed')], first.state, 5_000)
    expect(later.state.running[0]?.firstSeenAt).toBe(1_000)
  })

  test('an agent seen running and now finished counts as just finished; idle ones are neither', () => {
    const before = tasksFrom([agent('a', 'running')], INITIAL_TASKS, 1_000).state
    const after = tasksFrom([agent('a', 'failed'), agent('c', 'idle')], before, 2_000)
    expect(after.finishedNow).toBe(1)
    expect(after.state).toEqual({ running: [], finished: 1 })
  })
})

describe('activity', () => {
  test('a turn that saved a file celebrates when it completes', () => {
    let a = started(INITIAL_ACTIVITY, 1_000)
    expect(a.isWorking).toBe(true)
    a = saved(a, 2_000)
    a = completed(a, 3_000)
    expect(a.isWorking).toBe(false)
    expect(a.celebrateUntil).toBe(3_000 + CELEBRATE_MS)
  })

  test('a turn that saved nothing does not, even after an earlier save', () => {
    let a = saved(INITIAL_ACTIVITY, 500)
    a = started(a, 1_000)
    a = completed(a, 3_000)
    expect(a.celebrateUntil).toBe(0)
  })

  test('typing and celebrations move their own clocks', () => {
    expect(typed(INITIAL_ACTIVITY, 9_000).lastActiveAt).toBe(9_000)
    expect(celebrate(INITIAL_ACTIVITY, 9_000).celebrateUntil).toBe(9_000 + CELEBRATE_MS)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/sources/activity`.

- [ ] **Step 3: Write tasks.ts and activity.ts**

`claude-vitals/hooks/sources/tasks.ts`:

```ts
import type { AgentInfo } from 'claude-code'

import type { TasksState } from '../../types'

const RUNNING = new Set(['pending', 'running', 'waiting'])
const FINISHED = new Set(['completed', 'failed', 'killed'])

/** The tasks card from `$.agent.list()`, and how many agents finished since the last look. */
export function tasksFrom(list: readonly AgentInfo[], prev: TasksState, now: number): { state: TasksState; finishedNow: number } {
  const seenAt = new Map(prev.running.map(task => [task.id, task.firstSeenAt]))
  const running = list
    .filter(agent => RUNNING.has(agent.status))
    .map(agent => ({
      id: agent.id,
      description: agent.description || agent.name || agent.type,
      firstSeenAt: seenAt.get(agent.id) ?? now,
    }))
  const finished = list.filter(agent => FINISHED.has(agent.status))
  return {
    state: { running, finished: finished.length },
    finishedNow: finished.filter(agent => seenAt.has(agent.id)).length,
  }
}
```

`claude-vitals/hooks/sources/activity.ts`:

```ts
import type { ActivityState } from '../../types'

export const CELEBRATE_MS = 4_000

export function started(a: ActivityState, now: number): ActivityState {
  return { ...a, isWorking: true, turnStartedAt: now, lastActiveAt: now }
}

/** The main turn ended: a celebration if it saved a file. */
export function completed(a: ActivityState, now: number): ActivityState {
  const didSave = a.lastSaveAt > 0 && a.lastSaveAt >= a.turnStartedAt
  return { ...a, isWorking: false, lastActiveAt: now, celebrateUntil: didSave ? now + CELEBRATE_MS : a.celebrateUntil }
}

export function typed(a: ActivityState, now: number): ActivityState {
  return { ...a, lastActiveAt: now }
}

export function saved(a: ActivityState, now: number): ActivityState {
  return { ...a, lastSaveAt: now, lastActiveAt: now }
}

export function celebrate(a: ActivityState, now: number): ActivityState {
  return { ...a, celebrateUntil: now + CELEBRATE_MS }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add claude-vitals/hooks/sources/tasks.ts claude-vitals/hooks/sources/activity.ts claude-vitals/tests/sources.test.ts
git commit -m "claude-vitals: background tasks and session activity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Opening files in Zed

**Files:**
- Create: `claude-vitals/hooks/editor.ts`
- Test: `claude-vitals/tests/editor.test.ts`

**Interfaces:**
- Produces:
  - `ZED_APP_CLI`
  - `ZED_MISSING`
  - `zedCandidates(setting): string[]`
  - `openInZed($, path, line, setting): Promise<boolean>`
  - `openFile($, path, line, setting, surface): Promise<void>`. On failure it raises the toast and copies the path.

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/editor.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { ZED_APP_CLI, ZED_MISSING, zedCandidates } from '../hooks/editor'

describe('editor', () => {
  test('Zed is looked for in the setting, then on PATH, then in the app', () => {
    expect(zedCandidates('')).toEqual(['zed', ZED_APP_CLI])
    expect(zedCandidates(' /opt/bin/zed ')).toEqual(['/opt/bin/zed', 'zed', ZED_APP_CLI])
    expect(zedCandidates('zed')).toEqual(['zed', ZED_APP_CLI])
  })

  test('the app’s own CLI and the message are as the spec says', () => {
    expect(ZED_APP_CLI).toBe('/Applications/Zed.app/Contents/MacOS/cli')
    expect(ZED_MISSING).toBe('Zed not found: set its path in claude-vitals settings')
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/editor`.

- [ ] **Step 3: Write editor.ts**

`claude-vitals/hooks/editor.ts`:

```ts
import type { EngineInterface, RenderSurface } from 'claude-code'

export const ZED_APP_CLI = '/Applications/Zed.app/Contents/MacOS/cli'
export const ZED_MISSING = 'Zed not found: set its path in claude-vitals settings'

/** Where to look for Zed's CLI, in order, without repeats. */
export function zedCandidates(setting: string): string[] {
  return [...new Set([setting.trim(), 'zed', ZED_APP_CLI].filter(candidate => candidate !== ''))]
}

/** Opens `path` at `line` in Zed; false when no candidate ran. */
export async function openInZed($: EngineInterface, path: string, line: number, setting: string): Promise<boolean> {
  for (const zed of zedCandidates(setting)) {
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
export async function openFile($: EngineInterface, path: string, line: number, setting: string, surface: RenderSurface): Promise<void> {
  if (await openInZed($, path, line, setting)) return
  $.ui.toast(ZED_MISSING)
  await $.ui.copy({ text: path, surface }).catch(() => undefined)
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS. The process calls are exercised through a pane press in Task 14.

- [ ] **Step 5: Commit**

```bash
git add claude-vitals/hooks/editor.ts claude-vitals/tests/editor.test.ts
git commit -m "claude-vitals: open files in Zed at the changed line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Pictures and the animator

**Files:**
- Create: `claude-vitals/hooks/graphics/pictures.ts`, `claude-vitals/hooks/graphics/animator.ts`
- Test: `claude-vitals/tests/pictures.test.ts`

**Interfaces:**
- Consumes:
  - **From `canvas.ts`:** `Canvas`, `CELL_W`, `CELL_H`
  - **From `palette.ts`:** `rgb`, `mix`, `heat`, `categoryColor`, `Palette`
  - **From `sprite.ts`:** `spriteRgba`, `SPRITE_COLUMNS`, `SPRITE_ROWS`, `Frame`
  - **From `sources/cache.ts`:** `CacheView`
- Produces:
  - **`pictures.ts` types and constants:**
    - `type Picture = { key: string; columns: number; rows: number; alt: string; source: { rgba: string; width: number; height: number } }`
    - `RING_COLUMNS = 10`, `RING_ROWS = 5`
  - **`pictures.ts` functions:**
    - `cacheColor(pal, fraction): string`
    - `ringPicture(rows, max, pal, alt): Picture`
    - `pillPicture(pal, options): Picture`
    - `cachePill(view, pal, columns, ms: number | null): Picture`
    - `limitPill(pal, kind, percent): Picture`
    - `sparkPicture(pal, week): Picture`
    - `characterPicture(frame): Picture`
  - **`animator.ts`:**
    - `type Blit = { kind: 'image'; source: ImageSource } | { kind: 'raster'; cells: string }`
    - `type Animated = { key: string; frame: (ms: number) => { sig: string; blit: Blit } }`
    - `FRAME_MS = 125`
    - `class Animator { constructor(requestId); isRunning; set($, list); stop() }`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/pictures.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { paletteFor } from '../hooks/graphics/palette'
import { cacheColor, cachePill, characterPicture, limitPill, ringPicture, sparkPicture } from '../hooks/graphics/pictures'
import type { Picture } from '../hooks/graphics/pictures'
import { frameAt } from '../hooks/graphics/sprite'
import type { CacheView } from '../hooks/sources/cache'
import type { ContextRow } from '../types'

const DARK = paletteFor('dark')
const ROWS: ContextRow[] = [
  { name: 'Messages', tokens: 83_600, kind: 'used' },
  { name: 'Free space', tokens: 916_400, kind: 'free' },
]
const WARM: CacheView = { status: 'warm', leftMs: 3_000_000, fraction: 0.83, hit: 0.95, ttl: '1h', tokens: 180_000, warmUsd: 0.04, coldUsd: 1.44 }
const COLD: CacheView = { ...WARM, status: 'cold', leftMs: 0, fraction: 0 }
const shape = (p: Picture) => [p.key, p.columns, p.rows, p.source.width, p.source.height]

describe('pictures', () => {
  test('the context ring is 10 × 5 cells of 160 × 160 pixels, made once per input', () => {
    const ring = ringPicture(ROWS, 1_000_000, DARK, '8% used')
    expect(shape(ring)).toEqual(['ring', 10, 5, 160, 160])
    expect(ringPicture(ROWS, 1_000_000, DARK, '8% used')).toBe(ring)
    expect(ringPicture(ROWS, 1_000_000, paletteFor('light'), '8% used')).not.toBe(ring)
  })

  test('the cache pill shimmers only while warm and animated', () => {
    const still = cachePill(WARM, DARK, 30, null)
    expect(shape(still)).toEqual(['cache-pill', 30, 1, 480, 32])
    expect(cachePill(WARM, DARK, 30, 1_000).source.rgba).not.toBe(still.source.rgba)
    expect(cachePill(COLD, DARK, 30, 1_000)).toBe(cachePill(COLD, DARK, 30, null))
  })

  test('limit pills, the sparkline and the claw come out their sizes', () => {
    expect(shape(limitPill(DARK, 'five_hour', 46))).toEqual(['limit-five_hour', 10, 1, 160, 32])
    expect(shape(sparkPicture(DARK, [12, 24, 18, 31, 44, 27, 38.9]))).toEqual(['spark', 8, 2, 128, 64])
    expect(shape(characterPicture(frameAt('content', 0)))).toEqual(['character', 14, 5, 112, 80])
  })

  test('the cache colour moves teal, amber, red as the TTL runs down', () => {
    expect(cacheColor(DARK, 0.5)).toBe(DARK.teal)
    expect(cacheColor(DARK, 0.2)).toBe(DARK.amber)
    expect(cacheColor(DARK, 0.05)).toBe(DARK.red)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The loader cannot resolve `../hooks/graphics/pictures`.

- [ ] **Step 3: Write pictures.ts**

`claude-vitals/hooks/graphics/pictures.ts`:

```ts
import type { ContextRow } from '../../types'
import type { CacheView } from '../sources/cache'
import { Canvas, CELL_H, CELL_W } from './canvas'
import { categoryColor, heat, mix, rgb } from './palette'
import type { Palette, Rgb } from './palette'
import { SPRITE_COLUMNS, SPRITE_ROWS, spriteRgba } from './sprite'
import type { Frame } from './sprite'

export type Picture = {
  key: string
  columns: number
  rows: number
  alt: string
  source: { rgba: string; width: number; height: number }
}

export const RING_COLUMNS = 10
export const RING_ROWS = 5
const MEMO_LIMIT = 64
const memo = new Map<string, Picture>()

/** Each picture is painted once per distinct input. */
function remember(signature: string, make: () => Picture): Picture {
  const hit = memo.get(signature)
  if (hit !== undefined) return hit
  if (memo.size >= MEMO_LIMIT) memo.clear()
  const made = make()
  memo.set(signature, made)
  return made
}

function pictureOf(key: string, columns: number, rows: number, alt: string, canvas: Canvas): Picture {
  return { key, columns, rows, alt, source: { rgba: canvas.toBase64(), width: canvas.width, height: canvas.height } }
}

/** Teal while more than a quarter of the TTL is left, amber under a quarter, red under a tenth. */
export function cacheColor(pal: Palette, fraction: number): string {
  return fraction > 0.25 ? pal.teal : fraction > 0.1 ? pal.amber : pal.red
}

/** A donut of the used and buffer categories, clockwise from 12 o'clock, on a dark track. */
export function ringPicture(rows: readonly ContextRow[], max: number, pal: Palette, alt: string): Picture {
  const signature = `ring|${pal.theme}|${max}|${rows.map(r => `${r.name}:${r.tokens}:${r.kind}`).join(',')}`
  return remember(signature, () => {
    const width = RING_COLUMNS * CELL_W
    const height = RING_ROWS * CELL_H
    const canvas = new Canvas(width, height)
    const arcs: { from: number; to: number; color: Rgb }[] = []
    let at = 0
    for (const row of rows) {
      if (row.kind !== 'used' && row.kind !== 'buffer') continue
      const size = max > 0 ? row.tokens / max : 0
      arcs.push({ from: at, to: at + size, color: rgb(categoryColor(pal, row)) })
      at += size
    }
    const track = rgb(pal.track)
    const outer = Math.min(width, height) / 2 - 4
    canvas.ring(width / 2, height / 2, outer, outer * 0.68, turn => arcs.find(a => turn >= a.from && turn < a.to)?.color ?? track)
    return pictureOf('ring', RING_COLUMNS, RING_ROWS, alt, canvas)
  })
}

export type PillOptions = {
  key: string
  columns: number
  /** How much of the pill is filled, 0 to 1. */
  fraction: number
  /** The fill's colour along its length, 0 to 1. */
  color: (t: number) => string
  alt: string
  /** Where a soft highlight sits along the fill, 0 to 1; null for none. */
  shimmerAt?: number | null
  /** The fill's opacity, 0 to 1. */
  glow?: number
}

/** A rounded bar one cell tall: a dark track, filled from the left. */
export function pillPicture(pal: Palette, o: PillOptions): Picture {
  const shimmer = o.shimmerAt ?? null
  const glow = o.glow ?? 1
  const signature = [
    'pill', pal.theme, o.key, o.columns, o.fraction.toFixed(3), shimmer === null ? '-' : shimmer.toFixed(2), glow.toFixed(2), o.color(0), o.color(1),
  ].join('|')
  return remember(signature, () => {
    const width = o.columns * CELL_W
    const height = CELL_H
    const canvas = new Canvas(width, height)
    const bar = Math.round(height * 0.45)
    const top = (height - bar) / 2
    const track = rgb(pal.track)
    canvas.pill(0, top, width, bar, () => track)
    const fillTo = Math.min(1, Math.max(0, o.fraction)) * width
    canvas.pill(
      0,
      top,
      width,
      bar,
      px => {
        if (px >= fillTo) return null
        const t = px / width
        const lift = shimmer === null ? 0 : 0.35 * Math.max(0, 1 - Math.abs(t - shimmer) * 8)
        return rgb(mix(o.color(t), '#ffffff', lift))
      },
      glow,
    )
    return pictureOf(o.key, o.columns, 1, o.alt, canvas)
  })
}

/** The cache pill: the TTL left, coloured by urgency; animated, a highlight sweeps it every 3 s and it pulses in the last 2 minutes. */
export function cachePill(view: CacheView, pal: Palette, columns: number, ms: number | null): Picture {
  const base = cacheColor(pal, view.fraction)
  const isAnimated = ms !== null && view.status === 'warm'
  const shimmerAt = isAnimated ? ((ms % 3_000) / 3_000) * 1.4 - 0.2 : null
  const glow = isAnimated && view.leftMs < 120_000 ? 0.65 + 0.35 * (0.5 + 0.5 * Math.cos((2 * Math.PI * ms) / 1_000)) : 1
  return pillPicture(pal, {
    key: 'cache-pill',
    columns,
    fraction: view.fraction,
    color: t => mix(base, pal.text, t * 0.15),
    alt: `${Math.round(view.fraction * 100)}% of the TTL left`,
    shimmerAt,
    glow,
  })
}

/** A rate-limit window: filled to its share used, a heat gradient along its length. */
export function limitPill(pal: Palette, kind: string, percent: number): Picture {
  return pillPicture(pal, {
    key: `limit-${kind}`,
    columns: 10,
    fraction: percent / 100,
    color: t => heat(pal, t),
    alt: `${Math.round(percent)}% used`,
  })
}

/** Seven rounded bars, oldest first, today bright. */
export function sparkPicture(pal: Palette, week: readonly number[]): Picture {
  const signature = `spark|${pal.theme}|${week.join(',')}`
  return remember(signature, () => {
    const columns = 8
    const rows = 2
    const width = columns * CELL_W
    const height = rows * CELL_H
    const canvas = new Canvas(width, height)
    const max = Math.max(0, ...week)
    const slot = width / Math.max(1, week.length)
    const barWidth = slot * 0.55
    week.forEach((value, i) => {
      const isToday = i === week.length - 1
      const barHeight = Math.max(barWidth, max === 0 ? 0 : (value / max) * (height - 6))
      const color = rgb(isToday ? pal.amber : mix(pal.track, pal.amber, 0.45))
      canvas.pill(i * slot + (slot - barWidth) / 2, height - 3 - barHeight, barWidth, barHeight, () => color)
    })
    return pictureOf('spark', columns, rows, week.map(v => `$${Math.round(v)}`).join(' '), canvas)
  })
}

/** The claw at 8 pixels a sprite pixel, transparent around it. */
export function characterPicture(frame: Frame): Picture {
  return remember(`character|${frame.join('/')}`, () => ({
    key: 'character',
    columns: SPRITE_COLUMNS,
    rows: SPRITE_ROWS,
    alt: 'claw',
    source: spriteRgba(frame, 8),
  }))
}
```

- [ ] **Step 4: Write animator.ts**

`claude-vitals/hooks/graphics/animator.ts`:

```ts
import type { EngineInterface, ImageSource, Timer } from 'claude-code'

export type Blit = { kind: 'image'; source: ImageSource } | { kind: 'raster'; cells: string }

/** One moving picture: its key in the pane, and its frame at a time (`sig` names the frame, so an unchanged one is not sent). */
export type Animated = { key: string; frame: (ms: number) => { sig: string; blit: Blit } }

export const FRAME_MS = 125

/** Repaints keyed pictures in the pane with `$.ui.blit`, 8 frames a second, only while something moves. */
export class Animator {
  private timer: Timer | null = null
  private list: readonly Animated[] = []
  private readonly shown = new Map<string, string>()

  constructor(private readonly requestId: string) {}

  get isRunning(): boolean {
    return this.timer !== null
  }

  set($: EngineInterface, list: readonly Animated[]): void {
    this.list = list
    for (const key of [...this.shown.keys()]) {
      if (!list.some(animated => animated.key === key)) this.shown.delete(key)
    }
    if (list.length === 0) {
      this.stop()
      return
    }
    if (this.timer === null) this.timer = $.clock.every(FRAME_MS, () => void this.step($))
  }

  stop(): void {
    this.timer?.cancel()
    this.timer = null
    this.list = []
    this.shown.clear()
  }

  private async step($: EngineInterface): Promise<void> {
    const ms = await $.clock.now()
    for (const animated of this.list) {
      const { sig, blit } = animated.frame(ms)
      if (this.shown.get(animated.key) === sig) continue
      this.shown.set(animated.key, sig)
      const args =
        blit.kind === 'image'
          ? { requestId: this.requestId, key: animated.key, source: blit.source }
          : { requestId: this.requestId, key: animated.key, cells: blit.cells }
      await $.ui.blit(args).catch(() => undefined)
    }
  }
}
```

- [ ] **Step 5: Run the tests and type-check**

Run: `claude plugin test claude-vitals`
Expected: PASS.

Run: `npx -y -p typescript@5 tsc -p claude-vitals`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/graphics/pictures.ts claude-vitals/hooks/graphics/animator.ts claude-vitals/tests/pictures.test.ts
git commit -m "claude-vitals: ring, pills, sparkline and claw pictures, and the animator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: The wiring, the pane, the header and the Cache card

The hooks module is written whole here. Every later task adds a card file, two lines in `hooks/pane.tsx` and tests. None of them changes `register.tsx` again.

**Files:**
- Create: `claude-vitals/hooks/cards/kit.tsx`, `claude-vitals/hooks/cards/header.tsx`, `claude-vitals/hooks/cards/cache.tsx`, `claude-vitals/hooks/cards/compact.tsx`, `claude-vitals/hooks/pane.tsx`, `claude-vitals/tests/world.ts`
- Modify: `claude-vitals/hooks/register.tsx` (replace the placeholder whole), `claude-vitals/tests/fixtures.ts` (add engine fixtures)
- Test: `claude-vitals/tests/pane.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–10, by the names in their Interfaces blocks.
- Produces:
  - **`cards/kit.tsx`:**
    - Types: `Ui`, `Actions`, `Kit`
    - Functions: `isOpen(kit, id)`, `card(kit, id, title, accent, body: (isOpen) => RenderElement[])`, `line(kit, key, left, right?)`, `text(kit, value, color?, isBold?)`, `dim(kit, value)`, `cellBar(kit, fraction, width, colorAt)`, `picture(kit, p)`
  - **`cards/header.tsx`:**
    - `type HeaderData`
    - `moodColor(pal, mood)`
    - `headerCard(kit, d)`
  - **`cards/cache.tsx`:**
    - `cacheBarColumns(width)`
    - `cacheCard(kit, view)`
  - **`cards/compact.tsx`:**
    - `type CompactUi`
    - `compactLine(d)`
    - `compactTree(ui, d, pal)`
  - **`pane.tsx`:**
    - Types: `PaneData`, `PaneSettings`
    - Functions: `readPaneData($)`, `moodInput(d)`, `paneCards(kit, d, s)`
  - **`tests/world.ts`:**
    - Constants: `PLUGIN`, `PANE_PROPS`, `BAND_PROPS`, `VIEWPORT`, `ZED_APP`
    - `type Answers`
    - `world(on, env?, stored?)`, which returns `{ clock, seen, answers }`
    - Driving helpers: `start`, `open`, `request`, `turnStart`, `turnComplete`, `edit`, `measure`, `type`
    - Pane helpers: `mountPane`, `paneText`
  - **Card keys that tests and later tasks press or find:**
    - `toggle-<id>` for each card title, `card-<id>` for each card box, and `card-header`
    - `character`, `cache-pill`

- [ ] **Step 1: Add the engine fixtures**

At the top of `claude-vitals/tests/fixtures.ts` add:

```ts
import type { SessionUsage } from 'claude-code'
```

At the end of `claude-vitals/tests/fixtures.ts` add:

```ts
export const HOME = '/Users/me'
export const CWD = '/Users/me/Workspace/mods'
/** 14:00 UTC on Wednesday 21 October 2026: 15:00 in the zone `date +%z` reports (+0100). */
export const START = Date.parse('2026-10-21T14:00:00Z')

export const CATEGORIES = [
  { name: 'Messages', tokens: 83_600, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'Memory files', tokens: 30_000, color: 'claude', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 16_700, color: 'success', isDeferred: false, kind: 'used' },
  { name: 'Skills', tokens: 7_900, color: 'warning', isDeferred: false, kind: 'used' },
  { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  { name: 'Free space', tokens: 824_900, color: 'inactive', isDeferred: false, kind: 'free' },
  { name: 'MCP tools (deferred)', tokens: 38_300, color: 'inactive', isDeferred: true, kind: 'deferred' },
]

export type LimitFixture = { kind: string; percentUsed: number; resetsAt?: string }

export const LIMITS: LimitFixture[] = [
  { kind: 'five_hour', percentUsed: 46, resetsAt: '2026-10-21T16:00:00Z' },
  { kind: 'seven_day', percentUsed: 22, resetsAt: '2026-10-26T08:00:00Z' },
]

/** `$.session.usage()` as the engine answers it, with the window `percent` full. */
export function usageFixture(options: { percent?: number; limits?: LimitFixture[]; costUsd?: number } = {}): SessionUsage {
  const percent = options.percent ?? 14
  const tokens = percent * 10_000
  return {
    startedAt: START - 3_600_000,
    context: {
      tokens,
      window: 1_000_000,
      percent,
      breakdown: {
        categories: CATEGORIES,
        totalTokens: tokens,
        maxTokens: 1_000_000,
        rawMaxTokens: 1_000_000,
        percentage: percent,
        gridRows: [],
        model: 'claude-opus-5-5',
      },
    },
    rateLimits: options.limits ?? LIMITS,
    cost: { usd: options.costUsd ?? 4.12 },
  } as unknown as SessionUsage
}

/** One main-thread response: 180k tokens re-sent next turn, 95% of input read from cache. */
export const STEP_USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 500,
  cache_read_input_tokens: 170_000,
  cache_creation_input_tokens: 9_490,
}

/** The patch an Edit returns in these tests: +2 −1, first change at line 12. */
export const EDIT_HUNK = { oldStart: 10, oldLines: 4, newStart: 10, newLines: 5, lines: [' a', ' b', '-c', '+C', '+D', ' e'] }
```

- [ ] **Step 2: Write the test world**

`claude-vitals/tests/world.ts`:

```ts
import type { AgentInfo, On, ProcessRunResult, PromptEditInput, RenderElement, SessionUsage } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BLOCKS_JSON, CWD, DAILY_JSON, DIFF_U0, EDIT_HUNK, HOME, NUMSTAT, START, STEP_USAGE, usageFixture } from './fixtures'

export const PLUGIN = 'claude-vitals'
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
  await $.command.run({ command: 'vitals' })
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
```

If the kit refuses `{ deny }` as an answer to `process.run`, throw instead: `throw new Error('spawn ccusage ENOENT')`. The mod treats a rejected run the same way.

- [ ] **Step 3: Write the failing tests**

`claude-vitals/tests/pane.test.ts`:

```ts
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
    await $.command.run({ command: 'vitals' })
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
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The placeholder pane draws only `claude-vitals`, so the header and cache assertions fail.

- [ ] **Step 5: Write cards/kit.tsx**

`claude-vitals/hooks/cards/kit.tsx`:

```tsx
import type { Elements, RenderElement } from 'claude-code'

import type { GraphicsMode } from '../../types'
import { filledCells } from '../format'
import type { Palette } from '../graphics/palette'
import type { Picture } from '../graphics/pictures'

export type Ui = Elements['terminal']

/** What a press in the pane can do. */
export type Actions = {
  toggle: (id: string) => void
  open: (path: string, line: number) => void
  refreshUsage: () => void
  exactContext: () => void
  toggleAllOutputs: () => void
}

/** What every card draws with: the terminal's elements, the palette, the mode, what is folded, the body's width, the presses. */
export type Kit = {
  ui: Ui
  pal: Palette
  mode: GraphicsMode
  collapsed: readonly string[]
  width: number
  actions: Actions
}

export function isOpen(kit: Kit, id: string): boolean {
  return !kit.collapsed.includes(id)
}

/** A rounded card whose title row folds it; `body` draws what shows, told whether the card is open. */
export function card(kit: Kit, id: string, title: string, accent: string, body: (isOpen: boolean) => RenderElement[]): RenderElement {
  const { Box, Button, Text } = kit.ui
  const open = isOpen(kit, id)
  return (
    <Box
      key={`card-${id}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={kit.pal.border}
      backgroundColor={kit.pal.card}
      paddingX={1}
      hover={{ borderColor: accent }}
    >
      <Button key={`toggle-${id}`} plain onPress={() => kit.actions.toggle(id)}>
        <Text bold color={accent}>
          {title}
        </Text>
        <Text color={kit.pal.dim}>{open ? ' ⌄' : ' ›'}</Text>
      </Button>
      {body(open)}
    </Box>
  )
}

/** One row: `left` at its start, `right` at its end. */
export function line(kit: Kit, key: string, left: RenderElement[], right: RenderElement[] = []): RenderElement {
  const { Box } = kit.ui
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row">{left}</Box>
      {right.length === 0 ? null : <Box flexDirection="row">{right}</Box>}
    </Box>
  )
}

export function text(kit: Kit, value: string, color?: string, isBold = false): RenderElement {
  const { Text } = kit.ui
  return (
    <Text color={color ?? kit.pal.text} bold={isBold}>
      {value}
    </Text>
  )
}

export function dim(kit: Kit, value: string): RenderElement {
  return text(kit, value, kit.pal.dim)
}

/** `width` cells, the first `fraction` of them filled (▰), each in `colorAt(cell)`; the rest empty (▱) in the track colour. */
export function cellBar(kit: Kit, fraction: number, width: number, colorAt: (cell: number) => string): RenderElement {
  const { Text } = kit.ui
  const filled = filledCells(fraction, width)
  const runs: { color: string; glyphs: string }[] = []
  for (let cell = 0; cell < width; cell++) {
    const color = cell < filled ? colorAt(cell) : kit.pal.track
    const glyph = cell < filled ? '▰' : '▱'
    const last = runs[runs.length - 1]
    if (last !== undefined && last.color === color) last.glyphs += glyph
    else runs.push({ color, glyphs: glyph })
  }
  return <Text>{runs.map(run => <Text color={run.color}>{run.glyphs}</Text>)}</Text>
}

export function picture(kit: Kit, p: Picture): RenderElement {
  const { Image } = kit.ui
  return <Image key={p.key} source={p.source} columns={p.columns} rows={p.rows} alt={p.alt} />
}
```

`Text` takes no `key` prop. Only `Box`, `Button`, `Image` and `Raster` are keyed anywhere in this mod.

- [ ] **Step 6: Write cards/header.tsx and cards/cache.tsx**

`claude-vitals/hooks/cards/header.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import { modelName } from '../format'
import type { Palette } from '../graphics/palette'
import { characterPicture } from '../graphics/pictures'
import { SPRITE_COLUMNS, SPRITE_ROWS, spriteCells } from '../graphics/sprite'
import type { Frame } from '../graphics/sprite'
import type { Mood } from '../mood'
import { picture } from './kit'
import type { Kit } from './kit'

export type HeaderData = {
  model: string | null
  branch: string | null
  place: string
  mood: Mood
  frame: Frame
  label: string | null
  showCharacter: boolean
}

export function moodColor(pal: Palette, mood: Mood): string {
  if (mood === 'cold') return pal.blue
  if (mood === 'sweating' || mood === 'celebrating') return pal.amber
  if (mood === 'working') return pal.teal
  return pal.dim
}

/** The claw, and beside it the model, where the session runs, and why the claw looks as it does. */
export function headerCard(kit: Kit, d: HeaderData): RenderElement {
  const { Box, Raster, Text } = kit.ui
  const where = [d.branch, d.place].filter((part): part is string => part !== null && part !== '').join(' · ')
  let art: RenderElement | null = null
  if (d.showCharacter) {
    art =
      kit.mode === 'pixels' ? (
        picture(kit, characterPicture(d.frame))
      ) : (
        <Raster key="character" columns={SPRITE_COLUMNS} rows={SPRITE_ROWS} cells={spriteCells(d.frame)} />
      )
  }
  return (
    <Box
      key="card-header"
      flexDirection="row"
      borderStyle="round"
      borderColor={kit.pal.border}
      backgroundColor={kit.pal.card}
      paddingX={1}
      columnGap={2}
    >
      {art}
      <Box flexDirection="column" justifyContent="center">
        <Text bold color={kit.pal.text}>
          {modelName(d.model)}
        </Text>
        <Text color={kit.pal.dim} wrap="truncate-start">
          {where}
        </Text>
        {d.label === null ? null : <Text color={moodColor(kit.pal, d.mood)}>{d.label}</Text>}
      </Box>
    </Box>
  )
}
```

`claude-vitals/hooks/cards/cache.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import { countdown, money } from '../format'
import { cacheColor, cachePill } from '../graphics/pictures'
import type { CacheView } from '../sources/cache'
import { card, cellBar, dim, line, picture, text } from './kit'
import type { Kit } from './kit'

/** How wide the cache bar is in a card body `width` wide: room is left for "hit 95%". */
export function cacheBarColumns(width: number): number {
  return Math.max(8, width - 10)
}

export function cacheCard(kit: Kit, view: CacheView): RenderElement {
  const { pal } = kit
  return card(kit, 'cache', 'Cache', pal.teal, isOpen => {
    if (!isOpen) return []
    if (view.status === 'none') return [dim(kit, '– waiting for the first response')]
    const isWarm = view.status === 'warm'
    const tone = isWarm ? cacheColor(pal, view.fraction) : pal.red
    const rows: RenderElement[] = [
      line(
        kit,
        'cache-state',
        [text(kit, isWarm ? '● ' : '○ ', tone), text(kit, isWarm ? 'warm' : 'cold', tone, true), dim(kit, ` · ${view.ttl} TTL`)],
        isWarm ? [dim(kit, 'cold in '), text(kit, countdown(view.leftMs), pal.text, true)] : [],
      ),
    ]
    const columns = cacheBarColumns(kit.width)
    const bar =
      kit.mode === 'pixels' ? picture(kit, cachePill(view, pal, columns, null)) : cellBar(kit, view.fraction, columns, () => tone)
    const hitColor = view.hit === null ? pal.dim : view.hit >= 0.8 ? pal.green : view.hit >= 0.5 ? pal.amber : pal.red
    rows.push(line(kit, 'cache-meter', [bar], view.hit === null ? [] : [text(kit, `hit ${Math.round(view.hit * 100)}%`, hitColor)]))
    if (view.warmUsd !== null && view.coldUsd !== null) {
      rows.push(
        line(kit, 'cache-cost', [
          dim(kit, 'next turn '),
          text(kit, money(view.warmUsd), pal.teal, true),
          dim(kit, ' warm · '),
          text(kit, money(view.coldUsd), pal.amber, true),
          dim(kit, ' if cold'),
        ]),
      )
    }
    return rows
  })
}
```

- [ ] **Step 7: Write pane.tsx and cards/compact.tsx**

`claude-vitals/hooks/pane.tsx`:

```tsx
import { read } from 'claude-code'
import type { EngineInterface, RenderElement } from 'claude-code'

import type {
  ActivityState,
  CacheState,
  CcusageState,
  ChangesState,
  ContextState,
  OutputRow,
  PlaceState,
  SpendState,
  TasksState,
  ViewState,
} from '../types'
import { cacheCard } from './cards/cache'
import { headerCard } from './cards/header'
import type { Kit } from './cards/kit'
import { homePath } from './format'
import { frameAt } from './graphics/sprite'
import { moodLabel, moodOf } from './mood'
import type { MoodInput } from './mood'
import { cacheView } from './sources/cache'
import * as S from './state'

export type PaneData = {
  cache: CacheState
  context: ContextState
  spend: SpendState
  ccusage: CcusageState
  outputs: OutputRow[]
  changes: ChangesState
  tasks: TasksState
  activity: ActivityState
  view: ViewState
  place: PlaceState
  now: number
}

export type PaneSettings = { showCharacter: boolean; refreshMs: number }

/** Every value the pane draws from. Read while drawing, it subscribes the pane to each. */
export async function readPaneData($: EngineInterface): Promise<PaneData> {
  const [cache, context, spend, ccusage, outputs, changes, tasks, activity, view, place, tick] = await Promise.all([
    read($, S.cache),
    read($, S.context),
    read($, S.spend),
    read($, S.ccusage),
    read($, S.outputs),
    read($, S.changes),
    read($, S.tasks),
    read($, S.activity),
    read($, S.view),
    read($, S.place),
    read($, S.now),
  ])
  const now = Math.max(tick, await $.clock.now())
  return { cache, context, spend, ccusage, outputs, changes, tasks, activity, view, place, now }
}

export function moodInput(d: PaneData): MoodInput {
  return {
    cache: cacheView(d.cache, d.now).status,
    contextPercent: d.context.percent,
    limits: d.spend.limits,
    isWorking: d.activity.isWorking,
    celebrateUntil: d.activity.celebrateUntil,
    lastActiveAt: d.activity.lastActiveAt,
    now: d.now,
  }
}

/** The docked sidebar's cards, top to bottom. */
export function paneCards(kit: Kit, d: PaneData, s: PaneSettings): RenderElement[] {
  const input = moodInput(d)
  const mood = moodOf(input)
  return [
    headerCard(kit, {
      model: d.context.model ?? d.cache.model,
      branch: d.changes.branch,
      place: homePath(d.place.cwd, d.place.home),
      mood,
      frame: frameAt(mood, d.now),
      label: moodLabel(mood, input),
      showCharacter: s.showCharacter,
    }),
    cacheCard(kit, cacheView(d.cache, d.now)),
  ]
}
```

`claude-vitals/hooks/cards/compact.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import { countdown, homePath, modelName, money } from '../format'
import type { Palette } from '../graphics/palette'
import { moodLabel, moodOf } from '../mood'
import { moodInput } from '../pane'
import type { PaneData } from '../pane'
import { cacheView } from '../sources/cache'
import type { Ui } from './kit'

export type CompactUi = Pick<Ui, 'Box' | 'Text'>

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Every card as one phrase: Context 14% · Cache warm 52:10 · Today $38.90 · 3 outputs · ± 12 files · 1 task. */
export function compactLine(d: PaneData): string {
  const parts: string[] = []
  if (d.context.percent !== null) parts.push(`Context ${Math.round(d.context.percent)}%`)
  const cache = cacheView(d.cache, d.now)
  if (cache.status === 'warm') parts.push(`Cache warm ${countdown(cache.leftMs)}`)
  if (cache.status === 'cold') parts.push('Cache cold')
  if (d.ccusage.today !== null) parts.push(`Today ${money(d.ccusage.today.usd)}`)
  if (d.outputs.length > 0) parts.push(plural(d.outputs.length, 'output'))
  if (d.changes.status === 'ok' && d.changes.files.length > 0) parts.push(`± ${plural(d.changes.files.length, 'file')}`)
  if (d.tasks.running.length > 0) parts.push(plural(d.tasks.running.length, 'task'))
  return parts.join(' · ')
}

/** The pane inline above the prompt, and on every surface but the terminal: the header's text and one line for the cards. */
export function compactTree(ui: CompactUi, d: PaneData, pal: Palette): RenderElement {
  const { Box, Text } = ui
  const input = moodInput(d)
  const label = moodLabel(moodOf(input), input)
  const where = [d.changes.branch, homePath(d.place.cwd, d.place.home)].filter(part => part !== null && part !== '').join(' · ')
  const summary = compactLine(d)
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={pal.text}>
          {modelName(d.context.model ?? d.cache.model)}
        </Text>
        <Text color={pal.dim}>{`  ${where}`}</Text>
        {label === null ? null : <Text color={pal.amber}>{`  ${label}`}</Text>}
      </Text>
      {summary === '' ? null : (
        <Text color={pal.text} wrap="wrap">
          {summary}
        </Text>
      )}
    </Box>
  )
}
```

- [ ] **Step 8: Write the hooks module**

Replace `claude-vitals/hooks/register.tsx` whole:

```tsx
import { read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'

import { cacheBarColumns } from './cards/cache'
import { compactTree } from './cards/compact'
import type { Actions, Kit } from './cards/kit'
import { openFile } from './editor'
import { parseOffset } from './format'
import { Animator } from './graphics/animator'
import type { Animated } from './graphics/animator'
import { detectMode } from './graphics/mode'
import { paletteFor, themeOf } from './graphics/palette'
import { cachePill, characterPicture } from './graphics/pictures'
import { frameAt, frameIndex, spriteCells } from './graphics/sprite'
import { moodOf } from './mood'
import { moodInput, paneCards, readPaneData } from './pane'
import { celebrate, completed, saved, started, typed } from './sources/activity'
import { afterResponse, cacheView, resumed, withEngineTtl } from './sources/cache'
import { AFTER_TURN_GAP_MS, refreshCcusage } from './sources/ccusage'
import { refreshContext, spendFrom } from './sources/context'
import { checkDeleted, editFacts, recordEdit, refreshChanges } from './sources/files'
import { tasksFrom } from './sources/tasks'
import * as S from './state'
import { Coalescer, Debouncer } from './throttle'

const PANE = 'vitals'
const TITLE = 'Vitals'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// The module's own: set again by each load's `register`, so a reload starts them over.
const settings = {
  autoOpen: true,
  columns: 46,
  zedPath: '',
  ccusageCommand: 'ccusage',
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
  settings.ccusageCommand = String(options.ccusageCommand ?? 'ccusage').trim() || 'ccusage'
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
    await update($, S.place, place => ({ ...place, cwd: e.cwd, home }))
    await update($, S.activity, a => ({ ...a, lastActiveAt: now }))
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
    await update($, S.spend, () => spendFrom(e))
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
    if (usage !== null) await update($, S.cache, c => afterResponse(c, sentAt, usage))
    $.clock.after(0, () => void refreshTasks($))
    return result
  })

  // A model switch says the TTL outright, and the new model starts with nothing cached.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await update($, S.cache, c => ({ ...withEngineTtl(c, e.cache_ttl), lastRequestAt: null, model: e.to_model }))
    return next(e)
  })

  // A resumed session's cache is as warm as its last response is recent.
  on('classic.SessionStart', async ($, e, next) => {
    const seconds = e.seconds_since_last_response
    if (seconds !== undefined) {
      const at = (await $.clock.now()) - seconds * 1_000
      await update($, S.cache, c => (c.lastRequestAt === null ? resumed(c, at, e.context_tokens ?? 0, e.model ?? null) : c))
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, S.activity, a => started(a, now))
      $.clock.after(0, () => void animate($))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, S.activity, a => completed(a, now))
      $.clock.after(0, () => void afterTurn($))
    }
    return next(e)
  })

  // Typing wakes the claw; at most one write a second.
  on('prompt.edit', async ($, e, next) => {
    const now = await $.clock.now()
    if (now - (await read($, S.activity)).lastActiveAt >= 1_000) await update($, S.activity, a => typed(a, now))
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
    await update($, S.outputs, rows => recordEdit(rows, facts, now, agent))
    await update($, S.activity, a => saved(a, now))
    changesSoon.request(() => refreshChanges($), (ms, fn) => $.clock.after(ms, fn))
    return ran
  }).catch(($, e, next) => next(e))

  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (e.key === 'theme') await update($, S.view, v => ({ ...v, theme: themeOf(e.value) }))
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
        {paneCards(kit, data, { showCharacter: settings.character, refreshMs: settings.refreshMs })}
      </Box>
    )
  })
}

function actionsFor($: EngineInterface, surface: RenderSurface): Actions {
  return {
    toggle: id => void toggle($, id),
    open: (path, line) => void openFile($, path, line, settings.zedPath, surface),
    refreshUsage: () => void refreshUsage($, true),
    exactContext: () => void refreshContext($, 'full'),
    toggleAllOutputs: () => void update($, S.view, v => ({ ...v, showAllOutputs: !v.showAllOutputs })),
  }
}

/** Folds or unfolds a card, and keeps the folded set for the next session. */
async function toggle($: EngineInterface, id: string): Promise<void> {
  await update($, S.view, v => ({
    ...v,
    collapsed: v.collapsed.includes(id) ? v.collapsed.filter(other => other !== id) : [...v.collapsed, id],
  }))
  await $.store.set('collapsed', (await read($, S.view)).collapsed)
}

async function restoreView($: EngineInterface): Promise<void> {
  const stored = await $.store.get('collapsed')
  const collapsed = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : S.DEFAULT_COLLAPSED
  const rows = await $.config.list().catch(() => [])
  const theme = themeOf(rows.find(row => row.key === 'theme')?.value)
  const mode = await detectMode($, settings.graphics)
  await update($, S.view, v => ({ ...v, collapsed, theme, mode }))
}

/** The machine's zone, so "today" and reset times are local: `date +%z`, as ccusage itself reads it. */
async function readZone($: EngineInterface): Promise<void> {
  try {
    const { stdout } = await $.process.run(['date', '+%z'], { timeoutMs: 5_000 })
    const tzOffsetMin = parseOffset(stdout)
    await update($, S.place, place => ({ ...place, tzOffsetMin }))
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
  const { lastStartedAt } = await read($, S.ccusage)
  const now = await $.clock.now()
  if (!isForced && lastStartedAt !== null && now - lastStartedAt < AFTER_TURN_GAP_MS) return
  await refreshCcusage($, settings.ccusageCommand)
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
  await update($, S.tasks, prev => {
    const next = tasksFrom(list, prev, now)
    finishedNow = next.finishedNow
    return next.state
  })
  if (finishedNow > 0) await update($, S.activity, a => celebrate(a, now))
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
    await update($, S.now, () => now)
  }
  if ((await read($, S.tasks)).running.length > 0 && ticks % 2 === 0) await refreshTasks($)
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
  animator.set($, list)
}
```

- [ ] **Step 9: Run the tests and type-check**

Run: `claude plugin test claude-vitals`
Expected: PASS, including the 6 pane tests.

Run: `npx -y -p typescript@5 tsc -p claude-vitals`
Expected: no output, exit 0.

Run: `claude plugin validate claude-vitals`
Expected: `✔ Validation passed`. The hook list includes `tool.call` (`gating hook with .catch`), `config.set`, `ui.render{component=Pane, requestId=vitals}` and `ui.render{component=AbovePrompt}`. The env reads are `HOME, TERM, KITTY_WINDOW_ID, TERM_PROGRAM, TMUX`.

- [ ] **Step 10: Commit**

```bash
git add claude-vitals
git commit -m "claude-vitals: wire the hooks, draw the header and the Cache card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The Context card

**Files:**
- Create: `claude-vitals/hooks/cards/context.tsx`
- Modify: `claude-vitals/hooks/pane.tsx` (import and draw the card)
- Test: `claude-vitals/tests/context-card.test.ts`

**Interfaces:**
- Consumes:
  - **From `pictures.ts`:** `ringPicture`, `RING_COLUMNS`
  - **From `sources/context.ts`:** `splitRows`, `barRuns`
  - **From `palette.ts`:** `categoryColor`, `heat`
  - **From `kit.tsx`:** `card`, `line`, `text`, `dim`, `picture`, `isOpen`
- Produces: `contextCard(kit, c: ContextState): RenderElement`. Its keys are `toggle-deferred`, `exact` (the `f` hotkey) and `ring`.

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/context-card.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { HOME, usageFixture } from './fixtures'
import { measure, mountPane, paneText, start, world } from './world'

describe('the Context card', () => {
  test('lists each category with its tokens and share, and keeps the deferred tools folded', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const text = await paneText($)
    for (const part of ['14%', '141.6k / 1M', 'Messages', '83.6k', '8.4%', 'Free space', '824.9k', '82.5%', 'estimate']) {
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. No Context card is drawn yet.

- [ ] **Step 3: Write cards/context.tsx**

`claude-vitals/hooks/cards/context.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import type { ContextRow, ContextState } from '../../types'
import { clipEnd, share, tokens } from '../format'
import { categoryColor, heat } from '../graphics/palette'
import { ringPicture } from '../graphics/pictures'
import { barRuns, splitRows } from '../sources/context'
import { card, dim, isOpen, line, picture, text } from './kit'
import type { Kit } from './kit'

function percentColor(kit: Kit, percent: number): string {
  return percent >= 80 ? heat(kit.pal, 0.5 + Math.min(1, (percent - 80) / 20) * 0.5) : kit.pal.text
}

function contextBar(kit: Kit, rows: readonly ContextRow[], window: number): RenderElement {
  const { Text } = kit.ui
  return (
    <Text>
      {barRuns(rows, window, kit.width).map(run => (
        <Text color={categoryColor(kit.pal, run.row)}>{'━'.repeat(run.cells)}</Text>
      ))}
    </Text>
  )
}

export function contextCard(kit: Kit, c: ContextState): RenderElement {
  const { pal } = kit
  return card(kit, 'context', 'Context', pal.blue, open => {
    if (!open) return []
    if (c.percent === null || c.window === null) return [dim(kit, '– waiting for the first response')]
    const { Box, Button, Text } = kit.ui
    const percent = Math.round(c.percent)
    const used = `${tokens(c.tokens ?? 0)} / ${tokens(c.window)}`
    const count = c.isExact ? 'exact' : 'estimate'
    const rows: RenderElement[] = []

    if (c.rows !== null && kit.mode === 'pixels') {
      const ring = ringPicture(c.rows, c.window, pal, `${percent}% of the context window used`)
      rows.push(
        <Box key="ctx-top" flexDirection="row" columnGap={2}>
          {picture(kit, ring)}
          <Box flexDirection="column" justifyContent="center">
            {text(kit, `${percent}% used`, percentColor(kit, percent), true)}
            {text(kit, used)}
            {dim(kit, count)}
          </Box>
        </Box>,
      )
    } else {
      rows.push(line(kit, 'ctx-head', [text(kit, `${percent}%`, percentColor(kit, percent), true), dim(kit, ' used')], [text(kit, used)]))
      if (c.rows !== null) rows.push(contextBar(kit, c.rows, c.window))
    }

    if (c.rows !== null) {
      const { shown, deferred } = splitRows(c.rows)
      for (const row of shown) {
        rows.push(
          line(
            kit,
            `ctx-${row.name}`,
            [text(kit, row.kind === 'free' ? '□ ' : '■ ', categoryColor(pal, row)), text(kit, clipEnd(row.name, kit.width - 18))],
            [text(kit, tokens(row.tokens).padStart(7)), dim(kit, share(row.tokens, c.window).padStart(7))],
          ),
        )
      }
      if (deferred.length > 0) {
        const isShown = isOpen(kit, 'deferred')
        const total = deferred.reduce((sum, row) => sum + row.tokens, 0)
        rows.push(
          <Button key="toggle-deferred" plain onPress={() => kit.actions.toggle('deferred')}>
            <Text color={pal.dim}>{`${isShown ? '⌄' : '›'} deferred tools ${tokens(total)}`}</Text>
          </Button>,
        )
        if (isShown) {
          for (const row of deferred) rows.push(line(kit, `ctx-deferred-${row.name}`, [dim(kit, `  ${row.name}`)], [dim(kit, tokens(row.tokens))]))
        }
      }
    }

    const hasCountShown = c.rows !== null && kit.mode === 'pixels'
    rows.push(
      line(
        kit,
        'ctx-foot',
        [<Button key="exact" hotkey="f" plain label="exact count" onPress={() => kit.actions.exactContext()} />],
        hasCountShown ? [] : [dim(kit, count)],
      ),
    )
    return rows
  })
}
```

- [ ] **Step 4: Draw it in the pane**

In `claude-vitals/hooks/pane.tsx`, add the import after `import { cacheCard } from './cards/cache'`:

```ts
import { contextCard } from './cards/context'
```

In `paneCards`, add after `cacheCard(kit, cacheView(d.cache, d.now)),`:

```ts
    contextCard(kit, d.context),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/cards/context.tsx claude-vitals/hooks/pane.tsx claude-vitals/tests/context-card.test.ts
git commit -m "claude-vitals: the Context card — ring or bar, legend, deferred tools, exact count" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The Usage card

**Files:**
- Create: `claude-vitals/hooks/cards/usage.tsx`
- Modify: `claude-vitals/hooks/pane.tsx`
- Test: `claude-vitals/tests/usage.test.ts`

**Interfaces:**
- Consumes:
  - **From `format.ts`:** `money`, `span`, `resetLabel`, `sparkline`, `ago`, `padEnd`
  - **From `pictures.ts`:** `sparkPicture`, `limitPill`
  - **From `palette.ts`:** `familyColor`, `heat`
  - **From `mood.ts`:** `limitName`
- Produces:
  - `type UsageData = { spend; cc; now; tzOffsetMin; refreshMs }`
  - `usageCard(kit, d): RenderElement`. Its keys are `refresh` (the `r` hotkey), `retry`, `spark` and `limit-<kind>`.

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/usage.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'

import { usageFixture } from './fixtures'
import { mountPane, paneText, start, turnComplete, turnStart, world } from './world'

const dailyRuns = (runs: string[][]) => runs.filter(run => run[0] === 'ccusage' && run.includes('daily')).length

describe('the Usage card', () => {
  test('shows the session, today by model, the 5-hour block and the limits', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    const text = await paneText($)
    for (const part of ['$4.12', '$38.90', 'Opus $31.20', 'Sonnet $6.10', 'Haiku $1.60', '2h14m', '$9.80/h', '~$61.00', 'Limit 5h', '46%', '17:00', 'Limit 7d', '22%', 'Mon']) {
      expect(text).toContain(part)
    }
    expect(seen.runs).toContainEqual(['ccusage', 'claude', 'daily', '--json', '--breakdown', '--offline', '--since', '20261015'])
    expect(seen.runs).toContainEqual(['ccusage', 'claude', 'blocks', '--active', '--json', '--offline'])
  })

  test('without ccusage it says how to get it, keeps the engine’s figures, and Retry tries again', async ($, on) => {
    const { clock, answers } = world(on)
    answers.ccusage = 'missing'
    await start($, clock)
    const text = await paneText($)
    expect(text).toContain('ccusage not found · npm i -g ccusage')
    expect(text).toContain('$4.12')
    expect(text).toContain('Limit 5h')

    answers.ccusage = 'ok'
    const ui = await mountPane($)
    await ui.press({ key: 'retry' })
    await ui.unmount()
    expect(await paneText($)).toContain('$38.90')
  })

  test('a failing ccusage shows its first error line', async ($, on) => {
    const { clock, answers } = world(on)
    answers.ccusage = 'failed'
    await start($, clock)
    expect(await paneText($)).toContain('ccusage failed: Error: no usage data found')
  })

  test('on an API key there are no limit rows', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ limits: [] })
    await start($, clock)
    expect(await paneText($)).not.toContain('Limit 5h')
  })

  test('after a turn ccusage runs again only once 30 seconds have passed; r runs it at once', async ($, on) => {
    const { clock, seen } = world(on)
    await start($, clock)
    expect(dailyRuns(seen.runs)).toBe(1)

    await turnStart($)
    await turnComplete($)
    await clock.advance(10)
    expect(dailyRuns(seen.runs)).toBe(1)

    await clock.advance(30_000)
    await turnStart($, 't2')
    await turnComplete($, 't2')
    await clock.advance(10)
    expect(dailyRuns(seen.runs)).toBe(2)

    const ui = await mountPane($)
    await ui.press({ key: 'refresh' })
    await ui.unmount()
    expect(dailyRuns(seen.runs)).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. No Usage card is drawn yet.

- [ ] **Step 3: Write cards/usage.tsx**

`claude-vitals/hooks/cards/usage.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import type { CcusageState, SpendState } from '../../types'
import { ago, money, padEnd, resetLabel, span, sparkline } from '../format'
import { familyColor, heat } from '../graphics/palette'
import { limitPill, sparkPicture } from '../graphics/pictures'
import { limitName } from '../mood'
import { card, cellBar, dim, line, picture, text } from './kit'
import type { Kit } from './kit'

export type UsageData = { spend: SpendState; cc: CcusageState; now: number; tzOffsetMin: number; refreshMs: number }

function limitLabel(kind: string): string {
  return kind === 'spend_limit' ? 'Spend limit' : `Limit ${limitName(kind)}`
}

function footer(kit: Kit, d: UsageData): RenderElement {
  const { Box, Button } = kit.ui
  const refresh = <Button key="refresh" hotkey="r" plain label="refresh" onPress={() => kit.actions.refreshUsage()} />
  if (d.cc.status === 'missing' || d.cc.status === 'failed') {
    const message = d.cc.status === 'missing' ? 'ccusage not found · npm i -g ccusage' : `ccusage failed: ${d.cc.error ?? 'unknown error'}`
    return (
      <Box key="use-foot" flexDirection="column">
        {dim(kit, message)}
        <Box flexDirection="row" columnGap={2}>
          <Button key="retry" label="Retry" onPress={() => kit.actions.refreshUsage()} />
          {refresh}
        </Box>
      </Box>
    )
  }
  const isReading = d.cc.status === 'running' && d.cc.updatedAt === null
  const isStale = d.cc.updatedAt !== null && d.now - d.cc.updatedAt > d.refreshMs
  const note = isReading ? 'reading ccusage…' : isStale && d.cc.updatedAt !== null ? `updated ${ago(d.now - d.cc.updatedAt)}` : null
  return line(kit, 'use-foot', [refresh], note === null ? [] : [dim(kit, note)])
}

export function usageCard(kit: Kit, d: UsageData): RenderElement {
  const { pal } = kit
  return card(kit, 'usage', 'Usage', pal.amber, open => {
    if (!open) return []
    const { Box, Text } = kit.ui
    const rows: RenderElement[] = [
      line(kit, 'use-session', [dim(kit, 'Session  '), text(kit, d.spend.sessionUsd === null ? '–' : money(d.spend.sessionUsd), pal.text, true)]),
    ]
    const today = d.cc.today
    if (today !== null) {
      const spark = kit.mode === 'pixels' ? [picture(kit, sparkPicture(pal, d.cc.week))] : [text(kit, sparkline(d.cc.week), pal.amber), dim(kit, ' 7d')]
      rows.push(line(kit, 'use-today', [dim(kit, 'Today    '), text(kit, money(today.usd), pal.amber, true)], spark))
      if (today.byModel.length > 0) {
        rows.push(
          <Box key="use-models" flexDirection="row" flexWrap="wrap" columnGap={1}>
            {today.byModel.map(spend => (
              <Text>
                <Text color={familyColor(pal, spend.family)}>● </Text>
                <Text color={pal.text}>{`${spend.family} ${money(spend.usd)}`}</Text>
              </Text>
            ))}
          </Box>,
        )
      }
    }
    const block = d.cc.block
    if (block !== null && block.endsAt > d.now) {
      rows.push(
        line(kit, 'use-block', [
          dim(kit, '5h block '),
          text(kit, span(block.endsAt - d.now), pal.text, true),
          dim(kit, ` left · ${money(block.costPerHour)}/h → `),
          text(kit, `~${money(block.projectedUsd)}`, pal.amber, true),
        ]),
      )
    }
    for (const limit of d.spend.limits) {
      const percent = limit.percentUsed
      const meter =
        kit.mode === 'pixels' ? picture(kit, limitPill(pal, limit.kind, percent)) : cellBar(kit, percent / 100, 10, cell => heat(pal, cell / 9))
      rows.push(
        line(
          kit,
          `use-limit-${limit.kind}`,
          [dim(kit, padEnd(limitLabel(limit.kind), 10)), meter, text(kit, ` ${Math.round(percent)}%`, heat(pal, Math.min(1, percent / 100)), true)],
          limit.resetsAt === null ? [] : [dim(kit, resetLabel(limit.resetsAt, d.now, d.tzOffsetMin))],
        ),
      )
    }
    rows.push(footer(kit, d))
    return rows
  })
}
```

- [ ] **Step 4: Draw it in the pane**

In `claude-vitals/hooks/pane.tsx`, add the import after the `contextCard` import:

```ts
import { usageCard } from './cards/usage'
```

In `paneCards`, add after `contextCard(kit, d.context),`:

```ts
    usageCard(kit, { spend: d.spend, cc: d.ccusage, now: d.now, tzOffsetMin: d.place.tzOffsetMin, refreshMs: s.refreshMs }),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/cards/usage.tsx claude-vitals/hooks/pane.tsx claude-vitals/tests/usage.test.ts
git commit -m "claude-vitals: the Usage card — session, today, 5-hour block, limits, ccusage failures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The Outputs and Changes cards

**Files:**
- Create: `claude-vitals/hooks/cards/files.tsx`
- Modify: `claude-vitals/hooks/pane.tsx`
- Test: `claude-vitals/tests/outputs.test.ts`

**Interfaces:**
- Consumes:
  - **From `format.ts`:** `displayPath`, `clipStart`, `padEnd`, `count`
  - **From `kit.tsx`:** `card`, `line`, `text`, `dim`
- Produces:
  - `type FilesData = { outputs; showAll; changes; cwd; home }`
  - `outputsCard(kit, d)`
  - `changesCard(kit, d)`
  - **Keys:** `out:<path>` (row box), `out-open:<path>` (row button), `more-outputs`, `chg:<path>`, `chg-open:<path>`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/outputs.test.ts`:

```ts
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
    expect(seen.toasts).toEqual(['Zed not found: set its path in claude-vitals settings'])
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. No Outputs or Changes card is drawn yet.

- [ ] **Step 3: Write cards/files.tsx**

`claude-vitals/hooks/cards/files.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import type { ChangesState, OutputRow } from '../../types'
import { clipStart, count, displayPath, padEnd } from '../format'
import { card, dim, line, text } from './kit'
import type { Kit } from './kit'

export type FilesData = { outputs: OutputRow[]; showAll: boolean; changes: ChangesState; cwd: string; home: string | null }

const SHOWN = 5

type FileLike = { path: string; added: number; removed: number; line: number; agent?: string | null; isDeleted?: boolean }

/** One file: its path clipped from the start to fit, its counts at the end; a press opens it in Zed. */
function fileRow(kit: Kit, prefix: 'out' | 'chg', row: FileLike, cwd: string, home: string | null): RenderElement {
  const { Box, Button, Text } = kit.ui
  const { pal } = kit
  const added = row.added > 0 ? `+${count(row.added)}` : ''
  const removed = row.removed > 0 ? `−${count(row.removed)}` : ''
  const counts = [added, removed].filter(part => part !== '').join(' ')
  const agent = row.agent ? `  ${row.agent}` : ''
  const deleted = row.isDeleted === true ? '  deleted' : ''
  const room = Math.max(8, kit.width - [...counts].length - [...agent].length - [...deleted].length - 1)
  const name = padEnd(clipStart(displayPath(row.path, cwd, home), room), room)

  if (row.isDeleted === true) {
    return (
      <Box key={`${prefix}:${row.path}`} flexDirection="row">
        <Text color={pal.dim} strikethrough>
          {name}
        </Text>
        <Text color={pal.dim}>{deleted}</Text>
      </Box>
    )
  }

  const parts: RenderElement[] = [<Text color={pal.text}>{name}</Text>]
  if (agent !== '') parts.push(<Text color={pal.dim}>{agent}</Text>)
  parts.push(<Text> </Text>)
  if (added !== '') parts.push(<Text color={pal.green}>{added}</Text>)
  if (added !== '' && removed !== '') parts.push(<Text> </Text>)
  if (removed !== '') parts.push(<Text color={pal.red}>{removed}</Text>)
  return (
    <Box key={`${prefix}:${row.path}`} flexDirection="row" hover={{ backgroundColor: pal.selection }}>
      <Button key={`${prefix}-open:${row.path}`} plain onPress={() => kit.actions.open(row.path, row.line)}>
        {parts}
      </Button>
    </Box>
  )
}

export function outputsCard(kit: Kit, d: FilesData): RenderElement {
  const { pal } = kit
  return card(kit, 'outputs', 'Outputs', pal.green, open => {
    if (!open) return []
    if (d.outputs.length === 0) return [dim(kit, 'No files edited yet')]
    const shown = d.showAll ? d.outputs : d.outputs.slice(0, SHOWN)
    const rows = shown.map(row => fileRow(kit, 'out', row, d.cwd, d.home))
    if (d.outputs.length > SHOWN) {
      const { Button, Text } = kit.ui
      rows.push(
        <Button key="more-outputs" plain onPress={() => kit.actions.toggleAllOutputs()}>
          <Text color={pal.blue}>{d.showAll ? 'Show fewer' : `Show ${d.outputs.length - SHOWN} more`}</Text>
        </Button>,
      )
    }
    return rows
  })
}

export function changesCard(kit: Kit, d: FilesData): RenderElement {
  const { pal } = kit
  const c = d.changes
  return card(kit, 'changes', 'Changes', pal.violet, open => {
    if (c.status === 'not-git') return [dim(kit, 'not a git repo')]
    if (c.status === 'timeout') return [dim(kit, 'git timed out')]
    if (c.status === 'pending') return [dim(kit, '–')]
    if (c.files.length === 0) return [dim(kit, 'No uncommitted changes')]
    const added = c.files.reduce((sum, file) => sum + file.added, 0)
    const removed = c.files.reduce((sum, file) => sum + file.removed, 0)
    const summary = line(
      kit,
      'chg-summary',
      [dim(kit, '± '), text(kit, count(c.files.length), pal.text, true), dim(kit, c.files.length === 1 ? ' file uncommitted' : ' files uncommitted')],
      [text(kit, `+${count(added)}`, pal.green), text(kit, ` −${count(removed)}`, pal.red)],
    )
    return [summary, ...(open ? c.files.map(file => fileRow(kit, 'chg', file, d.cwd, d.home)) : [])]
  })
}
```

- [ ] **Step 4: Draw them in the pane**

In `claude-vitals/hooks/pane.tsx`, add the import after the `usageCard` import:

```ts
import { changesCard, outputsCard } from './cards/files'
```

In `paneCards`, add after the `usageCard(...)` entry:

```ts
    outputsCard(kit, { outputs: d.outputs, showAll: d.view.showAllOutputs, changes: d.changes, cwd: d.place.cwd, home: d.place.home }),
    changesCard(kit, { outputs: d.outputs, showAll: d.view.showAllOutputs, changes: d.changes, cwd: d.place.cwd, home: d.place.home }),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/cards/files.tsx claude-vitals/hooks/pane.tsx claude-vitals/tests/outputs.test.ts
git commit -m "claude-vitals: the Outputs and Changes cards, each file opening in Zed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: The Background tasks card and the claw's moods

**Files:**
- Create: `claude-vitals/hooks/cards/tasks.tsx`
- Modify: `claude-vitals/hooks/pane.tsx`
- Test: `claude-vitals/tests/character.test.ts`

**Interfaces:**
- Consumes:
  - **From `format.ts`:** `clipEnd`, `count`, `span`
  - **From `kit.tsx`:** `card`, `line`, `text`, `dim`
  - **Already wired in Task 11:** the mood is drawn by `headerCard` through `paneCards`. These tests drive it end to end.
- Produces: `tasksCard(kit, t: TasksState, now: number): RenderElement`

- [ ] **Step 1: Write the failing tests**

`claude-vitals/tests/character.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { paletteFor } from '../hooks/graphics/palette'
import { frameAt, spriteCells } from '../hooks/graphics/sprite'
import type { Mood } from '../hooks/mood'
import { CWD, usageFixture } from './fixtures'
import { edit, mountPane, paneText, request, start, turnComplete, turnStart, type, world } from './world'

const MINUTE = 60_000

/** The claw's cells as the pane draws them now. */
async function clawCells($: Engine): Promise<unknown> {
  const ui = await mountPane($)
  const found = await ui.find({ key: 'character' })
  await ui.unmount()
  return found?.props.cells
}

const drawn = (mood: Mood, ms: number) => spriteCells(frameAt(mood, ms))

describe('background tasks', () => {
  test('a running task shows what it does and for how long; finished ones are counted', async ($, on) => {
    const { clock, answers } = world(on)
    answers.agents = [{ id: 'a1', description: 'Fable review of transfer', type: 'general-purpose', status: 'running' }]
    await start($, clock)
    await clock.advance(81_000)
    const running = await paneText($)
    expect(running).toContain('Fable review of transfer')
    expect(running).toContain('1m 21s')

    answers.agents = [{ id: 'a1', description: 'Fable review of transfer', type: 'general-purpose', status: 'completed' }]
    await clock.advance(2_000)
    expect(await paneText($)).toContain('◇ 1 finished')
  })

  test('with none it says so', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    expect(await paneText($)).toContain('No background tasks')
  })
})

describe('the claw', () => {
  test('works while a turn runs', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await turnStart($)
    expect(await paneText($)).toContain('working')
    expect(await clawCells($)).toBe(drawn('working', clock.now()))
  })

  test('frosts over once the cache goes cold', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await request($)
    await clock.advance(61 * MINUTE)
    expect(await paneText($)).toContain('cache cold')
    expect(await clawCells($)).toBe(drawn('cold', clock.now()))
  })

  test('sweats when the context passes 80%', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ percent: 84 })
    await start($, clock)
    expect(await paneText($)).toContain('context 84%')
  })

  test('sweats at a limit too, and says which', async ($, on) => {
    const { clock, answers } = world(on)
    answers.usage = usageFixture({ limits: [{ kind: 'five_hour', percentUsed: 91, resetsAt: '2026-10-21T16:00:00Z' }] })
    await start($, clock)
    expect(await paneText($)).toContain('limit 5h 91%')
  })

  test('celebrates a turn that saved a file, for four seconds', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await turnStart($)
    await edit($, `${CWD}/hooks/a.ts`)
    await turnComplete($)
    await clock.advance(10)
    expect(await clawCells($)).toBe(drawn('celebrating', clock.now()))
    await clock.advance(5_000)
    expect(await clawCells($)).toBe(drawn('content', clock.now()))
  })

  test('falls asleep after ten idle minutes and wakes when you type', async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    await clock.advance(10 * MINUTE)
    expect(await paneText($)).toContain('asleep')
    await type($, 'h')
    expect(await paneText($)).not.toContain('asleep')
  })

  test('the light theme draws the light palette', async ($, on) => {
    const { clock, answers } = world(on)
    answers.theme = 'light'
    await start($, clock)
    const ui = await mountPane($)
    expect((await ui.find({ key: 'card-header' }))?.props.backgroundColor).toBe(paletteFor('light').card)
    await ui.unmount()
  })

  test('with the claw turned off the header is text alone', { options: { character: false } }, async ($, on) => {
    const { clock } = world(on)
    await start($, clock)
    const ui = await mountPane($)
    expect(await ui.find({ key: 'character' })).toBeUndefined()
    await ui.unmount()
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test claude-vitals`
Expected: FAIL. The background-tasks assertions fail because no tasks card is drawn. The claw tests already pass: the header and moods were wired in Task 11.

- [ ] **Step 3: Write cards/tasks.tsx**

`claude-vitals/hooks/cards/tasks.tsx`:

```tsx
import type { RenderElement } from 'claude-code'

import type { TasksState } from '../../types'
import { clipEnd, count, span } from '../format'
import { card, dim, line, text } from './kit'
import type { Kit } from './kit'

const SPINNER = [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏']

export function tasksCard(kit: Kit, t: TasksState, now: number): RenderElement {
  const { pal } = kit
  return card(kit, 'tasks', 'Background tasks', pal.violet, open => {
    if (!open) return []
    if (t.running.length === 0 && t.finished === 0) return [dim(kit, 'No background tasks')]
    const spin = SPINNER[Math.floor(now / 1_000) % SPINNER.length] ?? '◇'
    const rows = t.running.map(task =>
      line(
        kit,
        `task-${task.id}`,
        [text(kit, `${spin} `, pal.violet), text(kit, clipEnd(task.description, kit.width - 12))],
        [dim(kit, span(now - task.firstSeenAt))],
      ),
    )
    if (t.finished > 0) rows.push(dim(kit, `◇ ${count(t.finished)} finished`))
    return rows
  })
}
```

- [ ] **Step 4: Draw it in the pane**

In `claude-vitals/hooks/pane.tsx`, add the import after the `./cards/files` import:

```ts
import { tasksCard } from './cards/tasks'
```

In `paneCards`, add after the `changesCard(...)` entry:

```ts
    tasksCard(kit, d.tasks, d.now),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `claude plugin test claude-vitals`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add claude-vitals/hooks/cards/tasks.tsx claude-vitals/hooks/pane.tsx claude-vitals/tests/character.test.ts
git commit -m "claude-vitals: the Background tasks card; the claw's moods end to end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Animation

The animator and its wiring went in with Tasks 10 and 11. This task pins down their behaviour. Fix whatever these tests expose, in `hooks/graphics/animator.ts` or in `animate()` in `hooks/register.tsx`.

**Files:**
- Test: `claude-vitals/tests/animation.test.ts`
- Modify only if a test fails: `claude-vitals/hooks/graphics/animator.ts`, `claude-vitals/hooks/register.tsx` (`animate`, `tick`)

**Interfaces:**
- Consumes: `Animator` (Task 10). `animate($, shown?)` and `tick($)` in `register.tsx` (Task 11). The world records each `$.ui.blit` key in `seen.blits`.

- [ ] **Step 1: Write the tests**

`claude-vitals/tests/animation.test.ts`:

```ts
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
    await $.command.run({ command: 'vitals' })
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
```

- [ ] **Step 2: Run them**

Run: `claude plugin test claude-vitals`
Expected: PASS. If one fails, read the failure before changing anything:
- **No blits at all:** `site.isDocked` was never set. The pane must be mounted before the tick that calls `animate`.
- **Blits after closing:** `tick` must call `animate($, false)` once `isShown` is false, which stops the animator.

Fix the cause, then run again.

- [ ] **Step 3: Commit**

```bash
git add claude-vitals/tests/animation.test.ts claude-vitals/hooks
git commit -m "claude-vitals: pin down the claw and cache-bar animations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Layout — auto-open, inline and other surfaces, folding, narrow widths

The behaviour was wired in Task 11. This task pins it down, including Review Focus 5.

**Files:**
- Test: `claude-vitals/tests/layout.test.ts`
- Modify only if a test fails: `claude-vitals/hooks/register.tsx`, `claude-vitals/hooks/cards/*.tsx`

**Interfaces:**
- Consumes:
  - **From `tests/world.ts`:** `BAND_PROPS`, `PLUGIN`, `mountPane`, `paneText`
  - **Keys:** `card-cache`, `toggle-cache`, `cache-pill`
  - **Store key:** `collapsed`

- [ ] **Step 1: Write the tests**

`claude-vitals/tests/layout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them**

Run: `claude plugin test claude-vitals`
Expected: PASS. If the auto-open tests interfere with each other, the test kit kept the module, and with it `autoOpenTried`, between tests. In that case move the flag into a `$.state` atom (`opened`, boolean, declared in `types/index.d.ts`), written from a `$.clock.after(0, …)` the render schedules, and run again.

- [ ] **Step 3: Commit**

```bash
git add claude-vitals/tests/layout.test.ts claude-vitals/hooks claude-vitals/types
git commit -m "claude-vitals: pin down opening, compact views, folding and narrow widths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Marketplace entry, full checks and the live run

**Files:**
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: List the mod in the marketplace**

Replace `.claude-plugin/marketplace.json` with:

```json
{
  "name": "mods",
  "owner": { "name": "Andy Floyd" },
  "plugins": [
    {
      "name": "cache-countdown",
      "source": "./cache-countdown",
      "description": "Counts down to the prompt cache going cold, warns before it does, and when it has, offers to send with full context or compress the session first."
    },
    {
      "name": "claude-vitals",
      "source": "./claude-vitals",
      "description": "A live sidebar of the session's vitals: prompt cache, context, spend and today's usage, edited files to open in Zed, background tasks, and a pixel claw that reacts to it all."
    }
  ]
}
```

- [ ] **Step 2: Run every check**

Run: `claude plugin test claude-vitals`
Expected: every suite passes: format, graphics, mood, cache, context, ccusage, files, sources, editor, pictures, pane, context-card, usage, outputs, character, animation, layout.

Run: `claude plugin validate claude-vitals`
Expected: `✔ Validation passed`. A warning-free run is expected, since the manifest names its author.

Run: `npx -y -p typescript@5 tsc -p claude-vitals`
Expected: no output, exit 0.

Run: `claude plugin test cache-countdown`
Expected: 21 pass. The other mod is untouched.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "Add claude-vitals to the mods marketplace" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Live run in kitty (with Andy)**

These steps need Andy's machine and eyes. Ask before installing anything globally.

1. ccusage:
   - Either Andy runs `npm i -g ccusage`.
   - Or set the mod's `ccusageCommand` to `npx -y ccusage@20` in the `/config` menu. The first run is slower while npx fetches it.
2. Open kitty, make the window at least 160 columns wide, then start Claude Code with the mod: `claude --plugin-dir ./claude-vitals --debug`.
   - `~/.claude/settings.json` already has `"tui": "fullscreen"`, so the pane docks.
   - The engine now lays this build's types in `claude-vitals/.claude-plugin/types/`. Re-run `npx -y -p typescript@5 tsc -p claude-vitals` against them.
3. Check each of these and note any that fail:
   - The sidebar opens by itself, docked on the right.
   - The claw and the context ring are sharp pictures, not blurry and not alt text.
   - After the first reply, the Cache card counts down once a second and the pill shimmers.
   - While Claude works, the claw clacks. After a turn that edits a file, it sparkles.
   - Clicking an Outputs row opens Zed at the changed line.
   - Changes unfolds, and its rows open in Zed.
   - Usage shows today's spend, the 7-day chart and the per-model line.
   - `r` refreshes Usage (focus the pane first).
   - `f` gives the exact context count.
   - `/vitals` closes the sidebar, and `/vitals` opens it again.
   - Run `/theme`, pick a light theme, and the palette follows.
   - Make the window narrow (under 110 columns): the sidebar falls back to one line above the prompt.
4. If the character looks blurry (spec assumption 8), switch the header to the half-block `Raster` in pixel mode too. In `hooks/cards/header.tsx`, drop the `kit.mode === 'pixels'` branch. In `animate()`, always use the `raster` blit. Re-run the tests.
5. Ghostty is not installed here. When Andy installs it, repeat step 3 in Ghostty.
