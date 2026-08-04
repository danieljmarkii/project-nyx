// Trial-contaminant detection — the deterministic wedge win (B-351 Phase A,
// slice 4; spec §3/§8, D2/D6/D7, and B-417's C2 ruling).
//
// WHAT THIS ANSWERS. For a pet on an active diet trial: does a given food carry a
// protein the trial diet does not? No correlation to accumulate, no attribution
// ambiguity, no Bonferroni — the moment the protein set exists, the answer is a
// set difference. It is exactly the failure mode Dr. Chen names (a "duck" food
// that quietly lists chicken by-product meal is the textbook reason a home
// elimination trial silently fails), caught the moment the data exists.
//
// B-693 ADDED A SECOND QUESTION at the same moment: is the food even ON the
// trial's allowed list? A food that carries no off-trial protein the app can see —
// because nobody read its panel, which is the MODAL case on a real library — is
// invisible to the question above, yet feeding off the list is the commonest way a
// trial is compromised. So the log-time decision now emits ONE of two typed flags:
// the CONTENTS flag (shape ②, "this has chicken in it", rung 2) or, when that is
// silent, the MEMBERSHIP flag (shape ③, "this isn't on the trial list", rung 3 — a
// fact about the LIST, never a claim about contents nobody read). They are
// mutually exclusive by construction (classifyFeeding returns one verdict), and
// BOTH are gated on isTrialRunning at the log-time call site (B-595): a
// stale-active trial interrupts no logs, while the STANDING surfaces (the card
// note, the food-detail note, the vet report) keep firing off the same context.
//
// ── WHERE THIS SITS RELATIVE TO B-417 ────────────────────────────────────────
// ✅ RE-BASED BY B-417 PR 5 (closes B-438 and B-453). `lib/dietTrial.ts` now owns
// the predicate — four rungs over the explicit allowed set, the derived protein
// arm, the unrecognised fallback and the oral route — and THIS module is a
// CONSUMER of it, exactly as §0.2 option (c) ruled. What is left here is the half
// `dietTrial.ts` deliberately cannot hold: the I/O (reading the trial and its
// allowed set off the local mirror), the AsyncStorage heads-up ledger, and the
// log-time COPY.
//
// Two things changed at the re-base, and both were live defects:
//
//   • THE TRIAL DIET IS N FOODS, NOT ONE. Slice 4 derived it from the single
//     `diet_trials.food_item_id` column, which §4.1 has since ruled DISPLAY-ONLY
//     LEGACY. On the normal two-food trial (a wet and a dry of the same diet)
//     that computed the sanctioned set from ONE food and flagged the
//     legitimately-allowed second trial food as a contaminant — C2's
//     alarm-fatigue failure aimed at the one food the owner cannot stop feeding.
//     PR 3 shipped a stopgap (go silent unless the `primary_diet` count is
//     exactly 1); B-453 said to delete it at this re-base, and it is deleted.
//
//   • THE ALLOWED SET IS NOW THE PERMIT PATH. Slice 4 knew only about the trial
//     diet, so a vet-PERMITTED treat carrying a second protein produced a
//     heads-up on every feeding — scoring the owner for following instructions
//     (§6.9). Rung 1 stops it now.
//
// ── THE FOUR RULES THAT KEEP IT HONEST ───────────────────────────────────────
//
// 1. PRESENCE ONLY — never an all-clear. A food whose protein set is empty or
//    whose panel was never read produces SILENCE, not "no conflict found". This
//    is D10's ratified consequence and the `clinical-guardrails` asymmetry: a
//    clean-looking set is not evidence of a clean food, because the commonest
//    reason a set looks clean is that nobody read the label. Nothing in this
//    module ever returns a reassuring verdict; the only two outcomes are "here is
//    a protein that is off the trial diet" and nothing at all.
//
// 2. THE TRIAL FOOD'S OWN CONTAMINATION IS A STANDING FACT, NEVER A PER-FEEDING
//    VERDICT (B-417 C2, PM-ratified 2026-07-25). A per-feeding flag on the
//    PRESCRIBED food fires 100+ times across a 56-day trial — alarm fatigue
//    inverted onto the one food the owner cannot stop feeding, which trains them
//    to ignore the flag that matters on day 22. So shape ① (the trial food is
//    itself contaminated) surfaces on the diet-trial card and the food's own
//    detail screen, and is EXCLUDED from the meal-log path by construction.
//
// 3. ONE HEADS-UP PER FOOD PER TRIAL — counted in HEADS-UPS GIVEN, never in meals
//    fed. Shape ② (a different food logged during the trial) rides the completion
//    card the first time we actually TELL the owner, and stays quiet after. The
//    second chicken treat is not new information; C2's alarm-fatigue reasoning
//    applies to any food fed daily, not only the trial diet.
//
//    The distinction is not pedantry — it is a defect the adversarial pass found
//    in the first cut, which gated on "is this the first MEAL of this food inside
//    the trial window". Two ways that silently muted the feature outright:
//      • an owner logs the chicken chew on the subway (offline → no trial context
//        → correct silence), then again on wifi an hour later: meal count is 2,
//        so the gate suppresses, and that food is NEVER flagged for the rest of a
//        56-day trial. A suppressed heads-up consumed the budget for a heads-up
//        that was never given.
//      • the normal vet-directed setup — trial entered on Thursday with
//        `started_at` back-dated to Monday's visit — means every food fed Mon–Wed
//        already has meals inside the window, so the flag is dead on arrival for
//        exactly the foods most likely to be contaminating the trial.
//    Recording what we SAID makes both cases correct by construction, and it
//    removes the only SQL in this module.
//
//    The standing fact remains visible on the food's detail screen, which is where
//    a standing fact belongs — that is what makes suppressing the repeat safe.
//
// 4. THE TARGET PROTEIN COMES FROM THE OWNER'S DESIGNATION, NOT FROM proteins[0].
//    See resolveTargetProtein below — the one place where the derived-primary
//    convenience is deliberately not used.
//
// No `diet_trials` schema change (D6, RATIFIED-deferred): v1 keys off the trial
// food's own designated protein. `nyx-voice` + `clinical-guardrails` govern every
// string this module builds.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from './db';
import { foodIntakeKey } from './food';
import { localDayIndex } from './utils';
import {
  proteinSetCompleteness,
  proteinsFromCacheText,
  type ProteinSetCompleteness,
} from './protein';
import {
  buildTrialContext,
  classifyFeeding,
  contaminationNote,
  isTrialRunning,
  narrowTrialFoodRole,
  proteinPhrase,
  sanctionedProteinsOn,
  trialContamination,
  type AllowedFood,
  type TrialContext,
  type TrialSpec,
} from './dietTrial';
// The pure off-trial predicates moved to `./trialProtein` (B-351 slice 5) so the
// vet-report Edge Function can import the SAME implementation — this module's
// AsyncStorage/supabase/db imports make it unreachable from Deno. Re-exported
// here so every existing call site and test keeps its import path.
import { offTrialProteins, resolveTargetProtein, proteinList } from './trialProtein';

export { offTrialProteins, resolveTargetProtein, proteinList } from './trialProtein';

// ── The pure predicate layer ─────────────────────────────────────────────────

/** Everything this module needs to know about the pet's active trial. Assembled
 *  by loadTrialProteinContext below; every consumer takes it as an argument so
 *  the decision logic stays pure and testable.
 *
 *  Post-re-base this is the TRIAL plus its ALLOWED SET — the two inputs
 *  `lib/dietTrial.ts` takes — and nothing derived. Everything that used to be
 *  precomputed here (the target protein, the trial food's key, its captured
 *  array) was a single-food projection, and the projection was the bug. */
