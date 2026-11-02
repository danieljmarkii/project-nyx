// Writes every v2 fixture's print, phone and exam-room HTML to a directory, for `guard.mjs`
// (CUL-2295; the exam room, CUL-2299: the exact document the app's exam room shows).
// Usage: deno run --allow-read --allow-write --allow-env scripts/report-phone/dump.deno.ts <outDir>
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { renderPhoneV2 } from '../../supabase/functions/generate-report/renderPhoneV2.ts'
import { v2DocFixtures } from './fixtures.deno.ts'
import { examRoomHtml } from '../../lib/examRoom.ts'
import { theme } from '../../constants/theme.ts'

const out = Deno.args[0]
if (!out) throw new Error('usage: dump.deno.ts <outDir>')
Deno.mkdirSync(out, { recursive: true })
const names: string[] = []
for (const [name, snap] of v2DocFixtures()) {
  const doc = buildDocumentV2(snap, { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] })
  Deno.writeTextFileSync(`${out}/${name}.print.html`, renderPrintV2(doc))
  const phone = renderPhoneV2(doc)
  Deno.writeTextFileSync(`${out}/${name}.phone.html`, phone)
  const exam = examRoomHtml(phone, theme.colorNeutralDark)
  if (exam === null) throw new Error(`${name}: the exam room refused the phone document`)
  Deno.writeTextFileSync(`${out}/${name}.exam.html`, exam)
  names.push(name)
}
Deno.writeTextFileSync(`${out}/fixtures.json`, JSON.stringify(names))
console.log(`wrote ${names.length} fixtures to ${out}`)
