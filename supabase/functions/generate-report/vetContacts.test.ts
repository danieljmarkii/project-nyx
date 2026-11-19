// CUL-2770 (Vet contacts PR-08): the vet report's "Vet contacts in this period" list and a course's
// source line. Spec docs/nyx-vet-contacts-requirements.md §4.7, AC 6–8 (report half), AC 19 (server
// half), AC 1 (flag off). The PM's real payload: Nyx, an exam on Sep 18, a phone call on Nov 9 that
// started Motazol, texts screenshotted; the report made on Nov 14.
import { strict as assert } from 'node:assert'
import { assembleReport, type ReportInput, type ReportMedicationInput, type ReportVetContactInput } from './report.ts'
import { renderReport } from './render.ts'
import { backSheetsOf, MEDICATION_SHEET_TITLE } from './backSheetsV2.ts'
import { mapVetContactRows, mapVetVisitRows, pullVetContacts, VET_CONTACTS_FLAG } from './index.ts'
import { courseSourceOf, vetContactRowsOf } from './vetContacts.ts'

const NOW = '2026-11-14T15:00:00.000Z'
const OWNER = 'owner-1'

/** The two `vet_visits` rows as the server holds them (channel as stored). */
function visitRows(nov9Channel: string) {
  return [
    { id: 'v-sep18', visited_at: '2026-09-18', channel: 'in_clinic', reason: 'Potential ear infection', clinic_name: 'Completely Cat Clinic', vet_name: 'Dr Miller' },
    { id: 'v-nov9', visited_at: '2026-11-09', channel: nov9Channel, reason: 'Ear, still shaking her head', clinic_name: null, vet_name: null },
  ]
}

const MOTAZOL: ReportMedicationInput = {
  id: 'med-motazol',
  medicationItemId: null,
  drugName: 'Motazol',
  doseAmount: null,
  route: null,
  dosesPerDay: null,
  scheduleNotes: null,
  indication: null,
  prescribedBy: null,
  startedAt: '2026-11-09',
  targetDurationDays: null,
  status: 'active',
  endedAt: null,
  vetVisitId: 'v-nov9',
}