export interface TrialProteinContext {
  trialId: string;
  petId: string;
  /** Local-midnight ms of `diet_trials.started_at` (a DATE, not a timestamp).
   *  Local, because "the day the trial started" is the owner's calendar day, not
   *  a UTC instant — a UTC-midnight reading silently excludes the start-day
   *  breakfast of anyone east of Greenwich. */
  startedAtMs: number;
  /** The trial itself, in the shape `lib/dietTrial.ts` takes. */
  spec: TrialSpec;
  /** Every `diet_trial_foods` row for this trial, joined to the food cache. */
  allowedFoods: AllowedFood[];
  /** Display name of the trial diet, for copy — the `primary_diet` rows, named.
   *  Null when nothing resolved. */
  trialFoodLabel: string | null;
  /** How many `primary_diet` rows the allowed set holds. ZERO disables every
   *  check (silence, never an all-clear) and is a real state: `diet_trials` can
   *  hydrate before `diet_trial_foods` does. */
  primaryCount: number;
  /** How many of those resolved out of `food_items_cache`. Distinguishes "the
   *  owner designated no main protein" from "we never saw the food" — two states
   *  that must not share a sentence (see trialDietNote). */
  primaryResolved: number;
  /** Does any row carry a `role` this build cannot read? (B-556.)
   *
   *  Same job as `primaryResolved` above, one state further out: with an
   *  unrecognised role narrowed to `permitted_other`, a trial can hold rows while
   *  `primaryCount` is 0, and the two ways that happens need different sentences.
   *  "The owner marked a food as the diet and this build cannot read the marking"
   *  is not "the owner never marked one" — asserting the second about the first
   *  is an unproven claim about the record on a clinical surface, which is the
   *  class B9 exists to correct. */
  hasUnreadableRole: boolean;
  /** D10 gate over the trial diet's sets. `complete` ONLY when EVERY
   *  `primary_diet` food's ingredient panel was read — one unread food in a
   *  two-food trial means "anything else in it is still unknown" is true of the
   *  trial as a whole. */
  trialFoodCompleteness: ProteinSetCompleteness;
}

/** The `lib/dietTrial.ts` context, built from this module's context. Cheap and
 *  derived on demand rather than stored, so the two can never disagree. */
export function trialContextOf(ctx: TrialProteinContext): TrialContext {
  return buildTrialContext(ctx.spec, ctx.allowedFoods);
}

/** Rung 2's comparator for this trial, as of today. Exported because the copy
 *  layer names it ("Rex's duck trial") and the food-detail screen renders it. */
export function sanctionedProteinsForTrial(ctx: TrialProteinContext): string[] {
  const trial = trialContextOf(ctx);
  // B-421: the local-day index, from the one implementation. Never a millisecond
  // division — that is a UTC epoch-day and it disagrees with the owner's calendar
  // by up to a day at either end.
  const today = localDayIndex(Date.now());
  return [...sanctionedProteinsOn(trial, Math.max(today, trial.startDayIndex ?? today))];
}

/** A food's captured protein evidence, as every surface here consumes it. */
export interface FoodProteinRecord {
  proteins: string[];
  ingredientsNotes: string | null;
  extractionConfidence: unknown;
  /** Case-folded brand+product — the rule-2 duplicate-capture key. */
  foodKey: string;
}

/**
 * Shape ① — is a food on the ALLOWED LIST itself carrying off-trial proteins?
 *
 * Returns the extra protein keys across the whole allowed set, or [] when there
 * are none OR the question cannot be answered. Callers must not distinguish those
 * two cases in copy: `trialFoodCompleteness` on the context is what says whether
 * "nothing else in it" may be claimed at all.
 *
 * D-A widened this from the trial diet to the whole allowed list: the
 * vet-approved rabbit jerky that also lists chicken fat is exactly as
 * trial-invalidating as a contaminated primary diet, and less likely to be
 * noticed. The comparator is each food's OWN designated primary — see the
 * "two protein sets" note in `lib/dietTrial.ts`.
 */
export function trialFoodContaminants(ctx: TrialProteinContext): string[] {
  const seen = new Set<string>();
  for (const fact of trialContamination(trialContextOf(ctx))) {
    for (const key of fact.extraProteins) seen.add(key);
  }
  return [...seen];
}

/** The rung-2 CONTENTS heads-up: this food carries a protein the trial diet does
 *  not. Absence of one is never an all-clear. A claim about the food's contents,
 *  which is why it can only fire on a food whose panel was read. */
export interface TrialContaminantFlag {
  /** Discriminant of the log-time union (B-693). The contents flag. */
  kind: 'off_diet_protein';
  /** Off-trial canonical protein keys found in this food, prominence-ordered. */
  proteins: string[];
  /** What the trial diet is built on, for the "…trial should skip X" clause. A
   *  SET, not one protein: a wet+dry trial can sanction two, and naming only one
   *  of them told the owner the other was a contaminant. */
  trialProteins: string[];
  /** The trial and food this heads-up is about — carried so the surface that
   *  DISPLAYS it can spend rule 3's budget (noteTrialFlagShown) without having to
   *  re-derive which trial was live at evaluation time. */
  trialId: string;
  foodId: string;
}

/**
 * The rung-3 MEMBERSHIP heads-up (B-693): this food is not on the trial's allowed
 * list. A fact about the LIST, and NEVER a claim about the food's contents.
 *
 * It carries no proteins BY CONSTRUCTION, and that is the point. Rung 3 fires
 * precisely when the protein arm found nothing to say — the panel was never read,
 * or every protein it lists is already sanctioned, or the arm was dark — so any
 * assertion here about what the food contains would be fabricated. Rule 1
 * (presence-only) forbids it, and making this a distinct TYPE from
 * TrialContaminantFlag is what stops a consumer routing membership copy through
 * the contents copy (which names an antigen this flag does not have).
 */
export interface TrialMembershipFlag {
  /** Discriminant of the log-time union (B-693). The list-absence flag. */
  kind: 'off_trial_list';
  /** Carried so the displaying surface can spend rule 3's SHARED ledger budget
   *  (noteTrialFlagShown) — the same trialId/foodId keyspace as the contents
   *  flag, so a food spoken for once is not news again whichever kind spoke. */
  trialId: string;
  foodId: string;
}

/**
 * The two mutually-exclusive log-time heads-ups a meal log can raise.
 *
 * `classifyFeeding` returns exactly ONE verdict per feeding, so a single feeding
 * is at most one of these — rung-2 precedence ("off_diet_protein wins, never
 * both") is STRUCTURAL, not coordinated. The `kind` discriminant lets a surface
 * pick the right register (contents vs. membership) without inspecting fields.
 */
export type LogTimeTrialFlag = TrialContaminantFlag | TrialMembershipFlag;

/**
 * Shape ② — does a food that is NOT on the allowed list carry off-trial proteins?
 *
 * The CONTENTS half of the log-time decision (its rung-3 sibling is
 * `foodMembershipFlag`), and a thin CONSUMER of `classifyFeeding`: this module no
 * longer holds an opinion about what off-diet means. Returns null for silence.
 *
 * IT FIRES ON RUNG 2 ONLY, and the two exclusions that implies are rules rather
 * than omissions:
 *
 *   • A PERMITTED food never produces a heads-up, even when it carries an
 *     unsanctioned protein. D-B records that antigen for the vet report; flagging
 *     it at log time would score the OWNER for following the vet's instructions
 *     (§6.9). Rung 1 is also how C2 holds for the trial diet itself, and how a
 *     re-photographed bag of the trial diet stays silent (§5.4's key match) —
 *     both used to need their own special case here, and neither does now.
 *   • A RUNG-3 food produces no CONTENTS heads-up: rule 1 is presence-only, and
 *     "nobody has read this food's ingredients" is not a thing to make a contents
 *     claim about. Since B-693 it is not silent at log time either — the weaker
 *     MEMBERSHIP heads-up (`foodMembershipFlag`, "not on the trial list") surfaces
 *     it without asserting contents — and it is RECORDED as an exposure by
 *     `computeTrialFacts` regardless, where the closed-world count lands.
 */
