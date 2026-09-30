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

import type { Lane } from '../../_shared/engineCorpus/trajectory/spec.ts'
import { laneCanMatch, type Scorecard } from './scorecard.ts'

export type Wave = 'EN-9' | 'EN-8' | 'EN-3/4/7' | 'EN-11'

/**
 * The engine keys a flag-on arm must have on for a wave's comparison to mean anything. An arm
 * that only differs from flag off by NAME (a key the Signal never reads, so its rows equal flag
 * off's) passed EN-11 and EN-3 by construction (third adversarial pass). Of these, only
 * engines_v3_en3 exists today (engineFlags.ts ENGINE_KEYS also holds en0 and en10, which no wave
 * here names); the others are the names each wave's first PR adds, and until then no arm can carry
 * them. A comparison arm carries EXACTLY its wave's keys: an arm bundling a second key, or moving one
 * irrelevant row, let a no-op EN-11 pass every non-inferiority line (fifth adversarial pass). Waves
 * that stack are compared prior-waves against prior-waves-plus-key, never against flag off (CUL-1441).
 */
/**
 * Whether the harness runs the engine a wave's key changes. A key the observer never exercises
 * leaves the flag-on rows equal to flag off's, and the wave then passes by construction: with
 * `engines_v3_en3` on, the rows were byte-identical and EN-3/4/7 read "pass" (fourth adversarial
 * pass), because that key changes the per-incident read (analyze-vomit, analyze-stool), which the
 * observer does not run until CUL-1439. EN-9 is false while the observer passes an empty care
 * record (observer.ts `NO_CARE`); PR-23 flips it in the PR that maps the corpus's answers onto it.
 * A wave not observed reads `incomparable` against any flag-on arm.
 */
export const HARNESS_OBSERVES: Readonly<Record<Wave, boolean>> = {
  'EN-9': false,
  // False until rowsAt (syntheticRows.ts) feeds weights: today the engine gets none, so a weight
  // lane would read zero false cards by construction (fifth adversarial pass).
  'EN-8': false,
  'EN-3/4/7': false,
  'EN-11': true,
}

export const WAVE_KEYS: Readonly<Record<Wave, readonly string[]>> = {
  'EN-9': ['engines_v3_en9'],
  'EN-8': ['engines_v3_en8'],
  'EN-3/4/7': ['engines_v3_en3'],
  'EN-11': ['engines_v3_en11'],
}

