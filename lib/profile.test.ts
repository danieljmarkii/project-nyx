import {
  deriveDisplayName,
  fetchDisplayName,
  getDeviceTimezone,
  syncUserTimezone,
  updateDisplayName,
  updateOwnerName,
} from './profile';
import { supabase } from './supabase';

// Mock the Supabase client module wholesale — replacing it before profile.ts
// imports it also dodges the real module's fail-fast env-var check + AppState
// wiring, neither of which belongs in a unit test.
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = supabase.from as jest.Mock;

const DEVICE_TZ = 'America/New_York';
const USER_ID = 'user-1';

// Build a chainable stand-in for `from('user_profiles')`. Both the read chain
// (.select('timezone').eq('id', id).maybeSingle()) and the write (.upsert(...))
// hang off the single object that .from() returns, matching supabase-js.
function mockProfileTable(opts: {
  read?: { data: { timezone: string | null } | null; error: { message: string } | null };
  upsertResult?: { error: { message: string } | null };
}) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue(opts.read ?? { data: null, error: null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const upsert = jest.fn().mockResolvedValue(opts.upsertResult ?? { error: null });
  mockedFrom.mockReturnValue({ select, upsert });
  return { select, eq, maybeSingle, upsert };
}

// Control the device's resolved IANA zone. `undefined` models a runtime that
// can't supply one (some JS engines return '' / undefined).
function setDeviceTz(tz: string | undefined) {
  jest.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: tz }),
  } as unknown as Intl.DateTimeFormat);
}

beforeEach(() => {
  jest.restoreAllMocks(); // undo the Intl spy from the previous test
  mockedFrom.mockReset();
});

describe('getDeviceTimezone', () => {
  it('returns the resolved IANA zone', () => {
    setDeviceTz(DEVICE_TZ);
    expect(getDeviceTimezone()).toBe(DEVICE_TZ);
  });

  it('returns null when the runtime supplies no zone — never guesses', () => {
    setDeviceTz('');
    expect(getDeviceTimezone()).toBeNull();
    setDeviceTz(undefined);
    expect(getDeviceTimezone()).toBeNull();
  });

  it('returns null (never throws) when Intl itself throws', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable');
    });
    expect(getDeviceTimezone()).toBeNull();
  });
});

describe('syncUserTimezone', () => {
  it('creates the row via upsert when the profile does not exist yet (the dogfood case)', async () => {
    setDeviceTz(DEVICE_TZ);
    // maybeSingle → { data: null } is exactly what a missing profile row returns;
    // an UPDATE would match zero rows here, which is why the write must upsert.
    const t = mockProfileTable({ read: { data: null, error: null } });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'written', timezone: DEVICE_TZ });
    expect(t.select).toHaveBeenCalledWith('timezone');
    expect(t.eq).toHaveBeenCalledWith('id', USER_ID);
    expect(t.upsert).toHaveBeenCalledTimes(1);
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, timezone: DEVICE_TZ },
      { onConflict: 'id' },
    );
  });

  it('writes when the stored zone differs (travel / device change)', async () => {
    setDeviceTz(DEVICE_TZ);
    const t = mockProfileTable({
      read: { data: { timezone: 'Europe/London' }, error: null },
    });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'written', timezone: DEVICE_TZ });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, timezone: DEVICE_TZ },
      { onConflict: 'id' },
    );
  });

  it('does NOT write when the stored zone already matches (idempotent)', async () => {
    setDeviceTz(DEVICE_TZ);
    const t = mockProfileTable({
      read: { data: { timezone: DEVICE_TZ }, error: null },
    });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'unchanged', timezone: DEVICE_TZ });
    expect(t.upsert).not.toHaveBeenCalled();
  });

  it('is idempotent across calls: a second sync after a write is a no-op', async () => {
    setDeviceTz(DEVICE_TZ);

    // First call: no row yet → writes.
    const first = mockProfileTable({ read: { data: null, error: null } });
    const r1 = await syncUserTimezone(USER_ID);
    expect(r1).toEqual({ status: 'written', timezone: DEVICE_TZ });
    expect(first.upsert).toHaveBeenCalledTimes(1);

    // Second call: the row now reads back the just-written zone → no second write.
    const second = mockProfileTable({
      read: { data: { timezone: DEVICE_TZ }, error: null },
    });
    const r2 = await syncUserTimezone(USER_ID);
    expect(r2).toEqual({ status: 'unchanged', timezone: DEVICE_TZ });
    expect(second.upsert).not.toHaveBeenCalled();
  });

  it('skips entirely (no read, no write) when the device zone is unresolvable', async () => {
    setDeviceTz(undefined);
    const t = mockProfileTable({ read: { data: null, error: null } });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'skipped' });
    expect(mockedFrom).not.toHaveBeenCalled();
    expect(t.upsert).not.toHaveBeenCalled();
  });

  it('returns error (and does not write) when the read fails — no silent failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setDeviceTz(DEVICE_TZ);
    const t = mockProfileTable({
      read: { data: null, error: { message: 'boom' } },
    });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'error' });
    expect(t.upsert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('returns error when the upsert fails — no silent failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setDeviceTz(DEVICE_TZ);
    mockProfileTable({
      read: { data: null, error: null },
      upsertResult: { error: { message: 'rls denied' } },
    });

    const result = await syncUserTimezone(USER_ID);

    expect(result).toEqual({ status: 'error' });
    expect(warn).toHaveBeenCalled();
  });
});

