import { describe, expect, test } from 'claude-code/testing'

import { ZED_APP_CLI, ZED_MISSING, zedCandidates } from '../hooks/editor'

describe('editor', () => {
  test('Zed is looked for in the setting, then on PATH, then in the app', () => {
    expect(zedCandidates('')).toEqual(['zed', ZED_APP_CLI])
    expect(zedCandidates(' /opt/bin/zed ')).toEqual(['/opt/bin/zed', 'zed', ZED_APP_CLI])
    expect(zedCandidates('zed')).toEqual(['zed', ZED_APP_CLI])
  })

  test('the app’s own CLI and the message are as the spec says', () => {
    expect(ZED_APP_CLI).toBe('/Applications/Zed.app/Contents/MacOS/cli')
    expect(ZED_MISSING).toBe('Zed not found: set its path in vitals settings')
  })
})
