// Start-a-trial capture — B-417 PR 3 (spec §4.1, mock screens A–D).
//
// This is the FIRST WRITE PATH `diet_trials` has ever had. The table shipped in
// migration 001, seven surfaces read it, and production holds zero rows — so the
// wedge ("reactive tracking for owners sent home with a diet trial") has never
// been reachable and the vet report's own first question has never rendered with
// real data. PR 1 gave the schema its shape, PR 2 gave it a local mirror; this
// module is what finally puts a row in it.
//
// SPLIT, deliberately: everything above the "Local writes" divider is PURE — the
// duration lookup, the end-date arithmetic, the payload builder and every LOCKED
// string. That half carries the decisions worth testing and worth arguing with,
// and it is exercised in plain jest with no expo-sqlite in sight. The db half
// below is thin by construction.
//
// LOCAL-FIRST, NOT A DIRECT SUPABASE INSERT. `AddMedicationModal` is the location
// precedent (§D5) and writes straight to PostgREST; this does not, and the
// difference is not stylistic. PR 2 built the mirror, the push queue and the
// terminal-error branch, and its own acceptance criterion is "a trial created
// offline survives reconnect + flush" — which is unreachable unless the create
// path writes locally with `synced = 0`. An owner in a clinic car park with one
// bar of signal is the literal target user of this screen.
//
// It also honours the contract lib/dietTrialMirror.ts states for exactly this PR:
// every local mutation sets `synced = 0, sync_attempts = 0, sync_error = NULL` in the same statement,
// so an owner-visible fix (ending the other trial) re-arms a quarantined push
// rather than leaving a permanently-parked row.
import { getDb } from './db';
import { canonicalizeProtein } from './protein';
import type { TrialFoodRole } from './dietTrial';
import { trialStopReasons, type TrialOutcome } from './dietTrialCompletion';
import { syncPendingDietTrials, syncPendingDietTrialFoods } from './sync';
import { useSyncStore } from '../store/syncStore';
import { uuid, toLocalDayKey, dayKeyToLocalDate } from './utils';
import { getDietTrialProgress } from './analytics';

/** Every trial write below ends with this — B-534's Home-strip half.
 *
 *  The Pet-tab card and the Home strip are two independent `useDietTrial`
 *  instances, and only the Pet tab's gets the host's `reload()` after a write —
 *  so ending, extending or starting a trial left Home rendering the OLD trial
 *  until the next sync cycle happened to bump the tick. The hook already
 *  re-reads on `hydrationTick` (it is how another device's meals reach the
 *  card), so the fix is to make a LOCAL trial write count as a hydration too.
 *  It lives here, in the write path, rather than at the call sites: the next
 *  surface to call one of these functions will not know the Home strip exists. */
function notifyTrialChanged(): void {
  try {
    useSyncStore.getState().bumpHydrationTick();
  } catch (e) {
    // The write itself succeeded; a refresh-signal failure must not fail it.
    console.warn('[dietTrialSetup] hydration tick failed:', e);
  }
}

// ── Indication (§4.1) ───────────────────────────────────────────────────────
//
// A closed set with a closed mapping, which is why migration 040 stores it as an
// ENUM rather than free text: the value drives the duration default, reaches a
// clinician verbatim on §7 and crosses the LLM boundary in Ask.
//
// The LABELS are owner-facing and the VALUES are clinical — two different objects
// on purpose. "Stomach & gut" is what Jordan understands; `gi` is what Dr. Chen
// reads on the report. Never collapse them.
export type TrialIndication = 'skin' | 'gi' | 'other';

export const INDICATION_OPTIONS: { value: TrialIndication; label: string }[] = [
  { value: 'skin', label: 'Skin' },
  { value: 'gi', label: 'Stomach & gut' },
  { value: 'other', label: 'Something else' },
];

// ── The duration table — PROVISIONAL, P-1 (§0.4) ─────────────────────────────
//
// ⚠️ PENDING DR. CHEN'S RATIFICATION. A lookup constant, no schema, no migration:
// ratification changes four numbers in this object and nothing else. Flagged at
// this PR because this PR is the one that consumes it.
//
// Keyed on species × indication (G3, ruled 2026-07-25). The evidence behind each:
//   • skin 56d IS the >90% diagnostic-sensitivity band (Olivry/Mueller/Prélaud,
//     209 dogs + 40 cats), NOT "the low end" of a range.
//   • dog·gi 28d — ACVIM 2026 CIE consensus: ≥2 weeks exclusive feeding for a
//     complete trial, response typically 10–14 days.
//   • cat·gi 42d is the one NEW number, raised from the dog's 28 because cats
//     reach only ~50% remission at 4 weeks against dogs >90% at 5.
//
// TWO GAPS THE RULING DID NOT COVER, both resolved toward the LONGER window, and
// the asymmetry is deliberate rather than tidy. A too-long default costs the
// owner weeks of a restrictive diet and is editable in "More options"; a too-short
// default produces a day-N milestone that reads as PERMISSION TO STOP a diet the
// vet wanted continued — which §4.3 names as the live clinical harm on the GI
// default specifically (ACVIM: continue ≥12 weeks before transitioning away).
// So:
//   • `other` has no ruled cell → takes the skin (longer) value.
//   • an unknown/'other' species → takes the LONGER of the two species' cells.
const DURATION_DEFAULT_DAYS: Record<'dog' | 'cat', Record<TrialIndication, number>> = {
  dog: { skin: 56, gi: 28, other: 56 },
  cat: { skin: 56, gi: 42, other: 56 },
};

