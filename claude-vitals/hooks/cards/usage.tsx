import type { RenderElement } from 'claude-code'

import type { CcusageState, SpendState } from '../../types'
import { ago, money, padEnd, resetLabel, span, sparkline } from '../format'
import { familyColor, heat } from '../graphics/palette'
import { limitPill, sparkPicture } from '../graphics/pictures'
import { limitName } from '../mood'
import { card, cellBar, dim, line, picture, text } from './kit'
import type { Kit } from './kit'

export type UsageData = { spend: SpendState; cc: CcusageState; now: number; tzOffsetMin: number; refreshMs: number }

function limitLabel(kind: string): string {
  return kind === 'spend_limit' ? 'Spend limit' : `Limit ${limitName(kind)}`
}

function footer(kit: Kit, d: UsageData): RenderElement {
  const { Box, Button } = kit.ui
  const refresh = <Button key="refresh" hotkey="r" plain label="refresh" onPress={() => kit.actions.refreshUsage()} />
  if (d.cc.status === 'missing' || d.cc.status === 'failed') {
    const message = d.cc.status === 'missing' ? 'ccusage not found · npm i -g ccusage' : `ccusage failed: ${d.cc.error ?? 'unknown error'}`
    return (
      <Box key="use-foot" flexDirection="column">
        {dim(kit, message)}
        <Box flexDirection="row" columnGap={2}>
          <Button key="retry" label="Retry" onPress={() => kit.actions.refreshUsage()} />
          {refresh}
        </Box>
      </Box>
    )
  }
  const isReading = d.cc.status === 'running' && d.cc.updatedAt === null
  const isStale = d.cc.updatedAt !== null && d.now - d.cc.updatedAt > d.refreshMs
  const note = isReading ? 'reading ccusage…' : isStale && d.cc.updatedAt !== null ? `updated ${ago(d.now - d.cc.updatedAt)}` : null
  return line(kit, 'use-foot', [refresh], note === null ? [] : [dim(kit, note)])
}

export function usageCard(kit: Kit, d: UsageData): RenderElement {
  const { pal } = kit
  return card(kit, 'usage', 'Usage', pal.amber, open => {
    if (!open) return []
    const { Box, Text } = kit.ui
    const rows: RenderElement[] = [
      line(kit, 'use-session', [dim(kit, 'Session  '), text(kit, d.spend.sessionUsd === null ? '–' : money(d.spend.sessionUsd), pal.text, true)]),
    ]
    const today = d.cc.today
    if (today !== null) {
      const spark = kit.mode === 'pixels' ? [picture(kit, sparkPicture(pal, d.cc.week))] : [text(kit, sparkline(d.cc.week), pal.amber), dim(kit, ' 7d')]
      rows.push(line(kit, 'use-today', [dim(kit, 'Today    '), text(kit, money(today.usd), pal.amber, true)], spark))
      if (today.byModel.length > 0) {
        rows.push(
          <Box key="use-models" flexDirection="row" flexWrap="wrap" columnGap={1}>
            {today.byModel.map(spend => (
              <Text>
                <Text color={familyColor(pal, spend.family)}>● </Text>
                <Text color={pal.text}>{`${spend.family} ${money(spend.usd)}`}</Text>
              </Text>
            ))}
          </Box>,
        )
      }
    }
    const block = d.cc.block
    if (block !== null && block.endsAt > d.now) {
      rows.push(
        line(kit, 'use-block', [
          dim(kit, '5h block '),
          text(kit, span(block.endsAt - d.now), pal.text, true),
          dim(kit, ` left · ${money(block.costPerHour)}/h → `),
          text(kit, `~${money(block.projectedUsd)}`, pal.amber, true),
        ]),
      )
    }
    for (const limit of d.spend.limits) {
      const percent = limit.percentUsed
      const meter =
        kit.mode === 'pixels' ? picture(kit, limitPill(pal, limit.kind, percent)) : cellBar(kit, percent / 100, 10, cell => heat(pal, cell / 9))
      rows.push(
        line(
          kit,
          `use-limit-${limit.kind}`,
          [dim(kit, padEnd(limitLabel(limit.kind), 10)), meter, text(kit, ` ${Math.round(percent)}%`, heat(pal, Math.min(1, percent / 100)), true)],
          limit.resetsAt === null ? [] : [dim(kit, resetLabel(limit.resetsAt, d.now, d.tzOffsetMin))],
        ),
      )
    }
    rows.push(footer(kit, d))
    return rows
  })
}
