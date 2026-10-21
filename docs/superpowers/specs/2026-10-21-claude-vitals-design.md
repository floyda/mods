# claude-vitals — design

Date: 2026-10-21 · Status: approved in conversation, awaiting written-spec review

## Intent

A Claude Code mod that draws a live sidebar beside the conversation, styled after the Claude Code Desktop app's session panel (rounded, collapsible cards; a stacked, colour-keyed context bar with a legend). It shows, for the current session: prompt-cache state, context-window use by category, session spend, today's usage across all sessions (via ccusage), the files Claude edited and the repo's uncommitted changes (each openable in Zed at the changed line), and background tasks.

It must work under Ghostty and kitty. It does so by being drawn by Claude Code itself (a docked `Pane`), not by scripting either terminal.

### Decisions made while brainstorming

| Question | Decision |
|---|---|
| Billing | Both subscription and API key: show plan-limit bars when the engine reports them, always show dollars |
| Editor | Zed only |
| Files | Two cards: **Outputs** (Claude's edits this session) and **Changes** (repo `git diff`) |
| Usage beyond the session | Today's total across all sessions, current 5-hour block burn rate, 7-day sparkline, per-model split today |
| Placement | Native docked pane inside Claude Code (needs the fullscreen layout, ≥110 columns) |
| Cards | All of: header, Cache, Context, Usage, Outputs, Changes, Background tasks |
| Name | `claude-vitals`; command `/vitals` |

### Non-goals

- No separate TUI process, terminal splits, kitty remote control or Ghostty AppleScript.
- No dashboard across several live sessions (only "today" figures span sessions, via ccusage).
- No keep-warm pings or automatic cache refreshing (the user's standing decision; see cache-countdown).
- No editors other than Zed.
- No stopping of background tasks: the mod API has no call for it (`$.turn.abort` takes only a `turnId`).
- No dependency on cache-countdown: either mod runs without the other.

## Layout

A stack of rounded cards (`Box` with `borderStyle: 'round'`), docked right, about 46 columns wide. Every card except the header collapses from its title row (chevron `⌄` / `›`); the collapsed set persists across sessions.

```
╭─────────────────────────────────────────────╮
│ Opus 5.5 · main · ~/Workspace/mods          │
╰─────────────────────────────────────────────╯
╭─ Cache ⌄ ───────────────────────────────────╮
│ ● warm                          cold in 52:10│
│ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱   1h TTL · hit 94%    │
│ next turn  $0.07 warm  ·  $1.40 if cold     │
╰─────────────────────────────────────────────╯
╭─ Context ⌄ ─────────────────────────────────╮
│ 14% used                       141.6k / 1M  │
│ ████▆▆▅░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ■ Messages               83.6k     8.4%     │
│ ■ Memory files           30.0k     3.0%     │
│ ■ System tools           16.7k     1.7%     │
│ ■ Skills                  7.9k     0.8%     │
│ ■ Autocompact buffer     33.0k     3.3%     │
│ □ Free space            824.9k    82.5%     │
│ › MCP tools 72 · deferred 38.3k             │
╰─────────────────────────────────────────────╯
╭─ Usage ⌄ ───────────────────────────────────╮
│ Session   $4.12                             │
│ Today     $38.90         ▁▃▂▅▇▄█  last 7d   │
│   Opus $31.20 · Sonnet $6.10 · Haiku $1.60  │
│ 5h block  2h14m left · $9.80/h → ~$61       │
│ Limit 5h  ▰▰▰▰▱▱▱▱▱▱  46%   resets 15:00    │
│ Limit 7d  ▰▰▱▱▱▱▱▱▱▱  22%   resets Mon      │
╰─────────────────────────────────────────────╯
╭─ Outputs ⌄ ─────────────────────────────────╮
│ › hooks/register.tsx               +120 −4  │
│   hooks/usage.ts                   +88      │
│   docs/spec.md                     +212     │
│   Show 4 more                               │
╰─────────────────────────────────────────────╯
╭─ Changes › ─────────────────────────────────╮
│ ± 12 files uncommitted     +1,204  −44      │
╰─────────────────────────────────────────────╯
╭─ Background tasks ⌄ ────────────────────────╮
│ ◇ Fable review of transfer…    1m 21s       │
│ ◇ 46 finished                               │
╰─────────────────────────────────────────────╯
```

### Card contents

**Header**: the session model (`$.session.model()`), the git branch (`git rev-parse --abbrev-ref HEAD`, run by the files source; left out outside a repo), and the working directory with the home directory shortened to `~`. Not collapsible.

**Cache**
- State: `● warm` or `○ cold`, and `cold in mm:ss` while warm.
- Bar: the share of the TTL left, draining once a second.
- `TTL`: the TTL in use (see Data flow → Cache).
- `hit`: over the last 5 main-thread responses, `cache_read_input_tokens ÷ (input_tokens + cache_read_input_tokens + cache_creation_input_tokens)`, as a whole percentage.
- `next turn`: the next request's prompt tokens priced at the cache-read rate (`warm`) and at the cache-write rate for the TTL (`if cold`), using a per-model price table copied from cache-countdown's `pricing.ts` (mods cannot import from one another). Line omitted for a model the table does not know.
- Before the first response: `–` in place of every figure.

**Context**
- Headline: `context.breakdown.percentage`% used, `totalTokens / rawMaxTokens` formatted (`141.6k / 1M`).
- Bar: one row as wide as the card body; each `used` and `buffer` category gets a run of cells proportional to its tokens, painted with its `color` theme key; the rest is `free`, painted dim. Drawn as `Text` runs of `█`, or as a `Raster` if `Text` runs prove too coarse.
- Legend: one row per `used`, `buffer` and `free` category in the engine's order (`■` in its colour, name, tokens, percentage of `rawMaxTokens`).
- `deferred` categories are not in the bar or legend; they collapse into one expandable row (`› MCP tools N · deferred X`) that lists them.
- Count: `$.session.usage({ breakdown: 'summary' })` (free, local). Hotkey `f` asks once for `breakdown: 'full'` (token-count requests, as `/context` sends) and marks the card `exact` until the next refresh.

**Usage**
- `Session`: `usage.cost.usd`.
- `Today`: today's total cost (local time zone) from ccusage, with a 7-cell sparkline (`▁▂▃▄▅▆▇█`) of the last 7 days' totals, today rightmost.
- Per-model line: today's cost by model family (Fable, Opus, Sonnet, Haiku), largest first, families with $0 left out.
- `5h block`: from the active ccusage block: time left, cost per hour, projected block total. Line omitted when no block is active.
- `Limit 5h` / `Limit 7d` (and `Spend limit` if present): from `usage.rateLimits` (`five_hour`, `seven_day`, `spend_limit`): a 10-cell bar, `percentUsed`, and `resetsAt` as a local time (today) or weekday (later). Rows omitted when `rateLimits` is empty (API key, or before the first response).
- Footer, dim, only when relevant: `updated 2m ago` while the last ccusage figures are older than its refresh period, or the ccusage failure line (see Failure handling).

**Outputs**: one row per file Claude (main loop or any subagent) wrote or edited this session, newest edit first.
- Path relative to the working directory when inside it, else with `~` for home.
- `+added −removed`: summed over every successful edit to that file this session.
- Subagent edits: the agent's name in dim text after the path.
- First 5 rows shown, then `Show N more`, which expands the list in place.
- A file that no longer exists is dimmed, marked `deleted`, and not openable.

**Changes**: `± N files uncommitted  +A  −R` from `git diff --numstat HEAD` (in a repo with no commits yet, against the empty tree) plus untracked files from `git status --porcelain` (untracked files count their lines as added). Collapsed by default; expanded it lists each file (`path  +a −r`), openable in Zed at its first changed hunk. Outside a git repo it reads `not a git repo` and stays collapsed.

**Background tasks**: from `$.agent.list()`, excluding the main loop.
- Running agents: `◇ description`, truncated to fit, with elapsed time since first seen running and a spinner.
- Finished agents: one row, `◇ N finished`.
- Read-only.

## Architecture

```
claude-vitals/
  .claude-plugin/plugin.json   name, version, description, userConfig (see Settings)
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           wiring only: hooks, timers, /vitals command, Pane render
  hooks/state.ts               atoms, one per card's data, plus the collapsed set
  hooks/sources/context.ts     session.usage (+ breakdown), session.model → header model, Context, Usage(session $, limits)
  hooks/sources/cache.ts       per-response usage → warm/cold, expiry, TTL, hit ratio, next-turn cost
  hooks/sources/ccusage.ts     run ccusage, parse JSON → today, per-model, 7-day series, active block
  hooks/sources/files.ts       Outputs from tool calls; Changes and the header's branch from git
  hooks/sources/tasks.ts       agent.list → running / finished
  hooks/pricing.ts             per-model price table (copied from cache-countdown)
  hooks/editor.ts              resolve Zed's CLI; open path:line
  hooks/cards/*.tsx            Header, Cache, Context, Usage, Outputs, Changes, Tasks: pure components
  hooks/format.ts              tokens (141.6k), money ($4.12), durations (2h14m, 52:10), bars, sparklines
  tests/*.test.ts(x)
  tests/fixtures/              captured ccusage v20 JSON, git numstat/porcelain output
  tsconfig.json, .gitignore    as cache-countdown's
```

Rules that keep units independent:
- Sources write atoms; cards read atoms. Cards never call the engine, so a slow source cannot stall a redraw and each card renders from plain data in tests.
- Each source exports pure parsing/derivation functions (tested directly) and one `refresh($)` that does the I/O and writes its atom.
- `register.tsx` holds no logic beyond wiring triggers to `refresh` calls and composing cards into the Pane.
- The mod is added to `.claude-plugin/marketplace.json`.

## Data flow

| Trigger | Updates |
|---|---|
| `session.start` | Every source once; maybe opens the pane (see Opening) |
| `session.measure` | `context` refresh, coalesced to at most one breakdown count per 2 s (trailing call kept) |
| `turn.step` (each API response) | Cache: last request time, token counts, rolling hit ratio, prompt size for next-turn cost; Tasks |
| `tool.call` on `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | After `next(e)` resolves without `isError`: Outputs. Then Changes, debounced 1 s |
| `turn.complete` | ccusage, if its last run started ≥ 30 s ago; Changes |
| Timer, `ccusageRefreshSeconds` | ccusage |
| Timer, 1 s, only while the pane is open | The cache countdown text (an atom holding "now") |
| Timer, 2 s, only while some agent is running | Tasks |
| `r` (pane hotkey), Retry button | ccusage now |
| `f` (pane hotkey) | Context with `breakdown: 'full'` |

**Cache TTL**: the engine's `cache_ttl` when an event reports one (the model-switch hook inputs carry `cache_ttl` and `prompt_cache_warm`). Otherwise inferred: a response after an idle gap of more than 5 minutes that still reads from cache means 1 h; one after a gap of between 5 minutes and 1 h with no cache read means 5 m. Default 1 h. Warm means `now < lastRequestAt + TTL`.

**Outputs line numbers and counts**: from the tool result's `structuredPatch` (Edit, MultiEdit, Write-as-update): `+`/`−` lines are counted, and the first changed line is the first hunk's `newStart` plus its leading context lines. For a Write that creates a file (no patch): added = the content's line count, first line 1. NotebookEdit: counted as one change, line 1. A file's row keeps the first changed line of its most recent edit.

**ccusage**: two calls per refresh, each via `$.process.run` with `timeoutMs: 20000`:
- the daily report for the last 7 days, broken down by model, as JSON (today's total, per-model split, sparkline);
- the active 5-hour block, as JSON (time left, burn rate, projection).

The command prefix is the `ccusageCommand` setting, split on whitespace. A run in flight is never started twice; the last good figures stay shown while a refresh runs.

**Opening in Zed**: `$.process.run([zed, '/abs/path:LINE'])`, where `zed` is resolved once per session in this order: the `zedPath` setting; `zed` on `PATH`; `/Applications/Zed.app/Contents/MacOS/cli`.

## Opening the pane

- `session.start`: when `autoOpen` is on, the terminal reports fullscreen, and the viewport is at least 144 columns, `$.ui.open({ id: 'vitals', title: 'Vitals', columns })`. Narrower, nothing opens on its own.
- `/vitals` toggles the pane at any width (a pane the person asks for docks from 110 columns, and the engine then also allows the mod's own opens from 110).
- Under 110 columns or outside fullscreen the engine seats the pane inline above the prompt. The pane render then switches to **compact** mode: the header plus one line per card, e.g. `Context 14% · Cache warm 52:10 · Today $38.90 · 3 outputs · ± 12 files · 1 task`.

## Interaction

- **Mouse** (the fullscreen terminal reports clicks):
  - Click a card title to collapse or expand it.
  - Click a file row (Outputs or Changes) to open it in Zed.
  - Click `Show N more` to expand the list.
- **Keyboard**, once the pane has focus:
  - Tab / Shift-Tab walk the title and file rows.
  - Enter presses the focused row.
  - Arrows scroll the pane.
  - Esc returns the keyboard to the prompt.
  - `r` refreshes ccusage; `f` takes the exact context count.
- The collapsed set is saved with `$.store` and restored on the next session.

## Failure handling

Every failure stays inside its card; nothing blocks the session or throws out of a hook.

| Situation | Behaviour |
|---|---|
| ccusage not found, non-zero exit, or timeout | Usage keeps session $ and limits (engine figures); dim line `ccusage not found · npm i -g ccusage` (or `ccusage failed: <first stderr line>`) with a **Retry** button |
| ccusage JSON missing an expected field | That line is omitted (never shown as $0); one debug-log line names the field |
| No response yet this session | Cache and Context show `–` |
| Not a git repo, or git exceeds a 5 s timeout | Changes reads `not a git repo` (or `git timed out`), collapsed |
| Zed not found / exits non-zero | Toast `Zed not found: set its path in claude-vitals settings`; the absolute path is copied with `$.ui.copy` |
| Edited file deleted since | Row dimmed, `deleted`, not openable |
| `rateLimits` empty | Limit rows hidden |
| Breakdown unavailable | Context falls back to `context.percent`, `tokens / window` with no legend |

## Settings (`userConfig`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `autoOpen` | boolean | `true` | Open on session start when fullscreen and ≥ 144 columns |
| `columns` | number | `46` | Width the docked pane asks for; a width the person drags to wins |
| `zedPath` | string | `""` | Zed CLI path; empty = auto-detect |
| `ccusageCommand` | string | `"ccusage"` | How to run ccusage, e.g. `npx -y ccusage@20` |
| `ccusageRefreshSeconds` | number | `300` | Background ccusage refresh period (plus after each turn, at most every 30 s) |

## Testing

Tests come first (TDD), run with `claude plugin test claude-vitals`, in the style of cache-countdown's suite: a mocked engine beneath the mod (`mock.clock`, `mock.store`, `mock.session`, and `on('process.run' | 'session.usage' | 'agent.list' | 'fs.stat', …)` answering with canned data).

- **Pure units**:
  - `format.ts`
  - the git numstat/porcelain parser
  - the `structuredPatch` counter
  - the hit-ratio, TTL and expiry maths
  - next-turn pricing
  - Zed resolution order
  - the ccusage parsers, against fixtures captured from a real ccusage v20 run
- **Cards**: `$.ui.mount` on the `terminal` surface with seeded atoms:
  - text and order of rows
  - collapse/expand and persistence
  - `Show N more`
  - pressing a file row runs `zed /abs/path:LINE`
  - compact mode when inline
- **Hooks end to end**:
  - an Edit call adds an Outputs row with the right counts and line
  - ccusage failure shows the fallback line and Retry works
  - non-git cwd
  - API-key mode (no `rateLimits`) hides limit rows
  - auto-open only at ≥ 144 columns and fullscreen
  - `/vitals` toggles
- **Static**: `claude plugin validate claude-vitals` and `tsc --noEmit` clean.
- **Live** (manual, recorded in the plan's last task), in kitty, fullscreen, ~160 columns, with ccusage installed:
  - the pane auto-opens
  - the countdown ticks
  - clicking an Outputs row opens Zed at the right line
  - `r` refreshes Usage
  - `/vitals` toggles
  - Ghostty is not installed on this machine; the live check there waits until it is. Nothing in the design is kitty-specific.

## Assumptions to verify in the plan's first task

Each has a stated fallback, so none blocks the design.

1. **ccusage v20 command shapes** (subcommand scoping to Claude Code, `--since`, `--breakdown`, `blocks --active`, `--json` field names). Capture real output as fixtures. Fallback: adjust the parser to the captured shape.
2. **`$.process.run` resolves bare names on `PATH`** (`ccusage`, `zed`, `git`). Fallback: resolve absolute paths once at session start with `/usr/bin/env which`-style lookup, or require full paths in settings.
3. **Atom updates redraw an open Pane** (cache-countdown's band relies on this). Fallback: `$.ui.invalidate` after each atom write.
4. **`structuredPatch` is present on Edit/MultiEdit/Write results seen by a `tool.call` hook.** Fallback: count from the tool input (`old_string`/`new_string` line counts) and take the line from a post-edit search for `new_string` in the file.
5. **`$.agent.list()` statuses distinguish running from finished.** Fallback: treat agents seen in `agent.spawn` and not yet reported complete as running.
