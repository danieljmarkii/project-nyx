// The labeled stand-down (CUL-786 — Signal fold v1.1-a; spec docs/nyx-signal-fold-requirements.md
// §0 DF-9(a), §8 v1.1-a).
//
// WHAT THIS IS. When a chronicity course (detector ⑦) stops firing because its recency floor
// closed — `ongoingRecencyDays` (14; 28 for cough) with nothing logged — the card used to vanish
// wordlessly. Dr. Chen's phrase for that was "reassurance-by-absence wearing an honesty costume":
// a card that disappears is read as an all-clear by exactly the owner it was escalating to. This
// module mints ONE marker per stood-down course so the client can say, in the card's former slot,
// one calm line that is honest about what the silence does and does not mean.
//
// DR. CHEN'S FOUR CONDITIONS (binding, from the 2026-09-03 fold session):
//   1. *Logged*, not *happened* — the line says "No vomiting logged", never "no vomiting".
//   2. The ratified "That isn't an all-clear." clause, verbatim.
//   3. The ask SURVIVES as a conditional ("If you haven't been, the visit is still worth booking.").
//   4. Rendered ONLY when logging eligibility held across the gap — an owner who stopped logging
//      is not an owner whose pet stopped vomiting. Otherwise the marker is withheld and the
//      surface falls to the shipped E2 / coverage register, whose own copy says "isn't an
//      all-clear". This is why the stand-down is ENGINE work: the client cannot see coverage.
//
// WHY IT LIVES IN THE SHELL, NOT THE ENGINE. `generate-report` re-runs `detectSignals` itself and
// never reads the `ai_signals` cache, so a marker minted here — after detection, curation,
// phrasing and the summary packet — can never reach the vet report by construction (spec: "never
// on the report"). `standDown.test.ts` pins that `detectSignals` output never carries the type.
//
// WHY `detection.ts` IS NOT TOUCHED. The report inlines it, so any edit there drifts the report's
// held deploy ledger entry (CUL-19). "Stopped on recency, not on coverage" is therefore decided
// with the ONE existing predicate rather than a second copy of the floors: `detectChronicity` is
// run again under a COUNTERFACTUAL config whose recency gate is open (`ongoingRecencyDays:
// Infinity`, global and per-type). A course that fires under the counterfactual and not under the
// real config still clears every other floor — span, episodes, active weeks, and the span-halves
// logging guard — so the recency gate is the only thing that closed. A course whose episodes
// aged out of the window, or whose span went dark, fails BOTH runs and gets no marker: those are
// not stand-downs, they are the honest silence ⑦ already renders.
//
// WHAT A MARKER IS NOT. It is not a finding: `priorityClass: 'insight'` so it never leads,
// never raises the cross-pet banner, never counts as a safety finding, and the client renders it
// with no rail. It is not reassurance: the template is fixed, template-only (never the model),
// and screened by the same banned-vocabulary test the card faces pass. It is not permanent: it
// carries forward across regens for at most STOOD_DOWN_TTL_DAYS, and a re-fire of the same course
// (the finding back in the set) drops it — so the fold store's release-on-absence rule renders
// the returning course as a full card, never as a strip.

import {
  chronicityFloorsFor,
  detectChronicity,
  DEFAULT_CONFIG,
  type ChronicityTier,
  type DetectionConfig,
  type DetectionInput,
  type Finding,
  type SymptomChronicityFinding,
  type SymptomType,
} from './detection.ts'
import { SYMPTOM_LABEL, type CachedFinding } from './phrasing.ts'

const MS_PER_DAY = 86_400_000

/** How long a stand-down stays on the surface after it is minted (spec §8: "until the weekly
 *  review says it as a count or seven days pass" — the weekly review is F5, not yet built, so the
 *  seven days are the only bound). Also bounds how OLD a prior cache row may be to mint from:
 *  a card that vanished more than a week ago is not announced today. */
export const STOOD_DOWN_TTL_DAYS = 7

