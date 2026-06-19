import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  // Transient one-shot flag (B-039 FR-12): set just before the post-deletion
  // signOut so the auth screen can show a brief "account deleted" confirmation
  // after the SIGNED_OUT wipe routes there. Survives setSession(null) (it isn't
  // touched here) and the petStore.reset() in the SIGNED_OUT handler (different
  // store); the login screen reads it once on mount and clears it.
  justDeletedAccount: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setJustDeletedAccount: (justDeletedAccount: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  justDeletedAccount: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
  setJustDeletedAccount: (justDeletedAccount) => set({ justDeletedAccount }),
}));
