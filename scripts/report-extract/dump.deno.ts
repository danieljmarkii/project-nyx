// Writes every extraction fixture's v2 print HTML to a directory, for `print.mjs` (CUL-2292).
// Usage: deno run --allow-read --allow-write --allow-env scripts/report-extract/dump.deno.ts <outDir>
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { extractionDocs } from './docs.deno.ts'

const out = Deno.args[0]
if (!out) throw new Error('usage: dump.deno.ts <outDir>')
Deno.mkdirSync(out, { recursive: true })
const names: string[] = []
for (const { name, doc } of extractionDocs(buildDocumentV2)) {
  // The whole document, and sheet 1 alone: a line sheet 1 lost must not pass by surviving on a
  // back sheet that repeats it, so the sheet 1 assertions read a PDF of sheet 1 only.
  Deno.writeTextFileSync(`${out}/${name}.html`, renderPrintV2(doc))
  Deno.writeTextFileSync(`${out}/${name}.s1.html`, renderPrintV2({ ...doc, backSheets: [] }))
  names.push(name, `${name}.s1`)
}
Deno.writeTextFileSync(`${out}/fixtures.json`, JSON.stringify(names))
console.log(`wrote ${names.length} fixtures to ${out}`)
