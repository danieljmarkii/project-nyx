import { render, waitFor } from '@testing-library/react-native';
import FoodDetailScreen from './[id]';

// CUL-651 — the food detail screen's failure banner, at the seam the component
// test cannot reach: WHETHER IT RENDERS AT ALL.
//
// The banner was gated `isFailed && row.ai_extraction_error`, which reads as
// belt-and-braces and is not. `app/food-capture.tsx:631` upserts
// `ai_extraction_status: 'failed'` and never writes that column, which is what
// happens whenever extraction did not run: the daily/monthly cap (§4.3), the
// feature flag off, and a transport fault that never reached the Edge Function.
// All three left the owner with a food stuck at 'failed', no banner, and no way
// to ask for the retry — the failure hidden by the absence of a diagnostic
// string that never had an owner-facing job.
//
// So the case that matters here is `error: null`, and it is the one this file
// exists for. Confirmed against the pre-fix screen: it rendered nothing (CUL-613
// — a guard that has only ever been green has not been tested).

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
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockCurrentRow, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: jest.fn(),
    functions: { invoke: jest.fn(async () => ({ error: null })) },
  },
}));
jest.mock('../../lib/db', () => ({ getDb: () => ({ runAsync: jest.fn(), getAllAsync: jest.fn(async () => []) }) }));
jest.mock('../../lib/storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
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
jest.mock('../../store/snackbarStore', () => ({
  useSnackbarStore: { getState: () => ({ show: jest.fn() }) },
}));
jest.mock('../../store/foodLibraryStore', () => ({
  useFoodLibraryStore: { getState: () => ({ notifyChanged: jest.fn() }) },
}));

describe('food detail — the extraction-failure banner', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it('offers the retry on a failed food that stored no error (the cap / flag-off / transport path)', async () => {
    mockCurrentRow = foodRow({ ai_extraction_error: null });
    const { getByTestId } = render(<FoodDetailScreen />);
    await waitFor(() => expect(getByTestId('food-extraction-failed')).toBeTruthy());
    expect(getByTestId('food-extraction-retry')).toBeTruthy();
  });

  it('shows the same banner — and none of the stored string — when an error WAS stored', async () => {
    const stored = 'Claude API error 529: {"type":"error","error":{"type":"overloaded_error"}}';
    mockCurrentRow = foodRow({ ai_extraction_error: stored });
    const { getByTestId, queryByText, toJSON } = render(<FoodDetailScreen />);
    await waitFor(() => expect(getByTestId('food-extraction-failed')).toBeTruthy());
    expect(queryByText(stored)).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain('Claude API error');
  });

  // The raw cause is not discarded — it is the one thing that says WHY, and it is
  // the first thing anyone debugging a stuck food wants. Off the screen, into the
  // log: the same split the load path beside it already makes.
  it('logs the stored cause for diagnostics', async () => {
    const stored = 'DB update failed: duplicate key value violates unique constraint';
    mockCurrentRow = foodRow({ ai_extraction_error: stored });
    render(<FoodDetailScreen />);
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[food-detail] extraction failed for food-1:',
        stored,
      ),
    );
  });

  it('shows no failure banner on a food that extracted cleanly', async () => {
    mockCurrentRow = foodRow({ ai_extraction_status: 'completed', ai_extraction_error: null });
    const { queryByTestId, getByDisplayValue } = render(<FoodDetailScreen />);
    await waitFor(() => expect(getByDisplayValue('Royal Canin')).toBeTruthy());
    expect(queryByTestId('food-extraction-failed')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
