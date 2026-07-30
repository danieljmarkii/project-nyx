// Render a diet-trial vet report to HTML, for the `vet-report-cold-read` pass
// (B-417 PR 7). Deno, pure — no network, no Supabase.
//
//   deno run --allow-write --allow-read scripts/render-trial-report-sample.deno.ts <outdir>
//
// The `.deno.ts` suffix keeps it out of the app's `tsc` run (tsconfig excludes
// `scripts/*.deno.ts`): this file is a Deno entry point into the Edge Function graph,
// so `Deno` is a global here and is not in the app's type environment.
//
// The point of this script is that the cold read has an ARTIFACT to read. §1.2's
// corollary: because `hasTrial` gated them, the trial branches of the vet report
// have never rendered in any artifact `vet-report-cold-read` has ever seen. Two
// cases are emitted because the second is the one the design lock says ships
// broken — a normal-looking page rendering over an abnormal pet:
//
//   trial-report-clean.html  — Cooper, day 46 of 56 of a hydrolyzed skin trial,
//                              well logged, three slips, an overlapping Apoquel.
//   trial-report-refused.html — Mira, a cat who would not eat the diet, stopped at
//                              day 19, with a free-fed bowl still down.
//
// B-532 added a third, because two of that pass's findings had no artifact that
// reproduced them — a completed trial and an on-list free-fed bowl are both states
// the first two cases never enter:
//
//   trial-report-completed.html — Rosie, a skin trial the owner marked COMPLETE at
//                              day 49 of 56, whose trial diet also sits in a
//                              free-choice bowl. The first exercises the
//                              "Ran its course" claim against the target; the
//                              second is the B-599 shape, where the affirmative
//                              clean sentence is withheld and the row the page
//                              used to point at does not exist.
import { assembleReport, type ReportEventInput, type ReportInput } from '../supabase/functions/generate-report/report.ts'
import { renderReport } from '../supabase/functions/generate-report/render.ts'

const NOW = '2026-07-02T18:00:00Z'
const TZ = 'America/New_York'

let n = 0
function eid(p: string): string {
  n += 1
  return `${p}-${String(n).padStart(4, '0')}`
}

function days(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10))
  }
  return out
}

function meal(o: {
  date: string
  time?: string
  brand: string
  product: string
  foodItemId: string
  foodType?: 'meal' | 'treat' | 'other'
  format?: string | null
  proteins?: string[] | null
  ingredientsNotes?: string | null
  intakeRating?: string | null
  notes?: string | null
}): ReportEventInput {
  const t = o.time ?? '07:30:00'
  return {
    id: eid('meal'),
    type: 'meal',
    occurredAt: `${o.date}T${t}Z`,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: o.notes ?? null,
    loggedAt: `${o.date}T${t}Z`,
    meal: {
      foodItemId: o.foodItemId,
      intakeRating: (o.intakeRating ?? null) as never,
      quantity: null,
      foodType: o.foodType ?? 'meal',
      format: (o.format ?? null) as never,
      primaryProtein: (o.proteins ?? [])[0] ?? null,
      proteins: o.proteins ?? null,
      ingredientsNotes: o.ingredientsNotes ?? null,
      extractionConfidence: o.ingredientsNotes ? { proteins: 0.93 } : null,
      brand: o.brand,
      productName: o.product,
    },
  }
}

// Times VARY, deliberately. The first cold read flagged 15 itching events all stamped
// "16:10 seen": identical witnessed-to-the-minute times across fifteen events is not
// credible and will make a real vet distrust every timestamp on the page. A fixture that
// is not plausible is not a fixture the cold read can grade.
const SYM_TIMES = ['18:40:00', '21:05:00', '13:20:00', '23:50:00', '16:35:00', '11:10:00', '20:15:00']
function sym(type: string, date: string, time?: string, notes: string | null = null): ReportEventInput {
  const t = time ?? SYM_TIMES[(Date.parse(`${date}T00:00:00Z`) / 86_400_000) % SYM_TIMES.length]
  return {
    id: eid(type),
    type,
    occurredAt: `${date}T${t}Z`,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes,
    loggedAt: `${date}T${t}Z`,
    meal: null,
  }
}

// ── Case 1: the wedge case, well logged ──────────────────────────────────────

