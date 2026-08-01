// The allowed set, as the LIBRARY reads it — B-616 PR 1 (spec §3, §6).
// Requirements: docs/nyx-food-library-trial-awareness-requirements.md.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// Four surfaces are about to render `diet_trial_foods` membership: the Foods-tab
// chips (FR-2), the food-detail row (FR-13), the picker's pinned section (FR-16)
// and the allowed-set screen itself (FR-6). Every one of them asks the same
// question the classifier asks at rung 1 — "is this food on the list on this
// day" — and the whole hazard of this track is that they might answer it
// differently.
//
// So this module reads, and does not decide. The resolution is
// `allowedMembershipOn` in `lib/dietTrial.ts`, exported by this PR for exactly
// this reason; nothing here re-derives membership, and `trialAllowedSet.test.ts`
// pins that with a property test over a cross-product of foods and days: a
// disagreement with `classifyFeeding` fails the build. R2 made executable.
//
// ── THE THREE STATES, AND WHY `unknown` IS NOT `no_trial` ────────────────────
//
// A read that could not answer and a pet with no trial running are different
// facts, and collapsing them is how a surface starts guessing. `unknown` means
// RENDER NOTHING (R2) — no strip, no chips, no row, no pinned section. It is not
// a neutral fallback dressed as one:
//
//   • an empty allowed set on a live trial marks nothing on-list, so the Foods
//     tab silently stops naming the prescribed diet while the owner is standing
//     in front of it;
//   • and the FR-1 strip would print "0 foods on the trial list", which is a
//     claim about the record rather than an absence of one.
//
// Both directions land on the app saying something it does not know, which is
// the same shape as `dietTrialFacts`' null-not-empty rule one layer down.
//
// ── `isTrialRunning`, NEVER RAW `status` (B-422) ─────────────────────────────
//
// Nothing auto-completes a trial and the §4.3 milestone needs an owner tap, so
// `status = 'active'` is the steady state of a stale trial, not evidence that a
// pet is on a diet today. Every surface in this track is present-tense chrome
// about a trial the owner is living with RIGHT NOW — a chip that says "Trial
// diet" on a trial that ended in March is a false present-tense claim on a
// clinical surface, and FR-4 requires the chrome to disappear on its own. So the
// SQL selects on `status` (that is what the one-active-trial index is about) and
// belief is gated by `isTrialRunning`.
//
// This is the BELIEF side of B-422's split, which is the side the grace is for.
// No denominator, no evidence window, and no history is bounded here — the
// allowed-set screen renders dated membership facts for the whole trial, and
// `allowedFrom` on a returned row is the row's own column, untouched.
import { getDb } from './db';
import {
  allowedMembershipOn,
  buildTrialContext,
  allowedFoodsOn,
  isTrialRunning,
  isUsableFoodKey,
  narrowTrialFoodRole,
  trialFoodKey,
  type AllowedFood,
  type TrialContext,
  type TrialFoodRole,
} from './dietTrial';
import { proteinsFromCacheText } from './protein';
import { localDayIndex } from './utils';

/** The running trial this set belongs to, in the shape the strip (FR-1) and the
 *  add sheet (FR-11) need. `targetDurationDays` is carried rather than a day
 *  counter: day math has ONE home (`getDietTrialProgress`, B-421) and a second
 *  copy computed here is how two surfaces end up a day apart. */
export interface TrialAllowedSetTrial {
  id: string;
  startedAt: string;
  targetDurationDays: number;
  endedAt: string | null;
}

export interface TrialAllowedSetReady {
  status: 'ready';
  trial: TrialAllowedSetTrial;
  /** The predicate's context. Carried so every lookup below resolves through the
   *  same object `classifyFeeding` would be handed. */
  ctx: TrialContext;
  /** EVERY non-deleted row of the trial's allowed set — deliberately not
   *  filtered to today. Membership is dated and the §2.2 screen renders the
   *  dates; filtering here would re-scope history at the read, which is the
   *  mistake `ALLOWED_SET_SQL`'s own comment warns about one layer down. */
  foods: readonly AllowedFood[];
}