/** The input `buildReportSnapshotForPet` hands `assembleReport`, from the server's rows. */
function input(opts: {
  nov9Channel?: string
  flagOn?: boolean
  docsLinked?: boolean
  medications?: ReportMedicationInput[]
  incompletePulls?: string[]
  requestedWindow?: { startDate: string; endDate: string } | null
  contacts?: ReportVetContactInput[]
} = {}): ReportInput {
  const rows = visitRows(opts.nov9Channel ?? 'phone')
  const docs = opts.docsLinked ? [{ id: 'doc-1', vet_visit_id: 'v-nov9' }] : []
  return {
    now: NOW,
    timezone: 'America/Chicago',
    engineFlags: { on: [], readOk: true },
    audience: { kind: 'owner', includeLookNotes: false },
    pet: { id: 'pet-nyx', name: 'Nyx', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2023-05-01', weightKg: 4 },
    ownerName: 'Fixture Owner',
    requestedWindow: opts.requestedWindow ?? null,
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: opts.medications ?? [MOTAZOL],
    dietTrials: [],
    // The window's input: the exam-only pull, as index.ts maps it.
    vetVisits: mapVetVisitRows(rows),
    ...(opts.flagOn === false ? {} : { vetContacts: opts.contacts ?? mapVetContactRows(rows, docs) }),
    feedingArrangements: [],
    conditions: [],
    incompletePulls: opts.incompletePulls ?? [],
  } as ReportInput
}

function sectionOf(html: string): string {
  const at = html.indexOf('<h2>Vet contacts in this period</h2>')
  assert.ok(at > 0, 'the section renders')
  return html.slice(at, html.indexOf('</div>\n  </div>', at))
}

// ── AC 6 — the window stays at the exam; the call is listed in it ───────────────────────────────

Deno.test('AC 6 — Sep 18 exam + Nov 9 phone, on Nov 14: rung 1 is Sep 18 and the list holds both, in date order', () => {
  const snap = assembleReport(input())
  assert.equal(snap.scope.basis, 'since_visit')
  assert.equal(snap.scope.startDate, '2026-09-18')
  assert.deepEqual(snap.vetContacts?.rows.map((r) => [r.date, r.channel]), [['2026-09-18', 'in_clinic'], ['2026-11-09', 'phone']])
  const sec = sectionOf(renderReport(snap))
  assert.ok(sec.indexOf('Sep 18') < sec.indexOf('Nov 9'), 'date order')
  assert.match(sec, /<b>Visit<\/b> &middot; Exam\. Potential ear infection\. Completely Cat Clinic, Dr Miller\./)
  assert.match(sec, /<b>Phone<\/b> &middot; Consult, no exam\. Ear, still shaking her head\. Started: Motazol\./)
})

Deno.test('AC 6 — a call never becomes the exam: the phone row says "no exam" and no clinic is printed on it', () => {
  const sec = sectionOf(renderReport(assembleReport(input())))
  const phone = sec.slice(sec.indexOf('<b>Phone</b>'))
  assert.doesNotMatch(phone.slice(0, phone.indexOf('</span></div>')), /Exam\./)
})

Deno.test('the list is bounded by the window: a contact before the window start or after its end is not listed', () => {
  const contacts: ReportVetContactInput[] = [
    { id: 'a', visitedAt: '2026-09-01', channel: 'email', reason: null, clinicName: null, vetName: null, hasDocuments: false },
    { id: 'b', visitedAt: '2026-09-18', channel: 'in_clinic', reason: null, clinicName: null, vetName: null, hasDocuments: false },
    { id: 'c', visitedAt: '2026-11-14', channel: 'text', reason: null, clinicName: null, vetName: null, hasDocuments: false },
    { id: 'd', visitedAt: '2026-11-15', channel: 'phone', reason: null, clinicName: null, vetName: null, hasDocuments: false },
  ]
  const rows = vetContactRowsOf(contacts, [], { startDate: '2026-09-18', endDate: '2026-11-14' })
  assert.deepEqual(rows.map((r) => r.id), ['b', 'c'])
})

Deno.test('a hand-picked past window lists only its own days; the course source still names a call outside it, year-stamped', () => {
  const snap = assembleReport(input({ requestedWindow: { startDate: '2026-10-01', endDate: '2026-11-12' } }))
  assert.deepEqual(snap.vetContacts?.rows.map((r) => r.id), ['v-nov9'])
  const inside = assembleReport(input({ requestedWindow: { startDate: '2026-11-10', endDate: '2026-11-14' } }))
  assert.equal(inside.vetContacts?.rows.length, 0)
  const html = renderReport(inside)
  assert.doesNotMatch(html, /Vet contacts in this period/, 'no section when the window holds none and the pull was whole')
  assert.match(html, /started after the Nov 9, 2026 phone consult/)
})

// ── AC 7 — the course names its source ──────────────────────────────────────────────────────────

Deno.test('AC 7 — a course started from the call reads "started after the Nov 9 phone consult"', () => {
  const snap = assembleReport(input())
  assert.deepEqual(snap.medications[0].sourceContact, { date: '2026-11-09', channel: 'phone', inWindow: true, stampYear: false })
  assert.match(renderReport(snap), /Motazol<\/span><span>[^<]*started after the Nov 9 phone consult/)
})

Deno.test('AC 7 — each remote channel has its consult noun; a course from an exam gets no source line', () => {
  for (const [ch, noun] of [['text', 'text consult'], ['email', 'email consult']] as const) {
    assert.match(renderReport(assembleReport(input({ nov9Channel: ch }))), new RegExp(`started after the Nov 9 ${noun}`))
  }
  const fromExam = assembleReport(input({ medications: [{ ...MOTAZOL, vetVisitId: 'v-sep18', startedAt: '2026-09-18' }] }))
  assert.equal(fromExam.medications[0].sourceContact, undefined)
  assert.doesNotMatch(renderReport(fromExam), /started after/)
})

Deno.test('AC 7 — a link to a row the pull did not return (deleted) prints no source, never a guess', () => {
  assert.equal(courseSourceOf({ vetVisitId: 'gone', startedAt: '2026-11-09' }, mapVetContactRows(visitRows('phone'), []), { startDate: '2026-09-18', endDate: '2026-11-14' }), null)
})

Deno.test('the longest name prints whole and as stored, never re-cased; a dose line prints only what the course holds', () => {
  const name = 'Otomax® (gentamicin sulfate, betamethasone valerate & clotrimazole) Otic Ointment, 7.5g — RIGHT ear ONLY'
  const snap = assembleReport(input({ medications: [{ ...MOTAZOL, drugName: name }] }))
  const html = renderReport(snap)
  const escaped = name.replace(/&/g, '&amp;')
  assert.ok(html.includes(`Started: ${escaped}.`), 'the section names it whole')
  assert.ok(html.includes(`<span class="k">${escaped}</span>`), 'the course line names it whole')
  // Nothing the record does not hold: no strength, dose, route or frequency was entered.
  const line = html.slice(html.indexOf(`<span class="k">${escaped}</span>`))
  assert.doesNotMatch(line.slice(0, line.indexOf('</div>')), /\bmg\b|×\/day/)
})

Deno.test('two courses from one call are listed in start order, then name', () => {
  const meds = [
    { ...MOTAZOL, id: 'm2', drugName: 'Zeta drops', startedAt: '2026-11-10' },
    { ...MOTAZOL, id: 'm1', drugName: 'alpha cleanser', startedAt: '2026-11-09' },
    { ...MOTAZOL, id: 'm3', drugName: 'Beta wipes', startedAt: '2026-11-09' },
  ]
  const snap = assembleReport(input({ medications: meds }))
  assert.deepEqual(snap.vetContacts?.rows[1].started, ['alpha cleanser', 'Beta wipes', 'Zeta drops'])
})

// ── AC 8 — documents never render ───────────────────────────────────────────────────────────────

Deno.test('AC 8 — a linked document is named as held on the phone, never rendered', () => {
  const sec = sectionOf(renderReport(assembleReport(input({ docsLinked: true }))))
  assert.match(sec, /Documents on the owner&rsquo;s phone, not attached\./)
  assert.doesNotMatch(sec, /doc-1|<img|storage|\.pdf/i)
  for (const [ch, noun] of [['text', 'Texts'], ['email', 'Email']] as const) {
    assert.match(sectionOf(renderReport(assembleReport(input({ nov9Channel: ch, docsLinked: true })))), new RegExp(`${noun} on the owner&rsquo;s phone, not attached`))
  }
  assert.doesNotMatch(sectionOf(renderReport(assembleReport(input()))), /not attached/, 'nothing linked, nothing said')
})

Deno.test('AC 8 — the document pull selects the link and nothing else (Vet Files D14)', () => {
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  const at = src.indexOf("supabase.from('vet_documents')")
  assert.ok(at > 0)
  assert.equal(src.indexOf("supabase.from('vet_documents')", at + 1), -1, 'one document read in the report')
  const chain = src.slice(at, src.indexOf('.range(from, to)', at))
  assert.match(chain, /\.select\('id, vet_visit_id', \{ count: 'exact' \}\)/)
})

// ── AC 19 (server half) — an edited channel moves the window, both ways ─────────────────────────

Deno.test('AC 19 — Nov 9 edited Phone → At the clinic moves rung 1 to Nov 9; back to Phone returns it to Sep 18', () => {
  const asExam = assembleReport(input({ nov9Channel: 'in_clinic' }))
  assert.equal(asExam.scope.startDate, '2026-11-09')
  assert.deepEqual(asExam.vetContacts?.rows.map((r) => [r.date, r.channel]), [['2026-11-09', 'in_clinic']])
  assert.equal(asExam.medications[0].sourceContact, undefined, 'a course from an exam has no consult line')
  const sec = sectionOf(renderReport(asExam))
  assert.match(sec, /<b>Visit<\/b> &middot; Exam\. Ear, still shaking her head\./)
  assert.doesNotMatch(sec, /no exam/)

  const back = assembleReport(input({ nov9Channel: 'phone' }))
  assert.equal(back.scope.startDate, '2026-09-18')
  assert.match(sectionOf(renderReport(back)), /<b>Phone<\/b> &middot; Consult, no exam\./)
})

// ── AC 1 — flag off ─────────────────────────────────────────────────────────────────────────────

Deno.test('AC 1 — flag off: the snapshot carries no new key and the page is the page without this feature', () => {
  const off = assembleReport(input({ flagOn: false }))
  assert.ok(!('vetContacts' in off))
  assert.ok(off.medications.every((m) => !('sourceContact' in m)))
  // Against the feature's ABSENCE (C-36): the same record with no contact link at all.
  const absent = assembleReport(input({ flagOn: false, medications: [{ ...MOTAZOL, vetVisitId: undefined }] }))
  assert.equal(renderReport(off), renderReport(absent))
  assert.doesNotMatch(renderReport(off), /Vet contacts|consult/)
  // Non-vacuous: the same record with the flag on does render both.
  assert.match(renderReport(assembleReport(input())), /Vet contacts in this period[\s\S]*started after the Nov 9 phone consult/)
})

Deno.test('AC 1 — flag off reads no visit or document row; on, it reads both; a failed flag read is off', async () => {
  const fake = (flag: unknown, opts: { throwFlag?: boolean } = {}) => {
    const read: string[] = []
    const chain = (table: string) => {
      read.push(table)
      const rows: Record<string, unknown[]> = {
        app_config: flag === undefined ? [] : [{ key: VET_CONTACTS_FLAG, value: flag }],
        vet_visits: visitRows('phone'),
        vet_documents: [{ id: 'doc-1', vet_visit_id: 'v-nov9' }],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'not', 'order']) q[m] = () => q
      q.range = () => Promise.resolve({ data: rows[table], error: null, count: rows[table].length })
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        (opts.throwFlag ? Promise.reject(new Error('down')) : Promise.resolve({ data: rows[table], error: null })).then(res, rej)
      return q
    }
    return { client: { from: chain } as never, read }
  }
  const off = fake({ enabled: false, allowlist: [] })
  assert.deepEqual(await pullVetContacts(off.client, 'pet-nyx', OWNER), { contacts: null, incomplete: [] })
  assert.deepEqual(off.read, ['app_config'])

  const missing = fake(undefined)
  assert.equal((await pullVetContacts(missing.client, 'pet-nyx', OWNER)).contacts, null)
  const broken = fake({ enabled: true, allowlist: [] }, { throwFlag: true })
  assert.equal((await pullVetContacts(broken.client, 'pet-nyx', OWNER)).contacts, null)

  const on = fake({ enabled: false, allowlist: [OWNER] })
  const r = await pullVetContacts(on.client, 'pet-nyx', OWNER)
  assert.deepEqual(on.read.sort(), ['app_config', 'vet_documents', 'vet_visits'])
  assert.deepEqual(r.contacts?.map((c) => [c.id, c.channel, c.hasDocuments]), [['v-sep18', 'in_clinic', false], ['v-nov9', 'phone', true]])
  assert.deepEqual(r.incomplete, [])
})

