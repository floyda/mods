import { describe, expect, test } from 'claude-code/testing'

import { base64, Canvas, coverage } from '../hooks/graphics/canvas'
import { pickMode } from '../hooks/graphics/mode'
import { categoryColor, familyColor, heat, hex, mix, paletteFor, rgb, themeOf } from '../hooks/graphics/palette'

function pixel(canvas: Canvas, x: number, y: number): number[] {
  const at = (y * canvas.width + x) * 4
  return [...canvas.data.slice(at, at + 4)]
}

describe('palette', () => {
  test('the theme setting picks the palette', () => {
    expect(themeOf('light')).toBe('light')
    expect(themeOf('light-daltonized')).toBe('light')
    expect(themeOf('dark')).toBe('dark')
    expect(themeOf(undefined)).toBe('dark')
    expect(paletteFor('light').theme).toBe('light')
    expect(paletteFor('dark').theme).toBe('dark')
  })

  test('colours convert and mix', () => {
    expect(rgb('#ff8000')).toEqual([255, 128, 0])
    expect(hex([255, 128, 0])).toBe('#ff8000')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 3)).toBe('#ffffff')
  })

  test('the heat ramp runs green, amber, red', () => {
    const p = paletteFor('dark')
    expect(heat(p, 0)).toBe(p.green)
    expect(heat(p, 0.5)).toBe(p.amber)
    expect(heat(p, 1)).toBe(p.red)
    expect(heat(p, 2)).toBe(p.red)
  })

  test('context categories get /context-like colours; free is the track; unknown is grey', () => {
    const p = paletteFor('dark')
    expect(categoryColor(p, { name: 'Messages', kind: 'used' })).toBe('#5b8def')
    expect(categoryColor(p, { name: 'MCP tools (deferred)', kind: 'deferred' })).toBe(
      categoryColor(p, { name: 'MCP tools', kind: 'used' }),
    )
    expect(categoryColor(p, { name: 'Free space', kind: 'free' })).toBe(p.track)
    expect(categoryColor(p, { name: 'Something new', kind: 'used' })).toBe(p.dim)
    expect(familyColor(p, 'Opus')).toBe(p.clay)
    expect(familyColor(p, 'Other')).toBe(p.dim)
  })
})

describe('graphics mode', () => {
  test('auto draws pixels in kitty and Ghostty, text elsewhere and under tmux', () => {
    expect(pickMode('auto', { term: 'xterm-kitty' })).toBe('pixels')
    expect(pickMode('auto', { kittyWindowId: '3' })).toBe('pixels')
    expect(pickMode('auto', { termProgram: 'ghostty' })).toBe('pixels')
    expect(pickMode('auto', { term: 'xterm-256color', termProgram: 'Apple_Terminal' })).toBe('text')
    expect(pickMode('auto', { kittyWindowId: '3', tmux: '/tmp/tmux-501/default,1,0' })).toBe('text')
    expect(pickMode('pixels', {})).toBe('pixels')
    expect(pickMode('text', { term: 'xterm-kitty' })).toBe('text')
  })
})

describe('canvas', () => {
  test('base64 uses the standard alphabet and padding', () => {
    expect(base64(Uint8Array.of(77, 97, 110))).toBe('TWFu')
    expect(base64(Uint8Array.of(255))).toBe('/w==')
    expect(base64(Uint8Array.of(255, 255))).toBe('//8=')
  })

  test('coverage is whole inside an edge, none outside, half on it', () => {
    expect(coverage(-2)).toBe(1)
    expect(coverage(2)).toBe(0)
    expect(coverage(0)).toBe(0.5)
  })

  test('a pill paints only where its paint says, with rounded ends', () => {
    const canvas = new Canvas(40, 10)
    canvas.pill(0, 0, 40, 10, x => (x < 20 ? [255, 0, 0] : null))
    expect(pixel(canvas, 10, 5)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, 30, 5)[3]).toBe(0)
    expect(pixel(canvas, 0, 0)[3]).toBe(0)
  })

  test('a ring paints its arcs clockwise from 12 o’clock and leaves the hole empty', () => {
    const canvas = new Canvas(100, 100)
    canvas.ring(50, 50, 48, 30, turn => (turn < 0.25 ? [255, 0, 0] : [0, 0, 255]))
    expect(pixel(canvas, 70, 12)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, 30, 88)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, 50, 50)[3]).toBe(0)
  })

  test('toBase64 encodes width × height × 4 bytes', () => {
    expect(new Canvas(3, 2).toBase64()).toHaveLength(32)
  })
})
