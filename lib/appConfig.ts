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

// ── The experimental-flag allowlist primitive (Ask spec §8) ──────────────────────
// A SECOND flag shape that lives in the same `app_config` table but resolves
// against the caller, not just on/off for everyone. A value MAY be either a plain
// boolean (every existing key — unchanged) OR
//   { "enabled": bool, "allowlist": ["<user-uuid>", …] }
// Resolution (identical on client + server — the server half is
// `supabase/functions/_shared/flags.ts`, which A4's `ask` function reuses):
//   • plain bool            → that bool (back-compat)
//   • enabled === true      → on for everyone (allowlist ignored)
//   • enabled === false     → on iff the caller's uid is in the allowlist
//   • anything malformed    → the caller's `fallback`
// The Ask keys pass `fallback = false` so a missing / unreachable / malformed
// value fails CLOSED — a broken or un-seeded experiment hides its affordance, it
// never dark-holes or half-enables. Implemented once; reusable for every future
// experiment (zero schema — the shape rides the existing JSONB `value`).

export const ALLOWLIST_FLAG_KEYS = ['ask_enabled', 'ask_general_enabled'] as const;
export type AllowlistFlagKey = (typeof ALLOWLIST_FLAG_KEYS)[number];

// Raw, UN-coerced allowlist-flag values (a bool, an { enabled, allowlist } object,
// or `undefined` when the row is absent). Unlike the plain-bool product flags these
// can't be flattened to a boolean at fetch time — resolution needs the caller's uid
// — so the store keeps the raw value and resolves per caller via useAllowlistFlag.
export type AllowlistFlagValues = Record<AllowlistFlagKey, unknown>;

// The "no experiment seeded / config unreachable" baseline — every key unset, so
// every key resolves to its fail-closed `fallback`.
export const ALLOWLIST_FLAGS_UNSET: AllowlistFlagValues = {
  ask_enabled: undefined,
  ask_general_enabled: undefined,
};

// The pure primitive. `userId` is the signed-in caller's uid (null when unknown /
// signed out — an allowlist can never match, so an allowlist-gated flag stays off).
// Pure; no I/O. Mirrored verbatim server-side.
export function resolveAllowlistFlag(
  raw: unknown,
  userId: string | null,
  fallback: boolean,
): boolean {
  // Plain-bool back-compat: an existing on/off key run through this resolver keeps
  // its meaning (on/off for everyone), allowlist inapplicable.
  if (typeof raw === 'boolean') return raw;
  if (raw && typeof raw === 'object') {
    const v = raw as Record<string, unknown>;
    if (typeof v.enabled === 'boolean') {
      if (v.enabled) return true; // enabled for everyone — allowlist ignored
      // Gated: on only for allow-listed callers. A missing/non-array allowlist or an
      // unknown caller ⇒ off (not fallback — this is a well-formed "gated" value).
      if (Array.isArray(v.allowlist) && typeof userId === 'string' && userId.length > 0) {
        return v.allowlist.includes(userId);
      }
      return false;
    }
    // Object present but no boolean `enabled` ⇒ malformed ⇒ fail to fallback.
  }
  // null / undefined / number / string / malformed object ⇒ fallback.
  return fallback;
}

// Pull the raw allowlist-flag values out of an `app_config` SELECT (rows of
// { key, value }). Only the known experimental keys are picked; unknown keys and a
// null/absent result yield the unset baseline. Pure — no resolution here (that
// needs the caller's uid).
export function extractAllowlistFlags(
  rows: { key: string; value: unknown }[] | null | undefined,
): AllowlistFlagValues {
  const out: AllowlistFlagValues = { ...ALLOWLIST_FLAGS_UNSET };
  if (!rows) return out;
  const keys = ALLOWLIST_FLAG_KEYS as readonly string[];
  for (const r of rows) {
    if (keys.includes(r.key)) out[r.key as AllowlistFlagKey] = r.value;
  }
  return out;
}

// Decode cached allowlist values (a parsed AsyncStorage blob) back to the raw map,
// tolerating a legacy cache that predates this shape (⇒ unset baseline). Pure.
export function coerceAllowlistFlags(source: unknown): AllowlistFlagValues {
  const src = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const out: AllowlistFlagValues = { ...ALLOWLIST_FLAGS_UNSET };
  for (const key of ALLOWLIST_FLAG_KEYS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

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

// Both projections of one `app_config` fetch — the plain-bool product flags and the
// raw experimental allowlist values — travel together so the store fetches/caches
// the config ONCE and derives both. `useAppConfig()` still projects `.values`
// unchanged; `useAllowlistFlag()` resolves `.allowlist` per caller.
export interface AppConfigBundle {
  values: AppConfigValues;
  allowlist: AllowlistFlagValues;
}

// Fetch fresh config from Supabase. Returns null on ANY failure (offline, RLS
// denial for an unauthenticated caller, timeout) so the caller can hold on to the
// last-known-good cache instead of snapping back to defaults mid-session. One
// SELECT feeds both projections.
export async function fetchAppConfig(): Promise<AppConfigBundle | null> {
  try {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error || !data) return null;
    const rows = data as { key: string; value: unknown }[];
    return { values: resolveAppConfigFromRows(rows), allowlist: extractAllowlistFlags(rows) };
  } catch {
    return null;
  }
}

// Last-known-good cache read. Returns null when nothing has been cached yet (the
// first-ever-run-offline case → caller uses shipped defaults + fail-closed
// experiments). Tolerates a legacy cache blob that predates the bundle shape (a
// flat AppConfigValues): the values coerce as before and the allowlist decodes to
// its unset baseline (⇒ experiments hidden until the next fetch).
export async function loadCachedAppConfig(): Promise<AppConfigBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const src =
      parsed && typeof parsed === 'object' && 'values' in parsed
        ? (parsed as Record<string, unknown>)
        : { values: parsed, allowlist: undefined };
    return { values: coerceAppConfig(src.values), allowlist: coerceAllowlistFlags(src.allowlist) };
  } catch {
    return null;
  }
}

export async function persistAppConfig(bundle: AppConfigBundle): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
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