/** `unknown` → render nothing (R2). `no_trial` → render nothing either, but for
 *  a reason the caller may legitimately act on (FR-4's clean disappearance). */
export type TrialAllowedSet =
  | { status: 'unknown' }
  | { status: 'no_trial' }
  | TrialAllowedSetReady;

export const UNKNOWN_ALLOWED_SET: TrialAllowedSet = { status: 'unknown' };

/** What a surface renders for a food that IS on the list. Null is the only other
 *  answer — there is no "not on the list" value, because D2 is positive marking
 *  only and a mark's absence is never a verdict (G2, two-sided). */
export interface TrialListMembership {
  role: TrialFoodRole;
  /** `diet_trial_foods.allowed_from` — the row's own column, for FR-6's dated
   *  fact and the "added <date>" reading of a mid-trial add. */
  allowedFrom: string;
  /** The write-time label, which outlives the food row (§3.2). */
  label: string;
  /** Which arm of the §5.4 identity matched. Carried for the same reason
   *  `FeedingClassification` carries it: a membership the owner cannot
   *  interrogate is not much better than a guess. */
  matchedBy: 'food_id' | 'food_key';
}

/** A food as the LIBRARY holds it — the picker tile, the detail screen, a row of
 *  `food_items_cache`. Both identity arms are optional because a caller may hold
 *  either: the id alone (a tile), or brand+product alone (a re-photographed bag
 *  whose id the list has never seen). */
export interface TrialListFood {
  id?: string | null;
  brand?: string | null;
  productName?: string | null;
}

/** §5.4's key, or null when the caller holds no name at all — null, not the bare
 *  separator, so two unnamed foods cannot collide onto each other (the
 *  `isUsableFoodKey` hole, closed at the source). */
function keyOf(food: TrialListFood): string | null {
  return food.brand != null || food.productName != null
    ? trialFoodKey(food.brand ?? null, food.productName ?? null)
    : null;
}

/**
 * IS THIS FOOD ON THE LIST — the one question this module exists to answer.
 *
 * Resolves through `allowedMembershipOn`, i.e. through rung 1 itself. A caller
 * that wants "and is it in the trial window" wants `classifyFeeding`; this is
 * the library's question, not the record's.
 *
 * `atMs` defaults to now because every FR here is present-tense. The parameter
 * exists so the §2.2 screen can render a past day's membership and so the
 * property test can sweep dates.
 */
export function trialListMembership(
  set: TrialAllowedSet,
  food: TrialListFood,
  atMs: number = Date.now(),
): TrialListMembership | null {
  if (set.status !== 'ready') return null;
  // B-421: the shared local-day index, never an epoch-day division. The context
  // carries no `timeZone` on the client — the device's own zone IS the owner's
  // midnight — and passing it here keeps this honest if an Edge Function ever
  // reuses the shape.
  const dayIndex = localDayIndex(atMs, set.ctx.timeZone);
  const hit = allowedMembershipOn(set.ctx, dayIndex, {
    foodItemId: food.id ?? null,
    foodKey: keyOf(food),
  });
  if (!hit) return null;
  return {
    role: hit.food.role,
    allowedFrom: hit.food.allowedFrom,
    label: hit.food.label,
    matchedBy: hit.matchedBy,
  };
}

/** The boolean form, for a chip's render gate. */
export function isOnTrialList(
  set: TrialAllowedSet,
  food: TrialListFood,
  atMs: number = Date.now(),
): boolean {
  return trialListMembership(set, food, atMs) !== null;
}