export interface StoodDownMarker {
  type: 'stood_down'
  /** Never 'safety': the marker must not lead, raise the banner, or count as a concern. */
  priorityClass: 'insight'
  symptomType: SymptomType
  /** The recency floor that fired, in days — the "in 14 days" of the line (28 for cough). */
  recencyDays: number
  /** The tier the card LAST carried; decides which conditional ask survives. */
  tier: ChronicityTier
  /** ISO-8601 UTC of the most recent logged episode of this symptom — the record's own anchor. */
  lastEpisodeIso: string
  /** ISO-8601 UTC of the regen that minted the marker; the TTL counts from here. */
  stoodDownAt: string
  /** The rank the chronicity card held in the prior payload — the "former slot". */
  formerRank: number
  associationalOnly: true
}

/** A cache entry carrying a marker instead of a finding. The `ai_signals.findings` array holds
 *  both shapes; the client renders a marker as one line and every other consumer skips it. */
export interface CachedStoodDown {
  rank: number
  text: string
  finding: StoodDownMarker
}

export type CachedEntry = CachedFinding | CachedStoodDown

/** A prior-payload entry as read back from the jsonb column — tolerant of rows written before
 *  this module existed (findings only) and of anything else in the array. */
export interface PriorEntry {
  rank: number
  finding: { type: string; [k: string]: unknown }
}

export function isStoodDownEntry(e: { finding: { type: string } }): e is CachedStoodDown {
  return e.finding.type === 'stood_down'
}

// ── The counterfactual config ─────────────────────────────────────────────────

/** The same floors with the recency gate held open everywhere it can be set — the global floor,
 *  every per-type override, and every per-type feline override — so `chronicityFloorsFor` resolves
 *  to an open gate for any (type, species) pair. Nothing else moves. */
export function withoutRecencyGate(config: DetectionConfig): DetectionConfig {
  const c = config.chronicity
  const perType = c.perType
    ? Object.fromEntries(
        Object.entries(c.perType).map(([type, over]) => [
          type,
          {
            ...over,
            ongoingRecencyDays: Number.POSITIVE_INFINITY,
            ...(over?.cat ? { cat: { ...over.cat, ongoingRecencyDays: Number.POSITIVE_INFINITY } } : {}),
          },
        ]),
      )
    : undefined
  return {
    ...config,
    chronicity: {
      ...c,
      ongoingRecencyDays: Number.POSITIVE_INFINITY,
      ...(perType ? { perType: perType as DetectionConfig['chronicity']['perType'] } : {}),
    },
  }
}

// ── Dr. Chen's 4th condition — logging held across the gap ────────────────────

/**
 * Did the owner keep using the app across `[lastEpisodeMs, nowMs]`? Judged by the SAME shape
 * ⑦ uses to decide a course was sustained rather than manufactured (computeChronicityStats's
 * span-halves guard): split the interval in half and require each half to carry at least
 * `reflection.minLoggingDaysPerWindow` distinct UTC days with ANY logged event — a symptom of
 * any fetched type or a meal. The same coarse "was the app used" floor, the same two halves, so a
 * gap that is dark at either end — the owner stopped logging, or only logged for the first few
 * days after the last episode — fails, and the marker is withheld.
 *
 * Full fetch coverage (any symptom type counts), like ⑦'s own guard: a cough log inside a
 * vomiting gap IS evidence the owner was engaged. And the failure direction here is
 * WITHHOLDING a sentence about absence, which is the safe direction for a rule about absence.
 */
export function gapLoggingHeld(
  input: DetectionInput,
  lastEpisodeMs: number,
  nowMs: number,
  floor: number,
): boolean {
  if (!(nowMs > lastEpisodeMs)) return false
  const eventMs = [
    ...input.symptomEvents.map((s) => Date.parse(s.occurredAt)),
    ...input.mealEvents.map((m) => Date.parse(m.occurredAt)),
  ].filter((ms) => Number.isFinite(ms))
  const daysIn = (start: number, end: number): number => {
    const days = new Set<number>()
    for (const ms of eventMs) {
      if (ms >= start && ms <= end) days.add(Math.floor(ms / MS_PER_DAY))
    }
    return days.size
  }
  const mid = (lastEpisodeMs + nowMs) / 2
  return daysIn(lastEpisodeMs, mid) >= floor && daysIn(mid, nowMs) >= floor
}

