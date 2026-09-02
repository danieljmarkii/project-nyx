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
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
jest.mock('../store/petStore', () => {
  const state = { activePet: { id: 'p1', name: 'Mochi' } };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
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
  jest.clearAllMocks();
  (buildRundown as jest.Mock).mockResolvedValue({
    petName: 'Mochi',
    generatedAtMs: 0,
    pastMedications: [],
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
