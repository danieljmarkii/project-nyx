import { create } from 'zustand';

// Tracks, per pet, the last live-findings "signature" the owner has actually
// seen the Signal zone render (B-284 PR N2 §3, the CulpritMark pulse contract).
// In-memory only — the pulse is a session-scoped "something's new" nudge, not a
// durable read receipt, so it's fine (and simpler) for it to reset on app restart
// rather than persisting through SecureStore/SQLite like real domain state.
interface SignalMarkState {
  seenSignatures: Record<string, string>;
  markSeen: (petId: string, signature: string) => void;
}

export const useSignalMarkStore = create<SignalMarkState>((set) => ({
  seenSignatures: {},
  markSeen: (petId, signature) =>
    set((s) => {
      if (s.seenSignatures[petId] === signature) return s;
      return { seenSignatures: { ...s.seenSignatures, [petId]: signature } };
    }),
}));
