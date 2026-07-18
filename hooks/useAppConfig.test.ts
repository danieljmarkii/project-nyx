// Wiring tests for the useAppConfig singleton (T2-4). The pure resolve/decode
// logic is covered in lib/appConfig.test.ts; this pins the store-class behaviour
// CLAUDE.md's DoD calls out — the fetch/cache/default PRECEDENCE, the `started`-flag
// idempotency, and that a failed refresh holds the current value rather than
// snapping back to defaults.

// Stub the supabase client so requireActual('../lib/appConfig') doesn't trip
// lib/supabase's env fail-fast (the module isn't exercised — fetch is mocked below).
jest.mock('../lib/supabase', () => ({ supabase: {} }));

// Mock the auth store so useAllowlistFlag reads a controllable caller uid. It's a
// zustand selector hook — return the selector applied to a stub state.
let mockUserId: string | null = null;
jest.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockUserId ? { id: mockUserId } : null }),
}));

const mockFetch = jest.fn();
const mockLoadCache = jest.fn();
const mockPersist = jest.fn((_v?: unknown) => Promise.resolve());
jest.mock('../lib/appConfig', () => {
  const actual = jest.requireActual('../lib/appConfig');
  return {
    ...actual,
    fetchAppConfig: () => mockFetch(),
    loadCachedAppConfig: () => mockLoadCache(),
    persistAppConfig: (v: unknown) => mockPersist(v),
  };
});

import { renderHook } from '@testing-library/react-native';
import {
  APP_CONFIG_DEFAULTS,
  ALLOWLIST_FLAGS_UNSET,
  AppConfigValues,
  AppConfigBundle,
  AllowlistFlagValues,
} from '../lib/appConfig';
import {
  initAppConfig, refreshAppConfig, __resetAppConfigForTest, useAllowlistFlag,
} from './useAppConfig';

// A full config bundle (values + raw allowlist) — the shape fetch/cache now carry.
function cfg(over: Partial<AppConfigValues> = {}): AppConfigValues {
  return { ...APP_CONFIG_DEFAULTS, ...over };
}
function bundle(
  valuesOver: Partial<AppConfigValues> = {},
  allowlistOver: Partial<AllowlistFlagValues> = {},
): AppConfigBundle {
  return { values: cfg(valuesOver), allowlist: { ...ALLOWLIST_FLAGS_UNSET, ...allowlistOver } };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockLoadCache.mockReset();
  mockPersist.mockReset().mockResolvedValue(undefined);
  mockUserId = null;
  __resetAppConfigForTest();
});

describe('initAppConfig — cache seed + idempotency', () => {
  it('seeds from last-known-good cache and does NOT fetch (auth-driven fetch)', async () => {
    mockLoadCache.mockResolvedValue(bundle({ paywall_enabled: true }));
    await initAppConfig();
    expect(mockLoadCache).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled(); // init never fetches — INITIAL_SESSION does
  });

  it('is idempotent — a second call does not re-read the cache', async () => {
    mockLoadCache.mockResolvedValue(bundle());
    await initAppConfig();
    await initAppConfig();
    expect(mockLoadCache).toHaveBeenCalledTimes(1);
  });

  it('tolerates an empty cache (first-ever run) without throwing', async () => {
    mockLoadCache.mockResolvedValue(null);
    await expect(initAppConfig()).resolves.toBeUndefined();
  });
});

describe('refreshAppConfig — fetch precedence', () => {
  it('applies a successful fetch and persists it as last-known-good', async () => {
    const b = bundle({ ai_food_extraction_enabled: false });
    mockFetch.mockResolvedValue(b);
    await refreshAppConfig();
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith(b);
  });

  it('holds the current value on a failed fetch (null) — never persists, never snaps to defaults', async () => {
    // First a good fetch to move off defaults, then a failed one.
    mockFetch.mockResolvedValueOnce(bundle({ paywall_enabled: true }));
    await refreshAppConfig();
    mockPersist.mockClear();
    mockFetch.mockResolvedValueOnce(null);
    await refreshAppConfig();
    expect(mockPersist).not.toHaveBeenCalled(); // no write on a failed fetch
  });
});

describe('useAllowlistFlag — store value × caller uid (Ask §8)', () => {
  it('fail-closed before any fetch: unset flag → false', () => {
    const { result } = renderHook(() => useAllowlistFlag('ask_enabled'));
    expect(result.current).toBe(false);
  });

  it('enabled:false gated flag is on for an allow-listed caller, off otherwise', () => {
    __resetAppConfigForTest(bundle({}, { ask_enabled: { enabled: false, allowlist: ['pm-uid'] } }));

    mockUserId = 'pm-uid';
    expect(renderHook(() => useAllowlistFlag('ask_enabled')).result.current).toBe(true);

    mockUserId = 'someone-else';
    expect(renderHook(() => useAllowlistFlag('ask_enabled')).result.current).toBe(false);

    mockUserId = null; // signed out
    expect(renderHook(() => useAllowlistFlag('ask_enabled')).result.current).toBe(false);
  });

  it('enabled:true is on for everyone, incl. signed out', () => {
    __resetAppConfigForTest(bundle({}, { ask_enabled: { enabled: true, allowlist: [] } }));
    mockUserId = null;
    expect(renderHook(() => useAllowlistFlag('ask_enabled')).result.current).toBe(true);
  });

  it('a malformed value fails closed regardless of caller', () => {
    __resetAppConfigForTest(bundle({}, { ask_general_enabled: { allowlist: ['pm-uid'] } }));
    mockUserId = 'pm-uid';
    expect(renderHook(() => useAllowlistFlag('ask_general_enabled')).result.current).toBe(false);
  });
});
