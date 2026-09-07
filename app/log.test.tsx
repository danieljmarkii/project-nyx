// CUL-802 — where the full-screen /log flow leaves the owner.
//
// The rest of this screen is covered where its decisions live (lib/eventTimeEdit,
// lib/simpleEvent, lib/completionCard, and the component suites); what only a
// rendered log screen can answer is the one this suite owns: after Save, does the
// modal hand the owner to the incident record or back to Home?
//
// The scope is the logs with a per-incident AI read on the way — a PHOTOGRAPHED
// vomit or stool — and nothing else. Every assertion COUNTS navigation calls
// rather than matching arguments (CUL-170): toHaveBeenCalledWith cannot see an
// identical second fire, and either a doubled replace or a replace-plus-back
// leaves the stack wrong in a way an argument match would pass straight over.

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockTypeParam: string | undefined = 'vomit';
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
    push: (...a: unknown[]) => mockPush(...a),
  },
  useLocalSearchParams: () => (mockTypeParam ? { type: mockTypeParam } : {}),
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

// This screen's import graph reaches supabase at three removes (FoodPicker →
// feedingArrangements → sync → lib/supabase), whose module body throws without
// env. Stubbed to the shape the screen's own paths touch; nothing under test
// makes a network call.
jest.mock('../lib/supabase', () => ({ supabase: {} }));

const mockInsertSimpleEvent = jest.fn().mockResolvedValue({
  eventId: 'ev-1', occurredAtIso: '2026-09-05T17:33:00.000Z', now: '2026-09-05T17:33:00.000Z',
});
jest.mock('../lib/simpleEvent', () => ({
  insertSimpleEvent: (...a: unknown[]) => mockInsertSimpleEvent(...a),
}));

// The weight step's write (CUL-251). Only the write itself is stubbed — the real
// parse/format helpers stay live, because `canConfirmWeight` gates the button on
// parseWeightLbsToKg and a stubbed parse would test a button that is never
// actually reachable the way an owner reaches it.
const mockInsertWeightCheck = jest.fn().mockResolvedValue({
  eventId: 'wt-1', occurredAtIso: '2026-09-05T17:33:00.000Z', now: '2026-09-05T17:33:00.000Z',
});
jest.mock('../lib/weight', () => ({
  ...jest.requireActual('../lib/weight'),
  insertWeightCheck: (...a: unknown[]) => mockInsertWeightCheck(...a),
  getLatestWeightKg: jest.fn().mockResolvedValue(null),
}));

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import LogScreen from './log';
import { usePetStore } from '../store/petStore';
import { useMomentStore } from '../store/momentStore';

const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;

/** Press a button on the most recent Alert.alert by its label. */
function pressAlert(label: string) {
  const spy = Alert.alert as unknown as jest.Mock;
  const calls = spy.mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)?.onPress?.();
}

/** Attach a photo through the real picker path (the source chooser is an Alert). */
async function attachPhoto(getByText: (t: string) => unknown) {
  launchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/incident.jpg', width: 3024, height: 4032, exif: {} }],
  });
  fireEvent.press(getByText('Attach photo') as never);
  await act(async () => { pressAlert('Take photo'); });
  await waitFor(() => expect(getByText('Photo attached · tap to replace')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockTypeParam = 'vomit';
  usePetStore.setState({
    pets: [{ id: 'p1', name: 'Biscuit' }] as never,
    activePet: { id: 'p1', name: 'Biscuit' } as never,
  });
  useMomentStore.setState({ payload: null, visible: false, removed: false });
  launchCamera.mockResolvedValue({ canceled: true });
});

afterEach(() => {
  (Alert.alert as unknown as jest.Mock).mockRestore?.();
  // The card arms a dismiss timer on reveal; leave one running and jest holds the
  // process open past the suite.
  act(() => { useMomentStore.getState().hide(); });
});

