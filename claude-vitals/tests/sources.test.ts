import type { AgentInfo } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { celebrate, CELEBRATE_MS, completed, saved, started, typed } from '../hooks/sources/activity'
import { tasksFrom } from '../hooks/sources/tasks'
import { INITIAL_ACTIVITY, INITIAL_TASKS } from '../hooks/state'

const agent = (id: string, status: AgentInfo['status'], description = 'Review the transfer check'): AgentInfo => ({
  id,
  description,
  type: 'general-purpose',
  status,
})

describe('background tasks', () => {
  test('running agents keep the time they were first seen; finished ones are counted', () => {
    const first = tasksFrom([agent('a', 'running'), agent('b', 'completed')], INITIAL_TASKS, 1_000)
    expect(first.state).toEqual({
      running: [{ id: 'a', description: 'Review the transfer check', firstSeenAt: 1_000 }],
      finished: 1,
    })
    expect(first.finishedNow).toBe(0)

    const later = tasksFrom([agent('a', 'running'), agent('b', 'completed')], first.state, 5_000)
    expect(later.state.running[0]?.firstSeenAt).toBe(1_000)
  })

  test('an agent seen running and now finished counts as just finished; idle ones are neither', () => {
    const before = tasksFrom([agent('a', 'running')], INITIAL_TASKS, 1_000).state
    const after = tasksFrom([agent('a', 'failed'), agent('c', 'idle')], before, 2_000)
    expect(after.finishedNow).toBe(1)
    expect(after.state).toEqual({ running: [], finished: 1 })
  })
})

describe('activity', () => {
  test('a turn that saved a file celebrates when it completes', () => {
    let a = started(INITIAL_ACTIVITY, 1_000)
    expect(a.isWorking).toBe(true)
    a = saved(a, 2_000)
    a = completed(a, 3_000)
    expect(a.isWorking).toBe(false)
    expect(a.celebrateUntil).toBe(3_000 + CELEBRATE_MS)
  })

  test('a turn that saved nothing does not, even after an earlier save', () => {
    let a = saved(INITIAL_ACTIVITY, 500)
    a = started(a, 1_000)
    a = completed(a, 3_000)
    expect(a.celebrateUntil).toBe(0)
  })

  test('typing and celebrations move their own clocks', () => {
    expect(typed(INITIAL_ACTIVITY, 9_000).lastActiveAt).toBe(9_000)
    expect(celebrate(INITIAL_ACTIVITY, 9_000).celebrateUntil).toBe(9_000 + CELEBRATE_MS)
  })
})