// ── Fail loud on a short read; never print an unknown channel ───────────────────────────────────

Deno.test('a short contacts read is disclosed in the section and on page 1, even with no row in the window', () => {
  const html = renderReport(assembleReport(input({ incompletePulls: ['vet_contacts'], contacts: [] })))
  assert.match(html, /The vet contact record could not be read in full; a contact in this window may be missing\./)
  assert.match(html, /vet contacts could not be read/)
})

Deno.test('a channel outside the CHECK is never printed, as an exam or as a contact', () => {
  const rows = mapVetContactRows([...visitRows('phone'), { id: 'x', visited_at: '2026-10-01', channel: 'fax', reason: null, clinic_name: null, vet_name: null }], [])
  assert.deepEqual(rows.map((r) => r.id), ['v-sep18', 'v-nov9'])
  assert.deepEqual(mapVetContactRows([{ ...visitRows('phone')[1], channel: null }], []), [])
})

Deno.test('a window that crosses a year stamps every listed day with its year (C-19)', () => {
  const contacts: ReportVetContactInput[] = [
    { id: 'a', visitedAt: '2025-12-20', channel: 'in_clinic', reason: null, clinicName: null, vetName: null, hasDocuments: false },
    { id: 'b', visitedAt: '2026-01-05', channel: 'phone', reason: null, clinicName: null, vetName: null, hasDocuments: false },
  ]
  const snap = assembleReport({
    ...input({ contacts }),
    now: '2026-01-10T15:00:00.000Z',
    vetVisits: [{ visitedAt: '2025-12-20', clinicName: null, vetName: null, reason: null }],
    medications: [],
  })
  const sec = sectionOf(renderReport(snap))
  assert.match(sec, /Dec 20, 2025/)
  assert.match(sec, /Jan 5, 2026/)
})

