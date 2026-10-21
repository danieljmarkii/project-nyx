// The trial's own screen, as a route (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md`
// §2 S1, §7): `app/trial/[pet]`, where `pet` is the trial's pet. The pet comes from the
// route and never from `activePet` (C-9), so the one parameter IS the subject. A helper,
// not a component, so it lives in `lib/` beside the other route builders.

export const TRIAL_ROUTE_PREFIX = '/trial/';

/** What the screen opens on arrival. `end` is the meal card's "+ End the trial" door
 *  (CUL-2084): the screen's own completion sheet, so ending a trial keeps one path. */
export type TrialRouteOpen = 'end';

/** The href a door pushes: `/trial/<petId>`, encoded, with `?open=end` for the door that
 *  arrives to end the trial. */
export function trialScreenHref(petId: string, opts: { open?: TrialRouteOpen } = {}): string {
  const base = `${TRIAL_ROUTE_PREFIX}${encodeURIComponent(petId)}`;
  return opts.open ? `${base}?open=${opts.open}` : base;
}

/** The route's pet; null when it is missing or empty (a malformed deep link). Read as
 *  given: `useLocalSearchParams` has already decoded the value once, and a second decode
 *  would change an id holding a literal `%`. */
export function parseTrialRouteParams(params: {
  pet?: string | string[];
  open?: string | string[];
}): { petId: string; open?: TrialRouteOpen } | null {
  const raw = Array.isArray(params.pet) ? params.pet[0] : params.pet;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const open = Array.isArray(params.open) ? params.open[0] : params.open;
  // An unknown value opens nothing: a stale or hand-typed link lands on the screen as is.
  return open === 'end' ? { petId: raw, open } : { petId: raw };
}
