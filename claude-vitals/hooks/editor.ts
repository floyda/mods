
export const ZED_APP_CLI = '/Applications/Zed.app/Contents/MacOS/cli'
export const ZED_MISSING = 'Zed not found: set its path in vitals settings'

/** Where to look for Zed's CLI, in order, without repeats. */
export function zedCandidates(setting: string): string[] {
  return [...new Set([setting.trim(), 'zed', ZED_APP_CLI].filter(candidate => candidate !== ''))]
}
