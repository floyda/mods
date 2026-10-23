#!/usr/bin/env python3
"""Draws the claw for vitals: 32×32 pixel art in every mood, written to hooks/graphics/claw-art.ts.

Run from the mod folder: python3 tools/claw.py [--preview out.png]
The art is built from shapes (body, eye stalks, pincers, legs), then outlined and shaded, so every mood
shares one body. Letters are palette keys; '.' is transparent. The module never runs this: it reads the output.
"""
import math, sys, json, zlib, struct

N = 32

def disk(cx, cy, r):
    return lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def ellipse(cx, cy, rx, ry):
    return lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

def segment(x0, y0, x1, y1, w):
    def inside(x, y):
        dx, dy = x1 - x0, y1 - y0
        t = max(0, min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
        return (x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2 <= (w / 2) ** 2
    return inside

def wedge(cx, cy, angle, half):
    """Points whose direction from (cx, cy) is within `half` radians of `angle` (0 = up, clockwise)."""
    def inside(x, y):
        a = math.atan2(x - cx, -(y - cy))
        d = (a - angle + math.pi) % (2 * math.pi) - math.pi
        return abs(d) <= half and (x - cx) ** 2 + (y - cy) ** 2 > 1.2
    return inside

def claw(cx, cy, outward, is_open):
    """A pincer: a round claw with a notch cut toward the sky, angled outward when open."""
    body = disk(cx, cy, 4.2)
    if not is_open:
        return body
    notch = wedge(cx, cy, outward * 0.35, 0.42)
    return lambda x, y: body(x, y) and not notch(x, y)

def crab(mood):
    is_open = mood != 'clack'
    layers = []  # (shape, base, light, shade); later layers draw over earlier ones
    skin = ('O', 'H', 'D')
    # Legs behind the body: three a side, splayed.
    for side in (-1, 1):
        for i, (sx, sy, ex, ey) in enumerate([(9.5, 22.5, 3.5, 26.5), (11, 24.5, 6.5, 30), (13.5, 25.5, 11.5, 30.5)]):
            layers.append((segment(16 + side * (16 - sx), sy, 16 + side * (16 - ex), ey, 1.9), *skin))
    # Arms up to the claws.
    for side in (-1, 1):
        layers.append((segment(16 + side * 8, 19, 16 + side * 11.5, 11.5, 2.6), *skin))
    layers.append((ellipse(16, 20.5, 10, 6.6), *skin))
    for side in (-1, 1):
        layers.append((claw(16 + side * 11.5, 8, side, is_open), *skin))
    # Eye stalks and eyes.
    for side in (-1, 1):
        layers.append((segment(16 + side * 3.5, 15, 16 + side * 3.8, 10.5, 1.8), *skin))
        layers.append((disk(16 + side * 3.8, 9.2, 2.6), 'W', 'W', 'w'))
    grid = [['.'] * N for _ in range(N)]
    owner = [[-1] * N for _ in range(N)]
    for i, (shape, base, light, shade) in enumerate(layers):
        for y in range(N):
            for x in range(N):
                if shape(x + 0.5, y + 0.5):
                    lit = not shape(x - 0.5, y - 0.5)
                    dark = not shape(x + 1.5, y + 1.5)
                    grid[y][x] = light if lit and not dark else shade if dark else base
                    owner[y][x] = i
    # Pupils looking slightly down and in, with a glint.
    for side in (-1, 1):
        ex, ey = 16 + side * 3.8, 9.2
        px = int(ex)  # the pupil's right column; light comes from the top left on both eyes
        if mood in ('asleep', 'blink'):
            for x in range(int(ex) - 2, int(ex) + 3):
                if grid[9][x] in 'Ww': grid[9][x] = 'K'
                if grid[8][x] in 'Ww': grid[8][x] = 'O'
                if grid[7][x] in 'Ww': grid[7][x] = 'O'
                if grid[6][x] in 'Ww': grid[6][x] = 'O'
        else:
            for (dx, dy) in [(0, 0), (-1, 0), (0, 1), (-1, 1)]:
                grid[8 + dy][px + dx] = 'E'
            grid[8][px - 1] = 'L'
    # Mouth.
    if mood == 'sweating':
        for x in (14, 15, 16, 17): grid[23][x] = 'k'
        grid[22][13] = 'k'; grid[22][18] = 'k'
    elif mood not in ('asleep',):
        for x in (14, 17): grid[22][x] = 'k'
        for x in (15, 16): grid[23][x] = 'k'
    # Outline: transparent pixels touching the art.
    out = [row[:] for row in grid]
    for y in range(N):
        for x in range(N):
            if grid[y][x] != '.':
                continue
            if any(0 <= x + dx < N and 0 <= y + dy < N and grid[y + dy][x + dx] != '.' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 'k'
    return out

def put(grid, x, y, ch):
    if 0 <= x < N and 0 <= y < N and grid[y][x] == '.':
        grid[y][x] = ch

def sparkle(grid, x, y, big):
    put(grid, x, y, 'S')
    for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        put(grid, x + d[0], y + d[1], 'S' if big else 's')
    if big:
        for d in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            put(grid, x + d[0], y + d[1], 's')

def letter_z(grid, x, y, size):
    for i in range(size):
        put(grid, x + i, y, 'Z'); put(grid, x + i, y + size - 1, 'Z')
        put(grid, x + size - 1 - i, y + i, 'Z')

def icy(grid):
    table = {'O': 'I', 'H': 'J', 'D': 'G', 'k': 'n'}
    return [[table.get(c, c) for c in row] for row in grid]

def frost(grid):
    for x, y in ((7, 3), (8, 4), (23, 3), (24, 4), (5, 6), (26, 6)):
        if grid[y][x] in 'IJGn': grid[y][x] = 'F'
    for x in (10, 13, 18, 21):  # icicles under the body
        put(grid, x, 28, 'F'); put(grid, x, 29, 'f')
    return grid

def shift(grid, dx):
    return [(['.'] * dx + row[:N - dx]) if dx > 0 else row for row in grid]

def frames():
    base = crab('content')
    f = {}
    f['content'] = [base, crab('blink')]
    cold = frost(icy(crab('content')))
    f['cold'] = [cold, shift(cold, 1)]
    sw = []
    for drop_y in (0, 2):
        g = [r[:] for r in crab('sweating')]
        for (dx, dy, ch) in ((0, 0, 'b'), (0, 1, 'b'), (-1, 2, 'B'), (0, 2, 'b'), (1, 2, 'B'), (-1, 3, 'B'), (0, 3, 'B'), (1, 3, 'B'), (0, 4, 'B')):
            put(g, 22 + dx, drop_y + dy, ch)
        sw.append(g)
    f['sweating'] = sw
    work_a = [r[:] for r in crab('content')]
    for x, y in ((1, 2), (1, 4), (30, 2), (30, 4), (2, 0), (29, 0)):
        put(work_a, x, y, 'M')
    f['working'] = [work_a, crab('clack')]
    party = []
    for spots in (((16, 3, True), (2, 18, False), (29, 18, False)), ((11, 2, False), (21, 2, False), (1, 13, True), (30, 13, True)), ((16, 4, False), (3, 21, True), (28, 21, True))):
        g = [r[:] for r in crab('content')]
        for x, y, big in spots: sparkle(g, x, y, big)
        party.append(g)
    f['celebrating'] = party
    sleep = []
    for zs in (((12, 0, 5),), ((14, 0, 5), (21, 3, 3)), ((20, 1, 4),)):
        g = [r[:] for r in crab('asleep')]
        for x, y, size in zs: letter_z(g, x, y, size)
        sleep.append(g)
    f['asleep'] = sleep
    return {mood: [[''.join(row) for row in g] for g in gs] for mood, gs in f.items()}


# Text mode cannot scale pictures: it draws two pixels a cell, so it gets its own hand-drawn 12 × 8 claw.
SMALL = [
    'O.O......O.O',
    'OOO......OOO',
    '.O.HHHHHH.O.',
    '..OWEOOEWO..',
    '..OOOOOOOO..',
    '...DDDDDD...',
    '..O.O..O.O..',
    '.O..O..O..O.',
]

def over(base, *overlays):
    out = []
    for y, row in enumerate(base):
        for o in overlays:
            mask = o.get(y)
            if mask:
                row = ''.join(px if m == '.' else ('.' if m == '_' else m) for px, m in zip(row, mask))
        out.append(row)
    return out

def small_frames():
    shut = {3: '...KK..KK...'}
    icy_small = [r.replace('O', 'I').replace('H', 'J').replace('D', 'G') for r in SMALL]
    cold = over(icy_small, {0: 'F.F......F.F', 7: '....F..F....'})
    return {
        'content': [SMALL, over(SMALL, shut)],
        'cold': [cold, ['.' + r[:-1] for r in cold]],
        'sweating': [over(SMALL, {1: '...B........', 2: '..B.........'}), over(SMALL, {2: '..B.........', 3: '.B..........'})],
        'working': [over(SMALL, {0: '...M....M...'}), over(SMALL, {0: '_O________O_', 1: 'OOO......OOO'})],
        'celebrating': [over(SMALL, {0: '.....SS.....', 6: 'S..........S'}), over(SMALL, {0: '....S..S....', 4: 'S..........S'}), over(SMALL, {1: '.....SS.....', 7: 'S..........S'})],
        'asleep': [over(SMALL, shut, {0: '....ZZ......', 1: '.....Z......'}), over(SMALL, shut, {0: '......ZZ....', 1: '.......Z....'}), over(SMALL, shut)],
    }

COLORS = {
    'O': 0xd97757, 'H': 0xf0a07f, 'D': 0xa94f2f, 'k': 0x3a1a10,
    'W': 0xfff6ee, 'w': 0xd9cfc6, 'E': 0x1b1b1b, 'L': 0xffffff, 'K': 0x3a1a10,
    'I': 0x8fc4f2, 'J': 0xc8e4ff, 'G': 0x5b8fc2, 'n': 0x1d3550, 'F': 0xffffff, 'f': 0xc8e4ff,
    'B': 0x4aa3ff, 'b': 0xb8dcff, 'M': 0xf3efe6, 'S': 0xfbbf24, 's': 0xffe08a, 'Z': 0xc9c6ff,
}

def write_ts(path, f):
    lines = ['// Generated by tools/claw.py: edit that, then run it. 32 × 32 pixels a frame, one letter a pixel.', '',
             'export const ART_SIZE = 32', '',
             'export const ART_COLORS: Record<string, number> = {']
    lines += [f"  {json.dumps(k)}: 0x{v:06x}," for k, v in COLORS.items()]
    lines += ['}', '', "export const ART: Record<'content' | 'cold' | 'sweating' | 'working' | 'celebrating' | 'asleep', readonly (readonly string[])[]> = {"]
    for mood, gs in f.items():
        lines.append(f'  {mood}: [')
        for g in gs:
            lines.append('    [')
            lines += [f"      '{row}'," for row in g]
            lines.append('    ],')
        lines.append('  ],')
    lines.append('}')
    lines += ['', 'export const SMALL_SIZE = [12, 8] as const', '',
              "export const ART_SMALL: Record<'content' | 'cold' | 'sweating' | 'working' | 'celebrating' | 'asleep', readonly (readonly string[])[]> = {"]
    for mood, gs in small_frames().items():
        assert len(gs) == len(f[mood]), mood
        lines.append(f'  {mood}: [')
        for g in gs:
            assert len(g) == 8 and all(len(r) == 12 for r in g), (mood, g)
            lines.append('    [')
            lines += [f"      '{row}'," for row in g]
            lines.append('    ],')
        lines.append('  ],')
    lines.append('}')
    open(path, 'w').write('\n'.join(lines) + '\n')

def preview(path, f):
    order = [(m, i) for m in f for i in range(len(f[m]))]
    S, pad = 6, 4
    W = len(order) * (N + pad) * S + pad * S
    H = (N + 2 * pad) * S + 3 * N  # big row, then a small row at the real-ish size
    bg = (26, 26, 24)
    img = [[bg] * W for _ in range(H)]
    for n, (m, i) in enumerate(order):
        g = f[m][i]
        ox = (pad + n * (N + pad)) * S
        for y in range(N):
            for x in range(N):
                c = COLORS.get(g[y][x])
                if c is None: continue
                rgb = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
                for dy in range(S):
                    for dx in range(S):
                        img[pad * S + y * S + dy][ox + x * S + dx] = rgb
        # The size it shows at in the header: about 66 px tall, so each art pixel ~2 px.
        sy0 = (N + 2 * pad) * S
        for y in range(N):
            for x in range(N):
                c = COLORS.get(g[y][x])
                if c is None: continue
                rgb = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
                for dy in range(2):
                    for dx in range(2):
                        img[sy0 + y * 2 + dy][ox + x * 2 + dx] = rgb
    raw = b''.join(b'\x00' + bytes(c for px in row for c in px) for row in img)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

if __name__ == '__main__':
    f = frames()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], f)
    else:
        write_ts('hooks/graphics/claw-art.ts', f)