export function foodContaminantFlag(
  ctx: TrialProteinContext | null,
  foodId: string,
  foodProteins: readonly string[],
  /** Case-folded brand+product of THIS food, when the caller has it. Closes the
   *  duplicate-capture hole in rung 1 (§5.4). Omitting it degrades to the id-only
   *  match, which is the pre-existing behaviour, not a new hazard. */
  foodKey?: string | null,
  /** When this food was (or would be) fed. Defaults to now — the add-to-library
   *  path is asking "if I fed this today", and membership is DATED. */
  occurredAt?: string,
): TrialContaminantFlag | null {
  if (!ctx) return null;
  const trialProteins = sanctionedProteinsForTrial(ctx);
  // An unknown trial diet disables every check — silence, never an all-clear
  // (rule 1 / B-351 D10). Reachable two ways that must not be confused in copy:
  // no `primary_diet` row has hydrated yet, and a hydrolysed diet with no animal
  // protein designated at all. `trialDietNote` is what says so out loud.
  if (trialProteins.length === 0) return null;
  const classification = classifyFeeding(trialContextOf(ctx), {
    eventId: 'evaluation',
    occurredAt: occurredAt ?? new Date().toISOString(),
    foodItemId: foodId,
    foodKey: foodKey ?? null,
    label: null,
    foodType: null,
    proteins: foodProteins,
  });
  if (classification.verdict !== 'off_diet_protein') return null;
  return {
    kind: 'off_diet_protein',
    proteins: classification.antigens,
    trialProteins,
    trialId: ctx.trialId,
    foodId,
  };
}

/**
 * Is the allowed set settled enough that "this food is NOT on it" is a real fact
 * rather than a sync artefact?
 *
 * An unhydrated or partially-hydrated set — fresh install, mid-sync, offline cold
 * start — makes EVERY food look absent, the prescribed diet INCLUDED, so a naive
 * membership read would fire the log-time heads-up on the one food the owner
 * cannot stop feeding (C2's alarm-fatigue inversion, arriving via the list rather
 * than the protein arm). "Settled" here is the SAME condition
 * `loadTrialProteinContext` uses to decide the context is cacheable — every
 * `primary_diet` row present AND resolved out of the food cache — so the two can
 * never disagree. An active trial always has at least one primary diet, so a zero
 * primary count is itself the unhydrated signal, never an empty-but-loaded set.
 *
 * WHAT THIS GUARDS, AND WHAT IT DOES NOT. This closes the HYDRATION route to the
 * C2 inversion — the whole primary diet not yet loaded. It does NOT close two
 * other over-fire routes, because they are `matchAllowed` id/exact-key
 * limitations rather than hydration ones, and they are the SAME over-fire the
 * rung-2 contents flag already carries (with a stronger, contents claim), not
 * something B-693 invents:
 *   • A re-photographed bag of the PRESCRIBED DIET whose freshly-extracted
 *     brand+product text diverges from the stored allowed-set key (AI-extraction
 *     variance, or a manual "Duck" vs "Duck Formula"): the §5.4 exact-key guard
 *     misses, so it falls to rung 3 and membership fires on the trial diet. The
 *     add-to-list escape hatch self-heals it (one tap adds the new capture), the
 *     ledger bounds it to once, and it is over-fire not reassurance — but it is a
 *     real gap. Root cause tracked as B-699 (a shared dedup fix, cross-cutting and
 *     Deno-shared, deliberately out of this lib-only PR).
 *   • A vet-PERMITTED food added mid-trial on another device, logged here before
 *     its `diet_trial_foods` row has synced: the primary is resolved so this
 *     returns true, but the missing permitted row cannot be detected (we do not
 *     know how many permitted rows to expect). Transient (TTL + sync), over-fire,
 *     and identical to the contents flag's own cross-device behaviour.
 * Both are toward over-firing, never toward the reassurance direction (a genuine
 * off-list food is never silenced), which is the direction that endangers a pet.
 */
export function allowedSetHydrated(ctx: TrialProteinContext): boolean {
  return ctx.primaryCount > 0 && ctx.primaryResolved === ctx.primaryCount;
}

/**
 * Shape ③ — is a food NOT on the trial's allowed list at all (rung 3)?
 *
 * The pure half of the log-time MEMBERSHIP decision (B-693), and — exactly like
 * `foodContaminantFlag` — a thin CONSUMER of `classifyFeeding`, never a second
 * opinion about what off-diet means (one predicate, §5.3). Returns null for
 * silence.
 *
 * IT FIRES ON RUNG 3 ONLY (`off_diet_unrecognised`), the modal case on a real
 * library: the food was simply never added to the list, and typically nobody has
 * read its ingredient panel. The claim it licenses is therefore about the LIST —
 * "this isn't on the trial list" — and never about the food's contents.
 *
 * The exclusions are structural, not omissions:
 *   • RUNG 2 (`off_diet_protein`) → NULL here: the stronger CONTENTS flag
 *     (`foodContaminantFlag`) fires instead, and never both. Precedence is
 *     guaranteed by `classifyFeeding` returning exactly one verdict — a food that
 *     carries an off-trial protein is classified rung 2 and never reaches rung 3.
 *   • A PERMITTED food (rung 1) and the trial diet itself → NULL: absence of a
 *     flag is never a verdict (G2), and a permitted food is never praised.
 *   • An UNHYDRATED allowed set → NULL (see `allowedSetHydrated`): without it,
 *     every food — the prescribed diet included — reads as absent mid-sync.
 *   • OUT OF WINDOW / no identity → NULL: `classifyFeeding` says so.
 *
 * `foodProteins` is load-bearing DESPITE the flag carrying none: the array is
 * what `classifyFeeding` reads to split rung 2 from rung 3, so a food with an
 * off-trial protein correctly routes to the contents flag rather than here.
 */
export function foodMembershipFlag(
  ctx: TrialProteinContext | null,
  foodId: string,
  foodProteins: readonly string[],
  /** Case-folded brand+product of THIS food, when the caller has it — the same
   *  rung-1 duplicate-capture guard `foodContaminantFlag` takes (§5.4). */
  foodKey?: string | null,
  /** When this food was (or would be) fed. Defaults to now; membership is DATED. */
  occurredAt?: string,
): TrialMembershipFlag | null {
  if (!ctx) return null;
  // An unhydrated list must not be read as an empty one (mock §4). Silence, never
  // a membership flag on a food the list simply has not loaded yet.
  if (!allowedSetHydrated(ctx)) return null;
  const classification = classifyFeeding(trialContextOf(ctx), {
    eventId: 'evaluation',
    occurredAt: occurredAt ?? new Date().toISOString(),
    foodItemId: foodId,
    foodKey: foodKey ?? null,
    label: null,
    foodType: null,
    proteins: foodProteins,
  });
  // Rung 3 ONLY. `off_diet_protein` → the contents flag fires instead (never
  // both); `permitted` / `out_of_window` / `unclassifiable` → silence.
  if (classification.verdict !== 'off_diet_unrecognised') return null;
  return { kind: 'off_trial_list', trialId: ctx.trialId, foodId };
}

// ── Copy (nyx-voice + clinical-guardrails) ───────────────────────────────────
//
// Two register rules govern everything below. (a) DESCRIPTIVE, NEVER ALARMIST —
// a calm "heads up", not a klaxon; Nyx has no danger state and this is not where
// one gets invented. (b) NEVER REASSURING — no string here has a negative form.
// There is no "no conflicts found" copy because there is no state in which we
// could honestly say it.

