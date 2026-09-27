// The pet a vet report is about — CUL-1334.
//
// `/report` takes a `?pet=` param so a door can name the pet whose report it opens (the
// trial screen, Get ready), whichever pet is selected. A door that sends no param is
// scoped to the active pet (the Pet tab, the plain rundown), so an absent param falls
// back to the active pet and every such door lands exactly where it always did. The
// same rule, and the same answer for a stale link, as the trial list screens' `?pet=`
// (TS-1, `hooks/useTrialRoutePet.ts`).
//
// The fallback is ONLY for an absent param. A param naming a pet the account does not
// hold (a stale link, an archived pet, another account's id) never falls back to the
// active pet: that would build one animal's report under a door for another (C-9). It
// resolves to `unknown_pet`, and the screen says the pet is gone instead of calling
// the generator. (The server would refuse another account's pet anyway — `generate-
// report` reads through the caller's RLS and 404s a pet it cannot see — but an owned
// ARCHIVED pet would build, so the client's refusal is the rule, not a courtesy.)

/** The line for a `?pet=` the account does not hold. The trial list screens' own words
 *  (`TRIAL_ROUTE_PET_GONE`, lib/trialFoodsScreen.ts), for the same fact; held here
 *  rather than imported because that module's closure reaches the Supabase client, and
 *  pinned equal to it by lib/reportRoute.test.ts so the two cannot drift. */
export const REPORT_PET_GONE = 'This pet isn’t in your account any more.';

/** The route a door pushes for a named pet's report. */
export function reportHref(petId: string): { pathname: '/report'; params: { pet: string } } {
  return { pathname: '/report', params: { pet: petId } };
}

export type ReportSubject =
  /** The pet the report is built for, and its name for copy (null when blank). */
  | { kind: 'pet'; petId: string; petName: string | null }
  /** A `?pet=` the account does not hold (non-archived). Never falls back. */
  | { kind: 'unknown_pet' }
  /** No param and no active pet: the account has no pet to report on. */
  | { kind: 'no_pet' };

interface PetLike {
  id: string;
  name: string | null | undefined;
}

function nameOf(pet: PetLike | undefined | null): string | null {
  return pet?.name?.trim() || null;
}

/**
 * Whose report `/report` builds. `param` is the route's `pet` as expo-router hands it: a
 * repeated param takes the first, and a blank one is no param (`trialRoutePetId`'s rule,
 * mirrored because it answers the same question — which pet did the door name).
 * `pets` is the store's list, which holds only non-archived pets.
 */
export function resolveReportSubject(
  param: string | string[] | undefined,
  activePet: PetLike | null,
  pets: readonly PetLike[],
): ReportSubject {
  const raw = Array.isArray(param) ? param[0] : param;
  const named = raw?.trim();
  if (!named) {
    // No door named a pet: the active pet is the subject (every door that predates
    // CUL-1334 sends nothing and is active-pet scoped).
    return activePet ? { kind: 'pet', petId: activePet.id, petName: nameOf(activePet) } : { kind: 'no_pet' };
  }
  const held = pets.find((p) => p.id === named);
  return held ? { kind: 'pet', petId: held.id, petName: nameOf(held) } : { kind: 'unknown_pet' };
}
