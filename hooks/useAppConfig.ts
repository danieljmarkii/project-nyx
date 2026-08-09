import { useSyncExternalStore } from 'react';
import {
  AppConfigValues,
  AppConfigBundle,
  AllowlistFlagValues,
  AllowlistFlagKey,
  APP_CONFIG_DEFAULTS,
  ALLOWLIST_FLAGS_UNSET,
  resolveAllowlistFlag,
  fetchAppConfig,
  loadCachedAppConfig,
  persistAppConfig,
} from '../lib/appConfig';
import { useAuthStore } from '../store/authStore';

// The React binding for the server-flippable `app_config` flags (B-329, spec §4.2)
// and the experimental allowlist primitive (Ask §8). A tiny module-level
// observable, not a per-component fetch: config is app-global state read from many
// surfaces, so it's loaded ONCE on start (initAppConfig) and refreshed on
// foreground / sign-in (refreshAppConfig), and every useAppConfig() caller reads the
// same current value. Values are RENDER-ONLY — the server re-checks every gate
// authoritatively (B-252), and re-resolves every allowlist flag against the
// JWT-verified uid.
//
// Precedence, outermost win: a successful fetch > last-known-good cache > the
// per-key shipped defaults (product flags) / fail-closed (allowlist experiments). A
// failed fetch never snaps a live session back to defaults — it holds whatever was
// last resolved.

let currentConfig: AppConfigValues = APP_CONFIG_DEFAULTS;
let currentAllowlist: AllowlistFlagValues = ALLOWLIST_FLAGS_UNSET;
let started = false;
const listeners = new Set<() => void>();

function setBundle(next: AppConfigBundle): void {
  currentConfig = next.values;
  currentAllowlist = next.allowlist;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Call once at app start. Seeds from the last-known-good cache immediately (so an
// offline cold start renders the last real values, not defaults). It does NOT
// fetch: the authoritative "on start" fetch is auth-driven (the Supabase
// `INITIAL_SESSION` event fires refreshAppConfig once the persisted session has
// hydrated — before then a fetch is RLS-denied anyway), so a fetch here would just
// race that and duplicate the SELECT. Idempotent.
export async function initAppConfig(): Promise<void> {
  if (started) return;
  started = true;
  const cached = await loadCachedAppConfig();
  if (cached) setBundle(cached);
}

// Re-fetch and update if it succeeds; a failed fetch is a no-op (holds the current
// value). Wired to app-foreground and to sign-in/initial-session, since an
// unauthenticated fetch is RLS-denied and returns null.
export async function refreshAppConfig(): Promise<void> {
  const fresh = await fetchAppConfig();
  if (fresh) {
    setBundle(fresh);
    void persistAppConfig(fresh);
  }
}

// Test-only reset so a fixture can start from a known state.
export function __resetAppConfigForTest(
  bundle: AppConfigBundle = { values: APP_CONFIG_DEFAULTS, allowlist: ALLOWLIST_FLAGS_UNSET },
): void {
  started = false;
  setBundle(bundle);
}

export function useAppConfig(): AppConfigValues {
  return useSyncExternalStore(subscribe, () => currentConfig, () => currentConfig);
}

// Resolve an experimental allowlist flag (Ask §8) for the currently signed-in
// caller. Combines the server-fetched raw value (this store) with the caller's uid
// (the auth store) through the pure resolver. Fail-CLOSED: an unset / unreachable /
// malformed value, or a signed-out caller, resolves to false — the affordance hides
// rather than half-enabling. Render-only; the server re-checks authoritatively.
export function useAllowlistFlag(key: AllowlistFlagKey): boolean {
  const raw = useSyncExternalStore(
    subscribe,
    () => currentAllowlist[key],
    () => currentAllowlist[key],
  );
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return resolveAllowlistFlag(raw, userId, false);
}
