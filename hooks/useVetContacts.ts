// Vet contacts' client gate (CUL-2749, spec §4.1 / §5.2): the server allowlist AND the owner's
// Early access switch, both fail-closed. On its own so every door asks one question in one place.
//
// It gates ENTRY: the logging door, the sheet's channel step, the channel chips. It never
// decides how an existing record reads: a call, text or email reads as itself on every record
// surface whatever this says (`showsChannel`, lib/vetContacts.ts; PM ruling CUL-2830), so a
// second phone, a reinstall or the cold start before the flag resolves never calls it a visit.
// For a clinic visit it still keeps the shipped words while off (AC 1, C-36).
//
// It gates no reader either. The exam-only readers filter on `channel` whatever this says
// (PR-03), so a phone contact never anchors a window on any device.
import { useAllowlistFlag, allowlistFlagNow } from './useAppConfig';
import { useBetaOptIn, useBetaOptInStore } from '../lib/betaFeatures';

export const VET_CONTACTS_FLAG = 'vet_contacts_enabled' as const;

export function useVetContactsOn(): boolean {
  const eligible = useAllowlistFlag(VET_CONTACTS_FLAG);
  const optedIn = useBetaOptIn(VET_CONTACTS_FLAG);
  return eligible && optedIn;
}

/** The same answer read once, for a store's load. Not reactive: the store re-reads on its next load. */
export function vetContactsOnNow(): boolean {
  return allowlistFlagNow(VET_CONTACTS_FLAG) && (useBetaOptInStore.getState().optIns[VET_CONTACTS_FLAG] ?? false);
}
