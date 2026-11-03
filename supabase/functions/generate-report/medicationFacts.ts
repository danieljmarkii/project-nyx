// One medication fact, read the same way by every section that states it (CUL-2440).
//
// THE CLASS: two sections of the report can move the same medication fact, and when they
// disagree the quieter one hides a confounder. On the `nyx-live` record the lifetime table dated
// cetirizine from Jul 1 (21 doses on record) while the trial block, sheet 1, the diet history and
// the concurrent-changes line all dated it from Oct 3, the first dose INSIDE the window. An
// ad-hoc drug (no regimen) has no recorded start, so the snapshot builder takes its window's
// first dose as one; for an antihistamine on a skin-or-GI trial that turns "on board from trial
// Day 1" into "began eleven weeks in".
//
// THE STOPGAP, louder by construction: an ad-hoc drug is dated from its earliest logged dose in
// the record (`medicationHistory`, which reads further back than the window), and the trial
// overlap is recomputed from that date. This is a render-layer read of facts every snapshot
// already holds, so a frozen snapshot (the `nyx-live` capture, a saved copy) reads true without
// being re-assembled. It only ever moves a start EARLIER, so it can widen an overlap, never
// narrow one.
//
// WHERE THE DATE IS A FLOOR: `medicationHistory.sinceDay` is the earliest day the history read
// reaches. A first dose ON that day may be the read's edge rather than the drug's start, so the
// sentence says "on record since", and `atHistoryFloor` lets it add that dosing may predate it
// (C-37: scope a date to the query when the read behind it may be truncated).
import type { MedicationHistoryEntry, ReportSnapshot } from './report.ts'
import { looksAntibacterial, type TrialRecordOnlyOverlap } from './trial.ts'
import { dayKeyFromIndex } from '../../../lib/utils.ts'

/** The earliest logged dose of an ad-hoc drug, when the record reaches before its window. */
export interface AdHocRecordStart {
  /** The earliest dose day in `medicationHistory`. */
  firstDoseDay: string
  /** True when that day is the history read's own floor: dosing may predate it. */
  atHistoryFloor: boolean
}

/**
 * The record's earliest dose for an ad-hoc drug, when it falls before `windowFirstDate`. Matched
 * by item id (`item:<id>`, `buildMedicationHistory`'s key for a dose-derived course), else by
 * name across every dose-derived course, the earliest winning. Null when the record holds
 * nothing earlier: the window's first dose is then also the record's.
 */
/** The dose-derived history courses for a drug: by item id, else by name. One pool for every read. */
function doseCoursesOf(
  snap: Pick<ReportSnapshot, 'medicationHistory'>,
  drug: { itemId?: string | null; drugName: string },
): MedicationHistoryEntry[] {
  const hist = snap.medicationHistory
  if (!hist) return []
  const doseCourses = hist.entries.filter((e) => e.source === 'doses' && e.firstDoseDay)
  const byItem = drug.itemId ? doseCourses.filter((e) => e.key === `item:${drug.itemId}`) : []
  return byItem.length > 0 ? byItem : doseCourses.filter((e) => e.drugName === drug.drugName)
}

export function adHocRecordStartOf(
  snap: Pick<ReportSnapshot, 'medicationHistory'>,
  drug: { itemId?: string | null; drugName: string },
  windowFirstDate: string,
): AdHocRecordStart | null {
  const hist = snap.medicationHistory
  if (!hist) return null
  const pool = doseCoursesOf(snap, drug)
  let first: string | null = null
  for (const e of pool) if (first === null || (e.firstDoseDay as string) < first) first = e.firstDoseDay
  if (first === null || first >= windowFirstDate) return null
  return { firstDoseDay: first, atHistoryFloor: hist.sinceDay !== null && first <= hist.sinceDay }
}

function dayNum(key: string): number {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000)
}

