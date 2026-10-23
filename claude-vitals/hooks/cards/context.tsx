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
