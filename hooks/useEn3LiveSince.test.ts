// The go-live day reaches a surface only with the key on for this caller (CUL-1513).
jest.mock('../lib/supabase', () => ({ supabase: {} }));
let mockUserId: string | null = null;
jest.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockUserId ? { id: mockUserId } : null }),
}));

import { renderHook } from '@testing-library/react-native';
import { APP_CONFIG_DEFAULTS, ALLOWLIST_FLAGS_UNSET, extractAllowlistFlags } from '../lib/appConfig';
import { __resetAppConfigForTest } from './useAppConfig';
import { useEn3LiveSince } from './useEn3LiveSince';

function seed(en3: unknown) {
  __resetAppConfigForTest({ values: APP_CONFIG_DEFAULTS, allowlist: { ...ALLOWLIST_FLAGS_UNSET, engines_v3_en3: en3 } });
}
const day = () => renderHook(() => useEn3LiveSince()).result.current;

beforeEach(() => {
  mockUserId = 'pm';
  __resetAppConfigForTest();
});

describe('useEn3LiveSince', () => {
  it('unseeded: null, so every dated line renders nothing', () => {
    expect(day()).toBeNull();
  });
  it('the key on for this caller and carrying a day: the day', () => {
    seed({ enabled: false, allowlist: ['pm'], live_since: '2026-10-20' });
    expect(day()).toBe('2026-10-20');
  });
  it('the key on but carrying no day: null (the lines wait for the day)', () => {
    seed({ enabled: false, allowlist: ['pm'] });
    expect(day()).toBeNull();
  });
  it('a day on a key that is off for this caller: null (their reads are all earlier-rule)', () => {
    seed({ enabled: false, allowlist: ['someone-else'], live_since: '2026-10-20' });
    expect(day()).toBeNull();
    mockUserId = null;
    seed({ enabled: false, allowlist: ['pm'], live_since: '2026-10-20' });
    expect(day()).toBeNull();
  });
  it('the fetch keeps the field: the raw row value reaches the store whole', () => {
    const raw = { enabled: true, live_since: '2026-10-20' };
    expect(extractAllowlistFlags([{ key: 'engines_v3_en3', value: raw }]).engines_v3_en3).toEqual(raw);
  });
});