/**
 * The snapshot with each ad-hoc drug's trial overlap dated from its earliest logged dose. An
 * overlap row is ad-hoc when an unlinked (no-regimen) dose group of the same name starts on the
 * row's own start: the builder took the window's first dose as the start. Every other row, and
 * every other field, is returned as it was. Idempotent: a second pass finds nothing earlier.
 */
export function withRecordOverlaps(snap: ReportSnapshot): ReportSnapshot {
  const out = withRecordChanges(snap)
  return withTrialRecordOverlaps(out)
}

/**
 * True when a regimen of the same name starts on `day` (ADVERSARIAL PASS 1, QUIET). The snapshot
 * carries no provenance on an overlap or change row, so a row is read as ad-hoc only when no
 * prescribed course could have produced it: a regimen and a second same-name item first dosed on
 * the regimen's start day otherwise relabelled the prescribed steroid "ad-hoc, not a continuous
 * course" and dropped its "no recorded end". When in doubt the row is left exactly as built.
 */
function regimenCouldBe(snap: ReportSnapshot, drugName: string, day: string): boolean {
  return snap.medications.some((r) => r.drugName === drugName && r.startedAt !== null && r.startedAt.slice(0, 10) === day)
}

/**
 * The ad-hoc (no-regimen) dose group a concurrent-change row was built from, or null (CUL-2480
 * instance 1). Same predicate as `withRecordChanges`: an unlinked group of the row's name whose first
 * window dose is the row's start, and no same-name regimen that could have produced it instead.
 */
export function adHocGroupOf(
  snap: ReportSnapshot,
  c: Pick<ReportSnapshot['concurrentChanges'][number], 'kind' | 'label' | 'startDate'>,
): ReportSnapshot['unlinkedMedications'][number] | null {
  if ((c.kind !== 'medication' && c.kind !== 'supplement') || c.startDate === null) return null
  const start = c.startDate.slice(0, 10)
  const group = snap.unlinkedMedications.find((u) => u.drugName === c.label && u.firstDate === start)
  if (!group || regimenCouldBe(snap, c.label, start)) return null
  return group
}

/**
 * The concurrent-changes rows for an ad-hoc drug, annotated with its earliest dose on record.
 * `startDate` stays the window's first dose (the chart's marker is drawn there); the sentence
 * that names the row says the record reaches further back.
 */
function withRecordChanges(snap: ReportSnapshot): ReportSnapshot {
  let changed = false
  const concurrentChanges = snap.concurrentChanges.map((c) => {
    if ((c.kind !== 'medication' && c.kind !== 'supplement') || c.startDate === null || c.recordStart) return c
    const group = snap.unlinkedMedications.find((u) => u.drugName === c.label && u.firstDate === c.startDate)
    if (!group || regimenCouldBe(snap, c.label, c.startDate.slice(0, 10))) return c
    const rec = adHocRecordStartOf(snap, group, c.startDate)
    if (!rec) return c
    changed = true
    return { ...c, recordStart: rec }
  })
  return changed ? { ...snap, concurrentChanges } : snap
}

function withTrialRecordOverlaps(snap: ReportSnapshot): ReportSnapshot {
  const t = snap.trial
  if (!t) return snap
  const withOnly = withRecordOnlyOverlaps(snap)
  if (t.medicationOverlap.length === 0) return withOnly
  return withRedatedOverlaps(withOnly)
}

/**
 * CUL-2480 instance 4: ad-hoc drugs whose doses on record cross the trial but which have no overlap
 * row. A dose-derived history course qualifies when its first dose is on or before the trial's last
 * elapsed day and its last dose on or after its first, and no overlap row carries its name. The
 * builder reads only the window's doses, so a drug given before the trial and again after it, with
 * this window after the trial, had no row at all while concurrent changes said "doses on record
 * since". Whether any dose fell inside the trial is not counted anywhere, and the row says so.
 */
