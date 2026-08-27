// T2-4 §11 client-matrix fixtures for the app_config reader + the typed
// gate-response decoder. The component-behaviour rows (1–8) are backed by these
// two pure units — config resolution decides "flag off → hide affordance", and the
// decoder decides "cap_reached → designed band". Fixtures, not vibes (spec §20 #3).

// mockSelect is the app_config SELECT stand-in — a `mock`-prefixed name so the
// hoisted jest.mock factory may close over it.
const mockSelect = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ select: (...args: unknown[]) => mockSelect(...args) })) },
}));

import {
  APP_CONFIG_DEFAULTS,
  coerceAppConfig,
  resolveAppConfigFromRows,
  fetchAppConfig,
  parseGateResponse,
  resolveAllowlistFlag,
  extractAllowlistFlags,
  coerceAllowlistFlags,
  ALLOWLIST_FLAGS_UNSET,
} from './appConfig';

describe('app_config resolution — shipped defaults (§11 row 9)', () => {
  it('first run / unreachable config → AI keys fail OPEN, paywall fails CLOSED', () => {
    // resolveAppConfigFromRows(null) is the "no fetch, no cache" fallback.
    const d = resolveAppConfigFromRows(null);
    expect(d.ai_food_extraction_enabled).toBe(true);
    expect(d.ai_med_extraction_enabled).toBe(true);
    expect(d.ai_vomit_read_enabled).toBe(true);
    expect(d.ai_signal_phrasing_enabled).toBe(true);
    expect(d.paywall_enabled).toBe(false); // fail-closed — a dead CTA must not ship
  });

  it('the exported defaults encode the same fail-open/fail-closed posture', () => {
    expect(APP_CONFIG_DEFAULTS.paywall_enabled).toBe(false);
    expect(APP_CONFIG_DEFAULTS.ai_food_extraction_enabled).toBe(true);
  });

  it('empty object coerces to defaults', () => {
    expect(coerceAppConfig({})).toEqual(APP_CONFIG_DEFAULTS);
  });
});

describe('app_config resolution — server values', () => {
  it('honours a full set of server rows (flag off + paywall on)', () => {
    const rows = [
      { key: 'ai_food_extraction_enabled', value: false },
      { key: 'ai_med_extraction_enabled', value: false },
      { key: 'ai_vomit_read_enabled', value: false },
      { key: 'ai_signal_phrasing_enabled', value: false },
      { key: 'paywall_enabled', value: true },
    ];
    expect(resolveAppConfigFromRows(rows)).toEqual({
      ai_food_extraction_enabled: false,
      ai_med_extraction_enabled: false,
      ai_vomit_read_enabled: false,
      ai_signal_phrasing_enabled: false,
      paywall_enabled: true,
    });
  });

  it('a MISSING row falls back to that key default, not to false', () => {
    // Only food present + off; every other key uses its shipped default.
    const rows = [{ key: 'ai_food_extraction_enabled', value: false }];
    const r = resolveAppConfigFromRows(rows);
    expect(r.ai_food_extraction_enabled).toBe(false);
    expect(r.ai_med_extraction_enabled).toBe(true);   // default, not off
    expect(r.paywall_enabled).toBe(false);            // default (fail-closed)
  });

  it('a non-boolean value is ignored (fall back to default) — never coerces truthy', () => {
    const rows = [
      { key: 'ai_food_extraction_enabled', value: 'false' }, // string, not boolean
      { key: 'paywall_enabled', value: 1 },                  // number, not boolean
    ];
    const r = resolveAppConfigFromRows(rows);
    expect(r.ai_food_extraction_enabled).toBe(true);  // string 'false' ignored → default
    expect(r.paywall_enabled).toBe(false);            // number 1 ignored → default
  });

  it('ignores unknown keys (e.g. ai_caps) without throwing', () => {
    const rows = [
      { key: 'ai_caps', value: { extract_food: { daily: 5 } } },
      { key: 'paywall_enabled', value: true },
    ];
    const r = resolveAppConfigFromRows(rows);
    expect(r.paywall_enabled).toBe(true);
    expect((r as unknown as Record<string, unknown>).ai_caps).toBeUndefined();
  });
});