// ── v2: the Medications back sheet leads with the list (decision 2) ──────────────────────────────

Deno.test('v2 — the list leads the Medications sheet when on, and is absent when off', () => {
  const sheetOf = (snap: ReturnType<typeof assembleReport>) => backSheetsOf(snap).find((s) => s.title === MEDICATION_SHEET_TITLE)
  const on = sheetOf(assembleReport(input()))
  assert.equal(on?.blocks[0].id, 'vet-contacts')
  const b = on?.blocks[0]
  assert.ok(b && b.kind === 'section')
  assert.equal(b.heading, 'Vet contacts in this period')
  assert.match(b.html, /Consult, no exam\./)
  const off = sheetOf(assembleReport(input({ flagOn: false })))
  assert.ok(off?.blocks.every((x) => x.id !== 'vet-contacts'))
})

// ── Adversarial pass 1 (CUL-2770): the breaks, pinned ───────────────────────────────────────────

Deno.test('pass 1 — v2 sheet 1 never carries the list (decision 2); the Medications sheet does, and sheet 1 keeps the source line', async () => {
  const { carriedSectionsOf } = await import('./sheet1CarryV2.ts')
  const snap = assembleReport(input())
  const carried = carriedSectionsOf(snap, null)
  assert.ok(carried.length > 0, 'non-vacuous: sheet 1 carries v1 sections')
  assert.ok(carried.every((c) => !/vet contacts in this period/i.test(c.html)), 'no contacts list on sheet 1')
  const dietMeds = carried.find((c) => c.id === 'diet-meds')
  assert.ok(dietMeds && /started after the Nov 9 phone consult/.test(dietMeds.html), 'the course line keeps its source on sheet 1')
})