export interface PassLine {
  id: string
  wave: Wave
  /** The build that turns the wave on, the first place a flag-on arm can exist. */
  firstFlagOnPr: string
  /** What is measured, in words. */
  measure: string
  /** The scorecard rows this line reads, by exact key. passLines.test.ts asserts each exists. */
  rows: readonly string[]
  /** Rows that must reach `min` in the arm read for the line to mean anything: a zero over nothing
   *  injected, a rate over no scored pets, a re-raise share over one acknowledged cat, is no proof.
   *  `each` holds every row to the floor (an `each` line's rows are read one by one, so a sum let one
   *  scenario be read over a single pet, fourth adversarial pass); `sum` holds their total. */
  nonVacuity?: { rows: readonly string[]; min: number; per: 'each' | 'sum' }
  /** The answer-key lane the rows score. A lane no card can answer yet (`laneCanMatch`) makes the line `incomplete`. */
  needsLane?: Lane
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
    rows: [
      'own-answers-vet-knows/care/reRaisedWithin8Weeks',
      'own-visit-with-recheck/care/reRaisedWithin8Weeks',
    ],
    nonVacuity: { rows: ['own-answers-vet-knows/care/acknowledged', 'own-visit-with-recheck/care/acknowledged'], min: 3, per: 'each' },
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
    measure: 'A true doubling after the acknowledgement is caught: the probability that an ask on the sign returns (after at least one quiet evening since the acknowledgement) once the doubling starts. Behind a logging lapse the record cannot show it, so that case is held by EN-9.lapseReassurance instead.',
    rows: [
      'own-visit-then-doubling/detect/a:re_raise:vomit/probability',
      'own-visit-doubling-fixed/detect/a:re_raise:vomit/probability',
    ],
    nonVacuity: { rows: ['own-visit-then-doubling/detect/a:re_raise:vomit/eligible', 'own-visit-doubling-fixed/detect/a:re_raise:vomit/eligible'], min: 3, per: 'each' },
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'at_least',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583), with EN-9\'s re-raise tolerance. BRK-4: the drafted triggers missed a doubling behind a lapse about three times in ten.',
    pairedWith: 'EN-9.reRaiseEver',
  },
  {
    id: 'EN-9.doublingDelay',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'The delay on that doubling: median days from the doubling\'s start to the ask.',
    rows: [
      'own-visit-then-doubling/detect/a:re_raise:vomit/medianDays',
      'own-visit-doubling-fixed/detect/a:re_raise:vomit/medianDays',
    ],
    nonVacuity: { rows: ['own-visit-then-doubling/detect/a:re_raise:vomit/eligible', 'own-visit-doubling-fixed/detect/a:re_raise:vomit/eligible'], min: 3, per: 'each' },
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
    rows: [
      'own-answers-vet-knows/care/medianLongestSilentRun',
      'own-visit-with-recheck/care/medianLongestSilentRun',
    ],
    nonVacuity: { rows: ['own-answers-vet-knows/care/acknowledged', 'own-visit-with-recheck/care/acknowledged'], min: 3, per: 'each' },
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583). With a booked recheck, the appointment strip carries the one ask (E-3).',
    pairedWith: 'EN-9.reRaise',
  },
  {
    id: 'EN-9.reRaiseEver',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'Re-raised with nothing to raise it, over the whole run: the share of stable cats asked about the acknowledged sign again at any point after the acknowledgement, and on the doubling scenarios the share asked between the acknowledgement and the doubling. Closes the eight-week window: a latch that starts at week nine, or a timer, passed EN-9.reRaise alone (second adversarial pass).',
    rows: [
      'own-answers-vet-knows/care/reRaisedEver',
      'own-visit-with-recheck/care/reRaisedEver',
      'own-visit-then-doubling/detect/a:re_raise:vomit/raisedBeforeStart',
      'own-visit-doubling-fixed/detect/a:re_raise:vomit/raisedBeforeStart',
    ],
    nonVacuity: { rows: ['own-answers-vet-knows/care/acknowledged', 'own-visit-with-recheck/care/acknowledged'], min: 3, per: 'each' },
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-9's re-raise tolerance on the ruling sheet (E-6, CUL-583), unruled; the same ruling as EN-9.reRaise, held over the whole run.",
    pairedWith: 'EN-9.doubling',
  },
  {
    id: 'EN-9.askAfterAck',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'How often a stable cat is asked about the acknowledged sign after the acknowledgement: evenings carrying an ask on it, per pet-month.',
    rows: [
      'own-answers-vet-knows/care/askPerPetMonthAfterAck',
      'own-visit-with-recheck/care/askPerPetMonthAfterAck',
    ],
    nonVacuity: { rows: ['own-answers-vet-knows/care/acknowledged', 'own-visit-with-recheck/care/acknowledged'], min: 3, per: 'each' },
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583), with EN-9\'s re-raise tolerance.',
    pairedWith: 'EN-9.doubling',
  },
  {
    id: 'EN-9.scored',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'The pets the EN-9 lines are read over may not shrink: stable cats never acknowledged (the engine never asked), doubling cats never acknowledged, and doubling cats acknowledged too late to score a re-raise, flag on at most flag off plus a tolerance. A scorecard with 1 scored doubling pet and 3 of 1,000 cats acknowledged passed every other EN-9 line (fourth adversarial pass).',
    rows: [
      'own-answers-vet-knows/care/neverAcknowledged',
      'own-visit-with-recheck/care/neverAcknowledged',
      'own-visit-then-doubling/detect/a:re_raise:vomit/neverAcknowledged',
      'own-visit-then-doubling/detect/a:re_raise:vomit/ackTooLate',
      'own-visit-doubling-fixed/detect/a:re_raise:vomit/ackTooLate',
      'own-visit-doubling-fixed/detect/a:re_raise:vomit/neverAcknowledged',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'A tolerance in pets, unruled (CUL-583), for the same count-noise reason as EN-11.eligible.',
    pairedWith: 'EN-9.doubling',
  },
  {
    id: 'EN-9.lapseReassurance',
    wave: 'EN-9',
    firstFlagOnPr: 'PR-23',
    measure: 'Behind a logging lapse (symptoms stop being logged after the acknowledgement, meals continue) no card reads the silence as improvement: the share of pets shown an improving or resolved card, flag on against flag off.',
    rows: [
      'own-lapse-doubling/falseCard/180d',
      'own-lapse-flat/falseCard/180d',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: 0,
    valueSource: 'Ruled by the standing invariant (CLAUDE.md, n=1 never reassures: absence is not wellness), which needs no PM confirmation: flag on may show no more false reassurance than flag off. The shipped engine already shows one here (a separate issue).',
    pairedWith: 'EN-9.doubling',
  },
  // ── EN-8, the weight lane (PR-19) ──
  {
    id: 'EN-8.falseCards',
    wave: 'EN-8',
    firstFlagOnPr: 'PR-19',
    measure: 'False weight cards on stable pets: the share of pets on a flat weight that see a weight card within 180 days.',
    rows: [
      'wt-null-sparse-home/falseCard/180d',
      'wt-null-sparse-noisy/falseCard/180d',
      'wt-legacy-profile-guess/falseCard/180d',
    ],
    aggregate: 'worst',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-8's confirmation rule (PMD-9) on the ruling sheet (CUL-583), unruled. PMD-9's simulation: 87% of stable pets flagged unconfirmed, 6% confirmed.",
    needsLane: 'weight',
    pairedWith: 'EN-8.delay',
  },
  {
    id: 'EN-8.delay',
    wave: 'EN-8',
    firstFlagOnPr: 'PR-19',
    measure: 'Detection delay by weigh-in cadence: median days from the loss\'s start to a weight card, weekly, sparse and clinic-only weighing each on its own.',
    rows: [
      'wt-loss-weekly/detect/a:weight/medianDays',
      'wt-loss-sparse/detect/a:weight/medianDays',
      'wt-clinic-only-loss/detect/a:weight/medianDays',
      'wt-legacy-profile-true-loss/detect/a:weight/medianDays',
    ],
    aggregate: 'each',
    comparison: 'absolute',
    direction: 'at_most',
    value: null,
    valueSource: "EN-8's items on the ruling sheet (CUL-583). PMD-9 states its cost: a 1%-a-week loss caught near week 8.",
    needsLane: 'weight',
    pairedWith: 'EN-8.falseCards',
  },
  // ── EN-3/4/7, the per-incident tiers (PR-26, PR-28) ──
  {
    id: 'EN-3.redFlagTier',
    wave: 'EN-3/4/7',
    firstFlagOnPr: 'PR-26',
    measure: 'No injected red flag lands below its shipped tier: every photographed blood read shows on the evening its row is visible, as a call.',
    rows: [
      'engine/redFlag/belowShippedTier',
    ],
    // Three is what CI seeds carry (one scenario); the go-live size carries hundreds.
    nonVacuity: { rows: ['engine/redFlag/injected'], min: 3, per: 'sum' },
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
    rows: [
      'engine/null/askPerPetMonth/call',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): a louder row is adopted provisionally, so this is the cost it is adopted at. The margin is unruled.',
    pairedWith: 'EN-3.redFlagTier',
  },
  // ── EN-11, insight honesty ──
  // Detection is split by unit (a share and a count of days never share one margin: a days-sized
  // margin passed a 1.0 → 0 detection loss, third adversarial pass), and each half is paired with
  // a false-card cost, and the pets scored may not shrink.
  {
    id: 'EN-11.detection',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Worsening detection no worse than shipped: on every injected scenario the key scores for worsening, the share of clear pets shown a worsening (or burden) card within 56 days of the rise, flag on against flag off over the same seeds.',
    rows: [
      'inj-enteropathy-onset/detect/a:worsening:vomit/probability',
      'inj-enteropathy-onset/detect/a:worsening:diarrhea/probability',
      'inj-rate-doubling/detect/a:worsening:vomit/probability',
      'inj-kennel-cough-gag/detect/a:worsening:cough/probability',
    ],
    nonVacuity: { rows: [
      'inj-enteropathy-onset/detect/a:worsening:vomit/eligible',
      'inj-enteropathy-onset/detect/a:worsening:diarrhea/eligible',
      'inj-rate-doubling/detect/a:worsening:vomit/eligible',
      'inj-kennel-cough-gag/detect/a:worsening:cough/eligible',
    ], min: 3, per: 'sum' },
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_least',
    value: null,
    valueSource: 'E-6 amended: detection no worse than shipped. The non-inferiority margin, as a share, is unruled (CUL-583).',
    pairedWith: 'EN-11.falseWorsening',
  },
  {
    id: 'EN-11.delay',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Worsening detection no slower than shipped: the median days from the rise to that card, flag on against flag off.',
    rows: [
      'inj-enteropathy-onset/detect/a:worsening:vomit/medianDays',
      'inj-enteropathy-onset/detect/a:worsening:diarrhea/medianDays',
      'inj-rate-doubling/detect/a:worsening:vomit/medianDays',
      'inj-kennel-cough-gag/detect/a:worsening:cough/medianDays',
    ],
    nonVacuity: { rows: [
      'inj-enteropathy-onset/detect/a:worsening:vomit/eligible',
      'inj-enteropathy-onset/detect/a:worsening:diarrhea/eligible',
      'inj-rate-doubling/detect/a:worsening:vomit/eligible',
      'inj-kennel-cough-gag/detect/a:worsening:cough/eligible',
    ], min: 3, per: 'sum' },
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'E-6 amended: detection no slower than shipped. The margin, in days, is unruled (CUL-583).',
    pairedWith: 'EN-11.falseWorseningEvenings',
  },
  {
    id: 'EN-11.eligible',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'The pets the detection lines score may not shrink: clear pets (no worsening card in the week before the rise) per injected scenario, flag on at least flag off less a tolerance. An engine that never stands a card down leaves fewer clear pets and raised its own detection share (third adversarial pass).',
    rows: [
      'inj-enteropathy-onset/detect/a:worsening:vomit/eligible',
      'inj-enteropathy-onset/detect/a:worsening:diarrhea/eligible',
      'inj-rate-doubling/detect/a:worsening:vomit/eligible',
      'inj-kennel-cough-gag/detect/a:worsening:cough/eligible',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_least',
    value: null,
    valueSource: "A tolerance in pets, unruled (CUL-583). Not structural: two equally noisy engines differ by about sqrt(2Np(1-p)) pets, about 16 at N = 1,000 and p = 0.15, so a margin of 0 fails a sound engine about half the time. And a rise is not free: hiding cards in the week before a rise raises it (fourth adversarial pass). Scoring only pets clear in BOTH arms retires this line (CUL-1441, before EN-11's first flag-on run).",
    pairedWith: 'EN-11.detection',
  },
  {
    id: 'EN-11.falseWorsening',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'The false-card cost of detection, as a share: null pets shown a worsening (or burden) card within 180 days, worst null scenario and pooled, flag on against flag off.',
    rows: [
      'engine/null/falseLane/worsening/worst/180d',
      'engine/null/falseLane/worsening/pooled/180d',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, as a share, by which EN-11 may raise false worsening cards, unruled.',
    pairedWith: 'EN-11.detection',
  },
  {
    id: 'EN-11.falseWorseningEvenings',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'The false-card cost as a burden: evenings per pet-month the null pets carry a worsening or a burden card, pooled, flag on against flag off. The share above saturates (its worst row is 1.0 under flag off); this one does not, and an engine that never stands a card down moved it twentyfold.',
    rows: [
      'engine/null/laneEveningsPerPetMonth/worsening',
      'engine/null/laneEveningsPerPetMonth/burden',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, in evenings per pet-month, unruled.',
    pairedWith: 'EN-11.delay',
  },
  // The food lane: what EN-11 changes most (the Early tier, the test before a culprit card; CUL-1141,
  // the step-change brief's P7 names food time-to-significance as its cost). Worsening-only lines
  // passed an EN-11 that never caught a protein reaction and put a culprit card on every staple
  // (fifth adversarial pass); added with the PM's approval, 2026-09-30.
  {
    id: 'EN-11.foodDetection',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Food culprit detection no worse than shipped: on the two protein-reaction scenarios (relative risk 3, one protein hidden in a food named for another), the share of clear pets shown a food card naming the reacting protein ALONE within 56 days, flag on against flag off. A joint card, or one naming everything the pet eats, is never a detection (PM ruling, 2026-09-30): counted whenever it merely included the culprit, naming more proteins always bought detection (sixth to eighth adversarial passes).',
    rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/probability',
      'inj-protein-reaction-hidden/detect/a:food:chicken/probability',
    ],
    nonVacuity: { rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/eligible',
      'inj-protein-reaction-hidden/detect/a:food:chicken/eligible',
    ], min: 3, per: 'each' },
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_least',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the non-inferiority margin, as a share, unruled. D5 (CUL-1141) may deliberately slow this (retiring Early); the margin is where that cost is ruled.',
    pairedWith: 'EN-11.falseFood',
  },
  {
    id: 'EN-11.foodDelay',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Food culprit detection delay: median days to that card, flag on against flag off.',
    rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/medianDays',
      'inj-protein-reaction-hidden/detect/a:food:chicken/medianDays',
    ],
    nonVacuity: { rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/eligible',
      'inj-protein-reaction-hidden/detect/a:food:chicken/eligible',
    ], min: 3, per: 'each' },
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, in days, unruled. The step-change brief puts retiring Early at about week 8 against about week 2 today.',
    pairedWith: 'EN-11.falseFoodEvenings',
  },
  {
    id: 'EN-11.foodEligible',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'The pets the food lines score may not shrink: clear pets per protein-reaction scenario, flag on at least flag off less a tolerance. A PLACEHOLDER today: food detection starts on day 0, so the clear window is empty and every pet-run is eligible, and this line cannot fail (sixth adversarial pass). It is kept so the food lines have the same shape as worsening when CUL-1441 scores both arms over the same pets.',
    rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/eligible',
      'inj-protein-reaction-hidden/detect/a:food:chicken/eligible',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_least',
    value: null,
    valueSource: 'A tolerance in pets, unruled (CUL-583), for the count-noise reason EN-11.eligible gives; retired by CUL-1441.',
    pairedWith: 'EN-11.foodDetection',
  },
  {
    id: 'EN-11.falseFood',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'False culprit cards: null pets shown a food card within 180 days, worst null scenario and pooled, and the two staple feeders on their own (a staple is where a false culprit costs a vet the elimination diet), flag on against flag off.',
    rows: [
      'engine/null/falseLane/food/worst/180d',
      'engine/null/falseLane/food/pooled/180d',
      'null-staple-1pm/falseLane/food/180d',
      'null-staple-3pm-bursty/falseLane/food/180d',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, as a share, unruled; D4 (E-4) sets the absolute chance-card budget separately.',
    pairedWith: 'EN-11.foodDetection',
  },
  {
    id: 'EN-11.culpritPersistence',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'The correct card keeps showing: on the two protein-reaction scenarios, evenings per pet-month carrying a food card naming the reacting protein alone, flag on against flag off. Detection needs one evening; an engine that dropped its food cards after week 8 still scored as detecting (eighth adversarial pass).',
    rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/culpritAloneEveningsPerPetMonth',
      'inj-protein-reaction-hidden/detect/a:food:chicken/culpritAloneEveningsPerPetMonth',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_least',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, in evenings per pet-month, unruled.',
    pairedWith: 'EN-11.foodPrecision',
  },
  {
    id: 'EN-11.foodPrecision',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'Of the evenings a reacting pet carries a food card, the share whose cards name any protein other than the reacting one (a joint card included), flag on against flag off. A share of food evenings, so showing fewer food evenings cannot lower it; the per-pet share and the per-month count (still reported as rows) could both be lowered that way (eighth adversarial pass).',
    rows: [
      'inj-protein-reaction-rr3/detect/a:food:beef/wrongShareOfFoodEvenings',
      'inj-protein-reaction-hidden/detect/a:food:chicken/wrongShareOfFoodEvenings',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, as a share, unruled.',
    pairedWith: 'EN-11.culpritPersistence',
  },
  {
    id: 'EN-11.falseFoodEvenings',
    wave: 'EN-11',
    firstFlagOnPr: 'EN-11',
    measure: 'False culprit cards as a burden: evenings per pet-month the null pets carry a food card, pooled, flag on against flag off (the worst share is already 1.0 under flag off).',
    rows: [
      'engine/null/laneEveningsPerPetMonth/food',
    ],
    aggregate: 'each',
    comparison: 'flag_on_vs_flag_off',
    direction: 'at_most',
    value: null,
    valueSource: 'The ruling sheet (E-6, CUL-583): the margin, in evenings per pet-month, unruled.',
    pairedWith: 'EN-11.foodDelay',
  },
]

export type LineStatus = 'pass' | 'fail' | 'unruled' | 'awaiting_flag_on' | 'incomplete' | 'incomparable'

export interface LineResult {
  id: string
  status: LineStatus
  /** The rows read, with the flag-off value and the flag-on value when there is one (undefined: absent). */
  rows: { key: string; off: number | null | undefined; on: number | null | undefined }[]
}

/** Is `on` on the passing side? A probability passes upward even under an `at_most` comparison line. */
function passes(line: PassLine, key: string, on: number, off: number | null): boolean {
  const value = line.value as number
  const higherIsBetter = line.direction === 'at_least' || (line.comparison === 'flag_on_vs_flag_off' && key.endsWith('/probability'))
  if (line.comparison === 'absolute') return higherIsBetter ? on >= value : on <= value
  if (off === null) return true // flag off never found it; flag on cannot be worse than never
  return higherIsBetter ? on >= off - value : on <= off + value
}

/**
 * The lines' status. With only the flag-off scorecard (CI today), a hard property is read on it
 * and every other line reports its rows and waits for a flag-on arm. A row absent from either
 * arm makes the line `incomplete`, never a pass: a flag-on arm run over fewer scenarios must not
 * clear a line on the rows it happened to produce. Two arms over different seeds or scenarios
 * are `incomparable`. A verdict on a comparison is only meaningful at the go-live size.
 */
export function evaluatePassLines(
  off: Scorecard,
  on: Scorecard | null = null,
  lines: readonly PassLine[] = PASS_LINES,
  observes: Readonly<Record<Wave, boolean>> = HARNESS_OBSERVES,
): LineResult[] {
  // Two arms compare only when the off arm IS flag off, the on arm is something else, and both ran
  // the same seeds over the same scenarios (by id, not count). Handing the flag-off file in as
  // both arms passed every ruled comparison (second adversarial pass).
  const comparable = on === null || (
    Array.isArray(off.meta.flagsOn) && Array.isArray(on.meta.flagsOn) &&
    off.meta.arm === 'flag_off' &&
    off.meta.flagsOn.length === 0 &&
    // An arm that moved nothing is not a flag-on arm, whatever keys it names.
    JSON.stringify(on.rows) !== JSON.stringify(off.rows) &&
    on.meta.arm !== off.meta.arm &&
    on.meta.seeds === off.meta.seeds &&
    JSON.stringify(on.meta.scenarioIds) === JSON.stringify(off.meta.scenarioIds)
  )
  return lines.map((line) => {
    const rows = line.rows.map((key) => ({ key, off: off.rows[key], on: on ? on.rows[key] : undefined }))
    const armRows = (arm: Scorecard) => line.rows.map((k) => arm.rows[k])
    // The on arm must carry the wave's own keys: a name that differs is not an engine that differs.
    const exactKeys = on !== null && JSON.stringify([...on.meta.flagsOn].sort()) === JSON.stringify([...WAVE_KEYS[line.wave]].sort())
    if (!comparable || (on !== null && (!observes[line.wave] || !exactKeys))) {
      return { id: line.id, status: 'incomparable', rows }
    }
    const readArm = on ?? off
    const nv = line.nonVacuity
    const count = (k: string) => (typeof readArm.rows[k] === 'number' ? (readArm.rows[k] as number) : 0)
    const vacuous = nv !== undefined && (nv.per === 'each' ? nv.rows.some((k) => count(k) < nv.min) : nv.rows.reduce((a, k) => a + count(k), 0) < nv.min)
    if (line.needsLane !== undefined && !laneCanMatch(line.needsLane)) return { id: line.id, status: 'incomplete', rows }
    if (line.direction === 'zero') {
      const arm = on ?? off
      const values = armRows(arm)
      if (values.some((v) => v === undefined || v === null) || vacuous) return { id: line.id, status: 'incomplete', rows }
      return { id: line.id, status: values.every((v) => v === 0) ? 'pass' : 'fail', rows }
    }
    if (on === null) return { id: line.id, status: 'awaiting_flag_on', rows }
    if (line.value === null) return { id: line.id, status: 'unruled', rows }
    if (rows.some((r) => r.on === undefined || r.off === undefined) || vacuous) return { id: line.id, status: 'incomplete', rows }
    if (line.comparison === 'absolute') {
      if (rows.some((r) => r.on === null)) return { id: line.id, status: 'incomplete', rows }
      const onValues = rows.map((r) => r.on as number)
      const ok = line.aggregate === 'worst'
        ? passes(line, rows[0].key, line.direction === 'at_least' ? Math.min(...onValues) : Math.max(...onValues), null)
        : rows.every((r) => passes(line, r.key, r.on as number, null))
      return { id: line.id, status: ok ? 'pass' : 'fail', rows }
    }
    // A comparison, row by row: flag on losing a number flag off had (a detection it no longer
    // makes) fails; both null (neither arm found it) holds.
    const ok = rows.every((r) => (r.on === null ? r.off === null : passes(line, r.key, r.on as number, r.off as number | null)))
    return { id: line.id, status: ok ? 'pass' : 'fail', rows }
  })
}

const show = (v: number | null | undefined) => (v === undefined ? '(absent)' : v === null ? '—' : String(v))

/** A wave passes only when every one of its lines does: `pairedWith` is what makes silence alone fail. */
export function waveStatus(results: readonly LineResult[], wave: Wave, lines: readonly PassLine[] = PASS_LINES): LineStatus {
  const mine = results.filter((r) => lines.find((l) => l.id === r.id)?.wave === wave)
  for (const s of ['fail', 'incomparable', 'incomplete', 'unruled', 'awaiting_flag_on'] as const) if (mine.some((r) => r.status === s)) return s
  return 'pass'
}

export function formatPassLines(results: readonly LineResult[], lines: readonly PassLine[] = PASS_LINES): string {
  const waves = [...new Set(lines.map((l) => l.wave))]
  const out = [
    '## Pass lines (fixed before any flag-on run; read at the go-live size, never in CI)',
    '',
    `By wave (a wave passes only when every line of it does): ${waves.map((w) => `${w} ${waveStatus(results, w, lines)}`).join(' · ')}`,
    '',
  ]
  for (const r of results) {
    const line = lines.find((l) => l.id === r.id)!
    out.push(`**${line.id}** (${line.wave}, first flag-on in ${line.firstFlagOnPr}): ${r.status}. ${line.measure}`)
    out.push(`Passes: ${line.direction === 'zero' ? 'exactly 0' : `${line.direction.replace('_', ' ')} ${line.value === null ? 'an unruled value' : line.value}`}${line.comparison === 'flag_on_vs_flag_off' ? ' relative to flag off' : ''}. Value: ${line.valueSource}`)
    for (const row of r.rows) out.push(`- \`${row.key}\`: flag off ${show(row.off)}${row.on !== undefined ? `, flag on ${show(row.on)}` : ''}`)
    out.push('')
  }
  return out.join('\n')
}