const HP = {
  foodItemId: 'f-hp',
  foodLabel: 'Royal Canin Hydrolyzed Protein HP',
  role: 'primary_diet',
  allowedFrom: '2026-05-18',
  allowedUntil: null,
  primaryProtein: 'soy',
  brand: 'Royal Canin',
  productName: 'Hydrolyzed Protein HP',
  proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein isolate, rice, animal fats, beet pulp',
}
const HP_WET = {
  ...HP,
  foodItemId: 'f-hp-wet',
  foodLabel: 'Royal Canin Hydrolyzed Protein HP Loaf',
  productName: 'Hydrolyzed Protein HP Loaf',
}
const VET_TREAT = {
  foodItemId: 'f-hyd-treat',
  foodLabel: 'Royal Canin Hydrolyzed Treats',
  role: 'permitted_treat',
  allowedFrom: '2026-05-18',
  allowedUntil: null,
  primaryProtein: 'soy',
  brand: 'Royal Canin',
  productName: 'Hydrolyzed Treats',
  proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein, rice starch',
}
const DENTASTIX = {
  foodItemId: 'f-ds',
  foodLabel: 'Pedigree Dentastix',
  role: 'permitted_treat',
  // Added mid-trial, at the week-3 recheck — so the report has to show the set
  // changing and score the days before it accordingly.
  allowedFrom: '2026-06-08',
  allowedUntil: null,
  primaryProtein: 'cereal',
  brand: 'Pedigree',
  productName: 'Dentastix',
  proteins: ['cereal', 'chicken'],
  ingredientsNotes: 'Cereals, glycerol, chicken by-product meal, minerals',
}

