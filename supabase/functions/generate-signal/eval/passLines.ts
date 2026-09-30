// The pass lines, one set per owner-visible wave, fixed BEFORE any flag-on run
// (Engines v3 PR-16, EN-1, CUL-1131; ruled 2026-09-26 on the plan review).
//
// Each line states the measure (the scorecard rows it reads), the comparison (flag on against
// flag off over the same seeds, or an absolute property), the direction that passes, and the
// value. A value is a RULING, and the rulings come from the ruling sheet (E-6, CUL-583): where
// the sheet has not ruled one, `value` is null and `valueSource` says who sets it. A null value
// is reported, never passed: `evaluatePassLines` says "unruled" and prints the measured number
// beside it, so the first flag-on run cannot pick its own line after seeing its result.
//
// Why these and not the headline "ask evenings" (Data Science lens, 9/26): that number falls by
// construction once EN-9 exists, and an EN-9 that never raises a concern again scores a perfect
// zero. So every quieting line is paired with a detection line over the same wave's pets, and a
// wave passes only when both hold.
//
// WHERE A LINE IS READ. The go-live check runs offline at ≥1,000 pets per scenario, flag off
// against flag on over the same seeds (ADEMP.md §5). CI runs three seeds per scenario and is a
// drift report: at that size a line's verdict is noise (an engine truly at 8% fails a 10% worst-
// case rule 82% of the time at 100 pets; 9% at 1,000, exact binomial), so CI prints the lines'
// numbers and never a verdict on a flag-on comparison.
//
// FROZEN. passLines.test.ts pins a digest of this list. Changing a line after a flag-on run has
// been seen is the failure this file exists to prevent: a change re-pins with the PM's sign-off
// named beside the new digest.

import type { Scorecard } from './scorecard.ts'

export type Wave = 'EN-9' | 'EN-8' | 'EN-3/4/7' | 'EN-11'

export interface PassLine {
  id: string
  wave: Wave
  /** The build that turns the wave on, the first place a flag-on arm can exist. */
  firstFlagOnPr: string
  /** What is measured, in words. */
  measure: string
  /** Scorecard row keys this line reads (anchored regular expressions over `Scorecard.rows`). */
  rows: string
  /** How the rows are summarised across scenarios: the worst scenario, or every row on its own. */
  aggregate: 'worst' | 'each'
  comparison: 'absolute' | 'flag_on_vs_flag_off'
  /**
   *   at_most          the flag-on value is ≤ value (absolute), or ≤ flag-off + value (comparison);
   *   at_least         the flag-on value is ≥ value, or ≥ flag-off − value;
   *   zero             the hard property: the value is exactly 0, in every arm, at every size.
   */
  direction: 'at_most' | 'at_least' | 'zero'
  /** The ruled number (a share, a count or days), or null while it is unruled. */
  value: number | null
  valueSource: string
  /** The line it is paired with so that silence cannot pass alone. */
  pairedWith: string | null
}

