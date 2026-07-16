import {
  recordDisclaimerAcceptance,
  VETERINARY_DISCLAIMER_DOCUMENT,
  VETERINARY_DISCLAIMER_VERSION,
} from './legal';
import { supabase } from './supabase';

// Mock the Supabase client module wholesale — replacing it before legal.ts
// imports it also dodges the real module's fail-fast env-var check + AppState
// wiring, neither of which belongs in a unit test (same seam as profile.test.ts).
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = supabase.from as jest.Mock;

const USER_ID = 'user-1';

function mockAcceptancesTable(insertResult: {
  error: { code?: string; message: string } | null;
}) {
  const insert = jest.fn().mockResolvedValue(insertResult);
  mockedFrom.mockReturnValue({ insert });
  return { insert };
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('recordDisclaimerAcceptance', () => {
  it('inserts one acceptance row for the caller and reports recorded', async () => {
    const { insert } = mockAcceptancesTable({ error: null });

    await expect(recordDisclaimerAcceptance(USER_ID)).resolves.toEqual({
      status: 'recorded',
    });
    expect(mockedFrom).toHaveBeenCalledWith('legal_acceptances');
    expect(insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      document: VETERINARY_DISCLAIMER_DOCUMENT,
      version: VETERINARY_DISCLAIMER_VERSION,
    });
  });

  it('never sends accepted_at — the timestamp is server-stamped (migration 032 grant)', async () => {
    const { insert } = mockAcceptancesTable({ error: null });

    await recordDisclaimerAcceptance(USER_ID);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('accepted_at');
  });

  it('maps a PK conflict (23505) to already-recorded — a re-walk of the screen is not an error', async () => {
    mockAcceptancesTable({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    await expect(recordDisclaimerAcceptance(USER_ID)).resolves.toEqual({
      status: 'already-recorded',
    });
  });

  it('surfaces any other resolved error as error (no silent failure)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAcceptancesTable({ error: { code: '42501', message: 'permission denied' } });

    await expect(recordDisclaimerAcceptance(USER_ID)).resolves.toEqual({
      status: 'error',
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pins the document identity the record keys on', () => {
    // Load-bearing external strings: a drifted document/version string would
    // fragment the acceptance record across rows.
    expect(VETERINARY_DISCLAIMER_DOCUMENT).toBe('veterinary_disclaimer');
    expect(VETERINARY_DISCLAIMER_VERSION).toBe('2026-07-16');
  });
});