/**
 * The rows in force on a day — the picker's pinned section (FR-16), the §2.2
 * groups (FR-6) and the strip's count (FR-1).
 *
 * DEDUPED BY IDENTITY, and that is not tidiness. `addTrialFood` writes a row
 * without asking whether the food is already on the list (the caller filters,
 * and a caller that does not is a UI bug, not a data hazard) — so a food added
 * twice would otherwise render twice in the list a vet is told about, and
 * inflate "K foods on the trial list".
 *
 * ── B-624: THE ROW THE PREDICATE WOULD PICK, NOT THE FIRST ONE ───────────────
 *
 * PR 1 kept the first row of each group and called that "matching `matchAllowed`'s
 * own `find`". It is not the same thing, and the difference is a DATE — which is
 * load-bearing copy on this screen, because D5 renders it as "added {date}, day N"
 * and the whole no-amnesty promise rests on it. Two failures came out of the gap:
 *
 *   • the identity was `foodKey ?? foodItemId`, which skips the `isUsableFoodKey`
 *     test the predicate applies — so two blank-named rows, which `matchAllowed`
 *     treats as two distinct foods, collapsed into one and a sanctioned food fell
 *     off the list entirely;
 *   • and the group's representative was taken positionally rather than resolved,
 *     so the fact rendered here was never actually the predicate's answer.
 *
 * Both are fixed by asking `allowedMembershipOn` — the one rung-1 call — for every
 * row that survives the grouping, and rendering what it returns. This is R2 applied
 * to the dated fact rather than only to the yes/no: the §2.2 list and the food
 * detail row (FR-13, which queries by the food's own id) now resolve through the
 * same function, so they cannot print two different "on the list since" dates for
 * a food the owner is looking at from two directions.
 *
 * The residual B-624 named and this does NOT close: with two rows carrying the
 * same key but different `food_item_id`, the predicate's answer genuinely depends
 * on WHICH id is asked about, so a duplicate arriving from another device can
 * still make detail-by-id disagree with the list's chosen representative. That is
 * a property of `matchAllowed`'s id-before-key order, not of this function, and
 * narrowing it belongs with the predicate.
 */
