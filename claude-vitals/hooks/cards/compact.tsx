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