export function defaultDurationDays(
  species: string | null | undefined,
  indication: TrialIndication,
): number {
  if (species === 'dog' || species === 'cat') return DURATION_DEFAULT_DAYS[species][indication];
  return Math.max(DURATION_DEFAULT_DAYS.dog[indication], DURATION_DEFAULT_DAYS.cat[indication]);
}

// ── Allowed-set roles (§3.2) ────────────────────────────────────────────────
//
// The trial diet writes N rows at `primary_diet`; "Also allowed" writes the
// permitted extras. `supplement` exists in the enum and is deliberately NOT
// capturable in v1: it is not inferable from anything the library holds, and
// asking for it would add a per-food decision to a screen whose whole acceptance
// criterion is fifteen seconds.
// B-556: ALIASED, not re-declared. This was a second structural copy of the
// union — identical today, and structurally compatible, so nothing broke; but a
// member added to the schema enum would have landed in one copy and not the
// other, which is the same shape of drift B-556 fixed on the READ side.
export type { TrialFoodRole } from './dietTrial';

// Role of a permitted extra, INFERRED from a fact the library already carries
// rather than asked for. `food_type = 'treat'` → permitted_treat, everything else
// → permitted_other. The inference is shown back to the owner as the row's
// sub-label, so it is visible rather than silent — and both values behave
// identically in §5.3's rung 1 (the role is provenance for the vet report, not a
// permit rule), so a wrong guess costs a word on the report and nothing else.
export function permittedRoleForFood(foodType: string | null | undefined): TrialFoodRole {
  return foodType === 'treat' ? 'permitted_treat' : 'permitted_other';
}

export function permittedRoleLabel(role: TrialFoodRole): string {
  return role === 'permitted_treat' ? 'Permitted treat' : 'Also allowed';
}

// ── Food labels ─────────────────────────────────────────────────────────────
//
// `diet_trial_foods.food_label` is NOT NULL and its whole job is to SURVIVE the
// food's deletion — the row FKs `ON DELETE CASCADE`, and §3.2's own correction is
// that a label which dies with the food is dead by construction. So it is
// denormalized at write time from whatever the library held then, and never
// re-derived.
export function foodLabel(food: { brand: string; product_name: string }): string {
  return `${food.brand} ${food.product_name}`.trim();
}

// ── End date (§4.1: render the resulting END DATE, not just a day count) ─────
//
// Day 1 IS the start day (getDietTrialProgress: `todayIndex - startIndex + 1`), so
// a 56-day trial started on 3 July ends on 27 August — start + 55, not start + 56.
// The mock's two worked examples both encode the inclusive form; an off-by-one
// here is an off-by-one on the milestone that decides whether an owner stops a
// diet, so it is pinned by test rather than by reading.
export function trialEndDayKey(startDayKey: string, targetDays: number): string | null {
  const start = dayKeyToLocalDate(startDayKey);
  if (!start || !Number.isFinite(targetDays) || targetDays < 1) return null;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(targetDays) - 1);
  return toLocalDayKey(end);
}

