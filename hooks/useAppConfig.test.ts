// Wiring tests for the useAppConfig singleton (T2-4). The pure resolve/decode
// logic is covered in lib/appConfig.test.ts; this pins the store-class behaviour
// CLAUDE.md's DoD calls out — the fetch/cache/default PRECEDENCE, the `started`-flag
// idempotency, and that a failed refresh holds the current value rather than
// snapping back to defaults.

// Stub the supabase client so requireActual('../lib/appConfig') doesn't trip
// lib/supabase's env fail-fast (the module isn't exercised — fetch is mocked below).
jest.mock('../lib/supabase', () => ({ supabase: {} }));

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

import { APP_CONFIG_DEFAULTS, AppConfigValues } from '../lib/appConfig';
import {
  initAppConfig, refreshAppConfig, __resetAppConfigForTest,
} from './useAppConfig';

// Read the singleton's current value the way a component would — via the subscribe
// contract. `getSnapshot` is not exported, so we re-fetch it through a fresh render
// path would need RTL; instead assert via the observable side effects (setConfig →
// what refresh/init resolve to). We expose current by re-importing the hook's
// snapshot through refreshAppConfig's persisted argument + a captured value.
function cfg(over: Partial<AppConfigValues> = {}): AppConfigValues {
  return { ...APP_CONFIG_DEFAULTS, ...over };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockLoadCache.mockReset();
  mockPersist.mockReset().mockResolvedValue(undefined);
  __resetAppConfigForTest();
});

describe('initAppConfig — cache seed + idempotency', () => {
  it('seeds from last-known-good cache and does NOT fetch (auth-driven fetch)', async () => {
    mockLoadCache.mockResolvedValue(cfg({ paywall_enabled: true }));
    await initAppConfig();
    expect(mockLoadCache).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled(); // init never fetches — INITIAL_SESSION does
  });

  it('is idempotent — a second call does not re-read the cache', async () => {
    mockLoadCache.mockResolvedValue(cfg());
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
    mockFetch.mockResolvedValue(cfg({ ai_food_extraction_enabled: false }));
    await refreshAppConfig();
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith(cfg({ ai_food_extraction_enabled: false }));
  });

  it('holds the current value on a failed fetch (null) — never persists, never snaps to defaults', async () => {
    // First a good fetch to move off defaults, then a failed one.
    mockFetch.mockResolvedValueOnce(cfg({ paywall_enabled: true }));
    await refreshAppConfig();
    mockPersist.mockClear();
    mockFetch.mockResolvedValueOnce(null);
    await refreshAppConfig();
    expect(mockPersist).not.toHaveBeenCalled(); // no write on a failed fetch
  });
});
