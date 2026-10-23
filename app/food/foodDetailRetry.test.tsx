import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FoodDetailScreen from './[id]';
import { foodCapCopy } from '../../constants/monetizationCopy';
import {
  RETRY_CAP_TITLE,
  RETRY_READING_OFF_NOTICE,
  RETRY_TRANSPORT_NOTICE,
  RETRY_UNAVAILABLE_NOTICE,
} from '../../lib/foodRetry';
import { useAiConsentStore } from '../../store/aiConsentStore';
import { useAuthStore } from '../../store/authStore';
import { saveAiConsent } from '../../store/aiConsentStore';

// CUL-769, the retry half: food detail's retry, over every way the call can answer. Two
// things hold in all of them. No 'pending' is ever written to the server for this food
// (the strand, and the reaper's eligibility, both started there), and the screen leaves
// its pending state once the call answers: the Ingredients field comes back, never a
// "Reading the label…" spinner over a call that is over. And the owner is told what
// happened, never a quiet return that reads as a read that ran.

const foodRow = (over: Record<string, unknown> = {}) => ({
  id: 'food-1',
  brand: 'Royal Canin',
  product_name: 'Gastrointestinal',
  format: 'dry_kibble',
  food_type: 'food',
  ingredients_notes: null,
  upc_barcode: null,
  photo_paths: [],
  primary_protein: null,
  proteins: [],
  ai_extraction_status: 'failed',
  ai_extraction_error: null,
  ai_extraction_confidence: null,
  source: 'ai_extracted',
  ...over,
});

