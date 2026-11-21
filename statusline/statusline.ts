// Claude Code statusLine script, run with `node` (22.18 or newer strips the TypeScript types itself).
// Shows: current dir, git branch, model, context remaining %, prompt cache countdown with
// the next turn's cost warm and cold, and rate limits.
//
// The countdown runs from the main thread's last response in the transcript, at the TTL its cache
// writes used. Set "refreshInterval": 1 in the statusLine setting so it ticks every second.

import { execFileSync } from 'node:child_process'
import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import { basename } from 'node:path'

type Ttl = '5m' | '1h'

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}

const DIM = '\x1b[2m'
const CYAN = '\x1b[2;36m'
const YELLOW = '\x1b[2;33m'
const MAGENTA = '\x1b[2;35m'
const GREEN = '\x1b[32m'
const AMBER = '\x1b[33m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

// API list prices, USD per million input tokens, and each model's cache-read rate as a share of it.
// Most specific first: the first prefix the model id contains wins. Kept in step with claude-vitals' pricing.ts.
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
const WRITE: Record<Ttl, number> = { '5m': 1.25, '1h': 2 }

// How much of the transcript's end is read looking for the last response.
const TAIL_BYTES = 512 * 1024

const paint = (color: string, text: string) => `${color}${text}${RESET}`
const pad2 = (n: number) => String(n).padStart(2, '0')

function money(usd: number): string {
  if (usd > 0 && usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

/** The last `bytes` of a file, split into lines; the first, likely cut short, is dropped. */
function tailLines(path: string, bytes: number): string[] {
  const fd = openSync(path, 'r')
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    return start > 0 ? lines.slice(1) : lines
  } finally {
    closeSync(fd)
  }
}

/** The TTL a response's cache writes used: the one most of its written tokens went to (as claude-vitals decides). */
function ttlOf(usage: Usage): Ttl | null {
  const hour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const five = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
  if (hour === 0 && five === 0) return null
  return hour >= five ? '1h' : '5m'
}

/**
 * The main thread's last response: when its request went out, its model and usage, and the TTL its cache
 * writes used. The request went out at the entry before it (the prompt or a tool result): the cache's
 * countdown restarts then. `isDetected` is false when no response in the tail wrote to the cache, and the
 * TTL is the API's 5 m default.
 */
function lastResponse(transcript: string): { at: number; model: string; usage: Usage; ttl: Ttl; isDetected: boolean } | null {
  let lines: string[]
  try {
    lines = tailLines(transcript, TAIL_BYTES)
  } catch {
    return null
  }
  let found: { at: number; model: string; usage: Usage } | null = null
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"assistant"')) continue
    let entry: any
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    const usage: Usage | undefined = entry?.message?.usage
    const model: string | undefined = entry?.message?.model
    if (entry?.type !== 'assistant' || entry.isSidechain === true || usage === undefined || !model || model === '<synthetic>') continue
    found ??= { at: sentAt(lines, i) ?? Date.parse(entry.timestamp), model, usage }
    // A response that only read the cache says nothing of its TTL: look further back for one that wrote.
    const ttl = ttlOf(usage)
    if (ttl !== null) return { ...found, ttl, isDetected: true }
  }
  return found === null ? null : { ...found, ttl: '5m', isDetected: false }
}

/** When the request answered by the response at `lines[index]` went out: the main thread's last user entry before it. */
function sentAt(lines: string[], index: number): number | null {
  for (let i = index - 1; i >= 0 && i >= index - 200; i--) {
    if (!lines[i].includes('"user"')) continue
    let entry: any
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (entry?.type !== 'user' || entry.isSidechain === true) continue
    const at = Date.parse(entry.timestamp)
    return Number.isNaN(at) ? null : at
  }
  return null
}

function cacheSegment(transcript: string | undefined): string | null {
  if (!transcript) return null
  const last = lastResponse(transcript)
  if (last === null || Number.isNaN(last.at)) return null
  const u = last.usage
  const tokens =
    (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
  const ttlMs = TTL_MS[last.ttl]
  const left = last.at + ttlMs - Date.now()
  const price = PRICES.find(([prefix]) => last.model.toLowerCase().includes(prefix))
  const perToken = price === undefined ? null : price[1] / 1_000_000
  const warmUsd = perToken === null ? null : tokens * perToken * price![2]
  const coldUsd = perToken === null ? null : tokens * perToken * WRITE[last.ttl]
  const ttl = `${DIM}ttl:${last.ttl}${last.isDetected ? '' : '?'}${RESET}`

  if (left > 0) {
    const fraction = left / ttlMs
    const tone = fraction > 0.5 ? GREEN : fraction > 0.2 ? AMBER : RED
    const head = `${paint(tone, `● warm ${countdown(left)}`)} ${ttl}`
    if (warmUsd === null || coldUsd === null) return head
    return `${head} ${DIM}· next${RESET} ${money(warmUsd)} ${DIM}/${RESET} ${paint(AMBER, money(coldUsd))} ${DIM}cold${RESET}`
  }
  const head = `${paint(RED, '○ cold')} ${ttl}`
  return coldUsd === null ? head : `${head} ${DIM}· next${RESET} ${paint(AMBER, money(coldUsd))}`
}

function gitBranch(cwd: string): string | null {
  try {
    const branch = execFileSync('git', ['--no-optional-locks', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1_000,
    }).trim()
    return branch && branch !== 'HEAD' ? branch : null
  } catch {
    return null
  }
}

function main(): void {
  let input: any = {}
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    // Nothing usable on stdin: draw what we can.
  }
  const parts: string[] = []

  const cwd: string = input.workspace?.current_dir ?? input.cwd ?? process.cwd()
  parts.push(paint(CYAN, basename(cwd) || cwd))

  const branch = gitBranch(cwd)
  if (branch !== null) parts.push(paint(YELLOW, `git:${branch}`))

  const model: string | undefined = input.model?.display_name
  if (model) parts.push(paint(DIM, model))

  const remaining = input.context_window?.remaining_percentage
  if (typeof remaining === 'number') parts.push(paint(DIM, `ctx:${Math.round(remaining)}%`))

  const cache = cacheSegment(input.transcript_path)
  if (cache !== null) parts.push(cache)

  const five = input.rate_limits?.five_hour?.used_percentage
  const week = input.rate_limits?.seven_day?.used_percentage
  const rates = [
    typeof five === 'number' ? `5h:${Math.round(five)}%` : null,
    typeof week === 'number' ? `7d:${Math.round(week)}%` : null,
  ].filter(Boolean)
  if (rates.length > 0) parts.push(paint(MAGENTA, rates.join(' ')))

  process.stdout.write(parts.join(paint(DIM, ' | ')))
}

main()