function withRecordOnlyOverlaps(snap: ReportSnapshot): ReportSnapshot {
  const t = snap.trial!
  const hist = snap.medicationHistory
  if (!hist || t.recordOnlyOverlap) return snap
  const trialFirst = dayKeyFromIndex(t.elapsedStartDayIndex)
  const trialLast = dayKeyFromIndex(t.elapsedEndDayIndex)
  const named = new Set(t.medicationOverlap.map((m) => m.drugName))
  const byName = new Map<string, MedicationHistoryEntry[]>()
  for (const e of hist.entries) {
    if (e.source !== 'doses' || !e.firstDoseDay || !e.lastDoseDay) continue
    if (named.has(e.drugName)) continue
    const g = byName.get(e.drugName)
    if (g) g.push(e)
    else byName.set(e.drugName, [e])
  }
  const out: TrialRecordOnlyOverlap[] = []
  for (const [drugName, courses] of byName) {
    let first = courses[0].firstDoseDay as string
    let last = courses[0].lastDoseDay as string
    let doses = 0
    for (const e of courses) {
      if ((e.firstDoseDay as string) < first) first = e.firstDoseDay as string
      if ((e.lastDoseDay as string) > last) last = e.lastDoseDay as string
      doses += e.dosesLogged
    }
    if (first > trialLast || last < trialFirst) continue
    const group = snap.unlinkedMedications.find((u) => u.drugName === drugName)
    out.push({
      drugName,
      isSupplement: group?.isSupplement ?? false,
      route: group?.route ?? null,
      firstDoseDay: first,
      lastDoseDay: last,
      dosesOnRecord: doses,
      atHistoryFloor: hist.sinceDay !== null && first <= hist.sinceDay,
      // ADVERSARIAL PASS 1 (B5): the same microbiome sentence a full overlap row would carry.
      antibacterialInGiTrial: t.indication === 'gi' && looksAntibacterial(drugName),
    })
  }
  if (out.length === 0) return snap
  out.sort((a, b) => a.firstDoseDay.localeCompare(b.firstDoseDay) || a.drugName.localeCompare(b.drugName))
  return { ...snap, trial: { ...t, recordOnlyOverlap: out } }
}

function withRedatedOverlaps(snap: ReportSnapshot): ReportSnapshot {
  const t = snap.trial!
  const trialStart = dayKeyFromIndex(t.elapsedStartDayIndex)
  let changed = false
  const medicationOverlap = t.medicationOverlap.map((m) => {
    if (m.startedAt === null || m.recordStart) return m
    const started = m.startedAt.slice(0, 10)
    const group = snap.unlinkedMedications.find((u) => u.drugName === m.drugName && u.firstDate === started)
    if (!group || regimenCouldBe(snap, m.drugName, started)) return m
    const rec = adHocRecordStartOf(snap, group, started)
    if (!rec) return m
    const from = rec.firstDoseDay > trialStart ? rec.firstDoseDay : trialStart
    const fromDate = from >= m.fromDate ? m.fromDate : from
    // The doses the row is made of (from #1428's cold read): the window's doses inside the trial
    // span, and every dose on record for the drug, from the same pool the record start reads.
    // ADVERSARIAL PASS 1 (B2, QUIET): `doseDays` are DAYS, not doses, so the window's side is a count
    // of dose days and is named as one; twice-daily dosing printed as half its doses.
    const adHocDoses = {
      inTrialInWindowDays: group.doseDays.filter((d) => d >= fromDate && d <= m.toDate).length,
      onRecord: doseCoursesOf(snap, group).reduce((n, e) => n + e.dosesLogged, 0),
    }
    if (from >= m.fromDate) {
      // The earlier dose moves the start but not the overlap (it, too, predates the trial
      // start the row was already clipped to): only the start changes.
      changed = true
      return { ...m, startedAt: rec.firstDoseDay, recordStart: rec, adHocDoses }
    }
    changed = true
    return {
      ...m,
      startedAt: rec.firstDoseDay,
      fromDate: from,
      daysOverlapping: dayNum(m.toDate) - dayNum(from) + 1,
      recordStart: rec,
      adHocDoses,
    }
  })
  if (!changed) return snap
  return { ...snap, trial: { ...t, medicationOverlap } }
}
