// The fact payloads the bake-off's adversarial set runs on (CUL-2380). Each is built here from the
// same test utilities the adversarial passes used, and committed as JSON under
// aiLead/exhibits/adversarial/fixtures/ so the bake-off harness can read them
// without running the report code. adversarialSet.test.ts pins every committed file byte-equal to
// what this module builds, so the set never drifts from the code that ships.
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { cooperInput } from '../cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { itchingSkinTrial, olive } from '../v2Fixtures.testutil.ts'
import { buildLeadFacts, documentForLead, type LeadFactPayload } from './facts.ts'

function payloadOf(s: ReportSnapshot): LeadFactPayload {
  const f = buildLeadFacts(documentForLead(s), {
    petName: s.signalment.name,
    species: s.signalment.species,
    recordStart: s.scope.startDate,
    recordEnd: s.scope.endDate,
    includeLookNotes: false,
  })
  if (!f.eligible) throw new Error(`not eligible: ${f.reason}`)
  return f.payload
}

/** The bake-off's Nyx table in the v2 payload's shape (as checkerRegression.test.ts builds it). */
async function bakeoffNyx(): Promise<LeadFactPayload> {
  const raw = JSON.parse(await Deno.readTextFile(new URL('./exhibits/facts-nyx.json', import.meta.url))) as {
    facts: Array<{ id: string; role?: string; text: string }>
  }
  return {
    pet_name: 'Nyx',
    species: 'cat',
    record_start: '2026-05-14',
    record_end: '2026-07-02',
    band: raw.facts.filter((x) => x.role === 'band').map((x) => ({ id: x.id, label: x.id === 'S1' ? 'Foreign material' : x.id, text: x.text })),
    record_lines: raw.facts.filter((x) => x.role !== 'band').map((x) => ({ id: x.id, kind: 'record' as const, text: x.text })),
    trial_line: null,
    record_edge: [],
  }
}

/** verify.test.ts's H2 exhibit: the new-foods window as its own line. */
const H2: LeadFactPayload = {
  pet_name: 'Nyx',
  species: 'cat',
  record_start: '2026-09-17',
  record_end: '2026-10-31',
  band: [],
  record_lines: [
    { id: 'line-1', kind: 'lead', text: 'Vomiting: 6 entries on 4 days from Oct 26 to Oct 31, and 0 entries Oct 19 to Oct 25.' },
    { id: 'new-foods', kind: 'record', text: 'Chicken foods first fed Oct 21; vomiting on 4 days Oct 26 to Oct 31, side by side, not as a cause.' },
  ],
  trial_line: { id: 'trial', text: 'Diet trial (owner-entered): Rabbit diet, from Sep 17, 2026, ended Oct 20, 2026.' },
  record_edge: [],
}

export async function adversarialFixtures(): Promise<Record<string, LeadFactPayload>> {
  const ci = cooperInput()
  return {
    'nyx-v2': payloadOf(nyxLiveSnapshot()),
    'r11': payloadOf(assembleReport(itchingSkinTrial({ jump: false }))),
    'r11-jump': payloadOf(assembleReport(itchingSkinTrial({ jump: true }))),
    'cooper': payloadOf(assembleReport({ ...ci, audience: { kind: 'owner', includeLookNotes: false } })),
    'cooper-cat': payloadOf(assembleReport({ ...ci, pet: { ...ci.pet, species: 'cat' as const }, audience: { kind: 'owner', includeLookNotes: false } })),
    'bakeoff-nyx': await bakeoffNyx(),
    'h2': H2,
    // CUL-2621 option (a), PM 2026-11-07: a real band-empty record, so the third run tests a lead
    // that may print on shipped code's own table (CUL-2323's `looks-only` cat: no symptom entry,
    // "sleeping more" on 6 days, 3 meals not finished in the last 3 days).
    'olive': payloadOf(assembleReport(olive())),
  }
}