/** Title-case a canonical key for the start of a sentence. */
function display(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// `proteinList` now lives in ./trialProtein (re-exported at the top of this file).

/**
 * The log-time heads-up, as it rides the meal completion card (mock §2, bottom).
 *
 * Deliberately past-tense and settled: the meal is already saved, so the copy
 * reports rather than asks. "The meal's saved" is doing real work — it tells the
 * owner there is nothing to undo or confirm, which is what keeps this from
 * reading as a gate (Principle 1).
 */
export function mealFlagCopy(flag: TrialContaminantFlag, petName: string): {
  headline: string;
  detail: string;
} {
  return {
    headline: `This one has ${proteinList(flag.proteins)}.`,
    detail:
      `${petName}’s ${proteinPhrase(flag.trialProteins)} trial should skip ` +
      `${proteinList(flag.proteins)}. The meal’s saved — just worth knowing, and ` +
      'maybe a note for your vet.',
  };
}

/**
 * The log-time MEMBERSHIP heads-up (B-693, mock §5, Variant B) — it rides the
 * meal completion card exactly where the contents flag does, but says something
 * strictly weaker and strictly honest: this food is not on the trial's list.
 *
 * IT TAKES ONLY THE PET NAME, ON PURPOSE. `mealFlagCopy` reads `flag.proteins`
 * because it names a protein; this one has no contents to name, because rung 3 is
 * exactly the state where nobody read the panel. Encoding that in the signature —
 * there is no food-specific field to pass — makes it structurally impossible to
 * assert what the food contains. The words it must NEVER use ("off-diet",
 * "contaminant", any negative all-clear) are pinned in the test.
 *
 * Past-tense and settled, like `mealFlagCopy`: the meal is already saved, so the
 * copy reports (and says so first) rather than asking — it is not a gate
 * (Principle 1). `addLine` is the §3 escape hatch: if the vet okayed the food,
 * adding it to the list repairs the record instead of scoring the owner (§6.9).
 * The "+" affordance glyph is NOT baked into the string — the copy layer carries
 * words, not chrome; PR 2's surface renders `+ ${addLine}` in JSX, the way the
 * card's existing combo row hardcodes its own "+ Add a med given with this"
 * literal (there is no shared prepend convention to reuse — just the same glyph
 * rendered at the call site).
 */
export function membershipFlagCopy(petName: string): {
  eyebrow: string;
  headline: string;
  detail: string;
  addLine: string;
} {
  return {
    eyebrow: 'Off the trial list',
    headline: `This one isn’t on ${petName}’s trial list.`,
    detail:
      'The meal’s saved, and it counts in the trial record. If your vet okayed ' +
      'this food, adding it to the list keeps the record straight.',
    addLine: 'Add to the trial list',
  };
}

/**
 * The add-to-library soft confirm (mock §2, top).
 *
 * ONE DELIBERATE DEVIATION FROM THE MOCK. The mock reads "Nyx's elimination trial
 * is on duck"; this says "trial diet". `diet_trials` carries an `indication`
 * (skin / gi / other) but not a diet CLASS, so the app still cannot know a trial
 * is an elimination trial rather than a hydrolysed one — and asserting a trial
 * TYPE we have not been told is a fabricated clinical claim on a surface a vet
 * may be shown. The rest of the mock's copy is verbatim.
 */
export function addFlagCopy(flag: TrialContaminantFlag, petName: string): {
  title: string;
  body: string;
} {
  const list = proteinList(flag.proteins);
  return {
    title: `Heads up — this food lists ${list}`,
    body:
      `${petName}’s trial diet is ${proteinPhrase(flag.trialProteins)}. The ${list} in ` +
      'here could keep the trial from giving a clean answer. Worth a word with your ' +
      'vet before you feed it.',
  };
}

/**
 * The standing note on a food's own detail screen — the same fact as the
 * completion card, in the register of a property of the food rather than an
 * event. This is where rule 3's suppressed repeats still live: a food flagged
 * once at log time keeps saying so here, for as long as the trial runs.
 */
export function standingFlagCopy(flag: TrialContaminantFlag, petName: string): {
  title: string;
  body: string;
} {
  const list = proteinList(flag.proteins);
  return {
    title: `Off ${petName}’s trial diet`,
    body:
      `This food lists ${list}, and the trial diet is ` +
      `${proteinPhrase(flag.trialProteins)}. Worth a note for your vet.`,
  };
}

/**
 * The diet-trial card's standing note about the ALLOWED LIST ITSELF (shape ①,
 * B-417 C2's "computed once per trial, surfaced on the card"; widened to
 * permitted extras by D-A).
 *
 * Three states, and the last two are the ones D10 exists for: when nothing has
 * read the trial diet's ingredient panel, the card says so rather than leaving
 * the owner to read the absence of a flag as an all-clear on the food their pet
 * eats every day for eight weeks. Returns null only when there is genuinely
 * something to say AND nothing worth saying — i.e. every panel WAS read and none
 * of them carries an extra protein.
 */
export function trialDietNote(
  ctx: TrialProteinContext,
  petName?: string | null,
  /** `TrialFacts.antigenArmDark` + `antigenAttributionPaused.map(f => f.label)`,
   *  passed in by the card loader rather than re-derived here (B-598). See branch
   *  #3 below and `antigenPausedNote` for why the note reads the module's flag
   *  instead of computing its own. */
  opts?: { antigenArmDark?: boolean; pausedLabels?: readonly string[] },
): { title: string; body: string } | null {
  // B9 — the MOST unknown state must not get the LEAST disclosure. An unknown
  // trial diet silently disables every check in this module, and an earlier cut
  // returned null here: the trial card said nothing, no flag ever fired, and
  // nothing anywhere told the owner the check was off. That is worse than the
  // panel-unread case below, which does get a note — the owner was being given
  // strictly less information the less we knew. It is reachable three ways now: a
  // hydrolysed trial diet with no animal protein designated, slice 3's "clear the
  // main protein", and an allowed set that has not hydrated.
  if (sanctionedProteinsForTrial(ctx).length === 0) {
    // TWO DIFFERENT STATES, TWO DIFFERENT SENTENCES. An earlier cut collapsed them
    // and asserted "the trial food has no main protein set" about a food it had
    // never read — reachable whenever `diet_trials` hydrated but the allowed set
    // or `food_items_cache` had not (they are separate pulls). The owner who
    // followed the instruction opened the food and found a main protein sitting
    // there, i.e. the app contradicting itself. Not reassurance, but an unproven
    // assertion about the record on a clinical surface — the class B9 corrects.
    if (ctx.primaryCount === 0 || ctx.primaryResolved < ctx.primaryCount) {
      // FOUR STATES NOW, AND TWO OF THEM ARE B-556'S DOING. `primaryCount === 0`
      // used to mean "the allowed set is empty", because an unreadable role
      // counted as `primary_diet`. It no longer does, so the same branch is now
      // reachable with rows PRESENT, two ways — and the adversarial probe on this
      // change reached BOTH:
      //
      //   • a row whose `role` this build cannot read (the B-556 path), and
      //   • a set carrying only recognised non-primary roles — a permitted treat
      //     or a supplement and no trial diet at all. That one was always
      //     reachable and was always mis-worded.
      //
      // Rendering "This trial has no food attached yet" in either is exactly the
      // defect B9 was written to correct, one state over: the card would assert an
      // absence the record contradicts, on the same surface that renders the
      // trial's own food label. So the empty-set sentence is now gated on the set
      // actually being empty.
      //
      // AND THE TWO PRESENT-BUT-DARK STATES DO NOT SHARE A SENTENCE EITHER, for
      // the same reason `primaryResolved` exists: "the owner marked a food as the
      // diet and this build cannot read the marking" is a different fact from "the
      // owner never marked one", and the first cut of this change collapsed them
      // into a single "can't tell which food is the diet itself" — which reads as
      // confusion among several foods when the truth is that none was designated.
      // Neither sentence promises a fix it cannot deliver: "this usually settles
      // once everything syncs" is FALSE of both (the rows arrived intact), so it
      // stays on the hydration state where it is true.
      const body =
        ctx.primaryCount > 0
          ? 'The trial food hasn’t loaded on this device yet, so there’s nothing to '
            + 'compare against. This usually settles once everything syncs.'
          : ctx.allowedFoods.length === 0
            ? 'This trial has no food attached yet, so there’s nothing to compare other '
              + 'foods against.'
            : ctx.hasUnreadableRole
              ? 'Culprit doesn’t recognise what role one of this trial’s foods plays, so '
                + 'there’s nothing to compare other foods against.'
              : 'None of this trial’s foods is marked as the diet itself, so there’s '
                + 'nothing to compare other foods against.';
      return { title: 'Culprit can’t check other foods against this trial yet', body };
    }
    return {
      title: 'Culprit can’t tell what this trial is built on',
      body:
        'The trial food has no main protein set, so other foods can’t be checked ' +
        'against it. Setting one on the food would turn the checks back on.',
    };
  }
  // D-A's standing fact, computed by the shared module over `primary_diet` rows
  // AND permitted extras. Never a per-feeding verdict (C2).
  const note = contaminationNote(trialContamination(trialContextOf(ctx)), petName);
  if (note) return note;
  // B-529/R7(c) + B-598 — THE PAUSED ANTIGEN ARM, read from the module's flag,
  // never re-derived here.
  //
  // This branch used to compute its OWN `uncharacterizedTrialDietFoodsInRange`
  // over `[startDayIndex … max(today, startDayIndex)]` — a SECOND definition of
  // "is the arm dark" living one surface away from the one the vet report reads
  // (`TrialFacts.antigenArmDark` / `antigenAttributionPaused`). Two answers to one
  // question, the class B-598 was filed under, and it was wrong two ways the flag
  // is not:
  //   • a `primary_diet` MEMBERSHIP GAP darkens the arm with NO row to name, so the
  //     re-derivation found nothing and returned null while the report rendered the
  //     unnamed "Antigen check paused" row. The card went silent on a gap the vet
  //     was shown — the disclosure pass 4 forced onto the report, missing here.
  //   • its range END was `Date.now()`, so an ENDED trial saw rows in force AFTER
  //     it ended (over-fire). `antigenArmDark` bounds on the evidence end.
  // The flag is computed once, feeding-anchored, over the correct window, so the
  // card now discloses exactly when the report does and names the same foods.
  //
  // AFTER `contaminationNote`, DELIBERATELY (B-529 ④): a real finding about food A
  // outranks an explanation of a gap caused by food B, and BEFORE the
  // ingredients-unread note below, preserving the order the re-derivation had.
  // `antigenPausedNote` is the owner-register mirror of `render.ts`'s row; both
  // read `antigenAttributionPaused`.
  if (opts?.antigenArmDark) return antigenPausedNote(opts.pausedLabels ?? []);
  if (!ctx.trialFoodCompleteness.complete) {
    return {
      title: 'The trial food’s ingredients haven’t been read',
      body:
        `${display(proteinPhrase(sanctionedProteinsForTrial(ctx)))} is what it’s sold as, ` +
        'but nothing has read the ingredient panel — so anything else in it is still ' +
        'unknown. A photo of the panel would settle it.',
    };
  }
  return null;
}

/**
 * The card's "Antigen check paused" disclosure (B-598) — the owner-surface mirror
 * of `render.ts`'s report row. Driven by `TrialFacts.antigenArmDark` +
 * `antigenAttributionPaused` (the labels), the SAME two fields the report reads,
 * so the two surfaces cannot disagree about whether the arm is dark. That is the
 * one-record-two-answers class B-598 closes: the card used to re-derive this and
 * missed the membership gap the report showed.
 *
 * TWO VARIANTS, because the arm darkens two ways and only one has a food to name
 * (matching the report's own split): a `primary_diet` membership gap leaves the
 * label list empty, so the named sentence would have no subject. An empty
 * `pausedLabels` is that gap, NEVER "no pause" — the caller gates on the boolean
 * flag, and reaches this function only when the arm is genuinely dark.
 */
export function antigenPausedNote(pausedLabels: readonly string[]): {
  title: string;
  body: string;
} {
  const title = 'Protein checks are paused for this trial';
  const named = pausedLabels.filter((l) => l && l.trim().length > 0);
  if (named.length === 0) {
    // The membership gap — no diet was on the allowed list for part of the window,
    // so there is no food to name. "Still counts what was eaten" is the §5.3 fact
    // the vet report also carries: a dark arm costs ATTRIBUTION, not detection, so
    // the off-diet count is intact and only the protein names are missing.
    return {
      title,
      body:
        'For part of this trial there was no diet on the allowed list to check other ' +
        'foods against, so those proteins couldn’t be compared. Culprit still counts ' +
        'what was eaten — it just can’t name the proteins for that stretch.',
    };
  }
  const which = named.length === 1 ? `${named[0]} has` : 'Some of the trial foods have';
  const thatFood = named.length === 1 ? 'that food' : 'those foods';
  return {
    title,
    body:
      `${which} no protein Culprit recognises as a source, so it can’t tell which ` +
      `proteins belong to the trial diet and which don’t. Setting a main protein on ` +
      `${thatFood} would turn the checks back on.`,
  };
}

/**
 * The quiet "what this trial is built on" line for the diet-trial card.
 *
 * B8 mitigation. The trial's proteins are read from each `primary_diet` food's
 * `primary_protein` + captured array, and on an AI-extracted food that is a model
 * output with no completeness gate over it — a front-of-pack read of "Salmon &
 * Duck" can designate the wrong one, and every heads-up then states the inverse of
 * the real prescription with full confidence. We deliberately do NOT gate on
 * `ai_extraction_confidence.primary_protein`: most trial foods are entered
 * manually, where that field is null, so gating would disable the feature for the
 * majority in order to bound a minority error. The fix is disclosure — render the
 * assumption where the owner looks, so a wrong target is visible rather than
 * silently load-bearing.
 *
 * IT STATES THE TRIAL'S PROTEIN, NOT WHAT WE ARE WATCHING. An earlier cut read
 * "Checking other foods against duck", and the second adversarial pass broke it:
 * the check only sees foods with a captured protein set, which today is a small
 * minority of a real library, so the line advertised surveillance that mostly does
 * not happen — turning rule 1's principled silence into an implied "nothing
 * conflicts". That is reassurance-on-absence arriving as a FIX for
 * reassurance-on-absence. Naming the trial protein carries the same B8 disclosure
 * and claims no coverage at all.
 */
export function trialTargetLine(ctx: TrialProteinContext): string | null {
  const proteins = sanctionedProteinsForTrial(ctx);
  if (proteins.length === 0) return null;
  const label = proteins.length === 1 ? 'Trial protein' : 'Trial proteins';
  return `${label} · ${display(proteinPhrase(proteins))}`;
}

// ── The I/O layer ────────────────────────────────────────────────────────────

/**
 * Best-effort load of the pet's active-trial context: the trial row plus its
 * whole ALLOWED SET, both from the LOCAL MIRROR (B-417 PR 2, #453).
 *
 * The network read this used to do is gone. `diet_trials` was Supabase-only when
 * slice 4 shipped, so every surface here went blank in airplane mode; PR 2 gave
 * the table (and `diet_trial_foods`) a local mirror precisely so the wedge
 * surface survives offline, and reading Supabase here would have re-created the
 * dependency PR 2 removed from the widget on the same day.
 *
 * The degradation posture is unchanged and is what rule 1 requires: a missing or
 * partial context can only ever SUPPRESS a heads-up, never fabricate an
 * all-clear.
 *
 * TTL-cached per pet — this is called on a hot path (after every meal log) plus
 * on three screen mounts. A FAILED read is never cached, so a transient state
 * recovers on the next call.
 */
export const TRIAL_CONTEXT_TTL_MS = 5 * 60 * 1000;

interface CacheEntry { atMs: number; ctx: TrialProteinContext | null }
const contextCache = new Map<string, CacheEntry>();

/** Drop every memoized context. Wired into the sign-out wipe (lib/session.ts),
 *  because the cache holds account data in JS memory that clearLocalData never
 *  touches. NOT needed on a pet switch — the map is keyed by petId, so switching
 *  simply reads the other pet's entry. Also the test seam. */
export function clearTrialContextCache(): void {
  contextCache.clear();
}

/** Parse a `DATE` column ('YYYY-MM-DD') to LOCAL midnight ms. See startedAtMs. */
export function localMidnightMs(dateOnly: string): number {
  const [y, m, d] = dateOnly.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d).getTime();
}

