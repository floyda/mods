import type { Elements, RenderElement } from 'claude-code'

import type { GraphicsMode } from '../../types'
import { filledCells } from '../format'
import type { Palette } from '../graphics/palette'
import type { Picture } from '../graphics/pictures'

export type Ui = Elements['terminal']

/** What a press in the pane can do. */
export type Actions = {
  toggle: (id: string) => void
  open: (path: string, line: number) => void
  refreshUsage: () => void
  exactContext: () => void
  toggleAllOutputs: () => void
}

/** What every card draws with: the terminal's elements, the palette, the mode, what is folded, the body's width, the presses. */
export type Kit = {
  ui: Ui
  pal: Palette
  mode: GraphicsMode
  collapsed: readonly string[]
  width: number
  actions: Actions
}

export function isOpen(kit: Kit, id: string): boolean {
  return !kit.collapsed.includes(id)
}

/** A rounded card whose title row folds it; `body` draws what shows, told whether the card is open. */
export function card(kit: Kit, id: string, title: string, accent: string, body: (isOpen: boolean) => RenderElement[]): RenderElement {
  const { Box, Button, Text } = kit.ui
  const open = isOpen(kit, id)
  return (
    <Box
      key={`card-${id}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={kit.pal.border}
      backgroundColor={kit.pal.card}
      paddingX={1}
      hover={{ borderColor: accent }}
    >
      <Button key={`toggle-${id}`} plain onPress={() => kit.actions.toggle(id)}>
        <Text bold color={accent}>
          {title}
        </Text>
        <Text color={kit.pal.dim}>{open ? ' ⌄' : ' ›'}</Text>
      </Button>
      {body(open)}
    </Box>
  )
}

/** One row: `left` at its start, `right` at its end. */
export function line(kit: Kit, key: string, left: RenderElement[], right: RenderElement[] = []): RenderElement {
  const { Box } = kit.ui
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row">{left}</Box>
      {right.length === 0 ? null : <Box flexDirection="row">{right}</Box>}
    </Box>
  )
}

export function text(kit: Kit, value: string, color?: string, isBold = false): RenderElement {
  const { Text } = kit.ui
  return (
    <Text color={color ?? kit.pal.text} bold={isBold}>
      {value}
    </Text>
  )
}

export function dim(kit: Kit, value: string): RenderElement {
  return text(kit, value, kit.pal.dim)
}

/** `width` cells, the first `fraction` of them filled (▰), each in `colorAt(cell)`; the rest empty (▱) in the track colour. */
export function cellBar(kit: Kit, fraction: number, width: number, colorAt: (cell: number) => string): RenderElement {
  const { Text } = kit.ui
  const filled = filledCells(fraction, width)
  const runs: { color: string; glyphs: string }[] = []
  for (let cell = 0; cell < width; cell++) {
    const color = cell < filled ? colorAt(cell) : kit.pal.track
    const glyph = cell < filled ? '▰' : '▱'
    const last = runs[runs.length - 1]
    if (last !== undefined && last.color === color) last.glyphs += glyph
    else runs.push({ color, glyphs: glyph })
  }
  return <Text>{runs.map(run => <Text color={run.color}>{run.glyphs}</Text>)}</Text>
}

export function picture(kit: Kit, p: Picture): RenderElement {
  const { Image } = kit.ui
  return <Image key={p.key} source={p.source} columns={p.columns} rows={p.rows} alt={p.alt} />
}
