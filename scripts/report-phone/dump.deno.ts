// Writes every v2 fixture's print and phone HTML to a directory, for `guard.mjs` (CUL-2295).
// Usage: deno run --allow-read --allow-write --allow-env scripts/report-phone/dump.deno.ts <outDir>
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { renderPhoneV2 } from '../../supabase/functions/generate-report/renderPhoneV2.ts'
import { v2DocFixtures } from './fixtures.deno.ts'

const out = Deno.args[0]
if (!out) throw new Error('usage: dump.deno.ts <outDir>')
Deno.mkdirSync(out, { recursive: true })
const names: string[] = []
for (const [name, snap] of v2DocFixtures()) {
  const doc = buildDocumentV2(snap, { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] })
  Deno.writeTextFileSync(`${out}/${name}.print.html`, renderPrintV2(doc))
  Deno.writeTextFileSync(`${out}/${name}.phone.html`, renderPhoneV2(doc))
  names.push(name)
}
Deno.writeTextFileSync(`${out}/fixtures.json`, JSON.stringify(names))
console.log(`wrote ${names.length} fixtures to ${out}`)
