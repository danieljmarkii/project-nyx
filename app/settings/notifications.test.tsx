import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import NotificationsScreen from './notifications';
import { ensurePermission } from '../../lib/notifications';
import {
  readCategoryEnabled,
  applyCategoryPreference,
  reconcileFromPreferences,
} from '../../lib/notificationSettings';

// Pins the un-mocked notifications screen's load-bearing consent wiring (B-661
// PR 3, §2 + AC 2/6):
//   • the two gates never conflated — one system prompt, fired ONLY from a
//     toggle-on and ONLY after the primer;
//   • DECLINING THE PRIMER SPENDS NOTHING — ensurePermission(true) is never
//     reached (AC 2);
//   • a granted result enables + persists; a DENIED result never persists a
//     toggle-on the OS won't honor and drops to the inert state (§2 — no lie);
//   • the three honest states render truthfully, and reconcile runs on focus so a
//     revoked permission's orphan schedule is cancelled (AC 6).

jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    // Run the focus callback on mount (and honor its cleanup), the way a real
    // focus does when the screen first surfaces.
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => cb(), []),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
// A single active pet → the primer copy names it (single-pet warmth path).
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: { pets: { id: string; name: string }[] }) => unknown) =>
    sel({ pets: [{ id: 'p1', name: 'Biscuit' }] }),
}));
// Off the native SVG/animation path — the loader is not what this test pins.
jest.mock('../../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
// The primer now reads its copy from the category registry (DR-4), so the mock must
// expose the real NOTIFICATION_CATEGORIES (descriptor + copy) alongside the stubbed
// permission I/O the test drives.
jest.mock('../../lib/notifications', () => ({
  ensurePermission: jest.fn(),
  NOTIFICATION_CATEGORIES: jest.requireActual('../../lib/notifications').NOTIFICATION_CATEGORIES,
}));
jest.mock('../../lib/notificationSettings', () => ({
  readCategoryEnabled: jest.fn(),
  applyCategoryPreference: jest.fn(),
  reconcileFromPreferences: jest.fn(),
}));

const mockEnsure = ensurePermission as jest.Mock;
const mockRead = readCategoryEnabled as jest.Mock;
const mockApply = applyCategoryPreference as jest.Mock;
const mockReconcile = reconcileFromPreferences as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue(false);
  mockApply.mockResolvedValue(undefined);
  mockReconcile.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Every render resolves the focus read; wait for the live switch (or the denied
// banner) before interacting.
async function renderReady() {
  const utils = render(<NotificationsScreen />);
  await waitFor(() => utils.getByRole('switch'));
  return utils;
}

describe('state (a) undetermined — never asked', () => {
  beforeEach(() => mockEnsure.mockResolvedValue('undetermined'));

  it('toggling on opens the primer and does NOT fire the system prompt yet', async () => {
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    // Primer is up (names the single pet), and the OS prompt has NOT been spent.
    await waitFor(() => utils.getByText(/Biscuit.s day, gathered up/));
    expect(mockEnsure).toHaveBeenCalledTimes(1); // only the focus read…
    expect(mockEnsure).toHaveBeenCalledWith(false); // …and it was request=false
  });

  it('declining the primer spends nothing (AC 2)', async () => {
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    fireEvent.press(await utils.findByRole('button', { name: 'Not now' }));
    // The one prompt was never requested, and no preference was written.
    expect(mockEnsure).not.toHaveBeenCalledWith(true);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('confirming the primer → granted enables and persists the opt-in', async () => {
    mockEnsure.mockResolvedValueOnce('undetermined'); // focus read
    mockEnsure.mockResolvedValueOnce('granted'); // the primer's requested prompt
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    fireEvent.press(await utils.findByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith(true));
    expect(mockApply).toHaveBeenCalledWith('daily_summary', true);
  });

  it('confirming the primer → denied never persists the toggle-on and goes inert (§2)', async () => {
    mockEnsure.mockResolvedValueOnce('undetermined'); // focus read
    mockEnsure.mockResolvedValueOnce('denied'); // the prompt came back denied
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    fireEvent.press(await utils.findByRole('button', { name: 'Turn on' }));
    // No on-while-denied lie: the opt-in is NOT written, and the inert door appears.
    await waitFor(() => utils.getByText(/Notifications are off for Culprit/));
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// The 4th state code-reviewer named: a pref synced enabled=true from ANOTHER
// device, while THIS device's OS permission is still undetermined (never asked
// here). The switch must not render a live ON that a stray tap would flip to the
// disable branch — that would turn the summary off account-wide (LWW) for the
// device that actually granted it (AC 8).
describe('4th state — pref synced on, but this device never granted', () => {
  beforeEach(() => {
    mockEnsure.mockResolvedValue('undetermined'); // never asked HERE
    mockRead.mockResolvedValue(true); // enabled=true, synced from another device
  });

  it('renders the switch OFF, not a live ON a tap could silently disable', async () => {
    const utils = await renderReady();
    // Reflects "not active on this device", not the synced pref — so a stray tap
    // fires the ENABLE path, never a silent account-wide disable.
    expect(utils.getByRole('switch').props.value).toBe(false);
  });

  it('tapping it walks the primer (enable), never applyCategoryPreference(false)', async () => {
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    await waitFor(() => utils.getByText(/Biscuit.s day, gathered up/)); // the primer, not a disable
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe('state (b) granted', () => {
  beforeEach(() => mockEnsure.mockResolvedValue('granted'));

  it('toggling on enables directly, with no primer and no prompt', async () => {
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith('daily_summary', true));
    // Already granted → the primer never appears and the prompt is never re-fired.
    expect(utils.queryByRole('button', { name: 'Turn on' })).toBeNull();
    expect(mockEnsure).not.toHaveBeenCalledWith(true);
  });

  it('toggling off disables the category', async () => {
    mockRead.mockResolvedValue(true); // starts enabled
    const utils = await renderReady();
    fireEvent(utils.getByRole('switch'), 'valueChange', false);
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith('daily_summary', false));
  });
});

describe('state (c) OS-denied', () => {
  beforeEach(() => mockEnsure.mockResolvedValue('denied'));

  it('renders the honest inert line + the Settings door, and reconciles on focus (AC 6)', async () => {
    const utils = await renderReady();
    expect(utils.getByText(/Notifications are off for Culprit/)).toBeTruthy();
    // Orphan-schedule cleanup runs on focus, ahead of PR 4's app-foreground pass.
    expect(mockReconcile).toHaveBeenCalled();

    const openSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    fireEvent.press(utils.getByRole('button', { name: /Open/ }));
    expect(openSpy).toHaveBeenCalled();
  });

  it('keeps the switch inert (disabled + off) regardless of the stored pref', async () => {
    mockRead.mockResolvedValue(true); // pref is on underneath; permission trumps
    const utils = await renderReady();
    const sw = utils.getByRole('switch');
    expect(sw.props.value).toBe(false);
    expect(sw.props.disabled).toBe(true);
    // Alert is never surfaced just for being in the denied state.
    const alertSpy = jest.spyOn(Alert, 'alert');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
