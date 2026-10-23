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
