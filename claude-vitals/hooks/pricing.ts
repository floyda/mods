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