function cleanCase(): ReportInput {
  const events: ReportEventInput[] = []
  // Two meals a day of the trial diet, dry + wet, from the day the owner started
  // logging (three days after the vet-set start date — the car-park case).
  for (const d of days('2026-05-21', '2026-07-02')) {
    events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed Protein HP', foodItemId: 'f-hp', proteins: HP.proteins, ingredientsNotes: HP.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
    events.push(meal({ date: d, time: '18:15:00', brand: 'Royal Canin', product: 'Hydrolyzed Protein HP Loaf', foodItemId: 'f-hp-wet', proteins: HP.proteins, ingredientsNotes: HP.ingredientsNotes, intakeRating: d === '2026-06-24' ? 'most' : 'all', format: 'wet' }))
  }
  // The permitted vet treat, most days.
  for (const d of days('2026-05-21', '2026-07-02')) {
    if (d.endsWith('7')) continue
    events.push(meal({ date: d, time: '12:00:00', brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-hyd-treat', foodType: 'treat', format: 'treat', proteins: VET_TREAT.proteins, ingredientsNotes: VET_TREAT.ingredientsNotes }))
  }
  // Dentastix, permitted from the week-3 recheck onward — and once BEFORE it, which
  // is the dated-membership case.
  events.push(meal({ date: '2026-06-02', time: '21:00:00', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-ds', foodType: 'treat', format: 'treat', proteins: DENTASTIX.proteins, ingredientsNotes: DENTASTIX.ingredientsNotes }))
  for (const d of days('2026-06-08', '2026-07-02')) {
    events.push(meal({ date: d, time: '21:00:00', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-ds', foodType: 'treat', format: 'treat', proteins: DENTASTIX.proteins, ingredientsNotes: DENTASTIX.ingredientsNotes }))
  }
  // Three genuine slips: table chicken twice, and one day of the old kibble.
  events.push(meal({ date: '2026-06-14', time: '19:40:00', brand: 'Home', product: 'Roast chicken', foodItemId: 'f-hf', foodType: 'other', format: 'human_food', proteins: ['chicken'], notes: 'kids fed him at the table' }))
  events.push(meal({ date: '2026-06-27', time: '19:20:00', brand: 'Home', product: 'Roast chicken', foodItemId: 'f-hf', foodType: 'other', format: 'human_food', proteins: ['chicken'] }))
  events.push(meal({ date: '2026-06-21', time: '07:40:00', brand: 'Purina', product: 'Pro Plan Sensitive Skin', foodItemId: 'f-pp', foodType: 'meal', format: 'kibble', proteins: ['salmon', 'chicken'], ingredientsNotes: 'Salmon, rice, chicken by-product meal, fish oil', intakeRating: 'all', notes: 'ran out of the HP, one breakfast' }))

  // Itch and ear-scratching, falling through the trial.
  for (const d of ['2026-05-21', '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26', '2026-05-28', '2026-05-30', '2026-05-31', '2026-06-02', '2026-06-04', '2026-06-06']) {
    events.push(sym('itch', d))
  }
  for (const d of ['2026-06-11', '2026-06-16', '2026-06-19', '2026-06-25']) events.push(sym('itch', d))
  events.push(sym('itch', '2026-06-18', '21:00:00', 'flare after the chicken on Sunday'))
  events.push(sym('diarrhea', '2026-06-22', '06:40:00'))

  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-cooper',
      name: 'Cooper',
      species: 'dog',
      breed: 'Labrador Retriever',
      sex: 'male',
      dateOfBirth: '2020-03-14',
      neuterStatus: 'neutered',
      weightKg: 32.4,
    },
    ownerName: 'Jordan Reyes',
    events,
    aiAnalyses: [],
    weightChecks: [
      { eventId: 'w1', weightKg: 32.4, occurredAt: '2026-05-18T15:00:00Z' },
      { eventId: 'w2', weightKg: 32.1, occurredAt: '2026-06-08T15:00:00Z' },
      { eventId: 'w3', weightKg: 31.8, occurredAt: '2026-06-29T15:00:00Z' },
    ],
    doses: [
      { eventId: 'd1', occurredAt: '2026-06-05T09:00:00Z', medicationId: null, medicationItemId: 'mi-nex', adherence: 'given', doseAmount: '1 chew', pairedEventId: null },
      { eventId: 'd2', occurredAt: '2026-07-02T09:00:00Z', medicationId: null, medicationItemId: 'mi-nex', adherence: 'given', doseAmount: '1 chew', pairedEventId: null },
    ],
    medications: [
      {
        id: 'reg-apo',
        medicationItemId: 'mi-apo',
        drugName: 'Apoquel',
        doseAmount: '16 mg',
        route: 'oral',
        dosesPerDay: 1,
        scheduleNotes: 'evening',
        indication: 'pruritus',
        prescribedBy: 'Dr. A. Chen',
        startedAt: '2026-04-30',
        targetDurationDays: null,
        status: 'active',
        endedAt: null,
        isPrescription: true,
        strength: '16 mg',
      },
    ],
    medicationItems: [
      { id: 'mi-nex', genericName: 'afoxolaner', brandName: 'NexGard', strength: '68 mg', route: 'oral', isPrescription: true, form: 'chewable' },
      { id: 'mi-apo', genericName: 'oclacitinib', brandName: 'Apoquel', strength: '16 mg', route: 'oral', isPrescription: true, form: 'tablet' },
    ],
    dietTrials: [
      {
        id: 'trial-cooper',
        foodItemId: 'f-hp',
        startedAt: '2026-05-18',
        targetDurationDays: 56,
        status: 'active',
        completedAt: null,
        endedAt: null,
        indication: 'skin',
        vetName: 'Dr. A. Chen',
        foodLabel: 'Royal Canin Hydrolyzed Protein HP',
        primaryProtein: 'soy',
        proteins: HP.proteins,
        ingredientsNotes: HP.ingredientsNotes,
        extractionConfidence: { proteins: 0.93 },
        allowedFoods: [HP, HP_WET, VET_TREAT, DENTASTIX],
      },
    ],
    vetVisits: [{ visitedAt: '2026-05-18', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'chronic pruritus — start elimination diet' }],
    feedingArrangements: [],
    conditions: [{ conditionName: 'Chronic pruritus', status: 'active', diagnosedAt: '2026-03-02' }],
  }
}

// ── Case 2: the cat who would not eat it ─────────────────────────────────────

function refusedCase(): ReportInput {
  const events: ReportEventInput[] = []
  for (const d of days('2026-06-01', '2026-06-19')) {
    events.push(meal({ date: d, brand: "Hill's", product: 'z/d', foodItemId: 'f-zd', proteins: ['chicken'], ingredientsNotes: 'Hydrolysed chicken liver, corn starch', intakeRating: 'refused', format: 'wet' }))
    events.push(meal({ date: d, time: '18:00:00', brand: "Hill's", product: 'z/d', foodItemId: 'f-zd', proteins: ['chicken'], ingredientsNotes: 'Hydrolysed chicken liver, corn starch', intakeRating: d < '2026-06-05' ? 'some' : 'refused', format: 'wet' }))
  }
  for (const d of ['2026-06-03', '2026-06-07', '2026-06-11', '2026-06-14', '2026-06-17']) {
    events.push(sym('vomit', d))
  }
  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-mira',
      name: 'Mira',
      species: 'cat',
      breed: 'Domestic Shorthair',
      sex: 'female',
      dateOfBirth: '2018-07-01',
      neuterStatus: 'neutered',
      weightKg: 4.1,
    },
    ownerName: 'Sam Ortiz',
    events,
    aiAnalyses: [],
    weightChecks: [
      { eventId: 'mw1', weightKg: 4.4, occurredAt: '2026-06-01T15:00:00Z' },
      { eventId: 'mw2', weightKg: 4.1, occurredAt: '2026-06-19T15:00:00Z' },
    ],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [
      {
        id: 'trial-mira',
        foodItemId: 'f-zd',
        startedAt: '2026-06-01',
        targetDurationDays: 42,
        status: 'abandoned',
        completedAt: null,
        endedAt: '2026-06-19',
        indication: 'gi',
        stoppedReason: 'refused',
        vetName: 'Dr. A. Chen',
        foodLabel: "Hill's z/d",
        primaryProtein: 'chicken',
        proteins: ['chicken'],
        ingredientsNotes: 'Hydrolysed chicken liver, corn starch',
        extractionConfidence: { proteins: 0.93 },
        allowedFoods: [
          {
            foodItemId: 'f-zd',
            foodLabel: "Hill's z/d",
            role: 'primary_diet',
            allowedFrom: '2026-06-01',
            allowedUntil: null,
            primaryProtein: 'chicken',
            brand: "Hill's",
            productName: 'z/d',
            proteins: ['chicken'],
            ingredientsNotes: 'Hydrolysed chicken liver, corn starch',
          },
        ],
      },
    ],
    vetVisits: [],
    feedingArrangements: [
      {
        id: 'arr-mira',
        foodItemId: 'f-dry',
        method: 'free_choice',
        activeFrom: null,
        activeUntil: null,
        isShared: false,
        primaryProtein: 'chicken',
        proteins: ['chicken', 'turkey'],
        foodLabel: 'Purina ONE Indoor Advantage',
      },
    ],
    conditions: [{ conditionName: 'Chronic vomiting', status: 'active', diagnosedAt: '2026-04-10' }],
  }
}

// ── Case 3: the trial the owner marked complete, seven days early ────────────
//
// Two shapes no other fixture reaches, both B-532:
//   • `stopped_reason = 'completed'` with `dayCounter < targetDurationDays` — the
//     state where "Ran its course." rendered in bold two inches under a day phrase
//     that had already said the trial ran 49 of 56 days.
//   • a free-choice bowl holding the TRIAL DIET ITSELF. `intakeNotDirectlyObserved`
//     withholds the clean-elimination sentence, but `arrangementExposures` is empty
//     because nothing is off-list — so the page pointed at an "Also during the trial"
//     row that was never emitted (B-599). This is the tightly-controlled feline-style
//     setup the free-fed state exists for, on a dog.

const VENISON = {
  foodItemId: 'f-ven',
  foodLabel: 'Purina HA Venison',
  role: 'primary_diet',
  allowedFrom: '2026-05-08',
  allowedUntil: null,
  primaryProtein: 'venison',
  brand: 'Purina',
  productName: 'HA Venison',
  proteins: ['venison'],
  ingredientsNotes: 'Venison, potato, coconut oil, minerals',
}

function completedCase(): ReportInput {
  const events: ReportEventInput[] = []
  // Two logged meals a day of the trial diet through the trial, then nothing after it
  // ended — the ordinary shape once the owner stops.
  for (const d of days('2026-05-08', '2026-06-25')) {
    events.push(meal({ date: d, brand: 'Purina', product: 'HA Venison', foodItemId: 'f-ven', proteins: VENISON.proteins, ingredientsNotes: VENISON.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
    events.push(meal({ date: d, time: '18:15:00', brand: 'Purina', product: 'HA Venison', foodItemId: 'f-ven', proteins: VENISON.proteins, ingredientsNotes: VENISON.ingredientsNotes, intakeRating: d === '2026-06-02' || d === '2026-06-03' ? 'some' : 'all', format: 'kibble' }))
  }
  // Itching, falling across the trial — the trend the delta is read off.
  for (const d of ['2026-05-09', '2026-05-10', '2026-05-12', '2026-05-14', '2026-05-16', '2026-05-19', '2026-05-22', '2026-05-26', '2026-05-30']) {
    events.push(sym('itch', d))
  }
  for (const d of ['2026-06-05', '2026-06-14', '2026-06-22']) events.push(sym('itch', d))

  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-rosie',
      name: 'Rosie',
      species: 'dog',
      breed: 'West Highland White Terrier',
      sex: 'female',
      dateOfBirth: '2021-09-02',
      neuterStatus: 'spayed',
      weightKg: 8.6,
    },
    ownerName: 'Priya Raman',
    events,
    aiAnalyses: [],
    weightChecks: [
      { eventId: 'rw1', weightKg: 8.8, occurredAt: '2026-05-08T15:00:00Z' },
      { eventId: 'rw2', weightKg: 8.7, occurredAt: '2026-06-01T15:00:00Z' },
      { eventId: 'rw3', weightKg: 8.6, occurredAt: '2026-06-24T15:00:00Z' },
    ],
    doses: [
      { eventId: 'rd1', occurredAt: '2026-05-09T09:00:00Z', medicationId: 'reg-pred', medicationItemId: 'mi-pred', adherence: 'given', doseAmount: '5 mg', pairedEventId: null },
      { eventId: 'rd2', occurredAt: '2026-05-10T09:00:00Z', medicationId: 'reg-pred', medicationItemId: 'mi-pred', adherence: 'given', doseAmount: '5 mg', pairedEventId: null },
      { eventId: 'rd3', occurredAt: '2026-05-11T09:00:00Z', medicationId: 'reg-pred', medicationItemId: 'mi-pred', adherence: 'given', doseAmount: '5 mg', pairedEventId: null },
      { eventId: 'rd4', occurredAt: '2026-05-13T09:00:00Z', medicationId: 'reg-pred', medicationItemId: 'mi-pred', adherence: 'given', doseAmount: '5 mg', pairedEventId: null },
    ],
    medications: [
      {
        id: 'reg-pred',
        medicationItemId: 'mi-pred',
        drugName: 'Prednisolone',
        doseAmount: '5 mg',
        route: 'oral',
        dosesPerDay: 1,
        scheduleNotes: 'tapering',
        indication: 'pruritus',
        prescribedBy: 'Dr. A. Chen',
        startedAt: '2026-05-08',
        targetDurationDays: null,
        status: 'ended',
        endedAt: '2026-05-14',
        isPrescription: true,
        strength: '5 mg',
      },
    ],
    medicationItems: [
      { id: 'mi-pred', genericName: 'prednisolone', brandName: null, strength: '5 mg', route: 'oral', isPrescription: true, form: 'tablet' },
    ],
    dietTrials: [
      {
        id: 'trial-rosie',
        foodItemId: 'f-ven',
        startedAt: '2026-05-08',
        targetDurationDays: 56,
        status: 'completed',
        completedAt: '2026-06-25',
        endedAt: '2026-06-25',
        indication: 'skin',
        stoppedReason: 'completed',
        vetName: 'Dr. A. Chen',
        foodLabel: 'Purina HA Venison',
        primaryProtein: 'venison',
        proteins: VENISON.proteins,
        ingredientsNotes: VENISON.ingredientsNotes,
        extractionConfidence: { proteins: 0.91 },
        allowedFoods: [VENISON],
      },
    ],
    vetVisits: [{ visitedAt: '2026-05-08', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'atopic dermatitis — rule out food' }],
    // THE BOWL HOLDS THE TRIAL DIET. Nothing off-list, so `arrangementExposures` is
    // empty — and the clean-elimination claim is still withheld, because a topped-up
    // bowl produces no rated feedings and neither intake lane can see it.
    feedingArrangements: [
      {
        id: 'arr-rosie',
        foodItemId: 'f-ven',
        method: 'free_choice',
        activeFrom: null,
        activeUntil: null,
        isShared: false,
        primaryProtein: 'venison',
        proteins: ['venison'],
        foodLabel: 'Purina HA Venison',
      },
    ],
    conditions: [{ conditionName: 'Atopic dermatitis', status: 'active', diagnosedAt: '2025-11-14' }],
  }
}

const outDir = Deno.args[0] ?? '.'
for (const [name, input] of [
  ['trial-report-clean.html', cleanCase()],
  ['trial-report-refused.html', refusedCase()],
  ['trial-report-completed.html', completedCase()],
] as const) {
  const html = renderReport(assembleReport(input))
  await Deno.writeTextFile(`${outDir}/${name}`, html)
  console.log(`${name}: ${html.length} bytes`)
}
