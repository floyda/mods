import type { ImageSource, Timer } from 'claude-code'

export type Blit = { kind: 'image'; source: ImageSource } | { kind: 'raster'; cells: string }

/** One moving picture: its key in the pane, and its frame at a time (`sig` names the frame, so an unchanged one is not sent). */
export type Animated = { key: string; frame: (ms: number) => { sig: string; blit: Blit } }

export type BlitArgs =
  | { requestId: string; key: string; source: ImageSource }
  | { requestId: string; key: string; cells: string }

/** What the animator needs from the engine; the hooks module builds it, since `$` stays in that file. */
export type AnimatorHost = {
  every: (ms: number, fn: () => void) => Timer
  now: () => Promise<number>
  blit: (args: BlitArgs) => Promise<unknown>
}

export const FRAME_MS = 125

/** Repaints keyed pictures in the pane, 8 frames a second, only while something moves. */
export class Animator {
  private timer: Timer | null = null
  private list: readonly Animated[] = []
  private readonly shown = new Map<string, string>()

  constructor(private readonly requestId: string) {}

  get isRunning(): boolean {
    return this.timer !== null
  }

  set(host: AnimatorHost, list: readonly Animated[]): void {
    this.list = list
    for (const key of [...this.shown.keys()]) {
      if (!list.some(animated => animated.key === key)) this.shown.delete(key)
    }
    if (list.length === 0) {
      this.stop()
      return
    }
    if (this.timer === null) this.timer = host.every(FRAME_MS, () => void this.step(host))
  }

  stop(): void {
    this.timer?.cancel()
    this.timer = null
    this.list = []
    this.shown.clear()
  }

  private async step(host: AnimatorHost): Promise<void> {
    const ms = await host.now()
    for (const animated of this.list) {
      const { sig, blit } = animated.frame(ms)
      if (this.shown.get(animated.key) === sig) continue
      this.shown.set(animated.key, sig)
      const args: BlitArgs =
        blit.kind === 'image'
          ? { requestId: this.requestId, key: animated.key, source: blit.source }
          : { requestId: this.requestId, key: animated.key, cells: blit.cells }
      await host.blit(args).catch(() => undefined)
    }
  }
}
