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
