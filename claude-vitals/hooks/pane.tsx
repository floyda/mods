import type { RenderElement } from 'claude-code'

import type {
  ActivityState,
  CacheState,
  CcusageState,
  ChangesState,
  ContextState,
  OutputRow,
  PlaceState,
  SpendState,
  TasksState,
  ViewState,
} from '../types'
import { cacheCard } from './cards/cache'
import { contextCard } from './cards/context'
import { usageCard } from './cards/usage'
import { changesCard, outputsCard } from './cards/files'
import { tasksCard } from './cards/tasks'
import { headerCard } from './cards/header'
import type { Kit } from './cards/kit'
import { homePath } from './format'
import { frameAt, smallFrameAt } from './graphics/sprite'
import { moodLabel, moodOf } from './mood'
import type { MoodInput } from './mood'
import { cacheView } from './sources/cache'

export type PaneData = {
  cache: CacheState
  context: ContextState
  spend: SpendState
  ccusage: CcusageState
  outputs: OutputRow[]
  changes: ChangesState
  tasks: TasksState
  activity: ActivityState
  view: ViewState
  place: PlaceState
  now: number
}

export type PaneSettings = { showCharacter: boolean; refreshMs: number; isAnimated: boolean }

export function moodInput(d: PaneData): MoodInput {
  return {
    cache: cacheView(d.cache, d.now).status,
    contextPercent: d.context.percent,
    limits: d.spend.limits,
    isWorking: d.activity.isWorking,
    celebrateUntil: d.activity.celebrateUntil,
    lastActiveAt: d.activity.lastActiveAt,
    now: d.now,
  }
}

/** The docked sidebar's cards, top to bottom. */
export function paneCards(kit: Kit, d: PaneData, s: PaneSettings): RenderElement[] {
  const input = moodInput(d)
  const mood = moodOf(input)
  return [
    headerCard(kit, {
      model: d.context.model ?? d.cache.model,
      branch: d.changes.branch,
      place: homePath(d.place.cwd, d.place.home),
      mood,
      frame: frameAt(mood, d.now),
      small: smallFrameAt(mood, d.now),
      label: moodLabel(mood, input),
      showCharacter: s.showCharacter,
    }),
    // Animated, the pill is drawn as the animator's frame for now, so a redraw never repaints a still one over it.
    cacheCard(kit, cacheView(d.cache, d.now), s.isAnimated ? d.now : null),
    contextCard(kit, d.context),
    usageCard(kit, { spend: d.spend, cc: d.ccusage, now: d.now, tzOffsetMin: d.place.tzOffsetMin, refreshMs: s.refreshMs }),
    outputsCard(kit, { outputs: d.outputs, showAll: d.view.showAllOutputs, changes: d.changes, cwd: d.place.cwd, home: d.place.home }),
    changesCard(kit, { outputs: d.outputs, showAll: d.view.showAllOutputs, changes: d.changes, cwd: d.place.cwd, home: d.place.home }),
    tasksCard(kit, d.tasks, d.now),
  ]
}
