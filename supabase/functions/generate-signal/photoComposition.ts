// AI Signal — L3 photo-record composition (Signals v2 / B-755 / CUL-9, spec §2 L3).
//
// The PURE, offline-testable half of L3: the post-detection DECORATION of a vomit
// timing finding with photo-record composition EVIDENCE — retained food (long band),
// hair, and bile — each a count over its OWN "reads that answered this question"
// denominator, drawn from the `event_ai_analysis` rows the red-flag lane already reads.
//
// ── WHAT L3 IS, AND IS NOT ────────────────────────────────────────────────────
//
// L3 is EVIDENCE, not a finding type. It never fires, never ranks, never reads by a
// detector — it decorates an already-true timing finding, exactly as medContext.ts
// decorates one with the med-on-board line. So it lives here (pure) + is wired by
// `decorateFinding`, and the engine's fire/rank behaviour is provably unchanged (a
// diff-scoped test asserts detectors emit no `photoComposition`).
//
// The vet interprets: descriptors travel, the LABEL never does (§2 L3). There is
// deliberately no "empty stomach" / "bilious" / "regurgitation" verdict in this module —
// only counted, denominatored sightings the examining veterinarian reads.
//
// ── THREE DISCIPLINES, ENFORCED STRUCTURALLY ──────────────────────────────────
//
// 1. TRISTATE (§2 L3). Only a `yes` read enters a numerator. `unsure`/illegible/absent
//    reads are out of the numerator AND the denominator — the denominator is "reads that
//    answered THIS question", never the raw episode count and never the photographed
//    count that includes reads which couldn't resolve the marker. A legible `no` is in
//    the denominator only. numerator ⊆ denominator by construction (a `yes` is answered).
//
// 2. PRESENT-ONLY (G4). Every field is attached ONLY when its count ≥ 1. A zero is
//    SILENCE, never "0 of N". This is the structural never-reassure guarantee — most
//    pointedly for HAIR (Cannon: frequent hairballs are themselves a disease marker), but
//    applied to all three so no L3 field can ever read as an all-clear. The same shape
//    the vet report's PRESENT-only blood/foreign arrays and incident_red_flag already use.
//
// 3. SAFE-DIRECTION COLLAPSE. Near-duplicate re-logs of one bout must not inflate a
//    denominator (which would dilute a rate toward reassurance). Photographed vomit reads
//    are chained into episodes at the engine's own 3h gap (`episodeGapHours`, the shared
//    lib/mealTiming constant — G9), and a marker is PRESENT-WINS across an episode's
//    members: if any read in the bout saw hair, the episode saw hair; if any read answered,
//    the episode was answered. Present-wins keeps numerator ⊆ denominator and never drops
//    a real sighting under collapse.
//
// ── PURE AND DEPENDENCY-LIGHT ─────────────────────────────────────────────────
//
// Same rule as detection.ts / medContext.ts: plain data in, plain data out. The only
// imports are TYPES from detection.ts (the finding + the L3 payload shapes, defined there
// because the Finding types reference them) and the shared episode-gap constant from
// lib/mealTiming.ts (so "same bout" means the same thing here as in the timing engine).

import type {
  Finding,
  PhotoComposition,
  PhotoCompositionField,
} from './detection.ts'
import { DEFAULT_MEAL_TIMING_CONFIG } from '../../../lib/mealTiming.ts'

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/**
 * The `event_ai_analysis` projection L3 reads — one row per analyzed incident, mapped by the I/O
 * shell (index.ts) from the SAME query the red-flag lane uses, with `status` + `contents` +
 * `bile_present` added. Only `completed` vomit rows enter L3; the module filters, so the caller
 * passes the raw set (stool rows, pending/failed rows, everything) and this stays the one place the
 * completed/vomit gate lives.
 */
export interface PhotoAnalysisInput {
  /** occurred_at of the incident (from the joined events row), parsed to ms — the episode instant
   *  AND the retained-food join key (matched exactly to a finding's `longEpisodeOnsets`). */
  occurredMs: number
  /** event_ai_analysis.status. Only 'completed' reads answer anything (§2 L3); the rest are dropped. */
  status: string
  /** event_ai_analysis.incident_type. L3 composition is VOMIT-only (contents/bile_present are the
   *  vomit-shaped columns; stool has its own — migration 034). Non-'vomit' rows are dropped. */
  incidentType: string
  /** vomit_content[] — 'hair'/'undigested_food'/'partially_digested_food'/'bile'/'unsure'/… or null.
   *  analyze-vomit writes null (never []) when nothing legible was extracted, so null ⇒ illegible. */
  contents: string[] | null
  /** event_ai_analysis.bile_present tristate — 'yes'|'no'|'unsure'|null. The AUTHORITATIVE bile field
   *  (migration 013 keeps bile out of the bulk `contents` matrix so the two can't drift). */
  bilePresent: string | null
}

