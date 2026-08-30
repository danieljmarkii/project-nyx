// The weight-history screen's view model (CUL-223) — pure, so the rules below can be
// tested without a renderer, and shared so the screen file stays a layout.
//
// ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
//
// Both weight cards ended in "Last weighed {date} · N readings" with nowhere to go.
// The copy names a list the owner could not open, so a reading typed as `124` instead
// of `12.4` was visible as a bent line and unreachable as a row. This is the
// destination: every reading, newest-first, each one a tap into the event it already
// is.
//
// ── THE REGISTER ────────────────────────────────────────────────────────────
//
// It inherits migration 024's guardrail, and inherits it MORE than the cards do,
// because a list invites comparison between neighbouring rows:
//
//   CLINICAL GUARDRAIL — a weight trend NEVER reassures. Weight LOSS is the danger
//   signal, and a rising or flat line is NOT wellness (rising can be fluid/edema).
//   So a row states a value and a date and stops. No per-row delta, no arrows, no
//   colour, no "steady" — nothing that scores one reading against the one above it.
//   The cards carry the one factual delta the product makes; a list of judgements
//   about individual weigh-ins is a different feature with a mandatory adversarial
//   pass, and it is not this one.

import { kgToLbs, type WeightReadingRow } from './weight';
import { describeOccurredAt } from './utils';

export const WEIGHT_HISTORY_TITLE = 'Weight readings';

// The read failed — said plainly, with the way to retry. NOT an empty state: an
// unanswered read is not an empty record (CUL-575), and "no readings" over a query
// that never came back is a false fact about the record.
export const WEIGHT_HISTORY_UNREADABLE = "I couldn't read the weight log just now.";

// No readings yet. Warm, forward-looking, and it never says anything is fine
// (Principle 5 + the guardrail) — it invites the first reading, nothing more.
export function noWeightReadingsLine(petName: string): string {
  return `No weigh-ins logged for ${petName} yet. Logging one now and then is the simplest way to keep an eye on weight over time.`;
}

// The subtitle: how many readings this list holds. A plain count of what is ON the
// screen — it is never a completeness claim about the pet's weight history, because
// the record only knows what was logged (CUL-62: a count is a fact about the list).
export function weightReadingsSubtitle(count: number): string {
  return count === 1 ? '1 reading' : `${count} readings`;
}

export interface WeightHistoryRow {
  /** The parent event — this row's tap target. */
  eventId: string;
  /** e.g. "12.4 lbs" — kgToLbs is the one rounding rule every weight surface uses. */
  value: string;
  /** e.g. "Jun 12 · 3:14 PM", or "Nov 23, 2025 · 8:02 AM" when the band is stamped. */
  when: string;
}

// Rows for the list, in the order given (the query returns newest-first).
//
// THE YEAR IS DECIDED ONCE FOR THE WHOLE LIST, not per row (CUL-69 rule 2). The
// cards' formatWeightDate stamps a year only on a date outside the current one, which
// is safe there because a card shows ONE date. A list is a band: the same rule applied
// per row renders "Nov 23, 2025" directly above "Jun 12", and a bare date following a
// year-stamped one inherits that year — so the newer reading reads as the older. So:
// if ANY reading falls outside the current year, EVERY row carries its year.
//
// The unbounded span is what forces this. The cards' date sits inside a 12-reading
// window; this screen holds every reading a pet has, which can run years.
export function buildWeightHistoryRows(
  readings: WeightReadingRow[],
  now: Date = new Date(),
): WeightHistoryRow[] {
  const thisYear = now.getFullYear();
  const stampYear = readings.some((r) => new Date(r.occurredAt).getFullYear() !== thisYear);

  return readings.map((r) => {
    const d = new Date(r.occurredAt);
    const date = d.toLocaleDateString([], stampYear
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' });
    // A weight check is witnessed by construction (you read the scale), so this is an
    // exact time in every real case. It still goes through the shared describeOccurredAt
    // rather than a local formatTime, so a legacy or hand-edited row that somehow
    // carries a window renders its honest "found by …" instead of a precision it
    // doesn't have — the same words History and the detail screen would use.
    const time = describeOccurredAt({
      confidence: r.confidence ?? null,
      occurredAt: r.occurredAt,
      earliest: r.earliest ?? null,
      latest: r.latest ?? null,
    }).primary;

    return {
      eventId: r.eventId,
      value: `${kgToLbs(r.weightKg)} lbs`,
      when: `${date} · ${time}`,
    };
  });
}

// The row's screen-reader label — the two visible lines rejoined into one
// announcement. The row is a touchable (so it is one accessibility node already);
// without a label its value and its date would be read as two unrelated fragments.
// It says exactly what is on screen plus where the tap goes, so Voice Control can be
// told to tap what the owner can see.
export function weightRowAccessibilityLabel(row: WeightHistoryRow): string {
  return `${row.value}, ${row.when}. Open this reading.`;
}
