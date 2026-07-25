import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RECOVERY_PROVENANCE_WINDOW_MS,
  clearRecoveryRequest,
  coerceRecoveryRequest,
  hasLocalProvenance,
  readRecoveryRequest,
  recordRecoveryRequest,
} from './recoveryMarker';

const KEY = 'nyx.recoveryRequest';
const t0 = 1_700_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('recordRecoveryRequest / readRecoveryRequest (FR-12)', () => {
  it('round-trips the address and the request time', async () => {
    await recordRecoveryRequest('jordan@example.com', t0);
    expect(await readRecoveryRequest()).toEqual({
      email: 'jordan@example.com',
      requestedAtMs: t0,
    });
  });

  it('trims the address so a pasted email with whitespace still pre-fills cleanly', async () => {
    await recordRecoveryRequest('  jordan@example.com \n', t0);
    expect((await readRecoveryRequest())?.email).toBe('jordan@example.com');
  });

  it('overwrites on a resend, so the marker always describes the latest request', async () => {
    await recordRecoveryRequest('first@example.com', t0);
    await recordRecoveryRequest('second@example.com', t0 + 90_000);
    expect(await readRecoveryRequest()).toEqual({
      email: 'second@example.com',
      requestedAtMs: t0 + 90_000,
    });
  });

  it('reads null when this device never asked', async () => {
    expect(await readRecoveryRequest()).toBeNull();
  });

  it('reads null on a corrupt blob rather than throwing on every deep link', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    expect(await readRecoveryRequest()).toBeNull();
  });

  it('reads null on a storage failure — fail-closed', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('nope'));
    expect(await readRecoveryRequest()).toBeNull();
  });

  it('never throws when the write fails — the owner still gets their email', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(recordRecoveryRequest('jordan@example.com', t0)).resolves.toBeUndefined();
  });

  it('clears', async () => {
    await recordRecoveryRequest('jordan@example.com', t0);
    await clearRecoveryRequest();
    expect(await readRecoveryRequest()).toBeNull();
  });
});

describe('coerceRecoveryRequest', () => {
  it('accepts a well-formed marker', () => {
    expect(coerceRecoveryRequest({ email: 'a@b.co', requestedAtMs: t0 })).toEqual({
      email: 'a@b.co',
      requestedAtMs: t0,
    });
  });

  it('rejects anything half-written or format-changed', () => {
    // A partial blob must not present as provenance.
    expect(coerceRecoveryRequest(null)).toBeNull();
    expect(coerceRecoveryRequest('a@b.co')).toBeNull();
    expect(coerceRecoveryRequest({ email: 'a@b.co' })).toBeNull();
    expect(coerceRecoveryRequest({ requestedAtMs: t0 })).toBeNull();
    expect(coerceRecoveryRequest({ email: '', requestedAtMs: t0 })).toBeNull();
    expect(coerceRecoveryRequest({ email: 'a@b.co', requestedAtMs: 'soon' })).toBeNull();
    expect(coerceRecoveryRequest({ email: 'a@b.co', requestedAtMs: NaN })).toBeNull();
  });
});

describe('hasLocalProvenance (FR-14)', () => {
  it('refuses a link when this device never requested a reset (§10 row 23)', () => {
    // The hostile deep link: `nyx:///reset-password?code=x` fired from Safari.
    // No marker ⇒ the gate never arms and no code is ever exchanged.
    expect(hasLocalProvenance(null, t0)).toBe(false);
  });

  it('honours a request made moments ago', () => {
    expect(hasLocalProvenance({ email: 'a@b.co', requestedAtMs: t0 }, t0 + 60_000)).toBe(
      true,
    );
  });

  it('honours a request at the window boundary but not past it', () => {
    const req = { email: 'a@b.co', requestedAtMs: t0 };
    expect(hasLocalProvenance(req, t0 + RECOVERY_PROVENANCE_WINDOW_MS)).toBe(true);
    expect(hasLocalProvenance(req, t0 + RECOVERY_PROVENANCE_WINDOW_MS + 1)).toBe(false);
  });

  it('expires a stale marker, so provenance is not granted forever', () => {
    // Without the window, a marker written months ago would let a hostile deep
    // link pass FR-14 indefinitely — reducing the control to "has this owner ever
    // used recovery".
    const monthsLater = t0 + 90 * 24 * 60 * 60 * 1000;
    expect(hasLocalProvenance({ email: 'a@b.co', requestedAtMs: t0 }, monthsLater)).toBe(
      false,
    );
  });

  it('refuses a future-dated marker (clock change / restored backup)', () => {
    expect(hasLocalProvenance({ email: 'a@b.co', requestedAtMs: t0 }, t0 - 1)).toBe(false);
  });

  it('accepts a caller-supplied window so QA can tune it against the real link lifetime', () => {
    const req = { email: 'a@b.co', requestedAtMs: t0 };
    expect(hasLocalProvenance(req, t0 + 2 * 60 * 60 * 1000, 60 * 60 * 1000)).toBe(false);
  });
});
