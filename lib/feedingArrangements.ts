// Feeding arrangements — pet↔food standing-fact domain types (B-040 R1).
//
// A feeding_arrangement is a STANDING FACT ("{pet} always has access to
// {food}"), set once — not a per-nibble log. See
// docs/nyx-free-feeding-requirements.md §4 (schema) + §3 (the two
// confidence axes) for the model these types mirror.
//
// This module is types-only in PR 1 (schema slice). PR 2 adds the local
// SQLite + sync-queue + query logic alongside these definitions; the row
// shape here is the contract that food-detail capture, History rendering
// (PR 3), and engine ingestion (PR 4) all build against.
//
// Mirrors supabase/migrations/018_feeding_arrangements.sql. Hand-authored
// to match the repo's co-located-domain-type convention (cf. `Pet` in
// store/petStore.ts, the finding types in lib/signal.ts) — the project
// does not use a generated database.types.ts.

// `free_choice` is the R1 capture target (always-available / grazing).
// `meal_fed` is reserved so the vet report can render a complete
// feeding-method picture; R1 does not capture it via UX (§4 / §7).
export type FeedingMethod = 'free_choice' | 'meal_fed';

// One row of feeding_arrangements. Dates are ISO strings (DATE columns);
// timestamps are ISO strings (TIMESTAMPTZ, stored UTC, converted at the
// app layer per the Eng hard constraint).
export interface FeedingArrangement {
  id: string;
  pet_id: string;
  food_item_id: string;
  method: FeedingMethod;
  // Active window. active_until === null means CURRENTLY ACTIVE (the bowl
  // is still down). The window edges are the real lifecycle events
  // History renders as boundary markers.
  active_from: string | null;
  active_until: string | null;
  // Multi-pet shared-bowl hook. INERT in R1 — always false (the capture UX
  // never sets it true). Reserved so the multi-pet attribution sprint is
  // additive.
  is_shared: boolean;
  notes: string | null;
  // Soft delete only — a discontinued arrangement stays for historical
  // correlation context. null === active/not-deleted.
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Fields the client supplies when creating an arrangement. The server
// defaults id/method/is_shared/timestamps; PR 2's capture flow sets the
// rest. `method` defaults to 'free_choice' server-side but is accepted
// here for the vet-report-completeness path.
export interface NewFeedingArrangement {
  pet_id: string;
  food_item_id: string;
  method?: FeedingMethod;
  active_from?: string | null;
  active_until?: string | null;
  is_shared?: boolean;
  notes?: string | null;
}
