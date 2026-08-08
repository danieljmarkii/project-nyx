// The Day Summary builder (B-661, notification-foundation PR 4 — see
// docs/nyx-notification-foundation-requirements.md §5).
//
// The 9pm daily summary's read surface answers exactly ONE question — "what
// happened in {pet}'s record today" — and every row is a doorway into that event's
// own detail (event/[id]). No AI, no verdicts, no score (§5.3). Dedicated
// trial/med context strips (§5.1/§5.3) are DEFERRED to a future consumer PR (B-670,
// ruled at mock round 2): v1 renders the trial-diet meal and each dose as ordinary
// doorway rows rather than re-hosting the trial card's viability states or the med
// strip's course state — that would make this a rival Home and render a reading on
// a surface G3 says must only describe-and-door.
//
// This module is the PURE builder, deliberately free of expo-sqlite / supabase /
// react-native imports — the same pure-core + I/O-shell split the trial card
// (`lib/dietTrialCard.ts`) and the med strip (`lib/medStrip.ts`) settled on. The
// judgement (which rows are "today", how a row reads, when a section is empty)
// lives here and is exercised in `daySummary.test.ts` against injected rows with
// no database; the read that assembles the input from the local mirror is the
// hook's job (`hooks/useDaySummary.ts`).
//
// ── RULES IT INHERITS BY NAME (never a re-derivation) ────────────────────────
//   • Day boundary = LOCAL midnight via B-421's one day counter (`localDayIndex` /
//     `localDayIndexOf` in `lib/utils.ts`). This module mints no new day-math.
//   • A row's DISPLAY is `describeDayEvent` (`lib/dayEvents.ts`) — the same mapper
//     the Calendar v3 day drill-in uses, so a food/dose/symptom reads identically
//     on both surfaces and every voice/safety rule that mapper enforces (a refusal
//     surfaced plainly, a null intake showing no assumed "given") is inherited
//     rather than re-spelled.
//   • Soft deletes are respected (`deleted_at IS NULL`) — filtered here as the
//     single enforcement point even though the loader also filters, so no caller
//     can forget it.
//
// ── THE ONE SAFETY RULE THIS FILE OWNS: the zero-log state (G2) ──────────────
// The empty state is a designed feature (Principle 5), but its copy is bound by
// the G2 lineage inherited from the diet-trial ruling: absence is framed as
// RECORD STATE, never a wellness verdict. Nothing here may read a silent record as
// reassurance — no "all quiet", no "all clear", no "nothing wrong". That is the
// n=1-never-reassures / intake-is-not-preference invariant applied to an empty
// day, and it is asserted by a test over the copy constants below.

import type { TimelineRow } from './db';
import { describeDayEvent, type DayEventDisplay } from './dayEvents';
import { localDayIndex, localDayIndexOf } from './utils';

export type PetSpecies = 'dog' | 'cat' | 'other';

// ── The doorway row ──────────────────────────────────────────────────────────

/** One logged event, as a tappable doorway row. Extends the shared
 *  `DayEventDisplay` (the drill-in's read shape) with the event `id` — the
 *  navigation target (`/event/[id]`). `describeDayEvent` omits the id because the
 *  read-only drill-in sheet never navigates per row; the Day Summary makes every
 *  row a door, so it is carried here. */
export interface DaySummaryRow extends DayEventDisplay {
  id: string;
}

// ── Per-pet section ──────────────────────────────────────────────────────────

export interface DaySummarySection {
  petId: string;
  petName: string;
  species: PetSpecies;
  /** Today's logged events, EARLIEST-FIRST (a day reads top-to-bottom, matching
   *  the drill-in) — the doorway rows. */
  rows: DaySummaryRow[];
  /** Nothing on the record for this pet today — the designed zero-log state
   *  (Principle 5; G2 — a record fact, never a wellness verdict). Kept as its own
   *  field, not `rows.length === 0` at the call site, so the one place that
   *  decides "empty" is here. */
  isZeroLog: boolean;
}

// ── Input / output ───────────────────────────────────────────────────────────

export interface DaySummaryPetInput {
  pet: { id: string; name: string; species: PetSpecies };
  /** This pet's candidate rows. A SUPERSET of "today" is fine — the builder clips
   *  to the local day itself (the loader over-fetches by design, exactly as
   *  `loadMedStripInput` does). Soft-deleted rows are dropped here regardless. */
  rows: TimelineRow[];
}

export interface DaySummaryInput {
  /** Pets in RENDER ORDER — the caller applies `orderPetsActiveFirst` (§5.3: one
   *  screen, sectioned per pet, active pet first). The builder preserves this
   *  order and never re-sorts pets: a summary that silently re-ordered its pets
   *  would be unreadable at a glance, the same reason the med strip fixes its
   *  order. */
  pets: DaySummaryPetInput[];
  /** The instant "today" is measured from, injected for testability (B-514). */
  nowMs: number;
  /** IANA zone to bucket the day in. OMIT on-device — the device's own zone IS the
   *  owner's midnight (B-421), which is the production path. It exists so tests can
   *  pin the day boundary explicitly rather than against the runner's clock. */
  timeZone?: string;
}

export interface DaySummaryModel {
  /** One section per input pet, in input order. */
  sections: DaySummarySection[];
  /** No pet has anything on the record today — the whole-screen zero-log state.
   *  `true` for an account with no pets at all, too (vacuously every section is
   *  empty), which the screen renders as the same designed state rather than a
   *  blank. */
  isEmpty: boolean;
  /** How many pets the summary covers. Drives whether a section carries a pet
   *  heading — a single-pet account needs none (the screen title already names
   *  the day, and there is no second pet to disambiguate from). */
  petCount: number;
}

