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
// ── WHERE THIS SITS RELATIVE TO B-417 ────────────────────────────────────────
// B-417's chair recommendation (§4 C1, option c) is that its PR 5 will own ONE
// shared off-diet predicate in `lib/dietTrial.ts`, imported by the client,
// `generate-report` and `ask`, with B-351's flag becoming a CONSUMER of it. That
// module does not exist yet (B-417 PR 1 is the gate the whole track queues
// behind), and slice 4 is not blocked on it — B-417's own Dir. of Eng. note says
// so explicitly. So this module is deliberately NOT named `dietTrial.ts`: it is
// the PROTEIN arm only (does this food's captured set contain a protein the trial
// diet does not), which is a different question from B-417's FOOD arm (is this
// food on the trial diet at all). When PR 5 lands, this file is the arm it
// imports — not a fourth definition to reconcile. Tracked as B-438.
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
import { supabase } from './supabase';
import { getDb } from './db';
import { foodIntakeKey } from './food';
import {
  canonicalizeProtein,
  proteinSetCompleteness,
  proteinsFromCacheText,
  type ProteinSetCompleteness,
} from './protein';

// ── The pure predicate layer ─────────────────────────────────────────────────

/** Everything slice 4 needs to know about the pet's active trial. Assembled by
 *  loadTrialProteinContext below; every consumer takes it as an argument so the
 *  decision logic stays pure and testable. */
