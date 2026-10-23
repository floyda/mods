import type { AgentInfo } from 'claude-code'

import type { TasksState } from '../../types'

const RUNNING = new Set(['pending', 'running', 'waiting'])
const FINISHED = new Set(['completed', 'failed', 'killed'])

/** The tasks card from `$.agent.list()`, and how many agents finished since the last look. */
export function tasksFrom(list: readonly AgentInfo[], prev: TasksState, now: number): { state: TasksState; finishedNow: number } {
  const seenAt = new Map(prev.running.map(task => [task.id, task.firstSeenAt]))
  const running = list
    .filter(agent => RUNNING.has(agent.status))
    .map(agent => ({
      id: agent.id,
      description: agent.description || agent.name || agent.type,
      firstSeenAt: seenAt.get(agent.id) ?? now,
    }))
  const finished = list.filter(agent => FINISHED.has(agent.status))
  return {
    state: { running, finished: finished.length },
    finishedNow: finished.filter(agent => seenAt.has(agent.id)).length,
  }
}
