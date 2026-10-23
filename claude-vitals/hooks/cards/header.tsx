import type { RenderElement } from 'claude-code'

import { modelName } from '../format'
import type { Palette } from '../graphics/palette'
import { characterPicture } from '../graphics/pictures'
import { SPRITE_COLUMNS, SPRITE_ROWS, spriteCells } from '../graphics/sprite'
import type { Frame } from '../graphics/sprite'
import type { Mood } from '../mood'
import { picture } from './kit'
import type { Kit } from './kit'

export type HeaderData = {
  model: string | null
  branch: string | null
  place: string
  mood: Mood
  frame: Frame
  label: string | null
  showCharacter: boolean
}

export function moodColor(pal: Palette, mood: Mood): string {
  if (mood === 'cold') return pal.blue
  if (mood === 'sweating' || mood === 'celebrating') return pal.amber
  if (mood === 'working') return pal.teal
  return pal.dim
}

/** The claw, and beside it the model, where the session runs, and why the claw looks as it does. */
export function headerCard(kit: Kit, d: HeaderData): RenderElement {
  const { Box, Raster, Text } = kit.ui
  const where = [d.branch, d.place].filter((part): part is string => part !== null && part !== '').join(' · ')
  let art: RenderElement | null = null
  if (d.showCharacter) {
    art =
      kit.mode === 'pixels' ? (
        picture(kit, characterPicture(d.frame))
      ) : (
        <Raster key="character" columns={SPRITE_COLUMNS} rows={SPRITE_ROWS} cells={spriteCells(d.frame)} />
      )
  }
  return (
    <Box
      key="card-header"
      flexDirection="row"
      borderStyle="round"
      borderColor={kit.pal.border}
      backgroundColor={kit.pal.card}
      paddingX={1}
      columnGap={2}
    >
      {art}
      <Box flexDirection="column" justifyContent="center">
        <Text bold color={kit.pal.text}>
          {modelName(d.model)}
        </Text>
        <Text color={kit.pal.dim} wrap="truncate-start">
          {where}
        </Text>
        {d.label === null ? null : <Text color={moodColor(kit.pal, d.mood)}>{d.label}</Text>}
      </Box>
    </Box>
  )
}
