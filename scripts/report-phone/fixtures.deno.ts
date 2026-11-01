// The fixtures the v2 sheet is held to, by canonical id, for the phone reflow's tests and its
// browser guard (CUL-2295). The same list `documentV2.test.ts` walks: every one is a snapshot a
// production caller can hand over (built through `assembleReport`, or nyx-live's real record).
// It lives outside `generate-report/` because it builds an owner-audience snapshot, which only
// that function's handler may do (guards/reportLookPull.test.ts).
import { assembleReport, type ReportSnapshot } from '../../supabase/functions/generate-report/report.ts'
import { cooperInput } from '../../supabase/functions/generate-report/cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../../supabase/functions/generate-report/nyxLive.testutil.ts'
import { itchingSkinTrial, juniper, olive, wobblingSkinTrial } from '../../supabase/functions/generate-report/v2Fixtures.testutil.ts'
import { sampleCases } from '../render-trial-report-sample.deno.ts'

export function v2DocFixtures(): Array<[string, ReportSnapshot]> {
  const out: Array<[string, ReportSnapshot]> = [
    ['nyx-live', nyxLiveSnapshot()],
    ['cooper', assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })],
    ['r11-steady', assembleReport(itchingSkinTrial({ jump: false }))],
    ['r11-jump', assembleReport(itchingSkinTrial({ jump: true }))],
    ['r11-wobble', assembleReport(wobblingSkinTrial())],
    ['new-account-4-days', assembleReport(juniper())],
    ['looks-only', assembleReport(olive())],
  ]
  for (const [name, input] of sampleCases()) out.push([name === 'trial-report-refused.html' ? 'mira' : name.replace(/\.html$/, ''), assembleReport(input)])
  return out
}
