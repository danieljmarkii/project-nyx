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
//
// B-600 added a fourth, and it is the one shape the first three structurally cannot
// produce: all three are scoped so the report window and the trial roughly COINCIDE,
// which is exactly the configuration in which a window-truncation bug is invisible.
//
//   trial-report-truncated.html — Juno, day 73 of an 84-day trial, reported through
//                              a 31-day `since_visit` window opened by the six-week
//                              recheck. Every trial-scoped fact on the page is
//                              computed over the OVERLAP, and the §7.2 sentence
//                              certified the whole trial off it.
//
// This is not an edge case: it is the SECOND report, the one an owner sends at or
// after a recheck, and it is truncated by construction.
import {
  assembleReport,
  type ReportEventInput,
  type ReportInput,
  type ReportSnapshot,
} from '../supabase/functions/generate-report/report.ts'
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
      // `ReportPetInput.neuterStatus` is `'neutered' | 'intact' | null` — the schema does not
      // carry the sex-specific word, and the render says "neutered" for both.
      neuterStatus: 'neutered',
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

// ── Case 4: the trial seen through a since-visit window (B-600) ──────────────
//
// A 12-week GI elimination trial at day 73, reported after the six-week recheck.
// `resolveScope` rung 1 anchors on the most recent visit strictly before today, so
// the window is 2 Jun – 2 Jul — 31 days over a 73-day trial. Every trial-scoped
// figure in the block is computed over that overlap, and nothing in the block's own
// arithmetic knows it is looking at a fifth of the trial.
//
// The logging shape is the ordinary one, not a contrived one: the owner logged
// diligently to the recheck, went quiet for three weeks, and picked it back up. That
// gap sits INSIDE the window, so §10 S3's head clip — written for the days before the
// app was on the owner's phone at the START of a trial — swallows it, and coverage
// resolves to 11 of 11 days. A record of eleven days then read "supports interpreting
// it" about an 84-day elimination trial.

const HYDRO = {
  foodItemId: 'f-an',
  foodLabel: 'Purina HA Hydrolyzed',
  role: 'primary_diet',
  allowedFrom: '2026-04-21',
  allowedUntil: null,
  primaryProtein: 'soy',
  brand: 'Purina',
  productName: 'HA Hydrolyzed',
  proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein isolate, corn starch, vegetable oil',
}

