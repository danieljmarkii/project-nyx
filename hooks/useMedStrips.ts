// The loader behind the Home medication strip (B-614 PR M2).
//
// The medication sibling of `useDietTrial`: it reads the active pet's regimens +
// recent doses from the local mirror into the `MedStripInput` that Home hands to
// the pure `resolveMedStrips`. Home resolves inline (exactly as it does for the
// trial strip) so the resolver call stays visible on the screen and the placement
// rule — med cards BELOW `TrialStrip`, ABOVE `TodayZone` (§8/D9) — is assertable
// over `app/(tabs)/index.tsx` source.
//
// Recompute triggers match the trial strip's: a pet switch, and every hydration
// tick (a dose logged on another device changes the coverage line here). `nowMs`
// is baked in at load, so the day counter is refreshed by the next tick/reload
// rather than mid-render — the same, accepted, behaviour as `useDietTrial`.
import { useEffect, useState } from 'react';
import { loadMedStripInput } from '../lib/medStripFacts';
import type { MedStripInput } from '../lib/medStrip';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

export function useMedStrips(): { input: MedStripInput | null; isLoading: boolean } {
  const activePet = usePetStore((s) => s.activePet);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [input, setInput] = useState<MedStripInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const petId = activePet?.id;
  const species = activePet?.species;

  useEffect(() => {
    if (!petId || !species) {
      setInput(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    loadMedStripInput({ id: petId, species })
      .then((next) => {
        // A read FAILURE resolves to `null` (never "no meds" — that is a non-null
        // input with empty arrays), so on null we KEEP the previous input rather
        // than flashing to empty: a strip already showing a withholding fact must
        // not vanish on a transient hydration-tick failure. First-load failures
        // leave the initial `null`, which correctly shows nothing.
        if (!cancelled && next !== null) setInput(next);
      })
      .catch((e) => {
        // Defensive: `loadMedStripInput` catches its own read errors and resolves
        // to `null`, so this should not fire — but if it ever rejects, hold the
        // previous input rather than clearing it.
        console.error('[MedStrip] load failed:', e);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [petId, species, hydrationTick]);

  return { input, isLoading };
}