describe('fetchAppConfig', () => {
  beforeEach(() => mockSelect.mockReset());

  it('returns a bundle of resolved values + raw allowlist flags on a clean fetch', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { key: 'ai_food_extraction_enabled', value: false },
        { key: 'ask_enabled', value: { enabled: false, allowlist: ['u-1'] } },
      ],
      error: null,
    });
    const r = await fetchAppConfig();
    expect(r?.values.ai_food_extraction_enabled).toBe(false);
    expect(r?.values.paywall_enabled).toBe(false);
    // Allowlist values ride the SAME fetch, raw (un-coerced — resolution needs a uid).
    expect(r?.allowlist.ask_enabled).toEqual({ enabled: false, allowlist: ['u-1'] });
    expect(r?.allowlist.ask_general_enabled).toBeUndefined();
  });

  it('returns null on a query error (caller holds last-known-good)', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    expect(await fetchAppConfig()).toBeNull();
  });

  it('returns null on a thrown/rejected query (offline)', async () => {
    mockSelect.mockRejectedValue(new Error('network'));
    expect(await fetchAppConfig()).toBeNull();
  });
});

describe('parseGateResponse — the §4.5 typed contract (§11 rows 1,2,4,5)', () => {
  it('decodes cap_reached daily with resets_at', () => {
    expect(
      parseGateResponse({ cap_reached: true, cap: 'daily', function: 'extract_food', resets_at: '2026-07-16T00:00:00Z' }),
    ).toEqual({ kind: 'cap_reached', cap: 'daily', resetsAt: '2026-07-16T00:00:00Z' });
  });

  it('decodes cap_reached monthly', () => {
    const r = parseGateResponse({ cap_reached: true, cap: 'monthly', resets_at: '2026-08-01T00:00:00Z' });
    expect(r).toEqual({ kind: 'cap_reached', cap: 'monthly', resetsAt: '2026-08-01T00:00:00Z' });
  });

  it('defaults an unknown/missing cap discriminator to daily', () => {
    expect(parseGateResponse({ cap_reached: true }).kind).toBe('cap_reached');
    expect((parseGateResponse({ cap_reached: true }) as { cap: string }).cap).toBe('daily');
  });

  it('tolerates a missing resets_at (null)', () => {
    expect((parseGateResponse({ cap_reached: true, cap: 'daily' }) as { resetsAt: unknown }).resetsAt).toBeNull();
  });

  it('decodes feature_disabled', () => {
    expect(parseGateResponse({ feature_disabled: true, function: 'extract_med' })).toEqual({ kind: 'feature_disabled' });
  });

  it('treats a normal extraction body as ok (not a gate state)', () => {
    expect(parseGateResponse({ extraction: { brand: 'Acme' } })).toEqual({ kind: 'ok' });
  });

  it('treats null / garbage as ok (fall through to the existing failure path)', () => {
    expect(parseGateResponse(null)).toEqual({ kind: 'ok' });
    expect(parseGateResponse(undefined)).toEqual({ kind: 'ok' });
    expect(parseGateResponse('nope')).toEqual({ kind: 'ok' });
    // A falsey cap_reached must NOT trip the branch.
    expect(parseGateResponse({ cap_reached: false })).toEqual({ kind: 'ok' });
  });
});

// ── The experimental-flag allowlist primitive (Ask §8) ──────────────────────────
// The primitive is the same pure function on client + server (the server copy in
// supabase/functions/_shared/flags.test.ts asserts identical behaviour). These pin
// every branch: plain-bool back-compat, enabled-for-all, allowlist membership,
// signed-out, and the fail-closed malformed cases (Ask keys pass fallback=false).

