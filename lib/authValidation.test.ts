import {
  isValidEmail,
  emailError,
  passwordError,
  requiredNameError,
  MIN_PASSWORD_LENGTH,
} from './authValidation';

describe('isValidEmail', () => {
  it('accepts a plain address (trimming surrounding whitespace)', () => {
    expect(isValidEmail('jordan@email.com')).toBe(true);
    expect(isValidEmail('  jordan@email.com  ')).toBe(true);
    expect(isValidEmail('a.b+tag@sub.domain.co')).toBe(true);
  });

  it('rejects the obvious typos we actually catch', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('jordan')).toBe(false); // no @
    expect(isValidEmail('jordan@')).toBe(false); // no domain
    expect(isValidEmail('jordan@email')).toBe(false); // no dot
    expect(isValidEmail('jordan @email.com')).toBe(false); // internal space
    expect(isValidEmail('a@b@c.com')).toBe(false); // two @
  });
});

describe('emailError', () => {
  it('is null for a valid address', () => {
    expect(emailError('jordan@email.com')).toBeNull();
  });

  it('distinguishes empty from malformed (specific, calm copy)', () => {
    expect(emailError('')).toBe('Enter your email address');
    expect(emailError('   ')).toBe('Enter your email address');
    expect(emailError('nope')).toBe("That doesn't look like an email address");
  });
});

describe('passwordError', () => {
  it('is null at or above the minimum length', () => {
    expect(passwordError('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordError('a'.repeat(MIN_PASSWORD_LENGTH + 5))).toBeNull();
  });

  it('distinguishes empty from too-short', () => {
    expect(passwordError('')).toBe('Choose a password');
    expect(passwordError('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it('does not trim the password (spaces are legitimate characters)', () => {
    // A password of exactly MIN spaces is long enough; we never strip it, unlike
    // the email/name fields where surrounding whitespace is noise.
    expect(passwordError(' '.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('requiredNameError', () => {
  it('is null once a non-blank name is present', () => {
    expect(requiredNameError('Jordan', 'first name')).toBeNull();
    expect(requiredNameError('  Rivera  ', 'last name')).toBeNull();
  });

  it('names the specific field so a two-field row is unambiguous', () => {
    expect(requiredNameError('', 'first name')).toBe('Add your first name');
    expect(requiredNameError('   ', 'last name')).toBe('Add your last name');
  });
});
