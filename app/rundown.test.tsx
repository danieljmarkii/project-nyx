// The rundown's tiles as DOORS — CUL-753.
//
// `lib/rundown.test.ts` owns what each tile says and which semantic tap it
// carries; `app/(tabs)/profile.focus.test.tsx` owns what the Pet tab does with a
// focus. The one thing that lived nowhere else — and so shipped wrong — is this
// screen's mapping from a tap to a route: the weight and meds tiles pushed the
// bare Pet tab and left the owner scrolling for the card in the consult room.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
  // The screen re-reads on FOCUS (CUL-952), so the mock has to provide the hook.
  // The registered callback is kept so a test can fire a re-focus explicitly —
  // without that, "it re-reads when you come back" is untestable and the stale-date
  // defect this replaced would be invisible again.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    focusCb.current = cb;
    useEffect(() => cb(), [cb]);
  },
}));
const focusCb: { current: null | (() => void | (() => void))} = { current: null };
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
// The History doors read the gate (HV-11); flipped per test.
let mockHistoryV2 = false;
jest.mock('../hooks/useHistoryV2', () => ({ useHistoryV2: () => mockHistoryV2 }));
// The env boundary. `lib/supabase` throws at IMPORT when the anon key is unset, and
// this screen now reaches it (the Signal cache read Get ready quotes, and the trial
// facts). Nothing here calls it — no appointment rides the route, so this is the
// plain rundown — so a bare stub is enough.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../store/petStore', () => {
  const state = { activePet: { id: 'p1', name: 'Mochi' } };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
    resolveRecordPetName: () => 'Mochi',
  };
});
jest.mock('../lib/rundown', () => ({
  buildRundown: jest.fn(),
  rundownToPlainText: () => '',
  rundownDateLine: () => 'Today',
  pastMedsSectionLabel: () => 'Medications — past 12 months',
}));

import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { buildRundown, type RundownTap, type RundownTile } from '../lib/rundown';
import { PROFILE_ROUTE } from '../lib/profileFocus';
import RundownScreen from './rundown';

const tile = (key: RundownTile['key'], label: string, tap: RundownTap): RundownTile => ({
  key, label, value: 'on file', tap,
});

beforeEach(() => {
  mockHistoryV2 = false;
  jest.clearAllMocks();
  (buildRundown as jest.Mock).mockResolvedValue({
    petName: 'Mochi',
    generatedAtMs: 0,
    pastMedications: [],
    facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [] },
    tiles: [
      tile('weight', 'Weight', { kind: 'weight' }),
      tile('meds', 'Current medications', { kind: 'meds' }),
    ],
  });
});

describe('the Pet-tab doors (CUL-753)', () => {
  it('the weight tile opens the Pet tab ON the weight card, not at its top', async () => {
    const { findByLabelText } = render(<RundownScreen />);
    fireEvent.press(await findByLabelText(/^Weight:/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: PROFILE_ROUTE,
      params: { focus: 'weight', ts: expect.any(String) },
    });
  });

  it('the meds tile opens the medications section — it names no single med', async () => {
    const { findByLabelText } = render(<RundownScreen />);
    fireEvent.press(await findByLabelText(/^Current medications:/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: PROFILE_ROUTE,
      params: { focus: 'medications', ts: expect.any(String) },
    });
  });
});

describe('the log-a-visit door (CUL-942, CUL-905)', () => {
  it('opens the booking sheet on its Already-happened arm, never the retired form', async () => {
    // One way to log a visit: the Pet tab's *Log a past visit* lands on this same
    // route. Until GA this pushed `/vet-visit`, the old write-only form, which was
    // deleted with the flag — a push to it now would land on no screen at all.
    (buildRundown as jest.Mock).mockResolvedValue({
      petName: 'Mochi',
      generatedAtMs: 0,
      pastMedications: [],
      facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [] },
      tiles: [
        { key: 'since_visit', label: 'Since the last vet visit', value: 'No prior visit logged', tap: { kind: 'log-visit' }, empty: true },
      ],
    });
    const { findByLabelText } = render(<RundownScreen />);
    fireEvent.press(await findByLabelText(/^Since the last vet visit:/));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/vet-visits?add=happened');
  });
});

describe('the History doors (HV-11 / CUL-1168: registered in lib/historyDoors.ts)', () => {
  function withHistoryTiles(): void {
    (buildRundown as jest.Mock).mockResolvedValue({
      petName: 'Mochi',
      generatedAtMs: 0,
      facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [] },
      tiles: [
        tile('since_visit', 'Since the last vet visit', { kind: 'history', door: { scope: 'since-visit' } }),
        tile('symptoms', 'Symptoms', { kind: 'history', door: { scope: 'symptoms-30d' } }),
      ],
      pastMedications: [tile('meds_past', 'Zyrtec', { kind: 'history', door: { scope: 'course', courseKey: 'item:zyr' } })],
    });
  }

  it('flag off: every History tile pushes the bare route, as before', async () => {
    withHistoryTiles();
    const { findByLabelText } = render(<RundownScreen />);
    for (const label of [/^Since the last vet visit:/, /^Symptoms:/, /^Zyrtec:/]) {
      fireEvent.press(await findByLabelText(label));
    }
    expect((router.push as jest.Mock).mock.calls).toEqual([['/(tabs)/history'], ['/(tabs)/history'], ['/(tabs)/history']]);
  });

  it('flag on: each tile lands on the scope its claim is about', async () => {
    mockHistoryV2 = true;
    withHistoryTiles();
    const { findByLabelText } = render(<RundownScreen />);
    fireEvent.press(await findByLabelText(/^Since the last vet visit:/));
    fireEvent.press(await findByLabelText(/^Symptoms:/));
    fireEvent.press(await findByLabelText(/^Zyrtec:/));
    const history = (params: Record<string, string>) => ({
      pathname: '/(tabs)/history',
      params: { ...params, ts: expect.any(String) },
    });
    expect((router.push as jest.Mock).mock.calls).toEqual([
      [history({ window: 'visit' })],
      [history({ type: 'symptoms', window: '30d' })],
      [history({ course: 'item:zyr' })],
    ]);
  });
});

