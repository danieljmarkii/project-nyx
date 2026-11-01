// The `nyx-live` canonical fixture (CUL-2285, PM ruling X): Nyx's real record, de-identified, as
// the shipped assembleReport produced it on 2026-10-31. TEST-ONLY (`.testutil.ts`: CI discovers
// suites by `.test.ts`, and nothing shipped imports this).
//
// THE SNAPSHOT PREDATES `snap.v2` (CUL-2289 added it the same day, after the capture), so this
// file fills those facts from what the snapshot itself holds, and says where it cannot:
//   - `chronicity: []`: no row per chronicity flag, so R-11's conditions 3 and 4 read false and
//     every flag stays in the band (the louder reading; Nyx's trial is not a skin trial anyway).
//   - `loggedMeals = ratedMeals = diet.mealCompletion.ratedMeals`: the capture does not count
//     unrated meals, so the unrated-meals gap line cannot fire here (a fixture limit, not a rule).
//   - `mealNotFinishedDays`, `intakeWeeks`: from appendix E's capped intake log, a floor.
//   - `symptomDayCounts`: from appendix A's symptom log, which lists every in-window incident.
//   - `loggedDayKeys: []`, `firstEntryDate: null`: not recoverable; nothing on Nyx's sheet reads
//     them (her window is 46 days, so the chart is weekly, and her record began long before it).
//   - `weeksComparable` and `ongoingWindowShort` from the checks the snapshot carries.
// It also predates `atAGlance.recordEdge` (CUL-2283). Nyx's window ends on the report date, so the
// edge is filled from `atAGlance.lastLoggedDate` with nothing after the window and nothing dated
// ahead of it (the capture's window reaches the report date, so neither can exist).
// A test that needs a fact this file cannot honestly fill builds its own fixture instead.
import type { ReportSnapshot } from './report.ts'
// A static import, not a file read: CI runs `deno test --allow-read=supabase/functions`, and the
// canonical fixture lives in docs/ beside the mock that draws it (one copy, CUL-2285).
import NYX_LIVE from '../../../docs/vet-report-v3-discovery/fixtures/nyx-live-2026-10-31.snapshot.json' with { type: 'json' }

function localDay(iso: string, tz: string | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return parts
}

export function nyxLiveSnapshot(): ReportSnapshot {
  const raw = structuredClone(NYX_LIVE) as unknown as { snapshot: Omit<ReportSnapshot, 'v2'> }
  const s = raw.snapshot
  const tz = s.timezone
  const rated = s.diet.mealCompletion?.ratedMeals ?? 0
  const intake = s.provenance.intakeLog
  const notFinished = intake.filter((r) => r.intakeRating !== 'all')
  const counts = new Map<string, number>()
  for (const e of s.provenance.symptomLog) {
    const k = `${e.type}|${localDay(e.occurredAt, tz)}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const buckets = s.symptoms[0]?.bucketStartDates ?? []
  const intakeWeeks = buckets.map((start, i) => {
    const end = buckets[i + 1] ?? '9999-12-31'
    const rows = intake.filter((r) => {
      const d = localDay(r.occurredAt, tz)
      return d >= start && d < end
    })
    return {
      rated: rows.length,
      notFinished: rows.filter((r) => r.intakeRating !== 'all').length,
      refused: rows.filter((r) => r.intakeRating === 'refused').length,
    }
  })
  const reportDate = s.scope.endDate
  const last = s.atAGlance.lastLoggedDate
  const atAGlance = {
    ...s.atAGlance,
    recordEdge: s.atAGlance.recordEdge ?? {
      reportDate,
      lastEntryDate: last,
      lastEntryDaysBeforeReport: last === null ? null : Math.round((Date.parse(`${reportDate}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000),
      windowEndDaysBeforeReport: 0,
      afterWindowEntries: 0,
      afterWindowSymptomEntries: 0,
      afterWindowMeals: 0,
      afterWindowMealsNotFinished: 0,
      afterWindowMealsRefused: 0,
      afterWindowMealsUnrated: 0,
      afterWindowObservations: 0,
      afterWindowDosesNotGiven: 0,
      afterWindowLastDate: null,
      futureDatedEntries: 0,
      futureDatedSymptomEntries: 0,
      futureDatedLastDate: null,
      lastLookDate: null,
      afterWindowLookDays: 0,
      afterWindowLookDaysMarked: 0,
      afterWindowLookDaysUnread: 0,
    },
  }
  return {
    ...s,
    atAGlance,
    v2: {
      chronicity: [],
      loggedMeals: rated,
      ratedMeals: rated,
      mealNotFinishedDays: new Set(notFinished.map((r) => localDay(r.occurredAt, tz))).size,
      firstEntryDate: null,
      weeksComparable: !s.safetyChecks.some((c) => c.state === 'too_few_days'),
      ongoingWindowShort: s.safetyChecks.some((c) => c.kind === 'ongoing' && c.state === 'window_short'),
      loggedDayKeys: [],
      intakeWeeks,
      symptomDayCounts: [...counts.entries()].map(([k, count]) => {
        const [type, day] = k.split('|')
        return { type: type as ReportSnapshot['symptoms'][number]['type'], day, count }
      }),
    },
  } as ReportSnapshot
}
