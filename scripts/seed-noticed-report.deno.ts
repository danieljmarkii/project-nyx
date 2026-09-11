// Render a vet report over a seeded record that exercises the Noticed block (CUL-875).
//
//   deno run --allow-read --allow-write scripts/seed-noticed-report.deno.ts <out.html>
//
// The `.deno.ts` suffix is load-bearing: tsconfig excludes `scripts/**/*.deno.ts` from the
// app's `tsc` run, because `Deno` is a global here and is not in the app's type
// environment. This file was written without it and the pre-push hook caught it — which
// is the exact forgetting the tsconfig comment predicts, now for the third time.
//
// Sibling: `scripts/render-trial-report-sample.deno.ts`, which does the same job for the
// diet-trial branches. Separate on purpose — each seeds the record ITS feature needs, and
// one script trying to hold both would make neither's fixture readable.
//
// Its only job is producing the ARTIFACT the `vet-report-cold-read` subagent reads. That
// review is mandatory on every change to the report's content, and it must be given the
// rendered output rather than the generating code — the real consumer is a vet scanning a
// document in 60 seconds for a patient they have never met.
//
// The record is deliberately NOT a best case: a cat with a real vomit history, a meal log
// with two refusals on days the owner marked nothing unusual (so §5 honesty rule 12's
// disagreement clause fires), a word whose days all fall before the strip's span, an
// unanswered vomit day, an activity-only day, and one note. Every one of those is a
// sentence on the page that could be wrong.

import { assembleReport, type ReportEventInput, type ReportInput } from '../supabase/functions/generate-report/report.ts'
import { renderReport } from '../supabase/functions/generate-report/render.ts'
import type { ReportLookInput } from '../supabase/functions/generate-report/noticed.ts'

const TZ = 'America/New_York'
const WINDOW_START = '2026-08-01'
const WINDOW_END = '2026-09-15'
const NOW = '2026-09-15T20:00:00Z'

const MS_PER_DAY = 86_400_000
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / MS_PER_DAY)
const dayKey = (n: number) => new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
const eachDay = (from: string, to: string): string[] => {
  const out: string[] = []
  for (let n = dayNum(from); n <= dayNum(to); n++) out.push(dayKey(n))
  return out
}

let seq = 0
const id = (p: string) => `${p}-${String(++seq).padStart(4, '0')}`

// ── The record ────────────────────────────────────────────────────────────────

const VOMIT_DAYS = ['2026-08-06', '2026-08-14', '2026-08-23', '2026-09-01', '2026-09-08', '2026-09-13']

const events: ReportEventInput[] = []
for (const d of VOMIT_DAYS) {
  events.push({
    id: id('vomit'),
    type: 'vomit',
    occurredAt: `${d}T11:20:00Z`,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: `${d}T11:25:00Z`,
    meal: null,
  })
}
// Meals most days: two a day, rated. Two days she left most of it — and both are days the
// owner answered *nothing unusual*, which is the disagreement the report must state.
const REFUSED_DAYS = new Set(['2026-09-04', '2026-09-05'])
for (const d of eachDay('2026-08-01', WINDOW_END)) {
  for (const [hour, slot] of [
    ['12:00', 'am'],
    ['23:00', 'pm'],
  ] as const) {
    events.push({
      id: id(`meal-${slot}`),
      type: 'meal',
      occurredAt: `${d}T${hour}:00Z`,
      occurredAtConfidence: 'witnessed',
      occurredAtEarliest: null,
      occurredAtLatest: null,
      severity: null,
      notes: null,
      loggedAt: `${d}T${hour}:00Z`,
      meal: {
        foodItemId: 'food-rc',
        intakeRating: REFUSED_DAYS.has(d) ? 'refused' : 'all',
        quantity: null,
        foodType: 'meal',
        format: 'wet_canned',
        primaryProtein: 'chicken',
        proteins: ['chicken'],
        ingredientsNotes: null,
        brand: 'Royal Canin',
        productName: 'Gastrointestinal',
      },
    })
  }
}

// ── The looks ─────────────────────────────────────────────────────────────────
//
// 118 answered days reaching well before the window (so the pre-first-day coverage clause
// has something real to say), then the window's own answers with gaps.

const looks: ReportLookInput[] = []
function look(day: string, words: string[], hour = '13:00', notes: string | null = null) {
  looks.push({
    eventId: id('look'),
    localDay: day,
    createdAt: `${day}T${hour}:00Z`,
    occurredAt: `${day}T${hour}:00Z`,
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: 1,
    notes,
  })
}

// The long quiet run before the window — the record that makes a change legible.
for (const d of eachDay('2026-05-03', '2026-07-31')) look(d, [])

// The window. 42 of 46 days answered; four never answered, one of them a vomit day.
const UNANSWERED = new Set(['2026-08-11', '2026-08-19', '2026-09-08', '2026-09-14'])
const WORDS: Record<string, string[]> = {
  '2026-08-05': ['hiding'], // all before the 28-day strip — the "falls entirely before" case
  '2026-08-07': ['hiding'],
  '2026-09-02': ['subdued'],
  '2026-09-03': ['subdued', 'lip_licking'], // a multi-word day: the counts cannot sum
  '2026-09-06': ['subdued'],
  '2026-09-09': ['lip_licking'],
  '2026-09-10': ['subdued'],
  '2026-09-11': ['lively'], // an ACTIVITY-only day — never on page 1
  '2026-09-12': ['subdued'],
  '2026-09-15': ['subdued'],
}
for (const d of eachDay(WINDOW_START, WINDOW_END)) {
  if (UNANSWERED.has(d)) continue
  look(d, WORDS[d] ?? [])
}
// A second look the same day — it must count ONCE and print as a second line under one day.
look('2026-09-03', ['subdued'], '21:30', 'she hid behind the sofa after her dinner and would not come out')

const input: ReportInput = {
  now: NOW,
  timezone: TZ,
  pet: {
    id: 'pet-nyx',
    name: 'Nyx',
    species: 'cat',
    breed: 'Domestic Shorthair',
    sex: 'female',
    dateOfBirth: '2019-04-01',
    weightKg: 4.6,
  },
  ownerName: 'Daniel Mark',
  requestedWindow: { startDate: WINDOW_START, endDate: WINDOW_END },
  events,
  aiAnalyses: [],
  weightChecks: [],
  doses: [],
  medications: [],
  dietTrials: [],
  vetVisits: [],
  feedingArrangements: [],
  conditions: [{ conditionName: 'Chronic vomiting — under investigation', status: 'active', diagnosedAt: '2026-06-02' }],
  audience: { kind: 'owner', includeLookNotes: true },
  lookRows: looks,
  lookRowsComplete: true,
}

const out = Deno.args[0] ?? 'noticed-report.html'
const snap = assembleReport(input)
Deno.writeTextFileSync(out, renderReport(snap))
console.log(
  `wrote ${out}\n` +
    `  answered ${snap.noticed?.answeredDays} of ${snap.noticed?.windowDays} days · ` +
    `${snap.noticed?.absenceDays} marked nothing unusual · bars ${snap.noticed?.barsRender ? 'on' : 'off'} · ` +
    `strip ${snap.noticed?.strip.startDate}–${snap.noticed?.strip.endDate} ` +
    `(${snap.noticed?.strip.unansweredVomitDays} unanswered vomit days) · ` +
    `intake ${snap.noticed?.intake.kind}`,
)
