import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';

/**
 * CUL-2766 — the Vet contacts surfaces' one gate: the server allowlist (`vet_contacts_enabled`,
 * fail-closed) AND this account's opt-in on the Beta page (spec §4.1, §5.2). Both, never
 * either: eligibility without the opt-in is a beta the owner has not chosen.
 *
 * It gates SURFACES only. The exam readers filter on `channel` whatever this says.
 */
export function useVetContactsOn(): boolean {
  const eligible = useAllowlistFlag('vet_contacts_enabled');
  const optedIn = useBetaOptIn('vet_contacts_enabled');
  return eligible && optedIn;
}