function truncatedCase(): ReportInput {
  const events: ReportEventInput[] = []
  // Two logged meals a day from day 1 to the recheck — six weeks of a well-kept record,
  // ALL OF IT OUTSIDE THE WINDOW THIS REPORT RENDERS.
  for (const d of days('2026-04-21', '2026-06-01')) {
    events.push(meal({ date: d, brand: 'Purina', product: 'HA Hydrolyzed', foodItemId: 'f-an', proteins: HYDRO.proteins, ingredientsNotes: HYDRO.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
    events.push(meal({ date: d, time: '18:20:00', brand: 'Purina', product: 'HA Hydrolyzed', foodItemId: 'f-an', proteins: HYDRO.proteins, ingredientsNotes: HYDRO.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
  }
  // Three weeks with nothing logged — 2 Jun to 21 Jun. The owner was away and the
  // dog was with family. Inside the window, and the head clip reports it as days
  // that "predate any logging".
  //
  // Then the record resumes and runs clean to today.
  for (const d of days('2026-06-22', '2026-07-02')) {
    events.push(meal({ date: d, brand: 'Purina', product: 'HA Hydrolyzed', foodItemId: 'f-an', proteins: HYDRO.proteins, ingredientsNotes: HYDRO.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
    events.push(meal({ date: d, time: '18:20:00', brand: 'Purina', product: 'HA Hydrolyzed', foodItemId: 'f-an', proteins: HYDRO.proteins, ingredientsNotes: HYDRO.ingredientsNotes, intakeRating: d === '2026-06-30' ? 'most' : 'all', format: 'kibble' }))
  }
  // One slip inside the window, so the exposure lane is exercised rather than empty.
  events.push(meal({ date: '2026-06-28', time: '16:10:00', brand: 'Home', product: 'Chicken jerky', foodItemId: 'f-jerky', foodType: 'treat', format: 'treat', proteins: ['chicken'], notes: 'neighbour gave her one on the walk' }))
  // TWO FEEDINGS THAT NAME NO FOOD — the modal record-keeping gap, and the only shape
  // that renders the "N logged feedings … named no food" disclosure. Cold read round 15
  // asked for it by name: that sentence had been re-scoped with the rest of the count
  // family and no artifact rendered it, so the change could be read in code and not on
  // the page. A feeding with no identity is excluded from BOTH sides of the exposure
  // ratio, so its own count is the only thing standing for it.
  events.push(meal({ date: '2026-06-24', time: '12:40:00', brand: '', product: '', foodItemId: '', notes: 'logged in a hurry' }))
  events.push(meal({ date: '2026-06-27', time: '13:05:00', brand: '', product: '', foodItemId: '' }))

  // GI signs: frequent before the trial settled, sparse in the visible window.
  for (const d of ['2026-04-22', '2026-04-24', '2026-04-27', '2026-05-01', '2026-05-06', '2026-05-13', '2026-05-24']) {
    events.push(sym('vomit', d))
  }
  for (const d of ['2026-04-23', '2026-04-29', '2026-05-09']) events.push(sym('diarrhea', d))
  events.push(sym('vomit', '2026-06-29', '05:20:00', 'the morning after the jerky'))

  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-juno',
      name: 'Juno',
      species: 'dog',
      breed: 'Border Collie',
      sex: 'female',
      dateOfBirth: '2019-11-30',
      neuterStatus: 'neutered',
      weightKg: 18.2,
    },
    ownerName: 'Marta Ilves',
    events,
    aiAnalyses: [],
    weightChecks: [
      { eventId: 'jw1', weightKg: 18.6, occurredAt: '2026-04-21T15:00:00Z' },
      { eventId: 'jw2', weightKg: 18.3, occurredAt: '2026-06-02T15:00:00Z' },
      { eventId: 'jw3', weightKg: 18.2, occurredAt: '2026-07-01T15:00:00Z' },
    ],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [
      {
        id: 'trial-juno',
        foodItemId: 'f-an',
        startedAt: '2026-04-21',
        // Twelve weeks — ACVIM's GI ceiling, and the reason the trial outruns any
        // one report window in the first place.
        targetDurationDays: 84,
        status: 'active',
        completedAt: null,
        endedAt: null,
        indication: 'gi',
        vetName: 'Dr. A. Chen',
        foodLabel: 'Purina HA Hydrolyzed',
        primaryProtein: 'soy',
        proteins: HYDRO.proteins,
        ingredientsNotes: HYDRO.ingredientsNotes,
        extractionConfidence: { proteins: 0.94 },
        allowedFoods: [HYDRO],
      },
    ],
    // TWO VISITS. The later one is what makes this case what it is: `resolveScope`
    // rung 1 takes the most recent visit strictly before today, so the six-week
    // recheck — not the trial start — opens the window.
    vetVisits: [
      { visitedAt: '2026-04-21', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'chronic vomiting — start elimination diet' },
      { visitedAt: '2026-06-02', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'six-week recheck' },
    ],
    feedingArrangements: [],
    conditions: [{ conditionName: 'Chronic intermittent vomiting', status: 'active', diagnosedAt: '2026-02-17' }],
  }
}

// ── Case 5: a hand-picked window that closed weeks ago (B-600, round 10) ─────
//
// The CHERRY-PICK basis — `app/report.tsx` ships a Custom range with two date pickers
// — and the only one whose window can end before today. Two things render here and
// nowhere else, both of which a cold read has to see rather than take on trust:
//
//   • `trialDaysOutsideRange.after > 0`, so the day counter is short of the trial's
//     elapsed length and carries its `as of <date>` label. Cold-read round 10 named
//     this branch as rendered by ZERO of the four fixtures — "a unit test is not the
//     artifact" — while the arithmetic behind it is exactly what adversarial pass 2
//     broke.
//   • the trial is truncated at BOTH ends, so the slice sentence takes its
//     "before and after it" branch.
//
// The scenario is ordinary: the vet asks for "just the month I saw her in", and the
// owner picks those dates.

const NOVEL = {
  foodItemId: 'f-kang',
  foodLabel: 'Vet Essentials Kangaroo & Oat',
  role: 'primary_diet',
  allowedFrom: '2026-04-06',
  allowedUntil: null,
  primaryProtein: 'kangaroo',
  brand: 'Vet Essentials',
  productName: 'Kangaroo & Oat',
  proteins: ['kangaroo'],
  ingredientsNotes: 'Kangaroo, oats, sunflower oil, minerals',
}

function pastWindowCase(): ReportInput {
  const events: ReportEventInput[] = []
  // A well-kept 56-day novel-protein trial, logged twice daily start to finish.
  for (const d of days('2026-04-06', '2026-05-31')) {
    events.push(meal({ date: d, brand: 'Vet Essentials', product: 'Kangaroo & Oat', foodItemId: 'f-kang', proteins: NOVEL.proteins, ingredientsNotes: NOVEL.ingredientsNotes, intakeRating: 'all', format: 'kibble' }))
    events.push(meal({ date: d, time: '18:30:00', brand: 'Vet Essentials', product: 'Kangaroo & Oat', foodItemId: 'f-kang', proteins: NOVEL.proteins, ingredientsNotes: NOVEL.ingredientsNotes, intakeRating: d === '2026-05-04' ? 'most' : 'all', format: 'kibble' }))
  }
  // One slip inside the picked window, one outside it — so the artifact shows what a
  // hand-picked window omits as well as what it includes.
  events.push(meal({ date: '2026-05-02', time: '20:10:00', brand: 'Home', product: 'Beef mince', foodItemId: 'f-beef', foodType: 'other', format: 'human_food', proteins: ['beef'], notes: 'scraps at the barbecue' }))
  events.push(meal({ date: '2026-05-26', time: '19:00:00', brand: 'Home', product: 'Beef mince', foodItemId: 'f-beef', foodType: 'other', format: 'human_food', proteins: ['beef'] }))

  for (const d of ['2026-04-07', '2026-04-09', '2026-04-13', '2026-04-18', '2026-04-24', '2026-05-03', '2026-05-15']) {
    events.push(sym('diarrhea', d))
  }
  events.push(sym('vomit', '2026-05-03', '22:40:00', 'the night after the barbecue'))
  events.push(sym('diarrhea', '2026-05-28'))

  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-tama',
      name: 'Tama',
      species: 'dog',
      breed: 'Staffordshire Bull Terrier',
      sex: 'female',
      dateOfBirth: '2022-02-11',
      neuterStatus: 'neutered',
      weightKg: 15.4,
    },
    ownerName: 'Dev Anand',
    events,
    aiAnalyses: [],
    weightChecks: [
      { eventId: 'tw1', weightKg: 15.1, occurredAt: '2026-04-06T15:00:00Z' },
      { eventId: 'tw2', weightKg: 15.4, occurredAt: '2026-05-30T15:00:00Z' },
    ],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [
      {
        id: 'trial-tama',
        foodItemId: 'f-kang',
        startedAt: '2026-04-06',
        targetDurationDays: 56,
        status: 'completed',
        completedAt: '2026-05-31',
        endedAt: '2026-05-31',
        indication: 'gi',
        stoppedReason: 'completed',
        vetName: 'Dr. A. Chen',
        foodLabel: 'Vet Essentials Kangaroo & Oat',
        primaryProtein: 'kangaroo',
        proteins: NOVEL.proteins,
        ingredientsNotes: NOVEL.ingredientsNotes,
        extractionConfidence: { proteins: 0.9 },
        allowedFoods: [NOVEL],
      },
    ],
    vetVisits: [{ visitedAt: '2026-04-06', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'chronic diarrhoea — start novel-protein trial' }],
    feedingArrangements: [],
    conditions: [{ conditionName: 'Chronic diarrhoea', status: 'active', diagnosedAt: '2026-01-22' }],
    // THE OWNER PICKED THE DATES. Trial Apr 6 – May 31 (56 days); this window opens 14
    // days in and closes 11 days before the trial did.
    requestedWindow: { startDate: '2026-04-20', endDate: '2026-05-20' },
  }
}

// ── Case 6: the paths nothing had ever RENDERED (B-612 / CUL-319) ────────────
//
// Cases 1–5 are all diet-trial reports in which every event is `seen` with an exact
// time, nothing is photographed, and the latest weigh-in is inside the window or after
// it. That left a set of branches whose only appearance in five artifacts was the
// LEGEND explaining them — which is not a render, and `vet-report-cold-read` said so
// in three consecutive rounds: "I can't cold-read a string I've only seen in code, and
// that is the whole point of this review." The two blockers round 11 found were both in
// branches being rendered for the first time.
//
// This case is deliberately a MONITORING report — no diet trial. Every gap it closes is
// trial-independent, and a sixth trial artifact would only re-render pages the cold read
// has already graded five times. The narrative that makes all of them co-occur without
// contrivance is the cat whose owner FINDS things: a cat vomits overnight, on a rug, and
// the owner meets the evidence in the morning and photographs it.
//
//   trial-report-monitoring.html — Pepper, a 9-year-old spayed DSH under workup for
//                              chronic intermittent vomiting, reported through the
//                              31-day `since_visit` window her recheck opened.
//
// What renders here and nowhere else:
//   · every occurred-time confidence — `est`, a two-sided `range`, BOTH one-sided forms
//     ("before"/"after"), and a null-confidence legacy row as `unspecified`
//   · the `N logs` duplicate tag (a sync retry 40s apart), with the photo on the member
//     that got DROPPED — so the union-across-members path is exercised, not just the tag
//   · the whole photo-analysis path: completed reads, the safety-band thumbnail lead on
//     both a blood flag and a foreign-material flag, a non-completed read, a photo whose
//     server-side fetch failed, and an incident analysed whose photo the owner has since
//     removed (the Appendix E/F disclosure)
//   · the stool AI read (Bristol + colour + mucus)
//   · `(before this window)` on the weight block — the side the B-600 fix left untested,
//     because `past-window` is the one basis that can close in the past and renders
//     "after this window" instead
//
// ONE FIXTURE DECISION WORTH ITS COMMENT: incident 3's window straddles local midnight
// (earliest 23:00 the previous evening, latest 07:20 the next morning). That is what an
// overnight find actually looks like, and the occurred cell renders TIMES ONLY — so the
// artifact puts the question "23:00 of which day?" in front of the cold read rather than
// leaving it to a unit test that would have to assert the ambiguity to notice it.

// A deterministic, dependency-free PNG, so the photo path renders real bytes rather than
// a broken-image box. index.ts populates `dataUri` AFTER pure assembly (report.ts stays
// pure and never touches image bytes), so a script that renders the pure snapshot has to
// do the same thing or no thumbnail can ever appear. These are obviously not photographs;
// they are the right SHAPE — a `data:image/png;base64,…` of a plausible size in the
// layout box — which is what the layout, the print CSS and the appendix pagination are
// actually being graded on.
function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xed_b8_83_20 & -(c & 1))
  }
  return ~c >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function be32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const tag = new TextEncoder().encode(type)
  const body = new Uint8Array(tag.length + data.length)
  body.set(tag)
  body.set(data, tag.length)
  const out = new Uint8Array(4 + body.length + 4)
  out.set(be32(data.length), 0)
  out.set(body, 4)
  out.set(be32(crc32(body)), 4 + body.length)
  return out
}

/**
 * zlib stream built from STORED (uncompressed) deflate blocks — a valid zlib stream with
 * no compressor, which is why this file needs no dependency. Bigger than a real PNG and
 * entirely fine at this size.
 */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  let off = 0
  do {
    const len = Math.min(65535, raw.length - off)
    const head = new Uint8Array(5)
    head[0] = off + len >= raw.length ? 1 : 0 // BFINAL, BTYPE=00 (stored)
    head[1] = len & 255
    head[2] = (len >> 8) & 255
    head[3] = ~len & 255
    head[4] = (~len >> 8) & 255
    parts.push(head, raw.subarray(off, off + len))
    off += len
  } while (off < raw.length)
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(2 + total + 4)
  out[0] = 0x78
  out[1] = 0x01
  let p = 2
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  out.set(be32(adler32(raw)), p)
  return out
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

/** A seeded mottled blob on a floor-ish ground — same seed, same bytes, every run. */
function pngDataUri(seed: number, size = 132): string {
  const ground: [number, number, number] = [176, 168, 156]
  const blobs: Array<[number, number, number]> = [
    [206, 178, 96], // bile yellow
    [188, 96, 96], // pink/red
    [222, 214, 200], // clear/foam
    [150, 122, 84], // tan hairball
    [140, 104, 72], // brown stool
  ]
  const fg = blobs[seed % blobs.length]
  const raw = new Uint8Array(size * (1 + size * 3))
  const c = size / 2
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter type 0 (none)
    for (let x = 0; x < size; x++) {
      let hsh = (x * 374_761_393 + y * 668_265_263 + seed * 1_274_126_177) >>> 0
      hsh = (hsh ^ (hsh >>> 13)) >>> 0
      hsh = Math.imul(hsh, 1_274_126_177) >>> 0
      const noise = (hsh >>> 24) / 255
      const dx = (x - c) / c
      const dy = (y - c) / c
      // A soft off-centre blob, wobbled by the noise so the edge is ragged, not a disc.
      const d = Math.sqrt(dx * dx * 1.35 + dy * dy) + (noise - 0.5) * 0.22
      const t = Math.max(0, Math.min(1, 1.15 - d * 1.6))
      for (let ch = 0; ch < 3; ch++) {
        const v = ground[ch] + (fg[ch] - ground[ch]) * t + (noise - 0.5) * 26
        raw[p++] = Math.max(0, Math.min(255, Math.round(v)))
      }
    }
  }
  const ihdr = new Uint8Array(13)
  ihdr.set(be32(size), 0)
  ihdr.set(be32(size), 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type 2 = truecolour RGB
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStored(raw)), pngChunk('IEND', new Uint8Array(0))]
  const total = chunks.reduce((n, ch) => n + ch.length, 0)
  const png = new Uint8Array(total)
  let q = 0
  for (const ch of chunks) {
    png.set(ch, q)
    q += ch.length
  }
  return `data:image/png;base64,${toBase64(png)}`
}