export const PASS_LINES: readonly PassLine[] = [
  // ── EN-9, the care state (PR-23) ──
  {
    id: 'EN-9.reRaise',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'The share of stable cats raised again within eight weeks of the owner acknowledging the concern (an ask on the acknowledged sign in the 56 days after).',
    rows: '^own-(answers-vet-knows|visit-with-recheck|lapse-flat)/care/reRaisedWithin8Weeks$',
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-9's re-raise tolerance: a 'now' item on the ruling sheet (E-6, CUL-583), unruled. The drafted 1.5x trigger raised 59% to 75% of stable cats (BRK-4).",
    pairedWith: 'EN-9.doubling',
  },
  {
    id: 'EN-9.doubling',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'A true doubling after the acknowledgement is caught: the probability of an ask on the sign after the doubling starts, including behind a logging lapse.',
    rows: '^own-(lapse-doubling|visit-then-doubling|visit-doubling-fixed)/detect/a:(re_raise|worsening):vomit/probability$',
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'at_least',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583), with EN-9\'s re-raise tolerance. BRK-4: the drafted triggers missed a doubling behind a lapse about three times in ten.',
    pairedWith: 'EN-9.doublingDelay',
  },
  {
    id: 'EN-9.doublingDelay',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'The delay on that doubling: median days from the doubling\'s start to the ask.',
    rows: '^own-(lapse-doubling|visit-then-doubling|visit-doubling-fixed)/detect/a:(re_raise|worsening):vomit/medianDays$',
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583), with EN-9\'s re-raise tolerance.',
    pairedWith: 'EN-9.reRaise',
  },
  {
    id: 'EN-9.silence',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'Silent days for stable, unimproved disease: the longest run of evenings after the acknowledgement with no card at all on the sign (median over pets).',
    rows: '^own-(answers-vet-knows|visit-with-recheck|lapse-flat)/care/medianLongestSilentRun$',
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583). With a booked recheck, the appointment strip carries the one ask (E-3).',
    pairedWith: 'EN-9.reRaise',
  },
  // ── EN-8, the weight lane (PR-19) ──
  {
    id: 'EN-8.falseCards',
    wave: 'EN-8',
    firstFlagOnPr: 'PR-19',
    measure: 'False weight cards on stable pets: the share of pets on a flat weight that see a weight card within 180 days.',
    rows: '^wt-(null-sparse-home|null-sparse-noisy|legacy-profile-guess)/falseCard/180d$',
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-8's confirmation rule (PMD-9) on the ruling sheet (CUL-583), unruled. PMD-9's simulation: 87% of stable pets flagged unconfirmed, 6% confirmed.",
    pairedWith: 'EN-8.delay',
  },
  {
    id: 'EN-8.delay',
    wave: 'EN-8',
    firstFlagOnPr: 'PR-19',
    measure: 'Detection delay by weigh-in cadence: median days from the loss\'s start to a weight card, weekly, sparse and clinic-only weighing each on its own.',
    rows: '^wt-(loss-weekly|loss-sparse|clinic-only-loss|legacy-profile-true-loss)/detect/a:weight/medianDays$',
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-8's items on the ruling sheet (CUL-583). PMD-9 states its cost: a 1%-a-week loss caught near week 8.",
    pairedWith: 'EN-8.falseCards',
  },
  // ── EN-3/4/7, the per-incident tiers (PR-26, PR-28) ──
  {
    id: 'EN-3.redFlagTier',
    wave: 'EN-3/4/7',
    firstFlagOnPr: 'PR-26',
    measure: 'No injected red flag lands below its shipped tier: every photographed blood read shows on the evening its row is visible, as a call.',
    rows: '^engine/redFlag/belowShippedTier$',
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'zero',
    value: 0,
    valueSource: 'A hard property, ruled (E-6 amended 2026-09-26: a quieter row needs harness proof; the tier table in docs/nyx-incident-tiers-requirements.md).',
    pairedWith: 'EN-3.nullCallRate',
  },
  {
    id: 'EN-3.nullCallRate',
    wave: 'EN-3/4/7',
    firstFlagOnPr: 'PR-26',
    measure: 'The call rate on null pets: evenings carrying "worth a call" per pet-month, pooled over the null scenarios, flag on against flag off.',
    rows: '^engine/null/askPerPetMonth/call$',
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): a louder row is adopted provisionally, so this is the cost it is adopted at. The margin is unruled.',
    pairedWith: 'EN-3.redFlagTier',
  },
  // ── EN-11, insight honesty ──
  {
    id: 'EN-11.worsening',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Worsening detection no slower than shipped: on every injected scenario the key scores for worsening, the probability of a worsening (or burden) card and its median delay, flag on against flag off over the same seeds.',
    rows: '^inj-[a-z0-9-]+/detect/a:worsening:[a-z]+/(probability|medianDays)$',
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'E-6 amended: detection no worse than shipped. The non-inferiority margin is unruled (CUL-583). A probability row passes at flag-off minus the margin or better; a days row at flag-off plus the margin or better.',
    pairedWith: null,
  },
]