export interface TrialProteinContext {
  trialId: string;
  petId: string;
  /** Local-midnight ms of `diet_trials.started_at` (a DATE, not a timestamp).
   *  Local, because "the day the trial started" is the owner's calendar day, not
   *  a UTC instant — a UTC-midnight reading silently excludes the start-day
   *  breakfast of anyone east of Greenwich. */
  startedAtMs: number;
  /** The trial's food_item_id, or null if the trial was created without one
   *  (the column is nullable, and ON DELETE SET NULL can empty it later). */
  trialFoodId: string | null;
  /** Display name of the trial food, for copy. Null when unresolvable. */
  trialFoodLabel: string | null;
  /** Case-folded brand+product of the trial food — the library's own dedup key
   *  (`lib/food.foodIntakeKey`). Carried so rule 2's exclusion survives a
   *  DUPLICATE CAPTURE of the trial diet: `food-capture` mints a fresh uuid every
   *  time, so re-photographing the same bag (e.g. to finally capture the
   *  ingredient panel) creates a row whose id ≠ `trialFoodId` — and an id-only
   *  exclusion would then turn the trial diet's own contamination into exactly
   *  the per-feeding verdict B-417 C2 forbids. Null when unresolvable. */
  trialFoodKey: string | null;
  /** The canonical protein the trial diet is built on. NULL = unknown, which
   *  disables every check in this module (rule 1: silence, never an all-clear). */
  targetProtein: string | null;
  /** Did the trial food's row actually load? Distinguishes "the owner designated
   *  no main protein" from "we never saw the food" — two states that must not
   *  share a sentence (see trialDietNote). */
  trialFoodResolved: boolean;
  /** The trial food's own captured set, for shape ①. */
  trialFoodProteins: string[];
  /** D10 gate over the TRIAL FOOD's set — drives whether the trial card may say
   *  anything about what else is (or is not) in the trial diet. */
  trialFoodCompleteness: ProteinSetCompleteness;
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
 * The proteins in `foodProteins` that the trial diet does not include.
 *
 * The comparison is EXACT canonical-key equality, and that is load-bearing for
 * B-411's two deliberate non-resolutions. `poultry` is never folded into
 * `chicken` (it may be chicken OR turkey, and inventing a specific exposure is
 * the unsafe direction) and `chicken fat` is never folded into `chicken` (that
 * would invent a protein exposure out of a near-protein-free ingredient). Under
 * the "everything but the target" model here, both still surface — they are not
 * the target key, so they are off-trial — which means B-411's under-claim gap
 * does NOT open a hole in this check the way it would in an excluded-list model.
 * What it costs instead is precision in the copy: the owner is told the food has
 * `poultry`, not that it has chicken, which is exactly as much as we know.
 *
 * Order is preserved (prominence order, as captured) so the copy names the most
 * prominent off-trial protein first.
 */
export function offTrialProteins(
  foodProteins: readonly string[],
  targetProtein: string | null,
): string[] {
  if (!targetProtein) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of foodProteins) {
    const key = canonicalizeProtein(raw);
    if (key == null || key === targetProtein || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * The trial target: the trial food's OWNER-DESIGNATED `primary_protein`, and
 * deliberately NOT `proteins[0]`.
 *
 * They are the same value on every ordinary row (migration 039's contract), and
 * differ in exactly one case: when the owner CLEARS the main protein, slice 3
 * demotes the old main into the tail and writes a NULL primary — so `proteins[0]`
 * is then a protein the owner explicitly un-designated. Reading the target from
 * `proteins[0]` would resurrect that cleared designation and, worse, invert the
 * whole check: every OTHER protein — including the real trial protein — would be
 * reported as the contaminant. A null target disables the check (rule 1).
 */
export function resolveTargetProtein(primaryProtein: string | null | undefined): string | null {
  return canonicalizeProtein(primaryProtein);
}

/**
 * Shape ① — is the trial food ITSELF carrying off-trial proteins?
 *
 * Returns the off-trial keys in the trial diet, or [] when there are none OR the
 * question cannot be answered. Callers must not distinguish those two cases in
 * copy: `trialFoodCompleteness` on the context is what says whether "nothing else
 * in it" may be claimed at all.
 */
export function trialFoodContaminants(ctx: TrialProteinContext): string[] {
  return offTrialProteins(ctx.trialFoodProteins, ctx.targetProtein);
}

/** The heads-up a surface renders. Absence of one is never an all-clear. */
export interface TrialContaminantFlag {
  /** Off-trial canonical protein keys found in this food, prominence-ordered. */
  proteins: string[];
  /** The trial's target protein, for the "…trial should skip X" clause. */
  targetProtein: string;
  /** The trial and food this heads-up is about — carried so the surface that
   *  DISPLAYS it can spend rule 3's budget (noteTrialFlagShown) without having to
   *  re-derive which trial was live at evaluation time. */
  trialId: string;
  foodId: string;
}

/**
 * Shape ② — does a food that is NOT the trial diet carry off-trial proteins?
 *
 * The pure half of the log-time decision; the caller supplies the two facts this
 * cannot know (whether the meal falls inside the trial window, and whether this
 * is the first time the food has been fed inside it). Returns null for silence.
 */
/** A brand+product key is only an identity if it actually names something. */
function isUsableFoodKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && key.replace(/\u001F/g, '').trim().length > 0;
}

export function foodContaminantFlag(
  ctx: TrialProteinContext | null,
  foodId: string,
  foodProteins: readonly string[],
  /** Case-folded brand+product of THIS food, when the caller has it. Closes the
   *  duplicate-capture hole in rule 2 — see TrialProteinContext.trialFoodKey.
   *  Omitting it degrades to the id-only exclusion, which is the pre-existing
   *  behaviour, not a new hazard. */
  foodKey?: string | null,
): TrialContaminantFlag | null {
  if (!ctx || !ctx.targetProtein) return null;
  // Rule 2 — the trial diet's own contamination is a trial-level standing fact.
  // Matched on the id OR the library's dedup key, so a re-photographed bag of the
  // trial diet is still the trial diet.
  if (ctx.trialFoodId != null && foodId === ctx.trialFoodId) return null;
  // Both keys must be NON-EMPTY. foodIntakeKey('','') is the bare separator
  // '\u001F', and brand/product are NOT NULL but not non-empty — the confirm
  // step's "Looks right" has no non-empty guard — so two blank-named rows would
  // otherwise collide, and the second would be silently treated as the trial diet
  // and never flagged. That is the dangerous direction.
  if (isUsableFoodKey(ctx.trialFoodKey) && isUsableFoodKey(foodKey) && foodKey === ctx.trialFoodKey) {
    return null;
  }
  const proteins = offTrialProteins(foodProteins, ctx.targetProtein);
  if (proteins.length === 0) return null;
  return { proteins, targetProtein: ctx.targetProtein, trialId: ctx.trialId, foodId };
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

/** "chicken" · "chicken and salmon" · "chicken, salmon and beef". */
export function proteinList(keys: readonly string[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}

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
      `${petName}'s ${flag.targetProtein} trial should skip ${proteinList(flag.proteins)}. ` +
      `The meal's saved — just worth knowing, and maybe a note for your vet.`,
  };
}

/**
 * The add-to-library soft confirm (mock §2, top).
 *
 * ONE DELIBERATE DEVIATION FROM THE MOCK. The mock reads "Nyx's elimination trial
 * is on duck"; this says "trial diet". `diet_trials` carries no indication column
 * (D6 deferred the schema change), so the app cannot know a trial is an
 * elimination trial rather than a GI or hydrolysed one — and asserting a trial
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
      `${petName}'s trial diet is ${flag.targetProtein}. The ${list} in here could keep ` +
      `the trial from giving a clean answer. Worth a word with your vet before you feed it.`,
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
    title: `Off ${petName}'s trial diet`,
    body:
      `This food lists ${list}, and the trial diet is ${flag.targetProtein}. ` +
      `Worth a note for your vet.`,
  };
}

/**
 * The diet-trial card's standing note about the TRIAL DIET ITSELF (shape ①,
 * B-417 C2's "computed once per trial, surfaced on the card").
 *
 * Two states, and the second is the one D10 exists for: when the trial food's
 * ingredient panel was never read, the card says so rather than leaving the
 * owner to read the absence of a flag as an all-clear on the single food their
 * pet eats every day for eight weeks. Returns null only when there is genuinely
 * something to say AND nothing worth saying — i.e. the panel WAS read and it is
 * single-protein.
 */
export function trialDietNote(ctx: TrialProteinContext): { title: string; body: string } | null {
  // B9 — the MOST unknown state must not get the LEAST disclosure. An unknown
  // target silently disables every check in this module, and an earlier cut
  // returned null here: the trial card said nothing, no flag ever fired, and
  // nothing anywhere told the owner the check was off. That is worse than the
  // panel-unread case below, which does get a note — the owner was being given
  // strictly less information the less we knew. It is reachable two ways: a
  // hydrolysed trial diet with no animal protein designated, and slice 3's
  // "clear the main protein", which is precisely the case rule 4 exists for.
  if (!ctx.targetProtein) {
    // TWO DIFFERENT STATES, TWO DIFFERENT SENTENCES. An earlier cut collapsed them
    // and asserted "the trial food has no main protein set" about a food it had
    // never read — reachable whenever the trial row fetched but `food_items_cache`
    // had not hydrated, and again when `food_item_id` is NULL (the column is
    // nullable; ON DELETE SET NULL empties it). The owner who followed the
    // instruction opened the food and found a main protein sitting there, i.e. the
    // app contradicting itself. Not reassurance, but an unproven assertion about
    // the record on a clinical surface — the class B9 was written to correct.
    if (!ctx.trialFoodResolved) {
      return {
        title: 'Nyx can\'t check other foods against this trial yet',
        body: ctx.trialFoodId
          ? 'The trial food hasn\'t loaded on this device yet, so there\'s nothing to '
            + 'compare against. This usually settles once everything syncs.'
          : 'This trial has no food attached, so there\'s nothing to compare other '
            + 'foods against.',
      };
    }
    return {
      title: 'Nyx can\'t tell what this trial is built on',
      body:
        'The trial food has no main protein set, so other foods can\'t be checked ' +
        'against it. Setting one on the food would turn the checks back on.',
    };
  }
  const contaminants = trialFoodContaminants(ctx);
  if (contaminants.length > 0) {
    const list = proteinList(contaminants);
    return {
      title: `The trial food also lists ${list}`,
      body:
        `A ${ctx.targetProtein} food that also lists ${list} can keep the trial from ` +
        `giving a clean answer. Worth raising with your vet.`,
    };
  }
  if (!ctx.trialFoodCompleteness.complete) {
    return {
      title: 'The trial food\'s ingredients haven\'t been read',
      body:
        `${display(ctx.targetProtein)} is what it's sold as, but nothing has read the ` +
        `ingredient panel — so anything else in it is still unknown. A photo of the ` +
        `panel would settle it.`,
    };
  }
  return null;
}

/**
 * The quiet "what this trial is built on" line for the diet-trial card.
 *
 * B8 mitigation. The target protein is read from the trial food's
 * `primary_protein`, which on an AI-extracted food is a model output with no
 * completeness gate over it — a front-of-pack read of "Salmon & Duck" can
 * designate the wrong one, and every heads-up then states the inverse of the real
 * prescription with full confidence. We deliberately do NOT gate the target on
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
  if (!ctx.targetProtein) return null;
  return `Trial protein · ${display(ctx.targetProtein)}`;
}

// ── The I/O layer ────────────────────────────────────────────────────────────

/**
 * Best-effort load of the pet's active-trial protein context.
 *
 * `diet_trials` has NO local mirror — it is Supabase-only, the same posture as
 * `hooks/useTrend`, the profile card and `lib/widgetSnapshot`. So offline this
 * returns null and every surface goes quiet, which is the correct degradation
 * under rule 1: a missing trial context can only ever SUPPRESS a heads-up, never
 * fabricate an all-clear. (A local mirror is B-417 PR 2's job; when it lands,
 * this function's body is the thing that changes, not its contract.)
 *
 * TTL-cached per pet. The trial row changes about once a month, and this is
 * called on a hot path (after every meal log) plus on two screen mounts — so a
 * network round-trip per call would be pure waste. A FAILED fetch is never
 * cached, so offline → online recovers on the next call. Mirrors
 * lib/widgetSnapshot's fetchActiveTrials, deliberately: same data, same posture.
 */
export const TRIAL_CONTEXT_TTL_MS = 5 * 60 * 1000;

interface TrialRow { id: string; started_at: string; food_item_id: string | null }
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

export async function loadTrialProteinContext(
  petId: string,
  opts?: { force?: boolean },
): Promise<TrialProteinContext | null> {
  const hit = contextCache.get(petId);
  if (!opts?.force && hit && Date.now() - hit.atMs < TRIAL_CONTEXT_TTL_MS) return hit.ctx;

  let trial: TrialRow | null = null;
  try {
    const { data, error } = await supabase
      .from('diet_trials')
      .select('id, started_at, food_item_id')
      .eq('pet_id', petId)
      .eq('status', 'active')
      .limit(1);
    if (error) throw error;
    // One active trial per pet is the product model; if the data ever holds two,
    // first wins (deterministic — PostgREST returns a stable order per query).
    trial = ((data ?? []) as unknown as TrialRow[])[0] ?? null;
  } catch (e) {
    // Offline or transient. NOT cached — silence now, correct answer on the next
    // call. Never fabricates a "no trial" that would let a surface go quiet
    // permanently.
    console.warn('[trialContaminant] trial fetch failed (offline?):', e);
    return null;
  }

  if (!trial) {
    contextCache.set(petId, { atMs: Date.now(), ctx: null });
    return null;
  }

  let ctx: TrialProteinContext = {
    trialId: trial.id,
    petId,
    startedAtMs: localMidnightMs(trial.started_at),
    trialFoodId: trial.food_item_id,
    trialFoodLabel: null,
    trialFoodKey: null,
    targetProtein: null,
    trialFoodResolved: false,
    trialFoodProteins: [],
    trialFoodCompleteness: { complete: false, provenance: 'no_panel_text' },
  };

  // Whether the trial food actually RESOLVED. Drives the memoization decision
  // below — see the note there; this is not the same question as "is there a
  // trial".
  let trialFoodResolved = false;

  if (trial.food_item_id) {
    try {
      const db = getDb();
      const food = await db.getFirstAsync<{
        brand: string;
        product_name: string;
        primary_protein: string | null;
        proteins: string | null;
        ingredients_notes: string | null;
        ai_extraction_confidence: string | null;
      }>(
        `SELECT brand, product_name, primary_protein, proteins, ingredients_notes,
                ai_extraction_confidence
           FROM food_items_cache WHERE id = ?`,
        [trial.food_item_id],
      );
      if (food) {
        trialFoodResolved = true;
        ctx = {
          ...ctx,
          trialFoodResolved: true,
          trialFoodLabel: `${food.brand} ${food.product_name}`.trim() || null,
          trialFoodKey: foodIntakeKey(food.brand, food.product_name),
          targetProtein: resolveTargetProtein(food.primary_protein),
          trialFoodProteins: proteinsFromCacheText(food.proteins),
          trialFoodCompleteness: proteinSetCompleteness(
            food.ingredients_notes,
            parseConfidence(food.ai_extraction_confidence),
          ),
        };
      }
    } catch (e) {
      // A cache miss leaves targetProtein null, which disables every check.
      console.warn('[trialContaminant] trial food read failed:', e);
    }
  }

  // MEMOIZE ONLY A SETTLED ANSWER. A trial whose food row did not resolve is a
  // TRANSIENT state, not a fact: on a fresh install or a re-login the
  // `diet_trials` fetch can succeed while `food_items_cache` has not hydrated
  // yet, and caching that for five minutes would silently disable every check
  // for the whole window — with, under the earlier meal-count gate, each meal
  // logged in it permanently burning that food's heads-up. Treated like a failed
  // fetch: answer now, re-ask next time. (`ctx: null` — genuinely no active
  // trial — IS a settled answer and stays cached.)
  if (trial.food_item_id && !trialFoodResolved) return ctx;

  contextCache.set(petId, { atMs: Date.now(), ctx });
  return ctx;
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
 * The full log-time decision, for the meal-entry paths (app/log.tsx and the FAB
 * quick-log). Runs AFTER the meal is committed — the log itself is never gated,
 * delayed or made conditional on any of this (Principle 1). Everything it reads
 * is local except the cached trial row, so the cost is sub-millisecond in the
 * warm case.
 *
 * Returns null — silence — for every uncertainty: no trial, no target protein,
 * offline, an unread panel, a meal backdated before the trial started, the trial
 * diet itself, or a repeat feeding. Never throws into the log path.
 */
export async function evaluateMealTrialFlag(args: {
  petId: string;
  foodId: string;
  occurredAt: string;
}): Promise<TrialContaminantFlag | null> {
  try {
    const ctx = await loadTrialProteinContext(args.petId);
    if (!ctx || !ctx.targetProtein || Number.isNaN(ctx.startedAtMs)) return null;
    // A meal backdated to before the trial began is not a trial contaminant.
    if (new Date(args.occurredAt).getTime() < ctx.startedAtMs) return null;

    const record = await readFoodProteinRecord(args.foodId);
    if (!record) return null;

    const flag = foodContaminantFlag(ctx, args.foodId, record.proteins, record.foodKey);
    if (!flag) return null;

    // Rule 3's READ half only. The WRITE is noteTrialFlagShown, called by the
    // surface that actually displays it — see that function for why they are
    // split.
    if (await hasFlaggedFoodInTrial(ctx.trialId, args.foodId)) return null;
    return flag;
  } catch (e) {
    // A failure here must never surface to the owner or disturb the log — the
    // meal is already saved and the heads-up is strictly additive information.
    console.warn('[trialContaminant] meal flag evaluation failed:', e);
    return null;
  }
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
 */
export async function noteTrialFlagShown(flag: TrialContaminantFlag): Promise<void> {
  await recordFlaggedFoodInTrial(flag.trialId, flag.foodId);
}
