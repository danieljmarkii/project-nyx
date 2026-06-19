import {
  DELETE_CONFIRM_PHRASE,
  canConfirmAccountDeletion,
  deleteAccountConfirmBody,
  isDeletePhraseTyped,
} from './account';

// account.ts imports the real supabase client; replacing it before that import
// resolves dodges the module's fail-fast env-var check, which has no place in a
// pure-logic unit test (same pattern as lib/profile.test.ts). The invoke wrapper
// itself is thin I/O — exercised by the Manual QA Script, not mocked here.
jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

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
  const armed = { typed: DELETE_CONFIRM_PHRASE, online: true, inFlight: false };

  it('arms only when typed + online + not in flight', () => {
    expect(canConfirmAccountDeletion(armed)).toBe(true);
  });

  it('blocks when the phrase is not typed', () => {
    expect(canConfirmAccountDeletion({ ...armed, typed: 'nope' })).toBe(false);
    expect(canConfirmAccountDeletion({ ...armed, typed: '' })).toBe(false);
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