export type LineStatus = 'pass' | 'fail' | 'unruled' | 'awaiting_flag_on' | 'no_rows'

export interface LineResult {
  id: string
  status: LineStatus
  /** The rows read, with the flag-off value and the flag-on value when there is one. */
  rows: { key: string; off: number | null; on: number | null }[]
}

function pick(line: PassLine, card: Scorecard): string[] {
  const re = new RegExp(line.rows)
  return Object.keys(card.rows).filter((k) => re.test(k))
}

/** Is `v` on the passing side? Probabilities pass upward even under an `at_most` comparison line. */
function passes(line: PassLine, key: string, on: number, off: number | null): boolean {
  if (line.direction === 'zero') return on === 0
  const value = line.value as number
  const higherIsBetter = line.direction === 'at_least' || (line.comparison === 'flag_on_vs_flag_off' && key.endsWith('/probability'))
  if (line.comparison === 'absolute') return higherIsBetter ? on >= value : on <= value
  if (off === null) return false
  return higherIsBetter ? on >= off - value : on <= off + value
}

/**
 * The lines' status. With only the flag-off scorecard (CI today), a hard property is read on it
 * and every other line reports its rows and waits for a flag-on arm. A verdict on a comparison
 * is only meaningful at the go-live size; the caller says which size it ran.
 */
export function evaluatePassLines(off: Scorecard, on: Scorecard | null = null, lines: readonly PassLine[] = PASS_LINES): LineResult[] {
  return lines.map((line) => {
    const keys = pick(line, on ?? off)
    const rows = keys.map((key) => ({ key, off: off.rows[key] ?? null, on: on ? (on.rows[key] ?? null) : null }))
    if (keys.length === 0) return { id: line.id, status: 'no_rows', rows }
    if (line.direction === 'zero') {
      const arms = on ? rows.map((r) => r.on) : rows.map((r) => r.off)
      return { id: line.id, status: arms.every((v) => v === 0) ? 'pass' : 'fail', rows }
    }
    if (on === null) return { id: line.id, status: 'awaiting_flag_on', rows }
    if (line.value === null) return { id: line.id, status: 'unruled', rows }
    const measured = rows.filter((r) => r.on !== null)
    if (measured.length === 0) return { id: line.id, status: 'no_rows', rows }
    const values = line.aggregate === 'worst'
      ? [line.direction === 'at_least' ? Math.min(...measured.map((r) => r.on as number)) : Math.max(...measured.map((r) => r.on as number))]
      : null
    const ok = values
      ? passes(line, measured[0].key, values[0], null)
      : measured.every((r) => passes(line, r.key, r.on as number, r.off))
    return { id: line.id, status: ok ? 'pass' : 'fail', rows }
  })
}

const show = (v: number | null) => (v === null ? '—' : String(v))

export function formatPassLines(results: readonly LineResult[], lines: readonly PassLine[] = PASS_LINES): string {
  const out = ['## Pass lines (fixed before any flag-on run; read at the go-live size, never in CI)', '']
  for (const r of results) {
    const line = lines.find((l) => l.id === r.id)!
    out.push(`**${line.id}** (${line.wave}, first flag-on in ${line.firstFlagOnPr}): ${r.status}. ${line.measure}`)
    out.push(`Passes: ${line.direction === 'zero' ? 'exactly 0' : `${line.direction.replace('_', ' ')} ${line.value === null ? 'an unruled value' : line.value}`}${line.comparison === 'flag_on_vs_flag_off' ? ' relative to flag off' : ''}. Value: ${line.valueSource}`)
    for (const row of r.rows) out.push(`- \`${row.key}\`: flag off ${show(row.off)}${row.on !== null ? `, flag on ${show(row.on)}` : ''}`)
    out.push('')
  }
  return out.join('\n')
}
