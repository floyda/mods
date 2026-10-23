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