/** The composition of ONE collapsed photographed vomit episode — a present-wins fold over its member
 *  reads. `present ⟹ answered` for each marker (a yes is an answered read), preserved by folding both. */
interface EpisodeComposition {
  /** The onset (earliest) member's ms — carried only for readability; membership uses `memberMs`. */
  onsetMs: number
  /** Every member read's occurred ms — the retained-food long-band tag tests these against the onsets. */
  memberMs: number[]
  foodPresent: boolean
  foodAnswered: boolean
  hairPresent: boolean
  hairAnswered: boolean
  bilePresent: boolean
  bileAnswered: boolean
}

/** Per-read marker flags (before the present-wins episode fold). See the tristate discipline note. */
interface ReadFlags {
  foodPresent: boolean
  foodAnswered: boolean
  hairPresent: boolean
  hairAnswered: boolean
  bilePresent: boolean
  bileAnswered: boolean
}

/**
 * Reduce ONE completed vomit read to its per-marker present/answered flags.
 *
 * `contents` is "legible" when it is a non-empty array with NO `unsure` token — i.e. the model
 * resolved the contents, so an absence there is a real "no" (answered), not a shrug. A `yes` is
 * always answered (a sighting is an answer). Bile keys on its AUTHORITATIVE tristate: a `contents`
 * bile sighting counts present (present-wins), but only `bile_present` ∈ {yes,no} makes bile
 * "answered" — a null/`unsure` bile_present with legible non-bile contents is NOT credited as
 * "answered no bile", respecting the migration-013 authoritative-field design.
 */
function readFlags(a: PhotoAnalysisInput): ReadFlags {
  const contents = a.contents
  const contentsLegible =
    contents != null && contents.length > 0 && !contents.includes('unsure')

  const foodPresent =
    contents != null &&
    (contents.includes('undigested_food') || contents.includes('partially_digested_food'))
  const hairPresent = contents != null && contents.includes('hair')
  const bilePresent = a.bilePresent === 'yes' || (contents != null && contents.includes('bile'))

  return {
    foodPresent,
    foodAnswered: foodPresent || contentsLegible,
    hairPresent,
    hairAnswered: hairPresent || contentsLegible,
    bilePresent,
    // Bile "answered" only via the authoritative tristate (or a present sighting) — never inferred
    // from legible-non-bile contents, so the bulk matrix can't over-state what the bile field decided.
    bileAnswered: bilePresent || a.bilePresent === 'no',
  }
}

/**
 * Collapse completed vomit reads into 3h episodes (present-wins), oldest first. Chained exactly like
 * the engine's `collapseEpisodes` (a slow drip each ≤gap stays one episode; a new one starts only
 * >gap after its predecessor), but AGGREGATING member flags instead of keeping only the onset — so a
 * bout photographed twice counts once, and a marker seen in ANY member counts for the bout.
 */
function collapseComposition(reads: readonly PhotoAnalysisInput[]): EpisodeComposition[] {
  const gapMs = DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours * MS_PER_HOUR
  const sorted = [...reads].sort((a, b) => a.occurredMs - b.occurredMs)
  const episodes: EpisodeComposition[] = []
  let prev = -Infinity
  for (const r of sorted) {
    const flags = readFlags(r)
    if (r.occurredMs - prev > gapMs || episodes.length === 0) {
      episodes.push({
        onsetMs: r.occurredMs,
        memberMs: [r.occurredMs],
        ...flags,
      })
    } else {
      const cur = episodes[episodes.length - 1]
      cur.memberMs.push(r.occurredMs)
      cur.foodPresent ||= flags.foodPresent
      cur.foodAnswered ||= flags.foodAnswered
      cur.hairPresent ||= flags.hairPresent
      cur.hairAnswered ||= flags.hairAnswered
      cur.bilePresent ||= flags.bilePresent
      cur.bileAnswered ||= flags.bileAnswered
    }
    prev = r.occurredMs
  }
  return episodes
}

/** Build a present-only field from a numerator/denominator: emit ONLY when count ≥ 1 (G4), else
 *  undefined. numerator ⊆ denominator upstream guarantees `denominator ≥ count ≥ 1` when emitted. */
function field(count: number, denominator: number): PhotoCompositionField | undefined {
  return count >= 1 ? { count, denominator } : undefined
}

