// CUL-803 — the incident screen's record block and its lightbox caption (incident spec
// §5.1 / §5.4). Same harness shape as `weightSection.test.tsx`: the screen is a
// 1100-line surface over the picker, the filesystem, storage, sync and two analysis
// pipelines, so the module graph below is mocked whole and the test is about the two
// things this PR added to the screen itself.
//
// The analysis sections are stubbed out on purpose — they have their own tests, and what
// is under test here is the RECORD block (who) and the viewer caption (when).

jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class { exists = true; constructor(_u: string) {} } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue(null), compressForUpload: jest.fn(),
  persistCapture: jest.fn(), MAX_EDGE_PX: 1600,
}));
jest.mock('../../lib/attachments', () => ({ detachEventAttachment: jest.fn(), detachOtherEventAttachments: jest.fn() }));
jest.mock('../../lib/sync', () => ({ syncPendingMeals: jest.fn(), syncPendingMedicationAdministrations: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(), triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: jest.fn(() => ({ settle: jest.fn() })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../lib/haptics', () => ({ destructiveConfirm: jest.fn() }));
jest.mock('../../components/event/VomitAnalysisSection', () => ({ VomitAnalysisSection: () => null }));
jest.mock('../../components/event/StoolAnalysisSection', () => ({ StoolAnalysisSection: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'evt-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
  };
});

const mockGetEventById = jest.fn();
const mockGetEventAttachment = jest.fn();
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync: jest.fn() }),
  getEventById: (...a: unknown[]) => mockGetEventById(...a),
  getEventAttachment: (...a: unknown[]) => mockGetEventAttachment(...a),
  getEventAttachments: jest.fn().mockResolvedValue([]),
  getEventSource: jest.fn().mockResolvedValue('now'),
  getMealForEvent: jest.fn().mockResolvedValue(null),
  getDoseForEvent: jest.fn().mockResolvedValue(null),
  getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
  updateMealIntake: jest.fn(), updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
}));
jest.mock('../../store/eventStore', () => {
  const state = { removeFromToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
// The RECORD's pet is Biscuit; the ACTIVE pet is Rex. Every name this screen prints must
// come from the first (C-9) — on a multi-pet account the tap-through from a cross-pet
// surface lands here on a pet who is not the active one.
const mockResolveRecordPetName = jest.fn();
jest.mock('../../store/petStore', () => {
  const state = {
    pets: [{ id: 'pet-A', name: 'Biscuit' }, { id: 'pet-B', name: 'Rex' }],
    activePet: { id: 'pet-B', name: 'Rex' },
  };
  return {
    usePetStore: Object.assign(() => state, { getState: () => state }),
    resolveRecordPetName: (...a: unknown[]) => mockResolveRecordPetName(...a),
  };
});

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import EventDetailScreen from './[id]';

const baseRow = {
  id: 'evt-1', pet_id: 'pet-A', event_type: 'vomit',
  occurred_at: new Date(2026, 8, 5, 2, 14).toISOString(),
  occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
  severity: null, notes: null, source: 'manual', deleted_at: null, weight_kg: null,
  created_at: '', updated_at: '', food_item_id: null, quantity: null, intake_rating: null,
  food_brand: null, food_product_name: null, food_type: null, food_format: null,
  medication_item_id: null, adherence: null, how_given: null, paired_event_id: null,
  paired_vehicle_intake: null, paired_food_name: null,
  drug_generic_name: null, drug_brand_name: null,
  paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveRecordPetName.mockReturnValue('Biscuit');
  mockGetEventAttachment.mockResolvedValue(null);
});

describe('the record block says whose record it is (CUL-660, §5.1)', () => {
  it("names the RECORD's pet, resolved from the row's own pet_id", async () => {
    mockGetEventById.mockResolvedValue(baseRow);
    const { getByText } = render(<EventDetailScreen />);
    await waitFor(() => expect(getByText("Biscuit's record")).toBeTruthy());
    // Not the active pet, and not by luck: the resolver was asked for pet-A.
    expect(mockResolveRecordPetName).toHaveBeenCalledWith(expect.anything(), 'pet-A');
  });

  it('says nothing rather than something wrong when the name will not resolve', async () => {
    // C-9: correct-but-anonymous beats confidently wrong. There is no active-pet rung to
    // fall back to — a miss here means the record's pet is not the active pet either.
    mockResolveRecordPetName.mockReturnValue('');
    mockGetEventById.mockResolvedValue(baseRow);
    const { queryByText, findAllByText } = render(<EventDetailScreen />);
    expect((await findAllByText(/Sep/)).length).toBeGreaterThan(0);
    expect(queryByText(/'s record/)).toBeNull();
    expect(queryByText(/Rex/)).toBeNull();
  });
});

describe('the lightbox caption (§5.4, mock V1)', () => {
  async function openViewer(row: Record<string, unknown>) {
    mockGetEventById.mockResolvedValue(row);
    mockGetEventAttachment.mockResolvedValue({ id: 'att-1', local_uri: 'file:///photo.jpg', storage_path: 'p/1.jpg' });
    const utils = render(<EventDetailScreen />);
    const hero = await utils.findByTestId('event-hero-photo');
    fireEvent.press(hero);
    return utils;
  }

  it('names the pet and the event, then the date, the time and the confidence', async () => {
    const { getByText } = await openViewer(baseRow);
    await waitFor(() => expect(getByText('Biscuit · Vomit')).toBeTruthy());
    // The hour's zero-padding is the platform's, not ours — the shape is what is pinned.
    expect(getByText(/^Saturday, Sep 5 · 0?2:14 AM · witnessed$/)).toBeTruthy();
  });

  it('a found-not-witnessed incident renders its WINDOW, never a point', async () => {
    // The whole reason the caption goes through `describeOccurredAt` rather than a
    // display string: this is the frame a vet is shown, and a discovery time printed as
    // an occurrence time is a clinical claim the record does not hold.
    const { getByText, queryByText } = await openViewer({
      ...baseRow,
      occurred_at_confidence: 'window',
      occurred_at_earliest: new Date(2026, 8, 5, 16, 0).toISOString(),
      occurred_at_latest: new Date(2026, 8, 5, 17, 33).toISOString(),
    });
    await waitFor(() => expect(getByText(/^Saturday, Sep 5 · between 0?4:00 PM and 0?5:33 PM$/)).toBeTruthy());
    // No third token — the anchored match above is what proves it, and this pins the
    // token FORM (`· witnessed`) so a future append is caught even if the anchor moves.
    // The record block's own "Found, not witnessed" line is a sentence, not this token,
    // and is expected to be on the screen.
    expect(queryByText(/· witnessed/)).toBeNull();
    expect(getByText('Found, not witnessed')).toBeTruthy();
  });

  it('an unclassified legacy row claims NOTHING about how the time was known (C-10)', async () => {
    // A null confidence reports the same "exact" shape as a witnessed one. Labelling it
    // "witnessed" would put a claim on the photo that nobody ever made.
    const { getByText, queryByText } = await openViewer({ ...baseRow, occurred_at_confidence: null });
    await waitFor(() => expect(getByText(/^Saturday, Sep 5 · 0?2:14 AM$/)).toBeTruthy());
    expect(queryByText(/· witnessed/)).toBeNull();
    expect(queryByText(/· estimated/)).toBeNull();
  });
});