// "27 August" — and "27 August 2027" when the trial runs past new year, because a
// bare "27 August" on a 12-week trial started in November is genuinely ambiguous.
export function formatTrialEndDate(dayKey: string, now: Date = new Date()): string | null {
  const d = dayKeyToLocalDate(dayKey);
  if (!d) return null;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The duration/end-date helper — the whole reason the indication can SET AND
 *  SHOW the duration without becoming a third field. It renders BELOW the
 *  start-date field it describes (B-565): the sentence names the end date the
 *  start date determines, so a back-date must change a line the owner can see,
 *  not one scrolled off the top under the indication chips. It names the end DATE
 *  rather than a day count: "56 days" is not something an owner can plan around,
 *  and the date is what they will put in their calendar. */
export function durationHelperLine(
  indication: TrialIndication,
  targetDays: number,
  startDayKey: string,
  endDayKey: string | null,
  now: Date = new Date(),
): string {
  const weeks = Math.round(targetDays / 7);
  const lead =
    indication === 'skin'
      ? `Most skin trials run ${weeks} weeks.`
      : indication === 'gi'
        ? `Most stomach trials run ${weeks} weeks.`
        : `This one is set to ${weeks} weeks.`;
  const end = endDayKey ? formatTrialEndDate(endDayKey, now) : null;
  if (!end) return lead;
  // The start date sits on the primary screen (R3), so the sentence has to stay
  // true after a back-date — "Starting today" over a trial dated to 1 June is a
  // small lie on the one field whose semantic is already the subtle one.
  if (startDayKey === toLocalDayKey(now)) return `${lead} Starting today, that ends ${end}.`;
  const start = formatTrialEndDate(startDayKey, now);
  return `${lead} From ${start}, that ends ${end}.`;
}

// ── LOCKED copy (§4.1, §5.2 — reproduced verbatim) ──────────────────────────
//
// Every string below is LOCKED in the requirements and says "Culprit" (B-274 is
// shipped in owner-facing copy — `app/settings.tsx`, `app/onboarding/disclaimer.tsx`
// and the Landing hero all read Culprit today, so the mock's brand-collision flag
// is discharged). Do not paraphrase these; if one is wrong, it is wrong in the
// spec first.

// C6 (PM, 2026-07-25) — name the itemisation, AT THE CONFIRM ACTION. This is the
// one place the app tells an owner it is about to keep a dated record of their own
// conduct, rendered to the person who prescribed the diet: Culprit's first record
// that judges a PERSON rather than describing a pet. It renders ABOVE the button,
// BEFORE the commit — "they consented by tapping Start" is not consent to a
// disclosure never shown to them. No legal register, no checkbox.
export const TRIAL_RECORD_DISCLOSURE =
  'While the trial runs, Culprit records which feedings matched the trial diet and ' +
  'which didn’t, with dates. That’s the part your vet needs.';

/** The two LOCKED teaching lines shown once, after creation (mock screen C). */
export function trialSetupLines(petName: string): [string, string] {
  return [
    // Undisclosed feeding by other people is tip #1 of 7 in the diet
    // manufacturer's own owner handout, and a channel Culprit is structurally
    // blind to. Zero engineering; it is the highest-yield line on the screen.
    `Everyone who feeds ${petName} needs to know about the trial — Culprit can only ` +
      'count what gets logged here.',
    // A-4 (ruled in). Every clinical source instructs a pre-trial SUBSTITUTION, not
    // vigilance — this line acts on day 0 where §5.3's rung-4 detector fires on
    // day 14.
    `Ask your vet about anything else that goes in ${petName}’s mouth — flavoured ` +
      'chewables (heartworm, flea, joint supplements) and flavoured toothpaste are ' +
      'the most commonly missed.',
  ];
}

/** Provenance-locked helper for "Also allowed" (§4.1). NEVER "treats you'll still
 *  give" — that phrasing turns the field into a self-granted loophole that
 *  silently zeroes the exposure count. */
export const ALLOWED_SET_HELPER = 'Anything your vet said is OK.';

/** The start-date field's label. Deliberately terse (B-565) — six wide-tracked
 *  micro-caps beside two-word siblings was a parse, not a scan; `startDateHelper`
 *  below the field does the teaching. The default VALUE is today; the SEMANTIC is
 *  the first day of exclusive feeding (CAVD: start the countdown on the first day
 *  you feed only the elimination diet), which the helper spells out. */
export const START_DATE_LABEL = 'First day';

export function startDateHelper(petName: string): string {
  return (
    `Day 1 is the first day ${petName} eats only the trial diet. If you mixed the old ` +
    'food in for a week to switch over, that week isn’t day 1.'
  );
}

export const TRIAL_DIET_HELPER =
  'More than one is normal — a wet and a dry of the same diet, or two forms your vet ' +
  'named together.';

// B-565: no longer ASSERTS "{pet}'s vet has put {pet} on an elimination diet" —
// which may be false, and which named the pet three times in two sentences. It
// leads with the instruction and closes on state 0's own payoff line (kept
// verbatim, so the inviting card and the sheet it opens do not drift). That line
// presumes only the recheck the whole feature is built around, not a specific
// past directive — the same conditional posture `noTrialCard` already takes.
export function startSheetIntro(petName: string): string {
  return (
    `Tell Culprit what ${petName} is eating and what it’s for. It keeps the dated ` +
    'record your vet will ask for at the recheck.'
  );
}

// ── The write payload (pure) ────────────────────────────────────────────────

export interface TrialFoodSelection {
  id: string;
  brand: string;
  product_name: string;
  food_type: string | null;
}

export interface StartTrialInput {
  petId: string;
  /** ≥1. Order matters: the FIRST is written to the legacy `food_item_id`. */
  primaryFoods: TrialFoodSelection[];
  permittedFoods: TrialFoodSelection[];
  indication: TrialIndication;
  targetDurationDays: number;
  /** 'YYYY-MM-DD' local day key. */
  startedAt: string;
  vetName: string | null;
  /** The owner-confirmed trial protein, or null (B-704 §5/§7.1). Null covers all
   *  three of: the untouched golden path (derivation stands, read re-derives), the
   *  "No single protein (hydrolyzed)" escape, and "Not sure — leave it unset". A
   *  non-null value is the owner's canonical protein key (`trialProteinToStore`).
   *  NEVER A PERMIT (TG-1): it only names; `startDietTrial` writes it beside the
   *  allowed set, which stays the sole off-diet authority. */
  targetProtein: string | null;
}

export interface NewTrialRows {
  trial: {
    id: string;
    pet_id: string;
    food_item_id: string;
    started_at: string;
    target_duration_days: number;
    status: 'active';
    food_label: string;
    indication: TrialIndication;
    phase: 'elimination';
    vet_name: string | null;
    /** §4.1 / mock's open flag — see the comment on the builder. */
    transition_started_at: null;
    /** B-704 §5 — the owner-confirmed protein (canonical key) or null; and the
     *  instant it was set, null whenever the protein is null (the disclosure hook
     *  TP-3's mid-trial edit reads, and PR 5's "protein confirmed day N" line). */
    target_protein: string | null;
    target_protein_set_at: string | null;
    created_at: string;
    updated_at: string;
  };
  foods: {
    id: string;
    diet_trial_id: string;
    pet_id: string;
    food_item_id: string;
    role: TrialFoodRole;
    food_label: string;
    allowed_from: string;
    created_at: string;
    updated_at: string;
  }[];
}

export type NewTrialFoodRow = NewTrialRows['foods'][number];

/**
 * ONE `diet_trial_foods` row — the shape both write paths produce.
 *
 * Extracted at B-616 PR 1 rather than copied into `addTrialFood`, because the
 * mid-trial add and the start modal write the same row for a vet, and a second
 * builder is a second answer to "what does a permitted extra look like". The
 * fields that would drift are the ones that matter most: `food_label` (which has
 * to be denormalized at write time, because the row outlives the food) and
 * `role` (which decides whether a food can widen the sanctioned comparator).
 *
 * Everything varying between the two paths is a PARAMETER — the id, the role and
 * `allowed_from` — so the difference between "on the list from day 1" and "added
 * today" is one argument rather than one duplicated function.
 */
export function buildTrialFoodRow(args: {
  id: string;
  trialId: string;
  petId: string;
  food: TrialFoodSelection;
  role: TrialFoodRole;
  /** 'YYYY-MM-DD' local day key. */
  allowedFrom: string;
  /** ISO instant for `created_at`/`updated_at`. */
  now: string;
}): NewTrialFoodRow {
  return {
    id: args.id,
    diet_trial_id: args.trialId,
    pet_id: args.petId,
    food_item_id: args.food.id,
    role: args.role,
    food_label: foodLabel(args.food),
    allowed_from: args.allowedFrom,
    created_at: args.now,
    updated_at: args.now,
  };
}

/** ≥1 trial food and an indication. Everything else has a default or is optional
 *  — the field test is "what can an owner answer standing in a clinic car park
 *  holding a bag of food". */
export function canStartTrial(input: {
  primaryFoods: readonly unknown[];
  indication: TrialIndication | null;
}): boolean {
  return input.primaryFoods.length > 0 && input.indication != null;
}

/**
 * Form values → the exact local rows. Pure; ids and `now` are injected so the
 * whole shape is assertable.
 *
 * TWO THINGS THIS ENCODES THAT ARE EASY TO GET WRONG:
 *
 * 1. `diet_trials.food_item_id` IS DISPLAY-ONLY LEGACY (§4.1). It gets the
 *    FIRST-picked primary food purely so the seven shipped readers keep rendering
 *    a name. NO COMPUTATION MAY READ IT — every membership and protein decision
 *    reads `diet_trial_foods`. `lib/trialContaminant.ts` used to derive the trial
 *    diet from this column, which was correct for a one-food trial and WRONG the
 *    moment a second row existed: it computed the sanctioned set from one food and
 *    flagged a legitimately-allowed second trial food as a contaminant. PR 3 paid
 *    for the condition it created with a stopgap (go silent unless the
 *    `primary_diet` count is exactly 1); PR 5 re-based the module onto
 *    `diet_trial_foods` (§0.2 forward-conflict 2) and deleted the stopgap, so a
 *    multi-food trial is now handled rather than muted (B-453).
 *
 * 2. `transition_started_at` IS LEFT NULL IN V1 — a decision, not an omission.
 *    The mock flags it open ("PR 3 should say whether it is written from this
 *    screen or left null"). The design-locked sheet has no capture affordance for
 *    it, and inventing one adds a second date question to the screen whose entire
 *    acceptance criterion is fifteen seconds. The semantic it protects is already
 *    carried, in plain language, by the start-date helper: back-dating to the
 *    first exclusive day is what excludes the transition week, and back-dating is
 *    supported. The column stays available for a later capture surface.
 */
export function buildTrialRows(
  input: StartTrialInput,
  now: string,
  newId: () => string = uuid,
): NewTrialRows {
  const trialId = newId();
  const first = input.primaryFoods[0];
  // Canonical key or null (TG-4). The picker only ever offers canonical keys, but
  // canonicalizing here means the invariant holds whatever the caller passes.
  const targetProtein = canonicalizeProtein(input.targetProtein);

  const foods: NewTrialRows['foods'] = [
    ...input.primaryFoods.map((f) => ({ food: f, role: 'primary_diet' as TrialFoodRole })),
    ...input.permittedFoods.map((f) => ({
      food: f,
      role: permittedRoleForFood(f.food_type),
    })),
  ].map(({ food, role }) =>
    buildTrialFoodRow({
      id: newId(),
      trialId,
      petId: input.petId,
      food,
      role,
      // Membership is DATED (§3.2). At CREATION it opens on the trial's own start
      // day rather than today, so a back-dated trial does not render its own
      // prescribed diet as un-permitted for the days before the owner got around
      // to telling us. A MID-TRIAL add is the other case and passes today — see
      // `addTrialFood`.
      allowedFrom: input.startedAt,
      now,
    }),
  );

  return {
    trial: {
      id: trialId,
      pet_id: input.petId,
      food_item_id: first.id,
      started_at: input.startedAt,
      target_duration_days: input.targetDurationDays,
      status: 'active',
      // Denormalized display fallback (§3.1): `food_item_id` is ON DELETE SET NULL,
      // so archiving the trial food would otherwise blank the trial's identity on
      // the card AND the vet report.
      food_label: foodLabel(first),
      indication: input.indication,
      phase: 'elimination',
      vet_name: input.vetName?.trim() || null,
      transition_started_at: null,
      // Canonicalized at the write boundary (TG-4): the picker already offers only
      // canonical keys, so this is a convergent no-op, but it makes "a raw label
      // never lands in the column" a property of the write path, not of the caller.
      // set_at is written ONLY alongside a non-null protein (§5): a null protein is
      // never dated, so the report's "confirmed day N" disclosure can trust it.
      target_protein: targetProtein,
      target_protein_set_at: targetProtein != null ? now : null,
      created_at: now,
      updated_at: now,
    },
    foods,
  };
}

// ── Ending the running trial, so the next one can start (mock screen D) ──────

export interface ActiveTrialSummary {
  id: string;
  startedAt: string;
  targetDurationDays: number;
  foodLabel: string | null;
}

export interface StopReasonOption {
  value: string;
  label: string;
}

/**
 * The options on the "already has a trial running" sheet — DAY-DEPENDENT, which
 * is the whole point of the mock's annotation. At day 23 of 56 a trial cannot have
 * "run its course", so offering that option would write `completed` over an
 * abandoned trial and destroy the `stopped_reason` a vet prescribes differently
 * from ("stopped at day 19 — wouldn't eat it" vs "stopped — cost").
 *
 * `refused` is a load-bearing value, not a label: §4.3 requires a refusal reason to
 * route to the intake-decline HEALTH lane and never to render as a compliance
 * outcome. PR 6 and PR 7 both key off it, so the token is fixed here.
 *
 * THE REASON SET IS NOW OWNED BY `dietTrialCompletion.trialStopReasons` (PR 6),
 * and this delegates to it rather than keeping its own three. Two lists would be
 * two vocabularies in one TEXT column that a clinician reads verbatim — an owner
 * who ended a trial from this sheet and one who ended it from the milestone would
 * be describing the same event in different words on the same report. PR 3 shipped
 * the narrow three because §4.3's six had not been built yet; the tokens it wrote
 * (`vet_advised` / `refused` / `other`) are all still in the set, so nothing
 * already stored is orphaned.
 */
export function stopReasonOptions(
  petName: string,
  complete: boolean,
  pronouns?: { object: string; possessive: string },
): StopReasonOption[] {
  const early = trialStopReasons(petName, pronouns);
  if (!complete) return early;
  return [{ value: 'completed', label: 'It ran its course' }, ...early];
}

/** "Day 23 of 56" for the sheet, plus whether the trial has reached its target.
 *  Day math goes through the ONE shared helper (B-421) — never re-derived. */
export function describeActiveTrial(
  trial: ActiveTrialSummary,
  nowMs: number = Date.now(),
): { dayLine: string | null; complete: boolean } {
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    nowMs,
  );
  if (!progress) return { dayLine: null, complete: false };
  return {
    dayLine: `Day ${progress.dayCounter} of ${progress.targetDays}`,
    complete: progress.complete,
  };
}

