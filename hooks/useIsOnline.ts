import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { isOnlineFromState } from '../lib/network';

// Reactive connectivity flag for surfaces that must disable an action while
// offline (B-039 FR-11 account-deletion guard). Seeds optimistically `true`,
// corrects from the first real read, then tracks transitions while mounted. The
// destructive path also re-checks at submit time (getIsOnline) so a lagging flag
// can never let an offline delete fire.
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;
    Network.getNetworkStateAsync()
      .then((state) => { if (active) setOnline(isOnlineFromState(state)); })
      .catch(() => { /* keep the optimistic default; submit-time re-check guards */ });

    const sub = Network.addNetworkStateListener((state) => {
      setOnline(isOnlineFromState(state));
    });
    return () => { active = false; sub.remove(); };
  }, []);

  return online;
}