let mockCurrentRow: Record<string, unknown> = foodRow();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'food-1' }),
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
// Every write the screen makes is recorded, so "no 'pending' reaches the server" is an
// assertion over what was SENT. The re-read answers with `mockServerRow` (the server's
// truth after the call), or fails when `mockReadFails` counts it down.
const mockUpdates: Array<{ table: string; values: Record<string, unknown> }> = [];
let mockServerRow: Record<string, unknown> = {};
let mockReadFails = 0;
let mockReads = 0;
const mockInvoke = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            mockReads += 1;
            if (mockReads > 1 && mockReadFails > 0) {
              mockReadFails -= 1;
              return { data: null, error: { message: 'network' } };
            }
            return { data: mockReads === 1 ? mockCurrentRow : mockServerRow, error: null };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => {
        mockUpdates.push({ table, values });
        return { eq: async () => ({ error: null }) };
      },
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: jest.fn(),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));
jest.mock('../../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(), getAllAsync: jest.fn(async () => []) }), getMixedBowls: jest.fn(async () => []) }));
jest.mock('../../lib/storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn(), getSignedUrl: jest.fn(async () => null) }));
jest.mock('../../lib/foodArchive', () => ({ archiveFood: jest.fn(), restoreFood: jest.fn() }));
jest.mock('../../lib/trialContaminant', () => ({
  loadTrialProteinContext: jest.fn(async () => null),
  foodContaminantFlag: () => null,
  standingFlagCopy: () => null,
}));
jest.mock('../../hooks/useTrialAllowedSet', () => ({
  useTrialAllowedSet: () => ({ status: 'none' }),
}));
// Selector-aware, because the subtree reads it both ways: the screen calls
// `usePetStore()` bare, `AlwaysAvailableCard` calls it with a selector — and it
// also imports `orderPetsActiveFirst` from the same module, which a thin mock
// drops and which then throws mid-render.
jest.mock('../../store/petStore', () => {
  const state = {
    activePet: { id: 'p1', name: 'Biscuit' },
    pets: [{ id: 'p1', name: 'Biscuit', species: 'cat' }],
  };
  const usePetStore = (sel?: (s: typeof state) => unknown) =>
    (typeof sel === 'function' ? sel(state) : state);
  usePetStore.getState = () => state;
  return {
    usePetStore,
    orderPetsActiveFirst: (pets: unknown[]) => pets,
    resolveRecordPetName: () => 'Biscuit',
  };
});
// The consent door's read is stubbed (the door itself is real, `useAiConsentDoor`); each
// test says what the read answers. 'proceed' is a yes on file.
const mockDoorState = jest.fn();
jest.mock('../../store/aiConsentStore', () => ({
  ...jest.requireActual('../../store/aiConsentStore'),
  consentDoorState: (...args: unknown[]) => mockDoorState(...args),
  saveAiConsent: jest.fn(),
}));
jest.mock('../../store/snackbarStore', () => ({
  useSnackbarStore: { getState: () => ({ show: jest.fn() }) },
}));
jest.mock('../../store/foodLibraryStore', () => ({
  useFoodLibraryStore: { getState: () => ({ notifyChanged: jest.fn() }) },
}));


const STORED = 'Claude did not return a valid extraction result';
const FAILED = { ai_extraction_status: 'failed', ai_extraction_error: STORED, photo_paths: ['u/food-1/a.jpg'] };

async function renderFailed() {
  mockCurrentRow = foodRow(FAILED);
  mockServerRow = mockCurrentRow;
  const view = render(<FoodDetailScreen />);
  await waitFor(() => expect(view.getByTestId('food-extraction-retry')).toBeTruthy());
  return view;
}

async function tapRetry(view: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.press(view.getByTestId('food-extraction-retry'));
  });
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const declined = { granted: false, copyVersion: 'v', source: 'settings', decidedAt: '2026-10-12T00:00:00Z' };
const granted = { ...declined, granted: true };

describe('food detail — the retry never strands the food (CUL-769)', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  beforeEach(() => {
    mockUpdates.length = 0;
    mockReads = 0;
    mockReadFails = 0;
    mockInvoke.mockReset();
    alert.mockClear();
    useAuthStore.setState({ user: { id: 'u1' } } as never);
    useAiConsentStore.getState().reset();
    // A yes on file, so these cases reach the call (CUL-1905's door sends on nothing less).
    useAiConsentStore.getState().setRow('u1', granted);
    mockDoorState.mockReset();
    mockDoorState.mockResolvedValue('proceed');
  });
  afterAll(() => {
    warn.mockRestore();
    alert.mockRestore();
  });

  const neverPending = () =>
    expect(mockUpdates.filter((u) => u.table === 'food_items' && 'ai_extraction_status' in u.values)).toEqual([]);

  it('a transport fault: nothing written, the failed state and its retry come back, "try again"', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(view.getByTestId('food-extraction-retry')).toBeTruthy();
    expect(view.queryByText('Reading the label…')).toBeNull();
    expect(alert).toHaveBeenCalledWith(RETRY_TRANSPORT_NOTICE.title, RETRY_TRANSPORT_NOTICE.body);
  });

  it('the cap: nothing written, still failed, and the cap copy says when reading resumes', async () => {
    mockInvoke.mockResolvedValue({ data: { cap_reached: true, cap: 'daily' }, error: null });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(view.getByTestId('food-extraction-retry')).toBeTruthy();
    expect(alert).toHaveBeenCalledWith(RETRY_CAP_TITLE, foodCapCopy('daily'));
  });

  it('a no recorded on another phone while the call is out: the server refuses, and "AI reading is off" names the setting', async () => {
    mockInvoke.mockImplementation(async () => {
      useAiConsentStore.getState().setRow('u1', declined);
      return { data: { feature_disabled: true }, error: null };
    });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(view.getByTestId('food-extraction-retry')).toBeTruthy();
    expect(view.queryByText('Reading the label…')).toBeNull();
    expect(alert).toHaveBeenCalledWith(RETRY_READING_OFF_NOTICE.title, RETRY_READING_OFF_NOTICE.body);
  });

  it('the flag off, with no recorded no: the line that is true either way', async () => {
    mockInvoke.mockResolvedValue({ data: { feature_disabled: true }, error: null });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(alert).toHaveBeenCalledWith(RETRY_UNAVAILABLE_NOTICE.title, RETRY_UNAVAILABLE_NOTICE.body);
  });

  it('the re-read fails too: the screen still leaves pending, back to the status it had', async () => {
    mockReadFails = 1;
    mockInvoke.mockResolvedValue({ data: { feature_disabled: true }, error: null });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(view.queryByText('Reading the label…')).toBeNull();
    expect(view.getByTestId('food-extraction-retry')).toBeTruthy();
  });

  it('a read that ran: nothing written by the phone, the server\'s completed row lands, no alert', async () => {
    mockInvoke.mockImplementation(async () => {
      mockServerRow = foodRow({ ...FAILED, ai_extraction_status: 'completed', ai_extraction_error: null, ingredients_notes: 'Chicken, rice' });
      return { data: { extraction: { brand: 'Royal Canin' } }, error: null };
    });
    const view = await renderFailed();
    await tapRetry(view);
    neverPending();
    expect(view.queryByTestId('food-extraction-failed')).toBeNull();
    expect(view.getByDisplayValue('Chicken, rice')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
  });
});

