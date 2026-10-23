import type { EngineInterface, RenderSurface } from 'claude-code'

export const ZED_APP_CLI = '/Applications/Zed.app/Contents/MacOS/cli'
export const ZED_MISSING = 'Zed not found: set its path in vitals settings'

/** Where to look for Zed's CLI, in order, without repeats. */
export function zedCandidates(setting: string): string[] {
  return [...new Set([setting.trim(), 'zed', ZED_APP_CLI].filter(candidate => candidate !== ''))]
}

/** Opens `path` at `line` in Zed; false when no candidate ran. */
export async function openInZed($: EngineInterface, path: string, line: number, setting: string): Promise<boolean> {
  for (const zed of zedCandidates(setting)) {
    try {
      const { exitCode } = await $.process.run([zed, `${path}:${line}`], { timeoutMs: 10_000 })
      if (exitCode === 0) return true
    } catch {
      // Not there: try the next.
    }
  }
  return false
}

/** Opens the file in Zed, or says why it could not and puts the path on the clipboard. */
export async function openFile($: EngineInterface, path: string, line: number, setting: string, surface: RenderSurface): Promise<void> {
  if (await openInZed($, path, line, setting)) return
  $.ui.toast(ZED_MISSING)
  await $.ui.copy({ text: path, surface }).catch(() => undefined)
}
