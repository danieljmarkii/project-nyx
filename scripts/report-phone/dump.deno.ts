// Writes every v2 fixture's print, phone and exam-room HTML to a directory, for `guard.mjs`
// (CUL-2295; the exam room, CUL-2299: the exact document the app's exam room shows).
// Usage: deno run --allow-read --allow-write --allow-env scripts/report-phone/dump.deno.ts <outDir>
import { buildDocumentV2 } from '../../supabase/functions/generate-report/documentV2.ts'
import { renderPrintV2 } from '../../supabase/functions/generate-report/renderPrintV2.ts'
import { renderPhoneV2 } from '../../supabase/functions/generate-report/renderPhoneV2.ts'
import { v2DocFixtures } from './fixtures.deno.ts'
import { examRoomHtml, printedViewAllowed, printedWarningOf } from '../../lib/examRoom.ts'
import { theme } from '../../constants/theme.ts'

const out = Deno.args[0]
if (!out) throw new Error('usage: dump.deno.ts <outDir>')
Deno.mkdirSync(out, { recursive: true })
const names: string[] = []
for (const [name, snap] of v2DocFixtures()) {
  const doc = buildDocumentV2(snap, { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] })
  const print = renderPrintV2(doc)
  Deno.writeTextFileSync(`${out}/${name}.print.html`, print)
  const phone = renderPhoneV2(doc)
  Deno.writeTextFileSync(`${out}/${name}.phone.html`, phone)
  const exam = examRoomHtml(phone, theme.colorNeutralDark)
  if (exam === null) throw new Error(`${name}: the exam room refused the phone document`)
  Deno.writeTextFileSync(`${out}/${name}.exam.html`, exam)
  // The printed page's pinned warning (CUL-2430 ruling (a)): every record with a confounder line
  // has one, and it is the line's own lead, word for word.
  const conf = doc.blocks.find((b) => b.kind === 'confounder')
  const warn = printedWarningOf(phone)
  if (conf && conf.kind === 'confounder' && warn !== conf.lead) throw new Error(`${name}: the printed page would pin "${warn}", not the line's lead "${conf.lead}"`)
  if (!conf && warn !== null) throw new Error(`${name}: a printed-page warning with no confounder line`)
  if (!printedViewAllowed(phone, print)) throw new Error(`${name}: the room would withhold Printed page for today's renderer`)
  names.push(name)
}
Deno.writeTextFileSync(`${out}/fixtures.json`, JSON.stringify(names))
console.log(`wrote ${names.length} fixtures to ${out}`)