// CUL-1905: the retry sends the stored label photos to Anthropic, so it waits on the
// same consent door as Add by photo. A recorded no, and an owner who has not answered,
// never reach the invoke from either button unless the door answers yes first.
describe('food detail — the retry passes the AI consent door (CUL-1905)', () => {
  // Spied here rather than at definition: the suite above restores its own spies in its
  // afterAll, which would take spies made at definition time down with them.
  let warn: jest.SpyInstance;
  let alert: jest.SpyInstance;
  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  beforeEach(() => {
    mockUpdates.length = 0;
    mockReads = 0;
    mockReadFails = 0;
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ data: { extraction: {} }, error: null });
    alert.mockClear();
    useAuthStore.setState({ user: { id: 'u1' } } as never);
    useAiConsentStore.getState().reset();
    mockDoorState.mockReset();
  });
  afterAll(() => {
    warn.mockRestore();
    alert.mockRestore();
  });

  const COMPLETED = { ...FAILED, ai_extraction_status: 'completed', ai_extraction_error: null };
  const BUTTONS = [
    { name: 'Try again (failed)', fields: FAILED, testID: 'food-extraction-retry' },
    { name: 'Re-run AI extraction (completed)', fields: COMPLETED, testID: 'food-extraction-rerun' },
  ] as const;

  async function renderWith(fields: Record<string, unknown>, testID: string) {
    mockCurrentRow = foodRow(fields);
    mockServerRow = mockCurrentRow;
    const view = render(<FoodDetailScreen />);
    await waitFor(() => expect(view.getByTestId(testID)).toBeTruthy());
    return view;
  }

  async function press(view: ReturnType<typeof render>, testID: string) {
    await act(async () => {
      fireEvent.press(view.getByTestId(testID));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  describe.each(BUTTONS)('$name', ({ fields, testID }) => {
    it('a recorded no: no sheet, nothing sent, and the owner is told the label was not read', async () => {
      mockDoorState.mockResolvedValue('declined');
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockDoorState).toHaveBeenCalledWith('u1');
      expect(view.queryByTestId('consent-not-now')).toBeNull();
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(view.getByTestId(testID)).toBeTruthy();
      expect(alert).toHaveBeenCalledWith(RETRY_READING_OFF_NOTICE.title, RETRY_READING_OFF_NOTICE.body);
    });

    it('no answer yet: the door asks, and Not now sends nothing', async () => {
      mockDoorState.mockResolvedValue('ask');
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockInvoke).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(view.getByTestId('consent-not-now'));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 800));
      });
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    });

    it("no answer yet: Don't allow sends nothing", async () => {
      mockDoorState.mockResolvedValue('ask');
      (saveAiConsent as jest.Mock).mockImplementation(async (userId: string) => {
        useAiConsentStore.getState().setRow(userId, declined);
        return { status: 'saved', row: declined };
      });
      const view = await renderWith(fields, testID);
      await press(view, testID);
      await act(async () => {
        fireEvent.press(view.getByTestId('consent-dont-allow'));
      });
      await waitFor(
        () => expect(alert).toHaveBeenCalledWith(RETRY_READING_OFF_NOTICE.title, RETRY_READING_OFF_NOTICE.body),
        { timeout: 3000 },
      );
      expect(saveAiConsent).toHaveBeenCalledWith('u1', false, 'backstop');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('no answer yet: Allow saves the yes, then the label is read', async () => {
      mockDoorState.mockResolvedValue('ask');
      // The real write lands the yes in the phone's copy; the stub does the same.
      (saveAiConsent as jest.Mock).mockImplementation(async (userId: string) => {
        useAiConsentStore.getState().setRow(userId, granted);
        return { status: 'saved', row: granted };
      });
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockInvoke).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(view.getByTestId('consent-allow'));
      });
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(saveAiConsent).toHaveBeenCalledWith('u1', true, 'backstop');
    });

    it('the consent read failed or stalled: nothing sent, "try again" (CUL-1933)', async () => {
      mockDoorState.mockResolvedValue('unreadable');
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(RETRY_TRANSPORT_NOTICE.title, RETRY_TRANSPORT_NOTICE.body);
    });

    it('a stale yes in the cache never overrides an unreadable answer', async () => {
      mockDoorState.mockResolvedValue('unreadable');
      useAiConsentStore.getState().setRow('u1', granted);
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('a proceed with nothing on the phone: nothing sent, "try again" (the second lock, #1213)', async () => {
      mockDoorState.mockResolvedValue('proceed');
      const view = await renderWith(fields, testID);
      await press(view, testID);
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(RETRY_TRANSPORT_NOTICE.title, RETRY_TRANSPORT_NOTICE.body);
    });

    it('a yes on file: no sheet, and the label is read', async () => {
      mockDoorState.mockResolvedValue('proceed');
      useAiConsentStore.getState().setRow('u1', granted);
      const view = await renderWith(fields, testID);
      await press(view, testID);
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
      expect(view.queryByTestId('consent-not-now')).toBeNull();
    });
  });
});