/** Read one food's captured protein evidence out of the local cache. */
export async function readFoodProteinRecord(foodId: string): Promise<FoodProteinRecord | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    brand: string;
    product_name: string;
    proteins: string | null;
    ingredients_notes: string | null;
    ai_extraction_confidence: string | null;
  }>(
    `SELECT brand, product_name, proteins, ingredients_notes, ai_extraction_confidence
       FROM food_items_cache WHERE id = ?`,
    [foodId],
  );
  if (!row) return null;
  return {
    proteins: proteinsFromCacheText(row.proteins),
    ingredientsNotes: row.ingredients_notes,
    foodKey: foodIntakeKey(row.brand ?? '', row.product_name ?? ''),
    // The cache mirrors the jsonb column as its raw JSON text; a decode failure
    // reads as "no confidence recorded", which the D10 gate treats as unread.
    extractionConfidence: parseConfidence(row.ai_extraction_confidence),
  };
}

function parseConfidence(text: string | null): unknown {
  if (text == null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The active trial, from the mirror. `ORDER BY synced DESC` is the conflict
 *  rule, not a flourish — the local active index is deliberately non-unique, so
 *  a device can briefly hold its own losing offline row alongside the server's
 *  winner, and the row the SERVER accepted is the one every surface must agree
 *  on. Identical ordering to `ACTIVE_DIET_TRIAL_QUERY` and the card's own read. */
const ACTIVE_TRIAL_SQL = `
  SELECT id, started_at, ended_at, target_duration_days
    FROM diet_trials
   WHERE pet_id = ? AND status = 'active'
   ORDER BY synced DESC, started_at DESC, id
   LIMIT 1
`;

/** The allowed set, joined to the food cache for each row's protein evidence.
 *
 *  `deleted_at IS NULL` only — `allowed_until` is NOT filtered here, and that is
 *  the point of dated membership: the predicate resolves membership ON THE
 *  FEEDING'S DATE, so a food removed on day 30 must still be visible in order to
 *  permit the twenty-nine days it was allowed for. Filtering it out in SQL would
 *  retroactively re-score that history as off-diet — the exact inverse of the
 *  hazard migration 040's header describes, and just as invisible. */
const ALLOWED_SET_SQL = `
  SELECT tf.food_item_id, tf.role, tf.food_label, tf.allowed_from, tf.allowed_until,
         f.brand, f.product_name, f.primary_protein, f.proteins,
         f.ingredients_notes, f.ai_extraction_confidence
    FROM diet_trial_foods tf
    LEFT JOIN food_items_cache f ON f.id = tf.food_item_id
   WHERE tf.diet_trial_id = ? AND tf.deleted_at IS NULL
   ORDER BY tf.allowed_from, tf.id
`;

interface TrialRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  target_duration_days: number;
}

interface AllowedRow {
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  brand: string | null;
  product_name: string | null;
  primary_protein: string | null;
  proteins: string | null;
  ingredients_notes: string | null;
  ai_extraction_confidence: string | null;
}

// ── B-556: THIS FILE NO LONGER NARROWS `role` ITSELF ─────────────────────────
//
// It used to, and it read an unknown role as `primary_diet` on the argument that
// dropping the row would remove a food from the PERMIT set. That argument was
// half right — dropping IS the wrong direction — but it named the wrong
// alternative, and the other two consumers (`lib/dietTrialFacts.ts`,
// `generate-report/trial.ts`) had independently reached the opposite answer. One
// row, two client verdicts: the log-time flag and the card could disagree about
// what the trial diet even is.
//
// `narrowTrialFoodRole` is now the single narrower and it falls to
// `permitted_other`, which permits the food WITHOUT letting an unreadable value
// widen the sanctioned comparator (§5.5 D-A). The full reasoning is on that
// function; what matters HERE is the local consequence, which is the reason this
// change needed its own PR: a garbled row no longer counts toward `primaryCount`,
// so a trial whose only "primary" was unreadable now goes dark and DISCLOSES via
// `trialDietNote` rather than comparing every food in the library against a row
// nobody can read. That is the honest direction, and `trialDietNote` was taught
// to say so accurately — see the third branch there.
export async function loadTrialProteinContext(
  petId: string,
  opts?: { force?: boolean },
): Promise<TrialProteinContext | null> {
  const hit = contextCache.get(petId);
  if (!opts?.force && hit && Date.now() - hit.atMs < TRIAL_CONTEXT_TTL_MS) return hit.ctx;

  let trial: TrialRow | null = null;
  let rows: AllowedRow[] = [];
  try {
    const db = getDb();
    trial = await db.getFirstAsync<TrialRow>(ACTIVE_TRIAL_SQL, [petId]);
    if (trial) rows = await db.getAllAsync<AllowedRow>(ALLOWED_SET_SQL, [trial.id]);
  } catch (e) {
    // A local read failure is transient (the db may not be open yet on a cold
    // start). NOT cached — silence now, correct answer on the next call. Never
    // fabricates a "no trial" that would let a surface go quiet permanently.
    console.warn('[trialContaminant] trial read failed:', e);
    return null;
  }

  // ── B-422 DELIBERATELY DOES NOT GATE THIS, and a first cut did ─────────────
  //
  // The reasoning for gating it was that every consumer is a PRESENT-TENSE claim
  // about the pet. That is true of the log-time "this has chicken in it" flag and
  // false of the two that matter most here, which round 3 executed: from day 113
  // the owner's card silently lost C2's standing note ("The trial food also lists
  // chicken — a food that also lists chicken can keep the trial from giving a
  // clean answer") AND both B9 disclosures ("Culprit can't tell what this trial
  // is built on"), while the card kept rendering the trial and `generate-report`
  // kept printing `facts.contamination` off the same record.
  //
  // Those are standing facts about a TRIAL THE CARD STILL DISPLAYS, not claims
  // about the pet today — and B9 exists precisely so the most-unknown state does
  // not get the least disclosure. Deleting a disclosure from a surface that still
  // shows the thing being disclosed about is the same reassurance-direction error
  // the rest of B-422 exists to undo.
  //
  // The narrower question — should the LOG-TIME flag fire on a trial past its
  // effective end? — is real, and it is a Designer call about friction at the
  // moment of the event rather than a correctness one. Filed as B-595 rather than
  // answered by suppressing four other things on the way past.
  if (!trial) {
    contextCache.set(petId, { atMs: Date.now(), ctx: null });
    return null;
  }

  const allowedFoods: AllowedFood[] = rows.map((r) => ({
    foodItemId: r.food_item_id,
    // Null when the food row has not hydrated — the predicate then falls back to
    // the id, which is the only identity available in that state.
    foodKey:
      r.brand !== null || r.product_name !== null
        ? foodIntakeKey(r.brand ?? '', r.product_name ?? '')
        : null,
    label: r.food_label,
    role: narrowTrialFoodRole(r.role),
    allowedFrom: r.allowed_from,
    allowedUntil: r.allowed_until,
    primaryProtein: r.primary_protein,
    proteins: proteinsFromCacheText(r.proteins),
  }));

  const primaryRows = rows.filter((r) => narrowTrialFoodRole(r.role) === 'primary_diet');
  const resolvedPrimary = primaryRows.filter((r) => r.brand !== null || r.product_name !== null);

  const ctx: TrialProteinContext = {
    trialId: trial.id,
    petId,
    startedAtMs: localMidnightMs(trial.started_at),
    // `targetDurationDays` is carried so the log-time evaluators can ask
    // `isTrialRunning` (the B-595 gate). `buildTrialContext` deliberately IGNORES
    // it — the window bounds on `ended_at` only, never the effective end (see the
    // long note there). It reaches BELIEF, not the window.
    spec: {
      id: trial.id,
      startedAt: trial.started_at,
      endedAt: trial.ended_at,
      targetDurationDays: trial.target_duration_days,
    },
    allowedFoods,
    trialFoodLabel:
      primaryRows.map((r) => r.food_label).filter(Boolean).join(' + ') || null,
    primaryCount: primaryRows.length,
    primaryResolved: resolvedPrimary.length,
    // Compared against the RAW column, not against the narrowed value: the
    // narrower is total, so the only evidence that a value was unreadable is that
    // narrowing changed it.
    hasUnreadableRole: rows.some((r) => narrowTrialFoodRole(r.role) !== r.role),
    // THE GATE IS OVER EVERY PRIMARY FOOD, AND `every` IS LOAD-BEARING. On a
    // wet+dry trial, one read panel and one unread one means "anything else in it
    // is still unknown" is TRUE of the trial — claiming completeness off the read
    // half is the all-clear-on-an-unread-record D10 forbids. An empty primary set
    // is likewise incomplete, never complete-by-vacuity.
    trialFoodCompleteness: worstCompleteness(resolvedPrimary),
  };

  // MEMOIZE ONLY A SETTLED ANSWER. A trial whose allowed set or food rows have
  // not hydrated is a TRANSIENT state, not a fact: on a fresh install or a
  // re-login the `diet_trials` pull can land before `diet_trial_foods` or
  // `food_items_cache` do, and caching that for five minutes would silently
  // disable every check for the whole window. Treated like a failed read: answer
  // now, re-ask next time. (`ctx: null` — genuinely no active trial — IS a
  // settled answer and stays cached.)
  //
  // `allowedSetHydrated` is that exact settled-ness test, and the membership flag
  // reads the SAME predicate to decide "this food is really not on the list"
  // rather than "the list just hasn't loaded" — one definition, so the cache and
  // the flag can never disagree about whether the set is trustworthy.
  if (!allowedSetHydrated(ctx)) return ctx;

  contextCache.set(petId, { atMs: Date.now(), ctx });
  return ctx;
}

/** The LEAST complete provenance across the trial's primary foods. */
function worstCompleteness(rows: readonly AllowedRow[]): ProteinSetCompleteness {
  if (rows.length === 0) return { complete: false, provenance: 'no_panel_text' };
  let worst: ProteinSetCompleteness = { complete: true, provenance: 'panel_read' };
  for (const r of rows) {
    const c = proteinSetCompleteness(r.ingredients_notes, parseConfidence(r.ai_extraction_confidence));
    if (!c.complete) return c;
    worst = c;
  }
  return worst;
}


// ── Rule 3's ledger: which foods we have already told the owner about ────────
//
// Persisted (survives a restart; a 56-day trial outlives many app sessions) and
// keyed by TRIAL, so starting a new trial legitimately re-opens every food — a
// chicken treat that was fine under a salmon trial is news again under a duck
// one. Deliberately NOT a count of meals: see rule 3 in the header for the two
// ways that muted the feature outright.
//
// AsyncStorage rather than a SQLite table: this is device-local UI bookkeeping
// about what was DISPLAYED, not health data. It carries no clinical record — the
// exposure itself is in `meals`, and the standing fact is re-derived from
// `food_items` on every render of the food's detail screen — so losing it is at
// worst one repeated heads-up, and it must never sync or reach the vet report.
const HEADS_UP_KEY = 'nyx.trialHeadsUp.v1';

/** trialId → the food ids already flagged under it. */
type HeadsUpLedger = Record<string, string[]>;

/** Bound on how many trials the ledger remembers. A household runs one active
 *  trial per pet; 6 covers the multi-pet ceiling with headroom while still
 *  bounding unbounded growth over years of completed trials. */
const MAX_LEDGER_TRIALS = 6;

// In-memory mirror so the log path does not hit storage twice per meal. `null`
// means "not loaded yet", which is distinct from an empty ledger.
let headsUpLedger: HeadsUpLedger | null = null;

async function readHeadsUpLedger(): Promise<HeadsUpLedger> {
  if (headsUpLedger) return headsUpLedger;
  try {
    const raw = await AsyncStorage.getItem(HEADS_UP_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Tolerant: any malformed shape degrades to an empty ledger, which can only
    // cause ONE extra heads-up — never a suppressed one. That is the safe
    // direction for a decay/corruption path in a safety surface.
    headsUpLedger =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as HeadsUpLedger)
        : {};
  } catch {
    headsUpLedger = {};
  }
  return headsUpLedger;
}

/** Have we already shown a heads-up for this food under this trial? */
export async function hasFlaggedFoodInTrial(trialId: string, foodId: string): Promise<boolean> {
  const ledger = await readHeadsUpLedger();
  return Array.isArray(ledger[trialId]) && ledger[trialId].includes(foodId);
}

/** Record that we just showed one. Best-effort: a write failure re-shows the
 *  heads-up next time, which is the harmless direction. */
export async function recordFlaggedFoodInTrial(trialId: string, foodId: string): Promise<void> {
  const ledger = await readHeadsUpLedger();
  const existing = Array.isArray(ledger[trialId]) ? ledger[trialId] : [];
  if (existing.includes(foodId)) return;
  // MERGE, never replace. An earlier cut wrote `{ [trialId]: … }` to prune dead
  // trials, which silently dropped every OTHER trial's entries — and multi-pet
  // ships free (B-086), so two littermates on two elimination trials is routine:
  // each pet switch re-opened the other's flagged foods and defeated rule 3
  // outright. Over-firing is the safe direction, but rule 3 exists precisely to
  // stop the alarm fatigue C2 named. Pruning is kept by bounding the ledger to
  // the most recent few trials instead, which needs no lifecycle hook (and no
  // trial write path exists yet anyway — B-417 PR 1).
  const merged: HeadsUpLedger = { ...headsUpLedger, [trialId]: [...existing, foodId] };
  const keys = Object.keys(merged);
  headsUpLedger = keys.length <= MAX_LEDGER_TRIALS
    ? merged
    : Object.fromEntries(
        // Keep the just-touched trial plus the most recently added others.
        [trialId, ...keys.filter((k) => k !== trialId).slice(-(MAX_LEDGER_TRIALS - 1))]
          .map((k) => [k, merged[k]]),
      );
  try {
    await AsyncStorage.setItem(HEADS_UP_KEY, JSON.stringify(headsUpLedger));
  } catch (e) {
    console.warn('[trialContaminant] heads-up ledger write failed:', e);
  }
}

/** Wipe the ledger. Called from the sign-out teardown alongside the context
 *  cache — it is per-account bookkeeping and must not leak across a switch. */
export async function clearTrialHeadsUpLedger(): Promise<void> {
  headsUpLedger = null;
  try {
    await AsyncStorage.removeItem(HEADS_UP_KEY);
  } catch (e) {
    console.warn('[trialContaminant] heads-up ledger clear failed:', e);
  }
}

/** Test seam — reset the in-memory mirror without touching storage. */
export function resetHeadsUpLedgerCache(): void {
  headsUpLedger = null;
}

/**
 * The shared spine of the two log-time evaluators (app/log.tsx and the FAB
 * quick-log). Runs AFTER the meal is committed — the log itself is never gated,
 * delayed or made conditional on any of this (Principle 1). Everything it reads
 * is local except the cached trial row, so the cost is sub-millisecond warm.
 * Never throws into the log path.
 *
 * THE `isTrialRunning` GATE LIVES HERE, AT THE LOG-TIME CALL SITE — B-595, and
 * deliberately NOT in `loadTrialProteinContext` or the pure predicates. The
 * shared context still feeds the STANDING surfaces (the card's `trialDietNote`,
 * the food-detail note, the vet report), which MUST keep firing on a stale-active
 * trial the owner never ended — B-422's round 3 measured what gating the context
 * instead cost: the card silently dropped its contamination note and both B9
 * disclosures from a trial it still displayed. Only the moment-of-log heads-up is
 * friction Principle 1 says to drop once the trial is genuinely over, so only it
 * is gated. `foodContaminantFlag`'s OTHER call site — the food-capture add path —
 * is a different surface and is intentionally left ungated.
 *
 * Returns null — silence — for every uncertainty: no trial, a trial not genuinely
 * running, no known trial diet / unhydrated list, an unread panel, a meal outside
 * the window, a permitted food, the trial diet itself, or a repeat feeding.
 *
 * The window check lives INSIDE `classifyFeeding` (verdict `out_of_window`), so
 * this carries no date arithmetic of its own — one definition of "inside the
 * trial", the same the card and report use.
 */
async function evaluateLogTimeFlag<T extends { trialId: string; foodId: string }>(
  args: { petId: string; foodId: string; occurredAt: string },
  build: (ctx: TrialProteinContext, record: FoodProteinRecord) => T | null,
): Promise<T | null> {
  try {
    const ctx = await loadTrialProteinContext(args.petId);
    if (!ctx) return null;

    // B-595 / B-693 D3 — active trial only. `isTrialRunning` (target + grace, the
    // B-422 convention), never the raw `status` column: a trial stale-active since
    // March says nothing at the moment of a log. The context is already filtered
    // to `status = 'active'` in SQL, so an absent status here means "the query
    // established this is the active row", which `isTrialRunning` reads correctly.
    if (!isTrialRunning(ctx.spec, Date.now())) return null;

    const record = await readFoodProteinRecord(args.foodId);
    if (!record) return null;

    const flag = build(ctx, record);
    if (!flag) return null;

    // Rule 3's READ half only, and it is SHARED across both flag kinds: a food
    // already spoken for under this trial is not news again, whichever kind spoke
    // (a food cannot flip protein↔membership on one classification, and once told
    // the owner does not need telling twice). The WRITE is `noteTrialFlagShown`,
    // spent by the surface that actually displays it — see that function for why
    // they are split.
    if (await hasFlaggedFoodInTrial(ctx.trialId, args.foodId)) return null;
    return flag;
  } catch (e) {
    // A failure here must never surface to the owner or disturb the log — the
    // meal is already saved and the heads-up is strictly additive information.
    console.warn('[trialContaminant] log-time flag evaluation failed:', e);
    return null;
  }
}

/**
 * The rung-2 CONTENTS heads-up for the meal-entry paths: this food carries a
 * protein the trial diet does not. Now gated on `isTrialRunning` (B-595). Its
 * output is UNCHANGED in shape, so existing callers (app/log.tsx, the FAB,
 * store/momentStore) keep working without a widen — the membership flag ships as
 * its own evaluator (below) rather than widening this one, because these callers
 * spend the ledger budget the instant this returns and the card cannot yet render
 * a membership flag (PR 2 wires that atomically with the render).
 */
export function evaluateMealTrialFlag(args: {
  petId: string;
  foodId: string;
  occurredAt: string;
}): Promise<TrialContaminantFlag | null> {
  return evaluateLogTimeFlag(args, (ctx, record) =>
    foodContaminantFlag(ctx, args.foodId, record.proteins, record.foodKey, args.occurredAt),
  );
}

/**
 * The rung-3 MEMBERSHIP heads-up for the meal-entry paths (B-693): this food is
 * not on the trial's allowed list. Same spine, same `isTrialRunning` gate, same
 * SHARED ledger as the contents flag — `classifyFeeding` returns one verdict, so
 * exactly one of the two evaluators can return non-null for a given feeding, and
 * a repeat of the same food stays quiet under either.
 *
 * PR 2 MUST SPEND THE BUDGET ONLY AFTER THE FLAG IS ON SCREEN, mirroring the
 * contents caller's order in `app/log.tsx` (`applyTrialFlag`: `patchTrialFlag`
 * returns true → THEN `noteTrialFlagShown`). Recording before the card is shown
 * re-opens the "a suppressed heads-up consumed the budget for a heads-up that was
 * never given" defect (rule 3 in the header) at the call site — the read/write
 * split here only holds if the write happens at render time.
 *
 * PR 2 NEEDS ONE FLAG, NOT TWO EVALUATOR CALLS. A feeding is at most one kind, so
 * calling both this and `evaluateMealTrialFlag` reads the food record twice (an
 * uncached SELECT; the context read is TTL-cached and nearly free). Prefer reading
 * the context + food record ONCE and composing the two exported pure predicates
 * with rung-2 precedence — `foodContaminantFlag(...) ?? foodMembershipFlag(...)` —
 * behind the same `isTrialRunning` gate + ledger read this spine already applies.
 * That single-read composition is the clean PR-2 shape; a combined evaluator can
 * wrap it there, where a caller actually consumes the union.
 */
export function evaluateMealMembershipFlag(args: {
  petId: string;
  foodId: string;
  occurredAt: string;
}): Promise<TrialMembershipFlag | null> {
  return evaluateLogTimeFlag(args, (ctx, record) =>
    foodMembershipFlag(ctx, args.foodId, record.proteins, record.foodKey, args.occurredAt),
  );
}

/**
 * Spend rule 3's budget — call this ONLY from the surface that has actually put
 * the heads-up in front of the owner.
 *
 * THE READ AND THE WRITE ARE SPLIT ON PURPOSE, and the reason is a defect the
 * second adversarial pass reproduced. The first cut recorded inside the
 * evaluator, which was also wrapped in a 1200ms `Promise.race` so a cold,
 * slow-network evaluation could not delay the completion card. But a JS promise
 * is not cancellable: the losing inner kept running, computed the flag, found the
 * ledger empty and wrote it — while the caller had already shown a card with no
 * heads-up. Measured: `shown to owner: null | ledger says already-told: true`.
 * That food could then never fire again for the rest of the trial. It is verbatim
 * the "a suppressed heads-up consumed the budget for a heads-up that was never
 * given" failure that rule 3 was rewritten to eliminate — reintroduced by the
 * timeout added to fix a different problem.
 *
 * The timeout is gone (the callers no longer await this before showing the card,
 * so there is nothing to race), and the budget is now spent at the only moment we
 * can honestly say a heads-up was given: when it is rendered.
 *
 * Takes either log-time flag kind — the ledger is keyed by trial + food and is
 * kind-agnostic on purpose (rule 3 is one heads-up per food per trial, whichever
 * kind spoke). Typed structurally so a `TrialContaminantFlag`, a
 * `TrialMembershipFlag`, or the `LogTimeTrialFlag` union all satisfy it.
 */
export async function noteTrialFlagShown(flag: { trialId: string; foodId: string }): Promise<void> {
  await recordFlaggedFoodInTrial(flag.trialId, flag.foodId);
}
