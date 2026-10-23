import type { RenderElement } from 'claude-code'

import type { TasksState } from '../../types'
import { clipEnd, count, span } from '../format'
import { card, dim, line, text } from './kit'
import type { Kit } from './kit'

const SPINNER = [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏']

export function tasksCard(kit: Kit, t: TasksState, now: number): RenderElement {
  const { pal } = kit
  return card(kit, 'tasks', 'Background tasks', pal.violet, open => {
    if (!open) return []
    if (t.running.length === 0 && t.finished === 0) return [dim(kit, 'No background tasks')]
    const spin = SPINNER[Math.floor(now / 1_000) % SPINNER.length] ?? '◇'
    const rows = t.running.map(task =>
      line(
        kit,
        `task-${task.id}`,
        [text(kit, `${spin} `, pal.violet), text(kit, clipEnd(task.description, kit.width - 12))],
        [dim(kit, span(now - task.firstSeenAt))],
      ),
    )
    if (t.finished > 0) rows.push(dim(kit, `◇ ${count(t.finished)} finished`))
    return rows
  })
}
