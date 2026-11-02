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
import type { ReportSnapshot } from './report.ts'
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
export function adHocRecordStartOf(
  snap: Pick<ReportSnapshot, 'medicationHistory'>,
  drug: { itemId?: string | null; drugName: string },
  windowFirstDate: string,
): AdHocRecordStart | null {
  const hist = snap.medicationHistory
  if (!hist) return null
  const doseCourses = hist.entries.filter((e) => e.source === 'doses' && e.firstDoseDay)
  const byItem = drug.itemId ? doseCourses.filter((e) => e.key === `item:${drug.itemId}`) : []
  const pool = byItem.length > 0 ? byItem : doseCourses.filter((e) => e.drugName === drug.drugName)
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
 * The concurrent-changes rows for an ad-hoc drug, annotated with its earliest dose on record.
 * `startDate` stays the window's first dose (the chart's marker is drawn there); the sentence
 * that names the row says the record reaches further back.
 */
function withRecordChanges(snap: ReportSnapshot): ReportSnapshot {
  let changed = false
  const concurrentChanges = snap.concurrentChanges.map((c) => {
    if ((c.kind !== 'medication' && c.kind !== 'supplement') || c.startDate === null || c.recordStart) return c
    const group = snap.unlinkedMedications.find((u) => u.drugName === c.label && u.firstDate === c.startDate)
    if (!group) return c
    const rec = adHocRecordStartOf(snap, group, c.startDate)
    if (!rec) return c
    changed = true
    return { ...c, recordStart: rec }
  })
  return changed ? { ...snap, concurrentChanges } : snap
}

function withTrialRecordOverlaps(snap: ReportSnapshot): ReportSnapshot {
  const t = snap.trial
  if (!t || t.medicationOverlap.length === 0) return snap
  const trialStart = dayKeyFromIndex(t.elapsedStartDayIndex)
  let changed = false
  const medicationOverlap = t.medicationOverlap.map((m) => {
    if (m.startedAt === null || m.recordStart) return m
    const started = m.startedAt.slice(0, 10)
    const group = snap.unlinkedMedications.find((u) => u.drugName === m.drugName && u.firstDate === started)
    if (!group) return m
    const rec = adHocRecordStartOf(snap, group, started)
    if (!rec) return m
    const from = rec.firstDoseDay > trialStart ? rec.firstDoseDay : trialStart
    if (from >= m.fromDate) {
      // The earlier dose moves the start but not the overlap (it, too, predates the trial
      // start the row was already clipped to): only the start changes.
      changed = true
      return { ...m, startedAt: rec.firstDoseDay, recordStart: rec }
    }
    changed = true
    return {
      ...m,
      startedAt: rec.firstDoseDay,
      fromDate: from,
      daysOverlapping: dayNum(m.toDate) - dayNum(from) + 1,
      recordStart: rec,
    }
  })
  if (!changed) return snap
  return { ...snap, trial: { ...t, medicationOverlap } }
}