/**
 * Which timing findings L3 decorates, and how to read their window + long-band onsets. Returns null
 * for any non-timing finding (correlation, safety, reflection, …) — those carry no photo composition.
 * Only findings with a long band expose long onsets: ⑤ (postprandial_timing) and ⑥ (timeofday_
 * clustering) have none, so their `longOnsets` is empty and they never get `retainedFood` — they carry
 * hair/bile only. empty_stomach_timing and timing_story expose their long onsets for the retained-food join.
 */
function timingTarget(finding: Finding): { windowDays: number; longOnsets: number[] } | null {
  switch (finding.type) {
    case 'postprandial_timing':
      return { windowDays: finding.windowDays, longOnsets: [] }
    case 'timeofday_clustering':
      return { windowDays: finding.windowDays, longOnsets: [] }
    case 'empty_stomach_timing':
      return { windowDays: finding.windowDays, longOnsets: finding.longEpisodeOnsets ?? [] }
    case 'timing_story':
      return { windowDays: finding.windowDays, longOnsets: finding.long.longEpisodeOnsets ?? [] }
    default:
      return null
  }
}

/**
 * L3 (§2 L3) — compute the photo-record composition EVIDENCE for one vomit timing finding, or null
 * when it decorates nothing (a non-timing finding, or no marker seen ⇒ present-only ⇒ empty).
 *
 * Pipeline:
 *   1. Gate the finding — only ⑤ / L1 / timing_story carry composition (else null).
 *   2. Keep the COMPLETED VOMIT reads with a finite, non-future occurred ms; COLLAPSE them present-wins
 *      into 3h episodes; THEN window each episode by its onset to the finding's OWN windowDays. That is
 *      the engine's own order (collapseEpisodes over the full list, then the windowDays filter — see
 *      lib/mealTiming's PR-2 wiring note), so a bout straddling the window edge is decided ONCE by its
 *      onset, exactly as the timing detectors decide it, instead of being split at the boundary. The
 *      analyses query pulls a wider lookback (180d) than the timing window (60d); collapsing over that
 *      wider set only ever merges same-bout re-logs, never invents an episode.
 *   3. hair / bile — over EVERY windowed episode (general vomit composition on any timing card).
 *      retainedFood — over the LONG-band episodes only (any member ms ∈ the finding's long onsets).
 *   4. Present-only: attach a field only when its count ≥ 1. All three absent ⇒ null (byte-identical
 *      to the pre-L3 / no-photo / flag-off path).
 *
 * PURE — no I/O, no detector, no mutation of the finding.
 */
export function computePhotoComposition(
  finding: Finding,
  analyses: readonly PhotoAnalysisInput[],
  nowMs: number,
): PhotoComposition | null {
  const target = timingTarget(finding)
  if (!target) return null
  if (!Number.isFinite(nowMs)) return null

  const windowStart = nowMs - target.windowDays * MS_PER_DAY
  const vomitReads = analyses.filter(
    (a) =>
      a.status === 'completed' &&
      a.incidentType === 'vomit' &&
      Number.isFinite(a.occurredMs) &&
      a.occurredMs <= nowMs, // a future-dated read is garbage — never let it seed or join an episode
  )
  if (vomitReads.length === 0) return null

  // Collapse-then-window, matching the engine (see step 2): decide each bout's window membership by its
  // ONSET, so a boundary-straddling bout is counted the same way the timing detectors count it.
  const episodes = collapseComposition(vomitReads).filter((e) => e.onsetMs >= windowStart)
  if (episodes.length === 0) return null

  // Long-band episodes: any member read shares an onset ms with the finding's long-episode set. The
  // onset is the same event on both sides (events.occurred_at → both the timing onset and the read's
  // occurredMs), so the match is exact. A long bout whose ONSET event was photoless but a later member
  // was won't tag here (only the onset ms is in the set) — an under-count, the safe direction for
  // evidence (it can never manufacture retained food, only miss a rarer sighting).
  const longOnsetSet = new Set(target.longOnsets)
  const longEpisodes =
    longOnsetSet.size === 0
      ? []
      : episodes.filter((e) => e.memberMs.some((ms) => longOnsetSet.has(ms)))

  const retainedFood = field(
    longEpisodes.filter((e) => e.foodPresent).length,
    longEpisodes.filter((e) => e.foodAnswered).length,
  )
  const hair = field(
    episodes.filter((e) => e.hairPresent).length,
    episodes.filter((e) => e.hairAnswered).length,
  )
  const bile = field(
    episodes.filter((e) => e.bilePresent).length,
    episodes.filter((e) => e.bileAnswered).length,
  )

  if (!retainedFood && !hair && !bile) return null
  const out: PhotoComposition = {}
  if (retainedFood) out.retainedFood = retainedFood
  if (hair) out.hair = hair
  if (bile) out.bile = bile
  return out
}