export function secondTrialIntro(petName: string, trial: ActiveTrialSummary, nowMs?: number): string {
  const { dayLine } = describeActiveTrial(trial, nowMs);
  const food = trial.foodLabel ?? 'The current trial diet';
  const day = dayLine ? `, ${dayLine.toLowerCase()}` : '';
  return (
    `${food}${day}. A pet can only be on one trial at a time, so this one needs an ` +
    'ending before the next one starts.'
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Local writes
// ════════════════════════════════════════════════════════════════════════════

// The active trial for one pet, read from the MIRROR (never the network) so the
// pre-flight below works in a clinic car park.
//
// `ORDER BY synced DESC` is the same conflict rule ACTIVE_DIET_TRIAL_QUERY carries
// and for the same reason: the local active index is deliberately non-unique
// (dietTrialMirror.ts note (b)), so a device can briefly hold two active rows —
// its own losing offline row plus the winner hydrated from the server. The row the
// server actually accepted wins, because the server is authoritative under the
// house's last-write-wins-with-no-merge rule.
//
// `status = 'active'` HERE IS CORRECT AND MUST NOT GAIN THE B-422 EFFECTIVE-END
// GATE. This read backs the start modal's end-and-continue pre-flight, and what
// it is really asking is "will migration 040's one-active-trial UNIQUE index
// reject my insert?" — a question about the DATABASE, which knows nothing about
// graces. A stale trial still blocks a new one, so the modal must still be able
// to offer to end it; hiding it would leave the owner unable to start a trial
// with no explanation. Same rule at `profile.tsx`'s `sheetTrial`.
const ACTIVE_TRIAL_FOR_PET_SQL = `
  SELECT t.id, t.started_at, t.target_duration_days,
         COALESCE(
           NULLIF(TRIM(COALESCE(f.brand, '') || ' ' || COALESCE(f.product_name, '')), ''),
           t.food_label
         ) AS food_label
  FROM diet_trials t
  LEFT JOIN food_items_cache f ON f.id = t.food_item_id
  WHERE t.pet_id = ? AND t.status = 'active'
  ORDER BY t.synced DESC, t.started_at DESC, t.id
  LIMIT 1
`;

interface ActiveTrialRow {
  id: string;
  started_at: string;
  target_duration_days: number;
  food_label: string | null;
}

export async function getActiveTrialForPet(petId: string): Promise<ActiveTrialSummary | null> {
  const db = getDb();
  const row = await db.getFirstAsync<ActiveTrialRow>(ACTIVE_TRIAL_FOR_PET_SQL, [petId]);
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    targetDurationDays: Number(row.target_duration_days),
    foodLabel: row.food_label,
  };
}

/**
 * The owner-designated main protein for a set of food ids, from the LOCAL cache —
 * the derivation source for the setup sheet's "Trial protein" row and its day-0
 * mismatch heads-up (B-704 §7.1/§6). Never the network: the whole sheet is built
 * for a clinic car park with one bar of signal.
 *
 * Returns a map keyed by food id so the caller can look each food up in render
 * without re-querying. A picked food ABSENT from the map (or mapping to null) means
 * the cache has no readable protein for it — derivation goes dark rather than
 * guessing, exactly as `trialTargetProtein`'s fallback intends. `primary_protein`
 * only: the row names, and the mismatch flags, on the food's MAIN protein (§6.2);
 * the full `proteins` array is the allowed-set reader's job (`loadTrialAllowedSet`),
 * not this pre-write lookup.
 */
export async function getFoodPrimaryProteins(
  ids: readonly string[],
): Promise<Record<string, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const db = getDb();
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ id: string; primary_protein: string | null }>(
    `SELECT id, primary_protein FROM food_items_cache WHERE id IN (${placeholders})`,
    unique,
  );
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.id] = r.primary_protein;
  return out;
}

