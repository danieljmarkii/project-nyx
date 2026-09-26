// The trial's own screen, as a route (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md`
// §2 S1, §7): `app/trial/[pet]`, where `pet` is the trial's pet. The pet comes from the
// route and never from `activePet` (C-9), so the one parameter IS the subject. A helper,
// not a component, so it lives in `lib/`: a non-component export inside
// `components/trialScreen/` would be wrapped into a component by the flag-off guard's
// switch (`guards/trialScreenFlagOff.test.tsx`).

export const TRIAL_ROUTE_PREFIX = '/trial/';

/** The href a door pushes: `/trial/<petId>`, encoded. */
export function trialScreenHref(petId: string): string {
  return `${TRIAL_ROUTE_PREFIX}${encodeURIComponent(petId)}`;
}

/** The route's pet; null when it is missing or empty (a malformed deep link). Read as
 *  given: `useLocalSearchParams` has already decoded the value once, and a second decode
 *  would change an id holding a literal `%`. */
export function parseTrialRouteParams(params: { pet?: string | string[] }): { petId: string } | null {
  const raw = Array.isArray(params.pet) ? params.pet[0] : params.pet;
  return typeof raw === 'string' && raw.length > 0 ? { petId: raw } : null;
}
