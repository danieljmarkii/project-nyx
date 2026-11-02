import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { hasSavedReports } from '../lib/reportLibrary';

/**
 * Whether this pet has a kept vet report copy (Vet report v2 PR-21, CUL-2301), re-read each time
 * the screen gains focus so a copy kept elsewhere shows its door on return. False until a read
 * answers yes, and false on a failed read: the door only appears for an owner who has copies, so
 * an account with none sees today's screen exactly (spec §12's AC-0 exception for the library).
 */
export function useHasSavedReports(petId: string | null): boolean {
  const [answer, setAnswer] = useState<{ petId: string; has: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!petId) return undefined;
      let live = true;
      void hasSavedReports(petId).then((has) => {
        if (live) setAnswer({ petId, has: has === true });
      });
      return () => {
        live = false;
      };
    }, [petId]),
  );
  // An answer about another pet is never this pet's (C-9).
  return answer !== null && answer.petId === petId && answer.has;
}