// B-534's report-race half lives in `lib/pdf.ts` (`flushBeforeReport`), NOT
// here, and the location is a finding rather than a preference: a first cut put
// a trial-scoped pending count in this file, and the adversarial pass showed the
// scoping itself was the defect — twelve unsynced refused BOWLS (the trial row
// long synced) produced an empty safety band on a refusing cat, undisclosed.
// The report reads every queue, so its gate counts every queue.

/**
 * End the running trial so a new one can start (mock screen D's primary action).
 *
 * `ended_at` is written on BOTH outcomes (§3.1) — but be precise about what that
 * currently buys, because the spec overstates it and so did this comment.
 * §3.1 says writing `ended_at` is what stops an abandoned trial rendering as an
 * intervention still under way. IT DOES NOT, YET: `generate-report` never selects
 * the column (`index.ts` fetch) and `ReportDietTrialInput` has no field for it
 * (`report.ts`), so the report still keys off `completed_at` — which is NULL on
 * an abandoned trial. A cat that refused the diet and was ended at day 19 still
 * reads to the vet as "ongoing since <start>". Writing the column is necessary
 * and is the client's half; the reader is **B-455**, against PR 7.
 *
 * A trial ENDS via `status`/`ended_at` — never a DELETE (soft-delete house rule),
 * so the record a vet reads survives the owner changing course.
 */
