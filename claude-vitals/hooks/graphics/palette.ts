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
