// The Signal screen's route (D2-3 · CUL-1065): `app/signal/[id]`, where `id` is the
// finding's identity (`foldIdentity` — the key that survives a re-rank) and `pet` is the
// finding's pet (C-9: the screen names the RECORD's pet, so the route carries it; the
// active pet is never consulted). A helper, not a component, so it lives in `lib/` — a
// non-component export inside `components/designV2/` would be wrapped into a component
// by the flag-off guard's switch.

export const SIGNAL_ROUTE_PREFIX = '/signal/';

/** The href the card pushes: `/signal/<identity>?pet=<id>`, both encoded. */
export function signalScreenHref(petId: string, identity: string): string {
  return `${SIGNAL_ROUTE_PREFIX}${encodeURIComponent(identity)}?pet=${encodeURIComponent(petId)}`;
}

/** The route's params; null when either is missing (a malformed deep link). Read as
 *  given: `useLocalSearchParams` has already decoded every value once, and a second
 *  decode would turn a literal `%` in an identity into a different key. */
export function parseSignalRouteParams(params: {
  id?: string | string[];
  pet?: string | string[];
}): { identity: string; petId: string } | null {
  const one = (v: string | string[] | undefined): string | null => {
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' && s.length > 0 ? s : null;
  };
  const identity = one(params.id);
  const petId = one(params.pet);
  return identity && petId ? { identity, petId } : null;
}
