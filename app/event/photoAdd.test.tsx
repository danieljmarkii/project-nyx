// CUL-813 — the record screen's photo-add chain, driven end to end through the route.
//
// Same mocked-module-graph harness as `heroRefocus.test.tsx` / `incidentScreen.test.tsx`,
// with one difference that is the whole point: those suites mock `expo-image-picker` and
// never call it, so `launchPicker` (capture → local row → upload → remote row → synced →
// re-read → detach the rows it replaced) ran under no test at all. CUL-801 shipped a
// defect in exactly this chain that only a `code-reviewer` caught — a second concurrent
// per-incident read fired because a null analysis claim was ignored — and its mutation
// pass could not reach the route. This suite is the route-level half.
//
// The upload is fire-and-forget on the screen (`uploadPhoto(...).then(...)`), so every
// assertion about what happens AFTER it waits on the chain's last observable effect
// (the claim's `settle`) rather than on a fixed number of ticks.

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: class { exists = true; constructor(_u: string) {} } }));

const mockUpsert = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ upsert: mockUpsert })) } }));

const mockUploadPhoto = jest.fn();
jest.mock('../../lib/storage', () => ({
  uploadPhoto: (...a: unknown[]) => mockUploadPhoto(...a),
  getSignedUrl: jest.fn(() => Promise.resolve(null)),
  compressForUpload: jest.fn(() => Promise.resolve('file:///compressed.jpg')),
  persistCapture: jest.fn((_uri: string, name: string) => `file:///docs/${name}`),
  MAX_EDGE_PX: 1600,
}));
const mockDetachOthers = jest.fn();
jest.mock('../../lib/attachments', () => ({
  detachEventAttachment: jest.fn(),
  detachOtherEventAttachments: (...a: unknown[]) => mockDetachOthers(...a),
}));
jest.mock('../../lib/sync', () => ({ syncPendingMeals: jest.fn(), syncPendingMedicationAdministrations: jest.fn() }));
jest.mock('../../lib/undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
const mockTriggerVomit = jest.fn();
const mockClaim = jest.fn();
const mockAwaitChain = jest.fn();
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: (...a: unknown[]) => mockTriggerVomit(...a),
  triggerStoolAnalysis: jest.fn(),
  claimAnalysisChain: (...a: unknown[]) => mockClaim(...a),
  awaitAnalysisChain: (...a: unknown[]) => mockAwaitChain(...a),
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
    useFocusEffect: (cb: () => void | (() => void)) => { react.useEffect(() => { cb(); }, [cb]); },
  };
});

// ONE db handle for the whole screen, so the chain's writes can be read back in order.
const mockRunAsync = jest.fn();
const mockGetEventById = jest.fn();
const mockGetEventAttachments = jest.fn();
jest.mock('../../lib/db', () => {
  const db = {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: (...a: unknown[]) => mockRunAsync(...a),
  };
  return {
    getDb: () => db,
    getEventById: (...a: unknown[]) => mockGetEventById(...a),
    // The loaded photo: none, so the screen offers the empty "add a photo" hero.
    getEventAttachment: jest.fn().mockResolvedValue(null),
    // The rows launchPicker reads as the ones this capture supersedes.
    getEventAttachments: (...a: unknown[]) => mockGetEventAttachments(...a),
    getEventSource: jest.fn().mockResolvedValue('now'),
    getMealForEvent: jest.fn().mockResolvedValue(null),
    getDoseForEvent: jest.fn().mockResolvedValue(null),
    getDoubleDoseFlag: jest.fn().mockResolvedValue(null),
    updateMealIntake: jest.fn(), updateDoseAdherence: jest.fn(), updateDoseHowGiven: jest.fn(),
  };
});
jest.mock('../../store/eventStore', () => {
  const state = { removeFromToday: jest.fn() };
  return { useEventStore: Object.assign(() => state, { getState: () => state }) };
});
jest.mock('../../store/petStore', () => {
  const state = { pets: [{ id: 'pet-A', name: 'Biscuit' }], activePet: { id: 'pet-A', name: 'Biscuit' } };
  return { usePetStore: Object.assign(() => state, { getState: () => state }), resolveRecordPetName: () => 'Biscuit' };
});

import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import EventDetailScreen from './[id]';
import { addPhotoHeroCopy } from '../../lib/eventPhoto';

const vomitRow = {
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
  look_outcome: null, look_words: null, look_note: null,
};

const mockSettle = jest.fn();
const alertSpy = jest.spyOn(Alert, 'alert');

/** The SQL-prefix calls made on the shared db handle, in order. */
function runCalls(prefix: RegExp): unknown[][] {
  return mockRunAsync.mock.calls.filter((c) => prefix.test(String(c[0]).trim()));
}
const INSERT = /^INSERT OR REPLACE INTO event_attachments/;
const MARK_SYNCED = /^UPDATE event_attachments SET synced = 1/;

/** Mount, tap the empty hero, pick "Choose from library" off the source sheet. */
async function addPhotoFromLibrary() {
  const view = render(<EventDetailScreen />);
  const action = await view.findByText(addPhotoHeroCopy('vomit').action);
  fireEvent.press(action);
  const sheet = alertSpy.mock.calls.find((c) => c[0] === 'Add photo');
  const library = (sheet?.[2] ?? []).find((b) => b.text === 'Choose from library');
  if (!library?.onPress) throw new Error('no "Choose from library" button on the source sheet');
  await act(async () => { library.onPress?.(); });
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockImplementation(() => {});
  mockGetEventById.mockResolvedValue(vomitRow);
  mockGetEventAttachments.mockResolvedValue([]);
  mockRunAsync.mockResolvedValue({ changes: 1 });
  mockUploadPhoto.mockResolvedValue(undefined);
  mockUpsert.mockResolvedValue({ error: null });
  mockTriggerVomit.mockResolvedValue({ error: null });
  mockClaim.mockReturnValue({ settle: mockSettle });
  mockAwaitChain.mockResolvedValue(false);
  mockDetachOthers.mockResolvedValue(undefined);
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/capture.jpg', width: 3000, height: 4000 }],
  });
});