export async function endActiveTrial(params: {
  trialId: string;
  /** A value from `stopReasonOptions` — 'completed' or a stopped-early reason. */
  reason: string;
  /** The owner's read (PR 6, §4.3). Only ever written on a COMPLETED trial — see
   *  the guard below, which is a clinical rule and not a tidiness one. */
  outcome?: TrialOutcome | null;
  outcomeNotes?: string | null;
}): Promise<void> {
  const db = getDb();
  const today = toLocalDayKey(new Date());
  const now = new Date().toISOString();
  const completed = params.reason === 'completed';

  // THE OUTCOME IS STRUCTURALLY UNREACHABLE ON AN ABANDONED TRIAL, and that is
  // §4.3's refusal rule made unbypassable rather than remembered. "A refusal
  // stopped_reason routes to the intake-decline health lane and is NEVER rendered
  // as a compliance outcome" — so the write path simply has no branch that can
  // attach an owner verdict to a trial that ended early, whatever a caller passes.
  // The stopped-early flow collects no verdict at all (it asks what got in the
  // way, not how it went), so today this guard is belt-and-braces; it exists
  // because the next surface to call this function will not have read §4.3.
  const outcome = completed ? params.outcome ?? null : null;
  const outcomeNotes = completed ? params.outcomeNotes?.trim() || null : null;

  // `synced = 0, sync_attempts = 0, sync_error = NULL` in the same statement — the mirror's stated
  // contract for every local mutation. Clearing the error is what makes ending a
  // trial a FRESH ATTEMPT for a row that was previously quarantined on a 23505
  // rather than a permanently-parked one.
  await db.runAsync(
    `UPDATE diet_trials
        SET status = ?, ended_at = ?, completed_at = ?, stopped_reason = ?,
            outcome = ?, outcome_notes = ?,
            updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [
      completed ? 'completed' : 'abandoned',
      today,
      completed ? today : null,
      completed ? null : params.reason,
      outcome,
      outcomeNotes,
      now,
      params.trialId,
    ],
  );

  notifyTrialChanged();

  // Fire-and-forget, same contract as `startDietTrial`: offline the row stays
  // queued at synced = 0 and the next cycle picks it up. An ending trial is in
  // `syncPendingDietTrials`'s FIRST pass, so it cannot be re-ordered behind a
  // starting one.
  syncPendingDietTrials().catch((err) =>
    console.warn('[dietTrialSetup] end-trial sync failed (queued):', err),
  );
}

/**
 * `Keep going` — the milestone's extension (PR 6, §4.3).
 *
 * WHY THIS IS A WRITE AND NOT A NEW TRIAL. Extending keeps ONE continuous window:
 * a second row would split one clinical episode into two, neither of which is the
 * span the vet asked about, and §7's report would then render the back half of an
 * 84-day elimination as a 28-day trial. It is the same reasoning that made P-2
 * refuse a `paused` state.
 *
 * The caller computes the new target through `nextTargetDays`, which is where the
 * "cannot set a target at or below the current day" criterion is enforced and
 * tested. This function refuses a non-positive value and otherwise writes what it
 * is given — the arithmetic has one home, not two.
 */
export async function extendTrial(params: {
  trialId: string;
  targetDurationDays: number;
}): Promise<void> {
  const target = Math.floor(params.targetDurationDays);
  if (!Number.isFinite(target) || target < 1) {
    throw new Error(`extendTrial: refusing a target of ${params.targetDurationDays}`);
  }
  const db = getDb();
  await db.runAsync(
    `UPDATE diet_trials
        SET target_duration_days = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [target, new Date().toISOString(), params.trialId],
  );
  notifyTrialChanged();
  syncPendingDietTrials().catch((err) =>
    console.warn('[dietTrialSetup] extend-trial sync failed (queued):', err),
  );
}

