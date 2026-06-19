// Connectivity helpers built on expo-network. One source of truth for the
// "are we online?" predicate so the sync loop (hooks/useSync) and any offline
// guard (e.g. account deletion, B-039 FR-11) agree on what "online" means.
import * as Network from 'expo-network';

export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

// Pure mapper. `isInternetReachable` can be null while the check is in flight —
// treat null as "still online" (only an explicit `false` counts as offline) so a
// pending reachability probe never produces a false-positive offline transition.
export function isOnlineFromState(state: NetworkStateLike): boolean {
  return !!(state.isConnected && state.isInternetReachable !== false);
}

// Point-in-time connectivity read. On an unexpected failure to determine state we
// return `true` (optimistic): a guard built on this must never *falsely block* a
// user who is actually connected — and any real offline state is still caught
// honestly by the network call that follows failing (never a false success).
export async function getIsOnline(): Promise<boolean> {
  try {
    return isOnlineFromState(await Network.getNetworkStateAsync());
  } catch {
    return true;
  }
}