Deno.test('pass 1 — a course begun BEFORE the call it is linked to never reads "started after", nor "Started:" under the call', () => {
  const snap = assembleReport(input({ medications: [{ ...MOTAZOL, startedAt: '2026-11-02' }] }))
  assert.equal(snap.medications[0].sourceContact, undefined)
  assert.deepEqual(snap.vetContacts?.rows.find((r) => r.id === 'v-nov9')?.started, [])
  assert.doesNotMatch(renderReport(snap), /started after|Started: Motazol/)
  // Same day is "after" (the call came first on the record's day grain).
  assert.ok(assembleReport(input()).medications[0].sourceContact)
})

Deno.test('pass 1 — a link to a contact dated after the report prints no source', () => {
  const rows = [...visitRows('phone'), { id: 'v-nov20', visited_at: '2026-11-20', channel: 'phone', reason: null, clinic_name: null, vet_name: null }]
  const snap = assembleReport({
    ...input({ medications: [{ ...MOTAZOL, startedAt: '2026-11-20', vetVisitId: 'v-nov20' }] }),
    vetContacts: mapVetContactRows(rows, []),
  })
  assert.equal(snap.medications[0].sourceContact, undefined)
  assert.doesNotMatch(renderReport(snap), /started after/)
})

Deno.test('pass 1 — a window crossing a year stamps the source line by band, like the list', () => {
  const contacts: ReportVetContactInput[] = [
    { id: 'ex', visitedAt: '2025-12-20', channel: 'in_clinic', reason: null, clinicName: null, vetName: null, hasDocuments: false },
    { id: 'tx', visitedAt: '2025-12-28', channel: 'text', reason: null, clinicName: null, vetName: null, hasDocuments: false },
  ]
  const snap = assembleReport({
    ...input({ contacts, medications: [{ ...MOTAZOL, startedAt: '2025-12-28', vetVisitId: 'tx' }] }),
    now: '2026-01-10T15:00:00.000Z',
    vetVisits: [{ visitedAt: '2025-12-20', clinicName: null, vetName: null, reason: null }],
  })
  assert.match(renderReport(snap), /started after the Dec 28, 2025 text consult/)
})

Deno.test('pass 1 — a supplement started from a call names its source too', () => {
  const snap = assembleReport(input({ medications: [{ ...MOTAZOL, drugName: 'Fish oil', isPrescription: false }] }))
  assert.match(renderReport(snap), /Fish oil[\s\S]*\(owner-reported, OTC\), started after the Nov 9 phone consult — a concurrent change/)
})

Deno.test('pass 1 — the short-read note names what was short', () => {
  const html = renderReport(assembleReport(input({ incompletePulls: ['vet_documents'] })))
  assert.match(html, /could not be read in full; a note that the vet sent documents may be missing\./)
})