// ── Owner display name (vet-report §7.1 — the "Owner:" line) ────────────────────

// The read chain differs from the timezone one only in the selected column; reuse
// the same chainable stand-in shape.
function mockNameTable(opts: {
  read?: { data: { display_name: string | null } | null; error: { message: string } | null };
  upsertResult?: { error: { message: string } | null };
}) {
  const maybeSingle = jest.fn().mockResolvedValue(opts.read ?? { data: null, error: null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const upsert = jest.fn().mockResolvedValue(opts.upsertResult ?? { error: null });
  mockedFrom.mockReturnValue({ select, upsert });
  return { select, eq, maybeSingle, upsert };
}

describe('fetchDisplayName', () => {
  it('returns the trimmed name', async () => {
    mockNameTable({ read: { data: { display_name: '  Daniel Mark ' }, error: null } });
    expect(await fetchDisplayName(USER_ID)).toEqual({ status: 'ok', displayName: 'Daniel Mark' });
  });

  it('missing row / blank name → null (the report then falls back to the email)', async () => {
    mockNameTable({ read: { data: null, error: null } });
    expect(await fetchDisplayName(USER_ID)).toEqual({ status: 'ok', displayName: null });
    mockNameTable({ read: { data: { display_name: '   ' }, error: null } });
    expect(await fetchDisplayName(USER_ID)).toEqual({ status: 'ok', displayName: null });
  });

  it('read failure → error status, no silent failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNameTable({ read: { data: null, error: { message: 'boom' } } });
    expect(await fetchDisplayName(USER_ID)).toEqual({ status: 'error' });
    expect(warn).toHaveBeenCalled();
  });
});

describe('updateDisplayName', () => {
  it('upserts the trimmed name (upsert, not update — a pre-trigger account has no row)', async () => {
    const t = mockNameTable({});
    const result = await updateDisplayName(USER_ID, '  Daniel Mark ');
    expect(result).toEqual({ status: 'written', displayName: 'Daniel Mark' });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, display_name: 'Daniel Mark' },
      { onConflict: 'id' },
    );
  });

  it('an empty string clears the name (writes NULL)', async () => {
    const t = mockNameTable({});
    const result = await updateDisplayName(USER_ID, '   ');
    expect(result).toEqual({ status: 'written', displayName: null });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, display_name: null },
      { onConflict: 'id' },
    );
  });

  it('write failure → error status, no silent failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNameTable({ upsertResult: { error: { message: 'rls denied' } } });
    expect(await updateDisplayName(USER_ID, 'X')).toEqual({ status: 'error' });
    expect(warn).toHaveBeenCalled();
  });
});

// ── Owner first / last name (onboarding account step, B-251 PR 1) ────────────────

describe('deriveDisplayName', () => {
  it('joins a trimmed first + last with a single space', () => {
    expect(deriveDisplayName('  Daniel ', ' Mark ')).toBe('Daniel Mark');
  });

  it('drops a missing part rather than leaving a stray space', () => {
    // "First " || " Last" semantics: a blank half must not produce " Mark" / "Daniel ".
    expect(deriveDisplayName('Daniel', '')).toBe('Daniel');
    expect(deriveDisplayName('', 'Mark')).toBe('Mark');
    expect(deriveDisplayName('Daniel', '   ')).toBe('Daniel');
    expect(deriveDisplayName('   ', 'Mark')).toBe('Mark');
  });

  it('both parts blank → null (report then falls back to the email)', () => {
    expect(deriveDisplayName('', '')).toBeNull();
    expect(deriveDisplayName('   ', '  ')).toBeNull();
  });

  it('preserves internal spacing / multi-part names', () => {
    expect(deriveDisplayName('Mary Jane', 'van der Berg')).toBe('Mary Jane van der Berg');
  });
});

describe('updateOwnerName', () => {
  it('upserts trimmed first/last + a derived display_name (upsert — a pre-trigger account has no row)', async () => {
    const t = mockNameTable({});
    const result = await updateOwnerName(USER_ID, '  Daniel ', ' Mark ');
    expect(result).toEqual({
      status: 'written',
      firstName: 'Daniel',
      lastName: 'Mark',
      displayName: 'Daniel Mark',
    });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, first_name: 'Daniel', last_name: 'Mark', display_name: 'Daniel Mark' },
      { onConflict: 'id' },
    );
  });

  it('a blank part is stored as NULL, and display_name is derived from the present part', async () => {
    const t = mockNameTable({});
    const result = await updateOwnerName(USER_ID, 'Daniel', '   ');
    expect(result).toEqual({
      status: 'written',
      firstName: 'Daniel',
      lastName: null,
      displayName: 'Daniel',
    });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, first_name: 'Daniel', last_name: null, display_name: 'Daniel' },
      { onConflict: 'id' },
    );
  });

  it('both parts blank → all three columns NULL', async () => {
    const t = mockNameTable({});
    const result = await updateOwnerName(USER_ID, '  ', '');
    expect(result).toEqual({
      status: 'written',
      firstName: null,
      lastName: null,
      displayName: null,
    });
    expect(t.upsert).toHaveBeenCalledWith(
      { id: USER_ID, first_name: null, last_name: null, display_name: null },
      { onConflict: 'id' },
    );
  });

  it('write failure → error status, no silent failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNameTable({ upsertResult: { error: { message: 'rls denied' } } });
    expect(await updateOwnerName(USER_ID, 'Daniel', 'Mark')).toEqual({ status: 'error' });
    expect(warn).toHaveBeenCalled();
  });
});
