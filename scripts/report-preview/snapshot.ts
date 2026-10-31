// Loads and verifies an export.sql result before anything renders from it (CUL-2308).
//
// export.sql returns one row per read: `read`, `n` (rows), `md5` (of `body`, taken in SQL)
// and `body` (the rows as compact JSON text). The session saves that result to a file
// outside the repo, either the file the Supabase MCP writes for an oversized result or the
// rows written out by hand. This loader re-takes every md5 from what is on disk, so a
// transcription slip or a truncated tool result refuses instead of rendering a report from
// rows the database never returned.
//
// It also refuses: a pet not on the evaluation-subject list (PMD-12), a dump whose CTE
// matched anything but exactly one pet, a missing, duplicated or unknown read, a row count
// that disagrees with `n`, a pet or household row owned by anyone but the subject's owner,
// and an output directory inside the repository.
//
// Pure of Deno: node's fs/crypto/path, so jest covers it and run.deno.ts imports it.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { META_READ, READS } from './reads.ts'
import type { Dump, DumpMeta } from './standInClient.ts'

export interface ExportRow {
  read: string
  n: number
  md5: string
  body: string
}

export function md5(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex')
}

/** The rows of an execute_sql result: a plain JSON array, the MCP's `{ result }` file, or the fenced text inside it. */
export function exportRowsFrom(raw: string): ExportRow[] {
  let text = raw
  try {
    const outer: unknown = JSON.parse(raw)
    if (Array.isArray(outer)) return outer as ExportRow[]
    if (outer && typeof outer === 'object' && typeof (outer as { result?: unknown }).result === 'string') {
      text = (outer as { result: string }).result
    }
  } catch {
    // Not JSON at the top level: the fenced form, below.
  }
  const match = text.match(/(\[\{"read".*\}\])\s*<\/untrusted/s)
  if (!match) throw new Error('no export.sql rows found (expected a JSON array of {read, n, md5, body})')
  return JSON.parse(match[1]) as ExportRow[]
}

/** Verifies every read and returns the dump. Throws with every problem found, never the first alone. */
export function verifyExport(rows: ExportRow[], subjectPetIds: readonly string[]): Dump {
  const problems: string[] = []
  const expected = [META_READ, ...READS.map((r) => r.name)]
  const byRead = new Map<string, unknown[]>()
  const seen = new Set<string>()

  for (const row of rows) {
    const name = String(row?.read)
    if (!expected.includes(name)) {
      problems.push(`unknown read "${name}"`)
      continue
    }
    if (seen.has(name)) {
      problems.push(`read "${name}" appears twice`)
      continue
    }
    seen.add(name)
    if (typeof row.body !== 'string') {
      problems.push(`${name}: body is not text`)
      continue
    }
    const onDisk = md5(row.body)
    if (onDisk !== row.md5) {
      problems.push(`${name}: md5 on disk ${onDisk} is not the md5 taken in SQL ${row.md5}`)
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(row.body)
    } catch {
      problems.push(`${name}: body is not JSON`)
      continue
    }
    if (name === META_READ) {
      byRead.set(name, [parsed])
      continue
    }
    if (!Array.isArray(parsed)) {
      problems.push(`${name}: body is not a JSON array`)
      continue
    }
    if (parsed.length !== Number(row.n)) problems.push(`${name}: ${parsed.length} rows on disk, ${row.n} counted in SQL`)
    byRead.set(name, parsed)
  }
  for (const name of expected) if (!seen.has(name)) problems.push(`read "${name}" is missing`)

  const meta = (byRead.get(META_READ)?.[0] ?? null) as (DumpMeta & { subjects?: unknown }) | null
  if (meta) {
    if (meta.subjects !== 1) problems.push(`the subject CTE matched ${String(meta.subjects)} pets, not 1`)
    if (typeof meta.pet_id !== 'string' || !subjectPetIds.includes(meta.pet_id)) {
      problems.push(`pet ${String(meta.pet_id)} is not an evaluation subject (scripts/engine-replay/evaluationSubjects.ts)`)
    }
    if (typeof meta.owner_id !== 'string') problems.push('meta carries no owner id')
    if (typeof meta.cutoff !== 'string' || !Number.isFinite(Date.parse(meta.cutoff))) problems.push('meta carries no cutoff')

    const pet = (byRead.get('pet') ?? []) as { id?: unknown; user_id?: unknown }[]
    if (pet.length !== 1) problems.push(`pet: ${pet.length} rows, not 1`)
    else if (pet[0].id !== meta.pet_id || pet[0].user_id !== meta.owner_id) problems.push('pet: the row is not the subject, owned by the subject’s owner')
    const household = (byRead.get('household') ?? []) as { user_id?: unknown }[]
    if (household.some((h) => h.user_id !== meta.owner_id)) problems.push('household: a pet owned by someone else')
    if ((byRead.get('user_profiles') ?? []).length > 1) problems.push('user_profiles: more than one profile')
    if ((byRead.get('capture_changes') ?? []).length > 1) problems.push('capture_changes: more than one row')
  } else if (seen.has(META_READ)) {
    problems.push('meta: empty')
  }

  if (problems.length > 0) throw new Error(`export refused:\n  ${problems.join('\n  ')}`)
  const out: Record<string, unknown[]> = {}
  for (const r of READS) out[r.name] = byRead.get(r.name) ?? []
  return { meta: { pet_id: meta!.pet_id, owner_id: meta!.owner_id, cutoff: meta!.cutoff }, rows: out }
}

export function loadExport(path: string, subjectPetIds: readonly string[]): Dump {
  return verifyExport(exportRowsFrom(readFileSync(path, 'utf8')), subjectPetIds)
}

/** The real path of `p`: its nearest existing ancestor resolved through every symlink, plus the rest. */
function realish(p: string): string {
  let head = resolve(p)
  const tail: string[] = []
  while (!existsSync(head)) {
    const up = dirname(head)
    if (up === head) break
    tail.unshift(basename(head))
    head = up
  }
  return join(realpathSync(head), ...tail)
}

/**
 * Health data never lands in the repository: refuse an output directory inside it.
 *
 * Compared on REAL paths, because `resolve` does not follow symlinks: an `--out` through a
 * link into the repo wrote a render into `scripts/` (rls-privacy-reviewer, CUL-2308). And
 * compared case-insensitively too, so `Project-Nyx` on a case-insensitive disk is the repo.
 * On a case-sensitive disk that can refuse a sibling differing only by case: loud, never quiet.
 */
export function assertOutsideRepo(outDir: string, repoRoot: string): void {
  const repo = realish(repoRoot)
  const out = realish(outDir)
  for (const [r, o] of [[repo, out], [repo.toLowerCase(), out.toLowerCase()]]) {
    const rel = relative(r, o)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      throw new Error(`refusing to write inside the repository (${outDir}); pass --out to a scratch directory`)
    }
  }
}
