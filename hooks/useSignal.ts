import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePetStore } from '../store/petStore';

export interface SignalState {
  signalText: string | null;
  isBuilding: boolean;
  isLoading: boolean;
}

export function useSignal(): SignalState {
  const { activePet } = usePetStore();
  const [signalText, setSignalText] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const petIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activePet) return;
    // Skip if already loaded for this pet
    if (petIdRef.current === activePet.id && signalText !== null) return;

    let cancelled = false;
    petIdRef.current = activePet.id;
    setIsLoading(true);

    async function fetchSignal() {
      try {
        const { data, error } = await supabase.functions.invoke('generate-signal', {
          body: { petId: activePet!.id },
        });
        if (cancelled) return;
        if (error) throw error;

        const result = data as { signal_text: string; is_building: boolean };
        setSignalText(result.signal_text);
        setIsBuilding(result.is_building ?? true);
      } catch {
        if (cancelled) return;
        // Edge Function not deployed or network error — show building state silently
        setIsBuilding(true);
        setSignalText(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSignal();
    return () => { cancelled = true; };
  }, [activePet?.id]);

  return { signalText, isBuilding, isLoading };
}
