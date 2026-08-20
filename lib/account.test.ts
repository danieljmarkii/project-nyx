import {
  DELETE_CONFIRM_PHRASE,
  canConfirmAccountDeletion,
  deleteAccountConfirmBody,
  isDeletePhraseTyped,
  requestAccountDeletion,
} from './account';
import { supabase } from './supabase';

// account.ts imports the real supabase client; replacing it before that import
// resolves dodges the module's fail-fast env-var check, which has no place in a
// pure-logic unit test (same pattern as lib/profile.test.ts). The invoke call
// itself is mocked so the result-mapping (2xx / 401 re-auth refusal / other
// failure) can be pinned without a network.
jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;

describe('isDeletePhraseTyped', () => {
  it('matches the exact phrase', () => {
    expect(isDeletePhraseTyped('DELETE')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isDeletePhraseTyped('  DELETE  ')).toBe(true);
  });

  it('rejects the wrong case (no dark-pattern leniency that fires on a typo)', () => {
    expect(isDeletePhraseTyped('delete')).toBe(false);
    expect(isDeletePhraseTyped('Delete')).toBe(false);
  });

  it('rejects partial or empty input', () => {
    expect(isDeletePhraseTyped('DEL')).toBe(false);
    expect(isDeletePhraseTyped('')).toBe(false);
  });
});

describe('canConfirmAccountDeletion', () => {
  const armed = {
    typed: DELETE_CONFIRM_PHRASE,
    password: 'hunter2',
    online: true,
    inFlight: false,
  };

  it('arms only when typed + password entered + online + not in flight', () => {
    expect(canConfirmAccountDeletion(armed)).toBe(true);
  });

  it('blocks when the phrase is not typed', () => {
    expect(canConfirmAccountDeletion({ ...armed, typed: 'nope' })).toBe(false);
    expect(canConfirmAccountDeletion({ ...armed, typed: '' })).toBe(false);
  });

  it('blocks when no password has been entered (B-119)', () => {
    expect(canConfirmAccountDeletion({ ...armed, password: '' })).toBe(false);
  });

  it('treats a whitespace-only password as entered — never trims (B-119)', () => {
    // Presence only: the server is the sole authority on correctness, and
    // whitespace can be significant, so the arm predicate must not trim it away.
    expect(canConfirmAccountDeletion({ ...armed, password: ' ' })).toBe(true);
  });

  it('blocks when offline (FR-11)', () => {
    expect(canConfirmAccountDeletion({ ...armed, online: false })).toBe(false);
  });

  it('blocks while a delete is already in flight', () => {
    expect(canConfirmAccountDeletion({ ...armed, inFlight: true })).toBe(false);
  });
});

describe('deleteAccountConfirmBody', () => {
  it('names the single pet and uses singular-they "Their"', () => {
    const body = deleteAccountConfirmBody(['Mochi']);
    expect(body).toContain('for Mochi.');
    expect(body).toContain("Their health history can't be recovered");
    expect(body).toContain("can't be undone");
  });

  it('uses "your pets" for multiple pets (no single name)', () => {
    const body = deleteAccountConfirmBody(['Mochi', 'Luna']);
    expect(body).toContain('for your pets.');
    expect(body).not.toContain('Mochi');
    expect(body).toContain("can't be undone");
  });

  it('drops the pet clause when there are no pets', () => {
    const body = deleteAccountConfirmBody([]);
    expect(body).toContain("everything you've logged.");
    expect(body).not.toContain('health history');
    expect(body).toContain("can't be undone");
  });

  it('never uses an exclamation mark (nyx-voice Pattern 4)', () => {
    expect(deleteAccountConfirmBody(['Mochi'])).not.toContain('!');
    expect(deleteAccountConfirmBody(['Mochi', 'Luna'])).not.toContain('!');
    expect(deleteAccountConfirmBody([])).not.toContain('!');
  });
});

describe('requestAccountDeletion — result mapping (B-119)', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('sends the password in the body', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await requestAccountDeletion('hunter2');
    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: { password: 'hunter2' } });
  });

  it('returns ok only on an explicit { ok: true }', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await requestAccountDeletion('pw')).toEqual({ ok: true, reason: null, error: null });
  });

  it('maps the function 401 (wrong/absent password) to reason "reauth"', async () => {
    // supabase-js wraps a non-2xx as a FunctionsHttpError whose `context` is the
    // Response; the mapping reads context.status structurally.
    mockInvoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 401 } },
    });
    const res = await requestAccountDeletion('wrong');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('reauth');
  });

  it('maps a non-401 function error to reason "other" (never a false reauth)', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'boom', context: { status: 500 } },
    });
    expect((await requestAccountDeletion('pw')).reason).toBe('other');
  });

  it('maps a transport/relay error (no Response context) to reason "other"', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'network down', context: {} },
    });
    expect((await requestAccountDeletion('pw')).reason).toBe('other');
  });

  it('treats a 2xx without ok:true as a failure (never a false success)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });
    expect(await requestAccountDeletion('pw')).toEqual({
      ok: false,
      reason: 'other',
      error: 'Account deletion did not complete',
    });
  });

  it('maps a thrown error to reason "other"', async () => {
    mockInvoke.mockRejectedValue(new Error('boom'));
    expect(await requestAccountDeletion('pw')).toEqual({ ok: false, reason: 'other', error: 'boom' });
  });
});
