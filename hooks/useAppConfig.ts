import { useSyncExternalStore } from 'react';
import {
  AppConfigValues,
  APP_CONFIG_DEFAULTS,
  fetchAppConfig,
  loadCachedAppConfig,
  persistAppConfig,
} from '../lib/appConfig';

// The React binding for the server-flippable `app_config` flags (B-329, spec §4.2).
// A tiny module-level observable, not a per-component fetch: config is app-global
// state read from many surfaces, so it's loaded ONCE on start (initAppConfig) and
// refreshed on foreground / sign-in (refreshAppConfig), and every useAppConfig()
// caller reads the same current value. Values are RENDER-ONLY — the server re-checks
// every gate authoritatively (B-252).
//
// Precedence, outermost win: a successful fetch > last-known-good cache > the
// per-key shipped defaults. A failed fetch never snaps a live session back to
// defaults — it holds whatever was last resolved.

let currentConfig: AppConfigValues = APP_CONFIG_DEFAULTS;
let started = false;
const listeners = new Set<() => void>();

function setConfig(next: AppConfigValues): void {
  currentConfig = next;
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
  if (cached) setConfig(cached);
}

// Re-fetch and update if it succeeds; a failed fetch is a no-op (holds the current
// value). Wired to app-foreground and to sign-in/initial-session, since an
// unauthenticated fetch is RLS-denied and returns null.
export async function refreshAppConfig(): Promise<void> {
  const fresh = await fetchAppConfig();
  if (fresh) {
    setConfig(fresh);
    void persistAppConfig(fresh);
  }
}

// Test-only reset so a fixture can start from a known state.
export function __resetAppConfigForTest(values: AppConfigValues = APP_CONFIG_DEFAULTS): void {
  started = false;
  setConfig(values);
}

export function useAppConfig(): AppConfigValues {
  return useSyncExternalStore(subscribe, () => currentConfig, () => currentConfig);
}