/**
 * The post-assembly embed step, mirroring index.ts: every incident photo gets bytes EXCEPT
 * the one whose storage path is marked unfetchable, which keeps `dataUri: null` and must
 * render as the disclosed "could not be embedded" placeholder rather than vanishing.
 */
function embedPhotos(snap: ReportSnapshot): void {
  snap.incidentPhotos.forEach((p, i) => {
    if (p.storagePath.includes('unfetchable')) return
    p.dataUri = pngDataUri(i + 1)
  })
}

/** A symptom event with full control over the occurred-time account (B-010's four shapes). */
function obs(o: {
  type: string
  id: string
  occurredAt: string
  confidence: 'witnessed' | 'estimated' | 'window' | null
  earliest?: string | null
  latest?: string | null
  loggedAt?: string
  notes?: string | null
}): ReportEventInput {
  return {
    id: o.id,
    type: o.type,
    occurredAt: o.occurredAt,
    occurredAtConfidence: o.confidence,
    occurredAtEarliest: o.earliest ?? null,
    occurredAtLatest: o.latest ?? null,
    severity: null,
    notes: o.notes ?? null,
    loggedAt: o.loggedAt ?? o.occurredAt,
    meal: null,
  }
}

const WET = {
  brand: 'Weruva',
  product: 'Paw Lickin’ Chicken',
  foodItemId: 'f-weruva',
  proteins: ['chicken'],
  ingredientsNotes: 'Chicken, chicken broth, sunflower seed oil, xanthan gum',
}
const DRY = {
  brand: 'Hill’s',
  product: 'Science Diet Adult Indoor',
  foodItemId: 'f-hills',
  proteins: ['chicken'],
  ingredientsNotes: 'Chicken, whole grain wheat, corn gluten meal, chicken fat',
}