/**
 * Set (or clear) the trial's owner-stated protein — B-704 §5/§7.3, the write path
 * PR 2's mirror comment deferred to "PR 3", consumed here because PR 4 lands first.
 *
 * ── NEVER A PERMIT (TG-1), SO IT RIDES THE ORDINARY COLUMN UPDATE ─────────────
 *
 * The stored protein only ever NAMES what the record already counts — it never
 * changes what `classifyFeeding` calls off-diet (the food list stays the sole
 * permit path, §5.5 D-A). So there is no allowed-set write here, no re-classify,
 * no recompute: it is one LWW column update, exactly like `extendTrial`.
 *
 * ── THE PAIRED-NULL CONTRACT (§5), ENFORCED HERE ─────────────────────────────
 *
 * `target_protein_set_at` is null whenever `target_protein` is null, and holds an
 * ISO/UTC instant otherwise. Both the "no single protein (hydrolyzed)" and the
 * "leave it unset" picker options store null (deliberately indistinguishable in
 * the column — the product distinction is carried by the picker UI and matters
 * nowhere downstream, §5). Clearing an owner-set value lands here as `null` too.
 *
 * ── CANONICAL ON WRITE (TG-4) ────────────────────────────────────────────────
 *
 * The value is `canonicalizeProtein`'d before it lands, so a raw label never
 * reaches the column — a Class-A convergent op, so a value the picker already
 * passes canonical is unchanged. `canonicalizeProtein` returns null for junk/empty
 * (the `PROTEIN_JUNK` set), so a cleared or unusable value naturally collapses to
 * the null branch and the paired-null contract holds by construction. The picker
 * only ever offers real protein keys or the two null escape hatches, so the read
 * gate's process-word residual (`trialTargetProtein`'s docstring) cannot arrive by
 * this door.
 *
 * `synced = 0, sync_attempts = 0, sync_error = NULL` in the same statement — the
 * mirror's stated contract for every local mutation, and what re-arms a row that
 * was previously quarantined. `notifyTrialChanged()` bumps the hydration tick so
 * the Pet-tab card AND the Home strip re-read the new naming, not just the surface
 * that wrote it (B-534's lesson).
 */
