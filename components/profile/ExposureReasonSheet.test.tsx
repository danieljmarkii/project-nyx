// CUL-2246: on a short window the reason sheet stops under the status bar and the reason
// scrolls in what is left, so Close stays on screen; a tall window keeps the sheet it had.
// Its bottom inset sits OUTSIDE the sheet (the SafeAreaView around it), so it comes off the
// cap here, where the other sheets carry it inside their own padding. Mutation-proven:
// dropping the inset, or the cap, reds the short case.
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 20, right: 0, bottom: 34, left: 0 }),
  };
});

import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { theme } from '../../constants/theme';
import { ExposureReasonSheet } from './ExposureReasonSheet';

const ROW = {
  key: 'r1',
  label: 'Chicken jerky',
  meta: '24 July, 6:40 PM · not recognised',
  reason: { title: 'Not on the trial list', body: 'Chicken is not a protein this trial allows.' },
} as never;

describe('ExposureReasonSheet — short windows', () => {
  it('caps the sheet below the short line, less the inset outside it; never above', () => {
    const rn = require('react-native') as typeof import('react-native');
    const dims = jest.spyOn(rn, 'useWindowDimensions')
      .mockReturnValue({ width: 390, height: 844, fontScale: 1, scale: 3 });
    try {
      const view = render(<ExposureReasonSheet row={ROW} onClose={jest.fn()} />);
      const sheet = () => StyleSheet.flatten(view.getByTestId('exposure-reason-sheet').props.style);
      expect(sheet().maxHeight).toBeUndefined();
      dims.mockReturnValue({ width: 466, height: 678, fontScale: 1, scale: 3 });
      view.rerender(<ExposureReasonSheet row={ROW} onClose={jest.fn()} />);
      expect(sheet().maxHeight).toBe(678 - 20 - theme.space5 - 34);
      view.unmount();
    } finally {
      dims.mockRestore();
    }
  });
});