function monitoringCase(): ReportInput {
  const events: ReportEventInput[] = []

  // Twice-daily wet, plus a dry bowl she grazes. Five days go unlogged, deliberately —
  // a 31-of-31 record is not what a real month looks like and makes the coverage tile
  // untestable.
  const unlogged = new Set(['2026-06-13', '2026-06-14', '2026-06-24', '2026-06-25', '2026-07-01'])
  for (const d of days('2026-06-02', '2026-07-02')) {
    if (unlogged.has(d)) continue
    events.push(meal({ date: d, time: '11:15:00', brand: WET.brand, product: WET.product, foodItemId: WET.foodItemId, proteins: WET.proteins, ingredientsNotes: WET.ingredientsNotes, intakeRating: 'all', format: 'wet' }))
    events.push(meal({ date: d, time: '22:30:00', brand: WET.brand, product: WET.product, foodItemId: WET.foodItemId, proteins: WET.proteins, ingredientsNotes: WET.ingredientsNotes, intakeRating: d === '2026-06-18' || d === '2026-06-26' ? 'some' : 'all', format: 'wet' }))
  }

  // ── The six occurred-time shapes ───────────────────────────────────────────
  // 1 · witnessed — she watched it happen.
  events.push(obs({ type: 'vomit', id: 'v-hair', occurredAt: '2026-06-05T23:10:00Z', confidence: 'witnessed', notes: 'brought up a hairball on the stairs' }))
  // 2 · estimated — heard it from the next room, guessed the time.
  events.push(obs({ type: 'vomit', id: 'v-est', occurredAt: '2026-06-09T13:30:00Z', confidence: 'estimated', loggedAt: '2026-06-09T14:05:00Z', notes: 'heard her in the laundry room, not sure exactly when' }))
  // 3 · two-sided window, STRADDLING local midnight (23:00 → 07:20 next morning).
  events.push(obs({ type: 'vomit', id: 'v-range', occurredAt: '2026-06-14T07:10:00Z', confidence: 'window', earliest: '2026-06-14T03:00:00Z', latest: '2026-06-14T11:20:00Z', loggedAt: '2026-06-14T11:35:00Z', notes: 'found it by the radiator; she was fine when we went up to bed' }))
  // 4 · one-sided, LATEST only — "sometime before I got up".
  events.push(obs({ type: 'vomit', id: 'v-before', occurredAt: '2026-06-18T10:45:00Z', confidence: 'window', latest: '2026-06-18T10:45:00Z', loggedAt: '2026-06-18T10:52:00Z', notes: 'on the hall rug, pink streaks through it' }))
  // 5 · one-sided, EARLIEST only — "after she went up for the night".
  events.push(obs({ type: 'vomit', id: 'v-after', occurredAt: '2026-06-23T03:30:00Z', confidence: 'window', earliest: '2026-06-23T03:30:00Z', loggedAt: '2026-06-23T12:10:00Z', notes: 'behind the sofa, found it the next morning' }))
  // 6 · null confidence — a row logged before the time-confidence capture existed.
  events.push(obs({ type: 'vomit', id: 'v-unspec', occurredAt: '2026-06-29T16:20:00Z', confidence: null }))

  // ── The duplicate pair (§5.11): one bout, logged twice 40s apart on a sync retry.
  // The PHOTO hangs off the member that loses the representative election, so the
  // union-across-members path is what puts the read on the page — not the tag alone.
  events.push(obs({ type: 'vomit', id: 'v-dup-a', occurredAt: '2026-06-26T23:55:00Z', confidence: 'witnessed', notes: 'long white thread in it — she has been at the quilt again' }))
  events.push(obs({ type: 'vomit', id: 'v-dup-b', occurredAt: '2026-06-26T23:55:40Z', confidence: 'witnessed' }))

  // Photographed but the fetch fails server-side → the disclosed placeholder.
  events.push(obs({ type: 'vomit', id: 'v-nofetch', occurredAt: '2026-06-11T12:50:00Z', confidence: 'witnessed', notes: 'white foam, first thing' }))
  // Photographed + read, photo since removed by the owner → the Appendix disclosure.
  events.push(obs({ type: 'vomit', id: 'v-removed', occurredAt: '2026-07-01T22:40:00Z', confidence: 'witnessed', notes: 'looked like her dinner came straight back' }))

  // ── Stool ─────────────────────────────────────────────────────────────────
  events.push(obs({ type: 'diarrhea', id: 's-mucus', occurredAt: '2026-06-07T14:10:00Z', confidence: 'witnessed', notes: 'loose, some jelly-looking stuff on it' }))
  events.push(obs({ type: 'diarrhea', id: 's-before', occurredAt: '2026-06-19T11:00:00Z', confidence: 'window', latest: '2026-06-19T11:00:00Z', loggedAt: '2026-06-19T11:06:00Z', notes: 'in the box before work' }))
  events.push(obs({ type: 'diarrhea', id: 's-late', occurredAt: '2026-06-30T21:15:00Z', confidence: 'witnessed' }))
  for (const d of ['2026-06-03', '2026-06-04', '2026-06-06', '2026-06-08', '2026-06-10', '2026-06-12', '2026-06-15', '2026-06-17', '2026-06-20', '2026-06-22', '2026-06-27', '2026-06-28', '2026-07-02']) {
    events.push(obs({ type: 'stool_normal', id: eid('sn'), occurredAt: `${d}T13:40:00Z`, confidence: 'witnessed' }))
  }

  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-pepper',
      name: 'Pepper',
      species: 'cat',
      breed: 'Domestic Shorthair',
      sex: 'female',
      dateOfBirth: '2017-04-19',
      neuterStatus: 'neutered',
      weightKg: 4.5,
    },
    ownerName: 'Sam Rivera',
    events,
    aiAnalyses: [
      // A hairball — the ordinary card, no flag. This is the control: without it the
      // appendix is nothing but red flags and the reader learns nothing about the
      // section's baseline register.
      { eventId: 'v-hair', status: 'completed', colour: 'tan', contents: ['hair'], consistency: 'chunky', bloodPresent: 'none_visible', bilePresent: 'no', foreignMaterialPresent: 'no', foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      // Empty-stomach bile, found overnight.
      { eventId: 'v-range', status: 'completed', colour: 'yellow', contents: ['bile'], consistency: 'watery', bloodPresent: 'none_visible', bilePresent: 'yes', foreignMaterialPresent: 'no', foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      // FRESH RED BLOOD → leads the safety band, with the thumbnail.
      { eventId: 'v-before', status: 'completed', colour: 'pink_red', contents: ['liquid_only'], consistency: 'mucoid_slimy', bloodPresent: 'fresh_red', bilePresent: 'no', foreignMaterialPresent: 'no', foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      // A read the model could not commit to → "read uncertain", never a positive "no".
      { eventId: 'v-after', status: 'uncertain', colour: null, contents: null, consistency: null, bloodPresent: null, bilePresent: null, foreignMaterialPresent: null, foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      // FOREIGN MATERIAL, on the DROPPED duplicate → leads the band via the member union.
      { eventId: 'v-dup-b', status: 'completed', colour: 'clear', contents: ['foam'], consistency: 'mucoid_slimy', bloodPresent: 'none_visible', bilePresent: 'no', foreignMaterialPresent: 'yes', foreignMaterialNote: 'thread-like strands', stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      { eventId: 'v-nofetch', status: 'completed', colour: 'white', contents: ['foam'], consistency: 'foamy', bloodPresent: 'none_visible', bilePresent: 'no', foreignMaterialPresent: 'no', foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null },
      // Read retained, photo deleted by the owner — the divergence Appendix E/F discloses.
      { eventId: 'v-removed', status: 'completed', colour: 'brown', contents: ['partially_digested_food'], consistency: 'chunky', bloodPresent: 'none_visible', bilePresent: 'no', foreignMaterialPresent: 'no', foreignMaterialNote: null, stoolConsistency: null, stoolColour: null, stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: '2026-07-01T23:10:00Z' },
      // The stool read: Bristol + colour + mucus (monitor tier — surfaced, never a lead).
      { eventId: 's-mucus', status: 'completed', colour: null, contents: null, consistency: null, bloodPresent: null, bilePresent: null, foreignMaterialPresent: null, foreignMaterialNote: null, stoolConsistency: 'type_6_mushy', stoolColour: 'brown', stoolBloodPresent: 'no', stoolBloodType: null, stoolMucusPresent: 'yes', editedAt: null },
    ],
    // THE ONLY WEIGH-IN, and it predates the window: she was weighed at home the week
    // before the appointment that opens this report, and not since. This is the
    // "(before this window)" side — `past-window` renders the "after" side, because a
    // hand-picked window is the one basis that can close in the past.
    weightChecks: [{ eventId: 'pw1', weightKg: 4.5, occurredAt: '2026-05-24T15:30:00Z' }],
    doses: [
      { eventId: 'md1', occurredAt: '2026-06-02T13:00:00Z', medicationId: 'rx-cerenia', medicationItemId: 'mi-maropitant', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
      { eventId: 'md2', occurredAt: '2026-06-03T13:10:00Z', medicationId: 'rx-cerenia', medicationItemId: 'mi-maropitant', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
      { eventId: 'md3', occurredAt: '2026-06-04T13:05:00Z', medicationId: 'rx-cerenia', medicationItemId: 'mi-maropitant', adherence: 'refused', doseAmount: '16 mg', pairedEventId: null },
      { eventId: 'md4', occurredAt: '2026-06-05T12:55:00Z', medicationId: 'rx-cerenia', medicationItemId: 'mi-maropitant', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
      { eventId: 'md5', occurredAt: '2026-06-06T13:20:00Z', medicationId: 'rx-cerenia', medicationItemId: 'mi-maropitant', adherence: 'given', doseAmount: '16 mg', pairedEventId: null },
    ],
    medications: [
      {
        id: 'rx-cerenia',
        medicationItemId: 'mi-maropitant',
        drugName: 'Maropitant (Cerenia)',
        doseAmount: '16 mg',
        route: 'oral',
        dosesPerDay: 1,
        scheduleNotes: 'once daily with food',
        indication: 'vomiting',
        prescribedBy: 'Dr. A. Chen',
        startedAt: '2026-06-02',
        targetDurationDays: 5,
        status: 'completed',
        endedAt: '2026-06-06',
      },
    ],
    medicationItems: [
      { id: 'mi-maropitant', genericName: 'maropitant citrate', brandName: 'Cerenia', strength: '16 mg', route: 'oral', isPrescription: true, form: 'tablet' },
    ],
    dietTrials: [],
    vetVisits: [{ visitedAt: '2026-06-02', clinicName: 'Riverside Veterinary', vetName: 'Dr. A. Chen', reason: 'chronic intermittent vomiting — begin workup' }],
    // `activeFrom` here is deliberately INERT: buildConcurrentChanges passes a null start
    // for every free_choice arrangement (B-233, PM-confirmed — the column records when the
    // owner first LOGGED the food, not when the bowl went down), so the report says
    // "ongoing, start not recorded" no matter what date sits here. Kept realistic rather
    // than null so the row looks like a real one, but do not read the render as echoing it.
    feedingArrangements: [
      { id: 'fa-dry', foodItemId: DRY.foodItemId, method: 'free_choice', activeFrom: '2025-11-01', activeUntil: null, isShared: false, primaryProtein: 'chicken', foodLabel: `${DRY.brand} ${DRY.product}`, proteins: DRY.proteins, ingredientsNotes: DRY.ingredientsNotes, extractionConfidence: { proteins: 0.91 } },
    ],
    conditions: [{ conditionName: 'Chronic intermittent vomiting', status: 'monitoring', diagnosedAt: '2026-03-10' }],
    attachments: [
      { eventId: 'v-hair', storagePath: 'pepper/v-hair-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      { eventId: 'v-range', storagePath: 'pepper/v-range-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      { eventId: 'v-before', storagePath: 'pepper/v-before-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      { eventId: 'v-after', storagePath: 'pepper/v-after-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      // On the DROPPED duplicate, not the survivor.
      { eventId: 'v-dup-b', storagePath: 'pepper/v-dup-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      // The transform fetch fails → dataUri stays null → disclosed placeholder.
      { eventId: 'v-nofetch', storagePath: 'pepper/v-nofetch-unfetchable.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      { eventId: 's-mucus', storagePath: 'pepper/s-mucus-1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
    ],
  }
}

const outDir = Deno.args[0] ?? '.'
// The third slot is the post-assembly hook: index.ts embeds photo bytes AFTER pure
// assembly, so a case that renders photos has to do the same or `dataUri` is null on
// every one of them and the thumbnails silently never appear.
const CASES: Array<[string, ReportInput, ((snap: ReportSnapshot) => void)?]> = [
  ['trial-report-clean.html', cleanCase()],
  ['trial-report-refused.html', refusedCase()],
  ['trial-report-completed.html', completedCase()],
  ['trial-report-truncated.html', truncatedCase()],
  ['trial-report-past-window.html', pastWindowCase()],
  ['trial-report-monitoring.html', monitoringCase(), embedPhotos],
]
for (const [name, input, post] of CASES) {
  const snap = assembleReport(input)
  post?.(snap)
  const html = renderReport(snap)
  await Deno.writeTextFile(`${outDir}/${name}`, html)
  console.log(`${name}: ${html.length} bytes`)
}
