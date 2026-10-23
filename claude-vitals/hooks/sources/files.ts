
import type { OutputRow } from '../../types'
import { lineCount } from '../format'

/** The tree with nothing in it: what a repository with no commits yet is compared against. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
export const GIT_TIMEOUT_MS = 5_000
export const OUTPUT_LIMIT = 200
export const UNTRACKED_LIMIT = 50

export type EditFacts = { path: string; added: number; removed: number; line: number }
type Hunk = { newStart: number; lines: readonly string[] }
type Json = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function hunksOf(value: unknown): Hunk[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const { newStart, lines } = item as Json
    if (typeof newStart !== 'number' || !Array.isArray(lines)) return []
    return [{ newStart, lines: lines.filter((line): line is string => typeof line === 'string') }]
  })
}

/** Lines added and removed, and the new file's line of the first change. */
export function patchFacts(hunks: readonly Hunk[]): { added: number; removed: number; line: number } {
  let added = 0
  let removed = 0
  let line = 0
  for (const hunk of hunks) {
    let context = 0
    for (const text of hunk.lines) {
      if (text.startsWith('+') || text.startsWith('-')) {
        if (line === 0) line = hunk.newStart + context
        if (text.startsWith('+')) added += 1
        else removed += 1
      } else if (text.startsWith(' ')) {
        context += 1
      }
    }
  }
  return { added, removed, line: Math.max(1, line) }
}

/** What one file-writing tool call changed, from its input and the result the tool returned. */
export function editFacts(tool: string, input: Json, result: unknown): EditFacts | null {
  const output: Json = typeof result === 'object' && result !== null ? (result as Json) : {}
  if (tool === 'NotebookEdit') {
    const path = str(input.notebook_path)
    return path === null ? null : { path, added: 1, removed: 0, line: 1 }
  }
  if (tool !== 'Edit' && tool !== 'Write' && tool !== 'MultiEdit') return null
  const path = str(input.file_path) ?? str(output.filePath)
  if (path === null) return null
  const hunks = hunksOf(output.structuredPatch)
  if (hunks.length > 0) return { path, ...patchFacts(hunks) }
  if (tool === 'Write') {
    return output.type === 'update'
      ? { path, added: 0, removed: 0, line: 1 }
      : { path, added: lineCount(str(input.content) ?? ''), removed: 0, line: 1 }
  }
  return { path, added: lineCount(str(input.new_string) ?? ''), removed: lineCount(str(input.old_string) ?? ''), line: 1 }
}

/** The Outputs list after an edit: the file's counts add up and it moves to the top. */
export function recordEdit(rows: readonly OutputRow[], facts: EditFacts, at: number, agent: string | null): OutputRow[] {
  const before = rows.find(row => row.path === facts.path)
  const row: OutputRow = {
    path: facts.path,
    added: (before?.added ?? 0) + facts.added,
    removed: (before?.removed ?? 0) + facts.removed,
    line: facts.line,
    at,
    agent,
    isDeleted: false,
  }
  return [row, ...rows.filter(other => other.path !== facts.path)].slice(0, OUTPUT_LIMIT)
}

function renamedTo(path: string): string {
  const braced = path.replace(/\{[^{}]* => ([^{}]*)\}/, '$1').replace('//', '/')
  if (braced !== path) return braced
  const arrow = path.indexOf(' => ')
  return arrow === -1 ? path : path.slice(arrow + 4)
}

/** `git diff --numstat` → path, lines added, lines removed; a binary file counts as nothing; a rename as its new path. */
export function parseNumstat(text: string): { path: string; added: number; removed: number }[] {
  return text.split('\n').flatMap(line => {
    const [added = '', removed = '', ...rest] = line.split('\t')
    if (rest.length === 0) return []
    return [{ path: renamedTo(rest.join('\t')), added: Number(added) || 0, removed: Number(removed) || 0 }]
  })
}

/** `git diff -U0` → each file's first changed line in the working copy. */
export function parseFirstLines(diff: string): Map<string, number> {
  const firsts = new Map<string, number>()
  let file: string | null = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = null
    } else if (line.startsWith('+++ ')) {
      const target = line.slice(4)
      file = target === '/dev/null' ? null : target.replace(/^b\//, '')
    } else {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (hunk !== null && file !== null && !firsts.has(file)) firsts.set(file, Math.max(1, Number(hunk[1])))
    }
  }
  return firsts
}