describe('/log — the landing after Save (CUL-802)', () => {
  it('a PHOTOGRAPHED vomit replaces the modal with its record, once', async () => {
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    fireEvent.press(getByText('Log vomit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockReplace.mock.calls[0][0]).toBe('/event/ev-1');
    // REPLACE, never replace-and-also-dismiss: the modal is gone from the stack
    // because the record took its slot, so Back from the record is one tap to Home.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('a photographed LOOSE STOOL lands too — both stool types carry a read', async () => {
    mockTypeParam = 'diarrhea';
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    fireEvent.press(getByText('Log loose stool'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  });

  it('a PHOTOLESS vomit goes back to Home, exactly as it shipped', async () => {
    const { getByText } = render(<LogScreen />);
    fireEvent.press(getByText('Log vomit'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('a photographed LETHARGY goes back — the scope is the read, not the photo', async () => {
    mockTypeParam = 'lethargy';
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    fireEvent.press(getByText('Log lethargy'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // The card is what carries Undo and Change time, and it lands over the record
  // rather than over Home now — so it must still fire on the routed path.
  it('still fires the named card on the routed path', async () => {
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    fireEvent.press(getByText('Log vomit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    // The card's reveal is deferred (delayMs) to clear the dismissing modal on
    // iOS — so this waits for it rather than reading the store on the next tick.
    await waitFor(() => expect(useMomentStore.getState().payload?.kind).toBe('named'));
  });

  // A write that never landed must not route: there is no record to land on.
  it('does not route when the write failed', async () => {
    mockInsertSimpleEvent.mockRejectedValueOnce(new Error('disk full'));
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    fireEvent.press(getByText('Log vomit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't save that", expect.any(String)));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

// ── The double-submit guard (CUL-822 + CUL-251) ──────────────────────────────
//
// The picker paths have been guarded since B-336; the simple step's confirm and
// the weight step's confirm never were. Both are a bare TouchableOpacity over an
// async write, so a rapid double-tap runs the handler twice and two rows land for
// one event — a duplicate the vet report and the correlation engine both read.
//
// Every assertion COUNTS the write rather than matching its arguments, for the
// same reason the navigation assertions above do: the two calls are identical, so
// toHaveBeenCalledWith cannot see the second one.
//
// The presses are fired back-to-back with no await between them. That is the
// defect's actual shape — the guard has to latch synchronously, before the first
// handler's first await yields — and an `await` between the presses would let the
// write settle and test nothing.
describe('/log — the double-submit guard (CUL-822, CUL-251)', () => {
  it('a double-tapped simple confirm writes ONE event', async () => {
    const { getByText } = render(<LogScreen />);
    const confirm = getByText('Log vomit');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockInsertSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it('a double-tapped PHOTOGRAPHED vomit writes one event and routes once', async () => {
    const { getByText } = render(<LogScreen />);
    await attachPhoto(getByText);
    const confirm = getByText('Log vomit');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockInsertSimpleEvent).toHaveBeenCalledTimes(1);
    // The blast radius CUL-822 names: two writes would fire two replaces at two
    // different records, landing the owner on the second with the first orphaned.
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  // The guard's other half — it latches on a COMMITTED write only. A failed write
  // leaves the owner on the step looking at an alert, so the button must work
  // again; a guard that latched here would strand them on a dead retry.
  it('releases after a FAILED write so the retry lands', async () => {
    mockInsertSimpleEvent.mockRejectedValueOnce(new Error('disk full'));
    const { getByText } = render(<LogScreen />);
    const confirm = getByText('Log vomit');
    fireEvent.press(confirm);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't save that", expect.any(String)));
    fireEvent.press(confirm);
    await waitFor(() => expect(mockInsertSimpleEvent).toHaveBeenCalledTimes(2));
  });
});

// The weight confirm is the half CUL-822 does not name and CUL-251 does. Same
// defect, same file, same hook — a duplicate reading is worse than a duplicate
// symptom in one specific way: `pets.weight_kg` is a denormalized snapshot, so
// the second write also re-points the profile header and the next weigh-in's
// pre-fill.
describe('/log — the weight confirm double-submit guard (CUL-251)', () => {
  it('a double-tapped weight confirm writes ONE reading', async () => {
    mockTypeParam = 'weight_check';
    const { getByText, getByPlaceholderText } = render(<LogScreen />);
    fireEvent.changeText(getByPlaceholderText('e.g. 12.5'), '12.4');
    const confirm = getByText('Log weight');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockInsertWeightCheck).toHaveBeenCalledTimes(1);
  });

  it('releases after a FAILED weight write so the retry lands', async () => {
    mockTypeParam = 'weight_check';
    mockInsertWeightCheck.mockRejectedValueOnce(new Error('disk full'));
    const { getByText, getByPlaceholderText } = render(<LogScreen />);
    fireEvent.changeText(getByPlaceholderText('e.g. 12.5'), '12.4');
    const confirm = getByText('Log weight');
    fireEvent.press(confirm);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't save that", expect.any(String)));
    fireEvent.press(confirm);
    await waitFor(() => expect(mockInsertWeightCheck).toHaveBeenCalledTimes(2));
  });
});
