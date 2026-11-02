// The Chromium extraction job's assertions (CUL-2292, row VR2-12; v2 spec §8). Reads the text
// pypdf and pdfminer pulled out of each printed fixture and holds it to `expect.deno.ts`:
//   • sheet 1 alone (`<name>.s1`), page furniture cut out: every fired flag and every line, whole,
//     so every digit;
//   • the whole document: no sentence naming the trial's own sign states a decline in it, and every
//     "How this record was kept" sentence, whole (VR2-14, CUL-2294; GAP-33);
//   • both: no private-use code point, the mark of a glyph with no Unicode behind it;
//   • the small cat: 1.95 kg and 1.86 kg read back at two decimals with their pound twins.
// Usage: deno run --allow-read --allow-env scripts/report-extract/check.deno.ts <dir> [--only <name>]
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { extractionDocs } from './docs.deno.ts'
import { declineSentences, divergence, expectationsOf, fold, missing, withoutFurniture } from './expect.deno.ts'
import { SMALL_CAT_WEIGHTS } from './fixtures.deno.ts'

const dir = Deno.args[0]
if (!dir) throw new Error('usage: check.deno.ts <dir> [--only <name>]')
// `--only <name>`: one fixture, for run.sh's canary.
const onlyAt = Deno.args.indexOf('--only')
const only = onlyAt > 0 ? Deno.args[onlyAt + 1] : null

const PAPERS = ['A4', 'Letter'] as const
const TOOLS = ['pypdf', 'pdfminer'] as const
const failures: string[] = []
let checks = 0

function read(name: string, paper: string, tool: string): string {
  return Deno.readTextFileSync(`${dir}/${name}.${paper}.${tool}.txt`)
}

const docs = extractionDocs(buildDocumentV2).filter((d) => only === null || d.name === only)
if (docs.length === 0) throw new Error('no extraction fixtures')
for (const { name, snap, doc, aiLead } of docs) {
  const want = expectationsOf(doc, snap, aiLead)
  for (const paper of PAPERS) {
    for (const tool of TOOLS) {
      const at = `${name} · ${paper} · ${tool}`
      // Page furniture (the running head, "page N of M") cut out first; see `withoutFurniture`.
      const s1 = withoutFurniture(read(`${name}.s1`, paper, tool), doc)
      const whole = read(name, paper, tool)
      for (const f of missing(s1, want.flags)) failures.push(`${at}: fired flag lost (${f.block}): ${divergence(s1, f.text)}`)
      for (const l of missing(s1, want.lines)) failures.push(`${at}: sheet 1 line lost (${l.block}): ${divergence(s1, l.text)}`)
      for (const s of declineSentences(whole, want.trialSigns, want.lineLabels)) failures.push(`${at}: states a decline for the trial's own sign: "${s}"`)
      for (const k of missing(whole, want.kept)) failures.push(`${at}: "How this record was kept" sentence lost (kept): ${divergence(whole, k.text)}`)
      const pua = [...whole].filter((c) => { const cp = c.codePointAt(0) ?? 0; return (cp >= 0xe000 && cp <= 0xf8ff) || cp === 0xfffd })
      if (pua.length > 0) failures.push(`${at}: ${pua.length} private-use or replacement code points in the text layer`)
      const kg = SMALL_CAT_WEIGHTS[name]
      if (kg !== undefined && !fold(s1).includes(fold(kg))) failures.push(`${at}: the weight "${kg}" did not read back on sheet 1`)
      checks += want.flags.length + want.lines.length + want.kept.length + 2
    }
  }
}
if (only === null) for (const kg of Object.keys(SMALL_CAT_WEIGHTS)) if (!docs.some((d) => d.name === kg)) failures.push(`fixture ${kg} is missing`)

if (failures.length > 0) {
  console.error(`${failures.length} extraction failures over ${docs.length} fixtures:`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  Deno.exit(1)
}
console.log(`extraction green: ${docs.length} fixtures × ${PAPERS.length} papers × ${TOOLS.length} extractors, ${checks} assertions`)
