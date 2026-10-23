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