/**
 * Fold each pet's rows into its section, clipped to the owner's local TODAY.
 * Pure and total: no I/O, no throw. An unparseable `occurred_at` is treated as
 * "not today" (dropped) rather than crashing the summary — `localDayIndexOf`
 * returns null for it and the strict `=== todayIndex` excludes it.
 */
export function buildDaySummary(input: DaySummaryInput): DaySummaryModel {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const sections = input.pets.map((p) => buildSection(p, todayIndex, input.timeZone));
  return {
    sections,
    isEmpty: sections.every((s) => s.isZeroLog),
    petCount: sections.length,
  };
}

function buildSection(
  input: DaySummaryPetInput,
  todayIndex: number,
  timeZone: string | undefined,
): DaySummarySection {
  const rows = input.rows
    // Scope to THIS pet as the single enforcement point. The loader fetches per
    // pet, so today this is redundant — but this is the first pure builder that
    // folds MULTIPLE pets into one model, and a future "one combined query, group
    // client-side by pet" refactor would cross-wire two pets' records invisibly
    // without it. Same defense-in-depth rationale as the soft-delete filter below:
    // no caller can forget it because the builder does not trust the grouping.
    .filter((r) => r.pet_id === input.pet.id)
    // Soft-delete is enforced HERE as the single point (AC: a removed event never
    // shows in the summary), even though the loader's query also filters it.
    .filter((r) => r.deleted_at == null)
    // Clip to the owner's local day. `localDayIndexOf` reads an ISO instant's local
    // calendar day; the `=== todayIndex` is the authority on "today", so the
    // loader's SQL bounds are only a prefetch and can never widen this.
    .filter((r) => localDayIndexOf(r.occurred_at, timeZone) === todayIndex)
    .map<DaySummaryRow>((r) => ({ ...describeDayEvent(r), id: r.id }))
    // Earliest-first (getTimeline returns newest-first). timeMs is the same
    // confidence-aware sort key `describeDayEvents` uses.
    .sort((a, b) => a.timeMs - b.timeMs);

  return {
    petId: input.pet.id,
    petName: input.pet.name,
    species: input.pet.species,
    rows,
    isZeroLog: rows.length === 0,
  };
}

// ── The local-day prefetch bounds (used by the loader hook) ──────────────────

/**
 * The `[after, before)` ISO instants of the owner's LOCAL day containing `nowMs`,
 * for the `getTimeline` prefetch (`occurred_at >= after AND occurred_at < before`).
 *
 * Built from LOCAL calendar components (`setHours(0,0,0,0)` then `+1` day) so it is
 * DST-correct — a local day that is 23h or 25h still advances the date by exactly
 * one — and so it partitions instants the SAME way `localDayIndex` does on-device
 * (both key on the device's local midnight). That alignment is why the builder's
 * `=== todayIndex` clip and this bound never disagree in production. The pure
 * builder re-clips regardless, so this is a read optimisation, never the authority.
 *
 * Device-zone only (no `timeZone` arg): it is called solely from the on-device
 * hook, where the device zone is the owner's midnight. Tests pin it by building the
 * expected instants from local components (the B-514 idiom), never a UTC literal.
 */
export function localDayBoundsIso(nowMs: number): { after: string; before: string } {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { after: start.toISOString(), before: end.toISOString() };
}

// ── Zero-log copy (Principle 5 + G2 — owned here, asserted by the test) ──────
//
// nyx-voice + clinical-guardrails both gate these at the copy pass (PR 5); this is
// the build-time, safe default. Direction from §5.3: name what the record is
// MISSING and offer the door. Never a wellness verdict on the absence.

export const DAY_SUMMARY_ZERO_LOG = {
  /** The whole-screen (and single-pet) empty state title. A record fact. */
  title: 'Nothing in the record today',
  /** Forward-looking, offering the door (Principle 5) without asserting anything
   *  about the pet. Ten seconds is the app's own logging promise, not a nudge. */
  body: 'If something happened, it takes about ten seconds to add.',
  /** The zero-log CTA label (mock round 2). This screen has no FAB, so the body's
   *  "…to add" invitation needs a door; the screen wires it to the quick-log. Uses
   *  the app's own verb ("log"), matching TodayZone's empty nudge. An invitation,
   *  never a verdict on the absence (G2) — it opens a door, it does not say a log
   *  was owed. */
  cta: 'Log an event',
} as const;

/** A single pet's zero-log line on a MULTI-pet summary (one pet logged today,
 *  another did not). Same G2 register as the full state — a record fact about
 *  {name}'s day, never an all-clear over the pet. */
export function petZeroLogLine(petName: string): string {
  return `Nothing in ${petName}’s record today.`;
}

/** The whole-screen zero-log TITLE. Names the pet on a single-pet account
 *  (nyx-voice Pattern 1 — the pet's name is what creates the stakes, and the
 *  9pm zero-log day is the wedge owner's commonest empty state) and stays neutral
 *  when there is no single pet to name: an account with no pets, or a multi-pet
 *  account where the whole-screen state cannot pick one. No trailing period — it
 *  is a title, not the inline `petZeroLogLine` sentence. Same G2 register either
 *  way: a record fact, never a wellness verdict. */
export function daySummaryEmptyTitle(petName?: string | null): string {
  return petName ? `Nothing in ${petName}’s record today` : DAY_SUMMARY_ZERO_LOG.title;
}
