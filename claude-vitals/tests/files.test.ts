import { describe, expect, test } from 'claude-code/testing'

import { editFacts, EMPTY_TREE, parseFirstLines, parseNumstat, patchFacts, recordEdit } from '../hooks/sources/files'
import { DIFF_U0, NUMSTAT } from './fixtures'

const HUNK = { oldStart: 10, oldLines: 4, newStart: 10, newLines: 5, lines: [' a', ' b', '-c', '+C', '+D', ' e'] }
const LATER = { oldStart: 40, oldLines: 1, newStart: 41, newLines: 2, lines: [' x', '+y', '\\ No newline at end of file'] }

describe('edits', () => {
  test('a patch counts its lines and finds its first change', () => {
    expect(patchFacts([HUNK, LATER])).toEqual({ added: 3, removed: 1, line: 12 })
    expect(patchFacts([])).toEqual({ added: 0, removed: 0, line: 1 })
  })

  test('Edit and Write results become facts', () => {
    expect(
      editFacts('Edit', { file_path: '/w/a.ts', old_string: 'c', new_string: 'C\nD' }, { filePath: '/w/a.ts', structuredPatch: [HUNK] }),
    ).toEqual({ path: '/w/a.ts', added: 2, removed: 1, line: 12 })
    expect(
      editFacts('Write', { file_path: '/w/new.ts', content: 'a\nb\nc\n' }, { type: 'create', filePath: '/w/new.ts', structuredPatch: [], originalFile: null }),
    ).toEqual({ path: '/w/new.ts', added: 3, removed: 0, line: 1 })
    expect(
      editFacts('Write', { file_path: '/w/a.ts', content: 'x' }, { type: 'update', filePath: '/w/a.ts', structuredPatch: [HUNK], originalFile: 'old' }),
    ).toEqual({ path: '/w/a.ts', added: 2, removed: 1, line: 12 })
  })

  test('without a patch an edit counts its strings', () => {
    expect(editFacts('Edit', { file_path: '/w/a.ts', old_string: 'one', new_string: 'one\ntwo' }, {})).toEqual({
      path: '/w/a.ts',
      added: 2,
      removed: 1,
      line: 1,
    })
  })

  test('a notebook edit is one change; other tools and missing paths are nothing', () => {
    expect(editFacts('NotebookEdit', { notebook_path: '/w/n.ipynb', new_source: 'x' }, {})).toEqual({
      path: '/w/n.ipynb',
      added: 1,
      removed: 0,
      line: 1,
    })
    expect(editFacts('Bash', { command: 'ls' }, {})).toBeNull()
    expect(editFacts('Edit', {}, {})).toBeNull()
  })

  test('edits to one file add up; the newest edit comes first', () => {
    let rows = recordEdit([], { path: '/w/a.ts', added: 2, removed: 1, line: 12 }, 1, null)
    rows = recordEdit(rows, { path: '/w/b.ts', added: 5, removed: 0, line: 1 }, 2, 'reviewer')
    rows = recordEdit(rows, { path: '/w/a.ts', added: 1, removed: 1, line: 40 }, 3, null)
    expect(rows.map(r => [r.path, r.added, r.removed, r.line, r.agent])).toEqual([
      ['/w/a.ts', 3, 2, 40, null],
      ['/w/b.ts', 5, 0, 1, 'reviewer'],
    ])
  })
})

describe('git', () => {
  test('numstat reads counts, binaries as zero, and renames as their new path', () => {
    const text = `${NUMSTAT}-\t-\tlogo.png\n3\t1\tsrc/{old.ts => new.ts}\n2\t2\told/a.ts => new/a.ts\n1\t0\tsrc/{sub => }/x.ts\n`
    expect(parseNumstat(text)).toEqual([
      { path: 'hooks/register.tsx', added: 120, removed: 4 },
      { path: 'hooks/usage.ts', added: 88, removed: 0 },
      { path: 'logo.png', added: 0, removed: 0 },
      { path: 'src/new.ts', added: 3, removed: 1 },
      { path: 'new/a.ts', added: 2, removed: 2 },
      { path: 'src/x.ts', added: 1, removed: 0 },
    ])
  })

  test('the first hunk of each file gives the line to open at', () => {
    const firsts = parseFirstLines(DIFF_U0)
    expect(firsts.get('hooks/register.tsx')).toBe(41)
    expect(firsts.get('new.ts')).toBe(1)
    expect(firsts.has('gone.ts')).toBe(false)
  })

  test('the empty tree is git’s well-known id', () => {
    expect(EMPTY_TREE).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
  })
})