describe('event detail — adding a photo to a record', () => {
  it('writes the local row, upserts the remote row, marks it synced, then reads the incident', async () => {
    await addPhotoFromLibrary();
    await waitFor(() => expect(mockSettle).toHaveBeenCalled());

    const [insert] = runCalls(INSERT);
    expect(insert).toBeDefined();
    const [attId, eventId, petId, localUri, storagePath] = insert[1] as string[];
    expect([eventId, petId]).toEqual(['evt-1', 'pet-A']);
    expect(localUri).toBe(`file:///docs/${attId}.jpg`); // the persisted copy, not the OS cache
    expect(storagePath).toBe(`pet-A/evt-1/${attId}.jpg`);

    expect(mockUploadPhoto).toHaveBeenCalledWith('nyx-event-attachments', storagePath, 'file:///compressed.jpg');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: attId, event_id: 'evt-1', pet_id: 'pet-A', storage_path: storagePath, mime_type: 'image/jpeg' },
      { onConflict: 'id' },
    );
    expect(runCalls(MARK_SYNCED)).toEqual([[expect.stringMatching(MARK_SYNCED), [attId]]]);
    expect(mockTriggerVomit).toHaveBeenCalledTimes(1);
    expect(mockTriggerVomit).toHaveBeenCalledWith('evt-1');
    // The chain settles TRUE only because its read was actually made.
    expect(mockSettle).toHaveBeenCalledWith(true);
  });

  it('an upsert error leaves the row for the retry queue: not synced, no read, claim settled false', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'rls says no' } });
    await addPhotoFromLibrary();
    await waitFor(() => expect(mockSettle).toHaveBeenCalled());

    expect(runCalls(INSERT)).toHaveLength(1);
    expect(runCalls(MARK_SYNCED)).toHaveLength(0);
    expect(mockTriggerVomit).not.toHaveBeenCalled();
    // FALSE, so a section waiting on this chain triggers its own read rather than
    // watching for a row nothing is going to write.
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('a photo detached while it uploaded is not read: the synced write matches no row, claim settled false (CUL-1098)', async () => {
    // The real expo-sqlite resolves `{ changes: 0 }` for an UPDATE that matches nothing,
    // which is what the synced write meets once Remove photo (or a later capture's
    // replace) has hard-deleted the local row mid-upload. Only that write sees zero.
    mockRunAsync.mockImplementation((sql: unknown) =>
      Promise.resolve({ changes: MARK_SYNCED.test(String(sql).trim()) ? 0 : 1 }));
    await addPhotoFromLibrary();
    await waitFor(() => expect(mockSettle).toHaveBeenCalled());

    expect(runCalls(MARK_SYNCED)).toHaveLength(1);
    expect(mockTriggerVomit).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(false);
  });

  it('a live chain owning the read is AWAITED, then the photo is read anyway — never raced, never skipped', async () => {
    // Another chain already owns this event's read (typically the section's own mount
    // trigger on the photoless incident this photo is being added to).
    mockClaim.mockReturnValue(null);
    let releaseLiveChain: (invoked: boolean) => void = () => {};
    mockAwaitChain.mockImplementation(() => new Promise<boolean>((r) => { releaseLiveChain = r; }));

    await addPhotoFromLibrary();
    // Wait on the remote row, the step BEFORE the read, then drain the queue so a read
    // that does not wait has had every chance to fire.
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    await act(async () => {});

    // Raced: the read fires while the other chain is still out. Pre-CUL-801, exactly this.
    expect(mockTriggerVomit).not.toHaveBeenCalled();
    expect(mockAwaitChain).toHaveBeenCalledWith('evt-1');

    await act(async () => { releaseLiveChain(true); });
    // Skipped: the read never fires. The photo CHANGED, so the earlier read does not
    // answer it — this call site exists for the read the live chain cannot make.
    await waitFor(() => expect(mockTriggerVomit).toHaveBeenCalledTimes(1));
  });

  it('detaches the rows it replaced only AFTER the new row is stored', async () => {
    const stale = { id: 'att-old', local_uri: 'file:///docs/att-old.jpg', storage_path: 'pet-A/evt-1/att-old.jpg' };
    mockGetEventAttachments.mockResolvedValue([stale]);
    await addPhotoFromLibrary();
    await waitFor(() => expect(mockDetachOthers).toHaveBeenCalled());

    const [insert] = runCalls(INSERT);
    const attId = (insert[1] as string[])[0];
    // The priors read BEFORE the write, and the survivor named by the new row's id.
    expect(mockDetachOthers).toHaveBeenCalledWith([stale], attId);

    // Order, off the mocks' global invocation counters: detaching first would turn a
    // failed insert into a record with no photo at all.
    const insertOrder = mockRunAsync.mock.invocationCallOrder[mockRunAsync.mock.calls.indexOf(insert)];
    const detachOrder = mockDetachOthers.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(detachOrder);
  });
});
