// CUL-879 — the vet-visit photo path's EXIF stamp is the visit's DATE.
//
// Scope is deliberately one rule: a future-dated EXIF stamp never becomes
// `visitedAt`. This screen has no other suite, and the rest of it (upload,
// the local write, the sync hand-off) is covered where those decisions live.
//
// Why a rendered screen rather than a unit test of the expression: the guard IS
// `trustedPastExifIso`, which `lib/utils` already tests, so re-composing it in a
// fixture would re-derive the production rule and pass over the one thing that
// can actually regress here — the call site dropping the wrapper (C-34). The
// assertion therefore drives the real picker path and reads the date the owner
// sees. Proven by mutation against the pre-fix source: unwrapping the call makes
// the future case red.
//
// KNOWN BLIND SPOT, stated because an undocumented one reads as coverage (C-41).
// These three assertions read the date the owner SEES, not the date the screen
// STORES, and on this screen those are different values: `handleSave` serialises
// through `isoToDateOnly(visitedAt.toISOString())` — the UTC day — so in a
// negative-offset zone an evening visit is written as TOMORROW while the field
// above it shows today. That is CUL-946 (Urgent, `Waiting on PM`, its own
// one-line fix via `localDateKey`), live on this screen and NOT what this suite
// is about, but it means the rendered-date assertions below cannot be read as
// proof that no future date reaches the record. They prove the EXIF door is shut.
// The clock-default door is CUL-946's, and it is still open.
//
// So: `maximumDate={new Date()}` bounds the PICKER, and EXIF is now guarded — but
// neither closes the serialisation. Do not restate "EXIF is the only way a future
// visit date can enter this screen"; an earlier draft of this header did, and it
// was false when written.

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), replace: jest.fn(), push: jest.fn() },
  Redirect: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Flag-OFF is this screen's live configuration (flag-on it redirects to the VV-4
// companion), so both gates read false and the screen under test is the one an
// owner reaches today.
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));

// The screen's import graph reaches supabase and SQLite; nothing under test
// writes or uploads, so both are stubbed to the shape the render path touches.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/db', () => ({ getDb: jest.fn() }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn(), compressForUpload: jest.fn(), persistCapture: jest.fn(),
}));
jest.mock('../lib/sync', () => ({ syncPendingVetVisits: jest.fn() }));

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import VetVisitModal from './vet-visit';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';

const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;

/** Press a button on the most recent Alert.alert by its label. */
function pressAlert(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const calls = spy.mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)?.onPress?.();
}

/** EXIF's own naive format: "YYYY:MM:DD HH:MM:SS". */
function exifStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const longDate = (d: Date) =>
  d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

/** Render, attach a photo carrying `exif`, and land on the details step. */
async function attachAndContinue(exif: Record<string, unknown>) {
  const screen = render(<VetVisitModal />);
  launchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/discharge.jpg', width: 3024, height: 4032, exif }],
  });
  fireEvent.press(screen.getByText('Tap to add a photo'));
  await act(async () => { pressAlert('Take photo'); });
  await waitFor(() => expect(screen.getByText('Replace photo')).toBeTruthy());
  fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(screen.getByText('Visit date')).toBeTruthy());
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Biscuit' }] as never,
    activePet: { id: 'p1', name: 'Biscuit' } as never,
  });
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  launchCamera.mockResolvedValue({ canceled: true });
});

afterEach(() => {
  (Alert.alert as unknown as jest.Mock).mockRestore?.();
});

describe('vet visit — EXIF seeds the visit date (CUL-879)', () => {
  // Anchored to Date.now() rather than a literal, so it cannot start failing on a
  // calendar boundary instead of on a change (C-29).
  it('ignores a future EXIF stamp and keeps the clock default', async () => {
    const now = new Date();
    const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const screen = await attachAndContinue({ DateTimeOriginal: exifStamp(nextYear) });

    expect(screen.queryByText(longDate(nextYear))).toBeNull();
    expect(screen.getByText(longDate(now))).toBeTruthy();
  });

  // The negative half: the guard must not eat a legitimate stamp. Without this a
  // call site that dropped EXIF entirely would pass the test above.
  it('accepts a past EXIF stamp as the visit date', async () => {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const screen = await attachAndContinue({ DateTimeOriginal: exifStamp(lastWeek) });

    expect(screen.getByText(longDate(lastWeek))).toBeTruthy();
  });

  it('falls through to the clock default when the photo carries no EXIF date', async () => {
    const now = new Date();
    const screen = await attachAndContinue({});

    expect(screen.getByText(longDate(now))).toBeTruthy();
  });
});