export async function setTrialTargetProtein(params: {
  trialId: string;
  /** A canonical protein key, a raw label (canonicalized here), or null to clear
   *  / "no single protein" / "leave it unset" — all three collapse to the null
   *  branch. */
  protein: string | null;
  /** Injected only so tests pin the exact `set_at` written; production passes
   *  now. */
  now?: Date;
}): Promise<void> {
  const key = params.protein != null ? canonicalizeProtein(params.protein) : null;
  const at = params.now ?? new Date();
  const nowIso = at.toISOString();
  // Paired-null: a null protein forces a null stamp; a non-null protein stamps
  // when it was set (TP-3's disclosure hook — the report reads it for the
  // "confirmed day N" provenance).
  const setAt = key != null ? nowIso : null;

  const db = getDb();
  await db.runAsync(
    `UPDATE diet_trials
        SET target_protein = ?, target_protein_set_at = ?, updated_at = ?,
            synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [key, setAt, nowIso, params.trialId],
  );

  notifyTrialChanged();

  // Fire-and-forget, same contract as every trial write here: offline the row
  // stays queued at `synced = 0` and the next cycle picks it up. This is a parent
  // update only — no `diet_trial_foods` children change — so there is no ordering
  // hazard, unlike start/end.
  syncPendingDietTrials().catch((err) =>
    console.warn('[dietTrialSetup] set-trial-protein sync failed (queued):', err),
  );
}

/** The one INSERT both write paths use. Shared for the same reason
 *  `buildTrialFoodRow` is: a row written by the mid-trial add and a row written
 *  by the start modal are the same row, and the column list is where a silent
 *  divergence would live (`synced = 0, sync_error = NULL` is the mirror's stated
 *  contract for every local write, and it is easy to forget at a new call site —
 *  a row inserted at `synced = 1` never reaches the server at all). */
const TRIAL_FOOD_INSERT_SQL = `INSERT INTO diet_trial_foods
   (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from,
    created_at, updated_at, synced, sync_error)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`;

function trialFoodInsertParams(f: NewTrialFoodRow): (string | null)[] {
  return [
    f.id, f.diet_trial_id, f.pet_id, f.food_item_id, f.role, f.food_label,
    f.allowed_from, f.created_at, f.updated_at,
  ];
}

/**
 * Add ONE food to a running trial's allowed set — B-616 FR-12 (D5, PM-ruled
 * 2026-07-31).
 *
 * ── AN ADD NEVER REWRITES HISTORY, AND THAT IS THE WHOLE MECHANISM ───────────
 *
 * `allowed_from` is TODAY, not the trial's start day, and the difference is the
 * entire safety property of this function. Membership is dated (§3.2), so a row
 * opened today permits today forward and says nothing about yesterday: the
 * feedings before this moment keep the reading they already have, the exposure
 * count does not fall, and the vet report's appendix does not quietly empty. Open
 * it at `started_at` instead — the shape `buildTrialRows` correctly uses at
 * creation — and adding the contraband on day 13 silently re-scores twelve prior
 * exposures as permitted, flips the card to clean, and empties the appendix, with
 * nothing on any page saying so. FR-11's confirm sheet tells the owner this in
 * plain words before they tap; this is the half that makes the sentence true.
 *
 * SOFT PATH ONLY — one INSERT, never an UPDATE of an existing row. Re-dating a
 * row that is already in force is the same retroactive rewrite by another route.
 *
 * THE ROLE IS INFERRED, NEVER ASKED (Principle 1 — no decisions at the moment of
 * the event). `permittedRoleForFood` reads the food's own `food_type`; both
 * permitted roles behave identically at rung 1, so a wrong guess costs a word of
 * provenance on the vet report and nothing else. Note what is NOT reachable
 * here: `primary_diet`. A mid-trial add is a vet-sanctioned EXTRA, and letting
 * this path write a diet-defining row would let the allowed set widen the
 * sanctioned protein comparator from a screen whose whole copy is "your vet said
 * this is OK" — §5.5 D-A's self-granted loophole, opened by the front door.
 *
 * The caller filters foods already on the list (it renders the same set through
 * `useTrialAllowedSet`). A duplicate reaching here is a UI bug rather than a data
 * hazard: `trialListFoodsOn` dedupes by identity so the list and its count cannot
 * double-render, and a second row cannot narrow the first one's membership.
 *
 * Returns the new row's id.
 */
export async function addTrialFood(params: {
  trialId: string;
  petId: string;
  food: TrialFoodSelection;
  /** Defaults to today. Injected only so tests and the FR-11 sheet agree on the
   *  day being written; there is no product case for a caller choosing a
   *  different one, and a PAST value would be the retroactive rewrite above. */
  allowedFrom?: string;
  now?: Date;
}): Promise<string> {
  const at = params.now ?? new Date();
  const row = buildTrialFoodRow({
    id: uuid(),
    trialId: params.trialId,
    petId: params.petId,
    food: params.food,
    role: permittedRoleForFood(params.food.food_type),
    allowedFrom: params.allowedFrom ?? toLocalDayKey(at),
    now: at.toISOString(),
  });

  await getDb().runAsync(TRIAL_FOOD_INSERT_SQL, trialFoodInsertParams(row));

  notifyTrialChanged();

  // Fire-and-forget, same contract as `startDietTrial`: offline the row stays
  // queued at `synced = 0` and the next cycle picks it up. The parent trial
  // landed long ago, so this is the child pass alone — there is no ordering
  // hazard to respect here.
  syncPendingDietTrialFoods().catch((err) =>
    console.warn('[dietTrialSetup] add-trial-food sync failed (queued):', err),
  );

  return row.id;
}

/**
 * Write the trial + its allowed set locally, then kick a flush.
 *
 * ORDERING IS LOAD-BEARING IN TWO PLACES, and they are different problems:
 *
 *   • LOCALLY, the trial row is inserted before its `diet_trial_foods` children.
 *     The mirror holds no SQLite FKs (note (a)) so this cannot fail, but the read
 *     paths join on it and an interleaved read should never see orphans.
 *   • ON THE WIRE, an ending trial must land before a starting one, or the
 *     UNIQUE partial active index rejects the new row with a 23505 — which PR 2
 *     classifies as TERMINAL. `syncPendingDietTrials` pushes in two passes for
 *     exactly this reason; see the comment there.
 *
 * The flush is fire-and-forget: offline, the rows simply stay queued at
 * `synced = 0` and the next cycle picks them up. That is the whole point of
 * writing locally first.
 */
export async function startDietTrial(input: StartTrialInput): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = buildTrialRows(input, now);

  // ONE TRANSACTION. The parent and its allowed set are a single fact, and a throw
  // partway through the loop would otherwise leave an ACTIVE trial with a partial
  // (or empty) `primary_diet` set — which is the worst of the available states: it
  // is a real trial, the modal's pre-flight will refuse to start another, and the
  // shared predicate would compute the sanctioned set from a partial diet — which
  // classifies the MISSING trial food's every meal as an off-diet exposure.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO diet_trials
         (id, pet_id, food_item_id, started_at, target_duration_days, status,
          food_label, indication, phase, vet_name, transition_started_at,
          target_protein, target_protein_set_at,
          created_at, updated_at, synced, sync_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        rows.trial.id, rows.trial.pet_id, rows.trial.food_item_id, rows.trial.started_at,
        rows.trial.target_duration_days, rows.trial.status, rows.trial.food_label,
        rows.trial.indication, rows.trial.phase, rows.trial.vet_name,
        rows.trial.transition_started_at,
        rows.trial.target_protein, rows.trial.target_protein_set_at,
        rows.trial.created_at, rows.trial.updated_at,
      ],
    );

    for (const f of rows.foods) {
      await db.runAsync(TRIAL_FOOD_INSERT_SQL, trialFoodInsertParams(f));
    }
  });

  notifyTrialChanged();

  // Parent before children on the wire too — a child whose parent has not landed
  // FK-fails with a 23503, which PR 2 classifies NON-terminal, so it would simply
  // retry. Ordering makes the common case land in one cycle instead of two.
  syncPendingDietTrials()
    .then(() => syncPendingDietTrialFoods())
    .catch((err) => console.warn('[dietTrialSetup] trial sync failed (queued):', err));

  return rows.trial.id;
}