/** The most recent logged onset of `symptomType` strictly before `nowMs` — the record's own
 *  anchor for the marker. Null when the record holds none (the events were deleted since the
 *  card fired), in which case there is nothing honest to anchor a stand-down to. */
function lastEpisodeMsOf(input: DetectionInput, symptomType: SymptomType, nowMs: number): number | null {
  let last: number | null = null
  for (const s of input.symptomEvents) {
    if (s.type !== symptomType) continue
    const ms = Date.parse(s.occurredAt)
    if (!Number.isFinite(ms) || ms >= nowMs) continue
    if (last === null || ms > last) last = ms
  }
  return last
}

// ── The template (deterministic; never the model) ─────────────────────────────

/**
 * Dr. Chen's line, verbatim (CUL-786), with the ask surviving as a conditional in the register
 * the card last carried: a FIRM card asked for a booked visit, a STANDARD card for a word with
 * the vet. "Logged", never "happened"; "That isn't an all-clear." unchanged. Fixed copy — a voice
 * edit here is a spec change, pinned character-for-character by standDown.test.ts.
 */
export function templateStoodDown(marker: StoodDownMarker, petName: string): string {
  const symptom = SYMPTOM_LABEL[marker.symptomType] ?? String(marker.symptomType).replace(/_/g, ' ')
  const ask =
    marker.tier === 'firm'
      ? "If you haven't been, the visit is still worth booking."
      : "If you haven't yet, it's still worth a word with your vet."
  return (
    `No ${symptom} logged for ${petName} in ${marker.recencyDays} days — this card has stood down. ` +
    `That isn't an all-clear. ${ask}`
  )
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface ResolveStandDownsArgs {
  /** The prior cache row's `findings` array, as read back (tolerant shape). Empty when none. */
  prior: PriorEntry[]
  /** Epoch ms the prior row was generated, or null when unknown / no row. */
  priorGeneratedAtMs: number | null
  /** The CURATED findings of this regen (post-`curateFindings`, pre-marker). */
  current: Finding[]
  input: DetectionInput
  config?: DetectionConfig
  nowMs: number
}

/**
 * The markers this regen carries, in `formerRank` order. Two sources:
 *
 *  (1) MINT — a `symptom_chronicity` in the prior payload whose symptom has no chronicity finding
 *      in the current set, AND fires under the counterfactual (recency was the only floor that
 *      closed), AND the gap since its last episode was logged across (Dr. Chen's 4th condition),
 *      AND the prior row is recent enough to be the card's last emission (≤ STOOD_DOWN_TTL_DAYS).
 *      The tier is CARRIED from the last emission: the ask that was on the card is the ask that
 *      survives, never a re-resolved one over a window that has since slid.
 *
 *  (2) CARRY — a prior `stood_down` whose symptom still has no chronicity finding, re-emitted
 *      unchanged (same `stoodDownAt`, same `formerRank`) until its TTL elapses. Not re-gated on
 *      coverage: the line states a past event ("has stood down"), true regardless of what the
 *      owner logged since.
 *
 *  A RE-FIRE — the symptom's chronicity back in the current set — drops any marker for it, so the
 *  returning course renders as a full card (the fold store's release-on-absence rule has already
 *  deleted the folded entry). The counterfactual run is deferred until a candidate exists, so a
 *  regen with nothing to stand down costs no second detection pass.
 */
export function resolveStandDowns(args: ResolveStandDownsArgs): StoodDownMarker[] {
  const { prior, priorGeneratedAtMs, current, input, nowMs } = args
  const config = args.config ?? DEFAULT_CONFIG
  if (prior.length === 0) return []

  const currentChronic = new Set(
    current
      .filter((f): f is SymptomChronicityFinding => f.type === 'symptom_chronicity')
      .map((f) => f.symptomType),
  )

  const ttlMs = STOOD_DOWN_TTL_DAYS * MS_PER_DAY
  const priorFresh = priorGeneratedAtMs !== null && nowMs - priorGeneratedAtMs <= ttlMs

  const out: StoodDownMarker[] = []
  const seen = new Set<SymptomType>()
  let counterfactual: SymptomChronicityFinding[] | null = null

  for (const entry of prior) {
    const f = entry.finding
    if (f.type === 'stood_down') {
      const m = f as unknown as StoodDownMarker
      if (currentChronic.has(m.symptomType) || seen.has(m.symptomType)) continue
      const mintedMs = Date.parse(m.stoodDownAt)
      if (!Number.isFinite(mintedMs) || nowMs - mintedMs >= ttlMs) continue
      seen.add(m.symptomType)
      out.push({ ...m, formerRank: entry.rank })
      continue
    }
    if (f.type !== 'symptom_chronicity') continue
    const priorChronic = f as unknown as SymptomChronicityFinding
    const symptomType = priorChronic.symptomType
    if (currentChronic.has(symptomType) || seen.has(symptomType)) continue
    if (!priorFresh) continue

    // Only the recency gate may have closed: the course must still fire with that gate open.
    if (counterfactual === null) counterfactual = detectChronicity(input, withoutRecencyGate(config))
    if (!counterfactual.some((c) => c.symptomType === symptomType)) continue

    const lastEpisodeMs = lastEpisodeMsOf(input, symptomType, nowMs)
    if (lastEpisodeMs === null) continue
    if (!gapLoggingHeld(input, lastEpisodeMs, nowMs, config.reflection.minLoggingDaysPerWindow)) continue

    seen.add(symptomType)
    out.push({
      type: 'stood_down',
      priorityClass: 'insight',
      symptomType,
      recencyDays: chronicityFloorsFor(symptomType, input.pet.species, config.chronicity).ongoingRecencyDays,
      tier: priorChronic.tier === 'firm' ? 'firm' : 'standard',
      lastEpisodeIso: new Date(lastEpisodeMs).toISOString(),
      stoodDownAt: new Date(nowMs).toISOString(),
      formerRank: entry.rank,
      associationalOnly: true,
    })
  }
  return out.sort((a, b) => a.formerRank - b.formerRank)
}

/**
 * Place each marker in its former slot. The real findings keep their server order; a marker is
 * spliced in at `min(formerRank, length)` so the line occupies the card's old position and the
 * cards below it move down by one — the slot is the point. Ranks are re-numbered to the final
 * index, which is what the client sorts on. Pure; returns a new array.
 */
export function mergeStandDowns(
  findings: CachedFinding[],
  markers: StoodDownMarker[],
  petName: string,
): CachedEntry[] {
  const entries: CachedEntry[] = [...findings].sort((a, b) => a.rank - b.rank)
  for (const marker of [...markers].sort((a, b) => a.formerRank - b.formerRank)) {
    const at = Math.min(Math.max(0, marker.formerRank), entries.length)
    entries.splice(at, 0, { rank: at, text: templateStoodDown(marker, petName), finding: marker })
  }
  return entries.map((e, i) => ({ ...e, rank: i }))
}

/** Read the prior row's `findings` jsonb back into tolerant entries. Anything that is not an
 *  object with a string `finding.type` is dropped — a malformed row can only withhold a marker. */
export function readPriorEntries(raw: unknown): PriorEntry[] {
  if (!Array.isArray(raw)) return []
  const out: PriorEntry[] = []
  raw.forEach((e, i) => {
    if (!e || typeof e !== 'object') return
    const finding = (e as { finding?: unknown }).finding
    if (!finding || typeof finding !== 'object') return
    const type = (finding as { type?: unknown }).type
    if (typeof type !== 'string') return
    const rank = (e as { rank?: unknown }).rank
    out.push({ rank: typeof rank === 'number' && Number.isFinite(rank) ? rank : i, finding: finding as PriorEntry['finding'] })
  })
  return out
}