describe('resolveAllowlistFlag — plain-bool back-compat', () => {
  it('a plain boolean value is returned verbatim (existing keys unchanged)', () => {
    expect(resolveAllowlistFlag(true, 'u-1', false)).toBe(true);
    expect(resolveAllowlistFlag(false, 'u-1', true)).toBe(false);
    // uid is irrelevant for a plain bool — even signed out.
    expect(resolveAllowlistFlag(true, null, false)).toBe(true);
  });
});

describe('resolveAllowlistFlag — { enabled, allowlist } shape', () => {
  it('enabled:true is on for everyone, allowlist ignored', () => {
    expect(resolveAllowlistFlag({ enabled: true, allowlist: [] }, 'u-1', false)).toBe(true);
    expect(resolveAllowlistFlag({ enabled: true, allowlist: ['other'] }, 'u-1', false)).toBe(true);
    expect(resolveAllowlistFlag({ enabled: true }, null, false)).toBe(true);
  });

  it('enabled:false is on ONLY for an allow-listed caller', () => {
    const v = { enabled: false, allowlist: ['pm-uid', 'qa-uid'] };
    expect(resolveAllowlistFlag(v, 'pm-uid', false)).toBe(true);
    expect(resolveAllowlistFlag(v, 'someone-else', false)).toBe(false);
  });

  it('enabled:false with an empty allowlist is off for everyone', () => {
    expect(resolveAllowlistFlag({ enabled: false, allowlist: [] }, 'u-1', false)).toBe(false);
  });

  it('enabled:false but signed out (null uid) → off, never the fallback', () => {
    // A well-formed gated value resolves to off for an unknown caller — it does NOT
    // leak through to `fallback=true` (that would flip the semantics).
    expect(resolveAllowlistFlag({ enabled: false, allowlist: ['u-1'] }, null, true)).toBe(false);
    expect(resolveAllowlistFlag({ enabled: false, allowlist: ['u-1'] }, '', false)).toBe(false);
  });

  it('enabled:false with a non-array allowlist → off (well-formed enough to gate)', () => {
    expect(resolveAllowlistFlag({ enabled: false, allowlist: 'u-1' }, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag({ enabled: false }, 'u-1', false)).toBe(false);
  });
});

describe('resolveAllowlistFlag — malformed values fall to fallback (fail-closed for Ask)', () => {
  it('a missing boolean `enabled` is malformed → fallback', () => {
    // With fallback=false (how the Ask keys call it) these all hide the feature.
    expect(resolveAllowlistFlag({ allowlist: ['u-1'] }, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag({ enabled: 'true', allowlist: ['u-1'] }, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag({ enabled: 1 }, 'u-1', false)).toBe(false);
    // fallback is honoured (proves it's the fallback branch, not a hardcoded false).
    expect(resolveAllowlistFlag({ allowlist: ['u-1'] }, 'u-1', true)).toBe(true);
  });

  it('non-object primitives → fallback', () => {
    expect(resolveAllowlistFlag(undefined, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag(null, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag('garbage', 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag(42, 'u-1', false)).toBe(false);
    expect(resolveAllowlistFlag(undefined, 'u-1', true)).toBe(true); // fallback honoured
  });
});

describe('extractAllowlistFlags — raw values off an app_config SELECT', () => {
  it('picks only the known experimental keys, raw (un-coerced)', () => {
    const rows = [
      { key: 'ai_food_extraction_enabled', value: false },
      { key: 'ask_enabled', value: { enabled: false, allowlist: ['u-1'] } },
      { key: 'ask_general_enabled', value: false },
      { key: 'ai_caps', value: { extract_food: { daily: 5 } } },
    ];
    expect(extractAllowlistFlags(rows)).toEqual({
      ask_enabled: { enabled: false, allowlist: ['u-1'] },
      ask_general_enabled: false,
    });
  });

  it('a missing row stays undefined (unset baseline)', () => {
    const r = extractAllowlistFlags([{ key: 'ask_enabled', value: { enabled: true } }]);
    expect(r.ask_enabled).toEqual({ enabled: true });
    expect(r.ask_general_enabled).toBeUndefined();
  });

  it('null / no rows → the unset baseline', () => {
    expect(extractAllowlistFlags(null)).toEqual(ALLOWLIST_FLAGS_UNSET);
    expect(extractAllowlistFlags(undefined)).toEqual(ALLOWLIST_FLAGS_UNSET);
  });
});

describe('coerceAllowlistFlags — cache decode, legacy-tolerant', () => {
  it('round-trips a persisted allowlist map', () => {
    const stored = { ask_enabled: { enabled: false, allowlist: ['u-1'] }, ask_general_enabled: false };
    expect(coerceAllowlistFlags(stored)).toEqual(stored);
  });

  it('a legacy cache with no allowlist keys → unset baseline (experiments hidden)', () => {
    // A pre-primitive cache blob is a flat AppConfigValues — none of the ask keys.
    expect(coerceAllowlistFlags({ ai_food_extraction_enabled: true })).toEqual(ALLOWLIST_FLAGS_UNSET);
    expect(coerceAllowlistFlags(undefined)).toEqual(ALLOWLIST_FLAGS_UNSET);
    expect(coerceAllowlistFlags(null)).toEqual(ALLOWLIST_FLAGS_UNSET);
  });
});

// ── widget_enabled — the Beta-features eligibility gate (B-712 PR 1) ─────────────
// The widget rides the SAME primitive as the Ask keys (migration 054 seeds it dark:
// {"enabled": false, "allowlist": []}). PR 1 is schema-only, so the contract to pin
// here is the two properties the later publish gate (PR 2) depends on: widget_enabled
// is EXTRACTED off an app_config SELECT, and it resolves FAIL-CLOSED (off) for both
// ship-dark cases — the seed unreached (undefined ⇒ fallback) and a signed-out caller
// against the dark seed. No client gate is wired in this PR; these are unit facts.
describe('widget_enabled — Beta-features eligibility (B-712 PR 1)', () => {
  it('is part of the unset baseline (undefined until the row is fetched)', () => {
    expect(ALLOWLIST_FLAGS_UNSET.widget_enabled).toBeUndefined();
  });

  it('extracts raw off an app_config SELECT, alongside the Ask keys', () => {
    const rows = [
      { key: 'ask_enabled', value: { enabled: false, allowlist: ['a-uid'] } },
      { key: 'widget_enabled', value: { enabled: false, allowlist: ['pm-uid'] } },
    ];
    const flags = extractAllowlistFlags(rows);
    expect(flags.widget_enabled).toEqual({ enabled: false, allowlist: ['pm-uid'] });
    // The new key does not disturb the Ask keys travelling in the same SELECT.
    expect(flags.ask_enabled).toEqual({ enabled: false, allowlist: ['a-uid'] });
  });

  it('resolves fail-closed (off) when unset — seed unreached / row absent', () => {
    // A SELECT without the widget row leaves it undefined; the fallback=false
    // convention (how every allowlist gate is called) then hides the feature.
    const unset = extractAllowlistFlags([{ key: 'ask_enabled', value: false }]).widget_enabled;
    expect(unset).toBeUndefined();
    expect(resolveAllowlistFlag(unset, 'pm-uid', false)).toBe(false);
  });

  it('the shipped-dark seed {enabled:false, allowlist:[]} is off for everyone', () => {
    const darkSeed = { enabled: false, allowlist: [] };
    expect(resolveAllowlistFlag(darkSeed, 'pm-uid', false)).toBe(false);
    // …and off signed-out, never leaking to the fallback.
    expect(resolveAllowlistFlag(darkSeed, null, true)).toBe(false);
  });

  it('an allow-listed uid resolves on; other + signed-out callers stay off', () => {
    const gated = { enabled: false, allowlist: ['pm-uid'] };
    expect(resolveAllowlistFlag(gated, 'pm-uid', false)).toBe(true);
    expect(resolveAllowlistFlag(gated, 'someone-else', false)).toBe(false);
    expect(resolveAllowlistFlag(gated, null, false)).toBe(false); // signed out → off
  });

  it('survives the cache round-trip; a cache lacking it decodes to undefined', () => {
    // The third code path beyond extract + resolve: coerceAllowlistFlags decodes a
    // persisted (AsyncStorage) bundle. A stored widget value must round-trip intact,
    // and a legacy cache without the key leaves it undefined ⇒ resolves fail-closed.
    const stored = { widget_enabled: { enabled: false, allowlist: ['pm-uid'] } };
    expect(coerceAllowlistFlags(stored).widget_enabled).toEqual({
      enabled: false,
      allowlist: ['pm-uid'],
    });
    expect(coerceAllowlistFlags({ ask_enabled: true }).widget_enabled).toBeUndefined();
  });
});

// ── log_picker_v2 — the More-events / log-picker redesign gate (B-745 PR 0) ───────
// PR 0 is schema-only for consumption (migration 056 seeds it dark: {"enabled":
// false, "allowlist": []}); nothing renders behind it until PR 1. The flag rides the
// SAME primitive as the Ask + widget keys. The contract to pin here is the
// same two properties every later UI PR (PR 1..3) depends on: log_picker_v2 is
// EXTRACTED off an app_config SELECT and it resolves FAIL-CLOSED (off) for both
// ship-dark cases — the seed unreached (undefined ⇒ fallback) and a signed-out caller
// against the dark seed. These are unit facts backing FL-1 (byte-identical off) and
// FL-2 (seed first).
describe('log_picker_v2 — log-picker redesign eligibility (B-745 PR 0)', () => {
  it('is part of the unset baseline (undefined until the row is fetched)', () => {
    expect(ALLOWLIST_FLAGS_UNSET.log_picker_v2).toBeUndefined();
  });

  it('extracts raw off an app_config SELECT, alongside the Ask + widget keys', () => {
    const rows = [
      { key: 'ask_enabled', value: { enabled: false, allowlist: ['a-uid'] } },
      { key: 'widget_enabled', value: { enabled: false, allowlist: ['w-uid'] } },
      { key: 'log_picker_v2', value: { enabled: false, allowlist: ['pm-uid'] } },
    ];
    const flags = extractAllowlistFlags(rows);
    expect(flags.log_picker_v2).toEqual({ enabled: false, allowlist: ['pm-uid'] });
    // The new key does not disturb the other allowlist keys in the same SELECT.
    expect(flags.ask_enabled).toEqual({ enabled: false, allowlist: ['a-uid'] });
    expect(flags.widget_enabled).toEqual({ enabled: false, allowlist: ['w-uid'] });
  });

  it('resolves fail-closed (off) when unset — seed unreached / row absent (FL-1)', () => {
    // A SELECT without the log-picker row leaves it undefined; the fallback=false
    // convention (how every allowlist gate is called) then renders the shipped
    // picker — flag-off is byte-identical because the gate is simply off.
    const unset = extractAllowlistFlags([{ key: 'ask_enabled', value: false }]).log_picker_v2;
    expect(unset).toBeUndefined();
    expect(resolveAllowlistFlag(unset, 'pm-uid', false)).toBe(false);
  });

  it('the shipped-dark seed {enabled:false, allowlist:[]} is off for everyone', () => {
    const darkSeed = { enabled: false, allowlist: [] };
    expect(resolveAllowlistFlag(darkSeed, 'pm-uid', false)).toBe(false);
    // …and off signed-out, never leaking to the fallback.
    expect(resolveAllowlistFlag(darkSeed, null, true)).toBe(false);
  });

  it('an allow-listed uid resolves on; other + signed-out callers stay off', () => {
    const gated = { enabled: false, allowlist: ['pm-uid'] };
    expect(resolveAllowlistFlag(gated, 'pm-uid', false)).toBe(true);
    expect(resolveAllowlistFlag(gated, 'someone-else', false)).toBe(false);
    expect(resolveAllowlistFlag(gated, null, false)).toBe(false); // signed out → off
  });

  it('survives the cache round-trip; a cache lacking it decodes to undefined', () => {
    const stored = { log_picker_v2: { enabled: false, allowlist: ['pm-uid'] } };
    expect(coerceAllowlistFlags(stored).log_picker_v2).toEqual({
      enabled: false,
      allowlist: ['pm-uid'],
    });
    expect(coerceAllowlistFlags({ ask_enabled: true }).log_picker_v2).toBeUndefined();
  });
});

// ── event_types_v2 — the event-taxonomy expansion gate (B-756/CUL-509, W1-PR-0) ──
// PR 0 is schema-only for consumption (migration 061 seeds it dark: {"enabled":
// false, "allowlist": []}); nothing renders behind it until W1-PR-2 gates the
// capture grid's tile list on it. The flag rides the SAME primitive as the Ask +
// widget + log-picker keys. The contract pinned here is the same two properties
// every later capture PR depends on: event_types_v2 is EXTRACTED off an
// app_config SELECT and resolves FAIL-CLOSED (off) for both ship-dark cases —
// the seed unreached (undefined ⇒ fallback) and a signed-out caller against the
// dark seed. These back the taxonomy spec's FL-1 (flag-off capture surfaces
// byte-identical — because the gate is simply off) and FL-2 (seed first).
describe('event_types_v2 — event-taxonomy expansion eligibility (B-756 W1-PR-0)', () => {
  it('is part of the unset baseline (undefined until the row is fetched)', () => {
    expect(ALLOWLIST_FLAGS_UNSET.event_types_v2).toBeUndefined();
  });

  it('extracts raw off an app_config SELECT, alongside the other allowlist keys', () => {
    const rows = [
      { key: 'widget_enabled', value: { enabled: false, allowlist: ['w-uid'] } },
      { key: 'log_picker_v2', value: { enabled: false, allowlist: ['lp-uid'] } },
      { key: 'event_types_v2', value: { enabled: false, allowlist: ['pm-uid'] } },
    ];
    const flags = extractAllowlistFlags(rows);
    expect(flags.event_types_v2).toEqual({ enabled: false, allowlist: ['pm-uid'] });
    // The new key does not disturb the other allowlist keys in the same SELECT.
    expect(flags.widget_enabled).toEqual({ enabled: false, allowlist: ['w-uid'] });
    expect(flags.log_picker_v2).toEqual({ enabled: false, allowlist: ['lp-uid'] });
  });

  it('resolves fail-closed (off) when unset — seed unreached / row absent (FL-1)', () => {
    const unset = extractAllowlistFlags([{ key: 'ask_enabled', value: false }]).event_types_v2;
    expect(unset).toBeUndefined();
    expect(resolveAllowlistFlag(unset, 'pm-uid', false)).toBe(false);
  });

  it('the shipped-dark seed {enabled:false, allowlist:[]} is off for everyone', () => {
    const darkSeed = { enabled: false, allowlist: [] };
    expect(resolveAllowlistFlag(darkSeed, 'pm-uid', false)).toBe(false);
    // …and off signed-out, never leaking to the fallback.
    expect(resolveAllowlistFlag(darkSeed, null, true)).toBe(false);
  });

  it('an allow-listed uid resolves on; other + signed-out callers stay off', () => {
    const gated = { enabled: false, allowlist: ['pm-uid'] };
    expect(resolveAllowlistFlag(gated, 'pm-uid', false)).toBe(true);
    expect(resolveAllowlistFlag(gated, 'someone-else', false)).toBe(false);
    expect(resolveAllowlistFlag(gated, null, false)).toBe(false); // signed out → off
  });

  it('survives the cache round-trip; a cache lacking it decodes to undefined', () => {
    const stored = { event_types_v2: { enabled: false, allowlist: ['pm-uid'] } };
    expect(coerceAllowlistFlags(stored).event_types_v2).toEqual({
      enabled: false,
      allowlist: ['pm-uid'],
    });
    expect(coerceAllowlistFlags({ ask_enabled: true }).event_types_v2).toBeUndefined();
  });
});
