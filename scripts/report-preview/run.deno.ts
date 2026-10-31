// Renders the shipped vet report from a verified export, read-only (CUL-2308).
//
//   deno run --allow-read --allow-write=<out dir> \
//     scripts/report-preview/run.deno.ts --export <execute_sql result file> --out <scratch dir> [--owner]
//
// It imports the UNCHANGED `generateReportForPet` (no copy), hands it the stand-in client over
// the verified rows, sets its clock to the export's cutoff, passes no Storage client (photos
// render as placeholders, as they do when Storage is unreachable) and no caller JWT. The
// default audience is `shared_link`, the page a vet opens; `--owner` renders the owner's arm
// with Include your notes OFF. Output: report.html and report.json (the response's metadata
// and the run's checks), written only outside the repository.
//
// It exits non-zero, writing nothing, when the export fails verification, when the stand-in
// refused any query (the loader asked for something export.sql did not dump), when a paged
// read was not read to its end, or when the report is not a 200.
//
// Read-only throughout: it reads one file and writes two. It never reads Storage and never
// calls an LLM. supabase-js loads from the Deno cache (index.ts imports it) but no client is
// ever constructed from it: the only client the loader sees is the stand-in.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generateReportForPet } from '../../supabase/functions/generate-report/index.ts'
import { EVALUATION_SUBJECTS } from '../engine-replay/evaluationSubjects.ts'
import { assertOutsideRepo, loadExport } from './snapshot.ts'
import { requiredReads, standInClient } from './standInClient.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name: string): string | null {
  const i = Deno.args.indexOf(name)
  return i >= 0 ? Deno.args[i + 1] ?? null : null
}

export async function main(): Promise<number> {
  const exportPath = arg('--export')
  const outDir = arg('--out')
  if (!exportPath || !outDir) {
    console.error('usage: run.deno.ts --export <execute_sql result> --out <scratch dir outside the repo> [--owner]')
    return 2
  }
  assertOutsideRepo(outDir, REPO)

  const dump = loadExport(exportPath, EVALUATION_SUBJECTS.map((s) => s.petId))
  const stand = standInClient(dump)
  const audience = Deno.args.includes('--owner')
    ? { kind: 'owner' as const, includeLookNotes: false }
    : { kind: 'shared_link' as const }
  const nowMs = Date.parse(dump.meta.cutoff)

  const res = await generateReportForPet(
    stand.client as unknown as Parameters<typeof generateReportForPet>[0],
    dump.meta.pet_id,
    nowMs,
    null,
    audience,
    null,
    null,
    null,
  )

  const missing = requiredReads().filter((r) => !stand.served.includes(r))
  // `looks` is capped by design (LOOK_PULL_CAP): a short look read degrades one clause and the
  // report says so itself. Every other short read is an incomplete pull.
  const short = stand.shortReads().filter((s) => !s.startsWith('looks:'))
  const problems = [
    ...stand.refusals.map((r) => `stand-in refused: ${r}`),
    ...missing.map((r) => `never read: ${r}`),
    ...short.map((s) => `short read: ${s}`),
    ...(res.status === 200 ? [] : [`report status ${res.status}: ${JSON.stringify(res.body)}`]),
  ]
  if (problems.length > 0) {
    console.error(`report-preview refused:\n  ${problems.join('\n  ')}`)
    return 1
  }

  const { html, ...meta } = res.body as { html: string } & Record<string, unknown>
  await Deno.mkdir(outDir, { recursive: true })
  await Deno.writeTextFile(join(outDir, 'report.html'), html)
  await Deno.writeTextFile(
    join(outDir, 'report.json'),
    JSON.stringify({ cutoff: dump.meta.cutoff, audience: audience.kind, served: stand.served, looks: stand.shortReads(), ...meta }, null, 2),
  )
  console.log(`report-preview: ${audience.kind} report at ${dump.meta.cutoff} written to ${outDir}`)
  return 0
}

if (import.meta.main) Deno.exit(await main())