export function trialListFoodsOn(
  set: TrialAllowedSet,
  atMs: number = Date.now(),
): AllowedFood[] {
  if (set.status !== 'ready') return [];
  const dayIndex = localDayIndex(atMs, set.ctx.timeZone);
  const inForce = allowedFoodsOn(set.ctx, dayIndex);
  const seen = new Set<string>();
  const out: AllowedFood[] = [];
  for (const f of inForce) {
    // The identity `matchAllowed` resolves on: the key when it names something,
    // the id otherwise — so a re-photographed bag (new id, same key) does not read
    // as a second food, and two unnamed rows do not read as one.
    const identity = isUsableFoodKey(f.foodKey) ? f.foodKey : f.foodItemId;
    if (seen.has(identity)) continue;
    seen.add(identity);
    // Rung 1, asked rather than assumed. `f` itself is the fallback only because a
    // row drawn FROM the in-force set can always answer for itself; the `??` is a
    // type narrowing, not a guess.
    const hit = allowedMembershipOn(set.ctx, dayIndex, {
      foodItemId: f.foodItemId,
      foodKey: f.foodKey,
    });
    out.push(hit?.food ?? f);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// The read
// ════════════════════════════════════════════════════════════════════════════

/** The candidate trial. `status = 'active'` is the SELECTOR (it is what the
 *  one-active-trial index is about); `isTrialRunning` is the BELIEF gate applied
 *  to whatever comes back. `synced DESC` is the same conflict rule every other
 *  trial read carries — the local active index is deliberately non-unique, so a
 *  device can briefly hold its own losing offline row beside the server's
 *  winner, and the row the server accepted is the one every surface agrees on. */
export const RUNNING_TRIAL_SQL = `
  SELECT id, started_at, ended_at, target_duration_days, status
    FROM diet_trials
   WHERE pet_id = ? AND status = 'active'
   ORDER BY synced DESC, started_at DESC, id
   LIMIT 1
`;

/** The trial's allowed set, joined to the food cache for each row's identity.
 *
 *  `deleted_at IS NULL` only. `allowed_until` is NOT filtered, for the reason
 *  every other reader of this table states: membership resolves ON A DATE, so a
 *  food removed on day 30 must stay visible to answer for the twenty-nine days
 *  it was in force. Filtering it in SQL would re-write history at the read. */
export const TRIAL_ALLOWED_SET_SQL = `
  SELECT tf.food_item_id, tf.role, tf.food_label, tf.allowed_from, tf.allowed_until,
         f.brand, f.product_name, f.primary_protein, f.proteins
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
  status: string;
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
}

/**
 * Resolve the pet's running trial and its dated allowed set from the LOCAL
 * mirror. Never the network: the Foods tab works in a basement flat, and this
 * read runs on every render of it.
 *
 * THE FOUR OUTCOMES, and the one that is easy to get wrong:
 *
 *   • read threw            → `unknown` (transient — the db may not be open yet
 *                             on a cold start; ask again next tick).
 *   • no active row         → `no_trial`.
 *   • row not running       → `no_trial` (B-422: a stale active trial is not a
 *                             trial the owner is on today, and FR-4's chrome
 *                             must go).
 *   • row running, 0 foods  → `unknown`, NOT a ready-and-empty set. A trial is
 *                             written with its allowed set in ONE transaction
 *                             (`startDietTrial`), so a live trial with no rows
 *                             is not a trial with nothing permitted — it is
 *                             `diet_trials` having hydrated before
 *                             `diet_trial_foods` did, which is a real state on a
 *                             fresh install or a re-login. Rendering it as an
 *                             empty list would un-mark the prescribed diet on
 *                             the Foods tab and print "0 foods on the trial
 *                             list" under the header. §5 edge 5.
 */
export async function loadTrialAllowedSet(
  petId: string,
  nowMs: number = Date.now(),
): Promise<TrialAllowedSet> {
  let trial: TrialRow | null = null;
  let rows: AllowedRow[] = [];
  try {
    const db = getDb();
    trial = await db.getFirstAsync<TrialRow>(RUNNING_TRIAL_SQL, [petId]);
    if (trial) rows = await db.getAllAsync<AllowedRow>(TRIAL_ALLOWED_SET_SQL, [trial.id]);
  } catch (e) {
    // Never a fabricated "no trial": that would let every surface here go quiet
    // permanently on one transient failure, and a quiet surface looks identical
    // to a correct one.
    console.error('[trialAllowedSet] read failed:', e);
    return { status: 'unknown' };
  }

  if (!trial) return { status: 'no_trial' };

  const spec = {
    id: trial.id,
    startedAt: trial.started_at,
    // The DECLARED end only — the B-422 effective end is derived by
    // `isTrialRunning` from `targetDurationDays` and never stuffed in here.
    endedAt: trial.ended_at,
    targetDurationDays: trial.target_duration_days,
  };
  if (!isTrialRunning({ ...spec, status: trial.status }, nowMs)) return { status: 'no_trial' };

  if (rows.length === 0) return { status: 'unknown' };

  const foods: AllowedFood[] = rows.map((r) => ({
    foodItemId: r.food_item_id,
    // Null — not a blank key — when the food row has not hydrated, so membership
    // falls back to the id rather than colliding on the bare separator.
    foodKey:
      r.brand !== null || r.product_name !== null ? trialFoodKey(r.brand, r.product_name) : null,
    label: r.food_label,
    // B-556's single narrower. Never re-implemented here: an unknown role that
    // read as `primary_diet` would widen the sanctioned comparator, which is the
    // one direction §5.5 D-A forbids.
    role: narrowTrialFoodRole(r.role),
    allowedFrom: r.allowed_from,
    allowedUntil: r.allowed_until,
    primaryProtein: r.primary_protein,
    proteins: proteinsFromCacheText(r.proteins),
  }));

  return {
    status: 'ready',
    trial: {
      id: trial.id,
      startedAt: trial.started_at,
      targetDurationDays: trial.target_duration_days,
      endedAt: trial.ended_at,
    },
    // No `timeZone`: the device's own zone is the owner's midnight (B-421).
    ctx: buildTrialContext(spec, foods),
    foods,
  };
}
