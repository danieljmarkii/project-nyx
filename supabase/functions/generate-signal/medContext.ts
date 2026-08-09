// AI Signal — medication-on-board context payload (SR-4, B-721 §5.4).
//
// The PURE, offline-testable half of the Signal/Home uplift's one server payload
// addition (mirrors detection.ts / phrasing.ts — no remote/Deno imports). It owns the
// post-detection DECORATION of already-true findings with the SR-4 additive payload:
//   • medContext — "During an active {drug} course — {n} doses logged." on correlation +
//     timing cards, when a nameable drug had ≥1 administered dose in the context window.
//   • density   — attached elsewhere (computeReflectionDensity, detection.ts); decorateFinding
//     just carries it onto the reflection finding.
//
// It reads ONLY data the confounder pass already reads (medication regimens + dose events)
// and NEVER runs a detector, so it cannot change what fires or how it ranks — the §11 AC
// "no detection/ranking/threshold deltas". The medication line is CONTEXT stated as fact,
// never an explanation and never a verdict (§5.4); this module supplies the facts only —
// the client (SR-5) renders the §9 sentence.

import type { Finding, MedOnBoardContext, ReflectionDensity } from './detection.ts'

const MS_PER_DAY = 86_400_000

/**
 * The med-on-board context window (§5.4): a drug course is "active in the finding window"
 * when a nameable drug had ≥1 administered dose in the last MED_CONTEXT_WINDOW_DAYS. 60d
 * matches the timing detectors' own analysis window (⑤/⑥ `windowDays`) and bounds the
 * broader correlation lookback (180d) down to the recent, clinically-relevant "on a course
 * now" period the present-tense copy ("During an active … course") describes. ONE window
 * per regeneration, so every correlation/timing card agrees on the context it carries.
 */
export const MED_CONTEXT_WINDOW_DAYS = 60

/**
 * One administered, on-board, nameable dose reduced to what computeMedOnBoard needs. The
 * caller (index.ts) builds these from the SAME rows the confounder pass reads, having
 * already applied doseToMedicationWindow's administered filter (missed / refused / the
 * B-174 in-doubt combo dose all dropped) and resolveDrugLabel — so a fact here is exactly
 * a dose the engine also treats as on-board, never a non-administration counted as one.
 */
export interface MedDoseFact {
  /** ISO-8601 UTC administration time (the parent event's occurred_at). */
  occurredAt: string
  /** Owner-facing drug name (regimen drug_name preferred, else library brand/generic). Non-empty. */
  drugLabel: string
}

/**
 * Resolve a dose's owner-facing drug name. The regimen's `drug_name` (the owner's own
 * words for this pet's course, NOT NULL on the regimen — migration 020 keeps it even when
 * the library link is dropped) wins; else the library item's brand name, else its generic
 * name. Returns null when nothing names it (a bare ad-hoc dose linked to neither) — such a
 * dose cannot fill the "{drug}" slot, so it is excluded from the context, never rendered
 * as a blank or a guessed name.
 */
export function resolveDrugLabel(
  regimenDrugName: string | null | undefined,
  itemGenericName: string | null | undefined,
  itemBrandName: string | null | undefined,
): string | null {
  const regimen = regimenDrugName?.trim()
  if (regimen) return regimen
  const brand = itemBrandName?.trim()
  if (brand) return brand
  const generic = itemGenericName?.trim()
  if (generic) return generic
  return null
}

/**
 * SR-4 (§5.4) — compute the single medication-on-board context for a regeneration, over
 * `windowDays` ending at nowMs (inclusive of now; a dose can't be in the future). Groups
 * the administered nameable doses by drug — case-insensitively, so a regimen "Apoquel" and
 * a library "apoquel" fold onto one count instead of splitting — and returns the MOST-DOSED
 * drug's label + its in-window dose count, or null when no nameable drug had a dose
 * in-window. The singular "{drug}" (§5.4) is the most-dosed drug; ties break toward the
 * most-recently-dosed (the more "current" course). doseCount is always ≥1 when non-null, so
 * the client's "{n} doses logged" never reads "0 doses". PURE — no I/O, no detector.
 */
export function computeMedOnBoard(
  nowMs: number,
  facts: MedDoseFact[],
  windowDays: number = MED_CONTEXT_WINDOW_DAYS,
): MedOnBoardContext | null {
  if (!Number.isFinite(nowMs)) return null
  const windowStart = nowMs - windowDays * MS_PER_DAY
  // lowercased label -> the drug's running tally + display casing + most-recent dose instant.
  const byDrug = new Map<string, { display: string; count: number; lastMs: number }>()
  for (const f of facts) {
    const label = f.drugLabel?.trim()
    if (!label) continue // a fact with no name can't fill "{drug}" — never a blank line
    const ms = Date.parse(f.occurredAt)
    if (!Number.isFinite(ms) || ms < windowStart || ms > nowMs) continue
    const key = label.toLowerCase()
    const cur = byDrug.get(key)
    if (cur) {
      cur.count += 1
      // Display the most-recent casing — a purely cosmetic tie-break within one drug.
      if (ms > cur.lastMs) {
        cur.lastMs = ms
        cur.display = label
      }
    } else {
      byDrug.set(key, { display: label, count: 1, lastMs: ms })
    }
  }
  let best: { display: string; count: number; lastMs: number } | null = null
  for (const v of byDrug.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.lastMs > best.lastMs)) {
      best = v
    }
  }
  return best ? { drugLabel: best.display, doseCount: best.count } : null
}

/**
 * Attach the SR-4 additive payload to a detected finding, returning a NEW finding (never
 * mutating the detector's output). Reflection ← density (§3.3); correlation + timing ←
 * medContext (§5.4). Every other finding type is returned unchanged, and a null density /
 * medContext leaves the field absent — so the template and the client behave exactly as
 * they did before SR-4 (byte-identical). This is the ONLY place the additive fields are
 * written; detectors never set them.
 */
export function decorateFinding(
  finding: Finding,
  density: ReflectionDensity | null,
  medContext: MedOnBoardContext | null,
): Finding {
  if (finding.type === 'reflection') {
    return density ? { ...finding, density } : finding
  }
  if (
    finding.type === 'food_symptom_correlation' ||
    finding.type === 'postprandial_timing' ||
    finding.type === 'timeofday_clustering'
  ) {
    return medContext ? { ...finding, medContext } : finding
  }
  return finding
}
