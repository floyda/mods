import type { RenderElement } from 'claude-code'

import { countdown, money } from '../format'
import { cacheColor, cachePill } from '../graphics/pictures'
import type { CacheView } from '../sources/cache'
import { card, cellBar, dim, line, picture, text } from './kit'
import type { Kit } from './kit'

/** How wide the cache bar is in a card body `width` wide: room is left for "hit 95%". */
export function cacheBarColumns(width: number): number {
  return Math.max(8, width - 10)
}

/** `animatedAt`: the time whose animation frame the pill shows, or null for a still pill. */
export function cacheCard(kit: Kit, view: CacheView, animatedAt: number | null = null): RenderElement {
  const { pal } = kit
  return card(kit, 'cache', 'Cache', pal.teal, isOpen => {
    if (!isOpen) return []
    if (view.status === 'none') return [dim(kit, '– waiting for the first response')]
    const isWarm = view.status === 'warm'
    const tone = isWarm ? cacheColor(pal, view.fraction) : pal.red
    const rows: RenderElement[] = [
      line(
        kit,
        'cache-state',
        [text(kit, isWarm ? '● ' : '○ ', tone), text(kit, isWarm ? 'warm' : 'cold', tone, true), dim(kit, ` · ${view.ttl} TTL`)],
        isWarm ? [dim(kit, 'cold in '), text(kit, countdown(view.leftMs), pal.text, true)] : [],
      ),
    ]
    const columns = cacheBarColumns(kit.width)
    const bar =
      kit.mode === 'pixels' ? picture(kit, cachePill(view, pal, columns, animatedAt)) : cellBar(kit, view.fraction, columns, () => tone)
    const hitColor = view.hit === null ? pal.dim : view.hit >= 0.8 ? pal.green : view.hit >= 0.5 ? pal.amber : pal.red
    rows.push(line(kit, 'cache-meter', [bar], view.hit === null ? [] : [text(kit, `hit ${Math.round(view.hit * 100)}%`, hitColor)]))
    if (view.warmUsd !== null && view.coldUsd !== null) {
      rows.push(
        line(kit, 'cache-cost', [
          dim(kit, 'next turn '),
          text(kit, money(view.warmUsd), pal.teal, true),
          dim(kit, ' warm · '),
          text(kit, money(view.coldUsd), pal.amber, true),
          dim(kit, ' if cold'),
        ]),
      )
    }
    return rows
  })
}
