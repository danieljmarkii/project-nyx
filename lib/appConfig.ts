// Client-side reader for the server-flippable `app_config` product flags (B-329,
// monetization spec §4.2). This is the RENDER-ONLY half of the flag mechanism: it
// shapes UI (hide a dead affordance, skip the paywall) but is NEVER authoritative.
// Every gate/cap decision is re-checked server-side in the Edge Function (B-252),
// so a stale or spoofed client value can only ever change what's shown, not what's
// allowed. See docs/monetization-and-throttling-requirements.md §4.2 / §6.
//
// Two mechanisms live here, both pure + testable:
//   • App-config flags — fetched from `app_config`, cached last-known-good, and
//     resolved against per-key SHIPPED DEFAULTS when unreachable (AI keys fail
//     OPEN so a config blip never dark-holes a working feature; `paywall_enabled`
//     fails CLOSED so a dead trial CTA can't ship — §4.2).
//   • The typed function-response decoder — turns the §4.5 `{ cap_reached }` /
//     `{ feature_disabled }` 200 bodies into a small discriminated union the
//     capture screens render designed states from, instead of parsing error
//     strings. (Deliberately lightweight; the full mandated shared decoder is
//     parked pending a PM call — spec §4 review note.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface AppConfigValues {
  ai_food_extraction_enabled: boolean;
  ai_med_extraction_enabled: boolean;
  ai_vomit_read_enabled: boolean;
  ai_signal_phrasing_enabled: boolean;
  paywall_enabled: boolean;
}

export type AppConfigKey = keyof AppConfigValues;

// The per-key CLIENT fallback (§4.2 "Client fallback when config is unreachable"
// column) — used on first-ever run with no cache, and as the base every partial
// fetch/cache fills in over. NOT the seeded server values: the server seeds
// `paywall_enabled = true` (ship-dark), but the client's *fallback* is false so a
// config-unreachable build never shows a non-functional trial CTA.
export const APP_CONFIG_DEFAULTS: AppConfigValues = {
  ai_food_extraction_enabled: true,   // fail-open
  ai_med_extraction_enabled: true,    // fail-open
  ai_vomit_read_enabled: true,        // fail-open (gates the DESCRIPTIVE read only,
                                      //           never the deterministic escalation)
  ai_signal_phrasing_enabled: true,   // fail-open (off = template phrasing, invisible)
  paywall_enabled: false,             // fail-CLOSED (§4.2 — a dead CTA is a rejection risk)
};

const APP_CONFIG_KEYS = Object.keys(APP_CONFIG_DEFAULTS) as AppConfigKey[];

const CACHE_KEY = '__culprit_app_config_v1';

// Coerce an arbitrary object (a cached blob, or a { key: value } map) into a
// fully-populated AppConfigValues: each key takes the source's boolean if present,
// else the shipped default. A malformed/partial source can only ever yield the
// safe defaults — never an undefined flag. Pure.
export function coerceAppConfig(
  source: unknown,
  defaults: AppConfigValues = APP_CONFIG_DEFAULTS,
): AppConfigValues {
  const src = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of APP_CONFIG_KEYS) {
    const raw = src[key];
    if (typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

// Resolve the `app_config` SELECT result (rows of { key, value }) into config
// values. Missing rows and non-boolean values fall back to the defaults per key —
// so a server that hasn't seeded a flag yet is treated as fail-open/closed exactly
// like an unreachable config. Pure.
export function resolveAppConfigFromRows(
  rows: { key: string; value: unknown }[] | null | undefined,
  defaults: AppConfigValues = APP_CONFIG_DEFAULTS,
): AppConfigValues {
  if (!rows) return { ...defaults };
  const obj: Record<string, unknown> = {};
  for (const r of rows) obj[r.key] = r.value;
  return coerceAppConfig(obj, defaults);
}

// Fetch fresh config from Supabase. Returns null on ANY failure (offline, RLS
// denial for an unauthenticated caller, timeout) so the caller can hold on to the
// last-known-good cache instead of snapping back to defaults mid-session.
export async function fetchAppConfig(): Promise<AppConfigValues | null> {
  try {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error || !data) return null;
    return resolveAppConfigFromRows(data as { key: string; value: unknown }[]);
  } catch {
    return null;
  }
}

// Last-known-good cache read. Returns null when nothing has been cached yet (the
// first-ever-run-offline case → caller uses shipped defaults).
export async function loadCachedAppConfig(): Promise<AppConfigValues | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return coerceAppConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function persistAppConfig(values: AppConfigValues): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(values));
  } catch {
    // A cache-write failure is non-fatal: the in-memory value still drives this
    // session; next launch just falls back one level to shipped defaults.
  }
}

// ── Typed function-response decoder (§4.5) ───────────────────────────────────────
// The extraction functions return HTTP 200 with a typed body for the two product
// states, so the client must branch on the BODY, not on `error` (which stays a
// genuine-fault channel). `resets_at` is ISO; null-tolerated for a defensive
// decode.

export type GateResponse =
  | { kind: 'ok' }
  | { kind: 'cap_reached'; cap: 'daily' | 'monthly'; resetsAt: string | null }
  | { kind: 'feature_disabled' };

export function parseGateResponse(data: unknown): GateResponse {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.cap_reached === true) {
      const cap: 'daily' | 'monthly' = d.cap === 'monthly' ? 'monthly' : 'daily';
      const resetsAt = typeof d.resets_at === 'string' ? d.resets_at : null;
      return { kind: 'cap_reached', cap, resetsAt };
    }
    if (d.feature_disabled === true) return { kind: 'feature_disabled' };
  }
  return { kind: 'ok' };
}
