import { ownerInitial } from './owner';

describe('ownerInitial', () => {
  it('returns the uppercased first letter of the email (spec §D10)', () => {
    expect(ownerInitial('danieljmarkii@gmail.com')).toBe('D');
  });

  it('uppercases a lowercase leading letter', () => {
    expect(ownerInitial('sam@example.com')).toBe('S');
  });

  it('skips a leading non-alphanumeric character to the first real one', () => {
    expect(ownerInitial('.hidden@example.com')).toBe('H');
    expect(ownerInitial('+tag@example.com')).toBe('T');
  });

  it('accepts a leading digit as a valid monogram', () => {
    expect(ownerInitial('123mail@example.com')).toBe('1');
  });

  it('trims surrounding whitespace before reading the initial', () => {
    expect(ownerInitial('  jordan@example.com ')).toBe('J');
  });

  it('falls back to null (→ neutral glyph) when there is no email', () => {
    expect(ownerInitial(null)).toBeNull();
    expect(ownerInitial(undefined)).toBeNull();
    expect(ownerInitial('')).toBeNull();
    expect(ownerInitial('   ')).toBeNull();
  });

  it('falls back to null when nothing is alphanumeric (never a punctuation monogram)', () => {
    expect(ownerInitial('.@-')).toBeNull();
    expect(ownerInitial('___')).toBeNull();
  });
});
